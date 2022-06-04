import { walk } from "https://deno.land/std/fs/mod.ts";

const GITHUB_WORKSPACE = Deno.env.get("GITHUB_WORKSPACE");
const GITHUB_REPOSITORY = "plazi/treatments-xml";

const TTL_DIR = GITHUB_WORKSPACE + "/ttl";
const REPO_DIR = GITHUB_WORKSPACE + "/ttl-repo";

const decode = (array: Uint8Array) => new TextDecoder().decode(array);

for await (const { path: file } of walk(TTL_DIR, { includeDirs: false })) {
  const relative_filename = file.replace(TTL_DIR + "/", "");
  console.log(relative_filename);
  //   cd $GITHUB_WORKSPACE/ttl-repo
  //   if [ -f $file ]; do
  //     LAST_CHANGE_MSG=`git log --grep=${{ github.repository }}@ -F -n 1 --format="%s" -- $file`
  const LAST_CHANGE_P = Deno.run({
    cmd: [
      "git",
      "log",
      `--grep=${GITHUB_REPOSITORY}@`,
      "-F",
      "-n",
      "1",
      '--format="%s"',
      "--",
      relative_filename,
    ],
    cwd: REPO_DIR,
    stdout: "piped",
  });
  const LAST_CHANGE_MSG = decode(await LAST_CHANGE_P.output());
  //     LAST_CHANGE_HASH=${LAST_CHANGE_MSG##*${{ github.repository }}@}
  const LAST_CHANGE_HASH = LAST_CHANGE_MSG.substring(LAST_CHANGE_MSG.indexOf(GITHUB_REPOSITORY) + GITHUB_REPOSITORY.length + 1)
  //     cd $GITHUB_WORKSPACE/xml
  //     LAST_CHANGE_DATE=`git log -n 1 --format="%ct" $LAST_CHANGE_HASH`
  //     THIS_CHANGE_HASH=`git log -n 1 --format="%s" -- $file`
  //     THIS_CHANGE_DATE=`git log -n 1 --format="%ct" -- $file`
  //     if (( ${THIS_CHANGE_DATE:-1} >= ${LAST_CHANGE_DATE:-2} )); then
  //       echo "$LAST_CHANGE_HASH is older than $THIS_CHANGE_HASH (${LAST_CHANGE_DATE:-2} < ${THIS_CHANGE_DATE:-1}), updating $file"
  //       relative_file=`realpath -m --relative-to=$GITHUB_WORKSPACE/ttl $file`
  //       mkdir -p $GITHUB_WORKSPACE/ttl-repo/${relative_file%/*}
  //       rm -f -- $GITHUB_WORKSPACE/ttl-repo/$file
  //       mv $GITHUB_WORKSPACE/ttl/$file $GITHUB_WORKSPACE/ttl-repo/$file
  //     else
  //       echo "$LAST_CHANGE_HASH is newer than $THIS_CHANGE_HASH (${LAST_CHANGE_DATE:-2} > ${THIS_CHANGE_DATE:-1}), keeping $file as is"
  //     fi
  //   else
  //     relative_file=`realpath -m --relative-to=$GITHUB_WORKSPACE/ttl $file`
  //     mkdir -p $GITHUB_WORKSPACE/ttl-repo/${relative_file%/*}
  //     rm -f -- $GITHUB_WORKSPACE/ttl-repo/$file
  //     mv $GITHUB_WORKSPACE/ttl/$file $GITHUB_WORKSPACE/ttl-repo/$file
  //   fi
  // done
}
