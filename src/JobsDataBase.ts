import * as path from "https://deno.land/std@0.209.0/path/mod.ts";
//import { config } from "../config/config.ts";

//const jobsDir = `${config.workDir}/log`;

export type Job = {
  id: string;
  from?: string;
  till?: string;
  author: {
    "name": string;
    "email": string;
  };
  files?: {
    // only used for transform_all
    modified?: string[];
    removed?: string[];
  };
};

export type JobStatus = {
  job: Job;
  status: "pending" | "failed" | "completed";
  dir: string;
};

function notEmpty<TValue>(value: TValue | null | undefined): value is TValue {
  return value !== null && value !== undefined;
}

/** A filesystem backed database of jobs and their status. For every job there
 * is a directory where logs might be added. */
export class JobsDataBase {
  constructor(public jobsDir: string) {
    Deno.mkdirSync(jobsDir, { recursive: true });
  }

  addJob(job: Job) {
    const status: JobStatus = {
      job,
      status: "pending",
      dir: path.join(this.jobsDir, job.id),
    };
    Deno.mkdirSync(status.dir);
    Deno.writeTextFileSync(
      path.join(status.dir, "status.json"),
      JSON.stringify(status, undefined, 2),
    );
  }

  setStatus(job: Job, status: "failed" | "completed") {
    const jobStatus: JobStatus = {
      job,
      status,
      dir: path.join(this.jobsDir, job.id),
    };
    Deno.writeTextFileSync(
      path.join(jobStatus.dir, "status.json"),
      JSON.stringify(jobStatus, undefined, 2),
    );
  }

  allJobs(): JobStatus[] {
    const jobDirs = [];
    for (const jobDir of Deno.readDirSync(this.jobsDir)) {
      jobDirs.push(jobDir);
    }
    return jobDirs.filter((entry) => entry.isDirectory).sort((a, b) =>
      b.name.localeCompare(a.name)
    ).map((jobDir) => {
      const statusFile = path.join(this.jobsDir, jobDir.name, "status.json");
      try {
        return Deno.readTextFileSync(statusFile);
      } catch (err) {
        if (err instanceof Deno.errors.NotFound) {
          console.warn(
            `No statusfile found at ${statusFile}. Please remove directory.`,
          );
          return null;
        } else if (
          (err instanceof Deno.errors.NotADirectory) || err.code === "ENOTDIR"
        ) {
          console.warn(
            `${statusFile} is not a diretory. Please remove the file.`,
          );
          return null;
        } else {
          throw err;
        }
      }
    }).filter(notEmpty).map((t) => {
      try {
        return JSON.parse(t) as JobStatus;
      } catch (err) {
        console.warn(`${err} parsing ${t}.`);
        return null;
      }
    }).filter(notEmpty);
  }
  pendingJobs() {
    return this.allJobs().filter((js) => js.status === "pending");
  }
}
