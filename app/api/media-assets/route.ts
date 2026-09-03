import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { listAssets, createAsset, ASSET_CATEGORIES, type AssetCategory } from "@/lib/mediaAssets";

// GET -- list the signed-in user's saved Cast/Settings/Objects (see
// lib/mediaAssets.ts). POST -- save a new one. Same getUser()-gated,
// per-user-row shape as /api/brand-kit.

export async function GET() {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }
  const assets = await listAssets(user.id);
  return Response.json({ assets });
}

const MAX_IMAGE_BYTES = 2_000_000; // ~2MB -- stored inline (data: URL or hosted URL)

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const category = (body?.category ?? "").toString().trim() as AssetCategory;
  const name = (body?.name ?? "").toString().trim().slice(0, 80);
  const referenceImageUrl = (body?.referenceImageUrl ?? "").toString();

  if (!ASSET_CATEGORIES.includes(category)) {
    return Response.json({ error: `category must be one of: ${ASSET_CATEGORIES.join(", ")}` }, { status: 400 });
  }
  if (!name) {
    return Response.json({ error: "A name is required." }, { status: 400 });
  }
  if (!referenceImageUrl) {
    return Response.json({ error: "A reference image is required." }, { status: 400 });
  }
  if (referenceImageUrl.length > MAX_IMAGE_BYTES) {
    return Response.json({ error: "Reference image is too large (max ~2MB)." }, { status: 400 });
  }

  const asset = await createAsset(user.id, category, name, referenceImageUrl);
  return Response.json({ asset });
}
