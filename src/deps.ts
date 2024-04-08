export {
  Server,
  Status,
  STATUS_TEXT,
} from "https://deno.land/std@0.202.0/http/mod.ts";

export {
  serveDir,
  serveFile,
} from "https://deno.land/std@0.202.0/http/file_server.ts";

export { existsSync, walk } from "https://deno.land/std@0.202.0/fs/mod.ts";
export * as path from "https://deno.land/std@0.209.0/path/mod.ts";

export { parseArgs } from "https://deno.land/std@0.215.0/cli/parse_args.ts";

export { DOMParser } from "https://esm.sh/linkedom@0.16.8/cached";

export { iso6393To1 } from "https://esm.sh/iso-639-3@3.0.1"

// broken somehow??
// export { Element } from "https://esm.sh/v135/linkedom@0.16.8/types/interface/element.d.ts";
// export type Element = globalThis.Element
