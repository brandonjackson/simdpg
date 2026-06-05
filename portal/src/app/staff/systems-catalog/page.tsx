export default function SystemsCatalog() {
  const systems = [
    {
      id: "identity",
      name: "Identity",
      port: 3001,
      tagColour: "blue",
      summary:
        "The single source of truth for citizen records. Every other system references citizens by their Identity-issued ID.",
      description:
        "The Identity system is the foundational registry of all citizens. It assigns each person a unique national ID (format SIM-XXXXXX), stores their personal details, contact information, and tracks their lifecycle status. It also manages household composition, linking citizens into family units with defined relationships.",
      techStack: "Express.js, better-sqlite3, Drizzle ORM, TypeScript",
      entities: [
        {
          name: "Citizens",
          fields:
            "id (UUID), national_id (unique, SIM-XXXXXX), given_name, family_name, date_of_birth, sex (male/female), email, phone_number, date_of_death, status (alive/deceased), created_at, updated_at",
        },
        {
          name: "Addresses",
          fields:
            "id, citizen_id, type (residential/mailing), line_1, line_2, city, postal_code, from_date, to_date",
        },
        {
          name: "Household Members",
          fields:
            "id, household_id, citizen_id, relationship (head/spouse/child/other), from_date, to_date",
        },
      ],
      endpoints: [
        { method: "GET", path: "/citizens", description: "List all citizens with addresses" },
        { method: "GET", path: "/citizens/search?name=&dob=", description: "Fuzzy search by name and/or date of birth" },
        { method: "GET", path: "/citizens?national_id=X", description: "Lookup citizen by national ID" },
        { method: "GET", path: "/citizens/:id", description: "Get single citizen with addresses" },
        { method: "POST", path: "/citizens", description: "Create new citizen with optional addresses" },
        { method: "PATCH", path: "/citizens/:id", description: "Update citizen details or status" },
        { method: "GET", path: "/citizens/:id/household", description: "Get all members of a citizen's household" },
        { method: "POST", path: "/households", description: "Create new household with members" },
        { method: "PATCH", path: "/households/:id/members", description: "Add or remove household members" },
      ],
      webhooks: [
        { event: "citizen.created", description: "Fired when a new citizen record is created" },
        { event: "citizen.updated", description: "Fired when citizen details are changed" },
        { event: "citizen.deceased", description: "Fired when status changes from alive to deceased" },
      ],
      seedData: "10 sample citizens, 3 households, 11 addresses",
      relationships: [
        "Referenced by every other system via citizen_id",
        "Civil Registry links births, deaths, and marriages to citizens",
        "Health links patients to citizens",
        "Benefits links enrollments to citizens",
        "Notifications links messages to citizens",
      ],
    },
    {
      id: "civil-registry",
      name: "Civil Registry",
      port: 3002,
      tagColour: "purple",
      summary:
        "Records vital life events: births, deaths, and marriages. Emits events that trigger cascading actions in other systems.",
      description:
        "The Civil Registry is the official record of vital events in citizens' lives. When a birth, death, or marriage is registered, the system stores the event details and emits a webhook. These webhooks are the primary triggers for cross-system workflows: a birth registration creates a citizen and patient, a death registration cascades closures, and a marriage links households.",
      techStack: "Express.js, better-sqlite3, Drizzle ORM, TypeScript",
      entities: [
        {
          name: "Birth Registrations",
          fields:
            "id, child_citizen_id, mother_citizen_id, father_citizen_id (optional), date_of_birth, place_of_birth, registration_date, registrar_notes, status (registered/amended/cancelled), created_at, updated_at",
        },
        {
          name: "Death Registrations",
          fields:
            "id, citizen_id, date_of_death, place_of_death, cause_of_death, registration_date, status (registered/amended/cancelled), created_at, updated_at",
        },
        {
          name: "Marriage Registrations",
          fields:
            "id, spouse_1_citizen_id, spouse_2_citizen_id, date_of_marriage, place_of_marriage, registration_date, status (registered/divorced/annulled), created_at, updated_at",
        },
      ],
      endpoints: [
        { method: "POST", path: "/births", description: "Register a birth" },
        { method: "GET", path: "/births", description: "List births, optionally filter by citizen_id or since date" },
        { method: "GET", path: "/births/:id", description: "Get single birth record" },
        { method: "POST", path: "/deaths", description: "Register a death" },
        { method: "GET", path: "/deaths", description: "List deaths, optionally filter by citizen_id" },
        { method: "GET", path: "/deaths/:id", description: "Get single death record" },
        { method: "POST", path: "/marriages", description: "Register a marriage" },
        { method: "GET", path: "/marriages", description: "List marriages, optionally filter by citizen_id (finds either spouse)" },
        { method: "GET", path: "/marriages/:id", description: "Get single marriage record" },
        { method: "GET", path: "/events", description: "Query all vital events (aggregated view)" },
      ],
      webhooks: [
        { event: "birth.registered", description: "Fired when a new birth is registered" },
        { event: "death.registered", description: "Fired when a death is registered" },
        { event: "marriage.registered", description: "Fired when a marriage is registered" },
      ],
      seedData: "5 births, 2 deaths, 3 marriages",
      relationships: [
        "References citizen IDs from Identity for all parties",
        "birth.registered triggers citizen creation in Identity",
        "death.registered triggers cascading closures in Identity, Health, and Benefits",
        "marriage.registered triggers household linking in Identity and benefit reassessment in Benefits",
      ],
    },
    {
      id: "health",
      name: "Health",
      port: 3003,
      tagColour: "green",
      summary:
        "Manages patient records, clinical encounters, and vaccination schedules. Tracks overdue vaccinations for follow-up.",
      description:
        "The Health system manages the clinical side of citizen care. Citizens are registered as patients (linked by citizen_id), and their encounters — check-ups, consultations, emergency visits, and vaccinations — are tracked over time. The vaccination module maintains dose schedules and can report on overdue vaccinations, enabling public health follow-up.",
      techStack: "Express.js, better-sqlite3, Drizzle ORM, TypeScript",
      entities: [
        {
          name: "Patients",
          fields:
            "id (UUID), citizen_id, blood_type (A+/A-/B+/B-/AB+/AB-/O+/O-), allergies (JSON array), registered_at, status (active/deceased/inactive), created_at, updated_at",
        },
        {
          name: "Encounters",
          fields:
            "id, patient_id, type (checkup/emergency/vaccination/consultation), date, facility, provider, diagnosis, notes, status (completed/scheduled/cancelled), created_at, updated_at",
        },
        {
          name: "Vaccinations",
          fields:
            "id, patient_id, encounter_id (optional), vaccine_name, dose_number, date_administered, next_dose_due, batch_number, created_at, updated_at",
        },
      ],
      endpoints: [
        { method: "POST", path: "/patients", description: "Register a new patient" },
        { method: "GET", path: "/patients", description: "List patients, optionally filter by citizen_id" },
        { method: "GET", path: "/patients/:id", description: "Get single patient by UUID" },
        { method: "POST", path: "/encounters", description: "Record a clinical encounter" },
        { method: "GET", path: "/encounters?patient_id=X", description: "Query encounters for a patient, optionally filter by type" },
        { method: "GET", path: "/encounters/:id", description: "Get single encounter" },
        { method: "POST", path: "/vaccinations", description: "Record a vaccination" },
        { method: "GET", path: "/vaccinations?patient_id=X", description: "Get vaccination history for a patient" },
        { method: "GET", path: "/vaccinations/overdue?as_of=DATE", description: "Query overdue vaccinations as of a given date" },
      ],
      webhooks: [
        { event: "patient.registered", description: "Fired when a new patient is registered" },
        { event: "encounter.completed", description: "Fired when an encounter is completed" },
        { event: "vaccination.administered", description: "Fired when a vaccination is recorded" },
      ],
      seedData: "5 patients, 10 encounters, 8 vaccinations",
      relationships: [
        "References citizen_id from Identity for patient identification",
        "New patients are created when newborns are registered (triggered by citizen.created)",
        "Patient status set to deceased/inactive when death is registered",
        "Vaccination schedules cancelled on death registration",
      ],
    },
    {
      id: "benefits",
      name: "Benefits",
      port: 3004,
      tagColour: "yellow",
      summary:
        "Administers social protection programmes, manages citizen enrolments, and schedules payments.",
      description:
        "The Benefits system manages social protection programmes such as Child Benefit, Senior Pension, and Maternity Grant. It defines programme rules (eligibility criteria, payment amounts, frequency), tracks citizen enrolments, and schedules payments. Eligibility can be checked against programme rules, and enrolments are created or terminated based on life events from other systems.",
      techStack: "Express.js, better-sqlite3, Drizzle ORM, TypeScript",
      entities: [
        {
          name: "Programs",
          fields:
            "id, name, description, eligibility_rules (JSON), payment_amount, payment_frequency (monthly/one-time/quarterly), status (active/suspended/closed), created_at, updated_at",
        },
        {
          name: "Enrollments",
          fields:
            "id, program_id, citizen_id, household_id (optional), status (pending/active/suspended/terminated), enrolled_at, terminated_at, termination_reason, created_at, updated_at",
        },
        {
          name: "Payments",
          fields:
            "id, enrollment_id, amount, currency (SIM), status (scheduled/paid/failed), scheduled_date, paid_date, created_at, updated_at",
        },
      ],
      endpoints: [
        { method: "GET", path: "/programs", description: "List programmes, optionally filter by status" },
        { method: "GET", path: "/programs/:id", description: "Get single programme with parsed eligibility rules" },
        { method: "POST", path: "/programs", description: "Create a new programme" },
        { method: "POST", path: "/enrollments", description: "Enrol a citizen in a programme" },
        { method: "GET", path: "/enrollments", description: "List enrolments, optionally filter by citizen_id or status" },
        { method: "GET", path: "/enrollments/:id", description: "Get single enrolment with full programme details" },
        { method: "PATCH", path: "/enrollments/:id", description: "Update enrolment status (suspend, terminate)" },
        { method: "GET", path: "/payments", description: "List payments, optionally filter by enrollment_id" },
        { method: "POST", path: "/payments/schedule", description: "Create scheduled payments (supports bulk creation)" },
        { method: "PATCH", path: "/payments/:id", description: "Update payment status (mark as paid or failed)" },
        { method: "POST", path: "/eligibility/check", description: "Check citizen eligibility for a programme" },
      ],
      webhooks: [
        { event: "enrollment.created", description: "Fired when a citizen is enrolled in a programme" },
        { event: "enrollment.terminated", description: "Fired when an enrolment is terminated" },
        { event: "payment.completed", description: "Fired when a payment is marked as paid" },
      ],
      seedData: "3 programmes (Child Benefit, Senior Pension, Maternity Grant), 5 enrolments, 10 payments",
      relationships: [
        "References citizen_id from Identity for enrolment and eligibility",
        "Newborn citizens auto-checked for Child Benefit eligibility",
        "All enrolments terminated when death is registered",
        "Household-based eligibility reassessed when marriage is registered",
      ],
    },
    {
      id: "notifications",
      name: "Notifications",
      port: 3005,
      tagColour: "orange",
      summary:
        "Delivers email and SMS notifications to citizens when government service events occur. Tracks delivery status.",
      description:
        "The Notifications system is the citizen communication layer. When events occur across other systems (birth registered, benefit enrolled, vaccination administered), workflows send notifications to affected citizens via email or SMS. The system tracks delivery attempts and status, and citizens can view their full notification history through the portal.",
      techStack: "Express.js, better-sqlite3, Drizzle ORM, TypeScript",
      entities: [
        {
          name: "Notifications",
          fields:
            "id, citizen_id, channel (email/sms), destination, subject (optional), body, source_system, source_event, status (pending/sent/delivered/failed), attempts, sent_at, delivered_at, failed_reason, created_at, updated_at",
        },
      ],
      endpoints: [
        { method: "POST", path: "/notifications", description: "Send a single notification" },
        { method: "POST", path: "/notifications/bulk", description: "Send up to 100 notifications in bulk" },
        { method: "GET", path: "/notifications", description: "List notifications, filter by citizen_id, status, or source_system" },
        { method: "GET", path: "/notifications/:id", description: "Get single notification" },
      ],
      webhooks: [
        { event: "notification.sent", description: "Fired when a notification is sent" },
        { event: "notification.bulk_sent", description: "Fired when a bulk batch is sent" },
      ],
      seedData: "6 sample notifications (email and SMS, various statuses)",
      relationships: [
        "References citizen_id from Identity for delivery targeting",
        "Fetches contact details (email, phone) from Identity system",
        "Triggered by events from all other systems via OpenFn workflows",
      ],
    },
  ];

  const methodColour = (method: string) => {
    switch (method) {
      case "GET":
        return "govuk-tag--green";
      case "POST":
        return "govuk-tag--blue";
      case "PATCH":
        return "govuk-tag--yellow";
      case "DELETE":
        return "govuk-tag--red";
      default:
        return "";
    }
  };

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
          <li className="govuk-breadcrumbs__list-item">Systems catalog</li>
        </ol>
      </nav>

      <h1 className="govuk-heading-xl">Systems catalog</h1>
      <p className="govuk-body-l">
        Technical reference for the five backend systems that power SimDPG.
        Each system is an independent service with its own database, API, and
        webhook events. Systems communicate through HTTP APIs and webhook events
        routed via OpenFn workflows.
      </p>

      <div className="govuk-inset-text">
        <strong>Architecture:</strong> All systems share a common technology
        stack &mdash; Express.js, better-sqlite3, and Drizzle ORM running on
        TypeScript. Each system owns its own SQLite database and exposes a REST
        API. Cross-system coordination happens through webhook events processed
        by OpenFn integration workflows.
      </div>

      <h2 className="govuk-heading-l">System overview</h2>
      <table className="govuk-table">
        <thead>
          <tr>
            <th className="govuk-table__header" style={{ width: "18%" }}>
              System
            </th>
            <th className="govuk-table__header" style={{ width: "8%" }}>
              Port
            </th>
            <th className="govuk-table__header" style={{ width: "15%" }}>
              Entities
            </th>
            <th className="govuk-table__header">Purpose</th>
          </tr>
        </thead>
        <tbody>
          {systems.map((sys) => (
            <tr key={sys.id}>
              <td className="govuk-table__cell">
                <a href={`#${sys.id}`} className="govuk-link">
                  <strong>{sys.name}</strong>
                </a>
              </td>
              <td className="govuk-table__cell">
                <code>:{sys.port}</code>
              </td>
              <td className="govuk-table__cell">
                {sys.entities.map((e) => e.name).join(", ")}
              </td>
              <td className="govuk-table__cell">{sys.summary}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="govuk-heading-l">How systems connect</h2>
      <p className="govuk-body">
        The Identity system sits at the centre of SimDPG. Every citizen gets a
        unique <code>citizen_id</code> from Identity, and all other systems
        reference that ID to link their records back to the person. When a life
        event happens (birth, death, marriage, vaccination, benefit enrolment),
        the originating system emits a webhook event. OpenFn workflows listen
        for these events and orchestrate the cross-system updates needed to keep
        all records consistent.
      </p>
      <p className="govuk-body">
        For example, when Civil Registry emits <code>birth.registered</code>,
        OpenFn workflows create a citizen in Identity, register a patient in
        Health, and check benefit eligibility in Benefits &mdash; all from that
        single event.
      </p>

      <hr className="govuk-section-break govuk-section-break--l govuk-section-break--visible" />

      {systems.map((system, index) => (
        <section key={system.id} id={system.id}>
          {index > 0 && (
            <hr className="govuk-section-break govuk-section-break--l govuk-section-break--visible" />
          )}

          <h2 className="govuk-heading-l">
            <span
              className={`govuk-tag govuk-tag--${system.tagColour}`}
              style={{ marginRight: "10px", verticalAlign: "middle" }}
            >
              :{system.port}
            </span>
            {system.name}
          </h2>
          <p className="govuk-body">{system.description}</p>

          <h3 className="govuk-heading-m">Data model</h3>
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

          <h3 className="govuk-heading-m">API endpoints</h3>
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

          <h3 className="govuk-heading-m">Webhook events</h3>
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

          <h3 className="govuk-heading-m">Cross-system relationships</h3>
          <ul className="govuk-list govuk-list--bullet">
            {system.relationships.map((rel, i) => (
              <li key={i}>{rel}</li>
            ))}
          </ul>

          <p className="govuk-body-s" style={{ color: "#505a5f" }}>
            <strong>Seed data:</strong> {system.seedData}
          </p>
        </section>
      ))}

      <hr className="govuk-section-break govuk-section-break--l govuk-section-break--visible" />

      <h2 className="govuk-heading-l">All webhook events</h2>
      <p className="govuk-body">
        Complete list of webhook events emitted across all systems. These events
        are the integration points that OpenFn workflows subscribe to.
      </p>
      <table className="govuk-table">
        <thead>
          <tr>
            <th className="govuk-table__header">Event</th>
            <th className="govuk-table__header">System</th>
            <th className="govuk-table__header">Description</th>
          </tr>
        </thead>
        <tbody>
          {systems.flatMap((system) =>
            system.webhooks.map((wh) => (
              <tr key={`${system.id}-${wh.event}`}>
                <td className="govuk-table__cell">
                  <code>{wh.event}</code>
                </td>
                <td className="govuk-table__cell">
                  <strong>{system.name}</strong>
                </td>
                <td className="govuk-table__cell">{wh.description}</td>
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
