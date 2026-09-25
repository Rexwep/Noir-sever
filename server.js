'use strict';
// NOIR X11 — CMS server. Zero dependencies (Node 22+). Run: node server.js
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const {DatabaseSync}=require('node:sqlite');
const PORT=+process.env.PORT||3000,PROD=process.env.NODE_ENV==='production',SITE=1;
// DB_PATH lets you point the database at a persistent disk (e.g. on Render).
// Without this, on most hosts the database resets to defaults on every redeploy.
const DB_PATH=process.env.DB_PATH||path.join(__dirname,'noir.db');
const DB=new DatabaseSync(DB_PATH);

// Safety net: never let one unexpected error kill the whole server.
// Without these, a single bad request or a rare edge case can crash the
// entire process and take the whole site down until it's manually restarted.
process.on('uncaughtException',e=>console.error('[uncaughtException]',e&&e.stack||e));
process.on('unhandledRejection',e=>console.error('[unhandledRejection]',e&&e.stack||e));
DB.exec(`PRAGMA journal_mode=WAL;PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,site_id INTEGER NOT NULL DEFAULT 1,email TEXT UNIQUE NOT NULL,pass TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'OWNER',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),csrf TEXT NOT NULL,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS content(site_id INTEGER NOT NULL DEFAULT 1,module TEXT NOT NULL,draft TEXT,published TEXT,draft_at TEXT,published_at TEXT,edited_by TEXT,PRIMARY KEY(site_id,module));
CREATE TABLE IF NOT EXISTS versions(id INTEGER PRIMARY KEY,site_id INTEGER NOT NULL DEFAULT 1,module TEXT NOT NULL,user_email TEXT,action TEXT,before_json TEXT,after_json TEXT,ts TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS activity(id INTEGER PRIMARY KEY,site_id INTEGER NOT NULL DEFAULT 1,user_email TEXT,action TEXT,module TEXT,ip TEXT,ua TEXT,ts TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS ix_ver ON versions(site_id,module,id);`);

