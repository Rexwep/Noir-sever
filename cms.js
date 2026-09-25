(function(){
'use strict';

/* ================= Module schema ================= */
var MODULES = {
  theme: { label:'Colours', order:0,
    fields:[
      {key:'bg',label:'Background',type:'color'},
      {key:'surface',label:'Surface (cards)',type:'color'},
      {key:'surfaceAlt',label:'Surface (alt shade)',type:'color'},
      {key:'text',label:'Main text',type:'color'},
      {key:'muted',label:'Muted text',type:'color'},
      {key:'soft',label:'Soft text',type:'color'},
      {key:'accent',label:'Accent / brand colour',type:'color'},
      {key:'buttonText',label:'Text colour on buttons',type:'color'}
    ]},
  hero: { label:'Hero', order:1,
    fields:[
      {key:'eyebrow',label:'Eyebrow label',type:'text'},
      {key:'title',label:'Headline (H1)',type:'textarea'},
      {key:'paragraph',label:'Subheading paragraph',type:'textarea'},
      {key:'ctaText',label:'CTA button text',type:'text'},
      {key:'proofTags',label:'Proof tags',type:'tags'}
    ]},
  metrics: { label:'Metrics', order:2,
    list:{key:'items',itemLabel:'Metric',defaultItem:{number:'',label:''},fields:[
      {key:'number',label:'Number / symbol',type:'text'},
      {key:'label',label:'Label',type:'text'}
    ]}},
  process: { label:'Process', order:3,
    list:{key:'items',itemLabel:'Step',defaultItem:{stepNo:'',title:'',description:''},fields:[
      {key:'stepNo',label:'Step tag',type:'text'},
      {key:'title',label:'Title',type:'text'},
      {key:'description',label:'Description',type:'textarea'}
    ]}},
  rules: { label:'Studio rules', order:4,
    list:{key:'items',itemLabel:'Rule',defaultItem:{stepNo:'',title:'',description:''},fields:[
      {key:'stepNo',label:'No.',type:'text'},
      {key:'title',label:'Title',type:'text'},
      {key:'description',label:'Description',type:'textarea'}
    ]}},
  pricing: { label:'Pricing', order:5,
    list:{key:'items',itemLabel:'Plan',defaultItem:{num:'',name:'',price:'',description:'',note:'',ctaText:'Choose',featured:false},fields:[
      {key:'num',label:'Tag (e.g. 01 / Basic)',type:'text'},
      {key:'name',label:'Plan name',type:'text'},
      {key:'price',label:'Price',type:'text'},
      {key:'description',label:'Description',type:'textarea'},
      {key:'note',label:'Note (small print)',type:'textarea'},
      {key:'ctaText',label:'Button text',type:'text'},
      {key:'featured',label:'Featured / highlighted plan',type:'checkbox'}
    ]}},
  care: { label:'Website care', order:6,
    list:{key:'items',itemLabel:'Plan',defaultItem:{index:'',name:'',price:'',priceNote:'/ month',features:[],featured:false},fields:[
      {key:'index',label:'Tag (e.g. 01 / ESSENTIAL)',type:'text'},
      {key:'name',label:'Plan name',type:'text'},
      {key:'price',label:'Price',type:'text'},
      {key:'priceNote',label:'Price note',type:'text'},
      {key:'features',label:'Features',type:'tags'},
      {key:'featured',label:'Highlighted ("Most Popular")',type:'checkbox'}
    ]}},
  contact: { label:'Contact', order:7,
    fields:[
      {key:'heading',label:'Heading',type:'text'},
      {key:'tagline',label:'Tagline',type:'text'},
      {key:'whatsappNumber',label:'WhatsApp number (country code, no +)',type:'text'},
      {key:'whatsappMessage',label:'WhatsApp prefilled message',type:'textarea'},
      {key:'email',label:'Email address',type:'text'},
      {key:'emailSubject',label:'Email subject',type:'text'},
      {key:'emailBody',label:'Email body',type:'textarea'},
      {key:'footerLeft',label:'Footer left text',type:'text'},
      {key:'footerRight',label:'Footer right text',type:'text'}
    ]}
};
var MODULE_ORDER = Object.keys(MODULES).sort(function(a,b){return MODULES[a].order-MODULES[b].order});

/* ================= State ================= */
var csrf = null, me = null, modulesData = {}, currentView = null, isDirty = false;

/* ================= Helpers ================= */
var $ = function(id){ return document.getElementById(id); };
function esc(s){ var d=document.createElement('div'); d.textContent=(s===undefined||s===null)?'':String(s); return d.innerHTML; }
function toast(msg, type){
  var t = $('toast');
  t.textContent = msg;
  t.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(toast._h);
  toast._h = setTimeout(function(){ t.className = 'toast'; }, 3200);
}

function api(path, opts){
  opts = opts || {};
  var headers = Object.assign({'Content-Type':'application/json'}, opts.headers||{});
  if(opts.method && opts.method !== 'GET' && csrf) headers['X-CSRF-Token'] = csrf;
  return fetch(path, {
    method: opts.method || 'GET',
    credentials: 'same-origin',
    headers: headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  }).then(function(res){
    return res.json().catch(function(){ return {}; }).then(function(data){
      if(!res.ok){ var e = new Error(data.error || ('Error ' + res.status)); e.status = res.status; e.data = data; throw e; }
      return data;
    });
  });
}

/* ================= Login ================= */
function checkSession(){
  api('/api/auth/me').then(function(data){
    csrf = data.csrf; me = data.user;
    enterApp();
  }).catch(function(){ /* not logged in */ });
}

$('loginForm').addEventListener('submit', function(e){
  e.preventDefault();
  var btn = $('loginBtn'), errBox = $('loginErr');
  errBox.className = 'alert alert-err';
  btn.disabled = true; btn.classList.add('loading');
  var password = $('pw').value, remember = $('remember').checked;
  api('/api/auth/login', { method:'POST', body:{ password:password, remember:remember } })
    .then(function(data){
      csrf = data.csrf; me = data.user;
      $('pw').value = '';
      enterApp();
    })
    .catch(function(err){
      var msg = 'Galat password. Dobara try karein.';
      if(err.status === 429) msg = err.data && err.data.error ? err.data.error : 'Bahut zyada attempts. 15 minute baad try karein.';
      else if(err.status === 500) msg = err.data && err.data.error ? err.data.error : 'Password data corrupted hai database mein (galat password nahi). Admin ko batayein.';
      else if(err.status && err.status !== 401) msg = err.data && err.data.error ? err.data.error : ('Error: ' + err.status);
      errBox.textContent = msg;
      errBox.className = 'alert alert-err show';
    })
    .finally(function(){
      btn.disabled = false; btn.classList.remove('loading');
    });
});

$('logoutBtn').addEventListener('click', function(){
  api('/api/auth/logout', { method:'POST' }).catch(function(){}).then(function(){
    location.reload();
  });
});

/* ================= App shell ================= */
function enterApp(){
  $('loginScreen').style.display = 'none';
  $('appShell').classList.add('show');
  $('whoAmI').textContent = me.email + ' · ' + me.role;
  buildNav();
  loadModules().then(function(){
    selectView(MODULE_ORDER[0]);
  });
}

function buildNav(){
  var nav = $('navList');
  nav.innerHTML = '';
  MODULE_ORDER.forEach(function(mod){
    var el = document.createElement('div');
    el.className = 'nav-item';
    el.dataset.view = mod;
    el.innerHTML = '<span>' + esc(MODULES[mod].label) + '</span><span class="nav-dot"></span>';
    el.addEventListener('click', function(){ selectView(mod); });
    nav.appendChild(el);
  });
  document.querySelectorAll('.sidebar [data-view]').forEach(function(el){
    if(el.parentElement.id !== 'navList'){
      el.addEventListener('click', function(){ selectView(el.dataset.view); });
    }
  });
  refreshNavState();
}

function refreshNavState(){
  document.querySelectorAll('.sidebar [data-view]').forEach(function(el){
    var mod = el.dataset.view;
    el.classList.toggle('active', mod === currentView);
    if(modulesData[mod]) el.classList.toggle('dirty', !!modulesData[mod].unpublished);
  });
}

function loadModules(){
  return api('/api/admin/content').then(function(data){
    modulesData = data.modules || {};
    refreshNavState();
  });
}

function selectView(view){
  currentView = view;
  refreshNavState();
  if(view === 'activity') renderActivity();
  else renderModuleForm(view);
}

/* ================= Module form rendering ================= */
var formState = {}; // current in-memory edit for the active module

function getModuleData(mod){
  var row = modulesData[mod];
  if(row && row.draft) return JSON.parse(JSON.stringify(row.draft));
  if(row && row.published) return JSON.parse(JSON.stringify(row.published));
  var schema = MODULES[mod];
  if(schema.list) return (function(){ var o={}; o[schema.list.key]=[]; return o; })();
  var o = {};
  schema.fields.forEach(function(f){ o[f.key] = f.type === 'tags' ? [] : (f.type === 'checkbox' ? false : ''); });
  return o;
}

function renderModuleForm(mod){
  var schema = MODULES[mod];
  formState = getModuleData(mod);
  var row = modulesData[mod] || {};
  var main = $('mainArea');

  var html = '';
  html += '<div class="topbar"><div><h1>' + esc(schema.label) + '</h1>' +
    '<p>' + (row.published_at ? 'Last published ' + new Date(row.published_at).toLocaleString() : 'Not published yet') + '</p></div>' +
    '<div class="actions">' +
    '<span class="badge' + (row.unpublished ? ' unpub' : '') + '">' + (row.unpublished ? 'Unpublished changes' : 'Live') + '</span>' +
    '</div></div>';
  html += '<div class="card" id="formCard"></div>';
  html += '<div class="card"><h2><span class="n">HISTORY</span> Version history</h2><ul class="hist-list" id="histList"><li class="empty">Loading…</li></ul></div>';
  html += '<div class="footer-bar">' +
    '<span class="status" id="statusText">Draft loaded</span>' +
    '<div class="actions">' +
    '<button class="btn btn-ghost btn-sm" id="discardBtn">Discard draft</button>' +
    '<button class="btn btn-ghost btn-sm" id="saveBtn">Save draft</button>' +
    '<button class="btn btn-sm" id="publishBtn" style="width:auto">Publish</button>' +
    '</div></div>';
  main.innerHTML = html;

  var card = $('formCard');
  card.innerHTML = '<h2><span class="n">EDIT</span> ' + esc(schema.label) + '</h2>';
  if(schema.list) renderListEditor(card, schema.list, mod);
  else renderFieldSet(card, schema.fields, formState);

  $('saveBtn').addEventListener('click', function(){ saveDraft(mod); });
  $('publishBtn').addEventListener('click', function(){ publishModule(mod); });
  $('discardBtn').addEventListener('click', function(){ discardModule(mod); });

  loadVersions(mod);
}

function renderFieldSet(container, fields, dataObj){
  fields.forEach(function(f){
    var wrap = document.createElement('div');
    wrap.className = 'f';
    if(f.type === 'tags'){
      wrap.innerHTML = '<label>' + esc(f.label) + '</label><div class="tag-editor" data-key="' + f.key + '"></div>' +
        '<div class="tag-add"><input type="text" placeholder="Add and press Enter" data-tagadd="' + f.key + '"></div>';
      container.appendChild(wrap);
      renderTags(wrap.querySelector('.tag-editor'), dataObj, f.key);
      wrap.querySelector('[data-tagadd]').addEventListener('keydown', function(e){
        if(e.key === 'Enter'){
          e.preventDefault();
          var v = e.target.value.trim();
          if(v){ (dataObj[f.key] = dataObj[f.key]||[]).push(v); renderTags(wrap.querySelector('.tag-editor'), dataObj, f.key); e.target.value=''; markDirty(); }
        }
      });
      return;
    }
    if(f.type === 'color'){
      var cval = dataObj[f.key] || '#000000';
      wrap.innerHTML = '<label>' + esc(f.label) + '</label><div class="color-row">' +
        '<input type="color" data-key="' + f.key + '" value="' + esc(cval) + '">' +
        '<input type="text" data-keytext="' + f.key + '" value="' + esc(cval) + '" maxlength="30" spellcheck="false">' +
        '</div>';
      container.appendChild(wrap);
      var cInput = wrap.querySelector('[data-key]');
      var tInput = wrap.querySelector('[data-keytext]');
      cInput.addEventListener('input', function(e){ dataObj[f.key] = e.target.value; tInput.value = e.target.value; markDirty(); });
      tInput.addEventListener('input', function(e){
        dataObj[f.key] = e.target.value;
        if(/^#[0-9a-f]{6}$/i.test(e.target.value)) cInput.value = e.target.value;
        markDirty();
      });
      return;
    }
    if(f.type === 'checkbox'){
      wrap.innerHTML = '<label class="f-check"><input type="checkbox" data-key="' + f.key + '" ' + (dataObj[f.key] ? 'checked' : '') + '> ' + esc(f.label) + '</label>';
      container.appendChild(wrap);
      wrap.querySelector('input').addEventListener('change', function(e){ dataObj[f.key] = e.target.checked; markDirty(); });
      return;
    }
    var tag = f.type === 'textarea' ? 'textarea' : 'input';
    wrap.innerHTML = '<label>' + esc(f.label) + '</label>' +
      (tag === 'textarea'
        ? '<textarea rows="3" data-key="' + f.key + '">' + esc(dataObj[f.key]) + '</textarea>'
        : '<input type="text" data-key="' + f.key + '" value="' + esc(dataObj[f.key]) + '">');
    container.appendChild(wrap);
    wrap.querySelector('[data-key]').addEventListener('input', function(e){ dataObj[f.key] = e.target.value; markDirty(); });
  });
}

function renderTags(container, dataObj, key){
  var arr = dataObj[key] || [];
  container.innerHTML = '';
  arr.forEach(function(val, i){
    var chip = document.createElement('span');
    chip.className = 'tag-chip';
    chip.innerHTML = '<span></span><button type="button" aria-label="Remove">×</button>';
    chip.querySelector('span').textContent = val;
    chip.querySelector('button').addEventListener('click', function(){
      arr.splice(i,1); renderTags(container, dataObj, key); markDirty();
    });
    container.appendChild(chip);
  });
}

function renderListEditor(container, listSchema, mod){
  var wrap = document.createElement('div');
  wrap.id = 'listItems';
  container.appendChild(wrap);
  var arr = formState[listSchema.key] = formState[listSchema.key] || [];
  function draw(){
    wrap.innerHTML = '';
    arr.forEach(function(item, idx){
      var block = document.createElement('div');
      block.className = 'item-block';
      var head = document.createElement('div');
      head.className = 'item-head';
      head.innerHTML = '<span class="item-tag">' + esc(listSchema.itemLabel) + ' ' + (idx+1) + '</span>';
      var del = document.createElement('button');
      del.type = 'button'; del.className = 'icon-btn'; del.title = 'Remove'; del.textContent = '×';
      del.addEventListener('click', function(){ arr.splice(idx,1); draw(); markDirty(); });
      head.appendChild(del);
      block.appendChild(head);
      renderFieldSet(block, listSchema.fields, item);
      wrap.appendChild(block);
    });
    if(!arr.length){
      var empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'No items yet — add one below.';
      wrap.appendChild(empty);
    }
  }
  draw();
  var addBtn = document.createElement('button');
  addBtn.type = 'button'; addBtn.className = 'add-item';
  addBtn.textContent = '+ Add ' + listSchema.itemLabel.toLowerCase();
  addBtn.addEventListener('click', function(){
    arr.push(JSON.parse(JSON.stringify(listSchema.defaultItem)));
    draw(); markDirty();
  });
  container.appendChild(addBtn);
}

function markDirty(){
  isDirty = true;
  var s = $('statusText');
  if(s) s.textContent = 'Unsaved changes';
}

/* ================= Save / Publish / Discard ================= */
function saveDraft(mod){
  var btn = $('saveBtn');
  btn.disabled = true;
  api('/api/admin/content/' + mod, { method:'PUT', body:{ data: formState } })
    .then(function(){
      isDirty = false;
      toast('Draft saved.', 'ok');
      $('statusText').textContent = 'Draft saved';
      return loadModules();
    })
    .then(function(){ refreshNavState(); renderModuleForm(mod); })
    .catch(function(err){ toast(err.message || 'Save failed', 'err'); })
    .finally(function(){ btn.disabled = false; });
}

function publishModule(mod){
  var btn = $('publishBtn');
  btn.disabled = true;
  saveThenPublish(mod, btn);
}
function saveThenPublish(mod, btn){
  api('/api/admin/content/' + mod, { method:'PUT', body:{ data: formState } })
    .then(function(){ return api('/api/admin/content/' + mod + '/publish', { method:'POST' }); })
    .then(function(){
      isDirty = false;
      toast('Published to your live website.', 'ok');
      return loadModules();
    })
    .then(function(){ refreshNavState(); renderModuleForm(mod); })
    .catch(function(err){ toast(err.message || 'Publish failed', 'err'); })
    .finally(function(){ btn.disabled = false; });
}

function discardModule(mod){
  if(!confirm('Discard unsaved / unpublished draft changes for this section? This reverts to the last published version.')) return;
  api('/api/admin/content/' + mod + '/discard', { method:'POST' })
    .then(function(){ toast('Draft discarded.', 'ok'); return loadModules(); })
    .then(function(){ refreshNavState(); renderModuleForm(mod); })
    .catch(function(err){ toast(err.message || 'Failed', 'err'); });
}

/* ================= Versions ================= */
function loadVersions(mod){
  api('/api/admin/versions/' + mod).then(function(data){
    var list = $('histList');
    if(!list) return;
    var versions = data.versions || [];
    if(!versions.length){ list.innerHTML = '<li class="empty">No history yet.</li>'; return; }
    list.innerHTML = versions.map(function(v){
      return '<li><span><span class="act">' + esc(v.action) + '</span> — ' + esc(v.user_email) + '<br>' +
        new Date(v.ts).toLocaleString() + '</span>' +
        '<button data-restore="' + v.id + '">Restore</button></li>';
    }).join('');
    list.querySelectorAll('[data-restore]').forEach(function(b){
      b.addEventListener('click', function(){
        if(!confirm('Restore this version as the new draft? You will still need to Publish it.')) return;
        api('/api/admin/versions/' + b.dataset.restore + '/restore', { method:'POST' })
          .then(function(){ toast('Version restored to draft.', 'ok'); return loadModules(); })
          .then(function(){ refreshNavState(); renderModuleForm(mod); })
          .catch(function(err){ toast(err.message || 'Restore failed', 'err'); });
      });
    });
  }).catch(function(){ var l=$('histList'); if(l) l.innerHTML='<li class="empty">Could not load history.</li>'; });
}

/* ================= Activity ================= */
function renderActivity(){
  var main = $('mainArea');
  main.innerHTML = '<div class="topbar"><div><h1>Activity log</h1><p>Recent admin actions on your studio site.</p></div></div>' +
    '<div class="card"><ul class="hist-list" id="activityList"><li class="empty">Loading…</li></ul></div>';
  api('/api/admin/activity').then(function(data){
    var list = $('activityList');
    var rows = data.activity || [];
    if(!rows.length){ list.innerHTML = '<li class="empty">No activity yet.</li>'; return; }
    list.innerHTML = rows.map(function(r){
      return '<li><span><span class="act">' + esc(r.action) + '</span>' + (r.module ? ' · ' + esc(r.module) : '') +
        '<br>' + esc(r.user_email || '') + ' — ' + new Date(r.ts).toLocaleString() + '</span>' +
        '<span style="color:var(--muted);font-size:11px">' + esc(r.ip || '') + '</span></li>';
    }).join('');
  }).catch(function(){ $('activityList').innerHTML = '<li class="empty">Could not load activity.</li>'; });
}

/* ================= Boot ================= */
checkSession();
})();
