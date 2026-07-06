import { NextResponse } from "next/server";
import { SYSTEM_URLS } from "@simdpg/api-clients";

type MarriagePayload = {
  spouse_1_citizen_id: string;
  spouse_2_citizen_id: string;
  date_of_marriage: string;
  place_of_marriage: string;
};

async function safeJson(res: Response) {
  try {
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  } catch {
    return { text: await res.text() };
  }
}

async function getHousehold(citizenId: string) {
  try {
    const res = await fetch(`${SYSTEM_URLS.identity}/citizens/${encodeURIComponent(citizenId)}/household`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function getCitizen(citizenId: string) {
  try {
    const res = await fetch(`${SYSTEM_URLS.identity}/citizens/${encodeURIComponent(citizenId)}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function processApplication(payload: MarriagePayload) {
  const summary: {
    createdMarriage: unknown | null;
    householdUpdates: any[];
    eligibilityResults: any[];
    notifications: any[] | Record<string, unknown>;
  } = { createdMarriage: null, householdUpdates: [], eligibilityResults: [], notifications: [] };

  let hadError = false;

  try {
    const civilRes = await fetch(`${SYSTEM_URLS.civilRegistry}/marriages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const civilBody = await safeJson(civilRes);
    summary.createdMarriage = { ok: civilRes.ok, status: civilRes.status, body: civilBody };
    if (!civilRes.ok) hadError = true;
  } catch (err) {
    summary.createdMarriage = { error: err instanceof Error ? err.message : String(err) };
    hadError = true;
  }

  const h1 = await getHousehold(payload.spouse_1_citizen_id);
  const h2 = await getHousehold(payload.spouse_2_citizen_id);

  try {
    if (h1 && !h2) {
      const r = await fetch(`${SYSTEM_URLS.identity}/households/${encodeURIComponent(h1.household_id)}/members`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          add: [
            {
              citizen_id: payload.spouse_2_citizen_id,
              relationship: "spouse",
            },
          ],
        }),
      });
      const body = await safeJson(r);
      summary.householdUpdates.push({ action: "add-to-h1", ok: r.ok, status: r.status, body });
      if (!r.ok) hadError = true;
    } else if (!h1 && h2) {
      const r = await fetch(`${SYSTEM_URLS.identity}/households/${encodeURIComponent(h2.household_id)}/members`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          add: [
            {
              citizen_id: payload.spouse_1_citizen_id,
              relationship: "spouse",
            },
          ],
        }),
      });
      const body = await safeJson(r);
      summary.householdUpdates.push({ action: "add-to-h2", ok: r.ok, status: r.status, body });
      if (!r.ok) hadError = true;
    } else if (h1 && h2 && h1.household_id !== h2.household_id) {
      const membersToAdd = (h2.members ?? [])
        .filter((m: any) => !(h1.members ?? []).some((x: any) => x.citizen_id === m.citizen_id))
        .map((m: any) => ({ citizen_id: m.citizen_id, relationship: m.relationship || "other" }));

      if (membersToAdd.length > 0) {
        const addResp = await fetch(`${SYSTEM_URLS.identity}/households/${encodeURIComponent(h1.household_id)}/members`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            add: membersToAdd,
          }),
        });
        const addBody = await safeJson(addResp);
        summary.householdUpdates.push({ action: "merge-h2-into-h1", ok: addResp.ok, status: addResp.status, added: membersToAdd.length, body: addBody });
        if (!addResp.ok) {
          hadError = true;
        } else {
          try {
            const removeIds = membersToAdd.map((m: any) => m.citizen_id);
            const removeResp = await fetch(`${SYSTEM_URLS.identity}/households/${encodeURIComponent(h2.household_id)}/members`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                add: [],
                remove: removeIds,
              }),
            });
            const removeBody = await safeJson(removeResp);
            summary.householdUpdates.push({ action: "remove-from-h2", ok: removeResp.ok, status: removeResp.status, removed: removeIds.length, body: removeBody });
            if (!removeResp.ok) hadError = true;
          } catch (err) {
            summary.householdUpdates.push({ action: "remove-from-h2", error: err instanceof Error ? err.message : String(err) });
            hadError = true;
          }
        }
      } else {
        summary.householdUpdates.push({ action: "merge-h2-into-h1", ok: true, status: 200, added: 0 });
      }
    } else {
      summary.householdUpdates.push({ action: "no-change", reason: "both have same household or neither has household" });
    }
  } catch (err) {
    summary.householdUpdates.push({ error: err instanceof Error ? err.message : String(err) });
    hadError = true;
  }

  try {
    const programsRes = await fetch(`${SYSTEM_URLS.benefits}/programs`);
    const programsBody = await safeJson(programsRes);
    const programs = Array.isArray(programsBody?.data) ? programsBody.data : programsBody?.data ?? [];

    for (const cid of [payload.spouse_1_citizen_id, payload.spouse_2_citizen_id]) {
      const results: any[] = [];
      for (const p of programs) {
        try {
          const r = await fetch(`${SYSTEM_URLS.benefits}/eligibility/check`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ citizen_id: cid, program_id: p.id }),
          });
          const body = await safeJson(r);
          results.push({ program_id: p.id, ok: r.ok, status: r.status, body });
          if (!r.ok) hadError = true;
        } catch (err) {
          results.push({ program_id: p.id, error: err instanceof Error ? err.message : String(err) });
          hadError = true;
        }
      }
      summary.eligibilityResults.push({ citizen_id: cid, results });
    }
  } catch (err) {
    summary.eligibilityResults.push({ error: err instanceof Error ? err.message : String(err) });
  }

  try {
    const spouse1 = await getCitizen(payload.spouse_1_citizen_id);
    const spouse2 = await getCitizen(payload.spouse_2_citizen_id);
    const notifs: any[] = [];

    for (const c of [spouse1, spouse2]) {
      if (!c) {
        notifs.push({ citizen_id: c?.id ?? null, error: "citizen not found" });
        continue;
      }

      const channel = c.email ? "email" : c.phone_number ? "sms" : null;
      const destination = c.email ?? c.phone_number ?? null;
      if (!channel || !destination) {
        notifs.push({ citizen_id: c.id, skipped: true, reason: "no contact" });
        continue;
      }

      const bodyText = `Your marriage was registered on ${payload.date_of_marriage} at ${payload.place_of_marriage}.`;
      try {
        const r = await fetch(`${SYSTEM_URLS.notifications}/notifications`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            citizen_id: c.id,
            channel,
            destination,
            subject: "Marriage registered",
            body: bodyText,
            source_system: "portal",
            source_event: "marriage.registered",
          }),
        });
        const body = await safeJson(r);
        notifs.push({ citizen_id: c.id, ok: r.ok, status: r.status, body });
        if (!r.ok) hadError = true;
      } catch (err) {
        notifs.push({ citizen_id: c.id, error: err instanceof Error ? err.message : String(err) });
        hadError = true;
      }
    }

    summary.notifications = notifs;
  } catch (err) {
    summary.notifications = { error: err instanceof Error ? err.message : String(err) };
  }

  if (hadError) {
    return NextResponse.json({ forwarded: false, summary, error: "one or more downstream operations failed" }, { status: 502 });
  }

  return NextResponse.json({ forwarded: false, summary });
}