const MODS=['theme','hero','metrics','process','rules','pricing','care','contact'];
const DEFAULT_CONTENT={
 theme:{bg:"#070708",surface:"#101012",surfaceAlt:"#151517",text:"#f5f5f3",muted:"#9b9b9d",soft:"#c4c4c6",accent:"#d8ff62",buttonText:"#080808"},
 hero:{eyebrow:"Independent digital studio · 2026",title:"Premium websites. Built once. Never copied.",paragraph:"Original websites for businesses that need a precise first impression. No reused layouts. Scope is written before work begins.",proofTags:["ORIGINAL DESIGN","RESPONSIVE SYSTEMS","WEBSITE CARE","SIGNATURE REGISTRATION"],ctaText:"Start a project"},
 metrics:{items:[{number:"01",label:"Art direction"},{number:"02",label:"Premium website design"},{number:"03",label:"Responsive experience"},{number:"∞",label:"Website care"}]},
 process:{items:[{stepNo:"01 / POSITION",title:"Position",description:"Brand, audience, tone and primary action are set before design starts."},{stepNo:"02 / COMPOSE",title:"Compose",description:"Layout, typography and imagery are built as one system."},{stepNo:"03 / PERFECT",title:"Perfect",description:"Breakpoints, performance and launch checks are completed before handover."}]},
 rules:{items:[
  {stepNo:"01",title:"No design is remade.",description:"This applies from Basic to Signature. Two projects may share a category. They will not share a look."},
  {stepNo:"02",title:"Client direction. Studio structure.",description:"The client sets colour, logomark, tone and primary action. The studio locks structure, typography, composition and page count."},
  {stepNo:"03",title:"One revision follows lock.",description:"Additional pages or features are quoted separately. Client delay pauses the delivery clock."},
  {stepNo:"04",title:"Signature Model.",description:"A Signature project is registered to the client by name. A model number is issued. An official card appears in the administration area after login. That number and design are retired."},
  {stepNo:"05",title:"Care is maintenance.",description:"Website Care maintains the live site. It is not a redesign. New pages, features, commerce builds and major SEO campaigns are separate work."},
  {stepNo:"06",title:"Published scope is the offer.",description:"Domain and hosting follow the package list. Search visibility is prepared; first-place ranking is not promised."}
 ]},
 pricing:{items:[
  {num:"01 / Basic",name:"Basic",price:"₹20,000",description:"1–2 page original website. Responsive layout. Search-ready setup. Deployment. Premium hosting.",note:"Delivery: 3 days after brief, written content and images are received.<br>Domain client-provided · Maintenance not included · No Signature Model",ctaText:"Choose Basic",featured:false},
  {num:"02 / Business",name:"Business",price:"₹30,000",description:"1–5 page original website. Responsive layout. Premium hosting. Domain. 7 days maintenance.",note:"Delivery: 5 days after brief, written content and images are received.<br><strong>7 Days Free Maintenance</strong> · No Signature Model",ctaText:"Choose Business",featured:false},
  {num:"03 / Pro",name:"Pro",price:"₹40,000",description:"5–7 page original website. Administration panel. Premium hosting. Domain. 15 days maintenance. Client image updates after handover.",note:"Delivery: 7 days after brief, written content and images are received.<br><strong>15 Days Free Maintenance</strong> · No Signature Model",ctaText:"Choose Pro",featured:false},
  {num:"04 / Signature",name:"Signature",price:"₹50,000",description:"5–7 page original website. Client direction on colour, mark and tone. Studio lock on structure and typography. One revision after lock. Administration panel. Premium hosting. Domain. Search-ready setup. 1 month maintenance.",note:"Delivery: 10 days after brief, written content and images are received.<br><strong>Signature Model</strong> · Admin card after login · Number and design retired",ctaText:"Choose Signature",featured:true}
 ]},
 care:{items:[
  {index:"01 / ESSENTIAL",name:"Essential Care",price:"₹4,999",priceNote:"/ month",features:["Website health & availability checks","Basic bug fixes","Routine backup checks","Minor text & image updates","Existing form/function checks","Standard support"],featured:false},
  {index:"02 / BUSINESS",name:"Business Care",price:"₹5,999",priceNote:"/ month",features:["Everything in Essential Care","Regular technical review","Security & update checks","Content & image updates","Performance checks","Priority support"],featured:false},
  {index:"03 / MOST POPULAR",name:"Professional Care",price:"₹7,999",priceNote:"/ month",features:["Everything in Business Care","Deeper performance monitoring","Responsive issue correction","Advanced technical checks","Basic SEO health monitoring","Priority maintenance support"],featured:true},
  {index:"04 / PREMIUM",name:"Premium Care",price:"₹9,999",priceNote:"/ month",features:["Everything in Professional Care","Advanced performance review","Enhanced security monitoring","More frequent content updates","Minor UI refinements","Premium priority support"],featured:false}
 ]},
 contact:{heading:"Begin the next original.",tagline:"Projects start by WhatsApp or email.",whatsappNumber:"919079688242",whatsappMessage:"Hello NOIR X11, I want to start a project.",email:"noirx11.web@gmail.com",emailSubject:"Project brief — NOIR X11",emailBody:"Hello NOIR X11,\n\nI would like to discuss a project.\n\nProject details:\n",footerLeft:"© 2026 NOIR X11",footerRight:"Original digital work"}
};
const PERMS={OWNER:['content:read','content:write','content:publish','users:manage'],EDITOR:['content:read','content:write'],VIEWER:['content:read']};
const now=()=>new Date().toISOString(),sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const hash=pw=>{const s=crypto.randomBytes(16);return s.toString('hex')+':'+crypto.scryptSync(pw,s,64).toString('hex')};
const verify=(pw,h)=>{const[s,k]=h.split(':'),d=crypto.scryptSync(pw,Buffer.from(s,'hex'),64);return crypto.timingSafeEqual(d,Buffer.from(k,'hex'))};
const DUMMY=hash('dummy-password');
const err=(status,message)=>Object.assign(new Error(message),{status});

if(process.argv[2]==='reset-password'){const[,,,e,pw]=process.argv;
 if(!e||!pw||pw.length<8){console.log('Usage: node server.js reset-password EMAIL NEWPASSWORD(min 8 chars)');process.exit(1)}
 const r=DB.prepare('UPDATE users SET pass=? WHERE email=?').run(hash(pw),e.toLowerCase());
 DB.exec('DELETE FROM sessions');console.log(r.changes?'Password updated, all sessions revoked.':'No such user.');process.exit(0)}
if(!DB.prepare('SELECT 1 FROM users').get()){
 const email=(process.env.ADMIN_EMAIL||'owner@noirx11.local').toLowerCase(),pw=process.env.ADMIN_PASSWORD||'Noir@X11-Admin';
 DB.prepare('INSERT INTO users(email,pass,role) VALUES(?,?,?)').run(email,hash(pw),'OWNER');
 console.log(`\nOWNER account created.\n  email:    ${email}\n  password: ${pw}\nChange/reset later with: node server.js reset-password EMAIL NEWPASS\n`)}
