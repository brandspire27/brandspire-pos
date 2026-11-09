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
  firebaseApiKey: process.env.FIREBASE_API_KEY || process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
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

if (!cfg.firebaseApiKey || !cfg.ownerAEmail || !cfg.ownerAPassword || !cfg.staffEmail || !cfg.staffPassword) {
  console.error('Missing required Phase 15 values. Set FIREBASE_API_KEY, OWNER_A_EMAIL/PASSWORD, and STAFF_EMAIL/PASSWORD in tests/phase15/.env.phase15.');
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
  } catch (error) {
    record(name, 'FAIL', error instanceof Error ? error.message : String(error), performance.now() - t0);
  }
}
function skip(name, detail) { record(name, 'SKIP', detail); }
function assert(condition, message) { if (!condition) throw new Error(message); }

async function signIn(email, password) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(cfg.firebaseApiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.idToken) throw new Error(`Firebase login failed for ${email}: ${body.error?.message || response.status}`);
  return body.idToken;
}

async function api(pathname, token, init = {}) {
  const response = await fetch(`${cfg.api}${pathname}`, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {})
    }
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: response.ok, status: response.status, data };
}

async function workspace(token) {
  const response = await api('/pos/workspace', token);
  assert(response.ok && response.data?.data?.organizationId, `Workspace request failed (${response.status}): ${errorText(response.data)}`);
  return response.data.data;
}

function errorText(data) {
  if (!data) return '';
  if (typeof data === 'string') return data;
  return String(data.message || data.error || JSON.stringify(data));
}

async function createCreditInvoice(token, productId, clientId = crypto.randomUUID()) {
  const response = await api('/pos/invoices', token, {
    method: 'POST',
    body: JSON.stringify({
      customerId: null,
      items: [{ productId, quantity: 1 }],
      discountType: 'PERCENT',
      discountValue: 0,
      paymentMethod: 'CREDIT',
      amountPaid: 0,
      clientInvoiceId: clientId
    })
  });
  assert(response.ok, `Invoice creation failed: ${errorText(response.data)}`);
  const row = response.data?.data;
  assert(row?.invoice_id && row?.invoice_number, 'Invoice API returned no invoice identity');
  return { ...row, clientId };
}

async function cancelInvoice(token, invoiceId) {
  const response = await api(`/pos/invoices/${encodeURIComponent(invoiceId)}/cancel`, token, {
    method: 'POST',
    body: JSON.stringify({ reason: 'Phase 15 automated cleanup' })
  });
  assert(response.ok, `Cleanup cancellation failed: ${errorText(response.data)}`);
}

console.log('\nBrandspire POS — Phase 15 security & reliability checks\n');
const ownerAToken = await signIn(cfg.ownerAEmail, cfg.ownerAPassword);
const staffToken = await signIn(cfg.staffEmail, cfg.staffPassword);
const ownerAWorkspace = await workspace(ownerAToken);
const staffWorkspace = await workspace(staffToken);

await test('API liveness endpoint', async () => {
  const response = await api('/health');
  assert(response.ok && response.data?.status === 'ok', `Expected health=ok, got ${response.status}`);
  return 'API is alive';
});

await test('API readiness / database connectivity', async () => {
  const response = await api('/health/ready');
  assert(response.ok && response.data?.database === 'ok', `Expected database=ok, got ${response.status}: ${errorText(response.data)}`);
  return `DB ${response.data.latencyMs ?? '?'}ms`;
});

await test('Staff cannot enter Owner API', async () => {
  const response = await api('/owner/me', staffToken);
  assert([401, 403].includes(response.status), `Expected 401/403, got ${response.status}`);
  return `blocked with HTTP ${response.status}`;
});

await test('Staff cannot access subscription API', async () => {
  const response = await api('/owner/subscription/overview', staffToken);
  assert([401, 403].includes(response.status), `Expected 401/403, got ${response.status}`);
  return `blocked with HTTP ${response.status}`;
});

