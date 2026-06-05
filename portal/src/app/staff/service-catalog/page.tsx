export default function ServiceCatalog() {
  const services = [
    {
      id: "birth-registration",
      name: "Birth Registration",
      description:
        "Register the birth of a child, creating official civil registry records and initiating downstream enrolments.",
      customerJourney: [
        "Parent or authorised person visits the portal and selects 'Register a birth'.",
        "Enters the child's details: given name, family name, date of birth, sex.",
        "Enters the mother's national ID (looked up from Identity service).",
        "Optionally enters the father's national ID.",
        "Enters the place of birth.",
        "Reviews the details and submits the registration.",
        "Receives a birth certificate reference number on a confirmation page.",
      ],
      systems: [
        {
          name: "Civil Registry",
          role: "Primary. Stores the birth record with parent references, date, and place of birth.",
          port: 3002,
        },
        {
          name: "Identity",
          role: "Creates a new citizen record for the child (assigned a SIM-XXXXXX national ID). Updates household membership.",
          port: 3001,
        },
        {
          name: "Health",
          role: "Registers the newborn as a patient and creates the initial vaccination schedule.",
          port: 3003,
        },
        {
          name: "Benefits",
          role: "Checks child benefit eligibility and auto-enrols the child if eligible.",
          port: 3004,
        },
      ],
      simulationWorkflows: [
        "The birth.ts simulation script directly orchestrates all services: creates the citizen in Identity, registers them as a patient in Health, and registers the birth in Civil Registry. Rate: ~15 births per 1,000 population per year.",
      ],
      openfnWorkflows: [
        {
          name: "Birth registered -> Create citizen",
          trigger: "Webhook: birth.registered",
          description:
            "When a birth is registered in Civil Registry, create a corresponding citizen record in the Identity service with the child's details.",
        },
        {
          name: "Citizen created (newborn) -> Register patient & schedule vaccinations",
          trigger: "Webhook: citizen.created (where age < 1)",
          description:
            "When a new citizen is created for a newborn, register them as a patient in the Health service and schedule age-appropriate vaccinations (BCG, OPV, DPT, Measles).",
        },
        {
          name: "Citizen created (newborn) -> Check child benefit eligibility",
          trigger: "Webhook: citizen.created (where age < 1)",
          description:
            "When a newborn citizen is created, check eligibility for the Child Benefit programme (monthly payment of 50 for families with children under 5). Enrol automatically if eligible.",
        },
      ],
    },
    {
      id: "death-registration",
      name: "Death Registration",
      description:
        "Register a death, updating civil records and cascading closures across all government services.",
      customerJourney: [
        "Family member or authorised person visits the portal and selects 'Register a death'.",
        "Enters the deceased citizen's national ID to look up their record.",
        "Confirms the citizen's identity from the returned details.",
        "Enters the date, place, and cause of death.",
        "Reviews the details and submits the registration.",
        "Receives a death certificate reference number on a confirmation page.",
      ],
      systems: [
        {
          name: "Civil Registry",
          role: "Primary. Stores the death record with date, place, and cause of death.",
          port: 3002,
        },
        {
          name: "Identity",
          role: "Updates the citizen's status to 'deceased' and records date of death.",
          port: 3001,
        },
        {
          name: "Health",
          role: "Marks the patient record as inactive. Cancels any outstanding vaccination schedules.",
          port: 3003,
        },
        {
          name: "Benefits",
          role: "Terminates all active enrolments. Cancels any pending payments.",
          port: 3004,
        },
      ],
      simulationWorkflows: [
        "The death.ts simulation script updates the citizen status in Identity and registers the death in Civil Registry. Deaths are weighted by age (higher probability for elderly). Rate: ~8 deaths per 1,000 population per year.",
      ],
      openfnWorkflows: [
        {
          name: "Death registered -> Close records across services",
          trigger: "Webhook: death.registered",
          description:
            "When a death is registered, cascade the closure: update citizen status to 'deceased' in Identity, terminate all active benefit enrolments in Benefits, and mark the patient inactive in Health. Cancels any pending payments or scheduled vaccinations.",
        },
      ],
    },
    {
      id: "marriage-registration",
      name: "Marriage Registration",
      description:
        "Register a marriage between two citizens, linking households and re-assessing benefit eligibility.",
      customerJourney: [
        "Couple or authorised registrar visits the portal and selects 'Register a marriage'.",
        "Enters the first spouse's national ID and confirms their identity.",
        "Enters the second spouse's national ID and confirms their identity.",
        "Enters the date and place of marriage.",
        "Reviews the details and submits the registration.",
        "Receives a marriage certificate reference number on a confirmation page.",
      ],
      systems: [
        {
          name: "Civil Registry",
          role: "Primary. Stores the marriage record linking both spouse citizen IDs with date and place.",
          port: 3002,
        },
        {
          name: "Identity",
          role: "Links or merges the two households. Updates household membership records.",
          port: 3001,
        },
        {
          name: "Benefits",
          role: "Re-assesses benefit eligibility for both spouses based on combined household status.",
          port: 3004,
        },
      ],
      simulationWorkflows: [
        "The marriage.ts simulation script pairs unmarried adults (18+) and registers marriages in Civil Registry. Rate: ~7 marriages per 1,000 population per year.",
      ],
      openfnWorkflows: [
        {
          name: "Marriage registered -> Link households & reassess benefits",
          trigger: "Webhook: marriage.registered",
          description:
            "When a marriage is registered, link or merge the two spouses' households in the Identity service. Then re-assess benefit eligibility for both spouses — combined household income or composition may affect programme eligibility.",
        },
      ],
    },
    {
      id: "vaccination",
      name: "Vaccination",
      description:
        "Record vaccinations for patients following age-appropriate schedules, with tracking and follow-up for overdue doses.",
      customerJourney: [
        "Patient or parent visits the portal and selects 'Book a vaccination'.",
        "Enters the citizen's national ID to look up their patient record.",
        "Confirms the patient's identity from the returned details.",
        "Selects the vaccine and dose number from those due on the schedule.",
        "The provider administers the vaccine and records the batch number.",
        "The system records the encounter and vaccination, calculates the next dose due date.",
        "Patient receives confirmation with vaccination details and next appointment date.",
      ],
      systems: [
        {
          name: "Health",
          role: "Primary. Stores vaccination records (vaccine name, dose, batch number, dates) and encounter records. Provides overdue vaccination queries.",
          port: 3003,
        },
        {
          name: "Identity",
          role: "Citizen lookup for patient identification.",
          port: 3001,
        },
      ],
      simulationWorkflows: [
        "The vaccination.ts simulation script follows the standard child vaccine schedule (BCG at birth; OPV at 6 and 12 months; DPT at 2, 4, 6 months; Measles at 9 months and 5 years) and administers annual flu vaccines to citizens aged 65+. Checks existing vaccination history to avoid duplicates.",
      ],
      openfnWorkflows: [
        {
          name: "Vaccination administered -> Update encounter records",
          trigger: "Webhook: vaccination.administered",
          description:
            "When a vaccination is recorded, update the encounter record with completion status and push the vaccination data to the national reporting system.",
        },
        {
          name: "Weekly missed vaccination follow-up",
          trigger: "Scheduled: weekly cron",
          description:
            "Query the Health service for overdue vaccinations (patients who have missed their next-dose-due date). Schedule consultation encounters for follow-up and generate a list for community health workers.",
        },
      ],
    },
    {
      id: "clinic-visit",
      name: "Clinic Visit",
      description:
        "Record clinical encounters including check-ups and consultations, with diagnoses and provider notes.",
      customerJourney: [
        "Patient visits a health facility (clinic or hospital).",
        "Reception looks up the patient by national ID or registers them if first visit.",
        "Patient sees a provider for a check-up or consultation.",
        "Provider records the encounter: type, facility, diagnosis, and notes.",
        "Encounter is saved with a 'completed' status.",
        "Patient receives a summary of their visit.",
      ],
      systems: [
        {
          name: "Health",
          role: "Primary. Stores encounter records with type (checkup/consultation), facility, provider, diagnosis, and status.",
          port: 3003,
        },
        {
          name: "Identity",
          role: "Patient lookup by citizen ID. New patients are registered on first visit.",
          port: 3001,
        },
      ],
      simulationWorkflows: [
        "The clinic-visit.ts simulation script creates encounter records for random citizens at a rate of ~4 visits per citizen per year. Assigns random facilities, providers, and diagnoses. Automatically registers citizens as patients if they don't have a patient record.",
      ],
      openfnWorkflows: [
        {
          name: "Encounter completed -> Update patient records",
          trigger: "Webhook: encounter.completed",
          description:
            "When a clinical encounter is completed, update the patient's record in the Health service and push the encounter data to reporting dashboards.",
        },
      ],
    },
    {
      id: "benefits-application",
      name: "Benefits Application",
      description:
        "Check eligibility for and enrol citizens in benefit programmes including Child Benefit, Senior Pension, and Maternity Grant.",
      customerJourney: [
        "Citizen visits the portal and selects 'Apply for a benefit'.",
        "Enters their national ID to look up their citizen record.",
        "Views the list of available programmes with descriptions.",
        "Selects a programme to check eligibility.",
        "System evaluates eligibility rules (age, household composition, qualifying events).",
        "If eligible, citizen confirms enrolment.",
        "System creates the enrolment and schedules payments (monthly or one-time).",
        "Citizen receives confirmation with enrolment reference and payment schedule.",
      ],
      systems: [
        {
          name: "Benefits",
          role: "Primary. Manages programmes, eligibility rules, enrolments, and payment scheduling. Stores programme definitions (name, rules, payment amount, frequency).",
          port: 3004,
        },
        {
          name: "Identity",
          role: "Citizen lookup for identity verification and age calculation. Provides household information for household-based eligibility.",
          port: 3001,
        },
      ],
      simulationWorkflows: [
        "The benefit-claim.ts simulation script ensures three programmes exist (Child Benefit: 50/month for children under 5; Senior Pension: 200/month for citizens 65+; Maternity Grant: 500 one-time for mothers). Checks eligibility and enrols qualifying citizens, avoiding duplicate enrolments.",
      ],
      openfnWorkflows: [
        {
          name: "Enrolment created -> Schedule payments",
          trigger: "Webhook: enrollment.created",
          description:
            "When a citizen is enrolled in a benefit programme, schedule payments based on the programme rules: monthly payments for recurring programmes (Child Benefit, Senior Pension), or a single payment for one-time grants (Maternity Grant).",
        },
        {
          name: "Daily age-based eligibility changes",
          trigger: "Scheduled: daily cron",
          description:
            "Check for citizens whose age now triggers eligibility changes. Children turning 5 are terminated from Child Benefit. Citizens turning 65 are evaluated for Senior Pension enrolment. Citizens turning 18 may qualify for adult programmes.",
        },
      ],
    },
    {
      id: "notifications",
      name: "Notifications",
      description:
        "Deliver email and SMS notifications to citizens when government service events occur. Tracks delivery status and provides a citizen-facing notification history.",
      customerJourney: [
        "Citizen completes a government service action (e.g. registers a birth, receives a vaccination, enrols in a benefit).",
        "An OpenFn workflow triggers, looks up the citizen's contact details (email/phone) from the Identity service.",
        "The workflow sends one or more notifications to the Notifications service with the citizen ID, channel, destination, and message.",
        "The Notifications service records and simulates delivery of the message.",
        "Citizen can view their notification history on the 'My notifications' portal page by entering their national ID.",
      ],
      systems: [
        {
          name: "Notifications",
          role: "Primary. Stores notification records with channel (email/sms), destination, subject, body, source service, delivery status, and timestamps.",
          port: 3005,
        },
        {
          name: "Identity",
          role: "Provides citizen contact information (email, phone_number) for notification delivery.",
          port: 3001,
        },
      ],
      simulationWorkflows: [
        "No dedicated simulation script. Notifications are created by OpenFn workflows in response to events from other services. Seed data includes sample notifications for testing the portal UI.",
      ],
      openfnWorkflows: [
        {
          name: "Service event -> Send citizen notification",
          trigger: "Webhook: any service event (birth.registered, enrollment.created, vaccination.administered, etc.)",
          description:
            "When a service event occurs, look up the citizen's contact details from the Identity service. If the citizen has an email or phone number, send a notification via the Notifications service with appropriate subject and body for the event type.",
        },
      ],
    },
    {
      id: "check-my-record",
      name: "Check My Record",
      description:
        "Unified cross-service view of a citizen's record, aggregating data from all government services into a single timeline.",
      customerJourney: [
        "Citizen visits the portal and selects 'Check my record'.",
        "Enters their national ID.",
        "System looks up the citizen across all services.",
        "Citizen sees a unified view: personal details from Identity, vital events from Civil Registry, health encounters and vaccinations from Health, and benefit enrolments from Benefits.",
        "All events are displayed on a chronological timeline with colour-coded service tags.",
      ],
      systems: [
        {
          name: "Identity",
          role: "Citizen details: name, national ID, date of birth, sex, status, addresses, household.",
          port: 3001,
        },
        {
          name: "Civil Registry",
          role: "Vital events: births, deaths, marriages linked to the citizen.",
          port: 3002,
        },
        {
          name: "Health",
          role: "Patient record, encounters (clinic visits), and vaccination history.",
          port: 3003,
        },
        {
          name: "Benefits",
          role: "Active and past programme enrolments, payment history.",
          port: 3004,
        },
        {
          name: "Notifications",
          role: "Notification history: all messages sent to the citizen via email and SMS.",
          port: 3005,
        },
      ],
      simulationWorkflows: [
        "No dedicated simulation script. This is a read-only aggregation service. The citizen timeline is populated by all other service events during simulation runs.",
      ],
      openfnWorkflows: [
        {
          name: "Duplicate citizen detection",
          trigger: "Scheduled: periodic cron",
          description:
            "Periodically scan the Identity service for potential duplicate citizen records using fuzzy matching on name, date of birth, and sex. Flag matches for manual review or auto-merge, cascading ID changes to Civil Registry, Health, and Benefits.",
        },
      ],
    },
  ];

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
          <li className="govuk-breadcrumbs__list-item">Service catalog</li>
        </ol>
      </nav>

      <h1 className="govuk-heading-xl">Service catalog</h1>
      <p className="govuk-body-l">
        Complete reference for all SimDPG government services. Each entry
        describes the citizen-facing journey, the backing systems involved, the
        simulation scripts that generate test data, and the OpenFn workflows
        required for both simulated and production operation.
      </p>

      <div className="govuk-inset-text">
        <strong>Systems overview:</strong> SimDPG runs five microservices &mdash;{" "}
        <strong>Identity</strong> (:3001) for citizen records,{" "}
        <strong>Civil Registry</strong> (:3002) for vital events,{" "}
        <strong>Health</strong> (:3003) for patient care,{" "}
        <strong>Benefits</strong> (:3004) for social programmes, and{" "}
        <strong>Notifications</strong> (:3005) for citizen communications.
        Services communicate via webhooks routed through OpenFn workflows.
      </div>

      <hr className="govuk-section-break govuk-section-break--l govuk-section-break--visible" />

      {services.map((service, index) => (
        <section key={service.id} id={service.id}>
          {index > 0 && (
            <hr className="govuk-section-break govuk-section-break--l govuk-section-break--visible" />
          )}

          <h2 className="govuk-heading-l">{service.name}</h2>
          <p className="govuk-body">{service.description}</p>

          <h3 className="govuk-heading-m">Customer journey</h3>
          <ol className="govuk-body" style={{ paddingLeft: "20px" }}>
            {service.customerJourney.map((step, i) => (
              <li key={i} style={{ marginBottom: "8px" }}>
                {step}
              </li>
            ))}
          </ol>

          <h3 className="govuk-heading-m">Systems</h3>
          <table className="govuk-table">
            <thead>
              <tr>
                <th className="govuk-table__header" style={{ width: "25%" }}>
                  Service
                </th>
                <th className="govuk-table__header" style={{ width: "10%" }}>
                  Port
                </th>
                <th className="govuk-table__header">Role</th>
              </tr>
            </thead>
            <tbody>
              {service.systems.map((sys) => (
                <tr key={sys.name}>
                  <td className="govuk-table__cell">
                    <strong>{sys.name}</strong>
                  </td>
                  <td className="govuk-table__cell">
                    <code>:{sys.port}</code>
                  </td>
                  <td className="govuk-table__cell">{sys.role}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 className="govuk-heading-m">
            Simulation
          </h3>
          {service.simulationWorkflows.map((note, i) => (
            <p className="govuk-body" key={i}>
              {note}
            </p>
          ))}

          <h3 className="govuk-heading-m">
            OpenFn workflows
          </h3>
          {service.openfnWorkflows.map((wf) => (
            <div
              key={wf.name}
              style={{
                borderLeft: "5px solid #1d70b8",
                paddingLeft: "15px",
                marginBottom: "20px",
              }}
            >
              <p className="govuk-body" style={{ marginBottom: "5px" }}>
                <strong>{wf.name}</strong>
              </p>
              <p className="govuk-body-s" style={{ marginBottom: "5px" }}>
                <span className="govuk-tag govuk-tag--blue" style={{ fontSize: "12px", marginRight: "8px" }}>
                  {wf.trigger.startsWith("Webhook") ? "Event-driven" : "Scheduled"}
                </span>
                {wf.trigger}
              </p>
              <p className="govuk-body" style={{ marginBottom: "0" }}>
                {wf.description}
              </p>
            </div>
          ))}
        </section>
      ))}

      <hr className="govuk-section-break govuk-section-break--l govuk-section-break--visible" />

      <h2 className="govuk-heading-l">Workflow summary</h2>
      <p className="govuk-body">
        The table below lists all OpenFn workflows required for the SimDPG
        platform across all services.
      </p>
      <table className="govuk-table">
        <thead>
          <tr>
            <th className="govuk-table__header">Workflow</th>
            <th className="govuk-table__header">Type</th>
            <th className="govuk-table__header">Trigger</th>
            <th className="govuk-table__header">Service</th>
          </tr>
        </thead>
        <tbody>
          {services.flatMap((service) =>
            service.openfnWorkflows.map((wf) => (
              <tr key={`${service.id}-${wf.name}`}>
                <td className="govuk-table__cell">{wf.name}</td>
                <td className="govuk-table__cell">
                  <span
                    className={
                      wf.trigger.startsWith("Webhook")
                        ? "govuk-tag govuk-tag--blue"
                        : "govuk-tag govuk-tag--green"
                    }
                    style={{ fontSize: "12px" }}
                  >
                    {wf.trigger.startsWith("Webhook")
                      ? "Event-driven"
                      : "Scheduled"}
                  </span>
                </td>
                <td className="govuk-table__cell" style={{ fontSize: "16px" }}>
                  {wf.trigger}
                </td>
                <td className="govuk-table__cell">{service.name}</td>
              </tr>
            )),
          )}
        </tbody>
      </table>

      <p className="govuk-body-s" style={{ marginTop: "30px" }}>
        <a href="/staff" className="govuk-link">
          Back to staff dashboard
        </a>
      </p>
    </>
  );
}
