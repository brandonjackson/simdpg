import express from "express";

const app = express();
const PORT = process.env.PORT ?? 3002;

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "civil-registry" });
});

app.listen(PORT, () => {
  console.log(`Civil Registry service listening on port ${PORT}`);
});

export default app;
