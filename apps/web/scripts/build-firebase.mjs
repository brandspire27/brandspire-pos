import {spawnSync} from 'node:child_process';
const result=spawnSync(process.execPath,['node_modules/next/dist/bin/next','build'],{stdio:'inherit',env:{...process.env,FIREBASE_STATIC_EXPORT:'true'}});
process.exit(result.status??1);
