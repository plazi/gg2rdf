const decoder = new TextDecoder();
export async function exec(cmd: string[], directory?: string) {
  const p = Deno.run({
    cmd,
    cwd: directory || Deno.cwd(),
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
  });
  const stdout = decoder.decode(await p.output());
  const stderr = decoder.decode(await p.stderrOutput());
  const status = await p.status();
  return { status, stderr, stdout };
}