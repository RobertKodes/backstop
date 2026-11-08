import type { Logger } from "pino";

export interface JobStatus {
  name: string;
  intervalMs: number;
  runs: number;
  failures: number;
  consecutiveFailures: number;
  lastRunAt?: string;
  lastOkAt?: string;
  lastError?: string;
  lastResult?: unknown;
  running: boolean;
}

export type Alert = (msg: string) => Promise<void>;

/** Fixed-interval job runner with jitter, overlap protection, failure streak alerts. */
export class Scheduler {
  readonly jobs = new Map<string, JobStatus>();
  private timers: NodeJS.Timeout[] = [];

  constructor(
    private readonly log: Logger,
    private readonly alert: Alert,
    private readonly alertAfter = 3,
  ) {}

  add(name: string, intervalMs: number, fn: () => Promise<unknown>) {
    const st: JobStatus = { name, intervalMs, runs: 0, failures: 0, consecutiveFailures: 0, running: false };
    this.jobs.set(name, st);
    const tick = async () => {
      if (st.running) return;
      st.running = true;
      st.lastRunAt = new Date().toISOString();
      try {
        st.lastResult = await fn();
        st.runs++;
        st.consecutiveFailures = 0;
        st.lastOkAt = new Date().toISOString();
      } catch (e) {
        st.runs++;
        st.failures++;
        st.consecutiveFailures++;
        st.lastError = e instanceof Error ? e.message : String(e);
        this.log.error({ job: name, err: st.lastError }, "job failed");
        if (st.consecutiveFailures === this.alertAfter) {
          await this.alert(`keeper job ${name} failed ${this.alertAfter}× in a row: ${st.lastError}`).catch(() => undefined);
        }
      } finally {
        st.running = false;
      }
    };
    const jitter = Math.floor(Math.random() * Math.min(5_000, intervalMs / 4));
    this.timers.push(setTimeout(() => void tick(), jitter));
    this.timers.push(setInterval(() => void tick(), intervalMs));
  }

  stop() {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
  }

  status(): JobStatus[] {
    return [...this.jobs.values()];
  }
}

export function webhookAlert(url: string | undefined, log: Logger): Alert {
  return async (msg: string) => {
    log.warn({ alert: msg }, "ALERT");
    if (!url) return;
    await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: msg, content: msg }) });
  };
}
