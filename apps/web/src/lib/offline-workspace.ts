import type { CurrentOrganization } from './pos';
export type OfflineWorkspace = {
  version:1; uid:string; portal:'owner'|'staff'; savedAt:number;
  organization:CurrentOrganization; products:Record<string,unknown>[]; customers:Record<string,unknown>[];
  policy:{allowStaffDiscount:boolean;staffDiscountLimit:number;defaultPayment:string};
};
const PREFIX='brandspire.offline-workspace:';
export function offlineWorkspaceValid(row:OfflineWorkspace,uid:string,portal:string,now=Date.now()){
  const org=row?.organization;
  return row?.version===1&&row.uid===uid&&row.portal===portal&&!!org?.organizationId
    &&org.role===(portal==='owner'?'OWNER':'STAFF')
    &&Number.isFinite(row.savedAt)&&now>=row.savedAt&&now-row.savedAt<24*60*60*1000
    &&['TRIAL','ACTIVE','GRACE_PERIOD'].includes(org.subscriptionStatus)
    &&(!org.endsAt||new Date(org.endsAt).getTime()>now)
    &&Array.isArray(row.products)&&Array.isArray(row.customers)&&!!row.policy;
}
export function saveOfflineWorkspace(row:OfflineWorkspace){localStorage.setItem(PREFIX+row.uid+':'+row.portal,JSON.stringify(row));}
export function readOfflineWorkspace(uid:string,portal:'owner'|'staff'):OfflineWorkspace|null{
  try{const row=JSON.parse(localStorage.getItem(PREFIX+uid+':'+portal)??'null');return offlineWorkspaceValid(row,uid,portal)?row:null;}catch{return null;}
}
export function clearOfflineWorkspace(uid:string){for(const portal of ['owner','staff'])localStorage.removeItem(PREFIX+uid+':'+portal);}
export async function prepareOfflineShell(portal:'owner'|'staff'){
  if(process.env.NODE_ENV!=='production')throw new Error('Offline reopening needs a production build (next build + next start) or the deployed website.');
  if(!('serviceWorker' in navigator)||!window.isSecureContext)throw new Error('Offline reopening requires HTTPS or localhost and service worker support.');
  await navigator.serviceWorker.register('/pos-sw.js',{scope:'/'});
  const registration=await navigator.serviceWorker.ready;
  const assets=performance.getEntriesByType('resource').map(entry=>entry.name).filter(name=>{const url=new URL(name);return url.origin===location.origin&&url.pathname.startsWith('/_next/static/');});
  await new Promise<void>((resolve,reject)=>{
    const channel=new MessageChannel();const timer=setTimeout(()=>reject(new Error('Offline preparation timed out. Retry while online.')),30000);
    channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();event.data?.ok?resolve():reject(new Error('Offline files could not be saved. Keep the internet connected and retry.'));};
    registration.active?.postMessage({type:'PREPARE',path:`/${portal}/billing`,assets},[channel.port2]);
  });
}
