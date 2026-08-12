import { NextResponse } from "next/server"
export const runtime = "nodejs"
export async function GET() {
  return NextResponse.redirect("https://gysm.io")
}
