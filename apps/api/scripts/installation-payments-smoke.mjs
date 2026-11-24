import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { fileURLToPath } from 'node:url';
import { applyMigrations } from './db-migrate.mjs';

Object.assign(process.env, {
  APP_ENV: 'development',
  FIREBASE_PROJECT_ID: 'test',
  TURSO_DATABASE_URL: 'file::memory:',
  TURSO_AUTH_TOKEN: 'test',
  API_PUBLIC_URL: 'https://api.example.test',
  WEB_URL: 'https://web.example.test',
  CASHFREE_CLIENT_ID: 'test-client',
  CASHFREE_CLIENT_SECRET: 'test-secret',
  CASHFREE_ENV: 'sandbox'
});

const { AuthService } = await import('../dist/auth/auth.service.js');
const { InstallationPaymentsService } = await import('../dist/payments/installation-payments.service.js');
const { AdminService } = await import('../dist/admin/admin.service.js');
const client = createClient({ url: 'file::memory:' });
const database = {
  execute: (sql, args = []) => client.execute({ sql, args }),
  async transaction(work) {
    const tx = await client.transaction('write');
    try {
      const result = await work({ execute: query => tx.execute(query) });
      await tx.commit();
      return result;
    } catch (error) {
      await tx.rollback();
      throw error;
    } finally {
      tx.close();
    }
  }
};

const orderStates = new Map();
const provider = {
  isConfigured: () => true,
  getEnvironment: () => 'sandbox',
  async request(path, init) {
    if (init?.method === 'POST') {
      const payload = JSON.parse(init.body);
      orderStates.set(payload.order_id, { status: 'ACTIVE', amount: payload.order_amount, currency: payload.order_currency });
      return { order_id: payload.order_id, payment_session_id: `session_${payload.order_id}` };
    }
    const orderId = path.split('/')[2];
    const order = orderStates.get(orderId);
    if (path.endsWith('/payments')) {
      return [{
        cf_payment_id: `payment_${orderId}`,
        payment_status: 'SUCCESS',
        payment_amount: order.amount,
        payment_currency: order.currency,
        payment_time: '2026-11-24T00:00:00Z',
        payment_group: 'upi'
      }];
    }
    return { order_id: orderId, order_status: order.status, order_amount: order.amount, order_currency: order.currency };
  }
};

function applicationInput(installationPaymentMethod, installationPackageCode = 'SCH_58MM') {
  return {
    ownerName: 'Owner Name',
    businessName: `Business ${installationPaymentMethod}`,
    phone: '9876543210',
    businessType: 'Retail',
    gstin: '',
    state: 'Delhi',
    address: '1 Test Street',
    preferredLanguage: 'en',
    installationPackageCode,
    installationPaymentMethod,
    termsVersion: 'TEST_V1',
    termsAccepted: true
  };
}

function firebaseRequest(uid, email) {
  return { firebaseUid: uid, firebaseEmail: email };
}

