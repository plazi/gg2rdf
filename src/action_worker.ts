/// <reference lib="webworker" />

/* This webworker performs the actual work, including the long running operations on the repository.
* The jobs are accepted as messages and stored on disk, when the worker is started uncompleted jobs are picked up and exxecuted.

*/
import {
  existsSync,
  GHActWorker,
  GitRepository,
  type Job,
  walk,
} from "./deps.ts";
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
  const encoder = new TextEncoder();
  using statusFile = Deno.openSync(path, {
    create: true,
    write: true,
    truncate: true,
  });
  statusFile.truncateSync();
  statusFile.writeSync(
    encoder.encode(
      `: 0=successful, 1=has_warnings, 2=has_errors, 3=failed (stats at end)\n`,
    ),
  );
  const counts = [0, 0, 0, 0];
  for (const [file, status] of statusMap) {
    counts[status]++;
    if (file.at(0) !== "/") {
      statusFile.writeSync(encoder.encode(`/${file}: ${status}\n`));
    } else {
      statusFile.writeSync(encoder.encode(`${file}: ${status}\n`));
    }
  }
  statusFile.writeSync(
    encoder.encode(
      `: (stats) 0=successful ${counts[0]}x, 1=has_warnings ${
        counts[1]
      }x, 2=has_errors ${counts[2]}x, 3=failed ${counts[3]}x\n`,
    ),
  );
};

/** A full update is split into blocks with ids like "<date> full update: 007 of 304".
 * Returns true for the last block, after which every existing xml file has been transformed. */
const isLastFullUpdateBlock = (job: Job): boolean => {
  const match = job.id.match(/ full update: (\d+) of (\d+)$/);
  return !!match && match[1] === match[2];
};

/** Above this share of all ttl files, orphan pruning is refused as a likely broken source checkout. */
const MAX_ORPHAN_SHARE = 0.05;

/**
 * Removes ttl files in the target repository whose xml file no longer exists in the source repository.
 * Incremental jobs remove the ttl of a deleted xml, but a deletion they never saw (e.g. while the service was down)
 * leaves an orphan behind that a full update, which only transforms existing xml files, does not touch either.
 */
const pruneOrphans = async (
  sourceDir: string,
  targetDir: string,
  log: (msg: string) => void,
) => {
  const orphans: string[] = [];
  let total = 0;
  for await (
    const entry of walk(targetDir, {
      exts: [".ttl"],
      includeDirs: false,
      skip: [/\/\.git\//],
    })
  ) {
    total++;
    const relative = entry.path.slice(targetDir.length + 1);
    if (!existsSync(`${sourceDir}/${relative.slice(0, -4)}.xml`)) {
      orphans.push(entry.path);
    }
  }
  log(`Found ${orphans.length} orphaned ttl files of ${total}`);
  if (orphans.length > total * MAX_ORPHAN_SHARE) {
    log(
      `Not pruning: more than ${
        MAX_ORPHAN_SHARE * 100
      }% of ttl files would be removed, the source checkout may be incomplete`,
    );
    return;
  }
  for (const file of orphans) {
    log(`Removing orphan ${file.slice(targetDir.length + 1)}`);
    Deno.removeSync(file);
  }
};

const worker = new GHActWorker(self, async (job: Job, log) => {
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
    const files = await worker.gitRepository!.getModifiedAfter(
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
      existsSync(`${worker.gitRepository!.directory}/${file}`)
    ) {
      Deno.mkdirSync(
        config.workDir + "/tmpttl/" + file.slice(0, file.lastIndexOf("/")),
        {
          recursive: true,
        },
      );
      try {
        const status = gg2rdf(
          `${worker.gitRepository!.directory}/${file}`,
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
        log(String(error));
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

  if (isLastFullUpdateBlock(job)) {
    await pruneOrphans(
      worker.gitRepository!.directory,
      targetRepo.directory,
      log,
    );
  }

  saveStatusToDisk(statusMap);
  await targetRepo.commit(job, message, log);
  await targetRepo.push(log);
  log("git push successful");
  log("Completed transformation successfully");
});
