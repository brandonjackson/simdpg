import express from "express";

const app = express();
const PORT = process.env.PORT ?? 3004;

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "benefits" });
});

app.listen(PORT, () => {
  console.log(`Benefits service listening on port ${PORT}`);
});

export default app;
