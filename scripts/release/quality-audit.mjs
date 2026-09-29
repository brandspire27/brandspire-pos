import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
let failures=0;let warnings=0;
const out=(kind,msg)=>{console.log(`${kind.padEnd(5)} ${msg}`);if(kind==='FAIL')failures++;if(kind==='WARN')warnings++;};
const read=(rel)=>{try{return fs.readFileSync(path.join(root,rel),'utf8')}catch{return ''}};
const walk=(dir)=>{
  const base=path.join(root,dir);if(!fs.existsSync(base))return[];
  const files=[];for(const entry of fs.readdirSync(base,{withFileTypes:true})){
    const full=path.join(base,entry.name);if(entry.isDirectory())files.push(...walk(path.relative(root,full)));else files.push(full);
  }return files;
};
const clientFiles=[...walk('apps/web'),...walk('apps/android')].filter(f=>/\.(ts|tsx|js|mjs|kt|kts|xml|properties|env|example)$/.test(f));
const clientText=clientFiles.map(f=>fs.readFileSync(f,'utf8')).join('\n');

console.log('Brandspire POS — Phase 23 quality audit\n');

const secretPatterns=[
  ['Supabase service-role key name',/SUPABASE_SERVICE_ROLE_KEY\s*=\s*[^\s#]+/i],
  ['Cashfree secret value',/CASHFREE_CLIENT_SECRET\s*=\s*(?!YOUR_|$)[^\s#]+/i],
  ['Private OpenAI-style key',/\bsk-[A-Za-z0-9_-]{20,}\b/]
];
for(const[label,re]of secretPatterns){re.test(clientText)?out('FAIL',`${label} appears in client-side files`):out('PASS',`${label} not exposed in client-side files`);}

const apiMain=read('apps/api/src/main.ts');
const security=read('apps/api/src/common/security/security.middleware.ts');
apiMain.includes("disable('x-powered-by')")?out('PASS','API framework fingerprint header disabled'):out('FAIL','API X-Powered-By removal missing');
apiMain.includes('rawBody: true')?out('PASS','Cashfree raw-body webhook support preserved'):out('FAIL','Cashfree raw-body support missing');
security.includes('X-Content-Type-Options')&&security.includes('Strict-Transport-Security')?out('PASS','API baseline security headers enabled'):out('FAIL','API security headers incomplete');
security.includes('429')&&security.includes('X-RateLimit-Limit')?out('PASS','API abuse/rate guard enabled'):out('FAIL','API rate protection missing');
security.includes('Cache-Control')&&security.includes('no-store')?out('PASS','Sensitive API responses are non-cacheable'):out('FAIL','Sensitive response cache protection missing');

const nextConfig=read('apps/web/next.config.mjs');
nextConfig.includes('poweredByHeader: false')?out('PASS','Web framework fingerprint disabled'):out('FAIL','Web poweredByHeader hardening missing');
nextConfig.includes('X-Frame-Options')&&nextConfig.includes('Permissions-Policy')?out('PASS','Web baseline security headers enabled'):out('FAIL','Web security headers incomplete');

const css=read('apps/web/app/globals.css');
css.includes(':focus-visible')?out('PASS','Keyboard focus states present'):out('FAIL','Keyboard focus styling missing');
css.includes('prefers-reduced-motion')?out('PASS','Reduced-motion preference respected'):out('FAIL','Reduced-motion support missing');
css.includes('mobile-workspace-nav')?out('PASS','Mobile workspace navigation present'):out('WARN','Mobile quick navigation not detected');

const billing=read('apps/web/src/components/pos/BillingWorkspace.tsx');
billing.includes(".ilike('name'")&&billing.includes(".eq('barcode'")?out('PASS','Billing searches the full tenant catalog beyond initial render'):out('WARN','Billing full-catalog server search not detected');
const initialLimit=(billing.match(/order\('name'\)\.limit\((\d+)\)/)||[])[1];
initialLimit&&Number(initialLimit)<=300?out('PASS',`Billing initial product payload capped at ${initialLimit}`):out('WARN','Billing initial product payload may be too large');

const launch=read('apps/android/app/src/main/java/com/brandspire/pos/ui/LaunchDesign.kt');
launch.includes('minimumWidth = bsDp(48)')&&launch.includes('minHeight = bsDp(48)')?out('PASS','Android common actions use accessible tap targets'):out('WARN','Android 48dp tap-target guard not detected');
launch.includes('contentDescription = label')?out('PASS','Android shared controls expose accessibility labels'):out('WARN','Android accessibility labels incomplete');

const help=read('apps/android/app/src/main/java/com/brandspire/pos/ui/OfflineHelpActivity.kt');
/help.*internet is currently required/i.test(help)?out('FAIL','Offline help still contains outdated internet-required customer guidance'):out('PASS','Offline help matches Sync v2 capabilities');

const activeWeb=[...walk('apps/web')].filter(f=>/\.(ts|tsx)$/.test(f)).map(f=>fs.readFileSync(f,'utf8')).join('\n');
/razorpay/i.test(activeWeb)?out('WARN','Razorpay wording remains in active web source; review before launch'):out('PASS','Active web source uses Cashfree naming');

console.log(`\nSummary: ${failures} failure(s), ${warnings} warning(s)`);
if(failures>0)process.exit(1);
