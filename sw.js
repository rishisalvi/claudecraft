// Minimal service worker so the game can be installed as an app. It does not cache: the game always loads fresh.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',()=>{});
