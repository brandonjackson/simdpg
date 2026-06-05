"use client";

import { useState } from "react";

interface Citizen {
  id: string;
  national_id: string;
  given_name: string;
  family_name: string;
  date_of_birth: string;
  sex: string;
  status: string;
}

export default function StaffSearch() {
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<Citizen[] | null>(null);
  const [searched, setSearched] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    setSearched(true);

    try {
      const params = new URLSearchParams();
      if (name) params.set("name", name);
      if (dob) params.set("dob", dob);

      const res = await fetch(
        `/api/proxy/identity/citizens/search?${params.toString()}`
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Search failed");
      }
      const data = await res.json();
      setResults(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Search failed");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <a href="/staff" className="govuk-back-link">
        Back
      </a>

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
          <li className="govuk-breadcrumbs__list-item">Search citizens</li>
        </ol>
      </nav>

      <h1 className="govuk-heading-xl">Search citizens</h1>

      {error && (
        <div className="govuk-error-summary" role="alert">
          <h2 className="govuk-error-summary__title">There is a problem</h2>
          <ul className="govuk-error-summary__list">
            <li>{error}</li>
          </ul>
        </div>
      )}

      <form onSubmit={handleSearch}>
        <div className="govuk-form-group">
          <label className="govuk-label" htmlFor="search-name">
            Name
          </label>
          <div className="govuk-hint">
            Enter a given name, family name, or partial name.
          </div>
          <input
            className="govuk-input govuk-input--width-20"
            id="search-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>

        <div className="govuk-form-group">
          <label className="govuk-label" htmlFor="search-dob">
            Date of birth
          </label>
          <div className="govuk-hint">Optional. Format: YYYY-MM-DD</div>
          <input
            className="govuk-input govuk-input--width-10"
            id="search-dob"
            type="date"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
          />
        </div>

        <button className="govuk-button" type="submit" disabled={loading}>
          {loading ? "Searching..." : "Search"}
        </button>
      </form>

      {loading && <div className="govuk-loading">Searching</div>}

      {searched && results !== null && !loading && (
        <>
          <hr className="govuk-section-break govuk-section-break--l govuk-section-break--visible" />

          <h2 className="govuk-heading-l">
            {results.length === 0
              ? "No results found"
              : `${results.length} result${results.length === 1 ? "" : "s"} found`}
          </h2>

          {results.length > 0 && (
            <table className="govuk-table">
              <thead>
                <tr>
                  <th className="govuk-table__header">Name</th>
                  <th className="govuk-table__header">National ID</th>
                  <th className="govuk-table__header">Date of birth</th>
                  <th className="govuk-table__header">Sex</th>
                  <th className="govuk-table__header">Status</th>
                  <th className="govuk-table__header">Action</th>
                </tr>
              </thead>
              <tbody>
                {results.map((c) => (
                  <tr key={c.id}>
                    <td className="govuk-table__cell">
                      {c.given_name} {c.family_name}
                    </td>
                    <td className="govuk-table__cell">{c.national_id}</td>
                    <td className="govuk-table__cell">{c.date_of_birth}</td>
                    <td className="govuk-table__cell">
                      {c.sex.charAt(0).toUpperCase() + c.sex.slice(1)}
                    </td>
                    <td className="govuk-table__cell">
                      <span
                        className={`govuk-tag ${c.status === "alive" ? "govuk-tag--green" : "govuk-tag--grey"}`}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="govuk-table__cell">
                      <a
                        href={`/staff/citizen/${c.id}`}
                        className="govuk-link"
                      >
                        View timeline
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </>
  );
}
