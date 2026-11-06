import { describe, expect, it } from "vitest";
import { downloadName, mimeForFile } from "@/lib/agentFileCore";

describe("mimeForFile", () => {
  it("maps common extensions and falls back to binary", () => {
    expect(mimeForFile("menu.PDF")).toBe("application/pdf");
    expect(mimeForFile("data.csv")).toBe("text/csv");
    expect(mimeForFile("site.zip")).toBe("application/zip");
    expect(mimeForFile("weird.bin")).toBe("application/octet-stream");
    expect(mimeForFile("noext")).toBe("application/octet-stream");
  });
});

describe("downloadName", () => {
  it("uses the last path segment and safe characters", () => {
    expect(downloadName("out/My Menu.pdf")).toBe("My Menu.pdf");
    expect(downloadName("a/b.txt", "../../evil.sh")).toBe("evil.sh");
    expect(downloadName("a/b.txt", "   ")).toBe("b.txt");
    expect(downloadName("..")).toBe("download");
  });
});
