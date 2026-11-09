import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

function loadEnv(file = process.argv[2] || path.join(process.cwd(), 'tests/phase15/.env.phase15')) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 1) continue;
    const key = line.slice(0, i).trim();
    let value = line.slice(i + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnv();

const firebaseApiKey = process.env.FIREBASE_API_KEY || process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '';
const apiBase = (process.env.API_BASE_URL || 'http://localhost:3001/api').replace(/\/$/, '');
const email = process.env.OWNER_A_EMAIL || '';
const password = process.env.OWNER_A_PASSWORD || '';
const requestCount = Math.max(10, Math.min(1000, Number(process.env.LOAD_REQUESTS || 60)));
const concurrency = Math.max(1, Math.min(50, Number(process.env.LOAD_CONCURRENCY || 6)));
const searchTerm = process.env.LOAD_SEARCH_TERM || '';

if (!firebaseApiKey || !email || !password) {
  console.error('Missing FIREBASE_API_KEY, OWNER_A_EMAIL or OWNER_A_PASSWORD in tests/phase15/.env.phase15');
  process.exit(2);
}

async function signIn() {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(firebaseApiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  const body = await response.json();
  if (!response.ok || !body.idToken) throw new Error(`Firebase login failed: ${body.error?.message || response.status}`);
  return body.idToken;
}
const token = await signIn();
const apiHeaders = { Authorization: `Bearer ${token}` };

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}
async function benchmark(name, makeRequest) {
  const latencies = [];
  let failures = 0;
  let next = 0;
  const start = performance.now();
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= requestCount) break;
      const t0 = performance.now();
      try {
        const response = await makeRequest(i);
        if (!response.ok) failures++;
      } catch {
        failures++;
      } finally {
        latencies.push(performance.now() - t0);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  const totalMs = performance.now() - start;
  latencies.sort((a, b) => a - b);
  const row = {
    name,
    requests: requestCount,
    concurrency,
    failures,
    errorRatePct: Number(((failures / requestCount) * 100).toFixed(2)),
    p50Ms: Math.round(percentile(latencies, 50)),
    p95Ms: Math.round(percentile(latencies, 95)),
    p99Ms: Math.round(percentile(latencies, 99)),
    maxMs: Math.round(latencies.at(-1) || 0),
    throughputRps: Number((requestCount / (totalMs / 1000)).toFixed(2))
  };
  console.log(`${name.padEnd(25)} p50 ${row.p50Ms}ms | p95 ${row.p95Ms}ms | p99 ${row.p99Ms}ms | errors ${row.errorRatePct}% | ${row.throughputRps} req/s`);
  return row;
}

console.log(`\nBrandspire POS — Phase 15 API read-only load smoke (${requestCount} requests, concurrency ${concurrency})\n`);
const q = encodeURIComponent(searchTerm);
const rows = [];
rows.push(await benchmark('Workspace bootstrap', () => fetch(`${apiBase}/pos/workspace`, { headers: apiHeaders })));
rows.push(await benchmark('Product search', () => fetch(`${apiBase}/pos/products?q=${q}&active=true&limit=20`, { headers: apiHeaders })));
rows.push(await benchmark('Customer search', () => fetch(`${apiBase}/pos/customers?q=${q}&active=true&limit=20`, { headers: apiHeaders })));
rows.push(await benchmark('Invoice listing', () => fetch(`${apiBase}/pos/invoices?limit=20`, { headers: apiHeaders })));

const report = {
  generatedAt: new Date().toISOString(),
  target: apiBase,
  requestsPerEndpoint: requestCount,
  concurrency,
  rows
};
fs.mkdirSync(path.join(process.cwd(), 'tests/phase15/results'), { recursive: true });
const reportPath = path.join(process.cwd(), 'tests/phase15/results/load-latest.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`\nReport: ${reportPath}`);
