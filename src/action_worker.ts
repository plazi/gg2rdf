/// <reference lib="webworker" />

/* This webworker performs the actual work, including the long running operations on the repository.
* The jobs are accepted as messages and stored on disk, when the worker is started uncompleted jobs are picked up and exxecuted.

*/
import { path, walk } from "./deps.ts";
import { config } from "../config/config.ts";
import { createBadge } from "./log.ts";
import { type Job, JobsDataBase } from "./JobsDataBase.ts";
import { getModifiedAfter, updateLocalData } from "./repoActions.ts";
import { gg2rdf } from "./gg2rdf.ts";

const GHTOKEN = Deno.env.get("GHTOKEN");

const queue = new JobsDataBase(`${config.workDir}/jobs`);

let isRunning = false;

startTask();

self.onmessage = (evt) => {
  const job = evt.data as Job | "FULLUPDATE";
  if (job === "FULLUPDATE") {
    gatherJobsForFullUpdate();
  } else {
    if (!isRunning) startTask();
    else console.log("Already running");
  }
};

function startTask() {
  isRunning = true;
  try {
    run();
  } finally {
    isRunning = false;
  }
}

async function gatherJobsForFullUpdate() {
  isRunning = true;
  try {
    console.log("gathering jobs for full update");
    updateLocalData("source");
    const date = (new Date()).toISOString();
    let block = 0;
    const jobs: Job[] = [];
    let files: string[] = [];
    for await (
      const walkEntry of walk(`${config.workDir}/repo/source/`, {
        exts: ["xml"],
        includeDirs: false,
        includeSymlinks: false,
      })
    ) {
      if (walkEntry.isFile && walkEntry.path.endsWith(".xml")) {
        files.push(
          walkEntry.path.replace(`${config.workDir}/repo/source/`, ""),
        );
        if (files.length >= 3000) { // github does not generate diffs if more than 3000 files have been changed
          jobs.push({
            author: {
              name: "GG2RDF Service",
              email: "gg2rdf@plazi.org",
            },
            id: `${date} full update: ${
              (++block).toString(10).padStart(3, "0")
            }`, // note that the id must begin with a datestamp for correct ordering
            files: {
              modified: files,
            },
          });
          files = [];
        }
      } else {
        console.log("skipped", walkEntry.path);
      }
    }
    jobs.forEach((j) => {
      j.id += ` of ${block.toString(10).padStart(3, "0")}`;
      queue.addJob(j);
    });
    console.log(`succesfully created full-update jobs (${block} jobs)`);
  } catch (error) {
    console.error("Could not create full-update jobs\n" + error);
  } finally {
    isRunning = false;
    startTask();
  }
}

function run() {
  while (queue.pendingJobs().length > 0) {
    const jobStatus = queue.pendingJobs()[0];
    const job = jobStatus.job;
    const log = (msg: string) => {
      Deno.writeTextFileSync(path.join(jobStatus.dir, "log.txt"), msg + "\n", {
        append: true,
      });
    };
    try {
      log("Starting transformation\n" + JSON.stringify(job, undefined, 2));

      let modified: string[] = [];
      let removed: string[] = [];
      let message = "";

      if (job.files) {
        modified = job.files.modified || [];
        removed = job.files.removed || [];
        message = `GG2RDF ${job.id} (${config.sourceRepository})`;
        updateLocalData("source", log); // also done by getModifiedAfter
      } else if (job.from) {
        const files = getModifiedAfter(job.from, job.till, log);
        modified = [...files.added, ...files.modified];
        removed = files.removed;
        if (files.till && files.till !== "HEAD") {
          message = `GG2RDF ${config.sourceRepository}@${files.till}`;
          job.till = files.till;
          queue.setStatus(job, "pending"); // updates `till`
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
        if (file.endsWith(".xml")) {
          Deno.mkdirSync(
            config.workDir + "/tmpttl/" + file.slice(0, file.lastIndexOf("/")),
            {
              recursive: true,
            },
          );
          try {
            gg2rdf(
              `${config.workDir}/repo/source/${file}`,
              `${config.workDir}/tmpttl/${file.slice(0, -4)}.ttl`,
              log,
            );
            log("gg2rdf successful");
          } catch (error) {
            log("gg2rdf failed:");
            log(error);
            throw new Error("gg2rdf failed");
          }
        }
      }

      updateLocalData("target", log);

      for (const file of modified) {
        if (file.endsWith(".xml")) {
          try {
            Deno.mkdirSync(
              `${config.workDir}/repo/target/${
                file.slice(0, file.lastIndexOf("/"))
              }`,
              {
                recursive: true,
              },
            );
            Deno.renameSync(
              `${config.workDir}/tmpttl/${file.slice(0, -4)}.ttl`,
              `${config.workDir}/repo/target/${file.slice(0, -4)}.ttl`,
            );
            // TODO check if newer?
          } catch (e) {
            console.log(
              `Failed to move ${config.workDir}/tmpttl/${
                file.slice(0, -4)
              }.ttl to ${config.workDir}/repo/target/${
                file.slice(0, -4)
              }.ttl: \n${e}`,
            );
          }
        }
      }

      for (const file of removed) {
        if (file.endsWith(".xml")) {
          const ttlFile = `${config.workDir}/repo/target/${
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
        cwd: `${config.workDir}/repo/target`,
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
      queue.setStatus(job, "completed");
      log("Completed transformation successfully");
      createBadge("OK");
    } catch (error) {
      queue.setStatus(job, "failed");
      log("FAILED TRANSFORMATION");
      log(error);
      if (error.stack) log(error.stack);
      createBadge("Failed");
    }
  }
}
