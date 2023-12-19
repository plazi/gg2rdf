/// <reference lib="webworker" />

/* This webworker performs the actual work, including the long running operations on the repository.
* The jobs are accepted as messages and stored on disk, when the worker is started uncompleted jobs are picked up and exxecuted.

*/
import * as path from "https://deno.land/std@0.209.0/path/mod.ts";
import { config } from "../config/config.ts";
import { createBadge, getLog } from "./log.ts";
import { JobsDataBase, type Job } from "./JobsDataBase.ts";
import { updateLocalData, getModifiedAfter } from "./repoActions.ts";

const GHTOKEN = Deno.env.get("GHTOKEN");

const queue = new JobsDataBase(`${config.workDir}/log`);
let currentId = "";
let isRunning = false;

startTask();

self.onmessage = (evt) => {
  const job = evt.data as Job;
  queue.addJob(job);
  if (!isRunning) startTask();
  else console.log("Already running");
};

function startTask() {
  isRunning = true;
  try {
    run()
  } finally {
    isRunning = false
  }
}

function run() {
  while (queue.pendingJobs().length > 0) {
  const jobStatus = queue.pendingJobs()[0];
    const job = jobStatus.job;
    try {
      const log = (msg: string) => {
        Deno.writeTextFileSync(path.join(jobStatus.dir, "log.txt"), msg + "\n", { append: true})
      };

      currentId = job.id


      log("Starting transformation"+ JSON.stringify(job,undefined, 2));

      const files = getModifiedAfter(job.from, job.till, log);

      const modified = [...files.added, ...files.modified];
      const removed = files.removed;

      updateLocalData("source", log);

      // run saxon on modified files
      for (const file of modified) {
        if (file.endsWith(".xml")) {
          Deno.mkdirSync(
            config.workDir + "/tmprdf/" + file.slice(0, file.lastIndexOf("/")),
            {
              recursive: true,
            },
          );
          const p = new Deno.Command("java", {
            args: [
              "-jar",
              `${Deno.cwd()}/src/saxon-he-10.8.jar`,
              `-s:${file}`,
              `-o:${config.workDir}/tmprdf/${file.slice(0, -4)}.rdf`,
              `-xsl:${Deno.cwd()}/src/gg2rdf.xslt`,
            ],
            cwd: config.workDir+"/repo/source",
          });
          const { success, stdout, stderr } = await p.output();
          if (!success) {
            log("saxon failed:");
          } else {
            log( "saxon succesful:");
          }
          log("STDOUT:");
          log(new TextDecoder().decode(stdout));
          log("STDERR:");
          log(new TextDecoder().decode(stderr));
          if (!success) {
            throw new Error("Saxon failed")
          }
        }
      }

      // convert modified files to ttl
      for (const file of modified) {
        if (file.endsWith(".xml")) {
          Deno.mkdirSync(
            config.workDir+"/tmpttl/" + file.slice(0, file.lastIndexOf("/")),
            {
              recursive: true,
            },
          );
          const p = new Deno.Command("rapper", {
            args: [
              "-e",
              "-w",
              "-q",
              `${file.slice(0, -4)}.rdf`,
              "--output",
              "turtle",
            ],
            cwd: config.workDir+"/tmprdf",
            stdin: "piped",
            stdout: "piped",
            stderr: "piped",
          });
          const child = p.spawn();

          // open a file and pipe the subprocess output to it.
          child.stdout.pipeTo(
            Deno.openSync(`${config.workDir}/tmpttl/${file.slice(0, -4)}.ttl`, {
              write: true,
              create: true,
            }).writable,
          );

          child.stderr.pipeTo(
            Deno.openSync(`${config.workDir}/log/${currentId}`, {
              append: true,
              write: true,
              create: true,
            }).writable,
          );

          // manually close stdin
          child.stdin.close();

          const status = await child.status;
          if (!status.success) {
            await log(currentId, `Rapper failed on ${file.slice(0, -4)}.rdf`);
          }
        }
      }

      await updateLocalData("target", getLog(currentId));

      for (const file of modified) {
        if (file.endsWith(".xml")) {
          await Deno.mkdir(
            `${config.workDir}/repo/target/${file.slice(0, file.lastIndexOf("/"))}`,
            {
              recursive: true,
            },
          );
          await Deno.rename(
            `${config.workDir}/tmpttl/${file.slice(0, -4)}.ttl`,
            `${config.workDir}/repo/target/${file.slice(0, -4)}.ttl`,
          );
          // TODO check if newer?
          // TODO errors
        }
      }

      for (const file of removed) {
        if (file.endsWith(".xml")) {
          try {
            await Deno.remove(
              `${config.workDir}/repo/target/${file.slice(0, -4)}.ttl`,
            );
          } catch (_) {
            // TODO errors
          }
          // TODO check if newer?
        }
      }

      const gitCommands = `git config user.name ${job.author.name}
      git config user.email ${job.author.email}
      git add -A
      git commit --quiet -m "committed by action runner ${config.sourceRepository}@${job.id}"
      git push --quiet ${config.targetRepositoryUri.replace(
        "https://",
        `https://${GHTOKEN}@`)}`
      const p = new Deno.Command("bash", {
        args: [
          "-c",
          gitCommands
        ],
        cwd: `${config.workDir}/repo/target`,
      });
      const { success, stdout, stderr } = await p.output();
      if (!success) {
        await log(currentId, "git push failed: ");
      } else {
        await log(currentId, "git push succesful:");
      }
      await log(currentId, "STDOUT:");
      await log(currentId, new TextDecoder().decode(stdout));
      await log(currentId, "STDERR:");
      await log(currentId, new TextDecoder().decode(stderr));
      if (!success) {
        throw new Error("Abort.");
      }

      await log(currentId, "Completed transformation successfully");
      await createBadge("OK");
    } catch (error) {
      await log(currentId, "FAILED TRANSFORMATION");
      await log(currentId, error);
      await createBadge("Failed");
    }
  }
}
