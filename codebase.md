# setu-map Codebase

Generated on Tue Jun 30 02:41:59 IST 2026

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

// --- categories ---
const CATS = ["all","sanitation","water","roads","education","health","environment","elderly","other"];
const CAT_COLOR = {
  sanitation:"#3f8a55", water:"#3f6f8a", roads:"#8a978c", education:"#bd8a40",
  health:"#b0654a", environment:"#2e7d46", elderly:"#7d6a9c", other:"#67726a"
};
const CAT_ICON = {
  sanitation:"trash-2", water:"droplet", roads:"construction", education:"graduation-cap",
  health:"heart-pulse", environment:"leaf", elderly:"users", other:"map-pin"
};
const STAGES = ["heard","sorted","funded","built","proven"];

// --- Lucide helpers ---
function toPascal(s){ return s.split('-').map(w=>w[0].toUpperCase()+w.slice(1)).join(''); }
function catIcon(cat, color, size){
  try {
    const name = toPascal(CAT_ICON[cat] || "map-pin");
    const node = lucide.icons[name];
    if(!node) return '';
    return lucide.createElement(node).outerHTML.replace('<svg ', `<svg width="${size}" height="${size}" stroke="${color||'#67726a'}" `);
  } catch(e){ return ''; }
}

// --- helpers ---
function pinColor(p){
  if(p.stage === "proven") return "#2e7d46";
  if(p.legality_bin === "statutory") return "#8a978c";
  if(p.legality_bin === "reframe")   return "#bd8a40";
  return "#3f8a55";
}
function stageLabel(p){
  if(p.legality_bin === "statutory"){
    if(p.gov_filed === "resolved")      return "Resolved by "+(p.gov_authority||"authority");
    if(p.gov_filed === "acknowledged")  return (p.gov_authority||"Authority")+" acknowledged it";
    if(p.gov_filed === "filed_by_citizen") return "Filed with "+(p.gov_authority||"authority")+" — awaiting action";
    return "Not yet filed — government's duty";
  }
  return {heard:"Heard",sorted:"Sorted",funded:"Funded",built:"Built",proven:"Proven"}[p.stage] || "Heard";
}
function chipClass(p){
  if(p.stage==="proven") return "c-proven";
  if(p.legality_bin==="statutory"){
    if(p.gov_filed==="filed_by_citizen" || p.gov_filed==="acknowledged") return "c-statutory c-filed";
    if(p.gov_filed==="resolved") return "c-statutory c-filed";
    return "c-statutory c-unfiled";
  }
  if(p.legality_bin==="reframe") return "c-reframe";
  return "c-fundable";
}
function stageIndex(p){ const i = STAGES.indexOf(p.stage); return i<0?0:i; }

// --- gov routing helpers ---
const GOV = {
  "MCD": { "name": "MCD", "wa": "918588887773", "email": "mcd-ithelpdesk@mcd.nic.in", "web": "https://mcd.everythingcivic.com/new_complain" },
  "DJB": { "name": "Delhi Jal Board", "wa": "919650291021", "email": "grievances-djb@delhi.gov.in", "web": "https://mcdonline.nic.in" }
};
function buildGovWhatsAppLink(p){
  const a = GOV[p.gov_authority] || GOV.MCD;
  const body = "Civic complaint via Setu. Issue: "+p.title+". "+p.description+" Location (approx): "+p.latitude+","+p.longitude+".";
  return "https://wa.me/"+a.wa+"?text="+encodeURIComponent(body);
}
function buildGovEmailLink(p){
  const a = GOV[p.gov_authority] || GOV.MCD;
  const body = "Civic complaint via Setu. Issue: "+p.title+". "+p.description+" Location (approx): "+p.latitude+","+p.longitude+".";
  return "mailto:"+a.email+"?subject="+encodeURIComponent("Civic Grievance via Setu")+"&body="+encodeURIComponent(body);
}
function buildGovWebLink(p){
  const a = GOV[p.gov_authority] || GOV.MCD;
  return a.web;
}

// --- pin sort order (Phase 4) ---
function rank(p){
  if(p.stage==='proven')return 0;
  if(p.stage==='built')return 1;
  if(p.stage==='funded')return 2;
  if(p.legality_bin==='statutory')return 5;
  if(p.legality_bin==='reframe')return 4;
  return 3;
}

