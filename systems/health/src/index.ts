import express from "express";
import { ensureTables } from "./db/index.js";
import patientRoutes from "./routes/patients.js";
import encounterRoutes from "./routes/encounters.js";
import vaccinationRoutes from "./routes/vaccinations.js";
import { errorHandler } from "./middleware/error-handler.js";

// Ensure tables exist on startup
ensureTables();

const app = express();
const PORT = process.env.PORT ?? 3003;

app.use(express.json());

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.get("/health", (_req, res) => {
  res.json({ status: "ok", system: "health", version: "0.1.0" });
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.use("/patients", patientRoutes);
app.use("/encounters", encounterRoutes);
app.use("/vaccinations", vaccinationRoutes);

// ---------------------------------------------------------------------------
// Global error handler (must be registered last)
// ---------------------------------------------------------------------------
app.use(errorHandler);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Health system listening on port ${PORT}`);
});

export default app;
