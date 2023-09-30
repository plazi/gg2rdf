import { serveDir, serveFile, Server, Status, STATUS_TEXT } from "./deps.ts";
import { config } from "../config/config.ts";
import { createBadge } from "./log.ts";

// Incomplete, only what we need
export type commit = {
  id: string;
  author: {
    "name": string;
    "email": string;
    "username": string;
  };
  added: string[];
  removed: string[];
  modified: string[];
};

// Incomplete, only what we need
type webhookPayload = {
  repository: {
    full_name: string;
  };
  commits: commit[];
};

export type workerMessage = {
  commits: commit[];
};

//////////////////////////////////////////////////
// initialize

const GHTOKEN = Deno.env.get("GHTOKEN");

if (!GHTOKEN) throw new Error("Requires GHTOKEN");

// ensure all required directories
await Deno.mkdir(`workdir/repo`, { recursive: true });
await Deno.mkdir(`workdir/tmprdf`, { recursive: true });
await Deno.mkdir(`workdir/tmpttl`, { recursive: true });
await Deno.mkdir(`workdir/log`, { recursive: true });
await Deno.writeTextFile(`workdir/log/index.json`, "[]");
await createBadge("Unknown");

const worker = new Worker(
  new URL("./action_worker.ts", import.meta.url).href,
  {
    type: "module",
  },
);

worker.postMessage({ GHTOKEN });

//////////////////////////////////////////////////

const webhookHandler = async (request: Request) => {
  const pathname = new URL(request.url).pathname;
  if (request.method === "POST") {
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

        if (!repoName || !json.commits) {
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

        worker.postMessage({ commits: json?.commits } as workerMessage);

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
    const response = await serveFile(request, "workdir/log/index.json");
    response.headers.set("Content-Type", "application/json");
    return response;
  } else if (pathname.startsWith("/log")) {
    console.log("· Got log request for", pathname);
    const response = await serveDir(request, {
      fsRoot: "workdir/log",
      urlRoot: "log",
    });
    // response.headers.set("Content-Type", "application/json");
    return response;
  } else if (pathname === "/status" || pathname === "/status/") {
    console.log("· Got status badge request");
    const response = await serveFile(request, "workdir/status.svg");
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
