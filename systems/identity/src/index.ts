import express from "express";
import { eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { requestId, notFound, badRequest, docsHtml, createBehavior } from "@simdpg/system-kit";
import { checkDatabase, db, ensureTables } from "./db/index.js";
import { citizens, addresses } from "./db/schema.js";
import { citizenRouter } from "./routes/citizens.js";
import { householdRouter } from "./routes/households.js";
import { adminRouter } from "./routes/admin.js";
import { errorHandler } from "./middleware/error-handler.js";

// Ensure tables exist on startup
ensureTables();

const __dirname = dirname(fileURLToPath(import.meta.url));
const OPENAPI_PATH = resolve(__dirname, "..", "openapi.yaml");

const app = express();
const PORT = process.env.PORT ?? 3001;

// Stochastic behaviour — latency, injected failures, and rate limiting. Off
// unless a simulation (or SIMDPG_BEHAVIOR* in the environment) turns it on, and
// never applied to /health, /docs or /admin, so the control plane stays sound.
const behavior = createBehavior("identity");

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
    system: "identity",
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
  res.type("html").send(docsHtml("/openapi.yaml", "Identity API"));
});

// ---------------------------------------------------------------------------
// GET /citizens?national_id=X — lookup by national ID (before the router)
// ---------------------------------------------------------------------------
app.get("/citizens", async (req, res, next) => {
  try {
    // Only this handler deals with the national_id lookup; the listing route
    // (no query param) is handled by citizenRouter below.
    const nationalId = req.query.national_id;
    if (nationalId === undefined) return next();

    if (typeof nationalId !== "string" || nationalId.length === 0) {
      throw badRequest("Provide a non-empty 'national_id' query parameter");
    }

    const citizen = db
      .select()
      .from(citizens)
      .where(eq(citizens.national_id, nationalId))
      .get();

    if (!citizen) {
      throw notFound("Citizen not found");
    }

    const addrs = db
      .select()
      .from(addresses)
      .where(eq(addresses.citizen_id, citizen.id))
      .all();

    res.json({ ...citizen, addresses: addrs });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.use("/citizens", citizenRouter);
app.use("/households", householdRouter);
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
    console.log(`Identity system listening on port ${PORT}`);
  });
}

export default app;
