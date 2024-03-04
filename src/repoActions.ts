import { config } from "../config/config.ts";

const GHTOKEN = Deno.env.get("GHTOKEN");

export type ChangeSummary = {
  added: string[];
  removed: string[];
  modified: string[];
};

const emptyDataDir = (which: "source" | "target") => {
  Deno.removeSync(`${config.workDir}/repo/${which}`, { recursive: true });
};

const cloneRepo = (which: "source" | "target", log = console.log) => {
  log(`Cloning ${which} repo. This will take some time.`);
  const p = new Deno.Command("git", {
    args: [
      "clone",
      "--single-branch",
      "--quiet",
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
    cwd: config.workDir,
  });
  const { success, stdout, stderr } = p.outputSync();
  if (!success) {
    log("git clone failed:");
  } else {
    log("git clone succesful:");
  }
  log("STDOUT:");
  log(new TextDecoder().decode(stdout));
  log("STDERR:");
  log(new TextDecoder().decode(stderr));
  if (!success) {
    throw new Error("Abort.");
  }
};

// Function to update local data
export function updateLocalData(
  which: "source" | "target",
  log: (msg: string) => void = console.log,
) {
  log("starting git pull...");
  Deno.mkdirSync(`${config.workDir}/repo/${which}/.git`, { recursive: true });
  const p = new Deno.Command("git", {
    args: ["pull"],
    env: {
      GIT_CEILING_DIRECTORIES: `${config.workDir}/repo/`,
    },
    cwd: `${config.workDir}/repo/${which}`,
  });
  const { success, stdout, stderr } = p.outputSync();
  if (!success) {
    log("git pull failed:");
  } else {
    log("git pull successful:");
  }
  log(new TextDecoder().decode(stdout));
  log("STDERR:");
  log(new TextDecoder().decode(stderr));
  log("STDOUT:");
  if (!success) {
    emptyDataDir(which);
    cloneRepo(which, log);
  }
}

export function getModifiedAfter(
  fromCommit: string,
  tillCommit = "HEAD",
  log = console.log,
): ChangeSummary {
  updateLocalData("source");
  const p = new Deno.Command("git", {
    args: [
      "diff",
      "--name-status",
      fromCommit,
      tillCommit,
    ],
    cwd: `${config.workDir}/repo/source`,
  });
  const { success, stdout, stderr } = p.outputSync();
  log("STDOUT:");
  log(new TextDecoder().decode(stdout));
  log("STDERR:");
  log(new TextDecoder().decode(stderr));
  if (!success) {
    throw new Error("Abort.");
  }
  const typedFiles = new TextDecoder().decode(stdout).split("\n").filter((s) =>
    s.length > 0
  ).map((s) => s.split(/(\s+)/).filter((p) => p.trim().length > 0));
  return ({
    added: typedFiles.filter((t) => t[0] === "A").map((t) => t[1]),
    modified: typedFiles.filter((t) => t[0] === "M").map((t) => t[1]),
    removed: typedFiles.filter((t) => t[0] === "D").map((t) => t[1]),
  });
}