// --- reverse geocode (Phase 1b) ---
let cachedPlace = '';
async function placeName(lat,lng){
  try{
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14`,
      {headers:{'Accept-Language':'en'}});
    const j = await r.json(); const a = j.address||{};
    return (a.suburb||a.neighbourhood||a.city_district||a.city||a.town||"Your area")
         + (a.city||a.state ? ", " + (a.city||a.state) : "");
  }catch(e){ return "Your area"; }
}

// --- map setup ---
const map = L.map('map',{zoomControl:false,attributionControl:true,minZoom:4,maxZoom:18})
  .setView([CFG.CENTER.lat, CFG.CENTER.lng], CFG.CENTER.zoom);
const tiles = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
  {subdomains:'abcd',attribution:'&copy; OSM &copy; CARTO',maxZoom:19}).addTo(map);

// Clustering (Phase 2f)
const seedLayer = L.markerClusterGroup({
  chunkedLoading: true,
  maxClusterRadius: 50,
  spiderfyOnMaxZoom: true,
  showCoverageOnHover: false,
  zoomToBoundsOnClick: true,
  iconCreateFunction: function(cluster){
    const count = cluster.getChildCount();
    let size = 's';
    if(count >= 10) size = 'm';
    if(count >= 30) size = 'l';
    return L.divIcon({
      html: `<div class="cluster cluster-${size}">${count}</div>`,
      className: '',
      iconSize: [44, 44]
    });
  }
}).addTo(map);

const sensitiveLayer = L.layerGroup().addTo(map);
let youMarker = L.marker([CFG.CENTER.lat, CFG.CENTER.lng],
  {icon:L.divIcon({className:'',html:'<div class="you"></div>',iconSize:[16,16],iconAnchor:[8,8]}),zIndexOffset:600}).addTo(map);

// --- pin seed HTML (Phase 2d) ---
function seedHTML(p){
  const c = pinColor(p);
  const fill = stageIndex(p)/(STAGES.length-1);
  const C = 100, off = C*(1-fill);
  const fuzz = p.is_sensitive ? '<div class="seed-fuzz"></div>' : '';
  let badge = '';
  if(p.legality_bin === "statutory" && p.gov_filed === "awaiting_citizen") badge = '<div class="sd-badge sd-alert">!</div>';
  else if(p.legality_bin === "statutory" && (p.gov_filed === "filed_by_citizen" || p.gov_filed === "acknowledged")) badge = '<div class="sd-badge sd-ok">✓</div>';
  return `<div class="seed ${p.stage==='proven'?'proven':''}">
    ${fuzz}
    <svg class="seed-ring" width="44" height="44" viewBox="0 0 44 44">
      <circle cx="22" cy="22" r="18" fill="#fffefc" stroke="#e3e7e0" stroke-width="3"/>
      <circle cx="22" cy="22" r="18" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round"
        stroke-dasharray="${C}" stroke-dashoffset="${off}" transform="rotate(-90 22 22)"/>
    </svg>
    <div class="seed-glyph">${catIcon(p.category, c, 18)}</div>
    ${badge}
  </div>`;
}

// --- fit map to pins (Phase 1a) ---
function fitToPins(shown){
  const pts = shown.filter(p=>p.latitude!=null && p.longitude!=null).map(p=>[p.latitude,p.longitude]);
  if(pts.length === 0){ map.setView([CFG.CENTER.lat, CFG.CENTER.lng], CFG.CENTER.zoom); }
  else if(pts.length === 1){ map.setView(pts[0], 15); }
  else { map.fitBounds(L.latLngBounds(pts).pad(0.25), {maxZoom:15}); }
}

let ALL = [];
let curCat = "all";
let markers = {};
let selectedId = null;

async function loadWounds(){
  const { data, error } = await sb.from('public_problems').select('*').order('created_at',{ascending:false});
  if(error){ console.error(error); toast("Could not load the map. Retry?"); return; }
  ALL = data || [];
  render();
}

function render(){
  seedLayer.clearLayers();
  sensitiveLayer.clearLayers();
  markers = {};
  const shown = ALL.filter(p => curCat==="all" || p.category===curCat);

  // Sort: hope-first (Phase 4b)
  shown.sort((a,b)=>rank(a)-rank(b));

  const empty = document.getElementById('emptyState');
  if(shown.length === 0){ empty.classList.remove('hidden'); } else { empty.classList.add('hidden'); }

  const useStagger = shown.length <= 60;

  shown.forEach((p, i)=>{
    if(p.latitude==null || p.longitude==null) return;
    const m = L.marker([p.latitude,p.longitude],
      {icon:L.divIcon({
        className:'mk'+(selectedId===p.id?' selected':''),
        html:seedHTML(p),
        iconSize:[44,44],iconAnchor:[22,22]
      })});
    seedLayer.addLayer(m);
    if(useStagger){
      setTimeout(()=>{
        const el = m.getElement();
        if(el) el.style.animationDelay = (i * 40)+'ms';
      }, 50);
    }
    m.on('click',()=>openDossier(p));
    markers[p.id]=m;
    if(p.is_sensitive){
      L.circle([p.latitude,p.longitude],{radius:300,color:'#9bbfa6',weight:1,dashArray:'4 5',fillColor:'#cfe7d3',fillOpacity:.16}).addTo(sensitiveLayer);
    }
  });

  // Fit map to pins (Phase 1a)
  fitToPins(shown);

  // Dock list
  const list = document.getElementById('dockList');
  list.innerHTML = '';
  const proven = shown.filter(p=>p.stage==="proven").length;
  const inMotion = shown.filter(p=>p.stage==="proven"||p.stage==="built"||p.stage==="funded"||(p.legality_bin==="statutory"&&p.gov_filed==="resolved")).length;
  document.getElementById('dockTitle').textContent =
    shown.length===0 ? "No wounds here yet." :
    (proven>0 ? proven+" healed" + (inMotion>proven ? " · "+(inMotion-proven)+" in motion" : "") :
     inMotion>0 ? inMotion+" in motion" : shown.length+" wound"+(shown.length>1?"s":"")+" near you");
  shown.forEach((p, i)=>{
    const d = document.createElement('div');
    d.className = 'dl-item' + (p.legality_bin==='statutory'?' statutory':'');
    d.style.animationDelay = (i * 30)+'ms';
    const c = CAT_COLOR[p.category] || '#3f8a55';
    const thumb = p.media_type==="photo" && p.media_url
      ? '<img src="'+p.media_url+'" alt="">'
      : `<div class="dl-thumb-fallback" style="background:${c}18">${catIcon(p.category,c,20)}</div>`;
    d.innerHTML = '<div class="dl-thumb'+(p.media_type==="photo"&&p.media_url?'':' no-media')+'">'+thumb+'</div>'
      + '<div class="dl-main"><span class="chip '+chipClass(p)+'">'+stageLabel(p)+'</span>'
      + '<div class="dl-title">'+escapeHTML(p.title||"Untitled")+'</div>'
      + '<div class="dl-sub">'+escapeHTML(p.reporter_handle||"A citizen")+'</div></div>';
    d.addEventListener('click',()=>{ openDossier(p); map.flyTo([p.latitude,p.longitude],15,{duration:.7}); });
    list.appendChild(d);
  });
}

// --- dossier header fallback (Phase 1c) ---
function dossierHeader(p){
  if(p.media_type==="photo" && p.media_url) return `<img src="${p.media_url}" alt="">`;
  const c = CAT_COLOR[p.category] || "#3f8a55";
  return `<div class="dos-fallback" style="background:linear-gradient(135deg,${c}22,${c}0a)">${catIcon(p.category,c,56)}</div>`;
}

// --- dossier ---
function openDossier(p){
  if(selectedId && markers[selectedId]){
    const oldEl = markers[selectedId].getElement();
    if(oldEl) oldEl.classList.remove('selected');
  }
  selectedId = p.id;
  if(markers[p.id]){
    const el = markers[p.id].getElement();
    if(el) el.classList.add('selected');
  }

  document.getElementById('dosTitle').textContent = p.title||"Untitled";
  document.getElementById('dosCat').textContent = p.category||"";
  document.getElementById('dosStage').textContent = stageLabel(p);
  document.getElementById('dosDesc').textContent = p.description||p.transcript||"";

  // Dossier image / fallback (Phase 1c)
  document.getElementById('dosImgContent').innerHTML = dossierHeader(p);

  const tr = document.getElementById('dosTraj'); tr.innerHTML='';
  const si = stageIndex(p);
  for(let i=0;i<STAGES.length;i++){
    const nd=document.createElement('div');
    nd.className='nd'+(i<si?' done':'')+(i===si?' curr':''); tr.appendChild(nd);
    if(i<STAGES.length-1){ const sg=document.createElement('div'); sg.className='sg'+(i<si?' done':''); tr.appendChild(sg); }
  }
  document.getElementById('dosNow').textContent = stageLabel(p);

  const bins = {
    fundable:["Companies can fund this","This wound sits cleanly on Schedule VII — lawful corporate CSR. The full sum reaches the project."],
    statutory:["Government's duty","By law this is the state's own responsibility (e.g. roads, drains). CSR cannot fund it, so Setu routes it to the municipality and tracks it honestly."],
    reframe:["Needs the honest reframe","Part is the government's duty (routed back); part is lawfully fundable. Setu splits it so the law is obeyed and no one is misled."]
  };
  const b = bins[p.legality_bin] || bins.reframe;
  document.getElementById('ledgerBin').textContent = b[0];
  document.getElementById('ledgerExplain').textContent = b[1];
  document.getElementById('ledgerCards').innerHTML =
    '<div class="lqc"><b>Legal</b><span>Schedule VII</span></div>'
   +'<div class="lqc"><b>Partner</b><span>'+(p.stage==="heard"?"to be matched":"12A·80G·CSR-1")+'</span></div>'
   +'<div class="lqc"><b>Proof</b><span>'+(["funded","built","proven"].includes(p.stage)?"4-layer":"once funded")+'</span></div>';

  const fa = document.getElementById('dosFileAction');
  if(p.legality_bin === "statutory" && p.gov_filed === "awaiting_citizen"){
    const authName = GOV[p.gov_authority] ? GOV[p.gov_authority].name : (p.gov_authority||"the authority");
    document.getElementById('dosFileAuth').textContent = authName;
    document.getElementById('dosFileWA').href = buildGovWhatsAppLink(p);
    document.getElementById('dosFileEmail').href = buildGovEmailLink(p);
    fa.classList.remove('hidden');
  } else {
    fa.classList.add('hidden');
  }

  // Re-run Lucide for static icons in dossier
  if(typeof lucide!=='undefined' && lucide.createIcons) lucide.createIcons();

  setDosMode('heart');
  document.getElementById('dossier').classList.add('show');
}
function setDosMode(m){
  document.getElementById('heartBlock').classList.toggle('hidden', m!=="heart");
  document.getElementById('ledgerBlock').classList.toggle('hidden', m!=="ledger");
  document.getElementById('tabHeart').classList.toggle('active', m==="heart");
  document.getElementById('tabLedger').classList.toggle('active', m==="ledger");
}

// --- category bar (Phase 2c) ---
function buildCatbar(){
  const bar = document.getElementById('catbar'); bar.innerHTML='';
  CATS.forEach(c=>{
    const b=document.createElement('button');
    b.className='cat'+(c==="all"?' active':'');
    if(c==="all"){
      b.textContent = "All wounds";
    } else {
      b.innerHTML = catIcon(c, CAT_COLOR[c], 14) + ' <span>' + c.charAt(0).toUpperCase() + c.slice(1) + '</span>';
    }
    b.addEventListener('click',()=>{
      curCat=c; document.querySelectorAll('.cat').forEach(x=>x.classList.remove('active')); b.classList.add('active'); render();
    });
    bar.appendChild(b);
  });
}

// --- utils + wiring ---
function escapeHTML(s){ return (s||"").replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
let toastT;
function toast(m){ const t=document.getElementById('toast'); t.textContent=m; t.classList.add('show'); clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove('show'),2600); }

document.getElementById('dosClose').addEventListener('click',()=>{
  document.getElementById('dossier').classList.remove('show');
  if(selectedId && markers[selectedId]){
    const el = markers[selectedId].getElement();
    if(el) el.classList.remove('selected');
  }
  selectedId = null;
});
document.getElementById('dosScrim').addEventListener('click',()=>{
  document.getElementById('dossier').classList.remove('show');
  if(selectedId && markers[selectedId]){
    const el = markers[selectedId].getElement();
    if(el) el.classList.remove('selected');
  }
  selectedId = null;
});
document.getElementById('tabHeart').addEventListener('click',()=>setDosMode('heart'));
document.getElementById('tabLedger').addEventListener('click',()=>setDosMode('ledger'));
document.getElementById('refreshBtn').addEventListener('click',loadWounds);
document.getElementById('emptyBtn').href = CFG.BOT_URL || "#";

// Live line update (Phase 4c)
function updateLiveLine(){
  const now = new Date();
  const h = now.getHours().toString().padStart(2,'0');
  const m = now.getMinutes().toString().padStart(2,'0');
  document.getElementById('dockK').textContent = (cachedPlace ? "Across " + cachedPlace : "Loading…") + " · updated " + h + ":" + m;
}
updateLiveLine();
setInterval(updateLiveLine, 30000);

// Initialize Lucide static icons
if(typeof lucide!=='undefined' && lucide.createIcons) lucide.createIcons();

// Initialize location (Phase 1b)
async function initLocation(){
  let lat = CFG.CENTER.lat, lng = CFG.CENTER.lng;
  if(navigator.geolocation){
    try {
      const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej));
      lat = pos.coords.latitude; lng = pos.coords.longitude;
      map.setView([lat, lng], 14);
      map.removeLayer(youMarker);
      youMarker = L.marker([lat, lng],
        {icon:L.divIcon({className:'',html:'<div class="you"></div>',iconSize:[16,16],iconAnchor:[8,8]}),zIndexOffset:600}).addTo(map);
    } catch(e) {}
  }
  cachedPlace = await placeName(lat, lng);
  updateLiveLine();
}

buildCatbar();
initLocation();
loadWounds();

// live updates
sb.channel('public_problems_changes')
  .on('postgres_changes',{event:'*',schema:'public',table:'problems'},()=>loadWounds())
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
**index.html**

```
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<title>Setu — The Map</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@300..500&family=Inter:wght@400..600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css">
<link rel="stylesheet" href="style.css">
<!-- Icons -->
<script src="https://unpkg.com/lucide@latest"></script>
</head>
<body>
  <!-- MAP -->
  <div id="map"></div>
  <div class="map-tint"></div>
  <div class="watermark">Setu · The Living Signal</div>

  <!-- TOP BAR -->
  <div class="topbar">
    <div class="brand">
      <img src="setu-icon.svg" alt="" class="brand-icon">
      <span class="brand-mark">Setu</span>
    </div>
    <div class="loc" id="locChip">
      <i data-lucide="search" class="search-icon"></i>
      <input type="text" class="search-input" id="searchInput" placeholder="Search a place or wound…">
    </div>
    <button class="refresh" id="refreshBtn" title="Refresh"><i data-lucide="refresh-cw"></i></button>
  </div>

  <!-- CATEGORY FILTER -->
  <div class="catbar" id="catbar"></div>

  <!-- LEGEND (honest states) -->
  <div class="legend">
    <div class="lh">What the colours mean</div>
    <div class="lr"><span class="ld" style="background:#3f8a55"></span>Open for funding</div>
    <div class="lr"><span class="ld" style="background:#bd8a40"></span>Needs reframe</div>
    <div class="lr"><span class="ld" style="background:#8a978c"></span>Government's duty — routed</div>
    <div class="lr"><span class="ld" style="background:#2e7d46;box-shadow:0 0 6px #92c8a0"></span>Proven / healed</div>
  </div>

  <!-- DOCK (list of wounds) -->
  <div class="dock" id="dock">
    <div class="dock-h">
      <div class="dock-k" id="dockK">Loading…</div>
      <h2 class="dock-title" id="dockTitle">Across Dwarka</h2>
    </div>
    <div class="dock-list" id="dockList">
      <div class="dl-item skeleton">
        <div class="dl-thumb skeleton-pulse"></div>
        <div class="dl-main"><div class="skeleton-pulse skeleton-chip"></div><div class="skeleton-pulse skeleton-title"></div><div class="skeleton-pulse skeleton-sub"></div></div>
      </div>
      <div class="dl-item skeleton">
        <div class="dl-thumb skeleton-pulse"></div>
        <div class="dl-main"><div class="skeleton-pulse skeleton-chip"></div><div class="skeleton-pulse skeleton-title"></div><div class="skeleton-pulse skeleton-sub"></div></div>
      </div>
      <div class="dl-item skeleton">
        <div class="dl-thumb skeleton-pulse"></div>
        <div class="dl-main"><div class="skeleton-pulse skeleton-chip"></div><div class="skeleton-pulse skeleton-title"></div><div class="skeleton-pulse skeleton-sub"></div></div>
      </div>
      <div class="dl-item skeleton">
        <div class="dl-thumb skeleton-pulse"></div>
        <div class="dl-main"><div class="skeleton-pulse skeleton-chip"></div><div class="skeleton-pulse skeleton-title"></div><div class="skeleton-pulse skeleton-sub"></div></div>
      </div>
      <div class="dl-item skeleton">
        <div class="dl-thumb skeleton-pulse"></div>
        <div class="dl-main"><div class="skeleton-pulse skeleton-chip"></div><div class="skeleton-pulse skeleton-title"></div><div class="skeleton-pulse skeleton-sub"></div></div>
      </div>
    </div>
  </div>

  <!-- EMPTY STATE -->
  <div class="empty hidden" id="emptyState">
    <div class="empty-card">
      <div class="empty-mark">सेतु</div>
      <h3 id="emptyTitle">This corner is quiet — for now.</h3>
      <p>No wounds have been spoken here yet. Be the first. Your voice puts the first pin on the map.</p>
      <a class="empty-btn" id="emptyBtn" href="#" target="_blank" rel="noopener">Speak a wound <span class="empty-arrow">→</span></a>
    </div>
  </div>

  <!-- DOSSIER -->
  <div class="sheet" id="dossier">
    <div class="sheet-scrim" id="dosScrim"></div>
    <div class="sheet-panel" id="dosPanel">
      <div class="dos-img">
        <div class="dos-img-content" id="dosImgContent"></div>
        <button class="dos-close" id="dosClose"><i data-lucide="x"></i></button>
        <div class="dos-toggle">
          <button class="active" id="tabHeart" data-m="heart">Heart</button>
          <button id="tabLedger" data-m="ledger">Ledger</button>
        </div>
      </div>
      <div class="dos-body">
        <span class="dos-stage" id="dosStage"></span>
        <h2 class="dos-title" id="dosTitle"></h2>
        <div class="dos-cat" id="dosCat"></div>

        <div class="heart-block" id="heartBlock">
          <p class="dos-desc" id="dosDesc"></p>
          <div class="dos-traj-lbl"><span>Heard</span><span class="now" id="dosNow"></span><span>Proven</span></div>
          <div class="dos-traj" id="dosTraj"></div>
        </div>

        <div class="ledger-block hidden" id="ledgerBlock">
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
  <div class="toast" id="toast"></div>

  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script src="config.js"></script>
  <script src="app.js"></script>
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
  --forest:#0f3e17;--mint:#cfe7d3;--gold:#bd8a40;--slate:#8a978c;
  --bg:#f4f5f2;--surf:#fffefc;--ink:#19231c;--soft:#67726a;--hair:#e6e9e4;
  --display:'Hanken Grotesk',ui-sans-serif,system-ui,sans-serif;
  --fu:'Inter',ui-sans-serif,system-ui,sans-serif;
  --ease:cubic-bezier(.34,1.56,.64,1);
  --sh1:0 1px 2px rgba(15,62,23,.05),0 3px 12px rgba(15,62,23,.06);
  --sh2:0 4px 14px rgba(15,62,23,.08),0 20px 50px rgba(15,62,23,.12);
}
*{box-sizing:border-box;margin:0;padding:0;}
html,body{height:100%;width:100%;overflow:hidden;font-family:var(--fu);color:var(--ink);background:var(--bg);line-height:1.6;}
.hidden{display:none!important;}
#map{position:absolute;inset:0;z-index:0;background:#eceee8;}

/* PHASE 3 — Branded basemap */
.leaflet-tile-pane{filter:saturate(.45) brightness(1.04) contrast(.92);}
.map-tint{position:absolute;inset:0;z-index:1;pointer-events:none;
  background:radial-gradient(120% 80% at 50% 0%,rgba(182,206,213,.12),transparent 55%),
             radial-gradient(140% 100% at 50% 120%,rgba(15,62,23,.10),transparent 60%);}

/* WATERMARK */
.watermark{position:absolute;left:16px;bottom:80px;z-index:15;font-size:9px;font-weight:500;color:rgba(103,114,106,.35);letter-spacing:.6px;pointer-events:none;font-family:var(--display);}

/* PHASE 6 — Typography discipline */
.dock-title,.dos-title,.empty-card h3{font-family:var(--display);letter-spacing:-.4px;}

/* === TOP BAR === */
.topbar{position:absolute;top:14px;left:16px;right:16px;z-index:20;display:flex;gap:10px;align-items:center;}
.brand{display:flex;align-items:center;gap:10px;background:var(--surf);border:1px solid var(--hair);border-radius:14px;padding:8px 14px;box-shadow:var(--sh1);flex-shrink:0;}
.brand-icon{height:24px;width:auto;flex:none;display:block;}
.brand-mark{font-weight:600;font-size:20px;color:var(--forest);font-family:var(--display);letter-spacing:-.3px;line-height:1;}
.loc{flex:1;min-width:0;background:var(--surf);border:1px solid var(--hair);border-radius:14px;padding:0 14px;box-shadow:var(--sh1);display:flex;align-items:center;gap:8px;}
.search-icon{flex:none;color:var(--soft);width:18px;height:18px;stroke:var(--soft);}
.search-input{border:0;background:transparent;font-size:13px;color:var(--ink);font-family:var(--fu);width:100%;min-height:44px;outline:none;}
.search-input::placeholder{color:var(--soft);}
.refresh{width:44px;height:44px;border-radius:14px;background:var(--surf);border:1px solid var(--hair);box-shadow:var(--sh1);cursor:pointer;color:var(--forest);flex-shrink:0;display:grid;place-items:center;}
.refresh:hover{background:var(--bg);}

/* === CATEGORY BAR === */
.catbar{position:absolute;top:70px;left:16px;right:16px;z-index:19;display:flex;gap:7px;overflow-x:auto;scrollbar-width:none;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;}
.catbar::-webkit-scrollbar{display:none;}
.cat{border:1px solid var(--hair);background:rgba(255,254,252,.94);backdrop-filter:blur(8px);border-radius:999px;padding:8px 13px;font-size:11px;font-weight:500;color:var(--soft);cursor:pointer;white-space:nowrap;box-shadow:var(--sh1);scroll-snap-align:start;min-height:44px;display:flex;align-items:center;gap:5px;}
.cat.active{background:var(--forest);color:var(--mint);border-color:var(--forest);}
.cat.active svg{stroke:var(--mint)!important;}

/* === LEGEND === */
.legend{position:absolute;right:16px;bottom:24px;z-index:18;background:rgba(255,254,252,.92);backdrop-filter:blur(10px);border:1px solid var(--hair);border-radius:14px;padding:11px 13px;box-shadow:var(--sh1);}
.legend .lh{font-size:9px;letter-spacing:1.2px;text-transform:uppercase;color:var(--soft);font-weight:600;margin-bottom:7px;}
.legend .lr{display:flex;align-items:center;gap:7px;font-size:11px;margin-bottom:4px;}
.legend .ld{width:10px;height:10px;border-radius:50%;flex:none;}
@media(max-width:820px){.legend{display:none;}}

/* === SEED PINS (Phase 2d/e) === */
@keyframes heartbeat{0%,100%{opacity:1;}50%{opacity:.78;}}
.seed{position:relative;width:44px;height:44px;filter:drop-shadow(0 3px 5px rgba(15,62,23,.28));transition:transform .2s cubic-bezier(.22,.61,.36,1);}
.seed:hover{transform:scale(1.14);}
.seed-glyph{position:absolute;inset:0;display:grid;place-items:center;}
.seed.proven{filter:drop-shadow(0 0 9px rgba(46,125,70,.55));}
.seed.proven .seed-ring{animation:heartbeat 3s ease-in-out infinite;}
.seed-fuzz{position:absolute;inset:-8px;border-radius:50%;border:1.5px dashed rgba(15,62,23,.3);background:radial-gradient(circle,rgba(207,231,211,.25),transparent 70%);}
.sd-badge{position:absolute;top:-2px;right:-2px;width:18px;height:18px;border-radius:50%;display:grid;place-items:center;z-index:2;border:2px solid rgba(255,254,252,.95);}
.sd-alert{background:#bd8a40;color:#fff;font-size:10px;font-weight:700;}
.sd-ok{background:var(--forest);color:var(--mint);}
.mk:hover .seed{transform:scale(1.14);}
.mk.selected .seed{transform:scale(1.22);outline:2px solid var(--forest);outline-offset:3px;border-radius:50%;}
.you{width:16px;height:16px;border-radius:50%;background:#3b82f6;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3);}

/* === CLUSTER (Phase 2f) === */
.cluster{background:var(--forest);color:var(--mint);border-radius:50%;display:grid;place-items:center;font-weight:700;font-size:13px;border:3px solid var(--surf);box-shadow:0 2px 8px rgba(15,62,23,.25);font-family:var(--display);}
.cluster-s{width:40px;height:40px;font-size:11px;}
.cluster-m{width:48px;height:48px;font-size:13px;}
.cluster-l{width:56px;height:56px;font-size:15px;}
.leaflet-oldie .cluster{background:var(--forest);}

/* === PIN ENTRANCE (Phase 5) === */
@keyframes pinIn{
  0%{opacity:0;transform:scale(.5) translateY(8px);}
  100%{opacity:1;transform:scale(1) translateY(0);}
}
.mk{animation:pinIn .35s var(--ease) both;}

/* === DOCK (Phase 4 — premium) === */
@keyframes fadeUp{
  0%{opacity:0;transform:translateY(10px);}
  100%{opacity:1;transform:translateY(0);}
}
.dock{position:absolute;left:16px;bottom:24px;z-index:20;width:360px;max-width:calc(100% - 32px);background:var(--surf);border:1px solid var(--hair);border-radius:18px;box-shadow:var(--sh2);overflow:hidden;max-height:calc(100vh - 200px);display:flex;flex-direction:column;}
@media(max-width:820px){
  .dock{left:10px;right:10px;width:auto;bottom:16px;max-height:42vh;border-radius:18px 18px 0 0;}
  .dock::before{content:'';display:block;width:36px;height:4px;border-radius:4px;background:var(--hair);margin:8px auto 0;}
}
.dock-h{padding:15px 18px 10px;}
.dock-k{font-size:9px;letter-spacing:1.6px;text-transform:uppercase;color:var(--soft);font-weight:600;}
.dock-title{font-weight:600;font-size:18px;color:var(--forest);margin-top:4px;}
.dock-list{overflow-y:auto;padding:4px 10px 16px;overscroll-behavior:contain;}

/* Dock items */
.dl-item{display:flex;gap:12px;padding:14px 12px;border-radius:14px;cursor:pointer;align-items:center;border-bottom:1px solid var(--hair);min-height:44px;animation:fadeUp .3s var(--ease) both;}
.dl-item:last-child{border-bottom:0;}
.dl-item:hover{background:var(--bg);}
.dl-thumb{width:44px;height:44px;border-radius:12px;overflow:hidden;flex:none;display:grid;place-items:center;}
.dl-thumb.no-media{background:transparent;}
.dl-thumb img{width:100%;height:100%;object-fit:cover;border-radius:12px;}
.dl-thumb-fallback{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;}
.dl-main{min-width:0;flex:1;}
.dl-title{font-weight:600;font-size:13px;line-height:1.2;letter-spacing:-.2px;font-family:var(--display);}
.dl-sub{font-size:11px;color:var(--soft);margin-top:2px;}
.chip{font-size:9px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;padding:3px 7px;border-radius:999px;display:inline-block;margin-bottom:4px;}
.c-fundable{background:#dcefe0;color:#1f5a2c;}.c-reframe{background:rgba(189,138,64,.16);color:#9a6f2e;}
.c-statutory{background:rgba(138,151,140,.2);color:#5e6d62;}.c-proven{background:var(--forest);color:var(--mint);}
.c-filed{background:rgba(138,151,140,.35);color:#3e4d42;}.c-filed::after{content:' ✓';}
.c-unfiled{background:rgba(189,138,64,.12);color:#8a6a28;}.c-unfiled::after{content:' !';}

/* Statutory items quieter (Phase 4b) */
.dl-item.statutory{opacity:.78;}
.dl-item.statutory .chip{font-size:8px;font-weight:600;}
.dl-item.statutory .dl-title{font-weight:500;}

/* === SKELETON LOADING (Phase 5) === */
@keyframes shimmer{
  0%{background-position:200% 0;}
  100%{background-position:-200% 0;}
}
.skeleton-pulse{background:linear-gradient(90deg,var(--hair) 25%,#f0f2ed 50%,var(--hair) 75%);background-size:200% 100%;animation:shimmer 1.5s ease-in-out infinite;border-radius:8px;}
.dl-item.skeleton{cursor:default;hover:none;pointer-events:none;}
.dl-item.skeleton .dl-thumb{background:transparent;}
.dl-item.skeleton .dl-thumb .skeleton-pulse{width:44px;height:44px;border-radius:12px;}
.dl-item.skeleton .skeleton-chip{width:50px;height:12px;margin-bottom:6px;}
.dl-item.skeleton .skeleton-title{width:140px;height:14px;margin-bottom:6px;}
.dl-item.skeleton .skeleton-sub{width:90px;height:11px;}

/* === EMPTY STATE (Phase 5) === */
@keyframes floatSlow{
  0%,100%{transform:translateY(0);}
  50%{transform:translateY(-8px);}
}
.empty{position:absolute;inset:0;z-index:25;display:grid;place-items:center;pointer-events:none;}
.empty::before{content:'';position:absolute;width:500px;height:500px;border-radius:50%;background:radial-gradient(circle,rgba(207,231,211,.4),transparent 70%);pointer-events:none;top:50%;left:50%;transform:translate(-50%,-55%);}
.empty-card{pointer-events:auto;text-align:center;background:var(--surf);border:1px solid var(--hair);border-radius:18px;box-shadow:var(--sh2);padding:32px 28px;max-width:340px;}
.empty-mark{font-size:24px;font-weight:600;color:var(--forest);animation:floatSlow 4s ease-in-out infinite;font-family:var(--display);}
.empty-card h3{font-size:18px;color:var(--ink);margin:14px 0 8px;}
.empty-card p{font-size:13px;color:var(--soft);line-height:1.55;}
.empty-btn{display:inline-flex;align-items:center;gap:6px;margin-top:18px;background:var(--forest);color:var(--mint);text-decoration:none;font-weight:600;font-size:15px;padding:14px 24px;border-radius:14px;box-shadow:0 4px 12px rgba(15,62,23,.25);transition:box-shadow .2s,transform .2s;}
.empty-btn:hover{box-shadow:0 6px 20px rgba(15,62,23,.35);transform:translateY(-1px);}
.empty-btn:hover .empty-arrow{transform:translateX(3px);}
.empty-arrow{display:inline-block;transition:transform .2s;}

/* === DOSSIER (Phase 5) === */
.sheet{position:fixed;inset:0;z-index:200;display:none;}.sheet.show{display:block;}
.sheet-scrim{position:absolute;inset:0;background:rgba(8,20,12,.5);backdrop-filter:blur(4px);}
.sheet-panel{position:absolute;right:0;top:0;bottom:0;width:min(480px,100%);background:var(--surf);box-shadow:var(--sh2);overflow-y:auto;animation:slideIn .35s cubic-bezier(.16,1,.3,1);}
@keyframes slideIn{0%{transform:translateX(100%);}100%{transform:translateX(0);}}
@media(max-width:560px){.sheet-panel{width:100%;}}
.dos-img{position:relative;height:200px;background:#dfe4da;}
.dos-img img{width:100%;height:100%;object-fit:cover;position:absolute;inset:0;}
.dos-fallback{position:absolute;inset:0;display:grid;place-items:center;}
.dos-img-content{position:absolute;inset:0;}
.dos-close{position:absolute;top:14px;left:14px;width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,.92);border:0;cursor:pointer;z-index:3;font-size:16px;display:grid;place-items:center;color:var(--ink);}
.dos-close:hover{background:var(--bg);}
.dos-toggle{position:absolute;top:14px;right:14px;z-index:3;display:flex;gap:3px;background:rgba(255,255,255,.92);border-radius:11px;padding:4px;}
.dos-toggle button{border:0;background:transparent;cursor:pointer;font-size:11px;font-weight:600;color:var(--soft);padding:7px 12px;border-radius:8px;min-height:36px;}
.dos-toggle button.active{background:var(--forest);color:var(--mint);}
.dos-body{padding:22px 26px 34px;}
.dos-stage{font-size:9px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--soft);}
.dos-title{font-size:24px;font-weight:600;line-height:1.2;margin:6px 0;}
.dos-cat{font-size:11px;color:var(--soft);text-transform:capitalize;margin-bottom:4px;}
.dos-desc{font-size:13px;line-height:1.7;margin-top:16px;}
.dos-traj-lbl{display:flex;justify-content:space-between;font-size:9px;text-transform:uppercase;color:var(--soft);margin:20px 0 8px;}
.dos-traj-lbl .now{color:var(--forest);font-weight:700;}
.dos-traj{display:flex;align-items:center;}
.dos-traj .nd{width:10px;height:10px;border-radius:50%;background:var(--hair);flex:none;}
.dos-traj .nd.done{background:var(--forest);}.dos-traj .nd.curr{width:14px;height:14px;border:3px solid var(--forest);background:var(--surf);}
.dos-traj .sg{flex:1;height:2px;background:var(--hair);}.dos-traj .sg.done{background:var(--forest);}
.lq{display:flex;gap:9px;margin-top:16px;}
.lqc{flex:1;background:var(--bg);border:1px solid var(--hair);border-radius:14px;padding:12px;text-align:center;}
.lqc b{font-size:11px;display:block;}.lqc span{font-size:11px;color:var(--soft);}
.ledger-note{margin-top:16px;background:var(--bg);border:1px solid var(--hair);border-radius:14px;padding:15px;}
.ledger-note b{font-size:13px;color:var(--forest);}.ledger-note p{font-size:13px;color:var(--soft);line-height:1.5;margin-top:6px;}
.zero-pill{display:inline-flex;align-items:center;gap:5px;background:#dcefe0;color:#1f5a2c;font-size:11px;font-weight:600;padding:6px 12px;border-radius:999px;margin-top:14px;}
.zero-pill .check{width:18px;height:18px;border-radius:50%;background:var(--forest);color:var(--mint);display:grid;place-items:center;}

/* File action */
.dos-file-action{margin-top:18px;}
.dos-file-divider{height:1px;background:var(--hair);margin-bottom:16px;}
.dos-file-h{font-size:13px;font-weight:600;color:var(--forest);margin-bottom:6px;display:flex;align-items:center;gap:6px;}
.dos-file-h .file-icon{color:var(--forest);width:16px;height:16px;}
.dos-file-p{font-size:11px;color:var(--soft);line-height:1.5;margin-bottom:12px;}
.dos-file-btns{display:flex;gap:10px;flex-wrap:wrap;}
.dos-file-btn{display:inline-flex;align-items:center;gap:5px;padding:11px 18px;border-radius:11px;font-size:13px;font-weight:600;text-decoration:none;min-height:44px;}
.dos-file-wa{background:#25D366;color:#fff;}
.dos-file-em{background:var(--bg);color:var(--ink);border:1px solid var(--hair);}

/* === TOAST === */
.toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%) translateY(120px);z-index:400;background:rgba(10,30,15,.95);color:#fff;padding:13px 22px;border-radius:999px;font-size:13px;font-weight:500;transition:transform .4s cubic-bezier(.16,1,.3,1);}
.toast.show{transform:translateX(-50%) translateY(0);}

/* === CONSISTENCY PASS === */
.leaflet-control-attribution{font-size:9px!important;}

```

