export type OfflineBill = { key:string; id:string; createdAt:number; input:Record<string,unknown>; lines:{name:string;quantity:number}[] };
async function database():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('brandspire-offline-bills',2);
    request.onupgradeneeded=()=>{
      if(!request.result.objectStoreNames.contains('pending'))request.result.createObjectStore('pending',{keyPath:'key'});
      if(!request.result.objectStoreNames.contains('archive'))request.result.createObjectStore('archive',{keyPath:'id'});
    };
    request.onblocked=()=>reject(new Error('Close other POS tabs so offline storage can be upgraded.'));
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
}
export async function archivePendingBill(key:string,id:string){
  const db=await database();
  try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction(['pending','archive'],'readwrite');const store=tx.objectStore('pending');const req=store.get(key);req.onsuccess=()=>{if(req.result?.id===id){tx.objectStore('archive').put({...req.result,archivedAt:Date.now()});store.delete(key);}};tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});}finally{db.close();}
}
export async function archivedBills(key:string):Promise<OfflineBill[]>{
  const db=await database();try{return await new Promise((resolve,reject)=>{const req=db.transaction('archive').objectStore('archive').getAll();req.onsuccess=()=>resolve(req.result.filter((row:OfflineBill)=>row.key===key));req.onerror=()=>reject(req.error);});}finally{db.close();}
}
export async function restoreArchivedBill(key:string,id:string){
  const db=await database();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction(['pending','archive'],'readwrite');const archive=tx.objectStore('archive');const req=archive.get(id);req.onsuccess=()=>{if(req.result?.key!==key){tx.abort();return;}tx.objectStore('pending').add(req.result);archive.delete(id);};tx.oncomplete=()=>resolve();tx.onabort=()=>reject(new Error('A pending bill already exists, or the archived bill is unavailable.'));});}finally{db.close();}
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