if(!DB.prepare('SELECT 1 FROM content WHERE site_id=?').get(SITE)){
 const seedAt=now(),ins=DB.prepare('INSERT INTO content(site_id,module,draft,published,draft_at,published_at,edited_by) VALUES(?,?,?,?,?,?,?)');
 for(const mod of MODS){const json=JSON.stringify(DEFAULT_CONTENT[mod]);ins.run(SITE,mod,json,json,seedAt,seedAt,'system')}
 console.log('Default content seeded (matches your original website) for: '+MODS.join(', '))}
const purge=()=>{try{DB.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now())}catch(e){console.error('[session purge failed]',e.message)}};purge();setInterval(purge,36e5).unref();

const ip=req=>(process.env.TRUST_PROXY&&req.headers['x-forwarded-for']||'').split(',')[0].trim()||req.socket.remoteAddress||'';
const log=(req,email,action,module)=>{try{DB.prepare('INSERT INTO activity(site_id,user_email,action,module,ip,ua) VALUES(?,?,?,?,?,?)').run(SITE,email,action,module||null,ip(req),String(req.headers['user-agent']||'').slice(0,200))}catch(e){console.error('[activity log failed]',e.message)}};
function send(res,code,obj,extra){res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra});res.end(JSON.stringify(obj))}
function body(req){return new Promise((ok,no)=>{let n=0;const c=[];req.on('data',d=>{n+=d.length;if(n>3e5){no(err(413,'Payload too large'));req.destroy()}else c.push(d)});
 req.on('end',()=>{try{ok(c.length?JSON.parse(Buffer.concat(c)):{})}catch{no(err(400,'Invalid JSON'))}});req.on('error',no)})}
function clean(v,d=0){ // strict whitelist: strings, booleans, arrays, plain objects only
 if(d>5)throw err(400,'Too deeply nested');
 if(typeof v==='string'){if(v.length>3000)throw err(400,'Text too long');return v}
 if(typeof v==='boolean')return v;
 if(Array.isArray(v)){if(v.length>60)throw err(400,'Too many items');return v.map(x=>clean(x,d+1))}
 if(v&&typeof v==='object'){const o=Object.create(null);for(const k of Object.keys(v)){if(!/^[a-z_]{1,30}$/i.test(k))throw err(400,'Invalid field name');o[k]=clean(v[k],d+1)}return o}
 throw err(400,'Invalid value')}
const cookies=req=>Object.fromEntries((req.headers.cookie||'').split(';').map(s=>s.trim().split('=')).filter(a=>a[0]));
function session(req){const sid=cookies(req).sid;if(!sid)return null;
 const r=DB.prepare('SELECT s.id,s.csrf,u.id uid,u.email,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires>?').get(sha(sid),Date.now());
 return r?{id:r.id,csrf:r.csrf,user:{id:r.uid,email:r.email,role:r.role}}:null}
const fails=new Map();
const jparse=s=>s?JSON.parse(s):null;

