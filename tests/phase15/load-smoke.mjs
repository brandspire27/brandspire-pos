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

const supabase = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const anon = process.env.SUPABASE_ANON_KEY || '';
const apiBase = (process.env.API_BASE_URL || 'http://localhost:3001/api').replace(/\/$/, '');
const email = process.env.OWNER_A_EMAIL || '';
const password = process.env.OWNER_A_PASSWORD || '';
const requestCount = Math.max(10, Math.min(1000, Number(process.env.LOAD_REQUESTS || 60)));
const concurrency = Math.max(1, Math.min(50, Number(process.env.LOAD_CONCURRENCY || 6)));
const searchTerm = process.env.LOAD_SEARCH_TERM || '';

if (!supabase || !anon || !email || !password) {
  console.error('Missing SUPABASE_URL, SUPABASE_ANON_KEY, OWNER_A_EMAIL or OWNER_A_PASSWORD in tests/phase15/.env.phase15');
  process.exit(2);
}

async function signIn() {
  const r = await fetch(`${supabase}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password })
  });
  const body = await r.json();
  if (!r.ok || !body.access_token) throw new Error(`Login failed: ${body.error_description || body.msg || r.status}`);
  return body.access_token;
}
const token = await signIn();
const sbHeaders = { apikey: anon, Authorization: `Bearer ${token}` };

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
        const r = await makeRequest(i);
        if (!r.ok) failures++;
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

console.log(`\nBrandspire POS — Phase 15 local/staging read-only load smoke (${requestCount} requests, concurrency ${concurrency})\n`);
const rows = [];
rows.push(await benchmark('API health', () => fetch(`${apiBase}/health`)));
rows.push(await benchmark('API readiness', () => fetch(`${apiBase}/health/ready`)));
rows.push(await benchmark('Workspace bootstrap', () => fetch(`${supabase}/rest/v1/rpc/get_current_workspace`, {
  method: 'POST', headers: { ...sbHeaders, 'Content-Type': 'application/json' }, body: '{}'
})));
const q = encodeURIComponent(`*${searchTerm}*`);
rows.push(await benchmark('Product search', () => fetch(`${supabase}/rest/v1/products?select=id,name,sku,barcode,selling_price,stock&active=eq.true&deleted_at=is.null&name=ilike.${q}&limit=20`, { headers: sbHeaders })));
rows.push(await benchmark('Customer search', () => fetch(`${supabase}/rest/v1/customers?select=id,name,phone,outstanding_balance&active=eq.true&deleted_at=is.null&name=ilike.${q}&limit=20`, { headers: sbHeaders })));
rows.push(await benchmark('Invoice listing', () => fetch(`${supabase}/rest/v1/invoices?select=id,invoice_number,status,grand_total,created_at&order=created_at.desc&limit=20`, { headers: sbHeaders })));

const report = { generatedAt: new Date().toISOString(), mode: 'read-only-local-smoke', requestCount, concurrency, results: rows };
fs.mkdirSync(path.join(process.cwd(), 'tests/phase15/results'), { recursive: true });
const reportPath = path.join(process.cwd(), 'tests/phase15/results/load-latest.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`\nReport: ${reportPath}`);
console.log('Important: this local smoke test does NOT prove 10,000-tenant capacity. Production-scale claims require staged distributed load tests plus DB/CPU/memory/connection/queue monitoring.\n');
