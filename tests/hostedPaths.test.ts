import { describe, expect, it } from "vitest";
import { hostedContentType, isBinaryHostedPath, normalizeHostedPath, normalizePath } from "@/lib/projectFilesCore";

describe("hosted paths", () => {
  it("allows images, fonts and build files that classic builds do not", () => {
    expect(normalizePath("img/logo.png")).toBeNull();
    expect(normalizeHostedPath("img/logo.png")).toBe("img/logo.png");
    expect(normalizeHostedPath("assets/index-abc123.js")).toBe("assets/index-abc123.js");
    expect(normalizeHostedPath("fonts/inter.woff2")).toBe("fonts/inter.woff2");
    expect(normalizeHostedPath("site.webmanifest")).toBe("site.webmanifest");
    expect(normalizeHostedPath("index.html")).toBe("index.html");
  });
  it("still rejects escapes, hidden files and unknown types", () => {
    expect(normalizeHostedPath("../x.png")).toBeNull();
    expect(normalizeHostedPath(".env")).toBeNull();
    expect(normalizeHostedPath("a/.hidden.png")).toBeNull();
    expect(normalizeHostedPath("run.exe")).toBeNull();
    expect(normalizeHostedPath("/abs.png")).toBeNull();
    expect(normalizeHostedPath("sp ace.png")).toBeNull();
  });
  it("knows binary files and content types", () => {
    expect(isBinaryHostedPath("a.PNG")).toBe(true);
    expect(isBinaryHostedPath("a.svg")).toBe(false);
    expect(hostedContentType("a.woff2")).toBe("font/woff2");
    expect(hostedContentType("a.jpg")).toBe("image/jpeg");
    expect(hostedContentType("a.css")).toMatch(/text\/css/);
    expect(hostedContentType("a.mjs")).toMatch(/javascript/);
  });
});
