import { config } from "../config/config.ts";

const GHTOKEN = Deno.env.get("GHTOKEN");

export type ChangeSummary = {
  added: string[];
  removed: string[];
  modified: string[];
};

const emptyDataDir = async (which: "source" | "target") => {
  await Deno.remove(`workdir/repo/${which}`, { recursive: true });
};

const cloneRepo = async (which: "source" | "target", log = console.log) => {
  await log(`Cloning ${which} repo. This will take some time.`);
  const p = new Deno.Command("git", {
    args: [
      "clone",
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
    await log("git clone failed:");
  } else {
    await log("git clone succesful:");
  }
  await log("STDOUT:");
  await log(new TextDecoder().decode(stdout));
  await log("STDERR:");
  await log(new TextDecoder().decode(stderr));
  if (!success) {
    throw new Error("Abort.");
  }
};

// Function to update local data
export async function updateLocalData(which: "source" | "target", log = console.log) {
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
    await log("git pull failed:");
  } else {
    await log("git pull successful:");
  }
  await log("STDOUT:");
  await log(new TextDecoder().decode(stdout));
  await log("STDERR:");
  await log(new TextDecoder().decode(stderr));
  if (!success) {
    await emptyDataDir(which);
    await cloneRepo(which, log);
  }
}

export async function getModifiedAfter(
  commitId: string,
  log = console.log,
): ChangeSummary {
  await updateLocalData("source");
  const p = new Deno.Command("git", {
    args: [
      "diff",
      "--name-status",
      commitId,
    ],
    cwd: "workdir/repo/source",
  });
  const { success, stdout, stderr } = await p.output();
  await log("STDOUT:");
  await log(new TextDecoder().decode(stdout));
  await log("STDERR:");
  await log(new TextDecoder().decode(stderr));
  if (!success) {
    throw new Error("Abort.");
  }
  const typedFiles = new TextDecoder().decode(stdout).split("\n").filter((s) =>
    s.length > 0
  ).map((s) => s.split(/(\s+)/).filter(p => p.trim().length > 0));
  return ({
    added: typedFiles.filter((t) => t[0] === "A").map((t) => t[1]),
    modified: typedFiles.filter((t) => t[0] === "M").map((t) => t[1]),
    removed: typedFiles.filter((t) => t[0] === "D").map((t) => t[1]),
  });
}
