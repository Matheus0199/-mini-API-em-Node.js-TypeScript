import express, { Application, Request, Response, NextFunction } from "express";
import webhookRoute from "./routes/webhook.route";
import jobsRoute from "./routes/jobs.route";

const PORT = Number(process.env.PORT ?? 3000);

const app: Application = express();

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(express.json());

// ── Routes ──────────────────────────────────────────────────────────────────
app.use("/webhook", webhookRoute);
app.use("/jobs", jobsRoute);

// Health check
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Route not found" });
});

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[API] Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[API] Server running on http://localhost:${PORT}`);
  console.log(`[API] POST /webhook/violation  — enqueue takedown`);
  console.log(`[API] GET  /jobs/:id           — check job status`);
  console.log(`[API] GET  /health             — health check`);
});

export default app;
