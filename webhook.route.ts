import { Router, Request, Response } from "express";
import { ZodError } from "zod";
import { ViolationPayloadSchema } from "../schemas/violation.schema";
import { enqueueTakedownJob } from "../services/queue.service";

const router = Router();

/**
 * POST /webhook/violation
 * Receives a violation notification, validates it, and enqueues a takedown job.
 */
router.post("/violation", async (req: Request, res: Response): Promise<void> => {
  // 1. Validate payload with Zod
  const parseResult = ViolationPayloadSchema.safeParse(req.body);

  if (!parseResult.success) {
    const zodError = parseResult.error as ZodError;
    res.status(400).json({
      error: "Invalid payload",
      details: zodError.errors.map((e) => ({
        field: e.path.join("."),
        message: e.message,
      })),
    });
    return;
  }

  const payload = parseResult.data;

  // 2. Enqueue job (with idempotency check)
  const { jobId, deduplicated } = await enqueueTakedownJob(payload);

  if (deduplicated) {
    res.status(202).json({
      message: "Job already in queue for this adId + tenantId combination",
      jobId,
      deduplicated: true,
    });
    return;
  }

  res.status(202).json({
    message: "Takedown job enqueued successfully",
    jobId,
    deduplicated: false,
  });
});

export default router;
