import { describe, expect, it } from "vitest";
import { runLocalTool, localFileExists, type DirHandleLike, type FileHandleLike } from "@/lib/localFolder";
import { agentToolsFor, checkLocalCall, cleanLocalFolderName, localPathBlock, systemPrompt } from "@/lib/agentCore";

// In-memory stand-in for a FileSystemDirectoryHandle.
function notFound() {
  const e: any = new Error("nf");
  e.name = "NotFoundError";
  return e;
}
function makeDir(name: string, tree: Record<string, any>): DirHandleLike {
  const dir: DirHandleLike = {
    kind: "directory",
    name,
    async getDirectoryHandle(n, opts) {
      if (!(n in tree)) {
        if (!opts?.create) throw notFound();
        tree[n] = {};
      }
      if (typeof tree[n] === "string") throw Object.assign(new Error("tm"), { name: "TypeMismatchError" });
      return makeDir(n, tree[n]);
    },
    async getFileHandle(n, opts): Promise<FileHandleLike> {
      if (!(n in tree)) {
        if (!opts?.create) throw notFound();
        tree[n] = "";
      }
      if (typeof tree[n] !== "string") throw Object.assign(new Error("tm"), { name: "TypeMismatchError" });
      return {
        kind: "file",
        name: n,
        async getFile() {
          const text = tree[n] as string;
          return { size: text.length, text: async () => text };
        },
        async createWritable() {
          let buf = "";
          return { write: async (d: string) => void (buf += d), close: async () => void (tree[n] = buf) };
        },
      };
    },
    values() {
      const entries = Object.keys(tree).map((k) => (typeof tree[k] === "string" ? ({ kind: "file", name: k, getFile: async () => ({ size: tree[k].length, text: async () => tree[k] }) } as any) : makeDir(k, tree[k])));
      return (async function* () {
        for (const e of entries) yield e;
      })();
    },
  };
  return dir;
}

describe("local path guard", () => {
  it("blocks secrets and escapes but allows normal files", () => {
    expect(localPathBlock(".env", "read")).toMatch(/secrets/);
    expect(localPathBlock("app/.env.local", "read")).toMatch(/secrets/);
    expect(localPathBlock(".env.example", "read")).toBeNull();
    expect(localPathBlock("keys/server.pem", "read")).toMatch(/key/);
    expect(localPathBlock("home/.ssh/config", "read")).toMatch(/credentials/);
    expect(localPathBlock("node_modules/x/index.js", "write")).toMatch(/node_modules/);
    expect(localPathBlock("node_modules/x/index.js", "read")).toBeNull();
    expect(localPathBlock("src/index.ts", "write")).toBeNull();
    expect(checkLocalCall("local_read", { path: "../etc/passwd" })).toMatch(/Invalid path/);
    expect(checkLocalCall("local_read", { path: "/etc/passwd" })).toMatch(/Invalid path/);
    expect(checkLocalCall("local_read", { path: ".git/config" })).toMatch(/Invalid path/);
    expect(checkLocalCall("local_list", { path: "" })).toBeNull();
    expect(checkLocalCall("local_read", { path: "" })).toMatch(/Invalid path/);
    expect(checkLocalCall("local_write", { path: "a.txt", content: 5 })).toMatch(/content/);
    expect(checkLocalCall("local_edit", { path: "a.txt", old_string: "", new_string: "x" })).toMatch(/old_string/);
  });

  it("offers local tools only while a folder is connected", () => {
    const names = (on: boolean) => agentToolsFor(on).map((t: any) => t.function.name);
    expect(names(false)).not.toContain("local_read");
    expect(names(true)).toEqual(expect.arrayContaining(["local_list", "local_read", "local_write", "local_edit"]));
    expect(systemPrompt()).not.toContain("connected a folder");
    expect(systemPrompt("my-site")).toContain('named "my-site"');
    expect(cleanLocalFolderName('  we"ird`\nname ')).toBe("weirdname");
    expect(cleanLocalFolderName("")).toBeNull();
  });
});

describe("runLocalTool", () => {
  const fresh = () => makeDir("proj", { "index.html": "<h1>Hi</h1>", src: { "a.ts": "const a = 1;\nconst a2 = 2;\n" }, ".env": "SECRET=1", node_modules: { x: "y" } });

  it("lists, hiding node_modules, and reads files", async () => {
    const root = fresh();
    const ls = await runLocalTool(root, "local_list", { path: "" });
    expect(ls.ok).toBe(true);
    expect(ls.output).toContain("index.html (11 bytes)");
    expect(ls.output).toContain("src/");
    expect(ls.output).not.toContain("node_modules/");
    const rd = await runLocalTool(root, "local_read", { path: "src/a.ts" });
    expect(rd).toEqual({ ok: true, output: "const a = 1;\nconst a2 = 2;\n" });
  });

  it("refuses secrets even if the model asks", async () => {
    const root = fresh();
    expect((await runLocalTool(root, "local_read", { path: ".env" })).ok).toBe(false);
    expect((await runLocalTool(root, "local_write", { path: ".env", content: "x" })).ok).toBe(false);
  });

  it("writes new files (creating folders) and reports missing files", async () => {
    const root = fresh();
    expect(await localFileExists(root, "new/dir/f.txt")).toBe(false);
    const w = await runLocalTool(root, "local_write", { path: "new/dir/f.txt", content: "hello" });
    expect(w.ok).toBe(true);
    expect(await localFileExists(root, "new/dir/f.txt")).toBe(true);
    expect((await runLocalTool(root, "local_read", { path: "new/dir/f.txt" })).output).toBe("hello");
    const miss = await runLocalTool(root, "local_read", { path: "nope.txt" });
    expect(miss).toEqual({ ok: false, output: "Not found in the connected folder." });
  });

  it("edits only a unique match", async () => {
    const root = fresh();
    const dup = await runLocalTool(root, "local_edit", { path: "src/a.ts", old_string: "const a", new_string: "let a" });
    expect(dup.ok).toBe(false);
    expect(dup.output).toMatch(/more than once/);
    const none = await runLocalTool(root, "local_edit", { path: "src/a.ts", old_string: "zzz", new_string: "y" });
    expect(none.output).toMatch(/not found/);
    const ok = await runLocalTool(root, "local_edit", { path: "src/a.ts", old_string: "const a2 = 2;", new_string: "const a2 = 3;" });
    expect(ok.ok).toBe(true);
    expect((await runLocalTool(root, "local_read", { path: "src/a.ts" })).output).toBe("const a = 1;\nconst a2 = 3;\n");
  });

  it("will not read binary files", async () => {
    const root = makeDir("p", { "x.bin": "ab\0cd" });
    const r = await runLocalTool(root, "local_read", { path: "x.bin" });
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/binary/);
  });
});
