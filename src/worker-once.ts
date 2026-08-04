import "./shared/config/env";

import { runOnce } from "graphile-worker";
import { closeWorkerUtils } from "./queues/queue";
import redis from "./shared/config/redis";
import { prisma } from "./shared/db/prisma";
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

main().catch((error) => {
  console.error("[WorkerOnce] Failed", error);
  process.exitCode = 1;
});
