// Blockhaven standalone backend.
// Inside Claude the game gets three objects from the host page: a live "room" (who is online + their state),
// a document "db" (the shared world) and a "user". This file provides the same three objects on top of Supabase,
// so the game code itself runs unchanged.
(function(){
  if(window.claude&&typeof window.claude.use==='function')return; // running inside Claude: nothing to do
  const cfg=window.BLOCKHAVEN_CONFIG||{};
  if(!window.supabase||!cfg.supabaseUrl||!cfg.supabaseAnonKey||/YOUR-/.test(cfg.supabaseUrl+cfg.supabaseAnonKey)){console.warn('Blockhaven: Supabase is not configured (see config.js). Running single-player only.');return;}
  const sb=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{realtime:{params:{eventsPerSecond:20}}});
  const qs=new URLSearchParams(location.search);
  const world=((qs.get('world')||'main').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,40))||'main';
  const rid=()=>Math.random().toString(36).slice(2,10)+Math.random().toString(36).slice(2,10);
  const ls=(k,mk)=>{try{let v=localStorage.getItem(k);if(!v){v=mk();localStorage.setItem(k,v);}return v;}catch(e){return mk();}};
  const uid='u_'+ls('bh_uid',rid),peer='p'+rid();

  // ---------------- room: live player state ----------------
  let mine={},pending={},timer=null,connected=false;
  const peers=new Map(),listeners=[],connL=[];
  const meEntry=()=>Object.freeze({peer,by:uid,isMe:true,sameTab:true,kind:'viewer',guest:false,presence:Object.freeze({...mine}),updatedAt:Date.now()});
  const arr=()=>Object.freeze([meEntry(),...peers.values()]);
  const emit=(joined,left)=>{const a=arr();for(const f of listeners){try{f({peers:a,joined:joined||[],left:left||[],updated:[]});}catch(e){console.error(e);}}};
  const setPeer=(id,by,pres)=>{const isNew=!peers.has(id),p=Object.freeze({peer:id,by:by||null,isMe:false,sameTab:false,kind:'viewer',guest:false,presence:Object.freeze(pres),updatedAt:Date.now()});peers.set(id,p);emit(isNew?[p]:[]);};
  const ch=sb.channel('bh-room-'+world,{config:{broadcast:{self:false},presence:{key:peer}}});
  const sendFull=()=>{if(connected)ch.send({type:'broadcast',event:'p',payload:{peer,by:uid,full:true,d:mine}});};
  const flush=()=>{timer=null;const d=pending;pending={};if(connected&&Object.keys(d).length)ch.send({type:'broadcast',event:'p',payload:{peer,by:uid,d}});};
  ch.on('broadcast',{event:'p'},({payload})=>{if(!payload||payload.peer===peer)return;const old=peers.get(payload.peer);
      if(!old&&!payload.full)ch.send({type:'broadcast',event:'q',payload:{to:payload.peer}});
      setPeer(payload.peer,payload.by,payload.full?(payload.d||{}):{...(old?old.presence:{}),...(payload.d||{})});})
    .on('broadcast',{event:'q'},({payload})=>{if(payload&&payload.to===peer)sendFull();})
    .on('presence',{event:'join'},({key})=>{if(key!==peer)sendFull();})
    .on('presence',{event:'leave'},({key})=>{const p=peers.get(key);if(p){peers.delete(key);emit([],[p]);}})
    .subscribe(st=>{const ok=st==='SUBSCRIBED';if(ok!==connected){connected=ok;connL.forEach(f=>{try{f(ok);}catch(e){}});}if(ok){ch.track({by:uid});sendFull();}});
  const room={
    presence(patch){mine={...mine,...patch};Object.assign(pending,patch);if(!timer)timer=setTimeout(flush,110);return Promise.resolve();},
    onPeers(f){listeners.push(f);setTimeout(()=>emit(),0);return()=>{const i=listeners.indexOf(f);if(i>=0)listeners.splice(i,1);};},
    onConnection(f){connL.push(f);setTimeout(()=>f(connected),0);return()=>{const i=connL.indexOf(f);if(i>=0)connL.splice(i,1);};},
    peers:arr,connected:()=>connected};

  // ---------------- db: shared world documents ----------------
  const T='bh_docs',colL=[],docL=[];
  const row=async path=>{const {data,error}=await sb.from(T).select('data').eq('world',world).eq('path',path).maybeSingle();if(error)throw error;return data;};
  const snap=(path,r)=>({exists:!!r,id:path.slice(path.lastIndexOf('/')+1),data:()=>r?r.data:undefined});
  const drop=(list,l)=>()=>{const i=list.indexOf(l);if(i>=0)list.splice(i,1);};
  function docRef(path){return{path,id:path.slice(path.lastIndexOf('/')+1),
    get:async()=>snap(path,await row(path)),
    set:async d=>{const {error}=await sb.from(T).upsert({world,path,data:d,updated_at:new Date().toISOString()});if(error)throw error;},
    update:async d=>{
      if(d&&d.e&&typeof d.e==='object'&&Object.keys(d).length===1){const {data,error}=await sb.rpc('bh_merge_e',{p_world:world,p_path:path,p_patch:d.e});if(error)throw error;if(!data)throw{code:'invalid_argument'};return;}
      const r=await row(path);if(!r)throw{code:'invalid_argument'};const {error}=await sb.from(T).update({data:{...r.data,...d},updated_at:new Date().toISOString()}).eq('world',world).eq('path',path);if(error)throw error;},
    delete:async()=>{const {error}=await sb.from(T).delete().eq('world',world).eq('path',path);if(error)throw error;},
    onSnapshot(f){const l={path,f};docL.push(l);row(path).then(r=>f(snap(path,r))).catch(e=>console.warn(e));return drop(docL,l);}};}
  function colRef(col){const pre=col+'/';return{
    doc:id=>docRef(pre+id),
    get:async()=>{const {data,error}=await sb.from(T).select('path,data').eq('world',world).like('path',pre.replace(/[%_\\]/g,'\\$&')+'%');if(error)throw error;
      return{docs:(data||[]).filter(r=>!r.path.slice(pre.length).includes('/')).map(r=>({id:r.path.slice(pre.length),data:()=>r.data}))};},
    onSnapshot(f){const l={col,f};colL.push(l);this.get().then(s=>f({docChanges:()=>s.docs.map(d=>({type:'added',doc:d}))})).catch(e=>console.warn(e));return drop(colL,l);}};}
  sb.channel('bh-db-'+world).on('postgres_changes',{event:'*',schema:'public',table:T,filter:'world=eq.'+world},pl=>{
    const r=pl.new&&pl.new.path?pl.new:pl.old;if(!r||!r.path)return;const del=pl.eventType==='DELETE',i=r.path.lastIndexOf('/'),col=r.path.slice(0,i),id=r.path.slice(i+1);
    for(const l of colL.slice())if(l.col===col)l.f({docChanges:()=>[{type:del?'removed':pl.eventType==='INSERT'?'added':'modified',doc:{id,data:()=>r.data}}]});
    for(const l of docL.slice())if(l.path===r.path)l.f(snap(r.path,del?null:r));}).subscribe();
  const db={doc:docRef,collection:colRef};

  // ---------------- user ----------------
  // The first browser to open a world becomes its owner (a secret is kept in that browser's storage).
  const ownerKey=ls('bh_owner_'+world,rid);
  const sha=async t=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t)))).map(b=>b.toString(16).padStart(2,'0')).join('');
  let ownerP=null;
  const isOwner=()=>ownerP||(ownerP=(async()=>{const h=await sha(ownerKey),ref=docRef('_bh/owner'),s=await ref.get();if(!s.exists){await ref.set({h});return true;}return s.data().h===h;})().catch(()=>false));
  const user={id:async()=>uid,me:async()=>({id:uid,name:''}),can:async()=>isOwner(),canEdit:async()=>true,
    profiles:async ids=>Object.fromEntries((ids||[]).map(i=>[i,{id:i,name:'',color:'#e07030'}]))};

  window.claude={use:async n=>({db,room,user})[n]||null};
})();
