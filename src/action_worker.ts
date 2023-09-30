/// <reference lib="webworker" />

import { config } from "../config/config.ts";
import { createBadge, log } from "./log.ts";
import type { commit, workerMessage } from "./main.ts";

const queue: commit[] = [];
let currentId = "";
let isRunning = false;

let GHTOKEN = "";

self.onmessage = (evt) => {
  const msg = evt.data;
  if ((msg as { GHTOKEN: string }).GHTOKEN) GHTOKEN = msg.GHTOKEN;
  else {
    queue.push(...(msg as workerMessage).commits);
    if (!isRunning) startTask();
    else console.log("· Waiting for previous run to finish");
  }
};

const emptyDataDir = async (which: "source" | "target") => {
  await Deno.remove(`workdir/repo/${which}`, { recursive: true });
};

const cloneRepo = async (which: "source" | "target") => {
  await log(currentId, `Cloning ${which} repo. This will take some time.`);
  const p = new Deno.Command("git", {
    args: [
      "clone",
      "--depth",
      "1",
      "--single-branch",
      `--branch`,
      `${config[`${which}Branch`]}`,
      which === "target"
        ? config[`${which}RepositoryUri`].replace(
          "https://",
          `https://${GHTOKEN}@`,
        )
        : config[`${which}RepositoryUri`],
      `repo/${which}`,
    ],
    cwd: "workdir",
  });
  const { success, stdout, stderr } = await p.output();
  if (!success) {
    await log(currentId, "git clone failed:");
  } else {
    await log(currentId, "git clone succesful:");
  }
  await log(currentId, "STDOUT:");
  await log(currentId, new TextDecoder().decode(stdout));
  await log(currentId, "STDERR:");
  await log(currentId, new TextDecoder().decode(stderr));
  if (!success) {
    throw new Error("Abort.");
  }
};

const updateLocalData = async (which: "source" | "target") => {
  await Deno.mkdir(`workdir/repo/${which}/.git`, { recursive: true });
  const p = new Deno.Command("git", {
    args: ["pull"],
    env: {
      GIT_CEILING_DIRECTORIES: Deno.cwd(),
    },
    cwd: `workdir/repo/${which}`,
  });
  const { success, stdout, stderr } = await p.output();
  if (!success) {
    await log(currentId, "git pull failed:");
  } else {
    await log(currentId, "git pull succesful:");
  }
  await log(currentId, "STDOUT:");
  await log(currentId, new TextDecoder().decode(stdout));
  await log(currentId, "STDERR:");
  await log(currentId, new TextDecoder().decode(stderr));
  if (!success) {
    await emptyDataDir(which);
    await cloneRepo(which);
  }
};

async function startTask() {
  isRunning = true;
  while (queue.length) {
    try {
      currentId = (new Date()).toISOString();

      await log(currentId, "Starting transformation");

      // get changes to consider
      // remove from queue
      const q = queue.shift()!;

      const modified = [...q.added, ...q.modified];
      const removed = q.removed;

      await updateLocalData("source");

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

      await updateLocalData("target");

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
          `git config user.name ${q.author.username}
          git config user.email ${q.author.email}
          git add -A
          git commit -m "committed by action runner ${config.sourceRepository}@${q.id}"
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
  isRunning = false;
}
