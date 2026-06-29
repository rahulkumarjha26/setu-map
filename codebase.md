# setu-map Codebase

Generated on Tue Jun 30 04:02:07 IST 2026

---
**.gitignore**

```
.DS_Store
node_modules/
.vercel

```

---
**.opencode/skills/skill-discovery/SKILL.md**

```
---
name: skill-discovery
description: |
  Use at the START of every conversation or task. Scans the project's
  `.opencode/skills/` directory for installed skills, picks the best match for
  the user's request, presents the top candidates to the user, and proceeds
  according to the chosen skill. Gate: fire on ANY new user request — not just
  specific keywords. Do NOT skip or run silently; always surface findings.
---

# Skill Discovery

## Rule

At the beginning of every conversation or task, before writing any code or
answering any question:

1. **Scan** — List all directories under `.opencode/skills/` (in the project
   root or `~/.config/opencode/skills/`). Each directory containing a
   `SKILL.md` is an installed skill.

2. **Match** — For each skill found, read its `name` and `description` from
   the frontmatter. Compare against the user's current request. Identify which
   skills are relevant.

3. **Surface** — Present the findings to the user:
   - If the best match is strong (clearly addresses the request): recommend it
     and ask the user to confirm before loading it.
   - If multiple skills are relevant: list the top candidates with a brief
     explanation of what each does and why it fits.
   - If no skills match: say so and proceed normally.
   - If no skills are installed at all: say so and proceed normally — no
     warnings or blocks.

4. **Proceed** — Once the user confirms a skill (or declines all), follow that
   skill's instructions for the remainder of the task.

## SkillsGate

The project also has [SkillsGate](https://skillsgate.ai) installed
(accessible via `skillsgate-tui` or `npx skillsgate`). SkillsGate is a visual
skill manager for browsing 91,000+ public skills from skills.sh, installing
them to specific agents, and editing them. If the user asks to find or
install new skills, use SkillsGate rather than manual setup.

## What NOT to do

- Do not silently skip skill discovery.
- Do not make up skills that are not actually installed.
- Do not prompt the user about skills more than once per conversation (cache
  the result).

```

---
**app.js**

