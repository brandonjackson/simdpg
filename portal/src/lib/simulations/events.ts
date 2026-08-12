/**
 * Portal's view of the shared events contract (see
 * simulation/src/engine/events.ts). Storage lives in ./script.ts.
 */
export interface SimulationEvent {
  id: string;
  scheduledMicros: number;
  targetKey: string;
  targetUrl: string | null;
  payload: unknown;
}
