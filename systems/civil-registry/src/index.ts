import express from "express";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { requestId, docsHtml } from "@simdpg/system-kit";
import { ensureTables } from "./db/index.js";
import { errorHandler } from "./middleware/error-handler.js";
import birthsRouter from "./routes/births.js";
import deathsRouter from "./routes/deaths.js";
import marriagesRouter from "./routes/marriages.js";
import eventsRouter from "./routes/events.js";
import adminRouter from "./routes/admin.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OPENAPI_PATH = resolve(__dirname, "..", "openapi.yaml");

const app = express();
const PORT = process.env.PORT ?? 3002;

app.use(express.json());
app.use(requestId);

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

app.get("/health", (_req, res) => {
  res.json({ status: "ok", system: "civil-registry", version: "0.1.0" });
});

// ---------------------------------------------------------------------------
// API docs — interactive reference (/docs) + raw spec (/openapi.yaml)
// ---------------------------------------------------------------------------

app.get("/openapi.yaml", (_req, res) => {
  res.type("application/yaml").send(readFileSync(OPENAPI_PATH, "utf8"));
});

app.get("/docs", (_req, res) => {
  res.type("html").send(docsHtml("/openapi.yaml", "SimDPG Civil Registry System"));
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.use("/births", birthsRouter);
app.use("/deaths", deathsRouter);
app.use("/marriages", marriagesRouter);
app.use("/events", eventsRouter);
app.use("/admin", adminRouter);

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

app.use(errorHandler);

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

ensureTables();

// Only bind a port when run as a service; importing the app (tooling, tests,
// route-coverage check) sets SIMDPG_NO_LISTEN to keep it inert.
if (!process.env.SIMDPG_NO_LISTEN) {
  app.listen(PORT, () => {
    console.log(`Civil Registry system listening on port ${PORT}`);
  });
}

export default app;
