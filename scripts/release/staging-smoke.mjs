const api = (process.env.STAGING_API_URL || '').replace(/\/$/, '');
const web = (process.env.STAGING_WEB_URL || '').replace(/\/$/, '');

if (!api || !web) {
  console.error('Set STAGING_API_URL and STAGING_WEB_URL before running staging:smoke');
  process.exit(1);
}

for (const [name, value] of [['STAGING_API_URL', api], ['STAGING_WEB_URL', web]]) {
  if (!value.startsWith('https://')) {
    console.error(`FAIL ${name} must use HTTPS: ${value}`);
    process.exit(1);
  }
}

const checks = [
  ['API health', `${api}/api/health`, (body) => body?.success === true && body?.status === 'ok'],
  ['API readiness', `${api}/api/health/ready`, (body) => body?.success === true && body?.database === 'ok'],
  ['API release policy', `${api}/api/health/release`, (body) => body?.success === true && body?.environment === 'staging'],
  ['Web landing', web, null],
  ['Web status', `${web}/status`, null]
];

let failures = 0;
for (const [label, url, validateJson] of checks) {
  const started = Date.now();
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (validateJson) {
      const body = await res.json();
      if (!validateJson(body)) throw new Error('unexpected response body');
    } else {
      await res.text();
    }
    console.log(`PASS  ${label} (${Date.now() - started}ms)`);
  } catch (error) {
    failures += 1;
    console.log(`FAIL  ${label}: ${error instanceof Error ? error.message : error}`);
  }
}

console.log(`\nStaging smoke summary: ${failures} failure(s).`);
if (failures) process.exit(1);
