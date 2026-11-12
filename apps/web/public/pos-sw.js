/* Cache only public billing HTML and versioned assets; never API/auth traffic. */
const CACHE='brandspire-pos-shell-v1';
const BILLING=['/owner/billing','/staff/billing'];
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('message',event=>{
  if(event.data?.type!=='PREPARE'||!BILLING.includes(event.data.path))return;
  event.waitUntil((async()=>{
    try{
      const cache=await caches.open(CACHE);
      const page=await fetch(event.data.path,{cache:'reload',headers:{Accept:'text/html'}});
      if(!page.ok||!page.headers.get('content-type')?.includes('text/html')||new URL(page.url).pathname!==event.data.path)throw new Error('Invalid shell');
      const html=await page.clone().text();
      const references=[...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map(match=>match[1]);
      const urls=[...new Set([...references,...(event.data.assets??[])].map(value=>new URL(value,self.location.origin)).filter(url=>url.origin===self.location.origin&&url.pathname.startsWith('/_next/static/')).map(url=>url.href))];
      if(!urls.length)throw new Error('Missing application assets');
      await cache.addAll(urls);
      await cache.put(event.data.path,page);
      event.ports[0]?.postMessage({ok:true});
    }catch{event.ports[0]?.postMessage({ok:false});}
  })());
});
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin)return;
  if(url.pathname.startsWith('/_next/static/')){
    event.respondWith((async()=>{const cache=await caches.open(CACHE);const hit=await cache.match(request);if(hit)return hit;const response=await fetch(request);if(response.ok)await cache.put(request,response.clone());return response;})());
  }else if(request.mode==='navigate'&&BILLING.includes(url.pathname)){
    event.respondWith(fetch(request).catch(async()=>{
      const cached=await (await caches.open(CACHE)).match(url.pathname);
      return cached??new Response('Connect to the internet and prepare offline billing first.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
    }));
  }
});
