import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";

// Figma import -- renders a specific frame/selection from a Figma file to
// a PNG and hands it back as a data: URL, so it can drop straight into
// the exact same imageDataUrl pipeline the "attach a reference image"
// feature already uses (lib/ai/orchestrator.ts's generateWebsite/editWebsite
// already take an imageDataUrl; nothing new needed on the generation
// side). Uses a personal access token the user pastes in (figma.com,
// Settings -> Personal access tokens) rather than a registered Figma
// OAuth App -- same "no fake OAuth automation" posture as Voiie and the
// GitHub push feature.
//
// v1 scope, stated honestly in the UI: requires a link to a specific
// frame/selection (Figma's "Copy link to selection", which includes a
// node-id) rather than any arbitrary file link -- rendering an
// auto-picked "best" frame from a whole file is a fuzzier, less reliable
// feature than this.
export const maxDuration = 30;

function parseFigmaUrl(raw: string): { fileKey: string; nodeId: string } | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (!url.hostname.includes("figma.com")) return null;

  const match = url.pathname.match(/\/(file|design)\/([a-zA-Z0-9]+)/);
  if (!match) return null;
  const fileKey = match[2];

  const nodeParam = url.searchParams.get("node-id");
  if (!nodeParam) return null;
  // Figma's URL form uses "-" where the API wants ":" (e.g. "12-34" -> "12:34").
  const nodeId = nodeParam.includes(":") ? nodeParam : nodeParam.replace("-", ":");

  return { fileKey, nodeId };
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });

  let figmaUrl = "", token = "";
  try {
    const body = await req.json();
    figmaUrl = (body?.figmaUrl ?? "").toString().trim();
    token = (body?.token ?? "").toString().trim();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!figmaUrl || !token) {
    return Response.json({ error: "Both a Figma link and a personal access token are required." }, { status: 400 });
  }

  const parsed = parseFigmaUrl(figmaUrl);
  if (!parsed) {
    return Response.json(
      { error: "That doesn't look like a link to a specific frame. In Figma, right-click the frame you want and choose \"Copy link to selection\"." },
      { status: 400 }
    );
  }

  try {
    const imagesRes = await fetch(
      `https://api.figma.com/v1/images/${parsed.fileKey}?ids=${encodeURIComponent(parsed.nodeId)}&format=png&scale=2`,
      { headers: { "X-Figma-Token": token } }
    );
    if (imagesRes.status === 403 || imagesRes.status === 401) {
      return Response.json({ error: "That token was rejected by Figma. Check it's correct and has access to this file." }, { status: 400 });
    }
    if (!imagesRes.ok) {
      return Response.json({ error: `Figma returned an error (${imagesRes.status}).` }, { status: 502 });
    }
    const imagesJson = await imagesRes.json();
    if (imagesJson?.err) {
      return Response.json({ error: `Figma error: ${imagesJson.err}` }, { status: 400 });
    }
    const imageUrl = imagesJson?.images?.[parsed.nodeId];
    if (!imageUrl) {
      return Response.json({ error: "Couldn't find that frame. Make sure the link points to a specific frame or layer, not the whole file." }, { status: 400 });
    }

    const pngRes = await fetch(imageUrl);
    if (!pngRes.ok) {
      return Response.json({ error: "Failed to download the rendered frame from Figma." }, { status: 502 });
    }
    const arrayBuffer = await pngRes.arrayBuffer();
    if (arrayBuffer.byteLength > 4_000_000) {
      return Response.json({ error: "That frame is too large to import. Try a smaller selection." }, { status: 400 });
    }
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    return Response.json({ imageDataUrl: `data:image/png;base64,${base64}` });
  } catch (error: any) {
    console.error("[figma render] failed:", error.message);
    return Response.json({ error: "Failed to import from Figma. Please try again." }, { status: 500 });
  }
}
