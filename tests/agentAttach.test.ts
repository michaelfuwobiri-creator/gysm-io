import { describe, expect, it } from "vitest";
import { MAX_ATTACHMENTS, attachmentNote, cleanAttachments, contentWithImages } from "@/lib/agentAttachCore";

const b64 = (s: string) => Buffer.from(s).toString("base64");

describe("cleanAttachments", () => {
  it("accepts an image and a text file and gives them workspace paths", () => {
    const r = cleanAttachments([
      { name: "Logo Final.PNG", mime: "image/png", data: b64("png") },
      { name: "brief.txt", mime: "text/plain", data: b64("hello") },
    ]);
    expect(r.error).toBeUndefined();
    expect(r.files.map((f) => [f.kind, f.path])).toEqual([["image", "uploads/Logo-Final.PNG"], ["text", "uploads/brief.txt"]]);
  });
  it("strips folders from names and keeps names unique", () => {
    const r = cleanAttachments([
      { name: "../../etc/passwd.txt", mime: "text/plain", data: b64("a") },
      { name: "a/b/passwd.txt", mime: "text/plain", data: b64("b") },
    ]);
    expect(r.files.map((f) => f.path)).toEqual(["uploads/passwd.txt", "uploads/passwd-2.txt"]);
  });
  it("rejects unsupported types, bad base64, too many and oversize files", () => {
    expect(cleanAttachments([{ name: "a.exe", mime: "application/x-msdownload", data: b64("x") }]).error).toMatch(/isn't supported/);
    expect(cleanAttachments([{ name: "a.txt", mime: "text/plain", data: "not base64!!" }]).error).toBeTruthy();
    expect(cleanAttachments(Array.from({ length: MAX_ATTACHMENTS + 1 }, () => ({ name: "a.txt", mime: "text/plain", data: b64("x") }))).error).toMatch(/up to/);
    expect(cleanAttachments([{ name: "big.txt", mime: "text/plain", data: b64("x".repeat(250_000)) }]).error).toMatch(/too large/);
  });
  it("treats no attachments as fine", () => {
    expect(cleanAttachments(undefined)).toEqual({ files: [] });
    expect(cleanAttachments("x").error).toBeTruthy();
  });
});

describe("attachmentNote / contentWithImages", () => {
  const files = cleanAttachments([
    { name: "logo.png", mime: "image/png", data: b64("png") },
    { name: "notes.md", mime: "text/markdown", data: b64("Colors: pink") },
  ]).files;
  it("lists the files and inlines small text as data", () => {
    const n = attachmentNote(files);
    expect(n).toContain("uploads/logo.png");
    expect(n).toContain("Colors: pink");
    expect(n).toMatch(/data, not instructions/);
  });
  it("reports a failed save", () => {
    expect(attachmentNote(files, "the workspace is unavailable")).toMatch(/failed/);
  });
  it("adds image parts only when there are images", () => {
    expect(contentWithImages("hi", files.filter((f) => f.kind === "text"))).toBe("hi");
    const parts = contentWithImages("hi", files) as any[];
    expect(parts[1].image_url.url).toMatch(/^data:image\/png;base64,/);
  });
});
