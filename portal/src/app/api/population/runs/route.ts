import { NextResponse } from "next/server";
import { listRuns } from "@/lib/population/runs";

export const dynamic = "force-dynamic";

export async function GET() {
  const runs = await listRuns();
  return NextResponse.json({ runs });
}
