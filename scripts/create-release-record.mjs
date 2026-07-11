import { createHash } from "node:crypto";
import { basename } from "node:path";
import { readFile, stat, writeFile } from "node:fs/promises";

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, values) => {
  if (value.startsWith("--")) pairs.push([value.slice(2), values[index + 1]]);
  return pairs;
}, []));

for (const key of ["file", "app", "platform", "type", "version", "url", "output"]) {
  if (!args[key]) throw new Error(`Missing --${key}.`);
}
if (!/^https:\/\//.test(args.url)) throw new Error("Release URL must use HTTPS.");
if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(args.version)) throw new Error("Version must use semantic versioning.");

const bytes = await readFile(args.file);
const file = await stat(args.file);
const sha256 = createHash("sha256").update(bytes).digest("hex");
const asset = {
  app: args.app,
  platform: args.platform,
  type: args.type,
  version: args.version,
  url: args.url,
  sha256,
  size: file.size,
  publishedAt: new Date().toISOString(),
  fileName: basename(args.file),
};
const manifest = { schemaVersion: 1, generatedAt: asset.publishedAt, assets: [asset] };
await writeFile(args.output, `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(`${args.file}.sha256`, `${sha256}  ${basename(args.file)}\n`);
console.log(`Wrote ${args.output} and SHA-256 for ${basename(args.file)}.`);
