import { Router, Request, Response } from "express";
import { getJobStatus } from "../services/queue.service";

const router = Router();

/**
 * GET /jobs/:id
 * Returns the current status of a BullMQ job.
 */
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  const status = await getJobStatus(id);

  if (!status) {
    res.status(404).json({ error: `Job '${id}' not found` });
    return;
  }

  res.status(200).json(status);
});

export default router;
