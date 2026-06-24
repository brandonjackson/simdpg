import { NextRequest, NextResponse } from "next/server";
import { isFormHookKey, getFormHook } from "@/lib/form-hooks";
import { submitForm } from "@/lib/form-submission";

export const dynamic = "force-dynamic";
// Workflows may make several sequential API calls before replying; allow headroom.
export const maxDuration = 60;

/**
 * POST /api/forms/[key]
 *
 * The central submission point for portal service forms. Looks up the webhook
 * URL registered for the form hook `key` (staff area → Webhook registration) and
 * forwards the submission to it, returning the workflow's reply unchanged.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { key: string } },
) {
  const { key } = params;
  if (!isFormHookKey(key)) {
    return NextResponse.json({ error: "Unknown form" }, { status: 404 });
  }

  const rawBody = await request.text();
  const outcome = await submitForm(key, rawBody);

  if (!outcome.ok) {
    if (outcome.reason === "unconfigured") {
      const name = getFormHook(key)?.name ?? key;
      return NextResponse.json(
        {
          error: `No webhook is registered for "${name}". Register one in the staff area under Webhook registration.`,
        },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: "The configured webhook is unreachable. Please try again." },
      { status: 502 },
    );
  }

  return new NextResponse(outcome.body, {
    status: outcome.status,
    headers: { "Content-Type": outcome.contentType },
  });
}
