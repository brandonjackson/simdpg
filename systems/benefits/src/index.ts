import express from "express";
import { ensureTables } from "./db/index.js";
import programsRouter from "./routes/programs.js";
import enrollmentsRouter from "./routes/enrollments.js";
import paymentsRouter from "./routes/payments.js";
import eligibilityRouter from "./routes/eligibility.js";
import adminRouter from "./routes/admin.js";
import { errorHandler } from "./middleware/error-handler.js";

// Ensure tables exist on startup
ensureTables();

const app = express();
const PORT = process.env.PORT ?? 3004;

app.use(express.json());

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------
app.get("/health", (_req, res) => {
  res.json({ status: "ok", system: "benefits", version: "0.1.0" });
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.use("/programs", programsRouter);
app.use("/enrollments", enrollmentsRouter);
app.use("/payments", paymentsRouter);
app.use("/eligibility", eligibilityRouter);
app.use("/admin", adminRouter);

// ---------------------------------------------------------------------------
// Global error handler (must be registered last)
// ---------------------------------------------------------------------------
app.use(errorHandler);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Benefits system listening on port ${PORT}`);
});

export default app;
