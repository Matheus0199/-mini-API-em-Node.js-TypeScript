import { Worker, Job } from "bullmq";
import { REDIS_CONFIG, QUEUE_NAME } from "../config/redis";
import { TakedownJobData } from "../services/queue.service";

const META_API_ENDPOINT = "https://jsonplaceholder.typicode.com/posts/1";
const REQUEST_TIMEOUT_MS = 5000;

interface TakedownResult {
  success: boolean;
  statusCode: number;
  responseBody: unknown;
  processedAt: string;
}

async function callMetaApi(job: Job<TakedownJobData>): Promise<TakedownResult> {
  const { adId, tenantId, violationType, severity } = job.data;

  console.log(
    `[Worker] Processing job ${job.id} — adId: ${adId}, tenant: ${tenantId}, ` +
    `type: ${violationType}, severity: ${severity}, attempt: ${job.attemptsMade + 1}`
  );

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(META_API_ENDPOINT, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-Ad-Id": adId,
        "X-Tenant-Id": tenantId,
      },
    });
  } catch (err) {
    clearTimeout(timeoutId);
    const isTimeout = (err as Error).name === "AbortError";
    throw new Error(
      isTimeout
        ? `Request timed out after ${REQUEST_TIMEOUT_MS}ms`
        : `Network error: ${(err as Error).message}`
    );
  } finally {
    clearTimeout(timeoutId);
  }

  const responseBody: unknown = await response.json();

  if (!response.ok) {
    // 4xx / 5xx → throw so BullMQ triggers retry
    throw new Error(
      `Meta API returned HTTP ${response.status}: ${JSON.stringify(responseBody)}`
    );
  }

  console.log(`[Worker] Job ${job.id} succeeded — HTTP ${response.status}`);

  return {
    success: true,
    statusCode: response.status,
    responseBody,
    processedAt: new Date().toISOString(),
  };
}

const worker = new Worker<TakedownJobData, TakedownResult>(
  QUEUE_NAME,
  callMetaApi,
  {
    connection: REDIS_CONFIG,
    concurrency: 5,
  }
);

worker.on("completed", (job: Job<TakedownJobData>, result: TakedownResult) => {
  console.log(`[Worker] ✅ Job ${job.id} completed at ${result.processedAt}`);
});

worker.on("failed", (job: Job<TakedownJobData> | undefined, err: Error) => {
  if (!job) return;
  const attemptsLeft = (job.opts.attempts ?? 1) - job.attemptsMade;
  if (attemptsLeft > 0) {
    console.warn(
      `[Worker] ⚠️  Job ${job.id} failed (attempt ${job.attemptsMade}/${job.opts.attempts}): ${err.message}. Retrying...`
    );
  } else {
    console.error(
      `[Worker] ❌ Job ${job.id} exhausted all retries: ${err.message}`
    );
  }
});

worker.on("error", (err: Error) => {
  console.error("[Worker] Unexpected worker error:", err);
});

console.log("[Worker] Takedown worker started — listening for jobs...");

// Graceful shutdown
async function shutdown(): Promise<void> {
  console.log("[Worker] Shutting down gracefully...");
  await worker.close();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
