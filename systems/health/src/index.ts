import express from "express";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { requestId, docsHtml, createBehavior } from "@simdpg/system-kit";
import { checkDatabase, ensureTables } from "./db/index.js";
import patientRoutes from "./routes/patients.js";
import encounterRoutes from "./routes/encounters.js";
import vaccinationRoutes from "./routes/vaccinations.js";
import adminRoutes from "./routes/admin.js";
import { errorHandler } from "./middleware/error-handler.js";

// Ensure tables exist on startup
ensureTables();

const __dirname = dirname(fileURLToPath(import.meta.url));
const OPENAPI_PATH = resolve(__dirname, "..", "openapi.yaml");

const app = express();
const PORT = process.env.PORT ?? 3003;

// Stochastic behaviour — latency, injected failures, and rate limiting. Off
// unless a simulation (or SIMDPG_BEHAVIOR* in the environment) turns it on, and
// never applied to /health, /docs or /admin, so the control plane stays sound.
const behavior = createBehavior("health");

app.use(express.json());
app.use(requestId);
app.use(behavior.middleware);

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
// A service can be up while its database is broken — that combination is
// exactly what shows up as empty pages and zero counters, so the database's
// state belongs here. The status code stays 200 either way (a failing probe
// would take the service out of rotation and hide the problem instead of
// reporting it); read `database`, and GET /admin/db-health for the detail.
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    system: "health",
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
  res.type("html").send(docsHtml("/openapi.yaml", "SimDPG Health System"));
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.use("/patients", patientRoutes);
app.use("/encounters", encounterRoutes);
app.use("/vaccinations", vaccinationRoutes);
app.use("/admin/behavior", behavior.router);
app.use("/admin", adminRoutes);

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
    console.log(`Health system listening on port ${PORT}`);
  });
}

export default app;
