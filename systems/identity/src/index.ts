import express from "express";
import { eq } from "drizzle-orm";
import { db, ensureTables } from "./db/index.js";
import { citizens, addresses } from "./db/schema.js";
import { citizenRouter } from "./routes/citizens.js";
import { householdRouter } from "./routes/households.js";
import { errorHandler } from "./middleware/error-handler.js";

// Ensure tables exist on startup
ensureTables();

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(express.json());

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------
app.get("/health", (_req, res) => {
  res.json({ status: "ok", system: "identity", version: "0.1.0" });
});

// ---------------------------------------------------------------------------
// GET /citizens?national_id=X — lookup by national ID (before the router)
// ---------------------------------------------------------------------------
app.get("/citizens", async (req, res, next) => {
  try {
    const nationalId = req.query.national_id;
    if (typeof nationalId !== "string" || nationalId.length === 0) {
      // If no national_id query param, return 400
      res.status(400).json({ error: "Provide a 'national_id' query parameter" });
      return;
    }

    const citizen = db
      .select()
      .from(citizens)
      .where(eq(citizens.national_id, nationalId))
      .get();

    if (!citizen) {
      res.status(404).json({ error: "Citizen not found" });
      return;
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

// ---------------------------------------------------------------------------
// Global error handler (must be registered last)
// ---------------------------------------------------------------------------
app.use(errorHandler);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Identity system listening on port ${PORT}`);
});

export default app;
