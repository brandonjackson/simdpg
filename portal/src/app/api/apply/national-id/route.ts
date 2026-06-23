import { NextRequest, NextResponse } from "next/server";
import { ApiError } from "@simdpg/api-clients";
import {
  processApplication,
  validateApplication,
  type NationalIdApplication,
} from "@/lib/national-id";

export const dynamic = "force-dynamic";
// Searching, creating, and notifying are sequential API calls; allow headroom.
export const maxDuration = 60;

/**
 * POST /api/apply/national-id
 *
 * Entry point for the "Apply for a national ID" form. When the
 * `OPENFN_NATIONAL_ID_WEBHOOK_URL` env var is set, the application is handed to
 * the OpenFn workflow (the real integration path). Otherwise we run the same
 * deduplicate-and-create orchestration here so the form works before OpenFn is
 * connected. The request body is the same in both cases, so the simulation can
 * trigger the workflow without going through the form (see simulation/apply).
 */
export async function POST(request: NextRequest) {
  let body: Partial<NationalIdApplication>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const problems = validateApplication(body);
  if (problems.length > 0) {
    return NextResponse.json({ error: problems.join("; ") }, { status: 400 });
  }

  const application = body as NationalIdApplication;
  const webhookUrl = process.env.OPENFN_NATIONAL_ID_WEBHOOK_URL;

  // Path 1: forward to the OpenFn workflow and return its response.
  if (webhookUrl) {
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(application),
      });
      const data = await res.text();
      return new NextResponse(data, {
        status: res.status,
        headers: {
          "Content-Type": res.headers.get("Content-Type") || "application/json",
        },
      });
    } catch {
      return NextResponse.json(
        {
          error:
            "The OpenFn workflow is unavailable. The application has been queued for retry.",
        },
        { status: 503 },
      );
    }
  }

  // Path 2: no webhook configured -> run the orchestration directly.
  try {
    const result = await processApplication(application);
    const status = result.status === "queued" ? 503 : 200;
    return NextResponse.json(result, { status });
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json(err.body, { status: err.status });
    }
    return NextResponse.json({ error: "Identity service unavailable" }, { status: 502 });
  }
}
