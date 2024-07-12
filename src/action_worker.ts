/// <reference lib="webworker" />

/* This webworker performs the actual work, including the long running operations on the repository.
* The jobs are accepted as messages and stored on disk, when the worker is started uncompleted jobs are picked up and exxecuted.

*/
import { existsSync, GHActWorker, GitRepository, type Job } from "./deps.ts";
import { config } from "../config/config.ts";
import { gg2rdf } from "./gg2rdf.ts";

const GHTOKEN = Deno.env.get("GHTOKEN");

const worker = new GHActWorker(self, config, async (job: Job, log) => {
  log("Starting transformation\n" + JSON.stringify(job, undefined, 2));

  let modified: string[] = [];
  let removed: string[] = [];
  let message = "";

  const targetRepo = new GitRepository(
    config.targetRepositoryUri,
    config.targetBranch,
    GHTOKEN,
    config.workDir + "/target-repo",
  );

  if ("files" in job) {
    modified = job.files.modified;
    if ("added" in job.files) {
      modified = [...modified, ...job.files.added];
      removed = job.files.removed;
    }
    //ghact should take care of this
    //updateLocalData("source", log); // also done by getModifiedAfter
  } else if (job.from) {
    const files = await worker.gitRepository.getModifiedAfter(
      job.from,
      job.till,
      log,
    );
    modified = [...files.added, ...files.modified];
    removed = files.removed;
    if (files.till && files.till !== "HEAD") job.till = files.till;
    if (files.from && files.from !== "HEAD") job.from = files.from;
  } else {
    throw new Error(
      "Could not start job, neither explicit file list nor from-commit specified",
    );
  }

  if (job.till && job.till !== "HEAD") {
    message = `GG2RDF ${config.sourceRepository}@${job.till}`;
  } else {
    message = `GG2RDF ${job.id} (${config.sourceRepository})`;
  }

  log(`\nTotal files: ${modified.length + removed.length}\n`);

  // run saxon on modified files
  for (const file of modified) {
    if (
      file.endsWith(".xml") &&
      existsSync(`${worker.gitRepository.directory}/${file}`)
    ) {
      Deno.mkdirSync(
        config.workDir + "/tmpttl/" + file.slice(0, file.lastIndexOf("/")),
        {
          recursive: true,
        },
      );
      try {
        gg2rdf(
          `${worker.gitRepository.directory}/${file}`,
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

  await targetRepo.updateLocalData(log);

  for (const file of modified) {
    if (file.endsWith(".xml")) {
      try {
        Deno.mkdirSync(
          `${targetRepo.directory}/${file.slice(0, file.lastIndexOf("/"))}`,
          {
            recursive: true,
          },
        );
        Deno.renameSync(
          `${config.workDir}/tmpttl/${file.slice(0, -4)}.ttl`,
          `${targetRepo.directory}/${file.slice(0, -4)}.ttl`,
        );
        // TODO check if newer?
      } catch (e) {
        log(
          `Failed to move ${config.workDir}/tmpttl/${
            file.slice(0, -4)
          }.ttl to ${targetRepo.directory}/${file.slice(0, -4)}.ttl: \n${e}`,
        );
      }
    }
  }

  for (const file of removed) {
    if (file.endsWith(".xml")) {
      const ttlFile = `${targetRepo.directory}/${file.slice(0, -4)}.ttl`;
      try {
        Deno.removeSync(ttlFile);
      } catch (e) {
        log(
          `Failed to remove file ${ttlFile}. Possbly the xml file was removed before it was transformed. \n${e}`,
        );
      }
    }
  }

  await targetRepo.commit(job, message, log);
  await targetRepo.push(log);
  log("git push successful");
  log("Completed transformation successfully");
});
