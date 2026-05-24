import { Queue, Job } from "bullmq";
import { REDIS_CONFIG, QUEUE_NAME, TAKEDOWN_JOB_OPTIONS } from "../config/redis";
import { ViolationPayload } from "../schemas/violation.schema";

export type TakedownJobData = ViolationPayload;

export interface JobStatusResult {
  jobId: string;
  status: string;
  attempts: number;
  result: unknown;
  error: string | null;
}

let queueInstance: Queue<TakedownJobData> | null = null;

export function getTakedownQueue(): Queue<TakedownJobData> {
  if (!queueInstance) {
    queueInstance = new Queue<TakedownJobData>(QUEUE_NAME, {
      connection: REDIS_CONFIG,
    });
  }
  return queueInstance;
}

/**
 * Idempotency key: same adId + tenantId won't create duplicate active jobs.
 * BullMQ's jobId deduplication ensures that if a job with the same ID already
 * exists in waiting/active/delayed states, a new one is NOT enqueued.
 */
function buildJobId(adId: string, tenantId: string): string {
  return `takedown:${tenantId}:${adId}`;
}

export async function enqueueTakedownJob(
  payload: ViolationPayload
): Promise<{ jobId: string; deduplicated: boolean }> {
  const queue = getTakedownQueue();
  const jobId = buildJobId(payload.adId, payload.tenantId);

  // Check if an active/waiting job already exists for this adId+tenantId
  const existingJob = await queue.getJob(jobId);
  if (existingJob) {
    const state = await existingJob.getState();
    const activeStates = ["waiting", "active", "delayed", "waiting-children"];
    if (activeStates.includes(state)) {
      return { jobId, deduplicated: true };
    }
  }

  await queue.add(QUEUE_NAME, payload, {
    ...TAKEDOWN_JOB_OPTIONS,
    jobId, // BullMQ uses this for deduplication at queue level
  });

  return { jobId, deduplicated: false };
}

export async function getJobStatus(jobId: string): Promise<JobStatusResult | null> {
  const queue = getTakedownQueue();
  const job: Job<TakedownJobData> | undefined = await queue.getJob(jobId);

  if (!job) return null;

  const state = await job.getState();

  return {
    jobId: job.id ?? jobId,
    status: state,
    attempts: job.attemptsMade,
    result: job.returnvalue ?? null,
    error: job.failedReason ?? null,
  };
}
