const CACHE='george-reader-v04';
const BASE=new URL('./',self.location.href);
const ASSETS=['./','./index.html','./app.js','./manifest.webmanifest','./data/articles.json'].map(x=>new URL(x,BASE).href);
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('george-reader-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
 const url=new URL(e.request.url);
 if(e.request.method!=='GET'||url.origin!==BASE.origin||!ASSETS.includes(url.href))return;
 e.respondWith(fetch(e.request).then(response=>{
  if(!response.ok)throw Error('HTTP '+response.status);
  const copy=response.clone();e.waitUntil(caches.open(CACHE).then(c=>c.put(e.request,copy)));
  return response;
 }).catch(async()=>{const cached=await caches.match(e.request);return cached||Response.error()}));
});
