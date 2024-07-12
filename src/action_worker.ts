/// <reference lib="webworker" />

/* This webworker performs the actual work, including the long running operations on the repository.
* The jobs are accepted as messages and stored on disk, when the worker is started uncompleted jobs are picked up and exxecuted.

*/
import { existsSync, GHActWorker, GitRepository, type Job } from "./deps.ts";
import { config } from "../config/config.ts";
import { gg2rdf, Status } from "./gg2rdf.ts";

const GHTOKEN = Deno.env.get("GHTOKEN");

const parseStatusFromDisk = (
  path = `${config.workDir}/fileStatus.txt`,
): Map<string, Status> => {
  if (!existsSync(path)) return new Map();
  const result = new Map<string, Status>();
  Deno.readTextFileSync(path).split("\n").forEach((line) => {
    const [file, status] = line.split(": ");
    if (file) result.set(file, parseInt(status, 10));
  });
  return result;
};

const saveStatusToDisk = (
  statusMap: Map<string, Status>,
  path = `${config.workDir}/fileStatus.txt`,
) => {
  using statusFile = Deno.openSync(path, {
    create: true,
    write: true,
    truncate: true,
  });
  statusFile.truncateSync();
  const encoder = new TextEncoder();
  for (const [file, status] of statusMap) {
    statusFile.writeSync(encoder.encode(`${file}: ${status}\n`));
  }
};

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

  const statusMap = parseStatusFromDisk();

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
        const status = gg2rdf(
          `${worker.gitRepository.directory}/${file}`,
          `${config.workDir}/tmpttl/${file.slice(0, -4)}.ttl`,
          log,
        );
        statusMap.set(file, status);
        switch (status) {
          case Status.successful:
            log("gg2rdf successful");
            break;
          case Status.has_warnings:
            log("gg2rdf successful with warnings");
            break;
          case Status.has_errors:
            log("gg2rdf successful with errors");
            break;
          case Status.failed:
            log("gg2rdf failed gracefully");
            break;
        }
      } catch (error) {
        log("gg2rdf failed catastrophically:");
        log(error);
        saveStatusToDisk(statusMap);
        throw new Error("gg2rdf failed catastrophically");
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

  saveStatusToDisk(statusMap);
  await targetRepo.commit(job, message, log);
  await targetRepo.push(log);
  log("git push successful");
  log("Completed transformation successfully");
});