await test('Owner cannot enter Admin API', async () => {
  const response = await api('/admin/me', ownerAToken);
  assert([401, 403].includes(response.status), `Expected 401/403, got ${response.status}`);
  return `blocked with HTTP ${response.status}`;
});

await test('Staff cannot enter Admin API', async () => {
  const response = await api('/admin/me', staffToken);
  assert([401, 403].includes(response.status), `Expected 401/403, got ${response.status}`);
  return `blocked with HTTP ${response.status}`;
});

await test('Staff is tenant-bound to Owner A organization', async () => {
  assert(staffWorkspace.organizationId === ownerAWorkspace.organizationId, 'The configured Staff account does not belong to Owner A organization');
  assert(String(staffWorkspace.role).toUpperCase() === 'STAFF', `Expected STAFF role, got ${staffWorkspace.role}`);
  return 'role and organization verified';
});

if (cfg.customerId) {
  await test('Staff cannot delete an owner customer through the API', async () => {
    const before = await api(`/pos/customers/${encodeURIComponent(cfg.customerId)}`, ownerAToken);
    assert(before.ok && before.data?.data?.id === cfg.customerId, 'TEST_CUSTOMER_ID is not visible to Owner A');
    const deletion = await api(`/pos/customers/${encodeURIComponent(cfg.customerId)}`, staffToken, { method: 'DELETE' });
    assert(deletion.status === 403, `Expected 403, got ${deletion.status}`);
    const after = await api(`/pos/customers/${encodeURIComponent(cfg.customerId)}`, ownerAToken);
    assert(after.ok && after.data?.data?.id === cfg.customerId, 'Customer was deleted by Staff');
    return 'owner-only delete rejected and customer remained intact';
  });
} else skip('Staff cannot delete an owner customer through the API', 'set TEST_CUSTOMER_ID to enable');

if (cfg.productId) {
  await test('Staff cannot delete an owner product through the API', async () => {
    const before = await api(`/pos/products/${encodeURIComponent(cfg.productId)}`, ownerAToken);
    assert(before.ok && before.data?.data?.id === cfg.productId, 'TEST_PRODUCT_ID is not visible to Owner A');
    const deletion = await api(`/pos/products/${encodeURIComponent(cfg.productId)}`, staffToken, { method: 'DELETE' });
    assert(deletion.status === 403, `Expected 403, got ${deletion.status}`);
    const after = await api(`/pos/products/${encodeURIComponent(cfg.productId)}`, ownerAToken);
    assert(after.ok && after.data?.data?.id === cfg.productId, 'Product was deleted by Staff');
    return 'owner-only delete rejected and product remained intact';
  });
} else skip('Staff cannot delete an owner product through the API', 'set TEST_PRODUCT_ID to enable');

if (cfg.ownerBEmail && cfg.ownerBPassword) {
  const ownerBToken = await signIn(cfg.ownerBEmail, cfg.ownerBPassword);
  const ownerBWorkspace = await workspace(ownerBToken);
  await test('Owner A and Owner B are separate tenants', async () => {
    assert(ownerBWorkspace.organizationId !== ownerAWorkspace.organizationId, 'Owner B points to the same organization as Owner A');
    return 'different organization UUIDs';
  });

  const bCustomers = await api('/pos/customers?limit=1', ownerBToken);
  const bCustomerId = bCustomers.data?.data?.[0]?.id;
  if (bCustomerId) {
    await test('Owner A cannot read Owner B customer', async () => {
      const response = await api(`/pos/customers/${encodeURIComponent(bCustomerId)}`, ownerAToken);
      assert(response.status === 404, `Expected tenant-scoped 404, got ${response.status}`);
      return 'API returned tenant-scoped 404';
    });
  } else skip('Owner A cannot read Owner B customer', 'Owner B has no customer row to probe');

  const bInvoices = await api('/pos/invoices?limit=1', ownerBToken);
  const bInvoiceId = bInvoices.data?.data?.[0]?.id;
  if (bInvoiceId) {
    await test('Owner A cannot read Owner B invoice', async () => {
      const response = await api(`/pos/invoices/${encodeURIComponent(bInvoiceId)}`, ownerAToken);
      assert(response.status === 404, `Expected tenant-scoped 404, got ${response.status}`);
      return 'API returned tenant-scoped 404';
    });
  } else skip('Owner A cannot read Owner B invoice', 'Owner B has no invoice row to probe');
} else {
  skip('Owner A cannot read Owner B customer', 'configure OWNER_B_EMAIL/PASSWORD to enable cross-tenant test');
  skip('Owner A cannot read Owner B invoice', 'configure OWNER_B_EMAIL/PASSWORD to enable cross-tenant test');
}

