import { ConnectionOptions } from "bullmq";

export const REDIS_CONFIG: ConnectionOptions = {
  host: process.env.REDIS_HOST ?? "localhost",
  port: Number(process.env.REDIS_PORT ?? 6379),
  password: process.env.REDIS_PASSWORD ?? undefined,
  maxRetriesPerRequest: null, // required by BullMQ
};

export const QUEUE_NAME = "takedown";

export const TAKEDOWN_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: "exponential" as const,
    delay: 2000, // 2s → 4s → 8s
  },
  removeOnComplete: false, // keep for status queries
  removeOnFail: false,
};
