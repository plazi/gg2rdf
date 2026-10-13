/* Orphan pruning at the end of a full update.
 *
 * gg2rdf mirrors the source tree: `<dir>/<name>.xml` becomes `<dir>/<name>.ttl`. Incremental jobs remove the ttl of a
 * deleted xml, but a deletion they never saw (e.g. while the service was down) leaves an orphan behind, and a full
 * update, which only transforms existing xml files, does not touch it either.
 */
import { existsSync, walk } from "./deps.ts";

/** A full update is split into blocks with ids like "<date> full update: 007 of 304".
 * Returns true for the id of the last block, after which every existing xml file has been transformed. */
export const isLastFullUpdateBlock = (jobId: string): boolean => {
  const match = jobId.match(/ full update: (\d+) of (\d+)$/);
  return !!match && match[1] === match[2];
};

/** Above this share of the ttl files considered, pruning is refused as a likely broken source checkout. */
export const MAX_ORPHAN_SHARE = 0.05;

const GIT_DIR = /(^|\/)\.git(\/|$)/;

/**
 * Lists the ttl files in the target repository whose xml file does not exist in the source repository.
 *
 * Only top-level directories that exist in both repositories are searched: a ttl file that gg2rdf never produced
 * — `dataset.ttl` at the root of treatments-rdf, or anything in a directory the source does not have — is not an
 * orphan and is left alone. `.git` is never entered.
 *
 * @returns the orphans as paths relative to targetDir, and the number of ttl files considered
 */
export const findOrphans = async (
  sourceDir: string,
  targetDir: string,
): Promise<{ orphans: string[]; total: number }> => {
  const orphans: string[] = [];
  let total = 0;
  for (const entry of Deno.readDirSync(targetDir)) {
    if (!entry.isDirectory || GIT_DIR.test(entry.name)) continue;
    if (!existsSync(`${sourceDir}/${entry.name}`, { isDirectory: true })) {
      continue;
    }
    for await (
      const file of walk(`${targetDir}/${entry.name}`, {
        exts: [".ttl"],
        includeDirs: false,
        skip: [GIT_DIR],
      })
    ) {
      total++;
      const relative = file.path.slice(targetDir.length + 1);
      if (!existsSync(`${sourceDir}/${relative.slice(0, -4)}.xml`)) {
        orphans.push(relative);
      }
    }
  }
  return { orphans, total };
};

/**
 * Removes the orphans found by `findOrphans`, unless more than `maxShare` of the ttl files considered would go:
 * a broken or partial source checkout must not wipe the target repository.
 *
 * @returns the removed files as paths relative to targetDir
 */
export const pruneOrphans = async (
  sourceDir: string,
  targetDir: string,
  log: (msg: string) => void,
  maxShare = MAX_ORPHAN_SHARE,
): Promise<string[]> => {
  const { orphans, total } = await findOrphans(sourceDir, targetDir);
  log(`Found ${orphans.length} orphaned ttl files of ${total}`);
  if (orphans.length > total * maxShare) {
    log(
      `Not pruning: more than ${
        maxShare * 100
      }% of ttl files would be removed, the source checkout may be incomplete`,
    );
    return [];
  }
  for (const file of orphans) {
    log(`Removing orphan ${file}`);
    Deno.removeSync(`${targetDir}/${file}`);
  }
  return orphans;
};