```
const CFG = window.SETU_CONFIG;
const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
const T = window.SETU_I18N || {};

// --- categories ---
const CATS = ["all","sanitation","water","roads","education","health","environment","elderly","other"];
const CAT_COLOR = {
  sanitation:"#22c55e", water:"#3b82f6", roads:"#78716c", education:"#f59e0b",
  health:"#f43f5e", environment:"#10b981", elderly:"#8b5cf6", other:"#64706a"
};
const CAT_ICON = {
  sanitation:"trash-2", water:"droplet", roads:"construction", education:"graduation-cap",
  health:"heart-pulse", environment:"leaf", elderly:"users", other:"map-pin"
};
const STAGES = ["heard","sorted","funded","built","proven"];

// --- Lucide helpers ---
function toPascal(s){ return s.split('-').map(function(w){ return w[0].toUpperCase()+w.slice(1); }).join(''); }
function catIcon(cat, color, size){
  try {
    var name = toPascal(CAT_ICON[cat] || "map-pin");
    var node = lucide.icons[name];
    if(!node) return '';
    return lucide.createElement(node).outerHTML.replace('<svg ', '<svg width="'+size+'" height="'+size+'" stroke="'+(color||'#64706a')+'" ');
  } catch(e){ return ''; }
}

// --- helpers ---
function pinColor(p){
  if(p.stage === "proven") return "#10b981";
  if(p.legality_bin === "statutory") return "#78716c";
  if(p.legality_bin === "reframe")   return "#f59e0b";
  return "#22c55e";
}

function stageLabel(p){
  if(p.legality_bin === "statutory"){
    if(p.gov_filed === "resolved")      return "Resolved by "+(p.gov_authority||"authority");
    if(p.gov_filed === "acknowledged")  return (p.gov_authority||"Authority")+" acknowledged it";
    if(p.gov_filed === "filed_by_citizen") return "Filed with "+(p.gov_authority||"authority")+" — awaiting action";
    return T.stageNotFiled || "Not yet filed — government's duty";
  }
  var labels = {
    heard: T.stageHeard || "Heard", sorted: T.stageSorted || "Sorted",
    funded: T.stageFunded || "Funded", built: T.stageBuilt || "Built",
    proven: T.stageProven || "Proven"
  };
  return labels[p.stage] || "Heard";
}

function chipClass(p){
  if(p.stage==="proven") return "dc-chip-proven";
  if(p.legality_bin==="statutory") return "dc-chip-statutory";
  if(p.legality_bin==="reframe") return "dc-chip-reframe";
  return "dc-chip-fundable";
}

function stageIndex(p){ var i = STAGES.indexOf(p.stage); return i<0?0:i; }

// --- distance ---
var userLat = CFG.CENTER.lat;
var userLng = CFG.CENTER.lng;

function haversineDistance(lat1, lng1, lat2, lng2){
  var R = 6371;
  var dLat = (lat2-lat1)*Math.PI/180;
  var dLng = (lng2-lng1)*Math.PI/180;
  var a = Math.sin(dLat/2)*Math.sin(dLat/2) +
    Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)*Math.sin(dLng/2);
  var c = 2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
  return R*c;
}

function formatDistance(km){
  if(km < 0.1) return Math.round(km*1000)+" m";
  if(km < 1) return (km*1000).toFixed(0)+" m";
  if(km < 10) return km.toFixed(1)+" km";
  return Math.round(km)+" km";
}

function progressPct(p){
  var si = stageIndex(p);
  if(p.stage==="proven") return 100;
  if(p.legality_bin==="statutory"){
    if(p.gov_filed==="resolved") return 100;
    if(p.gov_filed==="filed_by_citizen"||p.gov_filed==="acknowledged") return 50;
    return 20;
  }
  return Math.round((si/(STAGES.length-1))*100);
}

// --- gov routing helpers ---
var GOV = {
  "MCD": { "name": "MCD", "wa": "918588887773", "email": "mcd-ithelpdesk@mcd.nic.in", "web": "https://mcd.everythingcivic.com/new_complain" },
  "DJB": { "name": "Delhi Jal Board", "wa": "919650291021", "email": "grievances-djb@delhi.gov.in", "web": "https://mcdonline.nic.in" }
};

function buildGovWhatsAppLink(p){
  var a = GOV[p.gov_authority] || GOV.MCD;
  var body = "Civic complaint via Setu. Issue: "+p.title+". "+p.description+" Location (approx): "+p.latitude+","+p.longitude+".";
  return "https://wa.me/"+a.wa+"?text="+encodeURIComponent(body);
}

function buildGovEmailLink(p){
  var a = GOV[p.gov_authority] || GOV.MCD;
  var body = "Civic complaint via Setu. Issue: "+p.title+". "+p.description+" Location (approx): "+p.latitude+","+p.longitude+".";
  return "mailto:"+a.email+"?subject="+encodeURIComponent("Civic Grievance via Setu")+"&body="+encodeURIComponent(body);
}

function rank(p){
  if(p.stage==='proven')return 0;
  if(p.stage==='built')return 1;
  if(p.stage==='funded')return 2;
  if(p.legality_bin==='statutory')return 5;
  if(p.legality_bin==='reframe')return 4;
  return 3;
}

// --- reverse geocode ---
var cachedPlace = '';
async function placeName(lat,lng){
  try{
    var r = await fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat='+lat+'&lon='+lng+'&zoom=14',
      {headers:{'Accept-Language':'en'}});
    var j = await r.json(); var a = j.address||{};
    return (a.suburb||a.neighbourhood||a.city_district||a.city||a.town||"Your area")
         + (a.city||a.state ? ", " + (a.city||a.state) : "");
  }catch(e){ return "Your area"; }
}

// --- forward geocode ---
var searchTimeout = null;
async function searchLocation(query){
  try{
    var r = await fetch('https://nominatim.openstreetmap.org/search?format=json&q='+encodeURIComponent(query)+'&limit=1',
      {headers:{'Accept-Language':'en'}});
    var results = await r.json();
    if(results.length > 0){
      var lat = parseFloat(results[0].lat);
      var lng = parseFloat(results[0].lon);
      map.flyTo([lat, lng], Math.max(14, map.getZoom()), {duration: 1.2});
      return true;
    }
  }catch(e){}
  return false;
}

// --- map setup ---
var map = L.map('map',{zoomControl:false,attributionControl:true,minZoom:4,maxZoom:18})
  .setView([CFG.CENTER.lat, CFG.CENTER.lng], CFG.CENTER.zoom);

var tiles = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
  {subdomains:'abcd',attribution:'&copy; OSM &copy; CARTO',maxZoom:19}).addTo(map);

var seedLayer = L.markerClusterGroup({
  chunkedLoading: true, maxClusterRadius: 50,
  spiderfyOnMaxZoom: true, showCoverageOnHover: false, zoomToBoundsOnClick: true,
  iconCreateFunction: function(cluster){
    var count = cluster.getChildCount();
    var size = 's';
    if(count >= 10) size = 'm';
    if(count >= 30) size = 'l';
    return L.divIcon({
      html: '<div class="cluster cluster-'+size+'">'+count+'</div>',
      className: '', iconSize: [44, 44]
    });
  }
}).addTo(map);

var sensitiveLayer = L.layerGroup().addTo(map);
var youMarker = L.marker([CFG.CENTER.lat, CFG.CENTER.lng],
  {icon:L.divIcon({className:'',html:'<div class="you"></div>',iconSize:[20,20],iconAnchor:[10,10]}),zIndexOffset:600}).addTo(map);

// --- pin seed HTML ---
function seedHTML(p){
  var c = pinColor(p);
  var fill = stageIndex(p)/(STAGES.length-1);
  var C = 100, off = C*(1-fill);
  var fuzz = p.is_sensitive ? '<div class="seed-fuzz"></div>' : '';
  var badge = '';
  if(p.legality_bin === "statutory" && p.gov_filed === "awaiting_citizen") badge = '<div class="sd-badge sd-alert">!</div>';
  else if(p.legality_bin === "statutory" && (p.gov_filed === "filed_by_citizen" || p.gov_filed === "acknowledged")) badge = '<div class="sd-badge sd-ok">&#10003;</div>';
  return '<div class="seed '+(p.stage==='proven'?'proven':'')+'">'+fuzz+
    '<svg class="seed-ring" width="44" height="44" viewBox="0 0 44 44">'+
      '<circle cx="22" cy="22" r="18" fill="#fffefc" stroke="#e3e7e0" stroke-width="3"/>'+
      '<circle cx="22" cy="22" r="18" fill="none" stroke="'+c+'" stroke-width="3.5" stroke-linecap="round" '+
        'stroke-dasharray="'+C+'" stroke-dashoffset="'+off+'" transform="rotate(-90 22 22)"/>'+
    '</svg>'+
    '<div class="seed-glyph">'+catIcon(p.category, c, 18)+'</div>'+badge+
  '</div>';
}

function fitToPins(shown){
  var pts = shown.filter(function(p){ return p.latitude!=null && p.longitude!=null; }).map(function(p){ return [p.latitude,p.longitude]; });
  if(pts.length === 0){ map.setView([CFG.CENTER.lat, CFG.CENTER.lng], CFG.CENTER.zoom); }
  else if(pts.length === 1){ map.setView(pts[0], 15); }
  else { map.fitBounds(L.latLngBounds(pts).pad(0.25), {maxZoom:15}); }
}

// --- state ---
var ALL = [];
var curCat = "all";
var markers = {};
var selectedId = null;
var searchQuery = '';
var lastLiveUpdate = 0;
var liveUpdateCooldown = 2000;

function matchesSearch(p, query){
  if(!query) return true;
  var q = query.toLowerCase();
  if((p.title||'').toLowerCase().indexOf(q) !== -1) return true;
  if((p.description||'').toLowerCase().indexOf(q) !== -1) return true;
  if((p.category||'').toLowerCase().indexOf(q) !== -1) return true;
  if((p.reporter_handle||'').toLowerCase().indexOf(q) !== -1) return true;
  if((p.gov_authority||'').toLowerCase().indexOf(q) !== -1) return true;
  return false;
}

// --- loading screen ---
function hideLoadingScreen(){
  var ls = document.getElementById('loadingScreen');
  if(ls){ ls.classList.add('hide'); setTimeout(function(){ ls.style.display = 'none'; }, 500); }
}

function showLoadingScreen(){
  var ls = document.getElementById('loadingScreen');
  if(ls){ ls.style.display = 'flex'; ls.classList.remove('hide'); }
}

// --- data loading ---
async function loadWounds(showLoading){
  if(showLoading) showLoadingScreen();
  var refreshBtn = document.getElementById('refreshBtn');
  if(refreshBtn && !showLoading) refreshBtn.classList.add('loading');

  try {
    var _c = await sb.from('public_problems').select('*').order('created_at',{ascending:false});
    var data = _c.data, error = _c.error;
    if(error){ console.error(error); toast(T.toastCouldNotLoad || 'Could not load the map.', true); if(showLoading) hideLoadingScreen(); if(refreshBtn) refreshBtn.classList.remove('loading'); return; }
    ALL = data || [];
    render();
    if(showLoading) hideLoadingScreen();
    if(refreshBtn) refreshBtn.classList.remove('loading');
  } catch(e){
    console.error(e);
    toast(T.toastCouldNotLoad || 'Could not load the map.', true);
    if(showLoading) hideLoadingScreen();
    if(refreshBtn) refreshBtn.classList.remove('loading');
  }
}

// --- render ---
function render(){
  seedLayer.clearLayers();
  sensitiveLayer.clearLayers();
  markers = {};

  var shown = ALL.filter(function(p){
    if(curCat !== "all" && p.category !== curCat) return false;
    if(!matchesSearch(p, searchQuery)) return false;
    return true;
  });

  shown.sort(function(a,b){ return rank(a)-rank(b); });

  // Empty state
  var empty = document.getElementById('emptyState');
  if(shown.length === 0){ empty.classList.remove('hidden'); } else { empty.classList.add('hidden'); }

  // Hero stats
  var totalAll = ALL.length;
  var resolved = ALL.filter(function(p){ return p.stage==="proven" || (p.legality_bin==="statutory"&&p.gov_filed==="resolved"); }).length;
  var active = totalAll - resolved;
  document.getElementById('hsHealed').textContent = resolved;
  document.getElementById('hsActive').textContent = active;
  document.getElementById('hsTotal').textContent = totalAll;

  // FAB link
  document.getElementById('reportFab').href = CFG.BOT_URL || "#";

  var useStagger = shown.length <= 60;

  shown.forEach(function(p, i){
    if(p.latitude==null || p.longitude==null) return;
    var m = L.marker([p.latitude,p.longitude],
      {icon:L.divIcon({
        className:'mk'+(selectedId===p.id?' selected':''),
        html:seedHTML(p), iconSize:[44,44],iconAnchor:[22,22]
      })});
    seedLayer.addLayer(m);
    if(useStagger){
      setTimeout(function(){
        var el = m.getElement();
        if(el) el.style.animationDelay = (i * 40)+'ms';
      }, 50);
    }
    m.on('click',function(){ openDossier(p); });
    markers[p.id]=m;
    if(p.is_sensitive){
      L.circle([p.latitude,p.longitude],{radius:300,color:'#a7c5b0',weight:1,dashArray:'5 6',fillColor:'#d1fae5',fillOpacity:.18}).addTo(sensitiveLayer);
    }
  });

  fitToPins(shown);

  // Dock list
  var list = document.getElementById('dockList');
  list.innerHTML = '';

  var proven = shown.filter(function(p){ return p.stage==="proven"; }).length;
  var inMotion = shown.filter(function(p){ return p.stage==="proven"||p.stage==="built"||p.stage==="funded"||(p.legality_bin==="statutory"&&p.gov_filed==="resolved"); }).length;

  var titleStr;
  if(shown.length === 0){
    titleStr = T.dockNoWounds || 'No wounds here yet.';
  } else if(proven > 0){
    titleStr = proven + ' ' + (T.dockHealed || 'resolved');
    if(inMotion > proven) titleStr += ' · ' + (inMotion - proven) + ' ' + (T.dockInMotion || 'in progress');
  } else if(inMotion > 0){
    titleStr = inMotion + ' ' + (T.dockInMotion || 'in progress');
  } else {
    titleStr = shown.length + ' ' + (shown.length > 1 ? (T.dockWoundsPlural || 'wounds') : (T.dockWounds || 'wound')) + ' ' + (T.dockNearYou || 'near you');
  }

  document.getElementById('dockTitle').textContent = titleStr;

  shown.forEach(function(p, i){
    var d = document.createElement('div');
    d.className = 'dc-item' + (p.legality_bin==='statutory'?' statutory':'') + (selectedId===p.id?' selected':'');
    d.style.animationDelay = (i * 25)+'ms';
    d.setAttribute('role','listitem');
    d.setAttribute('tabindex','0');

    var c = CAT_COLOR[p.category] || '#22c55e';
    var pct = progressPct(p);

    var thumb = p.media_type==="photo" && p.media_url
      ? '<img src="'+p.media_url+'" alt="" loading="lazy">'
      : '<div class="dc-thumb-inner" style="background:'+c+'15">'+catIcon(p.category,c,24)+'</div>';

    var distHTML = '';
    if(p.latitude != null && p.longitude != null){
      var km = haversineDistance(userLat, userLng, p.latitude, p.longitude);
      distHTML = '<span class="dc-dist"><i data-lucide="map-pin" width="11" height="11"></i> '+formatDistance(km)+'</span>';
    }

    d.innerHTML =
      '<div class="dc-thumb">'+thumb+'</div>'+
      '<div class="dc-main">'+
        '<span class="dc-chip '+chipClass(p)+'">'+stageLabel(p)+'</span>'+
        '<div class="dc-title">'+escapeHTML(p.title||"Untitled")+'</div>'+
        '<div class="dc-sub">'+escapeHTML(p.reporter_handle||"A citizen")+distHTML+'</div>'+
        '<div class="dc-bar-wrap"><div class="dc-bar" style="width:'+pct+'%"></div></div>'+
      '</div>';

    d.addEventListener('click',function(){ openDossier(p); map.flyTo([p.latitude,p.longitude],Math.max(14,map.getZoom()),{duration:.7}); });
    d.addEventListener('keydown',function(e){ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); openDossier(p); map.flyTo([p.latitude,p.longitude],Math.max(14,map.getZoom()),{duration:.7}); } });
    list.appendChild(d);
  });

  if(typeof lucide!=='undefined' && lucide.createIcons) lucide.createIcons();
}

// --- dossier header ---
function dossierHeader(p){
  if(p.media_type==="photo" && p.media_url) return '<img src="'+p.media_url+'" alt="">';
  var c = CAT_COLOR[p.category] || "#10b981";
  return '<div class="dos-hero-fallback" style="background:linear-gradient(160deg,'+c+'25,'+c+'08)">'+catIcon(p.category,c,64)+'</div>';
}

// --- dossier open ---
function openDossier(p){
  if(selectedId && markers[selectedId]){
    var oldEl = markers[selectedId].getElement();
    if(oldEl) oldEl.classList.remove('selected');
  }
  selectedId = p.id;
  if(markers[p.id]){
    var el = markers[p.id].getElement();
    if(el) el.classList.add('selected');
  }

  document.getElementById('dosTitle').textContent = p.title||"Untitled";
  document.getElementById('dosCat').textContent = p.category||"";
  document.getElementById('dosStage').textContent = stageLabel(p);
  document.getElementById('dosDesc').textContent = p.description||p.transcript||"";
  document.getElementById('dosImgContent').innerHTML = dossierHeader(p);

  // Progress bar
  var pct = progressPct(p);
  document.getElementById('dosProgressBar').style.width = pct+'%';

  // Trajectory
  var tr = document.getElementById('dosTraj'); tr.innerHTML='';
  var si = stageIndex(p);
  for(var i=0;i<STAGES.length;i++){
    var nd=document.createElement('div');
    nd.className='nd'+(i<si?' done':'')+(i===si?' curr':''); tr.appendChild(nd);
    if(i<STAGES.length-1){ var sg=document.createElement('div'); sg.className='sg'+(i<si?' done':''); tr.appendChild(sg); }
  }
  document.getElementById('dosNow').textContent = stageLabel(p);

  // Details
  var bins = {
    fundable:["Companies can fund this","This wound sits cleanly on Schedule VII — lawful corporate CSR. The full sum reaches the project."],
    statutory:["Government's duty","By law this is the state's own responsibility (e.g. roads, drains). CSR cannot fund it, so Setu routes it to the municipality and tracks it honestly."],
    reframe:["Needs the honest reframe","Part is the government's duty (routed back); part is lawfully fundable. Setu splits it so the law is obeyed and no one is misled."]
  };
  var b = bins[p.legality_bin] || bins.reframe;
  document.getElementById('ledgerBin').textContent = b[0];
  document.getElementById('ledgerExplain').textContent = b[1];

  document.getElementById('ledgerCards').innerHTML =
    '<div class="lqc"><b>'+(T.statsLegal||'Legal')+'</b><span>'+(T.scheduleVII||'Schedule VII')+'</span></div>'+
    '<div class="lqc"><b>'+(T.statsPartner||'Partner')+'</b><span>'+(p.stage==="heard"?(T.toBeMatched||'to be matched'):(T.csrReady||'12A·80G·CSR-1'))+'</span></div>'+
    '<div class="lqc"><b>'+(T.statsProof||'Proof')+'</b><span>'+((["funded","built","proven"].includes(p.stage))?(T.fourLayer||'4-layer'):(T.onceFunded||'once funded'))+'</span></div>';

  var fa = document.getElementById('dosFileAction');
  if(p.legality_bin === "statutory" && p.gov_filed === "awaiting_citizen"){
    var authName = GOV[p.gov_authority] ? GOV[p.gov_authority].name : (p.gov_authority||"the authority");
    document.getElementById('dosFileAuth').textContent = authName;
    document.getElementById('dosFileWA').href = buildGovWhatsAppLink(p);
    document.getElementById('dosFileEmail').href = buildGovEmailLink(p);
    fa.classList.remove('hidden');
  } else {
    fa.classList.add('hidden');
  }

  if(typeof lucide!=='undefined' && lucide.createIcons) lucide.createIcons();

  setDosMode('story');
  var dossierEl = document.getElementById('dossier');
  dossierEl.classList.remove('closing');
  dossierEl.classList.add('show');

  setTimeout(function(){ document.getElementById('dosClose').focus(); }, 100);
}

function setDosMode(m){
  document.getElementById('storyBlock').classList.toggle('hidden', m!=="story");
  document.getElementById('detailsBlock').classList.toggle('hidden', m!=="details");
  document.getElementById('tabStory').classList.toggle('active', m==="story");
  document.getElementById('tabDetails').classList.toggle('active', m==="details");
}

// --- dossier close ---
function closeDossier(){
  var dossierEl = document.getElementById('dossier');
  dossierEl.classList.add('closing');
  dossierEl.classList.remove('show');
  setTimeout(function(){ dossierEl.classList.remove('closing'); }, 450);

  if(selectedId && markers[selectedId]){
    var el = markers[selectedId].getElement();
    if(el) el.classList.remove('selected');
  }
  selectedId = null;
  document.querySelectorAll('.dc-item.selected').forEach(function(d){ d.classList.remove('selected'); });
}

// --- share ---
function shareWound(p){
  var url = window.location.origin + window.location.pathname + '#wound-' + p.id;
  var title = T.shareTitle || 'Civic wound on Setu';

  if(navigator.share){
    navigator.share({ title: title, text: p.title, url: url }).catch(function(){});
  } else if(navigator.clipboard){
    navigator.clipboard.writeText(url).then(function(){
      var btn = document.getElementById('dosShare');
      if(btn){
        btn.classList.add('copied');
        var icon = btn.querySelector('i');
        if(icon) icon.setAttribute('data-lucide','check');
        if(typeof lucide!=='undefined' && lucide.createIcons) lucide.createIcons();
        setTimeout(function(){
          btn.classList.remove('copied');
          if(icon) icon.setAttribute('data-lucide','share-2');
          if(typeof lucide!=='undefined' && lucide.createIcons) lucide.createIcons();
        }, 1800);
      }
    }).catch(function(){});
  }
}

// --- category bar ---
function buildCatbar(){
  var bar = document.getElementById('catbar'); bar.innerHTML='';
  CATS.forEach(function(c){
    var b=document.createElement('button');
    b.className='cat'+(c==="all"?' active':'');
    b.setAttribute('role','tab');
    b.setAttribute('aria-selected', c==="all"?'true':'false');
    if(c==="all"){
      b.innerHTML = '<i data-lucide="layers" width="14" height="14"></i> <span>'+(T.allWounds||'All')+'</span>';
    } else {
      b.innerHTML = catIcon(c, CAT_COLOR[c], 14) + ' <span>' + c.charAt(0).toUpperCase() + c.slice(1) + '</span>';
    }
    b.addEventListener('click',function(){
      curCat=c;
      document.querySelectorAll('.cat').forEach(function(x){ x.classList.remove('active'); x.setAttribute('aria-selected','false'); });
      b.classList.add('active'); b.setAttribute('aria-selected','true');
      render();
    });
    bar.appendChild(b);
  });
}

// --- utils ---
function escapeHTML(s){ return (s||"").replace(/[&<>"']/g,function(m){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]; }); }

var toastT;
function toast(m, retry){
  var t=document.getElementById('toast');
  var html = '<span>'+escapeHTML(m)+'</span>';
  if(retry) html += '<button class="toast-btn" id="toastRetryBtn">'+(T.toastRetry||'Retry')+'</button>';
  t.innerHTML = html;
  t.classList.add('show');
  clearTimeout(toastT);
  if(!retry) toastT=setTimeout(function(){ t.classList.remove('show'); }, 3000);
  if(retry){
    setTimeout(function(){
      var rb = document.getElementById('toastRetryBtn');
      if(rb) rb.addEventListener('click',function(){ t.classList.remove('show'); loadWounds(false); });
    }, 50);
  }
}

// --- event wiring ---
document.getElementById('dosClose').addEventListener('click', closeDossier);
document.getElementById('dosScrim').addEventListener('click', closeDossier);
document.getElementById('tabStory').addEventListener('click',function(){ setDosMode('story'); });
document.getElementById('tabDetails').addEventListener('click',function(){ setDosMode('details'); });
document.getElementById('refreshBtn').addEventListener('click',function(){ loadWounds(false); });

document.getElementById('dosShare').addEventListener('click',function(){
  if(selectedId){
    var p = ALL.find(function(x){ return x.id === selectedId; });
    if(p) shareWound(p);
  }
});

document.getElementById('emptyBtn').href = CFG.BOT_URL || "#";

// Search
var searchInput = document.getElementById('searchInput');
searchInput.addEventListener('input', function(){
  searchQuery = this.value.trim();
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(function(){
    render();
    if(searchQuery.length >= 3){
      var shownAfterFilter = ALL.filter(function(p){
        if(curCat !== "all" && p.category !== curCat) return false;
        if(!matchesSearch(p, searchQuery)) return false;
        return true;
      });
      if(shownAfterFilter.length === 0){
        searchLocation(searchQuery).then(function(found){
          if(found){ searchQuery = ''; searchInput.value = ''; render(); }
        });
      }
    }
  }, 300);
});

searchInput.addEventListener('keydown', function(e){
  if(e.key === 'Escape'){ this.value = ''; searchQuery = ''; render(); this.blur(); }
});

// Escape to close dossier
document.addEventListener('keydown', function(e){
  if(e.key === 'Escape'){
    var dossierEl = document.getElementById('dossier');
    if(dossierEl.classList.contains('show') && !dossierEl.classList.contains('closing')) closeDossier();
  }
});

// Legend toggle
document.getElementById('legendToggle').addEventListener('click', function(){
  document.getElementById('legend').classList.toggle('show-mobile');
});

document.addEventListener('click', function(e){
  var legend = document.getElementById('legend');
  var toggle = document.getElementById('legendToggle');
  if(!legend || !toggle) return;
  if(window.innerWidth > 820) return;
  if(!legend.classList.contains('show-mobile')) return;
  if(!legend.contains(e.target) && e.target !== toggle && !toggle.contains(e.target)){
    legend.classList.remove('show-mobile');
  }
});

// Swipe to dismiss dossier
var touchStartX = 0, touchStartY = 0;
document.getElementById('dosPanel').addEventListener('touchstart', function(e){
  if(e.touches.length === 1){ touchStartX = e.touches[0].clientX; touchStartY = e.touches[0].clientY; }
}, {passive: true});

document.getElementById('dosPanel').addEventListener('touchmove', function(e){
  if(e.touches.length === 1){
    var dx = e.touches[0].clientX - touchStartX;
    var dy = e.touches[0].clientY - touchStartY;
    if(Math.abs(dx) > Math.abs(dy) && dx > 0 && this.scrollTop <= 5){
      this.style.transform = 'translateX('+dx+'px)'; this.style.transition = 'none';
    }
  }
}, {passive: false});

document.getElementById('dosPanel').addEventListener('touchend', function(e){
  this.style.transform = ''; this.style.transition = '';
  var dx = (e.changedTouches[0]||{}).clientX - touchStartX;
  if(dx > 80) closeDossier();
});

// --- live line ---
function updateLiveLine(){
  var now = new Date();
  var h = now.getHours().toString().padStart(2,'0');
  var m = now.getMinutes().toString().padStart(2,'0');
  document.getElementById('dockK').textContent = (cachedPlace ? cachedPlace : (T.dockLoading || 'Loading…')) + " · " + (T.dockUpdated || 'updated') + " " + h + ":" + m;
}
updateLiveLine();
setInterval(updateLiveLine, 30000);

// --- init ---
if(typeof lucide!=='undefined' && lucide.createIcons) lucide.createIcons();
if(T.searchPlaceholder) document.getElementById('searchInput').placeholder = T.searchPlaceholder;

async function initLocation(){
  var lat = CFG.CENTER.lat, lng = CFG.CENTER.lng;
  if(navigator.geolocation){
    try {
      var pos = await new Promise(function(res, rej){ navigator.geolocation.getCurrentPosition(res, rej, {timeout:8000}); });
      lat = pos.coords.latitude; lng = pos.coords.longitude;
      userLat = lat; userLng = lng;
      map.setView([lat, lng], 14);
      map.removeLayer(youMarker);
      youMarker = L.marker([lat, lng],
        {icon:L.divIcon({className:'',html:'<div class="you"></div>',iconSize:[20,20],iconAnchor:[10,10]}),zIndexOffset:600}).addTo(map);
    } catch(e) {}
  }
  cachedPlace = await placeName(lat, lng);
  updateLiveLine();
}

buildCatbar();
initLocation();
loadWounds(true);

// Live updates with debounce
sb.channel('public_problems_changes')
  .on('postgres_changes',{event:'*',schema:'public',table:'problems'},function(){
    var now = Date.now();
    if(now - lastLiveUpdate < liveUpdateCooldown) return;
    lastLiveUpdate = now;
    loadWounds(false);
  })
  .subscribe();

```

