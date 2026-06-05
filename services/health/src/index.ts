import express from "express";

const app = express();
const PORT = process.env.PORT ?? 3003;

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "health" });
});

app.listen(PORT, () => {
  console.log(`Health service listening on port ${PORT}`);
});

export default app;
