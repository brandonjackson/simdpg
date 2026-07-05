import { randomUUID } from "node:crypto";
import { resolveFormWebhook } from "@/lib/form-webhooks";
import { writeEvents, type SimulationEvent } from "./events";

/**
 * v1 placeholder for the #54 SimulationEvents Generator: emits a few national-ID
 * applications spaced 5 real seconds apart so the create -> generate -> start ->
 * complete flow is exercisable end to end. #54 replaces this module wholesale.
 */
export async function generateStubEvents(id: string): Promise<SimulationEvent[]> {
  const resolved = await resolveFormWebhook("national-id");
  const targetUrl = resolved?.url ?? null;

  const events: SimulationEvent[] = [0, 1, 2].map((i) => ({
    id: randomUUID(),
    scheduledMicros: i * 5_000_000,
    targetKey: "national-id",
    targetUrl,
    payload: {
      given_name: "Sim",
      family_name: `Citizen${i + 1}`,
      date_of_birth: "1990-01-01",
      sex: "female",
      address_line_1: "1 Test Street",
      city: "Testville",
      postal_code: "00000",
      email: `sim.citizen${i + 1}@example.test`,
      phone_number: "+10000000000",
    },
  }));

  await writeEvents(id, events);
  return events;
}
