export {
  type Config,
  GHActServer,
  GHActWorker,
  GitRepository,
  type Job,
} from "https://deno.land/x/ghact@1.2.1/mod.ts";

export { existsSync } from "https://deno.land/std@0.224.0/fs/mod.ts";

// used by gg2rdf.ts:
export { parseArgs } from "https://deno.land/std@0.224.0/cli/parse_args.ts";
export { DOMParser } from "https://esm.sh/linkedom@0.16.8/cached";
export { iso6393To1 } from "https://esm.sh/iso-639-3@3.0.1";

// DOMParser, iso6393To1, parseArgs

// broken somehow??
// export { Element } from "https://esm.sh/v135/linkedom@0.16.8/types/interface/element.d.ts";
// export type Element = globalThis.Element
