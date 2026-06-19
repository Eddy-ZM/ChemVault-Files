import { describe, expect, it } from "vitest";

import { relativePrefixForHtmlFile, relativizeRootAssets } from "../scripts/relativize-assets.mjs";

describe("build asset path rewriting", () => {
  it("uses the current directory for root HTML files", () => {
    expect(relativePrefixForHtmlFile("dist/index.html", "dist")).toBe(".");
  });

  it("uses the parent directory for nested HTML files", () => {
    expect(relativePrefixForHtmlFile("dist/share/index.html", "dist")).toBe("..");
  });

  it("rewrites Astro and public asset root paths without touching API paths", () => {
    const html = [
      '<link rel="stylesheet" href="/_astro/app.css">',
      '<script type="module" src="/_astro/app.js"></script>',
      '<img src="/brand/chemvault-logo-light.png">',
      '<a href="/">Home</a>',
      '<a href="/cdn-cgi/access/logout">Sign out</a>',
      '<script>fetch("/api/health")</script>',
    ].join("");

    expect(relativizeRootAssets(html, "..")).toBe(
      [
        '<link rel="stylesheet" href="../_astro/app.css">',
        '<script type="module" src="../_astro/app.js"></script>',
        '<img src="../brand/chemvault-logo-light.png">',
        '<a href="../">Home</a>',
        '<a href="/cdn-cgi/access/logout">Sign out</a>',
        '<script>fetch("/api/health")</script>',
      ].join(""),
    );
  });
});
