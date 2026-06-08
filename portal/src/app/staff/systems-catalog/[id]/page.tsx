import { notFound } from "next/navigation";
import {
  SYSTEMS,
  STATUS_BADGE,
  methodColour,
  getSystemById,
} from "@/lib/systems-registry";
import ApiSandbox from "@/components/ApiSandbox";

export function generateStaticParams() {
  return SYSTEMS.map((s) => ({ id: s.id }));
}

export default async function SystemDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const system = getSystemById(id);
  if (!system) notFound();

  return (
    <>
      <nav className="govuk-breadcrumbs" aria-label="Breadcrumb">
        <ol className="govuk-breadcrumbs__list">
          <li className="govuk-breadcrumbs__list-item">
            <a className="govuk-breadcrumbs__link" href="/">
              Home
            </a>
          </li>
          <li className="govuk-breadcrumbs__list-item">
            <a className="govuk-breadcrumbs__link" href="/staff">
              Staff area
            </a>
          </li>
          <li className="govuk-breadcrumbs__list-item">
            <a className="govuk-breadcrumbs__link" href="/staff/systems-catalog">
              Systems catalog
            </a>
          </li>
          <li className="govuk-breadcrumbs__list-item">{system.name}</li>
        </ol>
      </nav>

      <h1 className="govuk-heading-xl">
        <span
          className={`govuk-tag govuk-tag--${system.tagColour}`}
          style={{ marginRight: "10px", verticalAlign: "middle" }}
        >
          :{system.port}
        </span>
        {system.name}
        <span
          className={`govuk-tag ${STATUS_BADGE[system.status].colour}`}
          style={{ marginLeft: "10px", verticalAlign: "middle" }}
        >
          {STATUS_BADGE[system.status].label}
        </span>
      </h1>
      <p className="govuk-body-s" style={{ color: "#505a5f" }}>
        <strong>Building block:</strong> {system.buildingBlock} &nbsp;·&nbsp;{" "}
        <strong>Tech stack:</strong> {system.techStack}
      </p>

      {system.sketch && (
        <div
          className="govuk-warning-text"
          style={{
            border: "5px solid #d4351c",
            padding: "15px",
            marginBottom: "20px",
          }}
        >
          <strong>Sketch only — not a working system.</strong>{" "}
          {system.sketchNote} Data models, endpoints, and webhooks below are
          <em> proposed</em>, not implemented.
        </div>
      )}

      <p className="govuk-body-l">{system.summary}</p>
      <p className="govuk-body">{system.description}</p>

      {/* ── Interactive API sandbox ── */}
      <h2 className="govuk-heading-l">Interactive API sandbox</h2>
      <ApiSandbox
        systemId={system.id}
        systemName={system.name}
        port={system.port}
        endpoints={system.endpoints}
        disabled={system.status !== "built"}
      />

      {system.status === "built" && (
        <p className="govuk-body-s">
          Prefer the full OpenAPI experience? See{" "}
          <a
            className="govuk-link"
            href={`http://localhost:${system.port}/docs`}
            target="_blank"
            rel="noreferrer"
          >
            interactive docs
          </a>
          , the{" "}
          <a
            className="govuk-link"
            href={`http://localhost:${system.port}/openapi.yaml`}
            target="_blank"
            rel="noreferrer"
          >
            raw spec
          </a>
          , or the{" "}
          <a
            className="govuk-link"
            href={`http://localhost:${system.port}/admin/webhooks`}
            target="_blank"
            rel="noreferrer"
          >
            webhook event log
          </a>
          .
        </p>
      )}

      {system.config && (
        <>
          <h2 className="govuk-heading-l">Random failure simulation</h2>
          <p className="govuk-body">{system.config}</p>
          <table className="govuk-table">
            <thead>
              <tr>
                <th className="govuk-table__header" style={{ width: "30%" }}>
                  Failure code
                </th>
                <th className="govuk-table__header">Meaning</th>
              </tr>
            </thead>
            <tbody>
              {system.failureModes?.map((fm) => (
                <tr key={fm.code}>
                  <td className="govuk-table__cell">
                    <code>{fm.code}</code>
                  </td>
                  <td className="govuk-table__cell">{fm.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h2 className="govuk-heading-l">
        Data model{system.sketch ? " (proposed)" : ""}
      </h2>
      {system.entities.map((entity) => (
        <div
          key={entity.name}
          style={{
            borderLeft: "5px solid #1d70b8",
            paddingLeft: "15px",
            marginBottom: "20px",
          }}
        >
          <p className="govuk-body" style={{ marginBottom: "5px" }}>
            <strong>{entity.name}</strong>
          </p>
          <p
            className="govuk-body-s"
            style={{ marginBottom: "0", color: "#505a5f" }}
          >
            {entity.fields}
          </p>
        </div>
      ))}

      <h2 className="govuk-heading-l">
        API endpoints{system.sketch ? " (proposed)" : ""}
      </h2>
      <table className="govuk-table">
        <thead>
          <tr>
            <th className="govuk-table__header" style={{ width: "10%" }}>
              Method
            </th>
            <th className="govuk-table__header" style={{ width: "35%" }}>
              Path
            </th>
            <th className="govuk-table__header">Description</th>
          </tr>
        </thead>
        <tbody>
          {system.endpoints.map((ep) => (
            <tr key={`${ep.method}-${ep.path}`}>
              <td className="govuk-table__cell">
                <span
                  className={`govuk-tag ${methodColour(ep.method)}`}
                  style={{ fontSize: "12px" }}
                >
                  {ep.method}
                </span>
              </td>
              <td className="govuk-table__cell">
                <code style={{ fontSize: "14px" }}>{ep.path}</code>
              </td>
              <td className="govuk-table__cell">{ep.description}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="govuk-heading-l">
        Webhook events{system.sketch ? " (proposed)" : ""}
      </h2>
      <table className="govuk-table">
        <thead>
          <tr>
            <th className="govuk-table__header" style={{ width: "30%" }}>
              Event
            </th>
            <th className="govuk-table__header">Description</th>
          </tr>
        </thead>
        <tbody>
          {system.webhooks.map((wh) => (
            <tr key={wh.event}>
              <td className="govuk-table__cell">
                <code>{wh.event}</code>
              </td>
              <td className="govuk-table__cell">{wh.description}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="govuk-heading-l">Cross-system relationships</h2>
      <ul className="govuk-list govuk-list--bullet">
        {system.relationships.map((rel, i) => (
          <li key={i}>{rel}</li>
        ))}
      </ul>

      <p className="govuk-body-s" style={{ color: "#505a5f" }}>
        <strong>Seed data:</strong> {system.seedData}
      </p>

      <hr className="govuk-section-break govuk-section-break--l govuk-section-break--visible" />

      <p className="govuk-body-s">
        <a href="/staff/systems-catalog" className="govuk-link">
          Back to systems catalog
        </a>
      </p>
    </>
  );
}
