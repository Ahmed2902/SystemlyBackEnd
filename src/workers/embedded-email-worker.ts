import { run } from "graphile-worker";
import { captureException } from "../shared/observability/sentry";
import taskList from "./task-list";

export type EmailWorkerFatalHandler = (error: unknown) => void;

type WorkerRunner = Awaited<ReturnType<typeof run>>;

function resolveConnectionString(): string {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required by Graphile Worker");
  }
  return connectionString;
}

export class EmbeddedEmailWorker {
  private runner: WorkerRunner | null = null;
  private starting: Promise<void> | null = null;
  private stopping = false;
  private ready = false;

  isReady(): boolean {
    return this.ready;
  }

  async start(onFatal: EmailWorkerFatalHandler): Promise<void> {
    if (this.runner) return;
    if (this.starting) return this.starting;

    this.starting = this.startInternal(onFatal).finally(() => {
      this.starting = null;
    });

    return this.starting;
  }

  private async startInternal(onFatal: EmailWorkerFatalHandler): Promise<void> {
    this.stopping = false;
    const runner = await run({
      connectionString: resolveConnectionString(),
      concurrency: 1,
      noHandleSignals: true,
      taskList,
    });

    this.runner = runner;
    this.ready = true;

    void runner.promise.catch((error: unknown) => {
      this.ready = false;
      this.runner = null;
      if (this.stopping) return;

      captureException(error, "email-worker", {
        failure_type: "runner",
      });
      onFatal(error);
    });
  }

  async stop(): Promise<void> {
    this.stopping = true;
    this.ready = false;

    const runner = this.runner;
    this.runner = null;
    if (!runner) return;

    await runner.stop();
  }
}

export const embeddedEmailWorker = new EmbeddedEmailWorker();
