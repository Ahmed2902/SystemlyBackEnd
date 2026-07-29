const { performance } = require("node:perf_hooks");

const baseUrl = (
  process.env.BENCHMARK_BASE_URL || "http://localhost:3003"
).replace(/\/$/, "");
const token = process.env.BENCHMARK_TOKEN || "";
const iterations = Number(process.env.BENCHMARK_ITERATIONS || 5);
const date =
  process.env.BENCHMARK_DATE || new Date().toISOString().slice(0, 10);

const endpoints = (
  process.env.BENCHMARK_ENDPOINTS ||
  [
    "/api/calendar/workspace?date=" + encodeURIComponent(date),
    "/api/appointments?page=1&perPage=20&date=" + encodeURIComponent(date),
    "/api/staff?page=1&perPage=24",
    "/api/services?status=active",
    "/api/customers?page=1&perPage=20",
    "/api/invoices?page=1&perPage=30",
  ].join(",")
)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

function percentile(values, ratio) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[
    Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)
  ];
}

async function timeEndpoint(path) {
  const samples = [];
  for (let index = 0; index < iterations; index += 1) {
    const startedAt = performance.now();
    const response = await fetch(baseUrl + path, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const body = await response.text();
    const durationMs = Math.round((performance.now() - startedAt) * 100) / 100;
    samples.push(durationMs);

    if (!response.ok) {
      throw new Error(
        `${path} returned ${response.status}: ${body.slice(0, 300)}`,
      );
    }
  }

  return {
    endpoint: path,
    iterations,
    minMs: Math.min(...samples),
    medianMs: percentile(samples, 0.5),
    p95Ms: percentile(samples, 0.95),
    maxMs: Math.max(...samples),
  };
}

async function run() {
  const results = [];
  for (const endpoint of endpoints) {
    results.push(await timeEndpoint(endpoint));
  }
  console.table(results);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
