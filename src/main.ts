import frontend from "ghact/src/frontend.tsx"
import { config } from "../config/config.ts";

const GHTOKEN = Deno.env.get("GHTOKEN");

if (!GHTOKEN) throw new Error("Requires GHTOKEN");


// ensure all required directories
await Deno.mkdir(`${config.workDir}/repo`, { recursive: true });
await Deno.mkdir(`${config.workDir}/tmprdf`, { recursive: true });
await Deno.mkdir(`${config.workDir}/tmpttl`, { recursive: true });


const worker = new Worker(
  new URL("./action_worker.ts", import.meta.url).href,
  {
    type: "module",
  },
);
await frontend(worker, config);