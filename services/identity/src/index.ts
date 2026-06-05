import express from "express";

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "identity" });
});

app.listen(PORT, () => {
  console.log(`Identity service listening on port ${PORT}`);
});

export default app;
