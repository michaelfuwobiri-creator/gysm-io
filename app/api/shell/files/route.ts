import { getUser } from "@/lib/auth";
import { MAX_TRANSFER_BYTES, readFromSandbox, uploadToSandbox } from "@/lib/shell/sandbox";

// Moves files between the user's phone and their GYSM Shell workspace.
//   POST multipart (file, cwd)  -> saves into the current folder
//   GET  ?path=...&cwd=...      -> downloads a file (max 4 MB, Vercel's body cap)
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Invalid upload." }, { status: 400 });
  }
  const file = form.get("file");
  const cwd = typeof form.get("cwd") === "string" ? String(form.get("cwd")).slice(0, 500) : "";
  if (!file || typeof file === "string") return Response.json({ error: "Choose a file to upload." }, { status: 400 });
  if (file.size > MAX_TRANSFER_BYTES) {
    return Response.json({ error: "Files can be up to 4 MB for now." }, { status: 413 });
  }

  try {
    const data = new Uint8Array(await file.arrayBuffer());
    const path = await uploadToSandbox(user.id, file.name, data, cwd);
    return Response.json({ path });
  } catch (error: any) {
    console.error("[shell/files] upload failed:", error?.message || error);
    return Response.json({ error: "Upload failed. Please try again." }, { status: 502 });
  }
}

export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });

  const url = new URL(req.url);
  const path = (url.searchParams.get("path") || "").slice(0, 1000);
  const cwd = (url.searchParams.get("cwd") || "").slice(0, 500);
  if (!path) return Response.json({ error: "No file given." }, { status: 400 });

  try {
    const file = await readFromSandbox(user.id, path, cwd);
    if (!file) return Response.json({ error: "File not found." }, { status: 404 });
    return new Response(new Uint8Array(file.data), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${file.name.replace(/[^\w.\- ]+/g, "_")}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error: any) {
    if (error?.message === "FILE_TOO_LARGE") {
      return Response.json({ error: "That file is over 4 MB. Ask the AI to compress or split it." }, { status: 413 });
    }
    console.error("[shell/files] download failed:", error?.message || error);
    return Response.json({ error: "Download failed. Please try again." }, { status: 502 });
  }
}