if (cfg.mutate && cfg.productId) {
  await test('Staff cannot collect later invoice payments', async () => {
    const invoice = await createCreditInvoice(staffToken, cfg.productId);
    try {
      const response = await api(`/pos/invoices/${encodeURIComponent(invoice.invoice_id)}/payments`, staffToken, {
        method: 'POST',
        body: JSON.stringify({ amount: 1, method: 'CASH', note: 'Unauthorized Staff attempt' })
      });
      assert(response.status === 403, `Expected owner access rejection, got ${response.status}: ${errorText(response.data)}`);
      return 'owner-only payment endpoint rejected Staff';
    } finally {
      await cancelInvoice(ownerAToken, invoice.invoice_id);
    }
  });

  await test('Staff cannot cancel a finalized invoice', async () => {
    const invoice = await createCreditInvoice(staffToken, cfg.productId);
    try {
      const response = await api(`/pos/invoices/${encodeURIComponent(invoice.invoice_id)}/cancel`, staffToken, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Unauthorized Staff cancellation test' })
      });
      assert(response.status === 403, `Expected owner access rejection, got ${response.status}: ${errorText(response.data)}`);
      return 'owner-only cancellation rejected Staff';
    } finally {
      await cancelInvoice(ownerAToken, invoice.invoice_id);
    }
  });

  await test('Concurrent retry with same client_invoice_id is idempotent', async () => {
    const clientId = crypto.randomUUID();
    const [first, second] = await Promise.all([
      createCreditInvoice(ownerAToken, cfg.productId, clientId),
      createCreditInvoice(ownerAToken, cfg.productId, clientId)
    ]);
    assert(first.invoice_id === second.invoice_id, `Different invoice IDs returned: ${first.invoice_id} vs ${second.invoice_id}`);
    assert(first.invoice_number === second.invoice_number, `Different invoice numbers returned: ${first.invoice_number} vs ${second.invoice_number}`);
    await cancelInvoice(ownerAToken, first.invoice_id);
    return `${first.invoice_number} returned by both requests`;
  });

  await test(`Concurrent invoice numbering stays unique (${cfg.concurrentCount} bills)`, async () => {
    const ids = Array.from({ length: cfg.concurrentCount }, () => crypto.randomUUID());
    const invoices = await Promise.all(ids.map((id) => createCreditInvoice(ownerAToken, cfg.productId, id)));
    try {
      const numbers = invoices.map((invoice) => invoice.invoice_number);
      assert(new Set(numbers).size === numbers.length, `Duplicate invoice number detected: ${numbers.join(', ')}`);
      return `${numbers.length} unique numbers`;
    } finally {
      for (const invoice of invoices) await cancelInvoice(ownerAToken, invoice.invoice_id);
    }
  });
} else {
  skip('Staff cannot collect later invoice payments', 'set RUN_MUTATING_TESTS=true and TEST_PRODUCT_ID to enable');
  skip('Staff cannot cancel a finalized invoice', 'set RUN_MUTATING_TESTS=true and TEST_PRODUCT_ID to enable');
  skip('Concurrent retry with same client_invoice_id is idempotent', 'set RUN_MUTATING_TESTS=true and TEST_PRODUCT_ID to enable');
  skip('Concurrent invoice numbering stays unique', 'set RUN_MUTATING_TESTS=true and TEST_PRODUCT_ID to enable');
}

const failed = results.filter((result) => result.status === 'FAIL');
const passed = results.filter((result) => result.status === 'PASS');
const skipped = results.filter((result) => result.status === 'SKIP');
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
