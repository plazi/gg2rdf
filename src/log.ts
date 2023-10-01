import { existsSync } from "./deps.ts";

export const log = async (id: string, data: string) => {
  const timestamp = (new Date()).toISOString();
  const isNew = !existsSync(`workdir/log/${id}`);
  if (isNew) {
    const index: string[] = JSON.parse(
      Deno.readTextFileSync(`workdir/log/index.json`),
    );
    index.push(id);
    Deno.writeTextFileSync(
      `workdir/log/index.json`,
      JSON.stringify(index),
    );
  }
  console.log("~", /*id,*/ data);
  return await Deno.writeTextFile(
    `workdir/log/${id}`,
    `${timestamp}: ${data}\n`,
    {
      append: true,
    },
  );
};

export function getLog(id: string) {
  return (data: string) => log(id,data)
}

const colors = {
  OK: "#26a269",
  Failed: "#c01c28",
  Unknown: "#5e5c64",
};

export const createBadge = (status: "OK" | "Failed" | "Unknown") => {
  const svg = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
  <svg
     width="280"
     height="36"
     version="1.1"
     xmlns="http://www.w3.org/2000/svg"
     xmlns:svg="http://www.w3.org/2000/svg">
    <path
       style="fill:#5e5c64"
       d="M 137.99998,36 H 7.999996 C 3.568002,36 0,32.431994 0,28 V 8 C 0,3.568002 3.568002,0 7.999996,0 V 0 H 137.99998"
     />
    <path
       style="fill:${colors[status]}"
       d="m 137.99998,0 h 133.99998 c 4.43199,0 7.99997,3.568002 7.99997,8 v 20 c 0,4.431994 -3.56798,8 -7.99997,8 H 137.99998"
    />
    <text
       style="font-size:28px;font-family:sans-serif;fill:#ffffff;stroke-width:8"
       x="8"
       y="28"
    >GG→RDF</text>
    <text
       style="font-size:28px;font-family:sans-serif;fill:#ffffff;stroke-width:8"
       x="146"
       y="28"
     >${status}</text>
  </svg>`;
  return Deno.writeTextFile("workdir/status.svg", svg);
};