---
**config.js**

```
// Public config. The anon key is safe in the browser — access is restricted by Supabase RLS.
// NEVER put the service key here.
window.SETU_CONFIG = {
  SUPABASE_URL: "https://lspvejiwouhkqdtphxzn.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxzcHZlaml3b3Voa3FkdHBoeHpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2NzM2MTksImV4cCI6MjA5ODI0OTYxOX0.OhqPxHbe7CFAcQbZ0RZ2tQEEVJHR7SbwEgmG5IqpGU8",
  BOT_URL: "https://t.me/SetuReportBot",
  CENTER: { lat: 28.5921, lng: 77.0460, zoom: 14 }
};

```

---
**i18n.js**

```
window.SETU_I18N = {};

(function() {
  'use strict';

  var strings = {
    en: {
      searchPlaceholder: 'Search a place or wound…',
      legendTitle: 'What the colours mean',
      legendFunding: 'Open for funding',
      legendReframe: 'Needs reframe',
      legendStatutory: "Government's duty — routed",
      legendProven: 'Proven / healed',
      dockLoading: 'Loading…',
      emptyTitle: 'This corner is quiet — for now.',
      emptyDesc: 'No wounds have been spoken here yet. Be the first. Your voice puts the first pin on the map.',
      emptyBtn: 'Speak a wound',
      storyTab: 'Story',
      detailsTab: 'Details',
      closeLabel: 'Close',
      shareLabel: 'Share this wound',
      fileWithAuth: 'File this with',
      fileViaWA: 'Tap to send a prefilled complaint via WhatsApp',
      fileWA: 'WhatsApp →',
      fileEmail: 'Email',
      zeroTaken: '₹0 taken by Setu · verified milestones only',
      refreshLabel: 'Refresh map data',
      loadingText: 'The map is waking up…',
      toastRetry: 'Retry',
      toastCouldNotLoad: 'Could not load the map.',
      dockHealed: 'healed',
      dockInMotion: 'in motion',
      dockWounds: 'wound',
      dockWoundsPlural: 'wounds',
      dockNearYou: 'near you',
      dockNoWounds: 'No wounds here yet.',
      dockUpdated: 'updated',
      shareTitle: 'Civic wound on Setu',
      shareCopied: 'Link copied!',
      statsLegal: 'Legal',
      statsPartner: 'Partner',
      statsProof: 'Proof',
      scheduleVII: 'Schedule VII',
      toBeMatched: 'to be matched',
      csrReady: '12A·80G·CSR-1',
      onceFunded: 'once funded',
      fourLayer: '4-layer',
      stageHeard: 'Heard',
      stageSorted: 'Sorted',
      stageFunded: 'Funded',
      stageBuilt: 'Built',
      stageProven: 'Proven',
      stageNotFiled: "Not yet filed — government's duty",
      allWounds: 'All wounds'
    },
    hi: {
      searchPlaceholder: 'कोई जगह या समस्या खोजें…',
      legendTitle: 'रंगों का मतलब',
      legendFunding: 'फंडिंग के लिए खुला',
      legendReframe: 'रीफ्रेम की ज़रूरत है',
      legendStatutory: 'सरकार की ज़िम्मेदारी',
      legendProven: 'सिद्ध / हल हुआ',
      dockLoading: 'लोड हो रहा है…',
      emptyTitle: 'यह कोना अभी शांत है।',
      emptyDesc: 'यहाँ अभी तक कोई समस्या नहीं बताई गई। पहल करें। आपकी आवाज़ नक़्शे पर पहला निशान लगाएगी।',
      emptyBtn: 'समस्या बताएं',
      storyTab: 'कहानी',
      detailsTab: 'विवरण',
      closeLabel: 'बंद करें',
      shareLabel: 'यह समस्या शेयर करें',
      fileWithAuth: 'इसमें शिकायत दर्ज करें',
      fileViaWA: 'WhatsApp पर पहले से लिखी शिकायत भेजें',
      fileWA: 'WhatsApp →',
      fileEmail: 'ईमेल',
      zeroTaken: 'Setu ने ₹0 लिया · केवल सत्यापित चरण',
      refreshLabel: 'नक़्शा ताज़ा करें',
      loadingText: 'नक़्शा जाग रहा है…',
      toastRetry: 'पुनः प्रयास करें',
      toastCouldNotLoad: 'नक़्शा लोड नहीं हो सका।',
      dockHealed: 'हल हुई',
      dockInMotion: 'प्रगति में',
      dockWounds: 'समस्या',
      dockWoundsPlural: 'समस्याएं',
      dockNearYou: 'आपके आस-पास',
      dockNoWounds: 'यहाँ कोई समस्या नहीं।',
      dockUpdated: 'अपडेट',
      shareTitle: 'Setu पर समस्या',
      shareCopied: 'लिंक कॉपी हुआ!',
      statsLegal: 'कानूनी',
      statsPartner: 'साझेदार',
      statsProof: 'प्रमाण',
      scheduleVII: 'अनुसूची VII',
      toBeMatched: 'मिलान होना बाकी',
      csrReady: '12A·80G·CSR-1',
      onceFunded: 'फंडिंग के बाद',
      fourLayer: '4-स्तरीय',
      stageHeard: 'सुनी गई',
      stageSorted: 'छांटी गई',
      stageFunded: 'फंड हुई',
      stageBuilt: 'बनी',
      stageProven: 'सिद्ध',
      stageNotFiled: 'अभी दर्ज नहीं — सरकार की ज़िम्मेदारी',
      allWounds: 'सभी समस्याएं'
    }
  };

  function resolve() {
    var stored = null;
    try { stored = localStorage.getItem('setu_lang'); } catch(e) {}
    var lang = stored;
    if (lang && strings[lang]) return lang;
    var nav = (navigator.language || '').split('-')[0];
    if (nav === 'hi') return 'hi';
    return 'en';
  }

  var currentLang = resolve();
  window.SETU_I18N = strings[currentLang];

  window.setLanguage = function(lang) {
    if (strings[lang]) {
      currentLang = lang;
      window.SETU_I18N = strings[lang];
      try { localStorage.setItem('setu_lang', lang); } catch(e) {}
      var els = document.querySelectorAll('[data-i18n]');
      for (var i = 0; i < els.length; i++) {
        var key = els[i].getAttribute('data-i18n');
        if (key && strings[lang][key]) els[i].textContent = strings[lang][key];
      }
      return true;
    }
    return false;
  };

  window.getLanguage = function() { return currentLang; };

  // Auto-apply the detected language on load
  if (currentLang !== 'en') window.setLanguage(currentLang);
})();

```

