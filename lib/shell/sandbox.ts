import { createHash, randomBytes } from "crypto";
import { Sandbox } from "@vercel/sandbox";

// GYSM Shell's compute layer: one persistent Vercel Sandbox (Firecracker
// microVM) per GYSM user. Persistent + named means the user's files
// survive between visits -- the sandbox hibernates when idle and the SDK
// auto-resumes it on the next runCommand. Nothing here ever runs on the
// GYSM servers themselves; every command goes to the user's own VM.
//
// Auth: on Vercel the SDK picks up the deployment's OIDC token
// automatically. Locally run `vercel env pull` (see docs/shell.md).

// How long a session stays up after its last start before hibernating.
// Hobby plans cap this at 45 minutes; Pro allows much longer.
const SANDBOX_TIMEOUT_MS = Number(process.env.SHELL_SANDBOX_TIMEOUT_MS) || 30 * 60 * 1000;
const SANDBOX_VCPUS = Number(process.env.SHELL_SANDBOX_VCPUS) || 2;

// Per-command limits. Interactive programs (vim, top, a REPL waiting on
// stdin) never exit on their own, so they hit this timeout -- the UI and
// the agent's system prompt both steer users away from them.
const COMMAND_TIMEOUT_MS = 90 * 1000;
const MAX_OUTPUT_CHARS = 12_000;

const CWD_MARKER = "__GYSM_CWD__";

// Runs the user's command inside bash, from the directory they were last
// in, and reports the directory they ended up in -- so `cd` works across
// separate commands the way people expect from a real terminal. The
// command arrives through an env var (never interpolated into this
// script), so quoting in user input can't break out of the wrapper.
const WRAPPER = `
cd "\${GYSM_CWD:-$HOME/workspace}" 2>/dev/null || cd "$HOME/workspace" 2>/dev/null || cd "$HOME"
eval "$GYSM_CMD"
__gysm_ec=$?
printf '\\n${CWD_MARKER}%s\\n' "$(pwd)"
exit $__gysm_ec
`;

const WELCOME = `Welcome to your GYSM Shell workspace!

This folder is yours. Files you create here stay here between visits.

Try asking the AI:
  - "Make a Python script that prints the weather in Rome"
  - "Teach me the 10 most useful Linux commands"
  - "Turn the CSV I uploaded into a summary"
`;

export function sandboxNameFor(userId: string): string {
  // Hashed rather than the raw Clerk id: sandbox names are visible in the
  // Vercel dashboard, and Clerk ids are mixed-case while sandbox names
  // should stay simple lowercase slugs.
  return "gysm-shell-" + createHash("sha256").update(userId).digest("hex").slice(0, 24);
}

export async function getUserSandbox(userId: string): Promise<Sandbox> {
  return Sandbox.getOrCreate({
    name: sandboxNameFor(userId),
    persistent: true,
    timeout: SANDBOX_TIMEOUT_MS,
    resources: { vcpus: SANDBOX_VCPUS },
    tags: { app: "gysm-shell" },
    onCreate: async (sbx) => {
      await sbx.writeFiles([{ path: "/tmp/gysm-welcome.txt", content: WELCOME }]);
      await sbx.runCommand("bash", [
        "-lc",
        'mkdir -p "$HOME/workspace" && mv /tmp/gysm-welcome.txt "$HOME/workspace/WELCOME.txt"',
      ]);
    },
  });
}

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;?]*[ -\/]*[@-~]|\u001b\][^\u0007]*\u0007/g;

export type RunResult = {
  output: string;
  exitCode: number;
  cwd: string;
  truncated: boolean;
  timedOut: boolean;
};

