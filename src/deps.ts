export {
  Server,
  Status,
  STATUS_TEXT,
} from "https://deno.land/std@0.202.0/http/mod.ts";

export {
  serveDir,
  serveFile,
} from "https://deno.land/std@0.202.0/http/file_server.ts";

export { existsSync } from "https://deno.land/std@0.202.0/fs/mod.ts";

export { parseArgs } from "https://deno.land/std@0.215.0/cli/parse_args.ts";

export { DOMParser } from "https://esm.sh/linkedom@0.16.8/cached";

// broken somehow??
// export { Element } from "https://esm.sh/v135/linkedom@0.16.8/types/interface/element.d.ts";
// export type Element = globalThis.Element