---
**index.html**

```
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0a3622">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="description" content="Setu — The Living Signal. A public map of civic wounds, tracked honestly.">
<meta property="og:title" content="Setu — The Map">
<meta property="og:description" content="A public map of civic wounds, tracked honestly.">
<meta property="og:type" content="website">
<link rel="icon" href="setu-app-icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="setu-app-icon.svg">
<link rel="manifest" href="manifest.json">
<title>Setu — The Map</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@300..700&family=Inter:wght@400..700&family=Mukta:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css">
<link rel="stylesheet" href="style.css">
<script src="https://unpkg.com/lucide@0.454.0"></script>
</head>
<body>

  <!-- LOADING SCREEN -->
  <div class="loading-screen" id="loadingScreen" role="status" aria-label="Loading">
    <img src="setu-icon.svg" alt="" class="loading-icon">
    <div class="loading-pulse"></div>
    <p class="loading-text">The map is waking up…</p>
  </div>

  <!-- MAP -->
  <div id="map"></div>
  <div class="map-tint"></div>

  <!-- REPORT FAB -->
  <a class="fab" id="reportFab" href="#" target="_blank" rel="noopener" title="Report a wound" aria-label="Report a wound">
    <i data-lucide="plus" width="24" height="24"></i>
  </a>

  <!-- HERO STATS -->
  <div class="hero-stats" id="heroStats">
    <div class="hs-card">
      <div class="hs-icon hs-icon-healed"><i data-lucide="shield-check" width="16" height="16"></i></div>
      <div class="hs-num" id="hsHealed">—</div>
      <div class="hs-label">Resolved</div>
    </div>
    <div class="hs-card">
      <div class="hs-icon hs-icon-active"><i data-lucide="activity" width="16" height="16"></i></div>
      <div class="hs-num" id="hsActive">—</div>
      <div class="hs-label">Active</div>
    </div>
    <div class="hs-card">
      <div class="hs-icon hs-icon-total"><i data-lucide="map-pin" width="16" height="16"></i></div>
      <div class="hs-num" id="hsTotal">—</div>
      <div class="hs-label">Total</div>
    </div>
  </div>

  <!-- TOP BAR -->
  <div class="topbar" role="banner">
    <div class="brand">
      <img src="setu-icon.svg" alt="Setu logo" class="brand-icon">
      <span class="brand-mark">Setu</span>
    </div>
    <div class="loc" id="locChip">
      <i data-lucide="search" class="search-icon" aria-hidden="true"></i>
      <input type="text" class="search-input" id="searchInput" placeholder="Search a place or wound…" aria-label="Search places or wounds" autocomplete="off">
    </div>
    <button class="refresh" id="refreshBtn" title="Refresh" aria-label="Refresh map data"><i data-lucide="refresh-cw"></i></button>
  </div>

  <!-- CATEGORY FILTER -->
  <div class="catbar" id="catbar" role="tablist" aria-label="Filter by category"></div>

  <!-- LEGEND -->
  <div class="legend" id="legend">
    <span class="lh">What the colours mean</span>
    <div class="lr"><span class="ld ld-fundable"></span>Open for funding</div>
    <div class="lr"><span class="ld ld-reframe"></span>Needs reframe</div>
    <div class="lr"><span class="ld ld-statutory"></span>Govt's duty — routed</div>
    <div class="lr"><span class="ld ld-proven"></span>Proven / healed</div>
  </div>

  <!-- LEGEND TOGGLE (mobile) -->
  <button class="legend-toggle" id="legendToggle" aria-label="Show colour legend">
    <i data-lucide="palette" width="16" height="16"></i>
  </button>

  <!-- DOCK -->
  <div class="dock" id="dock" role="complementary" aria-label="Wound list">
    <div class="dock-h">
      <div class="dock-k" id="dockK">Loading…</div>
      <h2 class="dock-title" id="dockTitle">Discover wounds near you</h2>
    </div>
    <div class="dock-list" id="dockList" role="list">
      <div class="dc-item skeleton" aria-hidden="true">
        <div class="dc-thumb skel"></div>
        <div class="dc-main">
          <div class="skel skel-chip"></div>
          <div class="skel skel-line"></div>
          <div class="skel skel-line-sm"></div>
        </div>
      </div>
      <div class="dc-item skeleton" aria-hidden="true">
        <div class="dc-thumb skel"></div>
        <div class="dc-main">
          <div class="skel skel-chip"></div>
          <div class="skel skel-line"></div>
          <div class="skel skel-line-sm"></div>
        </div>
      </div>
      <div class="dc-item skeleton" aria-hidden="true">
        <div class="dc-thumb skel"></div>
        <div class="dc-main">
          <div class="skel skel-chip"></div>
          <div class="skel skel-line"></div>
          <div class="skel skel-line-sm"></div>
        </div>
      </div>
      <div class="dc-item skeleton" aria-hidden="true">
        <div class="dc-thumb skel"></div>
        <div class="dc-main">
          <div class="skel skel-chip"></div>
          <div class="skel skel-line"></div>
          <div class="skel skel-line-sm"></div>
        </div>
      </div>
    </div>
  </div>

  <!-- EMPTY STATE -->
  <div class="empty hidden" id="emptyState" role="status">
    <div class="empty-glow"></div>
    <div class="empty-card">
      <div class="empty-mark">सेतु</div>
      <h3 id="emptyTitle" data-i18n="emptyTitle">This corner is quiet — for now.</h3>
      <p data-i18n="emptyDesc">No wounds have been spoken here yet. Be the first. Your voice puts the first pin on the map.</p>
      <a class="empty-btn" id="emptyBtn" href="#" target="_blank" rel="noopener"><span data-i18n="emptyBtn">Speak a wound</span> <span class="empty-arrow">→</span></a>
    </div>
  </div>

  <!-- DOSSIER -->
  <div class="sheet" id="dossier" role="dialog" aria-modal="true" aria-label="Wound details">
    <div class="sheet-scrim" id="dosScrim"></div>
    <div class="sheet-panel" id="dosPanel" role="document">
      <div class="dos-hero" id="dosHero">
        <div class="dos-hero-img" id="dosImgContent"></div>
        <div class="dos-hero-gradient"></div>
        <button class="dos-close" id="dosClose" aria-label="Close"><i data-lucide="x"></i></button>
        <div class="dos-toggle">
          <button class="active" id="tabStory" data-m="story">Story</button>
          <button id="tabDetails" data-m="details">Details</button>
        </div>
        <div class="dos-hero-meta">
          <span class="dos-stage" id="dosStage"></span>
          <button class="dos-share" id="dosShare" aria-label="Share"><i data-lucide="share-2" width="16" height="16"></i></button>
        </div>
      </div>
      <div class="dos-body">
        <h2 class="dos-title" id="dosTitle"></h2>
        <div class="dos-cat" id="dosCat"></div>

        <div class="story-block" id="storyBlock">
          <p class="dos-desc" id="dosDesc"></p>
          <div class="dos-progress">
            <div class="dos-progress-bar" id="dosProgressBar"></div>
          </div>
          <div class="dos-traj-lbl"><span>Heard</span><span class="now" id="dosNow"></span><span>Proven</span></div>
          <div class="dos-traj" id="dosTraj"></div>
        </div>

        <div class="details-block hidden" id="detailsBlock">
          <div class="lq" id="ledgerCards"></div>
          <div class="ledger-note">
            <b id="ledgerBin"></b>
            <p id="ledgerExplain"></p>
            <div class="zero-pill"><span class="check"><i data-lucide="check" width="10" height="10"></i></span> ₹0 taken by Setu · verified milestones only</div>
          </div>
          <div class="dos-file-action hidden" id="dosFileAction">
            <div class="dos-file-divider"></div>
            <div class="dos-file-h"><i data-lucide="send" class="file-icon"></i> File this with <span id="dosFileAuth">the authority</span></div>
            <p class="dos-file-p">Tap to send a prefilled complaint via WhatsApp — we've written it for you.</p>
            <div class="dos-file-btns">
              <a class="dos-file-btn dos-file-wa" id="dosFileWA" href="#" target="_blank" rel="noopener"><i data-lucide="message-circle"></i> WhatsApp →</a>
              <a class="dos-file-btn dos-file-em" id="dosFileEmail" href="#" target="_blank" rel="noopener"><i data-lucide="mail"></i> Email</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- TOAST -->
  <div class="toast" id="toast" role="alert" aria-live="polite"></div>

  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script src="config.js"></script>
  <script src="i18n.js"></script>
  <script src="app.js"></script>
  <script>
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(function(){});
    }
  </script>
</body>
</html>

```

