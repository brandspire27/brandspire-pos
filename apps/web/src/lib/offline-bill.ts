export type OfflineBill = { key:string; id:string; createdAt:number; input:Record<string,unknown>; lines:{name:string;quantity:number}[] };
async function database():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('brandspire-offline-bills',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('pending',{keyPath:'key'});
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
}
export async function pendingBill(key:string):Promise<OfflineBill|null>{
  const db=await database();
  try{return await new Promise((resolve,reject)=>{const request=db.transaction('pending').objectStore('pending').get(key);request.onsuccess=()=>resolve(request.result??null);request.onerror=()=>reject(request.error);});}finally{db.close();}
}
export async function queueBill(bill:OfflineBill){
  const db=await database();
  try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('pending','readwrite');tx.objectStore('pending').add(bill);tx.oncomplete=()=>resolve();tx.onabort=()=>reject(new Error('A pending bill already exists or device storage is unavailable. Sync it before another offline bill.'));tx.onerror=()=>{};});}finally{db.close();}
  window.dispatchEvent(new Event('brandspire-pending-bill'));
}
export async function removePendingBill(key:string,id:string){
  const db=await database();
  try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('pending','readwrite');const store=tx.objectStore('pending');const request=store.get(key);request.onsuccess=()=>{if(request.result?.id===id)store.delete(key);};tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});}finally{db.close();}
}
