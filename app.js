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
