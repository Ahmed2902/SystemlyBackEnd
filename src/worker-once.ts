import "./instrument-worker-once";

import { runOnce } from "graphile-worker";
import { closeWorkerUtils } from "./queues/queue";
import redis from "./shared/config/redis";
import { prisma } from "./shared/db/prisma";
import {
  captureException,
  flushSentry,
} from "./shared/observability/sentry";
import taskList from "./workers/task-list";
import { runOneShotWorker } from "./workers/worker-runtime";

async function main() {
  await runOneShotWorker({
    runJobsOnce: runOnce,
    taskList,
    resources: [
      { name: "worker utilities", close: closeWorkerUtils },
      { name: "Prisma", close: () => prisma.$disconnect() },
      { name: "Redis", close: () => redis.disconnect() },
    ],
  });
}

main().catch(async (error) => {
  console.error("[WorkerOnce] Failed", error);
  captureException(error, "worker-once", { failure_type: "execution" });
  await flushSentry();
  process.exitCode = 1;
});
