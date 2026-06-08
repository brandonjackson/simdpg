"use client";

import { useState } from "react";
import type { SystemEndpoint } from "@/lib/systems-registry";
import ApiSandbox from "./ApiSandbox";

export interface SandboxSystem {
  id: string;
  name: string;
  port: number;
  built: boolean;
  buildingBlock: string;
  endpoints: SystemEndpoint[];
}

export default function SandboxConsole({
  systems,
}: {
  systems: SandboxSystem[];
}) {
  const [activeId, setActiveId] = useState<string>(
    systems.find((s) => s.built)?.id ?? systems[0]?.id ?? "",
  );

  const active = systems.find((s) => s.id === activeId);

  return (
    <div>
      <div className="govuk-form-group">
        <label className="govuk-label govuk-label--s" htmlFor="sandbox-system">
          System
        </label>
        <select
          id="sandbox-system"
          className="govuk-select"
          value={activeId}
          onChange={(e) => setActiveId(e.target.value)}
          style={{ width: "100%", maxWidth: "100%" }}
        >
          {systems.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} (:{s.port}) — {s.buildingBlock}
              {s.built ? "" : " — sketch, not running"}
            </option>
          ))}
        </select>
      </div>

      {active && (
        <ApiSandbox
          // Remount when the system changes so request/response state resets.
          key={active.id}
          systemId={active.id}
          systemName={active.name}
          port={active.port}
          endpoints={active.endpoints}
          disabled={!active.built}
        />
      )}
    </div>
  );
}
