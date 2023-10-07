/// <reference lib="webworker" />

import { config } from "../config/config.ts";
import { createBadge, log, getLog } from "./log.ts";
import type { Job } from "./types.ts";
import { updateLocalData, getModifiedAfter } from "./repoActions.ts";


const queue: Job[] = [];
let currentId = "";
let isRunning = false;

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

      const files = await getModifiedAfter(job.after, getLog(currentId));

      const modified = [...files.added, ...files.modified];
      const removed = files.removed;

      await updateLocalData("source", getLog(currentId));

      // run saxon on modified files
      for (const file of modified) {
        if (file.endsWith(".xml")) {
          await Deno.mkdir(
            "workdir/tmprdf/" + file.slice(0, file.lastIndexOf("/")),
            {
              recursive: true,
            },
          );
          const p = new Deno.Command("java", {
            args: [
              "-jar",
              `${Deno.cwd()}/src/saxon-he-10.8.jar`,
              `-s:${file}`,
              `-o:${Deno.cwd()}/workdir/tmprdf/${file.slice(0, -4)}.rdf`,
              `-xsl:${Deno.cwd()}/src/gg2rdf.xslt`,
            ],
            cwd: "workdir/repo/source",
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
            "workdir/tmpttl/" + file.slice(0, file.lastIndexOf("/")),
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
            cwd: "workdir/tmprdf",
            stdin: "piped",
            stdout: "piped",
            stderr: "piped",
          });
          const child = p.spawn();

          // open a file and pipe the subprocess output to it.
          child.stdout.pipeTo(
            Deno.openSync(`workdir/tmpttl/${file.slice(0, -4)}.ttl`, {
              write: true,
              create: true,
            }).writable,
          );

          child.stderr.pipeTo(
            Deno.openSync(`workdir/log/${currentId}`, {
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
            `workdir/repo/target/${file.slice(0, file.lastIndexOf("/"))}`,
            {
              recursive: true,
            },
          );
          await Deno.rename(
            `workdir/tmpttl/${file.slice(0, -4)}.ttl`,
            `workdir/repo/target/${file.slice(0, -4)}.ttl`,
          );
          // TODO check if newer?
          // TODO errors
        }
      }

      for (const file of removed) {
        if (file.endsWith(".xml")) {
          try {
            await Deno.remove(
              `workdir/repo/target/${file.slice(0, -4)}.ttl`,
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
          git commit -m "committed by action runner ${config.sourceRepository}@${job.id}"
          git push origin ${config.targetBranch}`,
        ],
        cwd: "workdir/repo/target",
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
