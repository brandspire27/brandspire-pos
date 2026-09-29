import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const production = process.argv.includes('--production');
const requirePayments = process.argv.includes('--require-payments');
const failures = [];
const warnings = [];

function parseEnv(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 0) continue;
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
  }
  return out;
}

function pass(message) { console.log(`PASS  ${message}`); }
function fail(message) { failures.push(message); console.log(`FAIL  ${message}`); }
function warn(message) { warnings.push(message); console.log(`WARN  ${message}`); }
function present(env, key, scope) { env[key] ? pass(`${scope}: ${key}`) : fail(`${scope}: missing ${key}`); }
function httpsOrFail(value, label) {
  if (!value) return;
  if (!value.startsWith('https://')) fail(`${label} must use HTTPS for production`); else pass(`${label} uses HTTPS`);
  if (/localhost|127\.0\.0\.1|10\.0\.2\.2/i.test(value)) fail(`${label} still points to a local address`);
}

const apiPath = path.join(root, 'apps', 'api', '.env');
const webPath = path.join(root, 'apps', 'web', '.env.local');
const androidPath = path.join(root, 'apps', 'android', 'gradle.properties');
const api = parseEnv(apiPath);
const web = parseEnv(webPath);
const android = parseEnv(androidPath);

console.log(`\nBrandspire POS release preflight (${production ? 'production' : 'local/staging'})\n`);
present(api, 'SUPABASE_URL', 'API');
present(api, 'SUPABASE_SERVICE_ROLE_KEY', 'API');
present(web, 'NEXT_PUBLIC_SUPABASE_URL', 'Web');
present(web, 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'Web');
present(web, 'NEXT_PUBLIC_API_URL', 'Web');
present(android, 'BRANDSPIRE_SUPABASE_URL', 'Android');
present(android, 'BRANDSPIRE_SUPABASE_ANON_KEY', 'Android');
present(android, 'BRANDSPIRE_API_BASE_URL', 'Android');

const combinedClient = `${fs.existsSync(webPath) ? fs.readFileSync(webPath, 'utf8') : ''}\n${fs.existsSync(androidPath) ? fs.readFileSync(androidPath, 'utf8') : ''}`;
if (/SUPABASE_SERVICE_ROLE_KEY\s*=|CASHFREE_CLIENT_SECRET\s*=|CASHFREE_WEBHOOK_SECRET\s*=/.test(combinedClient)) fail('A server secret appears in Web or Android configuration');
else pass('No backend service-role/Cashfree secrets found in client config');

const cfId = api.CASHFREE_CLIENT_ID || '';
const cfSecret = api.CASHFREE_CLIENT_SECRET || '';
if (Boolean(cfId) !== Boolean(cfSecret)) fail('Cashfree Client ID and Secret must be configured together');
else if (cfId && cfSecret) pass('Cashfree credential pair is configured');
else if (requirePayments) fail('Cashfree credentials required by --require-payments');
else warn('Cashfree credentials are not configured yet; subscription checkout remains unavailable');

if (production) {
  httpsOrFail(api.WEB_URL || api.CLIENT_URL, 'API WEB_URL/CLIENT_URL');
  httpsOrFail(api.API_PUBLIC_URL, 'API_PUBLIC_URL');
  httpsOrFail(web.NEXT_PUBLIC_API_URL, 'NEXT_PUBLIC_API_URL');
  httpsOrFail(android.BRANDSPIRE_API_BASE_URL, 'Android API base URL');
  if ((api.APP_ENV || '').toLowerCase() !== 'production') fail('API APP_ENV should be production'); else pass('API APP_ENV=production');
  if ((api.CASHFREE_ENV || '').toLowerCase() !== 'production' && cfId) warn('Cashfree is configured but still in sandbox mode');
}

const buildFile = path.join(root, 'apps', 'android', 'app', 'build.gradle.kts');
if (fs.existsSync(buildFile)) {
  const text = fs.readFileSync(buildFile, 'utf8');
  const code = text.match(/versionCode\s*=\s*(\d+)/)?.[1];
  const name = text.match(/versionName\s*=\s*"([^"]+)"/)?.[1];
  if (code && name) pass(`Android release version ${name} (code ${code})`); else fail('Android versionCode/versionName could not be read');
}

console.log(`\nSummary: ${failures.length} failure(s), ${warnings.length} warning(s).`);
if (failures.length) process.exit(1);