const STATIC={
 '/':['index.html','text/html'],
 '/index.html':['index.html','text/html'],
 '/admin':['admin.html','text/html'],
 '/admin/':['admin.html','text/html'],
 '/admin/index.html':['admin.html','text/html'],
 '/cms.js':['cms.js','text/javascript']
};
const ASSET_TYPES={
 '.html':'text/html', '.css':'text/css', '.js':'text/javascript',
 '.mjs':'text/javascript', '.svg':'image/svg+xml', '.png':'image/png',
 '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp',
 '.gif':'image/gif', '.ico':'image/x-icon', '.woff':'font/woff',
 '.woff2':'font/woff2', '.ttf':'font/ttf', '.otf':'font/otf',
 '.mp4':'video/mp4', '.webm':'video/webm', '.avif':'image/avif'
};
function staticFile(p){
 const direct=STATIC[p];
 if(direct)return direct;
 if(!/^\/[^?]*$/.test(p))return null;
 const decoded=decodeURIComponent(p);
 const ext=path.extname(decoded).toLowerCase();
 if(!ASSET_TYPES[ext] || decoded.includes('..') || decoded.includes('\\'))return null;
 const rel=decoded.replace(/^\/+/,''),abs=path.resolve(__dirname,rel),root=path.resolve(__dirname);
 if(new Set(['server.js','server_FIXED.js','noir.db','noir.db-shm','noir.db-wal','package.json','package-lock.json','.env']).has(path.basename(rel)))return null;
 if(abs!==root && !abs.startsWith(root+path.sep))return null;
 try{if(fs.statSync(abs).isFile())return [rel,ASSET_TYPES[ext]]}catch{}
 return null;
}
async function route(req,res){
 const u=new URL(req.url,'http://x'),p=u.pathname,m=req.method;
 if(!p.startsWith('/api/')){
  const f=staticFile(p);
  if(!f || (m!=='GET'&&m!=='HEAD'))return send(res,404,{error:'Not found'});
  const filePath=path.join(__dirname,f[0]);
  let stat;
  try{stat=fs.statSync(filePath)}catch{return send(res,404,{error:'Not found'})} // file listed but missing on disk -> clean 404 instead of crash
  const headers={'Content-Type':f[1]+'; charset=utf-8','Content-Length':stat.size,'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Cache-Control':'no-cache'};
  if(p==='/admin'||p==='/admin/'||p==='/admin/index.html')headers['X-Frame-Options']='DENY';
  res.writeHead(200,headers);
  return m==='HEAD'?res.end():res.end(fs.readFileSync(filePath));
 }
 if(m==='GET'&&p==='/api/content'){ // PUBLIC: published content only
  const modules={};for(const r of DB.prepare('SELECT module,published FROM content WHERE site_id=? AND published IS NOT NULL').all(SITE))modules[r.module]=jparse(r.published);
  return send(res,200,{modules},{'Cache-Control':'no-cache'})}
 if(m!=='GET'){const o=req.headers.origin;if(o&&new URL(o).host!==req.headers.host)throw err(403,'Bad origin')}
 if(m==='POST'&&p==='/api/auth/login'){
  const b=await body(req),key=ip(req),f=fails.get(key);
  if(f&&f.until>Date.now())throw err(429,'Too many attempts. Try again in 15 minutes.');
  const usr=DB.prepare("SELECT * FROM users WHERE role='OWNER' ORDER BY id LIMIT 1").get();
  let good=false,corrupted=false;
  try{good=verify(String(b.password||''),usr?usr.pass:DUMMY)&&!!usr}
  catch(e){corrupted=true} // the stored hash itself is malformed — this is NOT a wrong password
  if(corrupted){
   log(req,usr?usr.email:'','LOGIN_ERROR_CORRUPT');
   throw err(500,'Password data corrupted hai database mein (galat password nahi). Fix: node server.js reset-password EMAIL NEWPASSWORD chalayein.')}
  if(!good){const n=(f?f.n:0)+1;fails.set(key,{n,until:n>=5?Date.now()+9e5:0});log(req,usr?usr.email:'','LOGIN_FAILED');throw err(401,'Invalid password')}
  fails.delete(key);
  const sid=crypto.randomBytes(32).toString('hex'),csrf=crypto.randomBytes(24).toString('hex'),age=b.remember?604800:43200;
  DB.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(sha(sid),usr.id,csrf,Date.now()+age*1000);log(req,usr.email,'LOGIN');
  return send(res,200,{csrf,user:{email:usr.email,role:usr.role}},{'Set-Cookie':`sid=${sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${PROD?'; Secure':''}`})}
 const S=session(req);if(!S)throw err(401,'Login required');
 const can=perm=>{if(!PERMS[S.user.role].includes(perm))throw err(403,'Not permitted')};
 if(m==='GET'&&p==='/api/auth/me')return send(res,200,{csrf:S.csrf,user:S.user});
 if(m!=='GET'&&req.headers['x-csrf-token']!==S.csrf)throw err(403,'CSRF check failed');
 if(m==='POST'&&p==='/api/auth/logout'){DB.prepare('DELETE FROM sessions WHERE id=?').run(S.id);log(req,S.user.email,'LOGOUT');
  return send(res,200,{ok:true},{'Set-Cookie':'sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'})}
 if(m==='GET'&&p==='/api/admin/content'){can('content:read');
  const out={};for(const r of DB.prepare('SELECT * FROM content WHERE site_id=?').all(SITE))
   out[r.module]={draft:jparse(r.draft),published:jparse(r.published),draft_at:r.draft_at,published_at:r.published_at,edited_by:r.edited_by,unpublished:r.draft!==null&&r.draft!==r.published};
  return send(res,200,{modules:out})}
 let x;
 if(x=p.match(/^\/api\/admin\/content\/(\w+)(\/publish|\/discard)?$/)){
  const mod=x[1],act=x[2];if(!MODS.includes(mod))throw err(404,'Unknown module');
  const row=DB.prepare('SELECT * FROM content WHERE site_id=? AND module=?').get(SITE,mod)||{};
  const ver=(action,before,after)=>DB.prepare('INSERT INTO versions(site_id,module,user_email,action,before_json,after_json) VALUES(?,?,?,?,?,?)').run(SITE,mod,S.user.email,action,before??null,after??null);
  const tx=fn=>{DB.exec('BEGIN IMMEDIATE');try{fn();DB.exec('COMMIT')}catch(e){DB.exec('ROLLBACK');throw e}};
  if(m==='PUT'&&!act){can('content:write');const d=JSON.stringify(clean((await body(req)).data));
   tx(()=>{DB.prepare('INSERT INTO content(site_id,module,draft,draft_at,edited_by) VALUES(?,?,?,?,?) ON CONFLICT(site_id,module) DO UPDATE SET draft=excluded.draft,draft_at=excluded.draft_at,edited_by=excluded.edited_by').run(SITE,mod,d,now(),S.user.email);
    ver('DRAFT_SAVE',row.draft??row.published,d);log(req,S.user.email,'UPDATE',mod)});return send(res,200,{ok:true,draft_at:now()})}
  if(m==='POST'&&act==='/publish'){can('content:publish');if(!row.draft)throw err(400,'Nothing to publish');
   tx(()=>{DB.prepare('UPDATE content SET published=draft,published_at=? WHERE site_id=? AND module=?').run(now(),SITE,mod);ver('PUBLISH',row.published,row.draft);log(req,S.user.email,'PUBLISH',mod)});return send(res,200,{ok:true})}
  if(m==='POST'&&act==='/discard'){can('content:write');
   tx(()=>{DB.prepare('UPDATE content SET draft=published WHERE site_id=? AND module=?').run(SITE,mod);log(req,S.user.email,'DISCARD_DRAFT',mod)});return send(res,200,{ok:true})}}
 if(m==='GET'&&(x=p.match(/^\/api\/admin\/versions\/(\w+)$/))){can('content:read');
  return send(res,200,{versions:DB.prepare('SELECT id,user_email,action,ts FROM versions WHERE site_id=? AND module=? ORDER BY id DESC LIMIT 30').all(SITE,x[1])})}
 if(m==='POST'&&(x=p.match(/^\/api\/admin\/versions\/(\d+)\/restore$/))){can('content:write');
  const v=DB.prepare('SELECT * FROM versions WHERE id=? AND site_id=?').get(+x[1],SITE);if(!v||!v.after_json)throw err(404,'Version not found');
  const row=DB.prepare('SELECT * FROM content WHERE site_id=? AND module=?').get(SITE,v.module)||{};
  DB.exec('BEGIN IMMEDIATE');try{
   DB.prepare('INSERT INTO content(site_id,module,draft,draft_at,edited_by) VALUES(?,?,?,?,?) ON CONFLICT(site_id,module) DO UPDATE SET draft=excluded.draft,draft_at=excluded.draft_at,edited_by=excluded.edited_by').run(SITE,v.module,v.after_json,now(),S.user.email);
   DB.prepare('INSERT INTO versions(site_id,module,user_email,action,before_json,after_json) VALUES(?,?,?,?,?,?)').run(SITE,v.module,S.user.email,'ROLLBACK',row.draft??row.published??null,v.after_json);
   log(req,S.user.email,'ROLLBACK',v.module);DB.exec('COMMIT')}catch(e){DB.exec('ROLLBACK');throw e}
  return send(res,200,{ok:true,module:v.module})}
 if(m==='GET'&&p==='/api/admin/activity'){can('content:read');
  return send(res,200,{activity:DB.prepare('SELECT user_email,action,module,ip,ts FROM activity WHERE site_id=? ORDER BY id DESC LIMIT 60').all(SITE)})}
 throw err(404,'Not found')}
http.createServer((req,res)=>route(req,res).catch(e=>{if(!e.status)console.error(e);if(!res.headersSent)send(res,e.status||500,{error:e.status?e.message:'Server error'})})).listen(PORT,()=>console.log(`NOIR X11 running → site http://localhost:${PORT}/  admin http://localhost:${PORT}/admin`));