export async function runInSandbox(userId: string, command: string, cwd?: string | null): Promise<RunResult> {
  const sandbox = await getUserSandbox(userId);
  const env: Record<string, string> = { GYSM_CMD: command, TERM: "dumb", PAGER: "cat", GIT_PAGER: "cat" };
  if (cwd) env.GYSM_CWD = cwd;

  let raw = "";
  let exitCode = 0;
  let timedOut = false;
  try {
    const result = await sandbox.runCommand({
      cmd: "bash",
      args: ["-lc", WRAPPER],
      env,
      signal: AbortSignal.timeout(COMMAND_TIMEOUT_MS),
    });
    raw = await result.output("both");
    exitCode = result.exitCode;
  } catch (error: any) {
    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      timedOut = true;
      exitCode = 124;
      raw = `Command timed out after ${COMMAND_TIMEOUT_MS / 1000}s. Interactive programs (vim, nano, top, a Python prompt) aren't supported yet -- run scripts instead.`;
    } else {
      throw error;
    }
  }

  let newCwd = cwd || "";
  const markerAt = raw.lastIndexOf(CWD_MARKER);
  if (markerAt !== -1) {
    newCwd = raw.slice(markerAt + CWD_MARKER.length).trim() || newCwd;
    raw = raw.slice(0, markerAt);
  }

  let output = raw.replace(ANSI, "").replace(/\r(?!\n)/g, "\n").replace(/\s+$/, "");
  let truncated = false;
  if (output.length > MAX_OUTPUT_CHARS) {
    const head = output.slice(0, MAX_OUTPUT_CHARS / 3);
    const tail = output.slice(-(MAX_OUTPUT_CHARS * 2) / 3);
    output = `${head}\n\n... [${output.length - MAX_OUTPUT_CHARS} characters cut] ...\n\n${tail}`;
    truncated = true;
  }

  return { output, exitCode, cwd: newCwd, truncated, timedOut };
}

// Vercel functions cap request/response bodies at ~4.5 MB.
export const MAX_TRANSFER_BYTES = 4 * 1024 * 1024;

function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() || "upload";
  return base.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "upload";
}

/** Saves an uploaded file into the user's current folder. Returns its path. */
export async function uploadToSandbox(userId: string, fileName: string, data: Uint8Array, cwd?: string | null): Promise<string> {
  const sandbox = await getUserSandbox(userId);
  const tmp = `/tmp/gysm-upload-${randomBytes(8).toString("hex")}`;
  await sandbox.writeFiles([{ path: tmp, content: data }]);
  const name = safeFileName(fileName);
  // `name` is already restricted to [A-Za-z0-9_.- ] by safeFileName, so
  // single-quoting it is safe.
  const result = await runInSandbox(userId, `mv -f -- '${tmp}' './${name}' && realpath -- './${name}'`, cwd);
  if (result.exitCode !== 0) throw new Error(result.output || "Upload failed");
  return result.output.trim().split("\n").pop() || name;
}

/** Reads a file from the user's sandbox for download. null = not found. */
export async function readFromSandbox(
  userId: string,
  path: string,
  cwd?: string | null
): Promise<{ name: string; data: Buffer } | null> {
  const sandbox = await getUserSandbox(userId);
  // Resolve relative paths against the user's folder, and check size
  // first so a huge file fails fast instead of blowing the response cap.
  const quoted = "'" + path.replace(/'/g, "'\\''") + "'";
  const probe = await runInSandbox(userId, `f=$(realpath -- ${quoted}) && [ -f "$f" ] && echo "$(stat -c %s -- "$f") $f"`, cwd);
  if (probe.exitCode !== 0) return null;
  const line = probe.output.trim().split("\n").pop() || "";
  const space = line.indexOf(" ");
  const size = Number(line.slice(0, space));
  const abs = line.slice(space + 1);
  if (!abs || !Number.isFinite(size)) return null;
  if (size > MAX_TRANSFER_BYTES) throw new Error("FILE_TOO_LARGE");
  const data = await sandbox.readFileToBuffer({ path: abs });
  if (!data) return null;
  return { name: abs.split("/").pop() || "download", data };
}
