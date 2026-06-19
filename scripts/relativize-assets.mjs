import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT_ASSET_RE = /\b(href|src)="\/((?:_astro|brand)\/[^"]+|favicon\.(?:ico|svg))"/g;
const ROOT_HOME_RE = /\bhref="\/"/g;

export function relativePrefixForHtmlFile(htmlFile, rootDir) {
  const fromDir = dirname(htmlFile);
  const prefix = relative(fromDir, rootDir).split(sep).join("/");
  return prefix || ".";
}

export function relativizeRootAssets(html, prefix) {
  const homeHref = prefix === "." ? "./" : `${prefix}/`;
  return html
    .replace(ROOT_ASSET_RE, (_match, attr, assetPath) => `${attr}="${prefix}/${assetPath}"`)
    .replace(ROOT_HOME_RE, `href="${homeHref}"`);
}

async function* walkFiles(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkFiles(fullPath);
    } else {
      yield fullPath;
    }
  }
}

export async function relativizeBuiltHtml(rootDir = "dist") {
  for await (const file of walkFiles(rootDir)) {
    if (!file.endsWith(".html")) continue;
    const prefix = relativePrefixForHtmlFile(file, rootDir);
    const html = await readFile(file, "utf8");
    const nextHtml = relativizeRootAssets(html, prefix);
    if (nextHtml !== html) {
      await writeFile(file, nextHtml);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  relativizeBuiltHtml(process.argv[2] ?? "dist").catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