try {
  await applyMigrations(client, fileURLToPath(new URL('../migrations', import.meta.url)));
  await client.execute(
    `INSERT INTO user_profiles(firebase_uid, email) VALUES ('admin', 'admin@example.test')`
  );
  const auth = new AuthService(database);
  const cashfreeApplication = await auth.submitOwnerApplication(
    firebaseRequest('cashfree-owner', 'cashfree@example.test'),
    applicationInput('CASHFREE')
  );
  const cashApplication = await auth.submitOwnerApplication(
    firebaseRequest('cash-owner', 'cash@example.test'),
    applicationInput('CASH_ON_INSTALLATION', 'AUTO_CUTTER_80MM')
  );
  for (const [uid, code, amount] of [
    ['standard-58-owner', 'STANDARD_58MM', 3099],
    ['standard-80-owner', 'STANDARD_80MM', 3999]
  ]) {
    const submitted = await auth.submitOwnerApplication(
      firebaseRequest(uid, `${uid}@example.test`),
      applicationInput('CASH_ON_INSTALLATION', code)
    );
    const selected = (await client.execute(
      `SELECT installation_amount FROM owner_applications WHERE id = ?`,
      [submitted.applicationId]
    )).rows[0];
    assert.equal(Number(selected.installation_amount), amount);
  }

  const cashfreeRow = (await client.execute(
    `SELECT installation_package_code, installation_amount, installation_payment_method
     FROM owner_applications WHERE id = ?`,
    [cashfreeApplication.applicationId]
  )).rows[0];
  assert.deepEqual(
    [cashfreeRow.installation_package_code, Number(cashfreeRow.installation_amount), cashfreeRow.installation_payment_method],
    ['SCH_58MM', 2199, 'CASHFREE']
  );
  const cashRow = (await client.execute(
    `SELECT s.status, s.amount FROM installation_checkout_sessions s WHERE s.application_id = ?`,
    [cashApplication.applicationId]
  )).rows[0];
  assert.deepEqual([cashRow.status, Number(cashRow.amount)], ['DUE', 4999]);

  const installationPayments = new InstallationPaymentsService(database, provider);
  const admin = new AdminService(database, installationPayments);
  const checkout = await installationPayments.checkout('cashfree-owner');
  assert.equal(checkout.amount, 2199);
  assert.equal(checkout.currency, 'INR');
  assert.equal(checkout.alreadyPaid, false);
  assert.equal((await installationPayments.checkout('cashfree-owner')).orderId, checkout.orderId);
  await assert.rejects(
    installationPayments.verify('another-owner', { orderId: checkout.orderId }),
    /not found/
  );
  orderStates.set(checkout.orderId, { status: 'PAID', amount: 1, currency: 'INR' });
  await assert.rejects(
    installationPayments.verify('cashfree-owner', { orderId: checkout.orderId }),
    /amount or currency mismatch/
  );
  orderStates.set(checkout.orderId, { status: 'ACTIVE', amount: 2199, currency: 'INR' });
  assert.equal((await installationPayments.verify('cashfree-owner', { orderId: checkout.orderId })).verified, false);
  await assert.rejects(
    admin.approve(cashfreeApplication.applicationId, 'admin', { accessMode: 'TRIAL', durationDays: 3 }),
    /Confirm the Cashfree installation payment/
  );
  await assert.rejects(
    admin.reject(cashfreeApplication.applicationId, 'admin', 'Test rejection'),
    /Wait for the pending Cashfree/
  );

  const expiredApplication = await auth.submitOwnerApplication(
    firebaseRequest('expired-owner', 'expired@example.test'),
    applicationInput('CASHFREE')
  );
  const expiredCheckout = await installationPayments.checkout('expired-owner');
  orderStates.set(expiredCheckout.orderId, { status: 'EXPIRED', amount: 2199, currency: 'INR' });
  await admin.reject(expiredApplication.applicationId, 'admin', 'Expired checkout');
  assert.equal(
    (await client.execute('SELECT status FROM owner_applications WHERE id = ?', [expiredApplication.applicationId])).rows[0].status,
    'REJECTED'
  );
  assert.equal(
    (await client.execute('SELECT status FROM installation_checkout_sessions WHERE application_id = ?', [expiredApplication.applicationId])).rows[0].status,
    'CLOSED'
  );

  orderStates.set(checkout.orderId, { status: 'PAID', amount: 2199, currency: 'INR' });
  const webhook = Buffer.from(JSON.stringify({
    type: 'PAYMENT_SUCCESS_WEBHOOK',
    data: { order: { order_id: checkout.orderId } }
  }));
  assert.equal((await installationPayments.webhook(webhook)).verified, true);
  assert.equal((await installationPayments.verify('cashfree-owner', { orderId: checkout.orderId })).verified, true);
  assert.equal(
    (await auth.ownerApplication('cashfree-owner')).installation_payment_status,
    'PAID'
  );
  const approved = await admin.approve(cashfreeApplication.applicationId, 'admin', {
    accessMode: 'TRIAL',
    durationDays: 3,
    printerType: 'THERMAL_80MM',
    securityDeposit: 0
  });
  assert.equal((await client.execute('SELECT status FROM owner_applications WHERE id = ?', [cashfreeApplication.applicationId])).rows[0].status, 'APPROVED');
  assert.equal(
    (await client.execute('SELECT printer_type FROM printer_assets WHERE organization_id = ?', [approved.organizationId])).rows[0].printer_type,
    'THERMAL_58MM'
  );

  const collected = await installationPayments.collectCash(cashApplication.applicationId, 'admin');
  assert.equal(collected.alreadyCollected, false);
  assert.equal((await installationPayments.collectCash(cashApplication.applicationId, 'admin')).alreadyCollected, true);
  assert.equal(
    (await auth.ownerApplication('cash-owner')).installation_payment_status,
    'COLLECTED'
  );

  await assert.rejects(
    auth.submitOwnerApplication(firebaseRequest('invalid-owner', 'invalid@example.test'), {
      ...applicationInput('CASHFREE'),
      installationPackageCode: 'MADE_UP'
    }),
    /Invalid option/
  );
  console.log('Installation checkout smoke test passed (server pricing, Cashfree verification/reconciliation, approval and printer guards, cash collection, webhook, and invalid package rejection).');
} finally {
  client.close();
}
