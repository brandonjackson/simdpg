type SystemStatus = "built" | "stub" | "planned";

interface SystemEntry {
  id: string;
  name: string;
  port: number;
  status: SystemStatus;
  buildingBlock: string;
  tagColour: string;
  sketch?: boolean;
  sketchNote?: string;
  config?: string;
  failureModes?: { code: string; description: string }[];
  summary: string;
  description: string;
  techStack: string;
  entities: { name: string; fields: string }[];
  endpoints: { method: string; path: string; description: string }[];
  webhooks: { event: string; description: string }[];
  seedData: string;
  relationships: string[];
}

export default function SystemsCatalog() {
  const systems: SystemEntry[] = [
    {
      id: "identity",
      name: "Identity",
      port: 3001,
      status: "built",
      buildingBlock: "Foundational ID / Registration",
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
      status: "built",
      buildingBlock: "Civil Registration",
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
      status: "built",
      buildingBlock: "Health (sector system)",
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
      status: "built",
      buildingBlock: "Social Protection / Benefits",
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
      status: "built",
      buildingBlock: "Messaging / Notifications",
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
    {
      id: "payments",
      name: "Payments",
      port: 3006,
      status: "stub",
      buildingBlock: "Payments",
      tagColour: "grey",
      sketch: true,
      sketchNote:
        "Sketch only — no code exists yet. This entry describes what the Payments system will do once built (planned port :3006). Benefits already schedules payments but nothing disburses them; Payments closes that gap.",
      summary:
        "Mock disbursement ledger. Holds a treasury account and a per-citizen account, moves money only as paired ledger entries, and fails at random to mimic a real payment gateway.",
      description:
        "The Payments system is the disbursing layer that Benefits currently lacks: Benefits schedules payments, but no system actually pays them out. Payments keeps a double-entry ledger with one account for the government (the disbursing treasury) and one account for every citizen. A disbursement is mocked — no real money moves; it only ever appears as a paired ledger entry (debit treasury, credit citizen). Crucially, the API fails at random to behave like a real government payment gateway: failure modes and their rates are set in a config file (see below), so OpenFn workflows must handle retries, idempotency, and failure notifications exactly as they would against a live banking partner.",
      techStack: "Express.js, better-sqlite3, Drizzle ORM, TypeScript (planned)",
      config:
        "Failure rates are configurable in payments.config.ts. Each disbursement rolls against these rates and may return one of five gateway-style errors instead of completing — matching the most common error messages a real government payment gateway hits.",
      failureModes: [
        {
          code: "INSUFFICIENT_FUNDS",
          description:
            "The disbursing/treasury account lacks the balance for the transfer.",
        },
        {
          code: "ACCOUNT_NOT_FOUND",
          description:
            "The beneficiary account or bank details are invalid or unknown.",
        },
        {
          code: "GATEWAY_TIMEOUT",
          description:
            "The upstream banking partner did not respond in time.",
        },
        {
          code: "DUPLICATE_TRANSACTION",
          description:
            "A payment with this idempotency key was already processed.",
        },
        {
          code: "SERVICE_UNAVAILABLE",
          description:
            "Gateway temporarily unavailable / rate limited — retry later.",
        },
      ],
      entities: [
        {
          name: "Accounts (proposed)",
          fields:
            "id (UUID), owner_type (treasury/citizen), owner_id (citizen_id, or 'treasury'), balance, currency (SIM), status (active/closed), created_at, updated_at",
        },
        {
          name: "Payments (proposed)",
          fields:
            "id, idempotency_key (unique), from_account_id (treasury), to_account_id (citizen), amount, currency (SIM), enrollment_id (optional, from Benefits), reference, status (pending/completed/failed), failure_code, failure_message, created_at, completed_at",
        },
        {
          name: "Ledger Entries (proposed)",
          fields:
            "id, payment_id, account_id, direction (debit/credit), amount, currency (SIM), created_at — every completed payment writes two rows (debit treasury, credit citizen)",
        },
      ],
      endpoints: [
        { method: "POST", path: "/payments", description: "Request a disbursement (treasury → citizen). Requires an idempotency key. May fail at random per the configured failure modes." },
        { method: "GET", path: "/payments", description: "List payments, filter by account, enrollment_id, or status" },
        { method: "GET", path: "/payments/:id", description: "Get a single payment with its ledger entries" },
        { method: "POST", path: "/accounts", description: "Open an account (treasury or for a new citizen)" },
        { method: "GET", path: "/accounts", description: "List accounts, filter by owner_type or owner_id" },
        { method: "GET", path: "/accounts/:id", description: "Get an account with its current balance" },
        { method: "GET", path: "/accounts/:id/ledger", description: "List ledger entries for an account" },
      ],
      webhooks: [
        { event: "account.opened", description: "Fired when a citizen or treasury account is opened" },
        { event: "payment.completed", description: "Fired when a disbursement succeeds (paired ledger entries written)" },
        { event: "payment.failed", description: "Fired when a disbursement fails, carrying the failure_code for retry logic" },
      ],
      seedData: "None yet — sketch only. When built: a funded treasury account plus an account per seeded citizen.",
      relationships: [
        "Opens a citizen account when Identity emits citizen.created",
        "Receives disbursement requests for scheduled Benefits payments (enrollment_id links back to Benefits)",
        "payment.failed is consumed by OpenFn for retry / backoff and citizen failure notifications",
        "Treasury account represents the disbursing government; INSUFFICIENT_FUNDS models it running dry",
      ],
    },
    {
      id: "social-registry",
      name: "Social Registry",
      port: 3007,
      status: "stub",
      buildingBlock: "Registries (needs-based targeting)",
      tagColour: "grey",
      sketch: true,
      sketchNote:
        "Sketch only — no code exists yet. This entry describes the needs-based targeting registry that will feed Benefits eligibility once built (planned port :3007).",
      summary:
        "Needs-based targeting registry. Holds proxy-means-test scores and vulnerability indicators per household, and feeds Benefits eligibility decisions.",
      description:
        "The Social Registry is the needs-based targeting layer for social protection. It records welfare assessments per household — a proxy-means-test (PMT) score, income band, and vulnerability flags (disability, elderly, single-parent, dependents) — drawn from intake interviews and cross-system data. Benefits queries the registry when checking eligibility so that targeting is driven by assessed need rather than programme rules alone. Assessments expire and must be recertified, and household composition is kept current from Civil Registry life events.",
      techStack: "Express.js, better-sqlite3, Drizzle ORM, TypeScript (planned)",
      entities: [
        {
          name: "Assessments (proposed)",
          fields:
            "id (UUID), household_id (from Identity), head_citizen_id, pmt_score, income_band (low/medium/high), data_source (interview/imported/recertified), assessed_at, valid_until, status (active/expired/superseded), created_at, updated_at",
        },
        {
          name: "Vulnerability Indicators (proposed)",
          fields:
            "id, assessment_id, indicator (disability/elderly/single_parent/chronic_illness/unemployed/dependents), value, weight",
        },
      ],
      endpoints: [
        { method: "POST", path: "/assessments", description: "Record a needs assessment for a household" },
        { method: "GET", path: "/assessments", description: "List assessments, filter by household_id, citizen_id, or status" },
        { method: "GET", path: "/assessments/:id", description: "Get a single assessment with its vulnerability indicators" },
        { method: "GET", path: "/households/:id/targeting-profile", description: "Targeting profile (PMT score + flags) for a household, used by Benefits eligibility" },
        { method: "GET", path: "/registry", description: "Query households by targeting criteria (e.g. income_band, vulnerability)" },
        { method: "POST", path: "/recertify", description: "Re-run targeting for a household (issues a new assessment, supersedes the old)" },
      ],
      webhooks: [
        { event: "assessment.completed", description: "Fired when a household needs assessment is recorded" },
        { event: "targeting.updated", description: "Fired when a household's targeting profile changes (e.g. recertification)" },
      ],
      seedData: "None yet — sketch only. When built: one assessment per seeded household with realistic PMT scores.",
      relationships: [
        "References household_id and citizen_id from Identity",
        "Feeds Benefits: eligibility checks query the household targeting profile rather than programme rules alone",
        "Recertifies household composition from Civil Registry birth / death / marriage events",
        "targeting.updated can trigger benefit re-assessment in Benefits via OpenFn",
      ],
    },
  ];

  const statusBadge: Record<SystemStatus, { label: string; colour: string }> = {
    built: { label: "Built", colour: "govuk-tag--green" },
    stub: { label: "Stub — sketch", colour: "govuk-tag--yellow" },
    planned: { label: "Planned", colour: "govuk-tag--grey" },
  };

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
        Technical reference for the backend systems of record that power SimDPG
        &mdash; the digital public infrastructure (DPI) building blocks of the
        city-state. Five systems are <strong>built and live</strong>; two more
        (Payments and Social Registry) are <strong>sketched as stubs</strong> so
        the full landscape is visible before we deepen anything. Each system is
        an independent service with its own database, API, and webhook events,
        communicating through HTTP APIs and webhook events routed via OpenFn
        workflows.
      </p>

      <div className="govuk-inset-text">
        <strong>Status key:</strong>{" "}
        <span className="govuk-tag govuk-tag--green">Built</span> — live,
        running code.{" "}
        <span className="govuk-tag govuk-tag--yellow">Stub — sketch</span> —
        documented intent only, no code exists yet.{" "}
        <span className="govuk-tag govuk-tag--grey">Planned</span> — on the
        roadmap, not yet sketched.
      </div>

      <div className="govuk-inset-text">
        <strong>Architecture:</strong> All built systems share a common
        technology stack &mdash; Express.js, better-sqlite3, and Drizzle ORM
        running on TypeScript. Each system owns its own SQLite database and
        exposes a REST API. Cross-system coordination happens through webhook
        events processed by OpenFn integration workflows, which also plays the
        role of the information-mediator / exchange layer.
      </div>

      <h2 className="govuk-heading-l">System overview</h2>
      <table className="govuk-table">
        <thead>
          <tr>
            <th className="govuk-table__header" style={{ width: "16%" }}>
              System
            </th>
            <th className="govuk-table__header" style={{ width: "13%" }}>
              Status
            </th>
            <th className="govuk-table__header" style={{ width: "8%" }}>
              Port
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
                <span
                  className={`govuk-tag ${statusBadge[sys.status].colour}`}
                  style={{ fontSize: "12px" }}
                >
                  {statusBadge[sys.status].label}
                </span>
              </td>
              <td className="govuk-table__cell">
                <code>:{sys.port}</code>
                {sys.sketch ? " (planned)" : ""}
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

      <h2 className="govuk-heading-l">DPI building-block inventory</h2>
      <p className="govuk-body">
        A credible city-state needs a known set of digital public infrastructure
        building blocks. We take stock against common reference taxonomies
        &mdash; the{" "}
        <a
          className="govuk-link"
          href="https://govstack.gitbook.io/specification/"
          target="_blank"
          rel="noopener noreferrer"
        >
          GovStack
        </a>{" "}
        building blocks and the{" "}
        <a
          className="govuk-link"
          href="https://dci.dev/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Digital Convergence Initiative (DCI)
        </a>{" "}
        &mdash; to confirm each needed component has at least a presence in the
        repo. The system landscape is deliberately fixed: the five live systems,
        plus the two stubs below. New systems are not added lightly.
      </p>
      <table className="govuk-table">
        <thead>
          <tr>
            <th className="govuk-table__header" style={{ width: "30%" }}>
              Building block
            </th>
            <th className="govuk-table__header" style={{ width: "20%" }}>
              SimDPG system
            </th>
            <th className="govuk-table__header" style={{ width: "16%" }}>
              Status
            </th>
            <th className="govuk-table__header">Notes</th>
          </tr>
        </thead>
        <tbody>
          {systems.map((sys) => (
            <tr key={`bb-${sys.id}`}>
              <td className="govuk-table__cell">{sys.buildingBlock}</td>
              <td className="govuk-table__cell">
                <a href={`#${sys.id}`} className="govuk-link">
                  <strong>{sys.name}</strong>
                </a>
              </td>
              <td className="govuk-table__cell">
                <span
                  className={`govuk-tag ${statusBadge[sys.status].colour}`}
                  style={{ fontSize: "12px" }}
                >
                  {statusBadge[sys.status].label}
                </span>
              </td>
              <td className="govuk-table__cell">{sys.summary}</td>
            </tr>
          ))}
          <tr>
            <td className="govuk-table__cell">
              Information Mediator / Exchange
            </td>
            <td className="govuk-table__cell">
              <strong>OpenFn</strong>
            </td>
            <td className="govuk-table__cell">
              <span
                className="govuk-tag govuk-tag--blue"
                style={{ fontSize: "12px" }}
              >
                External
              </span>
            </td>
            <td className="govuk-table__cell">
              Played by OpenFn — the integration layer under test. Not a SimDPG
              system of record.
            </td>
          </tr>
        </tbody>
      </table>

      <h3 className="govuk-heading-m">Deliberately excluded (for now)</h3>
      <p className="govuk-body">
        The following building blocks were considered and left out for now.
        They are not reintroduced as systems unless explicitly asked.
      </p>
      <ul className="govuk-list govuk-list--bullet">
        <li>
          <strong>Authentication / single sign-on</strong> — citizen and staff
          identity assurance.
        </li>
        <li>
          <strong>Consent / data-sharing</strong> — authorisation for
          cross-system data access.
        </li>
        <li>
          <strong>Document / credential issuance</strong> — issuing
          certificates, IDs, or credentials.
        </li>
      </ul>

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
            <span
              className={`govuk-tag ${statusBadge[system.status].colour}`}
              style={{ marginLeft: "10px", verticalAlign: "middle" }}
            >
              {statusBadge[system.status].label}
            </span>
          </h2>
          <p className="govuk-body-s" style={{ color: "#505a5f" }}>
            <strong>Building block:</strong> {system.buildingBlock}
          </p>

          {system.sketch && (
            <div
              className="govuk-warning-text"
              style={{
                border: "5px solid #d4351c",
                padding: "15px 15px 15px 15px",
                marginBottom: "20px",
              }}
            >
              <strong>Sketch only — not a working system.</strong>{" "}
              {system.sketchNote} Data models, endpoints, and webhooks below are
              <em> proposed</em>, not implemented.
            </div>
          )}

          <p className="govuk-body">{system.description}</p>

          {system.config && (
            <>
              <h3 className="govuk-heading-m">Random failure simulation</h3>
              <p className="govuk-body">{system.config}</p>
              <table className="govuk-table">
                <thead>
                  <tr>
                    <th
                      className="govuk-table__header"
                      style={{ width: "30%" }}
                    >
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

          <h3 className="govuk-heading-m">
            Data model{system.sketch ? " (proposed)" : ""}
          </h3>
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

          <h3 className="govuk-heading-m">
            API endpoints{system.sketch ? " (proposed)" : ""}
          </h3>
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

          <h3 className="govuk-heading-m">
            Webhook events{system.sketch ? " (proposed)" : ""}
          </h3>
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
                  {system.sketch && (
                    <span
                      className="govuk-tag govuk-tag--yellow"
                      style={{ fontSize: "11px", marginLeft: "8px" }}
                    >
                      Proposed
                    </span>
                  )}
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
