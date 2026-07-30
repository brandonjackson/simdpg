import express from "express";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { requestId, docsHtml, createBehavior } from "@simdpg/system-kit";
import { ensureTables } from "./db/index.js";
import notificationsRouter from "./routes/notifications.js";
import adminRouter from "./routes/admin.js";
import { errorHandler } from "./middleware/error-handler.js";

ensureTables();

const __dirname = dirname(fileURLToPath(import.meta.url));
const OPENAPI_PATH = resolve(__dirname, "..", "openapi.yaml");

const app = express();
const PORT = process.env.PORT ?? 3005;

// Stochastic behaviour — latency, injected failures, and rate limiting. Off
// unless a simulation (or SIMDPG_BEHAVIOR* in the environment) turns it on, and
// never applied to /health, /docs or /admin, so the control plane stays sound.
const behavior = createBehavior("notifications");

app.use(express.json());
app.use(requestId);
app.use(behavior.middleware);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", system: "notifications", version: "0.1.0" });
});

// ---------------------------------------------------------------------------
// API docs — interactive reference (/docs) + raw spec (/openapi.yaml)
// ---------------------------------------------------------------------------
app.get("/openapi.yaml", (_req, res) => {
  res.type("application/yaml").send(readFileSync(OPENAPI_PATH, "utf8"));
});

app.get("/docs", (_req, res) => {
  res.type("html").send(docsHtml("/openapi.yaml", "SimDPG Notifications System"));
});

app.use("/notifications", notificationsRouter);
app.use("/admin/behavior", behavior.router);
app.use("/admin", adminRouter);

// ---------------------------------------------------------------------------
// Global error handler (must be registered last)
// ---------------------------------------------------------------------------
app.use(errorHandler);

// Only bind a port when run as a service; importing the app (tooling, tests,
// route-coverage check) sets SIMDPG_NO_LISTEN to keep it inert.
if (!process.env.SIMDPG_NO_LISTEN) {
  app.listen(PORT, () => {
    console.log(`Notifications system listening on port ${PORT}`);
  });
}

export default app;
