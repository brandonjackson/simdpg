import express from "express";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { requestId, docsHtml, createBehavior } from "@simdpg/system-kit";
import { ensureTables } from "./db/index.js";
import assessmentsRouter from "./routes/assessments.js";
import householdsRouter from "./routes/households.js";
import registryRouter from "./routes/registry.js";
import recertifyRouter from "./routes/recertify.js";
import adminRouter from "./routes/admin.js";
import { errorHandler } from "./middleware/error-handler.js";

// Ensure tables exist on startup
ensureTables();

const __dirname = dirname(fileURLToPath(import.meta.url));
const OPENAPI_PATH = resolve(__dirname, "..", "openapi.yaml");

const app = express();
const PORT = process.env.PORT ?? 3007;

// Stochastic behaviour — latency, injected failures, and rate limiting. Off
// unless a simulation (or SIMDPG_BEHAVIOR* in the environment) turns it on, and
// never applied to /health, /docs or /admin, so the control plane stays sound.
const behavior = createBehavior("social-registry");

app.use(express.json());
app.use(requestId);
app.use(behavior.middleware);

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------
app.get("/health", (_req, res) => {
  res.json({ status: "ok", system: "social-registry", version: "0.1.0" });
});

// ---------------------------------------------------------------------------
// API docs — interactive reference (/docs) + raw spec (/openapi.yaml)
// ---------------------------------------------------------------------------
app.get("/openapi.yaml", (_req, res) => {
  res.type("application/yaml").send(readFileSync(OPENAPI_PATH, "utf8"));
});

app.get("/docs", (_req, res) => {
  res.type("html").send(docsHtml("/openapi.yaml", "SimDPG Social Registry System"));
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.use("/assessments", assessmentsRouter);
app.use("/households", householdsRouter);
app.use("/registry", registryRouter);
app.use("/recertify", recertifyRouter);
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
    console.log(`Social Registry system listening on port ${PORT}`);
  });
}

export default app;
