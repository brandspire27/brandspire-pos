import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import crypto from 'node:crypto';

function loadEnv(file = process.argv[2] || path.join(process.cwd(), 'tests/phase15/.env.phase15')) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx < 1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnv();

const cfg = {
  supabase: (process.env.SUPABASE_URL || '').replace(/\/$/, ''),
  anon: process.env.SUPABASE_ANON_KEY || '',
  api: (process.env.API_BASE_URL || 'http://localhost:3001/api').replace(/\/$/, ''),
  ownerAEmail: process.env.OWNER_A_EMAIL || '',
  ownerAPassword: process.env.OWNER_A_PASSWORD || '',
  staffEmail: process.env.STAFF_EMAIL || '',
  staffPassword: process.env.STAFF_PASSWORD || '',
  ownerBEmail: process.env.OWNER_B_EMAIL || '',
  ownerBPassword: process.env.OWNER_B_PASSWORD || '',
  customerId: process.env.TEST_CUSTOMER_ID || '',
  productId: process.env.TEST_PRODUCT_ID || '',
  mutate: String(process.env.RUN_MUTATING_TESTS || 'false').toLowerCase() === 'true',
  concurrentCount: Math.max(2, Math.min(20, Number(process.env.CONCURRENT_INVOICE_COUNT || 5)))
};

if (!cfg.supabase || !cfg.anon || !cfg.ownerAEmail || !cfg.ownerAPassword || !cfg.staffEmail || !cfg.staffPassword) {
  console.error('Missing required Phase 15 environment values. Copy tests/phase15/.env.phase15.example to tests/phase15/.env.phase15 and fill SUPABASE_URL, SUPABASE_ANON_KEY, OWNER_A_* and STAFF_* values.');
  process.exit(2);
}

const results = [];
function record(name, status, detail = '', ms = 0) {
  results.push({ name, status, detail, ms: Math.round(ms) });
  const icon = status === 'PASS' ? '✓' : status === 'SKIP' ? '○' : '✗';
  console.log(`${icon} ${status.padEnd(4)} ${name}${detail ? ` — ${detail}` : ''}${ms ? ` (${Math.round(ms)}ms)` : ''}`);
}
async function test(name, fn) {
  const t0 = performance.now();
  try {
    const detail = await fn();
    record(name, 'PASS', detail || '', performance.now() - t0);
  } catch (e) {
    record(name, 'FAIL', e instanceof Error ? e.message : String(e), performance.now() - t0);
  }
}
function skip(name, detail) { record(name, 'SKIP', detail); }
function assert(condition, message) { if (!condition) throw new Error(message); }

