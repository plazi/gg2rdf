import { serveDir, serveFile, Server, Status, STATUS_TEXT } from "./deps.ts";
import { config } from "../config/config.ts";
import { createBadge, log } from "./log.ts";
//import { getModifiedAfter } from "./repoActions.ts";
import { Job } from "./JobsDataBase.ts";

// Incomplete, only what we need
type webhookPayload = {
  repository: {
    full_name: string;
  };
  before: string;
  after: string;
  pusher: {
    name: string;
    email: string;
  };
};

//////////////////////////////////////////////////
// initialize

const GHTOKEN = Deno.env.get("GHTOKEN");

if (!GHTOKEN) throw new Error("Requires GHTOKEN");

// ensure all required directories
await Deno.mkdir(`${config.workDir}/repo`, { recursive: true });
await Deno.mkdir(`${config.workDir}/tmprdf`, { recursive: true });
await Deno.mkdir(`${config.workDir}/tmpttl`, { recursive: true });
await Deno.mkdir(`${config.workDir}/log`, { recursive: true });
await Deno.writeTextFile(`${config.workDir}/log/index.json`, "[]");
await createBadge("Unknown");

const worker = new Worker(
  new URL("./action_worker.ts", import.meta.url).href,
  {
    type: "module",
  },
);

//////////////////////////////////////////////////

const webhookHandler = async (request: Request) => {
  const requestUrl = new URL(request.url);
  const pathname = requestUrl.pathname;
  if (request.method === "POST") {
    if (pathname === "/update") {
      const from = requestUrl.searchParams.get("from");
      if (!from) {
        return new Response("Query parameter 'from' required", {
          status: Status.BadRequest,
          statusText: STATUS_TEXT[Status.BadRequest],
        });
      }
      const till = requestUrl.searchParams.get("till") || "HEAD";
      // console.log(await getModifiedAfter(from));
      const job: Job = {
        id: (new Date()).toISOString(),
        from,
        till,
        author: {
          name: "GG2RDF Service",
          email: "gg2rdf@plazi.org",
        },
      };
      worker.postMessage(job);
      await log(
        job.id,
        `Job submitted: ${JSON.stringify(job, undefined, 2)}`,
      );
      return new Response(undefined, {
        status: Status.Accepted,
        statusText: STATUS_TEXT[Status.Accepted],
      });
    }
    if (pathname === "/full_update") {
      console.log("· got full_update request");
      // TODO
      return new Response("Not Implemented", {
        status: Status.NotImplemented,
        statusText: STATUS_TEXT[Status.NotImplemented],
      });
    } else {
      try {
        const json: webhookPayload | undefined = await request.json();
        const repoName = json?.repository?.full_name;

        console.log("· got webhook from", repoName);

        if (!repoName) {
          return new Response("Invalid Payload", {
            status: Status.BadRequest,
            statusText: STATUS_TEXT[Status.BadRequest],
          });
        }

        if (repoName !== config.sourceRepository) {
          return new Response("Wrong Repository", {
            status: Status.BadRequest,
            statusText: STATUS_TEXT[Status.BadRequest],
          });
        }
        const job: Job = {
          id: (new Date()).toISOString(),
          from: json.before,
          till: json.after,
          author: json.pusher,
        };
        worker.postMessage(job);
        await log(
          job.id,
          `Job submitted: ${JSON.stringify(job, undefined, 2)}`,
        );
        return new Response(undefined, {
          status: Status.Accepted,
          statusText: STATUS_TEXT[Status.Accepted],
        });
      } catch (error) {
        return new Response(error, {
          status: Status.InternalServerError,
          statusText: STATUS_TEXT[Status.InternalServerError],
        });
      }
    }
  } else if (pathname === "/log" || pathname === "/log/") {
    console.log("· Got log index request");
    const response = await serveFile(request, `${config.workDir}/log/index.json`);
    response.headers.set("Content-Type", "application/json");
    return response;
  } else if (pathname.startsWith("/log")) {
    console.log("· Got log request for", pathname);
    const response = await serveDir(request, {
      fsRoot: `${config.workDir}/log`,
      urlRoot: "log",
    });
    // response.headers.set("Content-Type", "application/json");
    return response;
  } else if (pathname === "/status" || pathname === "/status/") {
    console.log("· Got status badge request");
    const response = await serveFile(request, `${config.workDir}/status.svg`);
    response.headers.set("Content-Type", "image/svg+xml");
    return response;
  } else {
    console.log("· Got invalid request");
    return new Response(undefined, {
      status: Status.BadRequest,
      statusText: STATUS_TEXT[Status.BadRequest],
    });
  }
};

//////////////////////////////////////////////////
// start server

const server = new Server({ handler: webhookHandler });
const listener = Deno.listen({ port: 4505, hostname: "0.0.0.0" });
console.log(`server listening on http://${Deno.env.get("HOSTNAME")}:4505`);

await server.serve(listener);
