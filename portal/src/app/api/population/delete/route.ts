import { NextResponse } from "next/server";
import { SYSTEM_URLS } from "@simdpg/api-clients";
import { addRun } from "@/lib/population/runs";

export const dynamic = "force-dynamic";

const SYSTEMS: { label: string; url: string }[] = [
  { label: "Identity", url: SYSTEM_URLS.identity },
  { label: "Civil Registry", url: SYSTEM_URLS.civilRegistry },
  { label: "Health", url: SYSTEM_URLS.health },
  { label: "Benefits", url: SYSTEM_URLS.benefits },
  { label: "Notifications", url: SYSTEM_URLS.notifications },
  { label: "Social Registry", url: SYSTEM_URLS.socialRegistry },
];

export async function POST() {
  const reset: string[] = [];
  const failed: string[] = [];

  await Promise.all(
    SYSTEMS.map(async ({ label, url }) => {
      try {
        const res = await fetch(`${url}/admin/reset`, {
          method: "POST",
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        reset.push(label);
      } catch {
        failed.push(label);
      }
    }),
  );

  const outcome =
    failed.length === 0 ? "success" : reset.length > 0 ? "partial" : "failed";

  const run = await addRun({
    type: "delete",
    outcome,
    message:
      failed.length > 0
        ? `Wiped: ${reset.join(", ") || "none"}. Failed: ${failed.join(", ")}.`
        : `Wiped all data across ${reset.length} systems (benefit programmes preserved).`,
  });

  return NextResponse.json({ reset, failed, run });
}
