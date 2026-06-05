export default function Home() {
  const services = [
    {
      title: "Register a birth",
      description:
        "Register the birth of a child with the civil registry.",
      href: "/births",
    },
    {
      title: "Register a death",
      description:
        "Register a death and obtain a death certificate reference.",
      href: "/deaths",
    },
    {
      title: "Register a marriage",
      description:
        "Register a marriage between two citizens.",
      href: "/marriages",
    },
    {
      title: "Book a vaccination",
      description:
        "Record a vaccination for a registered patient.",
      href: "/vaccinations",
    },
    {
      title: "Apply for a benefit",
      description:
        "Check eligibility and enroll in a benefits programme.",
      href: "/benefits",
    },
    {
      title: "Check my record",
      description:
        "View your personal record across all government services.",
      href: "/record",
    },
    {
      title: "My notifications",
      description:
        "View messages sent to you by government services.",
      href: "/notifications",
    },
  ];

  return (
    <>
      <h1 className="govuk-heading-xl">Government services</h1>
      <p className="govuk-body-l">
        Use this portal to access SimDPG government services, including civil
        registration, health, and benefits.
      </p>

      <div className="govuk-card-grid">
        {services.map((s) => (
          <div className="govuk-card" key={s.href}>
            <h2 className="govuk-card__title">
              <a href={s.href} className="govuk-link">
                {s.title}
              </a>
            </h2>
            <p className="govuk-card__description">{s.description}</p>
          </div>
        ))}
      </div>

      <hr className="govuk-section-break govuk-section-break--l govuk-section-break--visible" />

      <p className="govuk-body-s">
        <a href="/staff" className="govuk-link">
          Staff area
        </a>{" "}
        &mdash; for authorised government staff only.
      </p>
    </>
  );
}