---
**LICENSE**

```
MIT License

Copyright (c) 2026 Rahul Jha

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

```

---
**manifest.json**

```
{
  "name": "Setu — The Map",
  "short_name": "Setu",
  "description": "A public map of civic wounds, tracked honestly.",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#f8f7f3",
  "theme_color": "#0f3e17",
  "icons": [
    {
      "src": "setu-app-icon.svg",
      "sizes": "any",
      "type": "image/svg+xml",
      "purpose": "any maskable"
    }
  ]
}

```

---
**opencode.json**

```
{
  "$schema": "https://opencode.ai/config.json",
  "skills": {
    "paths": [".opencode/skills"]
  }
}

```

---
**plan.md**

```
# Setu Map — Build Plan

## Stack
Plain static HTML + CSS + vanilla JavaScript · Leaflet 1.9 (CDN) · Supabase JS v2 (CDN) · CartoDB tiles · Vercel/Cloudflare Pages. No framework, no bundler, no build.

## PHASE 0 — Project scaffold
Create: index.html, style.css, app.js, config.js, .gitignore, README.md

## PHASE 1 — Database prep (SQL migrations)
Run 002_map_fields.sql and 003_public_view.sql in Supabase SQL Editor.

## PHASE 2 — HTML structure (index.html)
Full static page with Leaflet map, top bar, category bar, legend, dock, empty state, dossier, toast.

## PHASE 3 — Styling (style.css)
Green/linen palette, all components styled.

## PHASE 4 — App logic (app.js)
Fetch from public_problems view, render pins with honest states, dossier with Heart/Ledger tabs.

## PHASE 5 — Deploy (Vercel/Cloudflare Pages)

## Hard rules
- Read ONLY from public_problems view, never base problems table.
- Never expose reporter_telegram_id.
- No inline event handlers — use addEventListener only.
- Show wounds honestly — statutory wounds get non-celebratory state.

```

---
**README.md**

```
# Setu — The Map

A public, interactive map that reads civic/development problems from a Supabase database (filled by the [Setu Telegram Bot](https://t.me/SetuReportBot)) and renders them honestly on a Leaflet map.

**This is a static website** — no build step, no server, no framework. Deploys anywhere static files go.

## Prerequisites

- A Supabase project with the `problems` table (created by the Setu bot)
- The SQL migrations from `migrations/002_map_fields.sql` and `migrations/003_public_view.sql` run on that database
- A Vercel or Cloudflare Pages account (for deployment)

## Database setup

These migrations run on the **same database** the Setu bot uses. They add lifecycle fields and create a secure public view.

### 002_map_fields.sql
Adds `stage`, `gov_status`, `gov_days`, `is_sensitive` columns to `problems`.

### 003_public_view.sql
Creates the `public_problems` view that:
- Only shows `status = 'published'` rows
- OMITS `reporter_telegram_id` (never exposed to the browser)
- Grants `SELECT` to the `anon` role
- Revokes direct access to the base `problems` table from `anon`

## Configuration

Edit `config.js` with your Supabase credentials:

```js
window.SETU_CONFIG = {
  SUPABASE_URL: "https://YOUR-PROJECT.supabase.co",
  SUPABASE_ANON_KEY: "your-anon-key",  // Safe to commit — restricted by RLS
  BOT_URL: "https://t.me/SetuReportBot",
  CENTER: { lat: 28.7041, lng: 77.1025, zoom: 13 }  // Delhi
};
```

> **Security note:** The anon key is safe to commit. The service role key must NEVER appear here.

## Local testing

Just open `index.html` in a browser. No server needed. It loads Leaflet, Supabase JS, and data directly from the CDN.

## Deploy to Vercel

1. Push the repo to GitHub
2. Go to [vercel.com](https://vercel.com) → New Project → Import your repo
3. Framework Preset: **Other** (no build command, output = root directory)
4. Deploy
5. Open the live URL on your phone

Or use Cloudflare Pages: connect repo → no build command → deploy.

## How it works

- The map fetches from `public_problems` (a secure Postgres view) via the Supabase JS client
- Pins are colored by honesty, not optimism:
  - 🟢 Green = open for funding (CSR-fundable)
  - 🟤 Gold = needs reframe (partly statutory, partly fundable)
  - ⚪ Grey = government's duty (statutory — routed, not celebrated)
  - ✨ Glowing green = proven / healed
- Click a pin to open the dossier with **Heart** (trajectory) and **Ledger** (legal/financial) tabs
- Empty state shows a dignified message with a link to the bot
- Live updates via Supabase Realtime when new wounds are published

## Acceptance criteria (CHECKPOINT 4)

1. Map shows pins colored by their honest state
2. Statutory pins show "Government's duty — routed" (not celebratory)
3. Clicking a pin opens dossier with Heart/Ledger toggle
4. Ledger tab shows correct bin explanation + "₹0 taken by Setu"
5. Empty state appears when no matching rows
6. "Speak a wound →" button links to the Telegram bot
7. DevTools Network tab confirms `public_problems` response has NO `reporter_telegram_id`

```

---
**setu-app-icon.svg**

```
<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect x="8" y="8" width="184" height="184" rx="44" fill="#0f3e17"/><circle cx="100" cy="70" r="24" fill="none" stroke="#7bbf8e" stroke-width="4" opacity="0.45"/><g stroke="#e1f4df" stroke-width="9" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M52 132 C52 84 148 84 148 132"/><path d="M46 152 L154 152"/><path d="M100 152 L100 92"/></g><circle cx="100" cy="70" r="10" fill="#9fd4ad"/></svg>
```

---
**setu-icon.svg**

```
<svg xmlns="http://www.w3.org/2000/svg" width="200" height="162" viewBox="0 0 200 162" fill="none"><circle cx="100" cy="42" r="27" fill="none" stroke="#7bbf8e" stroke-width="4" opacity="0.4"/><g stroke="#0f3e17" stroke-width="11" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M28 112 C28 52 172 52 172 112"/><path d="M22 136 L178 136"/><path d="M100 136 L100 68"/></g><circle cx="100" cy="42" r="11" fill="#2e7d46"/></svg>
```

---
**setu-logo-reversed.svg**

