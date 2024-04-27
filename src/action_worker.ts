/// <reference lib="webworker" />

/* This webworker performs the actual work, including the long running operations on the repository.
* The jobs are accepted as messages and stored on disk, when the worker is started uncompleted jobs are picked up and exxecuted.

*/
import GhactServiceWorker from "ghact/src/GhactServiceWorker.ts";
import GitRepository from "ghact/src/GitRepository.ts";
import { existsSync } from "./deps.ts";
import { config } from "../config/config.ts";
import { type Job } from "ghact/src/JobsDataBase.ts";
import { gg2rdf } from "./gg2rdf.ts";

const GHTOKEN = Deno.env.get("GHTOKEN");

const worker = new GhactServiceWorker(self, config, (job: Job, log) => {
  try {
    log("Starting transformation\n" + JSON.stringify(job, undefined, 2));

    let modified: string[] = [];
    let removed: string[] = [];
    let message = "";

    const targetRepo = new GitRepository(
      config.targetRepositoryUri, 
      config.targetBranch,
      GHTOKEN,
      config.workDir+"/target-repo")

    if (job.files) {
      modified = job.files.modified || [];
      removed = job.files.removed || [];
      message = `GG2RDF ${job.id} (${config.sourceRepository})`;
      //ghact should take care of this
      //updateLocalData("source", log); // also done by getModifiedAfter
    } else if (job.from) {
      const files = worker.gitRepository.getModifiedAfter(job.from, job.till, log);
      modified = [...files.added, ...files.modified];
      removed = files.removed;
      if (files.till && files.till !== "HEAD") {
        message = `GG2RDF ${config.sourceRepository}@${files.till}`;
        job.till = files.till;
      } else {
        message = `GG2RDF ${job.id} (${config.sourceRepository})`;
      }
    } else {
      throw new Error(
        "Could not start job, neither explicit file list nor from-commit specified",
      );
    }

    log(`\nTotal files: ${modified.length + removed.length}\n`);

    // run saxon on modified files
    for (const file of modified) {
      if (
        file.endsWith(".xml") &&
        existsSync(`${worker.gitRepository.workDir}/${file}`)
      ) {
        Deno.mkdirSync(
          config.workDir + "/tmpttl/" + file.slice(0, file.lastIndexOf("/")),
          {
            recursive: true,
          },
        );
        try {
          gg2rdf(
            `${worker.gitRepository.workDir}${file}`,
            `${config.workDir}/tmpttl/${file.slice(0, -4)}.ttl`,
            log,
          );
          log("gg2rdf successful");
        } catch (error) {
          log("gg2rdf failed:");
          log(error);
          throw new Error("gg2rdf failed");
        }
      } else {
        log(
          `Skipping ${file} (not *.xml or does not exist in treatments-xml)`,
        );
      }
    }

    targetRepo.updateLocalData(log);

    for (const file of modified) {
      if (file.endsWith(".xml")) {
        try {
          Deno.mkdirSync(
            `${config.workDir}/target-repo/${
              file.slice(0, file.lastIndexOf("/"))
            }`,
            {
              recursive: true,
            },
          );
          Deno.renameSync(
            `${config.workDir}/tmpttl/${file.slice(0, -4)}.ttl`,
            `${config.workDir}/target-repo/${file.slice(0, -4)}.ttl`,
          );
          // TODO check if newer?
        } catch (e) {
          log(
            `Failed to move ${config.workDir}/tmpttl/${
              file.slice(0, -4)
            }.ttl to ${config.workDir}/target-repo/${
              file.slice(0, -4)
            }.ttl: \n${e}`,
          );
        }
      }
    }

    for (const file of removed) {
      if (file.endsWith(".xml")) {
        const ttlFile = `${config.workDir}/target-repo/${
          file.slice(0, -4)
        }.ttl`;
        try {
          Deno.removeSync(ttlFile);
        } catch (e) {
          log(
            `Failed to remove file ${ttlFile}. Possbly the xml file was removed before it was transformed. \n${e}`,
          );
        }
      }
    }

    const gitCommands = `git config --replace-all user.name ${job.author.name}
    git config --replace-all user.email ${job.author.email}
    git add -A
    git commit --quiet -m "${message}"
    git push --quiet ${
      config.targetRepositoryUri.replace(
        "https://",
        `https://${GHTOKEN}@`,
      )
    }`;
    const p = new Deno.Command("bash", {
      args: [
        "-c",
        gitCommands,
      ],
      cwd: `${config.workDir}/target-repo`,
    });
    const { success, stdout, stderr } = p.outputSync();
    if (!success) {
      log("git push failed: ");
    } else {
      log("git push succesful:");
    }
    log("STDOUT:");
    log(new TextDecoder().decode(stdout));
    log("STDERR:");
    log(new TextDecoder().decode(stderr));
    if (!success) {
      throw new Error("Abort.");
    }
    
    log("Completed transformation successfully");
    
  } catch (error) {
    log("FAILED TRANSFORMATION");
    log(error);
    if (error.stack) log(error.stack);
    throw(error);
  }
});
