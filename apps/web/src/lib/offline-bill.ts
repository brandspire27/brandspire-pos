export type OfflineBill = { key:string; id:string; createdAt:number; input:Record<string,unknown>; lines:{name:string;quantity:number}[] };
async function database():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('brandspire-offline-bills',3);
    request.onupgradeneeded=()=>{
      // Copy the legacy single-slot store inside the upgrade transaction.
      const queue=request.result.createObjectStore('queue',{keyPath:['key','id']});
      queue.createIndex('account','key');
      if(request.result.objectStoreNames.contains('pending')){
        const legacy=request.transaction!.objectStore('pending').openCursor();
        legacy.onsuccess=()=>{const cursor=legacy.result;if(cursor){queue.add(cursor.value);cursor.continue();}else request.result.deleteObjectStore('pending');};
      }
      if(!request.result.objectStoreNames.contains('archive'))request.result.createObjectStore('archive',{keyPath:'id'});
    };
    let blocked=false;
    request.onblocked=()=>{blocked=true;reject(new Error('Close other POS tabs so offline storage can be upgraded.'));};
    request.onsuccess=()=>{if(blocked){request.result.close();return;}request.result.onversionchange=()=>request.result.close();resolve(request.result);};request.onerror=()=>reject(request.error);
  });
}
export async function archivePendingBill(key:string,id:string){
  const db=await database();
  try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction(['queue','archive'],'readwrite');const store=tx.objectStore('queue');const req=store.get([key,id]);req.onsuccess=()=>{if(req.result?.id===id){tx.objectStore('archive').put({...req.result,archivedAt:Date.now()});store.delete([key,id]);}};tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});}finally{db.close();}
}
export async function archivedBills(key:string):Promise<OfflineBill[]>{
  const db=await database();try{return await new Promise((resolve,reject)=>{const req=db.transaction('archive').objectStore('archive').getAll();req.onsuccess=()=>resolve(req.result.filter((row:OfflineBill)=>row.key===key));req.onerror=()=>reject(req.error);});}finally{db.close();}
}
export async function restoreArchivedBill(key:string,id:string){
  const db=await database();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction(['queue','archive'],'readwrite');const archive=tx.objectStore('archive');const req=archive.get(id);req.onsuccess=()=>{if(req.result?.key!==key){tx.abort();return;}tx.objectStore('queue').add(req.result);archive.delete(id);};tx.oncomplete=()=>resolve();tx.onabort=()=>reject(new Error('The bill is already pending, or the archived bill is unavailable.'));});}finally{db.close();}
}
export async function pendingBills(key:string):Promise<OfflineBill[]>{
  const db=await database();
  try{return await new Promise((resolve,reject)=>{const request=db.transaction('queue').objectStore('queue').index('account').getAll(key);request.onsuccess=()=>resolve(request.result.sort((a:OfflineBill,b:OfflineBill)=>a.createdAt-b.createdAt||a.id.localeCompare(b.id)));request.onerror=()=>reject(request.error);});}finally{db.close();}
}
export async function pendingBill(key:string):Promise<OfflineBill|null>{return (await pendingBills(key))[0]??null;}
export async function queueBill(bill:OfflineBill,stock?:Record<string,number>){
  const db=await database();
  try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('queue','readwrite');const store=tx.objectStore('queue');
    const existing=store.index('account').getAll(bill.key);
    existing.onsuccess=()=>{
      if(stock){
        const reserved:Record<string,number>={};
        for(const row of [...existing.result,bill] as OfflineBill[]){
          for(const item of (row.input.items??[]) as {productId:string;quantity:number}[]){reserved[item.productId]=(reserved[item.productId]??0)+item.quantity;}
        }
        if(Object.entries(stock).some(([id,available])=>!Number.isFinite(available)||(reserved[id]??0)>available+1e-9)){tx.abort();return;}
      }
      store.add(bill);
    };tx.oncomplete=()=>resolve();tx.onabort=()=>reject(new Error('Could not save: duplicate bill, insufficient cached stock after pending sales, or device storage unavailable.'));tx.onerror=()=>{};});}finally{db.close();}
  window.dispatchEvent(new Event('brandspire-pending-bill'));
}
export async function removePendingBill(key:string,id:string){
  const db=await database();
  try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('queue','readwrite');const store=tx.objectStore('queue');const request=store.get([key,id]);request.onsuccess=()=>{if(request.result?.id===id)store.delete([key,id]);};tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});}finally{db.close();}
}
