'use strict';
// NOIR X11 — CMS server. Zero dependencies (Node 22+). Run: node server.js
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const {DatabaseSync}=require('node:sqlite');
const PORT=+process.env.PORT||3000,PROD=process.env.NODE_ENV==='production',SITE=1;
const DB=new DatabaseSync(path.join(__dirname,'noir.db'));
DB.exec(`PRAGMA journal_mode=WAL;PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,site_id INTEGER NOT NULL DEFAULT 1,email TEXT UNIQUE NOT NULL,pass TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'OWNER',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),csrf TEXT NOT NULL,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS content(site_id INTEGER NOT NULL DEFAULT 1,module TEXT NOT NULL,draft TEXT,published TEXT,draft_at TEXT,published_at TEXT,edited_by TEXT,PRIMARY KEY(site_id,module));
CREATE TABLE IF NOT EXISTS versions(id INTEGER PRIMARY KEY,site_id INTEGER NOT NULL DEFAULT 1,module TEXT NOT NULL,user_email TEXT,action TEXT,before_json TEXT,after_json TEXT,ts TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS activity(id INTEGER PRIMARY KEY,site_id INTEGER NOT NULL DEFAULT 1,user_email TEXT,action TEXT,module TEXT,ip TEXT,ua TEXT,ts TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS ix_ver ON versions(site_id,module,id);`);

const MODS=['hero','metrics','process','rules','pricing','care','contact'];
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
 const email=(process.env.ADMIN_EMAIL||'owner@noirx11.local').toLowerCase(),pw=process.env.ADMIN_PASSWORD||crypto.randomBytes(9).toString('base64url');
 DB.prepare('INSERT INTO users(email,pass,role) VALUES(?,?,?)').run(email,hash(pw),'OWNER');
 console.log(`\nOWNER account created.\n  email:    ${email}\n  password: ${pw}\nChange/reset later with: node server.js reset-password EMAIL NEWPASS\n`)}
const purge=()=>DB.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());purge();setInterval(purge,36e5).unref();

const ip=req=>(process.env.TRUST_PROXY&&req.headers['x-forwarded-for']||'').split(',')[0].trim()||req.socket.remoteAddress||'';
const log=(req,email,action,module)=>DB.prepare('INSERT INTO activity(site_id,user_email,action,module,ip,ua) VALUES(?,?,?,?,?,?)').run(SITE,email,action,module||null,ip(req),String(req.headers['user-agent']||'').slice(0,200));
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

const STATIC={'/':['index.html','text/html'],'/index.html':['index.html','text/html'],'/admin':['admin.html','text/html'],'/cms.js':['cms.js','text/javascript']};
async function route(req,res){
 const u=new URL(req.url,'http://x'),p=u.pathname,m=req.method;
 if(!p.startsWith('/api/')){const f=STATIC[p];if(!f||(m!=='GET'&&m!=='HEAD'))return send(res,404,{error:'Not found'});
  return res.writeHead(200,{'Content-Type':f[1]+'; charset=utf-8','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Cache-Control':'no-cache',...(p==='/admin'?{'X-Frame-Options':'DENY'}:{})}),res.end(fs.readFileSync(path.join(__dirname,f[0])))}
 if(m==='GET'&&p==='/api/content'){ // PUBLIC: published content only
  const modules={};for(const r of DB.prepare('SELECT module,published FROM content WHERE site_id=? AND published IS NOT NULL').all(SITE))modules[r.module]=jparse(r.published);
  return send(res,200,{modules},{'Cache-Control':'no-cache'})}
 if(m!=='GET'){const o=req.headers.origin;if(o&&new URL(o).host!==req.headers.host)throw err(403,'Bad origin')}
 if(m==='POST'&&p==='/api/auth/login'){
  const b=await body(req),key=ip(req),f=fails.get(key);
  if(f&&f.until>Date.now())throw err(429,'Too many attempts. Try again in 15 minutes.');
  const usr=DB.prepare("SELECT * FROM users WHERE role='OWNER' ORDER BY id LIMIT 1").get();
  let good=false;try{good=verify(String(b.password||''),usr?usr.pass:DUMMY)&&!!usr}catch{}
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