```
<svg xmlns="http://www.w3.org/2000/svg" width="200" height="162" viewBox="0 0 200 162" fill="none"><circle cx="100" cy="42" r="27" fill="none" stroke="#9fd4ad" stroke-width="4" opacity="0.4"/><g stroke="#e1f4df" stroke-width="11" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M28 112 C28 52 172 52 172 112"/><path d="M22 136 L178 136"/><path d="M100 136 L100 68"/></g><circle cx="100" cy="42" r="11" fill="#9fd4ad"/></svg>
```

---
**style.css**

```
:root{
  --brand:#0a3622; --brand-light:#0d4d2e;
  --emerald:#10b981; --emerald-soft:#d1fae5;
  --amber:#f59e0b; --amber-soft:#fef3c7;
  --rose:#f43f5e; --rose-soft:#ffe4e6;
  --sky:#3b82f6; --sky-soft:#dbeafe;
  --purple:#8b5cf6; --purple-soft:#ede9fe;

  --bg:#fafaf7; --card:#ffffff; --ink:#171f1a; --soft:#64706a;
  --hair:#e4e7e2; --hair-light:#f0f2ee;

  --glass:rgba(255,255,255,.88);
  --glass-border:rgba(255,255,255,.6);

  --display:'Hanken Grotesk',ui-sans-serif,system-ui,sans-serif;
  --fu:'Inter',ui-sans-serif,system-ui,sans-serif;
  --deva:'Mukta',ui-sans-serif,system-ui,sans-serif;

  --ease:cubic-bezier(.34,1.56,.64,1);
  --ease-out:cubic-bezier(.16,1,.3,1);
  --ease-spring:cubic-bezier(.22,1.2,.36,1);

  --shadow-card:0 1px 3px rgba(10,54,34,.04),0 4px 12px rgba(10,54,34,.06);
  --shadow-float:0 8px 30px rgba(10,54,34,.10),0 2px 8px rgba(10,54,34,.06);
  --shadow-heavy:0 16px 48px rgba(10,54,34,.14),0 4px 16px rgba(10,54,34,.08);
  --shadow-glow:0 0 24px rgba(16,185,129,.25);
  --radius:14px; --radius-lg:20px; --radius-pill:999px;
}

*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}

html,body{
  height:100%;width:100%;overflow:hidden;
  font-family:var(--fu);color:var(--ink);background:var(--bg);
  line-height:1.5;-webkit-font-smoothing:antialiased;
  -webkit-tap-highlight-color:transparent;
}

.hidden{display:none!important;}

@supports(padding:env(safe-area-inset-top)){
  body{padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);}
}

/* ===== LOADING SCREEN ===== */
.loading-screen{
  position:fixed;inset:0;z-index:1000;
  background:linear-gradient(160deg,var(--bg) 0%,#eef4ec 100%);
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:28px;
  transition:opacity .5s var(--ease-out),visibility .5s;
}
.loading-screen.hide{opacity:0;visibility:hidden;pointer-events:none;}
.loading-icon{height:48px;width:auto;animation:floatSlow 3s ease-in-out infinite;}
.loading-pulse{
  width:64px;height:4px;border-radius:4px;
  background:linear-gradient(90deg,var(--brand),var(--emerald),var(--brand));
  background-size:200% 100%;animation:pulseBar 1.5s ease-in-out infinite;
}
@keyframes pulseBar{
  0%{background-position:200% 0;}
  100%{background-position:-200% 0;}
}
.loading-text{font-size:14px;color:var(--soft);font-weight:500;}

/* ===== MAP ===== */
#map{position:absolute;inset:0;z-index:0;background:#e9ede6;}
.leaflet-tile-pane{filter:saturate(.4) brightness(1.05) contrast(.9) hue-rotate(-5deg);}

.map-tint{
  position:absolute;inset:0;z-index:1;pointer-events:none;
  background:radial-gradient(100% 60% at 50% 0%,rgba(180,210,200,.08),transparent 60%),
             radial-gradient(120% 100% at 50% 120%,rgba(10,54,34,.06),transparent 55%);
}

/* ===== HERO STATS ===== */
.hero-stats{
  position:absolute;top:14px;right:64px;z-index:21;
  display:flex;gap:8px;
}
@supports(padding:env(safe-area-inset-top)){
  .hero-stats{top:calc(14px + env(safe-area-inset-top));}
}

.hs-card{
  background:var(--glass);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
  border:1px solid var(--glass-border);border-radius:var(--radius);
  padding:8px 14px;display:flex;align-items:center;gap:8px;
  box-shadow:var(--shadow-card);min-width:0;
}
.hs-icon{
  width:32px;height:32px;border-radius:10px;display:grid;place-items:center;flex:none;
}
.hs-icon-healed{background:var(--emerald-soft);color:var(--emerald);}
.hs-icon-active{background:var(--amber-soft);color:var(--amber);}
.hs-icon-total{background:var(--sky-soft);color:var(--sky);}
.hs-num{font-family:var(--display);font-weight:700;font-size:16px;color:var(--ink);line-height:1;}
.hs-label{font-size:9px;color:var(--soft);font-weight:600;text-transform:uppercase;letter-spacing:.4px;}

@media(max-width:640px){.hero-stats{display:none;}}

/* ===== FAB ===== */
.fab{
  position:absolute;bottom:32px;right:20px;z-index:35;
  width:56px;height:56px;border-radius:50%;
  background:linear-gradient(135deg,var(--rose),#e11d48);
  color:#fff;display:grid;place-items:center;
  box-shadow:0 4px 20px rgba(244,63,94,.4);
  cursor:pointer;text-decoration:none;
  transition:transform .25s var(--ease-spring),box-shadow .25s;
  animation:fabIn .5s var(--ease-spring) .8s both;
}
.fab:hover{transform:scale(1.08);box-shadow:0 6px 28px rgba(244,63,94,.5);}
.fab:active{transform:scale(.92);}
@keyframes fabIn{
  0%{opacity:0;transform:scale(0) rotate(-30deg);}
  100%{opacity:1;transform:scale(1) rotate(0);}
}

/* ===== TOP BAR ===== */
.topbar{
  position:absolute;top:14px;left:16px;z-index:20;
  display:flex;gap:10px;align-items:center;
}
@supports(padding:env(safe-area-inset-top)){
  .topbar{top:calc(14px + env(safe-area-inset-top));}
}

.brand{
  display:flex;align-items:center;gap:10px;
  background:var(--glass);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
  border:1px solid var(--glass-border);border-radius:var(--radius);
  padding:8px 14px;box-shadow:var(--shadow-card);flex-shrink:0;
}
.brand-icon{height:24px;width:auto;flex:none;display:block;}
.brand-mark{
  font-weight:600;font-size:20px;color:var(--brand);
  font-family:var(--display);letter-spacing:-.3px;line-height:1;
}

.loc{
  flex:1;min-width:0;background:var(--glass);
  backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
  border:1px solid var(--glass-border);border-radius:var(--radius);
  padding:0 14px;box-shadow:var(--shadow-card);
  display:flex;align-items:center;gap:8px;
  transition:border-color .2s,box-shadow .2s;
}
.loc:focus-within{border-color:var(--emerald);box-shadow:0 0 0 3px rgba(16,185,129,.12);}
.search-icon{flex:none;color:var(--soft);width:18px;height:18px;stroke:var(--soft);}
.search-input{
  border:0;background:transparent;font-size:13px;color:var(--ink);
  font-family:var(--fu);width:100%;min-height:44px;outline:none;
}
.search-input::placeholder{color:var(--soft);}

.refresh{
  width:44px;height:44px;border-radius:var(--radius);
  background:var(--glass);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
  border:1px solid var(--glass-border);box-shadow:var(--shadow-card);
  cursor:pointer;color:var(--brand);flex-shrink:0;
  display:grid;place-items:center;transition:all .15s;
}
.refresh:hover{background:#fff;box-shadow:var(--shadow-float);}
.refresh:active{transform:scale(.94);}
.refresh.loading{pointer-events:none;opacity:.6;}
.refresh.loading i{animation:spinIcon .8s linear infinite;}
@keyframes spinIcon{to{transform:rotate(360deg);}}

/* ===== CATEGORY BAR ===== */
.catbar{
  position:absolute;top:74px;left:16px;right:16px;z-index:19;
  display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;
  scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;
  padding:2px 0;
  mask-image:linear-gradient(to right,black 0%,black 92%,transparent 100%);
  -webkit-mask-image:linear-gradient(to right,black 0%,black 92%,transparent 100%);
}
@supports(padding:env(safe-area-inset-top)){
  .catbar{top:calc(74px + env(safe-area-inset-top));}
}
.catbar::-webkit-scrollbar{display:none;}

.cat{
  border:1px solid var(--glass-border);
  background:var(--glass);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);
  border-radius:var(--radius-pill);padding:7px 14px;
  font-size:11px;font-weight:600;color:var(--soft);
  cursor:pointer;white-space:nowrap;
  scroll-snap-align:start;min-height:40px;
  display:flex;align-items:center;gap:5px;
  transition:all .25s var(--ease-out);box-shadow:var(--shadow-card);
}
.cat:hover{
  background:#fff;border-color:var(--emerald);color:var(--brand);
  box-shadow:var(--shadow-float);transform:translateY(-1px);
}
.cat:active{transform:scale(.96);}
.cat.active{
  background:var(--brand);color:#fff;border-color:var(--brand);
  box-shadow:0 4px 16px rgba(10,54,34,.3);
  font-weight:600;
}
.cat.active svg{stroke:#fff!important;}

/* ===== LEGEND ===== */
.legend{
  position:absolute;right:16px;bottom:28px;z-index:18;
  background:var(--glass);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
  border:1px solid var(--glass-border);border-radius:var(--radius);
  padding:12px 14px;box-shadow:var(--shadow-card);
  transition:opacity .25s,transform .25s var(--ease-out);
}
.legend .lh{
  font-size:9px;letter-spacing:1.2px;text-transform:uppercase;
  color:var(--soft);font-weight:700;margin-bottom:8px;display:block;
}
.legend .lr{
  display:flex;align-items:center;gap:8px;font-size:11px;margin-bottom:5px;color:var(--ink);font-weight:500;
}
.legend .ld{width:12px;height:12px;border-radius:4px;flex:none;}
.ld-fundable{background:#22c55e;}
.ld-reframe{background:var(--amber);}
.ld-statutory{background:var(--soft);}
.ld-proven{background:var(--emerald);box-shadow:0 0 8px rgba(16,185,129,.5);}

.legend-toggle{
  display:none;position:absolute;right:16px;bottom:28px;z-index:18;
  width:40px;height:40px;border-radius:50%;border:1px solid var(--glass-border);
  background:var(--glass);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);
  box-shadow:var(--shadow-card);color:var(--brand);cursor:pointer;
  align-items:center;justify-content:center;
}
.legend-toggle:active{transform:scale(.92);}

@media(max-width:820px){
  .legend{display:none;}
  .legend.show-mobile{display:block;animation:fadeUpSm .25s var(--ease-out);}
  .legend-toggle{display:flex;}
}
@keyframes fadeUpSm{
  0%{opacity:0;transform:translateY(8px);}
  100%{opacity:1;transform:translateY(0);}
}

/* ===== SEED PINS ===== */
@keyframes heartbeat{0%,100%{opacity:1;}50%{opacity:.75;}}
@keyframes pinPulse{
  0%,100%{box-shadow:0 0 0 0 rgba(16,185,129,.4);}
  50%{box-shadow:0 0 0 10px rgba(16,185,129,0);}
}
.seed{
  position:relative;width:44px;height:44px;
  filter:drop-shadow(0 4px 8px rgba(10,54,34,.25));
  transition:transform .25s var(--ease-spring),filter .25s;
}
.seed:hover{transform:scale(1.18);filter:drop-shadow(0 6px 16px rgba(10,54,34,.4));}
.seed-glyph{position:absolute;inset:0;display:grid;place-items:center;}
.seed.proven{filter:drop-shadow(0 0 14px rgba(16,185,129,.6));}
.seed.proven .seed-ring{animation:heartbeat 3s ease-in-out infinite;}
.seed-fuzz{
  position:absolute;inset:-10px;border-radius:50%;
  border:2px dashed rgba(10,54,34,.2);
  background:radial-gradient(circle,rgba(209,250,229,.25),transparent 70%);
}
.sd-badge{
  position:absolute;top:-3px;right:-3px;width:20px;height:20px;
  border-radius:50%;display:grid;place-items:center;z-index:2;
  border:2px solid #fff;font-size:10px;font-weight:800;
}
.sd-alert{background:var(--rose);color:#fff;}
.sd-ok{background:var(--emerald);color:#fff;}
.mk:hover .seed{transform:scale(1.18);}
.mk.selected .seed{
  transform:scale(1.26);
  filter:drop-shadow(0 0 20px rgba(10,54,34,.5));
  outline:3px solid var(--brand);outline-offset:5px;border-radius:50%;
}
.you{
  width:20px;height:20px;border-radius:50%;
  background:var(--sky);border:3px solid #fff;
  box-shadow:0 0 0 4px rgba(59,130,246,.2),0 2px 8px rgba(0,0,0,.25);
  animation:youPulse 3s ease-in-out infinite;
}
@keyframes youPulse{
  0%,100%{box-shadow:0 0 0 4px rgba(59,130,246,.2),0 2px 8px rgba(0,0,0,.25);}
  50%{box-shadow:0 0 0 10px rgba(59,130,246,.08),0 2px 8px rgba(0,0,0,.25);}
}

/* ===== CLUSTERS ===== */
.cluster{
  background:var(--brand);color:#fff;border-radius:50%;
  display:grid;place-items:center;font-weight:700;font-size:13px;
  border:3px solid #fff;box-shadow:0 4px 16px rgba(10,54,34,.3);
  font-family:var(--display);transition:transform .2s var(--ease-spring);
}
.cluster:hover{transform:scale(1.1);}
.cluster-s{width:44px;height:44px;font-size:12px;}
.cluster-m{width:52px;height:52px;font-size:14px;}
.cluster-l{width:60px;height:60px;font-size:16px;}
.leaflet-oldie .cluster{background:var(--brand);}
.marker-cluster-small,.marker-cluster-medium,.marker-cluster-large{background:transparent!important;}
.marker-cluster-small div,.marker-cluster-medium div,.marker-cluster-large div{margin:0!important;width:100%!important;height:100%!important;}

/* ===== PIN ENTRANCE ===== */
@keyframes pinIn{
  0%{opacity:0;transform:scale(.3) translateY(16px);}
  60%{transform:scale(1.06) translateY(-3px);}
  100%{opacity:1;transform:scale(1) translateY(0);}
}
.mk{animation:pinIn .5s var(--ease-spring) both;}

/* ===== DOCK (redesigned — rich cards) ===== */
@keyframes cardUp{
  0%{opacity:0;transform:translateY(20px);}
  70%{transform:translateY(-3px);}
  100%{opacity:1;transform:translateY(0);}
}
.dock{
  position:absolute;left:16px;bottom:28px;z-index:20;
  width:410px;max-width:calc(100vw - 32px);
  background:var(--glass);backdrop-filter:blur(28px);-webkit-backdrop-filter:blur(28px);
  border:1px solid var(--glass-border);border-radius:var(--radius-lg);
  box-shadow:var(--shadow-heavy);overflow:hidden;
  max-height:calc(100vh - 210px);display:flex;flex-direction:column;
}
@media(max-width:820px){
  .dock{left:10px;right:10px;width:auto;bottom:0;max-height:46vh;border-radius:20px 20px 0 0;}
  .dock::before{content:'';display:block;width:40px;height:5px;border-radius:5px;background:var(--hair);margin:10px auto 0;}
}
@media(max-width:640px){.dock{max-height:42vh;}}
.dock-h{padding:18px 20px 10px;}
.dock-k{font-size:9px;letter-spacing:1.8px;text-transform:uppercase;color:var(--soft);font-weight:700;}
.dock-title{font-weight:700;font-size:20px;color:var(--brand);margin-top:4px;font-family:var(--display);letter-spacing:-.3px;}
.dock-list{overflow-y:auto;padding:6px 12px 18px;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;}

/* ---- New dock card ---- */
.dc-item{
  display:flex;gap:14px;padding:14px;border-radius:var(--radius);
  cursor:pointer;align-items:stretch;border:1px solid transparent;
  min-height:44px;background:rgba(255,255,255,.5);
  animation:cardUp .4s var(--ease-spring) both;
  transition:all .2s;
  margin-bottom:4px;
}
.dc-item:hover{
  background:#fff;border-color:var(--hair);
  box-shadow:var(--shadow-card);transform:translateY(-1px);
}
.dc-item:active{transform:scale(.99);}
.dc-item.selected{border-color:var(--emerald);background:rgba(209,250,229,.35);}

.dc-thumb{
  width:72px;height:72px;border-radius:12px;
  overflow:hidden;flex:none;background:var(--hair-light);
  display:grid;place-items:center;
}
.dc-thumb img{width:100%;height:100%;object-fit:cover;}
.dc-thumb-inner{
  width:72px;height:72px;border-radius:12px;
  display:grid;place-items:center;
}
.dc-main{min-width:0;flex:1;display:flex;flex-direction:column;justify-content:center;gap:4px;}
.dc-chip{display:inline-flex;align-items:center;gap:4px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;padding:3px 8px;border-radius:6px;width:fit-content;}
.dc-chip-fundable{background:var(--emerald-soft);color:#065f46;}
.dc-chip-reframe{background:var(--amber-soft);color:#92400e;}
.dc-chip-statutory{background:#f3f4f6;color:#4b5563;}
.dc-chip-proven{background:var(--brand);color:#fff;}
.dc-title{font-family:var(--display);font-weight:600;font-size:14px;line-height:1.25;letter-spacing:-.1px;}
.dc-sub{font-size:11px;color:var(--soft);display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.dc-dist{font-size:10px;color:var(--soft);font-weight:600;display:inline-flex;align-items:center;gap:3px;}
.dc-dist svg{width:11px;height:11px;}
.dc-bar-wrap{margin-top:4px;height:4px;border-radius:4px;background:var(--hair);overflow:hidden;flex:none;}
.dc-bar{height:100%;border-radius:4px;background:linear-gradient(90deg,var(--emerald),var(--brand));transition:width .5s var(--ease-out);}

/* Skeleton loading */
@keyframes shimmer{0%,100%{opacity:.5;}50%{opacity:.9;}}
.skel{background:var(--hair);border-radius:8px;animation:shimmer 1.4s ease-in-out infinite;}
.skel-chip{width:60px;height:16px;margin-bottom:2px;}
.skel-line{width:160px;height:14px;margin-bottom:6px;}
.skel-line-sm{width:100px;height:11px;}
.dc-item.skeleton{cursor:default;pointer-events:none;background:rgba(255,255,255,.3);}
.dc-item.skeleton .dc-thumb{background:var(--hair);}
.dc-item.skeleton .dc-thumb .skel{width:72px;height:72px;border-radius:12px;}

/* ===== EMPTY STATE ===== */
@keyframes floatSlow{0%,100%{transform:translateY(0);}50%{transform:translateY(-12px);}}
.empty{position:absolute;inset:0;z-index:25;display:grid;place-items:center;pointer-events:none;}
.empty-glow{
  position:absolute;width:560px;height:560px;border-radius:50%;
  background:radial-gradient(circle,rgba(209,250,229,.4),rgba(254,243,199,.2),transparent 70%);
  pointer-events:none;top:50%;left:50%;transform:translate(-50%,-55%);
  animation:emptyGlowPulse 6s ease-in-out infinite;
}
@keyframes emptyGlowPulse{
  0%,100%{transform:translate(-50%,-55%) scale(1);opacity:.6;}
  50%{transform:translate(-50%,-55%) scale(1.1);opacity:1;}
}
.empty-card{
  pointer-events:auto;text-align:center;
  background:var(--glass);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);
  border:1px solid var(--glass-border);border-radius:var(--radius-lg);
  box-shadow:var(--shadow-heavy);padding:40px 32px;max-width:360px;
}
.empty-mark{font-size:32px;font-weight:700;color:var(--brand);animation:floatSlow 4s ease-in-out infinite;font-family:var(--display);}
.empty-card h3{font-family:var(--display);font-size:20px;color:var(--ink);margin:18px 0 10px;line-height:1.3;letter-spacing:-.3px;}
.empty-card p{font-size:13px;color:var(--soft);line-height:1.6;}
.empty-btn{
  display:inline-flex;align-items:center;gap:8px;margin-top:22px;
  background:linear-gradient(135deg,var(--rose),#e11d48);color:#fff;text-decoration:none;
  font-weight:700;font-size:15px;padding:15px 28px;border-radius:var(--radius);
  box-shadow:0 6px 24px rgba(244,63,94,.35);
  transition:all .25s var(--ease);
}
.empty-btn:hover{box-shadow:0 8px 32px rgba(244,63,94,.5);transform:translateY(-2px);}
.empty-btn:active{transform:translateY(0);}
.empty-btn:hover .empty-arrow{transform:translateX(5px);}
.empty-arrow{display:inline-block;transition:transform .2s;}

/* ===== DOSSIER ===== */
.sheet{position:fixed;inset:0;z-index:200;visibility:hidden;}
.sheet.show{visibility:visible;}
.sheet.show .sheet-scrim{opacity:1;}
.sheet.show .sheet-panel{transform:translateX(0);}
.sheet.closing .sheet-scrim{opacity:0;}
.sheet.closing .sheet-panel{transform:translateX(105%);}
.sheet-scrim{
  position:absolute;inset:0;
  background:rgba(10,30,18,.6);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);
  opacity:0;transition:opacity .4s var(--ease-out);
}
.sheet-panel{
  position:absolute;right:0;top:0;bottom:0;
  width:min(460px,100%);background:var(--card);
  box-shadow:var(--shadow-heavy);overflow-y:auto;overflow-x:hidden;
  transform:translateX(105%);
  transition:transform .45s var(--ease-out);
  overscroll-behavior:contain;
}
@supports(padding:env(safe-area-inset-top)){
  .sheet-panel{padding-top:env(safe-area-inset-top);}
}
@media(max-width:560px){.sheet-panel{width:100%;}}

/* Dossier hero */
.dos-hero{position:relative;height:240px;overflow:hidden;}
.dos-hero img{width:100%;height:100%;object-fit:cover;position:absolute;inset:0;}
.dos-hero-fallback{position:absolute;inset:0;display:grid;place-items:center;}
.dos-hero-gradient{
  position:absolute;inset:0;
  background:linear-gradient(to top,rgba(0,0,0,.5),transparent 50%);
  pointer-events:none;
}
.dos-hero-meta{
  position:absolute;bottom:16px;left:16px;right:16px;
  display:flex;align-items:center;justify-content:space-between;z-index:3;
}
.dos-close{
  position:absolute;top:14px;left:14px;width:44px;height:44px;
  border-radius:50%;background:rgba(0,0,0,.5);border:0;
  cursor:pointer;z-index:3;font-size:16px;display:grid;
  place-items:center;color:#fff;backdrop-filter:blur(10px);
  transition:background .15s,transform .15s;
}
.dos-close:hover{background:rgba(0,0,0,.7);}
.dos-close:active{transform:scale(.92);}
.dos-toggle{
  position:absolute;top:14px;right:14px;z-index:3;
  display:flex;gap:3px;background:rgba(0,0,0,.45);
  border-radius:11px;padding:4px;backdrop-filter:blur(10px);
}
.dos-toggle button{
  border:0;background:transparent;cursor:pointer;
  font-size:11px;font-weight:600;color:rgba(255,255,255,.7);
  padding:7px 14px;border-radius:8px;min-height:36px;transition:all .15s;
}
.dos-toggle button:hover:not(.active){color:#fff;}
.dos-toggle button.active{background:#fff;color:var(--brand);box-shadow:0 2px 8px rgba(0,0,0,.2);}

/* Dossier body */
.dos-body{padding:22px 24px 40px;}
.dos-title{
  font-size:26px;font-weight:700;line-height:1.15;margin-top:4px;
  font-family:var(--display);letter-spacing:-.5px;color:var(--ink);
}
.dos-cat{
  display:inline-flex;align-items:center;gap:4px;
  font-size:11px;font-weight:600;color:var(--soft);text-transform:capitalize;margin-bottom:6px;
  background:var(--hair-light);padding:3px 10px;border-radius:6px;
}
.dos-stage{
  font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#fff;
  background:var(--brand);padding:4px 12px;border-radius:var(--radius-pill);
}
.dos-share{
  width:36px;height:36px;border-radius:50%;border:0;
  background:rgba(255,255,255,.25);color:#fff;cursor:pointer;
  display:grid;place-items:center;transition:all .15s;
  backdrop-filter:blur(10px);
}
.dos-share:hover{background:rgba(255,255,255,.4);}
.dos-share:active{transform:scale(.9);}
.dos-share.copied{background:var(--emerald);}
.dos-desc{font-size:14px;line-height:1.7;color:var(--ink);margin-top:16px;}

/* Progress bar in dossier */
.dos-progress{margin-top:18px;height:6px;border-radius:6px;background:var(--hair);overflow:hidden;}
.dos-progress-bar{
  height:100%;border-radius:6px;
  background:linear-gradient(90deg,var(--emerald),var(--brand));
  transition:width .5s var(--ease-out);
}

/* Trajectory */
.dos-traj-lbl{
  display:flex;justify-content:space-between;
  font-size:9px;text-transform:uppercase;color:var(--soft);font-weight:600;
  margin:16px 0 10px;
}
.dos-traj-lbl .now{color:var(--brand);font-weight:700;text-transform:none;font-size:10px;}
.dos-traj{display:flex;align-items:center;}
.dos-traj .nd{
  width:14px;height:14px;border-radius:50%;background:var(--hair);flex:none;transition:background .3s;
}
.dos-traj .nd.done{background:var(--emerald);box-shadow:0 0 6px rgba(16,185,129,.4);}
.dos-traj .nd.curr{
  width:18px;height:18px;border:3px solid var(--brand);
  background:#fff;box-shadow:0 0 0 5px rgba(10,54,34,.1);
}
.dos-traj .sg{flex:1;height:2px;background:var(--hair);transition:background .3s;}
.dos-traj .sg.done{background:var(--emerald);}

/* Details cards */
.lq{display:flex;gap:8px;margin-top:16px;}
.lqc{
  flex:1;background:var(--hair-light);border:1px solid var(--hair);
  border-radius:var(--radius);padding:14px 10px;text-align:center;transition:all .2s;
}
.lqc:hover{border-color:var(--soft);background:#fff;}
.lqc b{font-size:11px;display:block;font-weight:700;color:var(--ink);}
.lqc span{font-size:11px;color:var(--soft);margin-top:2px;display:block;}
.ledger-note{
  margin-top:16px;background:var(--hair-light);border:1px solid var(--hair);
  border-radius:var(--radius);padding:18px;
}
.ledger-note b{font-size:14px;color:var(--brand);}
.ledger-note p{font-size:13px;color:var(--soft);line-height:1.6;margin-top:6px;}
.zero-pill{
  display:inline-flex;align-items:center;gap:6px;
  background:var(--emerald-soft);color:#065f46;
  font-size:11px;font-weight:700;padding:7px 14px;
  border-radius:var(--radius-pill);margin-top:14px;
}
.zero-pill .check{
  width:18px;height:18px;border-radius:50%;
  background:var(--emerald);color:#fff;display:grid;place-items:center;
}

/* File action */
.dos-file-action{margin-top:18px;}
.dos-file-divider{height:1px;background:var(--hair);margin-bottom:16px;}
.dos-file-h{font-size:13px;font-weight:700;color:var(--brand);margin-bottom:6px;display:flex;align-items:center;gap:6px;}
.dos-file-h .file-icon{color:var(--brand);}
.dos-file-p{font-size:11px;color:var(--soft);line-height:1.5;margin-bottom:14px;}
.dos-file-btns{display:flex;gap:10px;flex-wrap:wrap;}
.dos-file-btn{
  display:inline-flex;align-items:center;gap:5px;padding:12px 20px;
  border-radius:12px;font-size:13px;font-weight:700;
  text-decoration:none;min-height:44px;transition:transform .15s,box-shadow .2s;
}
.dos-file-btn:active{transform:scale(.96);}
.dos-file-wa{background:#25D366;color:#fff;box-shadow:0 4px 14px rgba(37,211,102,.3);}
.dos-file-wa:hover{box-shadow:0 6px 20px rgba(37,211,102,.4);}
.dos-file-em{background:var(--hair-light);color:var(--ink);border:1px solid var(--hair);}
.dos-file-em:hover{background:#fff;}

@supports(padding:env(safe-area-inset-bottom)){
  .dos-file-action{padding-bottom:env(safe-area-inset-bottom);}
}

/* ===== TOAST ===== */
.toast{
  position:fixed;left:50%;bottom:24px;
  transform:translateX(-50%) translateY(140px);
  z-index:400;background:var(--brand);
  color:#fff;padding:14px 24px;border-radius:var(--radius-pill);
  font-size:13px;font-weight:600;display:flex;align-items:center;gap:12px;
  transition:transform .4s var(--ease-out),opacity .3s;
  box-shadow:0 8px 32px rgba(10,54,34,.4);
  opacity:0;pointer-events:none;
}
.toast.show{transform:translateX(-50%) translateY(0);opacity:1;pointer-events:auto;}
.toast-btn{
  border:0;background:rgba(255,255,255,.2);color:#fff;
  padding:6px 16px;border-radius:var(--radius-pill);
  font-size:12px;font-weight:700;cursor:pointer;transition:background .15s;white-space:nowrap;
}
.toast-btn:hover{background:rgba(255,255,255,.3);}
.toast-btn:active{background:rgba(255,255,255,.4);}

/* ===== RESPONSIVE ===== */
@media(max-width:820px){
  .topbar{left:10px;right:52px;}
  .catbar{left:10px;right:10px;}
  .brand{padding:8px 10px;}
  .brand-icon{height:22px;}
  .brand-mark{font-size:18px;}
  .fab{bottom:20px;right:14px;}
  .hero-stats{display:none;}
}

@media(max-width:560px){
  .sheet-panel{width:100%;}
  .empty-card{max-width:300px;padding:30px 22px;}
  .dock{max-height:40vh;}
  .topbar{right:10px;}
  .loc{min-width:0;}
}

/* ===== ACCESSIBILITY ===== */
*:focus-visible{outline:2px solid var(--emerald);outline-offset:3px;border-radius:4px;}
.search-input:focus-visible{outline:none;}
.leaflet-control-attribution{font-size:9px!important;}

```

---
**sw.js**

```
const CACHE = 'setu-map-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/config.js',
  '/i18n.js',
  '/setu-icon.svg',
  '/setu-app-icon.svg',
  '/manifest.json'
];

self.addEventListener('install', function(e) {
  e.waitUntil(caches.open(CACHE).then(function(c) { return c.addAll(ASSETS); }));
});

self.addEventListener('fetch', function(e) {
  e.respondWith(
    caches.match(e.request).then(function(r) {
      return r || fetch(e.request).then(function(res) {
        if (res.ok) {
          var clone = res.clone();
          caches.open(CACHE).then(function(c) { c.put(e.request, clone); });
        }
        return res;
      });
    })
  );
});

```