async function signIn(email, password) {
  const r = await fetch(`${cfg.supabase}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: cfg.anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok || !body.access_token) throw new Error(`Login failed for ${email}: ${body.error_description || body.msg || r.status}`);
  return body.access_token;
}
function sbHeaders(token, extra = {}) {
  return { apikey: cfg.anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...extra };
}
async function rpc(name, body, token) {
  const r = await fetch(`${cfg.supabase}/rest/v1/rpc/${name}`, { method: 'POST', headers: sbHeaders(token), body: JSON.stringify(body || {}) });
  const text = await r.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: r.ok, status: r.status, data };
}
async function rest(resourceAndQuery, token, init = {}) {
  const r = await fetch(`${cfg.supabase}/rest/v1/${resourceAndQuery}`, { ...init, headers: sbHeaders(token, init.headers || {}) });
  const text = await r.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: r.ok, status: r.status, data };
}
async function api(pathname, token, init = {}) {
  const r = await fetch(`${cfg.api}${pathname}`, {
    ...init,
    headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) }
  });
  const text = await r.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: r.ok, status: r.status, data };
}
async function workspace(token) {
  const r = await rpc('get_current_workspace', {}, token);
  assert(r.ok, `get_current_workspace failed (${r.status})`);
  const row = Array.isArray(r.data) ? r.data[0] : r.data;
  assert(row?.organization_id, 'No organization_id returned by workspace RPC');
  return row;
}
function errorText(data) {
  if (!data) return '';
  if (typeof data === 'string') return data;
  return String(data.message || data.error || data.msg || JSON.stringify(data));
}
async function createCreditInvoice(token, orgId, productId, clientId = crypto.randomUUID()) {
  const r = await rpc('create_pos_invoice', {
    p_organization_id: orgId,
    p_customer_id: null,
    p_items: [{ product_id: productId, quantity: 1 }],
    p_discount_type: 'PERCENT',
    p_discount_value: 0,
    p_payment_method: 'CREDIT',
    p_amount_paid: 0,
    p_client_invoice_id: clientId
  }, token);
  assert(r.ok, `Invoice RPC failed: ${errorText(r.data)}`);
  const row = Array.isArray(r.data) ? r.data[0] : r.data;
  assert(row?.invoice_id && row?.invoice_number, 'Invoice RPC returned no invoice identity');
  return { ...row, clientId };
}
async function cancelInvoice(token, orgId, invoiceId, reason = 'Phase 15 automated cleanup') {
  const r = await rpc('cancel_pos_invoice', { p_organization_id: orgId, p_invoice_id: invoiceId, p_reason: reason }, token);
  assert(r.ok, `Cleanup cancellation failed: ${errorText(r.data)}`);
}

console.log('\nBrandspire POS — Phase 15 security & reliability checks\n');
const ownerAToken = await signIn(cfg.ownerAEmail, cfg.ownerAPassword);
const staffToken = await signIn(cfg.staffEmail, cfg.staffPassword);
const ownerAWorkspace = await workspace(ownerAToken);
const staffWorkspace = await workspace(staffToken);

await test('API liveness endpoint', async () => {
  const r = await api('/health');
  assert(r.ok && r.data?.status === 'ok', `Expected health=ok, got ${r.status}`);
  return 'API is alive';
});

await test('API readiness / database connectivity', async () => {
  const r = await api('/health/ready');
  assert(r.ok && r.data?.database === 'ok', `Expected database=ok, got ${r.status}: ${errorText(r.data)}`);
  return `DB ${r.data.latencyMs ?? '?'}ms`;
});

await test('Staff cannot enter Owner API', async () => {
  const r = await api('/owner/me', staffToken);
  assert([401, 403].includes(r.status), `Expected 401/403, got ${r.status}`);
  return `blocked with HTTP ${r.status}`;
});

await test('Staff cannot access subscription API', async () => {
  const r = await api('/owner/subscription/overview', staffToken);
  assert([401, 403].includes(r.status), `Expected 401/403, got ${r.status}`);
  return `blocked with HTTP ${r.status}`;
});

await test('Owner cannot enter Admin API', async () => {
  const r = await api('/admin/me', ownerAToken);
  assert([401, 403].includes(r.status), `Expected 401/403, got ${r.status}`);
  return `blocked with HTTP ${r.status}`;
});

await test('Staff cannot enter Admin API', async () => {
  const r = await api('/admin/me', staffToken);
  assert([401, 403].includes(r.status), `Expected 401/403, got ${r.status}`);
  return `blocked with HTTP ${r.status}`;
});

await test('Staff is tenant-bound to Owner A organization', async () => {
  assert(staffWorkspace.organization_id === ownerAWorkspace.organization_id, 'The configured Staff account does not belong to Owner A organization');
  assert(String(staffWorkspace.role).toUpperCase() === 'STAFF', `Expected STAFF role, got ${staffWorkspace.role}`);
  return 'role and organization verified';
});

if (cfg.customerId) {
  await test('Staff cannot delete a customer through REST/RLS', async () => {
    const before = await rest(`customers?id=eq.${encodeURIComponent(cfg.customerId)}&select=id`, ownerAToken);
    assert(before.ok && Array.isArray(before.data) && before.data.length === 1, 'TEST_CUSTOMER_ID is not visible to Owner A');
    await rest(`customers?id=eq.${encodeURIComponent(cfg.customerId)}`, staffToken, { method: 'DELETE', headers: { Prefer: 'return=representation' } });
    const after = await rest(`customers?id=eq.${encodeURIComponent(cfg.customerId)}&select=id`, ownerAToken);
    assert(after.ok && Array.isArray(after.data) && after.data.length === 1, 'Customer was deleted by Staff');
    return 'record remained intact';
  });
} else skip('Staff cannot delete a customer through REST/RLS', 'set TEST_CUSTOMER_ID to enable');

if (cfg.productId) {
  await test('Staff cannot delete a product through REST/RLS', async () => {
    const before = await rest(`products?id=eq.${encodeURIComponent(cfg.productId)}&select=id`, ownerAToken);
    assert(before.ok && Array.isArray(before.data) && before.data.length === 1, 'TEST_PRODUCT_ID is not visible to Owner A');
    await rest(`products?id=eq.${encodeURIComponent(cfg.productId)}`, staffToken, { method: 'DELETE', headers: { Prefer: 'return=representation' } });
    const after = await rest(`products?id=eq.${encodeURIComponent(cfg.productId)}&select=id`, ownerAToken);
    assert(after.ok && Array.isArray(after.data) && after.data.length === 1, 'Product was deleted by Staff');
    return 'record remained intact';
  });
} else skip('Staff cannot delete a product through REST/RLS', 'set TEST_PRODUCT_ID to enable');

if (cfg.ownerBEmail && cfg.ownerBPassword) {
  const ownerBToken = await signIn(cfg.ownerBEmail, cfg.ownerBPassword);
  const ownerBWorkspace = await workspace(ownerBToken);
  await test('Owner A and Owner B are separate tenants', async () => {
    assert(ownerBWorkspace.organization_id !== ownerAWorkspace.organization_id, 'Owner B points to the same organization as Owner A');
    return 'different organization UUIDs';
  });

  const bCustomer = await rest('customers?select=id,organization_id&limit=1', ownerBToken);
  if (bCustomer.ok && Array.isArray(bCustomer.data) && bCustomer.data[0]?.id) {
    await test('Owner A cannot read Owner B customer', async () => {
      const r = await rest(`customers?id=eq.${encodeURIComponent(bCustomer.data[0].id)}&select=id,organization_id`, ownerAToken);
      assert(r.ok && Array.isArray(r.data) && r.data.length === 0, `Cross-tenant customer leaked: ${JSON.stringify(r.data)}`);
      return 'RLS returned zero rows';
    });
  } else skip('Owner A cannot read Owner B customer', 'Owner B has no customer row to probe');

  const bInvoice = await rest('invoices?select=id,organization_id&limit=1', ownerBToken);
  if (bInvoice.ok && Array.isArray(bInvoice.data) && bInvoice.data[0]?.id) {
    await test('Owner A cannot read Owner B invoice', async () => {
      const r = await rest(`invoices?id=eq.${encodeURIComponent(bInvoice.data[0].id)}&select=id,organization_id`, ownerAToken);
      assert(r.ok && Array.isArray(r.data) && r.data.length === 0, `Cross-tenant invoice leaked: ${JSON.stringify(r.data)}`);
      return 'RLS returned zero rows';
    });
  } else skip('Owner A cannot read Owner B invoice', 'Owner B has no invoice row to probe');
} else {
  skip('Owner A cannot read Owner B customer', 'configure OWNER_B_EMAIL/PASSWORD to enable cross-tenant test');
  skip('Owner A cannot read Owner B invoice', 'configure OWNER_B_EMAIL/PASSWORD to enable cross-tenant test');
}

if (cfg.mutate && cfg.productId) {
  await test('Staff cannot collect later invoice payment', async () => {
    const inv = await createCreditInvoice(staffToken, ownerAWorkspace.organization_id, cfg.productId);
    try {
      const attempt = await rpc('collect_invoice_payment', {
        p_organization_id: ownerAWorkspace.organization_id,
        p_invoice_id: inv.invoice_id,
        p_amount: 1,
        p_method: 'CASH',
        p_note: 'Phase 15 unauthorized Staff attempt'
      }, staffToken);
      assert(!attempt.ok && /owner access required/i.test(errorText(attempt.data)), `Expected Owner access rejection, got ${attempt.status}: ${errorText(attempt.data)}`);
      return 'Owner-only RPC rejected Staff';
    } finally {
      await cancelInvoice(ownerAToken, ownerAWorkspace.organization_id, inv.invoice_id);
    }
  });

  await test('Staff cannot cancel a finalized invoice', async () => {
    const inv = await createCreditInvoice(staffToken, ownerAWorkspace.organization_id, cfg.productId);
    try {
      const attempt = await rpc('cancel_pos_invoice', {
        p_organization_id: ownerAWorkspace.organization_id,
        p_invoice_id: inv.invoice_id,
        p_reason: 'Unauthorized Staff cancellation test'
      }, staffToken);
      assert(!attempt.ok && /owner access required/i.test(errorText(attempt.data)), `Expected Owner access rejection, got ${attempt.status}: ${errorText(attempt.data)}`);
      return 'Owner-only cancellation rejected Staff';
    } finally {
      await cancelInvoice(ownerAToken, ownerAWorkspace.organization_id, inv.invoice_id);
    }
  });

  await test('Concurrent retry with same client_invoice_id is idempotent', async () => {
    const clientId = crypto.randomUUID();
    const [a, b] = await Promise.all([
      createCreditInvoice(ownerAToken, ownerAWorkspace.organization_id, cfg.productId, clientId),
      createCreditInvoice(ownerAToken, ownerAWorkspace.organization_id, cfg.productId, clientId)
    ]);
    assert(a.invoice_id === b.invoice_id, `Different invoice IDs returned: ${a.invoice_id} vs ${b.invoice_id}`);
    assert(a.invoice_number === b.invoice_number, `Different invoice numbers returned: ${a.invoice_number} vs ${b.invoice_number}`);
    await cancelInvoice(ownerAToken, ownerAWorkspace.organization_id, a.invoice_id);
    return `${a.invoice_number} returned by both requests`;
  });

  await test(`Concurrent invoice numbering stays unique (${cfg.concurrentCount} bills)`, async () => {
    const ids = Array.from({ length: cfg.concurrentCount }, () => crypto.randomUUID());
    const invoices = await Promise.all(ids.map((id) => createCreditInvoice(ownerAToken, ownerAWorkspace.organization_id, cfg.productId, id)));
    try {
      const numbers = invoices.map((x) => x.invoice_number);
      assert(new Set(numbers).size === numbers.length, `Duplicate invoice number detected: ${numbers.join(', ')}`);
      return `${numbers.length} unique numbers`;
    } finally {
      for (const inv of invoices) await cancelInvoice(ownerAToken, ownerAWorkspace.organization_id, inv.invoice_id);
    }
  });
} else {
  skip('Staff cannot collect later invoice payment', 'set RUN_MUTATING_TESTS=true and TEST_PRODUCT_ID to enable');
  skip('Staff cannot cancel a finalized invoice', 'set RUN_MUTATING_TESTS=true and TEST_PRODUCT_ID to enable');
  skip('Concurrent retry with same client_invoice_id is idempotent', 'set RUN_MUTATING_TESTS=true and TEST_PRODUCT_ID to enable');
  skip('Concurrent invoice numbering stays unique', 'set RUN_MUTATING_TESTS=true and TEST_PRODUCT_ID to enable');
}

const failed = results.filter((r) => r.status === 'FAIL');
const passed = results.filter((r) => r.status === 'PASS');
const skipped = results.filter((r) => r.status === 'SKIP');
const report = {
  generatedAt: new Date().toISOString(),
  project: 'Brandspire POS',
  phase: 15,
  summary: { passed: passed.length, failed: failed.length, skipped: skipped.length },
  results
};
fs.mkdirSync(path.join(process.cwd(), 'tests/phase15/results'), { recursive: true });
const reportPath = path.join(process.cwd(), 'tests/phase15/results/security-latest.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`\nSummary: ${passed.length} passed, ${failed.length} failed, ${skipped.length} skipped`);
console.log(`Report: ${reportPath}\n`);
process.exit(failed.length ? 1 : 0);
