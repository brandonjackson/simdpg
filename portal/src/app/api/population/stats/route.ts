import { NextResponse } from "next/server";
import { SYSTEM_URLS } from "@simdpg/api-clients";

export const dynamic = "force-dynamic";

const SYSTEMS: { key: string; url: string }[] = [
  { key: "identity", url: SYSTEM_URLS.identity },
  { key: "civilRegistry", url: SYSTEM_URLS.civilRegistry },
  { key: "health", url: SYSTEM_URLS.health },
  { key: "benefits", url: SYSTEM_URLS.benefits },
  { key: "notifications", url: SYSTEM_URLS.notifications },
  { key: "socialRegistry", url: SYSTEM_URLS.socialRegistry },
];

const LABELS: Record<string, string> = {
  identity: "Identity",
  civilRegistry: "Civil Registry",
  health: "Health",
  benefits: "Benefits",
  notifications: "Notifications",
  socialRegistry: "Social Registry",
};

export async function GET() {
  const stats: Record<string, Record<string, number>> = {};
  const errors: string[] = [];

  await Promise.all(
    SYSTEMS.map(async ({ key, url }) => {
      try {
        const res = await fetch(`${url}/admin/stats`, { cache: "no-store" });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = await res.json();
        delete data.system;
        stats[key] = data;
      } catch {
        errors.push(`${LABELS[key]} system unavailable`);
      }
    }),
  );

  return NextResponse.json({ stats, errors });
}
