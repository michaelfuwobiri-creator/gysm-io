import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { getBrandKit, upsertBrandKit, type BrandKit } from "@/lib/brandKit";

// GET/PUT the signed-in user's one Brand Kit row (see lib/brandKit.ts).
// Same getUser()-gated, per-user-row shape as every other personal
// settings resource in this app (credits, api keys) -- not project- or
// chat-scoped.

export async function GET() {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }
  const kit = await getBrandKit(user.id);
  return Response.json({ kit });
}

const MAX_LOGO_BYTES = 2_000_000; // ~2MB -- logo is stored inline (data: URL or hosted URL), keep it small

export async function PUT(req: NextRequest) {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: Partial<BrandKit> = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const logoUrl = (body.logoUrl ?? "").toString();
  if (logoUrl.length > MAX_LOGO_BYTES) {
    return Response.json({ error: "Logo is too large (max ~2MB)." }, { status: 400 });
  }

  const kit: BrandKit = {
    name: (body.name ?? "").toString().trim().slice(0, 80) || null,
    primaryColor: (body.primaryColor ?? "").toString().trim().slice(0, 20) || null,
    secondaryColor: (body.secondaryColor ?? "").toString().trim().slice(0, 20) || null,
    fontFamily: (body.fontFamily ?? "").toString().trim().slice(0, 80) || null,
    logoUrl: logoUrl || null,
  };

  await upsertBrandKit(user.id, kit);
  return Response.json({ kit });
}
