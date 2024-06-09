import { GHActServer } from "./deps.ts";
import { config } from "../config/config.ts";

const GHTOKEN = Deno.env.get("GHTOKEN");

if (!GHTOKEN) throw new Error("Requires GHTOKEN");

// ensure all required directories
await Deno.mkdir(`${config.workDir}/tmpttl`, { recursive: true });
await Deno.mkdir(`${config.workDir}/target-repo`, { recursive: true });

const worker = new Worker(import.meta.resolve("./action_worker.ts"), {
  type: "module",
});
const server = new GHActServer(worker, config);
await server.serve();
