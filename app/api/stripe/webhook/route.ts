import { NextRequest, NextResponse } from "next/server"
export const runtime = "nodejs"
export async function POST(req: NextRequest) {
  return NextResponse.json({ ok: true })
}
export async function GET() {
  return NextResponse.json({ ok: true, webhook: "gysm.io" })
}
