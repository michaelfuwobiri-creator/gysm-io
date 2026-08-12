import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const projects = await prisma.project.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return NextResponse.json({ projects });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, full: String(e) }, { status: 200 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { prompt, code, previewHtml, plan, userId } = await req.json();
    if (!prompt || !code) return NextResponse.json({ error: "Missing prompt/code" }, { status: 400 });
    const project = await prisma.project.create({
      data: {
        prompt,
        code,
        previewHtml: previewHtml || code,
        plan: plan || "free",
        userId: userId || "anon",
      },
    });
    return NextResponse.json(project);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}