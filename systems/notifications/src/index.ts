import express from "express";
import { ensureTables } from "./db/index.js";
import notificationsRouter from "./routes/notifications.js";
import adminRouter from "./routes/admin.js";
import { errorHandler } from "./middleware/error-handler.js";

ensureTables();

const app = express();
const PORT = process.env.PORT ?? 3005;

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", system: "notifications", version: "0.1.0" });
});

app.use("/notifications", notificationsRouter);
app.use("/admin", adminRouter);

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Notifications system listening on port ${PORT}`);
});

export default app;
