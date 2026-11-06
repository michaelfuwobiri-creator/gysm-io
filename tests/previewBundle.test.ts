import { describe, expect, it } from "vitest";
import { bundlePreview, pickEntry, resolveRef } from "@/lib/previewBundle";

const b64 = (s: string) => Buffer.from(s).toString("base64");

describe("resolveRef", () => {
  it("resolves relative, parent and root paths", () => {
    expect(resolveRef("", "style.css")).toBe("style.css");
    expect(resolveRef("pages", "../style.css?v=2")).toBe("style.css");
    expect(resolveRef("pages", "/img/a.png")).toBe("img/a.png");
    expect(resolveRef("", "./a/./b.png#x")).toBe("a/b.png");
  });
  it("ignores external, data, mailto, hash and escapes", () => {
    for (const r of ["https://x.com/a.css", "//cdn.x/a.js", "data:image/png;base64,AA", "mailto:a@b.c", "#top", "", "../../etc/passwd"]) expect(resolveRef("a", r)).toBeNull();
  });
});

describe("bundlePreview", () => {
  const files = [
    { path: "index.html", text: `<!doctype html><html><head><link rel="stylesheet" href="css/site.css"><link rel="icon" href="fav.png"><script src="app.js"></script></head><body><img src="img/logo.png" alt=""><a href="about.html">About</a><div style="background:url(img/logo.png)"></div></body></html>` },
    { path: "about.html", text: "<html><body>About</body></html>" },
    { path: "css/site.css", text: "body{background:url('../img/logo.png')} h1{color:red}" },
    { path: "app.js", text: "console.log('</script>')" },
    { path: "img/logo.png", base64: b64("PNG") },
    { path: "fav.png", base64: b64("ICO") },
  ];

  it("inlines css, js, images and css urls into one page", () => {
    const r = bundlePreview(files) as any;
    expect(r.ok).toBe(true);
    expect(r.entry).toBe("index.html");
    expect(r.pages).toEqual(["about.html", "index.html"]);
    expect(r.html).toContain("<style>body{background:url(\"data:image/png;base64,");
    expect(r.html).not.toContain('href="css/site.css"');
    expect(r.html).not.toContain('src="app.js"');
    expect(r.html).toContain("console.log('<\\/script>')");
    expect(r.html).toContain(`<img src="data:image/png;base64,${b64("PNG")}"`);
    expect(r.html).toContain(`href="data:image/png;base64,${b64("ICO")}"`);
    expect(r.html).toMatch(/style="background:url\(&quot;?data:image\/png|style="background:url\("?data:image\/png/);
    expect(r.html).toContain("gysmPreviewNav");
  });

  it("opens another page when asked, and falls back sensibly", () => {
    expect((bundlePreview(files, "about.html") as any).html).toContain("About");
    expect(pickEntry(files, "missing.html")).toBe("index.html");
    expect(pickEntry([{ path: "docs/z.html", text: "" }, { path: "a.html", text: "" }])).toBe("a.html");
  });

  it("leaves external urls and missing files alone, and explains a project with no page", () => {
    const r = bundlePreview([{ path: "index.html", text: `<link rel="stylesheet" href="https://cdn.x/a.css"><img src="gone.png"><script src="https://cdn.x/a.js"></script>` }]) as any;
    expect(r.html).toContain('href="https://cdn.x/a.css"');
    expect(r.html).toContain('src="gone.png"');
    expect(r.html).toContain('src="https://cdn.x/a.js"');
    const none = bundlePreview([{ path: "app.py", text: "print(1)" }]) as any;
    expect(none.ok).toBe(false);
    expect(none.error).toMatch(/no web page/i);
  });

  it("works for pages in a subfolder", () => {
    const r = bundlePreview([
      { path: "site/index.html", text: `<link rel="stylesheet" href="s.css"><body></body>` },
      { path: "site/s.css", text: "a{}" },
    ]) as any;
    expect(r.html).toContain("<style>a{}</style>");
  });
});

import { projectOf } from "@/lib/agentCore";
describe("projectOf", () => {
  it("names the project folder a tool call is about", () => {
    expect(projectOf("write_file", { path: "bakery/index.html" })).toBe("bakery");
    expect(projectOf("edit_file", { path: "bakery/css/a.css" })).toBe("bakery");
    expect(projectOf("deploy", { project: "bakery" })).toBe("bakery");
    expect(projectOf("write_file", { path: "notes.txt" })).toBeNull();
    expect(projectOf("write_file", { path: "../x/a.html" })).toBeNull();
    expect(projectOf("web_search", { query: "x" })).toBeNull();
  });
});
