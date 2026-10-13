import { findOrphans, isLastFullUpdateBlock, pruneOrphans } from "./prune.ts";

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};
const assertSame = (actual: unknown, expected: unknown, what: string) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  assert(a === e, `${what}: expected ${e}, got ${a}`);
};

const touch = (path: string) => {
  Deno.mkdirSync(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  Deno.writeTextFileSync(path, "");
};

/** source: data/a/1.xml, data/a/2.xml; target: the two ttl, an orphan, and files gg2rdf never produced */
const makeRepos = () => {
  const root = Deno.makeTempDirSync();
  const source = `${root}/source`;
  const target = `${root}/target`;
  touch(`${source}/data/a/1.xml`);
  touch(`${source}/data/a/2.xml`);
  touch(`${source}/README.md`);
  touch(`${source}/.git/HEAD`);
  touch(`${target}/data/a/1.ttl`);
  touch(`${target}/data/a/2.ttl`);
  touch(`${target}/data/a/3.ttl`); // orphan
  touch(`${target}/data/b/4.ttl`); // orphan in a directory the source lost entirely
  touch(`${target}/dataset.ttl`); // hand-maintained, at the root
  touch(`${target}/extra/5.ttl`); // top-level directory the source does not have
  touch(`${target}/.git/6.ttl`);
  touch(`${target}/data/.git/7.ttl`);
  return { root, source, target };
};

Deno.test("isLastFullUpdateBlock", () => {
  const date = "2026-10-13T06:00:00.000Z";
  assert(isLastFullUpdateBlock(`${date} full update: 304 of 304`), "last");
  assert(isLastFullUpdateBlock(`${date} full update: 001 of 001`), "only");
  assert(!isLastFullUpdateBlock(`${date} full update: 159 of 304`), "middle");
  assert(!isLastFullUpdateBlock(`${date} full update gathering`), "gather");
  assert(!isLastFullUpdateBlock(date), "webhook job");
});

Deno.test("findOrphans considers only ttl files mirrored from the source", async () => {
  const { root, source, target } = makeRepos();
  try {
    const { orphans, total } = await findOrphans(source, target);
    assertSame(orphans.sort(), ["data/a/3.ttl", "data/b/4.ttl"], "orphans");
    assertSame(total, 4, "ttl files considered");
  } finally {
    Deno.removeSync(root, { recursive: true });
  }
});

Deno.test("pruneOrphans removes the orphans and nothing else", async () => {
  const { root, source, target } = makeRepos();
  try {
    const log: string[] = [];
    const pruned = await pruneOrphans(source, target, (m) => log.push(m), 0.5);
    assertSame(pruned.sort(), ["data/a/3.ttl", "data/b/4.ttl"], "pruned");
    for (const gone of ["data/a/3.ttl", "data/b/4.ttl"]) {
      assert(!existsAt(target, gone), `${gone} should be removed`);
    }
    for (
      const kept of [
        "data/a/1.ttl",
        "data/a/2.ttl",
        "dataset.ttl",
        "extra/5.ttl",
        ".git/6.ttl",
        "data/.git/7.ttl",
      ]
    ) {
      assert(existsAt(target, kept), `${kept} should be kept`);
    }
  } finally {
    Deno.removeSync(root, { recursive: true });
  }
});

Deno.test("pruneOrphans refuses when too large a share would go", async () => {
  const { root, source, target } = makeRepos();
  try {
    Deno.removeSync(`${source}/data`, { recursive: true });
    Deno.mkdirSync(`${source}/data`);
    const log: string[] = [];
    const pruned = await pruneOrphans(source, target, (m) => log.push(m));
    assertSame(pruned, [], "nothing pruned");
    assert(existsAt(target, "data/a/1.ttl"), "data/a/1.ttl should be kept");
    assert(log.some((m) => m.startsWith("Not pruning")), "refusal logged");
  } finally {
    Deno.removeSync(root, { recursive: true });
  }
});

const existsAt = (dir: string, relative: string) => {
  try {
    Deno.lstatSync(`${dir}/${relative}`);
    return true;
  } catch {
    return false;
  }
};
