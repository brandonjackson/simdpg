import express from "express";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { requestId, docsHtml, createBehavior } from "@simdpg/system-kit";
import { checkDatabase, ensureTables } from "./db/index.js";
import { ensureReferencePrograms } from "./db/reference-data.js";
import programsRouter from "./routes/programs.js";
import enrollmentsRouter from "./routes/enrollments.js";
import paymentsRouter from "./routes/payments.js";
import eligibilityRouter from "./routes/eligibility.js";
import adminRouter from "./routes/admin.js";
import { errorHandler } from "./middleware/error-handler.js";

// Ensure tables exist on startup
ensureTables();

// Programmes are reference data every integration addresses by ID, so restore
// any that are missing on each start rather than only from the one-shot seed.
// Without this, an emptied `programs` table stays empty (the seed skips a
// database the entrypoint has already marked seeded) and the system serves an
// empty programme list indefinitely.
const restoredPrograms = ensureReferencePrograms();
if (restoredPrograms.length > 0) {
  console.log(
    `Restored ${restoredPrograms.length} reference programme(s): ${restoredPrograms.join(", ")}`,
  );
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const OPENAPI_PATH = resolve(__dirname, "..", "openapi.yaml");

const app = express();
const PORT = process.env.PORT ?? 3004;

// Stochastic behaviour — latency, injected failures, and rate limiting. Off
// unless a simulation (or SIMDPG_BEHAVIOR* in the environment) turns it on, and
// never applied to /health, /docs or /admin, so the control plane stays sound.
const behavior = createBehavior("benefits");

app.use(express.json());
app.use(requestId);
app.use(behavior.middleware);

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------
// A service can be up while its database is broken — that combination is
// exactly what shows up as empty pages and zero counters, so the database's
// state belongs here. The status code stays 200 either way (a failing probe
// would take the service out of rotation and hide the problem instead of
// reporting it); read `database`, and GET /admin/db-health for the detail.
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    system: "benefits",
    version: "0.1.0",
    database: checkDatabase().status,
  });
});

// ---------------------------------------------------------------------------
// API docs — interactive reference (/docs) + raw spec (/openapi.yaml)
// ---------------------------------------------------------------------------
app.get("/openapi.yaml", (_req, res) => {
  res.type("application/yaml").send(readFileSync(OPENAPI_PATH, "utf8"));
});

app.get("/docs", (_req, res) => {
  res.type("html").send(docsHtml("/openapi.yaml", "SimDPG Benefits System"));
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.use("/programs", programsRouter);
app.use("/enrollments", enrollmentsRouter);
app.use("/payments", paymentsRouter);
app.use("/eligibility", eligibilityRouter);
app.use("/admin/behavior", behavior.router);
app.use("/admin", adminRouter);

// ---------------------------------------------------------------------------
// Global error handler (must be registered last)
// ---------------------------------------------------------------------------
app.use(errorHandler);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
// Only bind a port when run as a service; importing the app (tooling, tests,
// route-coverage check) sets SIMDPG_NO_LISTEN to keep it inert.
if (!process.env.SIMDPG_NO_LISTEN) {
  app.listen(PORT, () => {
    console.log(`Benefits system listening on port ${PORT}`);
  });
}

export default app;
