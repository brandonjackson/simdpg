import { NextRequest, NextResponse } from "next/server";
import { normalizeConfig, summarizeConfig } from "@/lib/population/config";
import { generatePopulation } from "@/lib/population/generator";
import { addRun } from "@/lib/population/runs";

export const dynamic = "force-dynamic";
// Generation can issue many sequential API calls; allow extra time.
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const config = normalizeConfig((body as { config?: unknown })?.config ?? body);

  try {
    const result = await generatePopulation(config);
    const outcome =
      result.errors === 0
        ? "success"
        : result.citizens > 0
          ? "partial"
          : "failed";

    const run = await addRun({
      type: "generate",
      outcome,
      configSummary: summarizeConfig(config),
      config,
      result,
      message:
        outcome === "failed"
          ? "No citizens were created — are the systems running?"
          : undefined,
    });

    return NextResponse.json({ config, result, run });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    const run = await addRun({
      type: "generate",
      outcome: "failed",
      configSummary: summarizeConfig(config),
      config,
      message,
    });
    return NextResponse.json({ error: message, run }, { status: 500 });
  }
}
