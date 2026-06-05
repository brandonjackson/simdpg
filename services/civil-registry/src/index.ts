import express from "express";
import { ensureTables } from "./db/index.js";
import { errorHandler } from "./middleware/error-handler.js";
import birthsRouter from "./routes/births.js";
import deathsRouter from "./routes/deaths.js";
import marriagesRouter from "./routes/marriages.js";
import eventsRouter from "./routes/events.js";

const app = express();
const PORT = process.env.PORT ?? 3002;

app.use(express.json());

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "civil-registry", version: "0.1.0" });
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.use("/births", birthsRouter);
app.use("/deaths", deathsRouter);
app.use("/marriages", marriagesRouter);
app.use("/events", eventsRouter);

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

app.use(errorHandler);

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

ensureTables();

app.listen(PORT, () => {
  console.log(`Civil Registry service listening on port ${PORT}`);
});

export default app;
