/// <reference lib="webworker" />

/* This webworker performs the actual work, including the long running operations on the repository.
* The jobs are accepted as messages and stored on disk, when the worker is started uncompleted jobs are picked up and exxecuted.

*/
import { config } from "../config/config.ts";
import { createBadge, log, getLog } from "./log.ts";
import type { Job } from "./types.ts";
import { updateLocalData, getModifiedAfter } from "./repoActions.ts";


const queue: Job[] = [];
let currentId = "";
let isRunning = false;

console.log("TODO: load uncompleted jobs from files")

self.onmessage = (evt) => {
  const job = evt.data as Job;
  queue.push(job);
  if (!isRunning) startTask();
  else console.log("· Waiting for previous run to finish");
};

async function startTask() {
  isRunning = true;
  try {
    await run()
  } finally {
    isRunning = false
  }
}

async function run() {
  while (queue.length) {
    try {

      // get job to consider
      // remove from queue
      const job = queue.shift()!;

      currentId = job.id

      await log(currentId, "Starting transformation"+ JSON.stringify(job,undefined, 2));

      const files = await getModifiedAfter(job.from, job.till, getLog(currentId));

      const modified = [...files.added, ...files.modified];
      const removed = files.removed;

      await updateLocalData("source", getLog(currentId));

      // run saxon on modified files
      for (const file of modified) {
        if (file.endsWith(".xml")) {
          await Deno.mkdir(
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
            await log(currentId, "saxon failed:");
          } else {
            await log(currentId, "saxon succesful:");
          }
          await log(currentId, "STDOUT:");
          await log(currentId, new TextDecoder().decode(stdout));
          await log(currentId, "STDERR:");
          await log(currentId, new TextDecoder().decode(stderr));
          // TODO: handle failure
        }
      }

      // convert modified files to ttl
      for (const file of modified) {
        if (file.endsWith(".xml")) {
          await Deno.mkdir(
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

      const p = new Deno.Command("bash", {
        args: [
          "-c",
          `git config user.name ${job.author.name}
          git config user.email ${job.author.email}
          git add -A
          git commit --quiet -m "committed by action runner ${config.sourceRepository}@${job.id}"
          git push --quiet origin ${config.targetBranch}`,
        ],
        cwd: `${config.workDir}/repo/target`,
      });
      const { success, stdout, stderr } = await p.output();
      if (!success) {
        await log(currentId, "git push failed:");
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
