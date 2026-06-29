const CFG = window.SETU_CONFIG;
const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);

// --- category + honest-state helpers ---
const CATS = ["all","sanitation","water","roads","education","health","environment","elderly","other"];
const STAGES = ["heard","sorted","funded","built","proven"];

// Category brand colours + a single consistent 1.8px stroke SVG icon set.
// Category brand colours + Lucide icon name mapping (ISC license, stroke-based, consistent).
const CAT_COLOR = {
  sanitation:"#3f8a55", water:"#3f6f8a", roads:"#8a978c", education:"#bd8a40",
  health:"#b0654a", environment:"#2e7d46", elderly:"#7d6a9c", other:"#67726a"
};
const LUCIDE = {
  sanitation:"trash-2", water:"droplet", roads:"route", education:"graduation-cap",
  health:"heart-pulse", environment:"leaf", elderly:"users", other:"help-circle", all:"grid-3x3"
};
const UI_ICONS = {
  close:"x", check:"check", search:"search", refresh:"refresh-cw",
  arrow:"arrow-right", file:"file-text", email:"mail", chat:"message-circle", dusk:"moon"
};

function catIcon(cat, color, size){
  return '<i data-lucide="'+(LUCIDE[cat]||'help-circle')+'" width="'+size+'" height="'+size+'" stroke="'+(color||'#0f3e17')+'" stroke-width="2"></i>';
}
function uiIcon(name, size, color){
  return '<i data-lucide="'+(UI_ICONS[name]||name)+'" width="'+size+'" height="'+size+'" stroke="'+(color||'currentColor')+'" stroke-width="2"></i>';
}

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

// Default sort: hope leads, statutory sits quietly below.
const ORDER = {proven:0, built:1, funded:2, fundable:3, reframe:4, statutory:5};
function rank(p){
  if(p.stage==="proven") return ORDER.proven;
  if(p.stage==="built") return ORDER.built;
  if(p.stage==="funded") return ORDER.funded;
  if(p.legality_bin==="statutory") return ORDER.statutory;
  if(p.legality_bin==="reframe") return ORDER.reframe;
  return ORDER.fundable;
}

// --- gov routing helpers (client-side, mirrors bot logic) ---
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

// --- utils ---
function escapeHTML(s){ return (s||"").replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function hexA(hex, a){
  let h = (hex||"#67726a").replace('#','');
  if(h.length===3) h = h.split('').map(x=>x+x).join('');
  const n = parseInt(h,16), r=(n>>16)&255, g=(n>>8)&255, b=n&255;
  return 'rgba('+r+','+g+','+b+','+a+')';
}

// --- state ---
let ALL = [];
let curCat = "all";
let markers = {};
let selectedId = null;
let searchQuery = "";
let LOC_NAME = "Dwarka";
let placeCache = {};
let lastUpdated = Date.now();
let loadedOnce = false;

// --- reverse geocode (free OSM Nominatim; cached, called once for the chip, never per pin) ---
async function placeName(lat, lng){
  const key = lat.toFixed(3)+','+lng.toFixed(3);
  if(placeCache[key]) return placeCache[key];
  try{
    const r = await fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat='+lat+'&lon='+lng+'&zoom=14',
      {headers:{'Accept-Language':'en'}});
    const j = await r.json();
    const a = j.address || {};
    const name = (a.suburb||a.neighbourhood||a.city_district||a.city||a.town||"Your area")
       + (a.city||a.state ? ", " + (a.city||a.state) : "");
    placeCache[key] = name;
    return name;
  }catch(e){ return "Your area"; }
}
function setLocName(n){ if(n && n !== "Your area"){ LOC_NAME = n; updateLiveLine(); } }

// --- map setup ---
const map = L.map('map',{zoomControl:false,attributionControl:true,minZoom:4,maxZoom:18})
  .setView([CFG.CENTER.lat, CFG.CENTER.lng], CFG.CENTER.zoom);
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
  {subdomains:'abcd',attribution:'&copy; OSM &copy; CARTO',maxZoom:19}).addTo(map);

const seedLayer = L.markerClusterGroup({
  showCoverageOnHover:false,
  maxClusterRadius:48,
  spiderfyOnMaxZoom:true,
  iconCreateFunction:function(c){
    return L.divIcon({html:'<b>'+c.getChildCount()+'</b>',className:'cl',iconSize:[42,42],iconAnchor:[21,21]});
  }
});
map.addLayer(seedLayer);
const circleLayer = L.layerGroup().addTo(map);
let youMarker = null;

// Watch for pin icons appearing/declustering in the map
if (typeof lucide !== 'undefined') {
  const iconObs = new MutationObserver(() => lucide.createIcons());
  iconObs.observe(map.getContainer(), { childList: true, subtree: true });
}

function setYouMarker(lat, lng){
  if(youMarker) map.removeLayer(youMarker);
  youMarker = L.marker([lat,lng],{icon:L.divIcon({
    className:'',html:'<div class="you"><span class="you-pulse"></span></div>',
    iconSize:[18,18],iconAnchor:[9,9]
  }),zIndexOffset:600}).addTo(map);
}

// Place a "you" marker (if permitted) and refine the place name — but never fight fitToPins.
if(navigator.geolocation){
  navigator.geolocation.getCurrentPosition(async (pos)=>{
    const lat = pos.coords.latitude, lng = pos.coords.longitude;
    setYouMarker(lat, lng);
    setLocName(await placeName(lat, lng));
  }, ()=>{
    setYouMarker(CFG.CENTER.lat, CFG.CENTER.lng);
  });
} else {
  setYouMarker(CFG.CENTER.lat, CFG.CENTER.lng);
}

// --- fit the map to the actual pins; never open on empty NCR ---
function fitToPins(shown){
  const pts = shown.filter(p=>p.latitude!=null && p.longitude!=null).map(p=>[p.latitude,p.longitude]);
  if(pts.length === 0){
    map.setView([CFG.CENTER.lat, CFG.CENTER.lng], CFG.CENTER.zoom);
  } else if(pts.length === 1){
    map.setView(pts[0], 15);
  } else {
    map.fitBounds(L.latLngBounds(pts).pad(0.25), {maxZoom:15, animate:true});
  }
}

// --- pins: clean white seed disc + coloured stage ring + category icon (never emoji) ---
function seedHTML(p){
  const c = pinColor(p);
  const fill = stageIndex(p)/(STAGES.length-1);
  const C = 100, off = C*(1-fill);
  const fuzz = p.is_sensitive ? '<div class="seed-fuzz"></div>' : '';
  return '<div class="seed'+(p.stage==='proven'?' proven':'')+'">'+fuzz+
    '<svg class="seed-ring" width="44" height="44" viewBox="0 0 44 44">'+
      '<circle class="seed-bg" cx="22" cy="22" r="18" stroke-width="3"/>'+
      '<circle cx="22" cy="22" r="18" fill="none" stroke="'+c+'" stroke-width="3" stroke-linecap="round" '+
        'stroke-dasharray="'+C+'" stroke-dashoffset="'+off+'" transform="rotate(-90 22 22)"/>'+
    '</svg><div class="seed-glyph">'+catIcon(p.category, c, 18)+'</div></div>';
}

// --- dossier header: real photo, or a designed category-tinted panel (never a grey void) ---
function dossierHeader(p){
  if(p.media_type==="photo" && p.media_url){
    return '<img src="'+p.media_url+'" alt="">';
  }
  const c = CAT_COLOR[p.category] || "#3f8a55";
  return '<div class="dos-fallback" style="background:linear-gradient(135deg,'+hexA(c,0.22)+','+hexA(c,0.06)+')">'+
    catIcon(p.category, c, 56)+'</div>';
}

async function loadWounds(){
  if(!loadedOnce){ showSkeletons(); }
  const { data, error } = await sb.from('public_problems').select('*').order('created_at',{ascending:false});
  if(error){ console.error(error); toast("Could not load the map. Retry?"); return; }
  ALL = data || [];
  loadedOnce = true;
  render();
}

function showSkeletons(){
  const list = document.getElementById('dockList');
  list.innerHTML = '';
  for(let i=0;i<5;i++){
    const s = document.createElement('div'); s.className = 'sk';
    s.style.animationDelay = (i*60)+'ms';
    s.innerHTML = '<div class="sk-thumb"></div><div class="sk-main"><div class="sk-l w60"></div><div class="sk-l w35"></div></div>';
    list.appendChild(s);
  }
  document.getElementById('dockTitle').textContent = 'Listening…';
}

function render(){
  seedLayer.clearLayers(); circleLayer.clearLayers(); markers = {};
  const q = searchQuery;
  const shown = ALL.filter(p =>
      (curCat==="all" || p.category===curCat) &&
      (!q || ((p.title||'')+' '+(p.description||'')+' '+(p.category||'')).toLowerCase().includes(q))
    ).sort((a,b)=> rank(a)-rank(b));

  document.getElementById('emptyState').classList.toggle('hidden', shown.length!==0);

  const useStagger = shown.length <= 60;
  shown.forEach((p, i)=>{
    if(p.latitude==null || p.longitude==null) return;
    const m = L.marker([p.latitude,p.longitude],{icon:L.divIcon({
      className:'mk'+(selectedId===p.id?' sel':''),
      html:seedHTML(p),
      iconSize:[44,44], iconAnchor:[22,22]
    })});
    seedLayer.addLayer(m);
    if(useStagger){
      const el = m.getElement();
      if(el) el.style.animationDelay = (i*40)+'ms';
    }
    m.on('click', ()=>openDossier(p));
    markers[p.id] = m;
    if(p.is_sensitive){
      L.circle([p.latitude,p.longitude],{radius:300,color:'#9bbfa6',weight:1,dashArray:'4 5',
        fillColor:'#cfe7d3',fillOpacity:.16}).addTo(circleLayer);
    }
  });

  fitToPins(shown);
  renderDock(shown);
  lastUpdated = Date.now();
  updateLiveLine();
  if (typeof lucide !== 'undefined') requestAnimationFrame(() => lucide.createIcons());
}

function renderDock(shown){
  const list = document.getElementById('dockList');
  list.innerHTML = '';
  const proven = shown.filter(p=>p.stage==="proven").length;
  document.getElementById('dockTitle').textContent =
    shown.length===0 ? "No wounds here yet." :
    proven>0 ? proven+" healed · "+(shown.length-proven)+" in motion" :
    shown.length+" wound"+(shown.length>1?"s":"")+" in motion";

  shown.forEach((p, i)=>{
    const c = CAT_COLOR[p.category] || "#67726a";
    const stat = p.legality_bin === "statutory";
    const d = document.createElement('div');
    d.className = 'dl-item'+(stat?' is-statutory':'');
    d.style.animationDelay = (i*30)+'ms';
    const thumb = (p.media_type==="photo" && p.media_url)
      ? '<img src="'+p.media_url+'" alt="">'
      : '<span class="dl-ic">'+catIcon(p.category, c, 22)+'</span>';
    d.innerHTML =
      '<div class="dl-thumb" style="--ic:'+hexA(c,0.16)+'">'+thumb+'</div>'+
      '<div class="dl-main"><span class="chip '+chipClass(p)+'">'+stageLabel(p)+'</span>'+
      '<div class="dl-title">'+escapeHTML(p.title||"Untitled")+'</div>'+
      '<div class="dl-sub">'+escapeHTML(p.reporter_handle||"A citizen")+'</div></div>';
    d.addEventListener('click', ()=>{
      openDossier(p);
      map.flyTo([p.latitude,p.longitude],15,{duration:.7});
      const once = ()=>{
        requestAnimationFrame(()=>{
          if(selectedId===p.id && markers[p.id]){
            const el = markers[p.id].getElement();
            if(el) el.classList.add('sel');
          }
        });
        map.off('moveend', once);
      };
      map.on('moveend', once);
    });
    list.appendChild(d);
  });
}

// --- dossier ---
function openDossier(p){
  if(selectedId && markers[selectedId]){
    const e = markers[selectedId].getElement();
    if(e) e.classList.remove('sel');
  }
  selectedId = p.id;
  if(markers[p.id]){
    const e = markers[p.id].getElement();
    if(e) e.classList.add('sel');
  }

  const c = CAT_COLOR[p.category] || "#67726a";
  document.getElementById('dosTitle').textContent = p.title||"Untitled";
  document.getElementById('dosCat').innerHTML = '<span class="dos-cat-ic">'+catIcon(p.category, c, 15)+'</span>'+(p.category||"");
  document.getElementById('dosStage').textContent = stageLabel(p);
  document.getElementById('dosDesc').textContent = p.description||p.transcript||"";
  document.getElementById('dosMedia').innerHTML = dossierHeader(p);

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

  // File action for statutory wounds awaiting citizen
  const fa = document.getElementById('dosFileAction');
  if(p.legality_bin === "statutory" && p.gov_filed === "awaiting_citizen"){
    const authName = GOV[p.gov_authority] ? GOV[p.gov_authority].name : (p.gov_authority||"the authority");
    document.getElementById('dosFileH').innerHTML = uiIcon('file',16,'var(--forest)')+' File this with <span id="dosFileAuth">'+escapeHTML(authName)+'</span>';
    const wa = document.getElementById('dosFileWA'); wa.href = buildGovWhatsAppLink(p);
    wa.innerHTML = uiIcon('chat',16,'#fff')+' WhatsApp';
    const em = document.getElementById('dosFileEmail'); em.href = buildGovEmailLink(p);
    em.innerHTML = uiIcon('email',16,'currentColor')+' Email';
    fa.classList.remove('hidden');
  } else {
    fa.classList.add('hidden');
  }

  setDosMode('heart');
  document.getElementById('dossier').classList.add('show');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}
function setDosMode(m){
  document.getElementById('heartBlock').classList.toggle('hidden', m!=="heart");
  document.getElementById('ledgerBlock').classList.toggle('hidden', m!=="ledger");
  document.getElementById('tabHeart').classList.toggle('active', m==="heart");
  document.getElementById('tabLedger').classList.toggle('active', m==="ledger");
}

// --- category bar (SVG icons, no emoji) ---
function buildCatbar(){
  const bar = document.getElementById('catbar'); bar.innerHTML='';
  CATS.forEach(c=>{
    const b=document.createElement('button');
    b.className='cat'+(c==="all"?' active':'');
    const ic = c==="all" ? uiIcon('all',15,'currentColor') : catIcon(c,15,CAT_COLOR[c]);
    const label = c==="all" ? "All wounds" : c.charAt(0).toUpperCase()+c.slice(1);
    b.innerHTML='<span class="cat-ic">'+ic+'</span><span class="cat-lb">'+label+'</span>';
    b.addEventListener('click',()=>{
      curCat=c; document.querySelectorAll('.cat').forEach(x=>x.classList.remove('active')); b.classList.add('active'); render();
    });
    bar.appendChild(b);
  });
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// --- toast + live trust line ---
let toastT;
function toast(m){ const t=document.getElementById('toast'); t.textContent=m; t.classList.add('show'); clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove('show'),2600); }
function relTime(){
  const s = Math.floor((Date.now()-lastUpdated)/1000);
  if(s < 60) return 'just now';
  const m = Math.floor(s/60); if(m < 60) return m+'m ago';
  const h = Math.floor(m/60); return h+'h ago';
}
function updateLiveLine(){
  document.getElementById('dockK').textContent = 'Across '+LOC_NAME+' · updated '+relTime();
}

// --- wiring ---
document.getElementById('dosClose').addEventListener('click', closeDossier);
document.getElementById('dosScrim').addEventListener('click', closeDossier);
function closeDossier(){
  document.getElementById('dossier').classList.remove('show');
  if(selectedId && markers[selectedId]){
    const el = markers[selectedId].getElement();
    if(el) el.classList.remove('sel');
  }
  selectedId = null;
}
document.getElementById('tabHeart').addEventListener('click',()=>setDosMode('heart'));
document.getElementById('tabLedger').addEventListener('click',()=>setDosMode('ledger'));
document.getElementById('refreshBtn').addEventListener('click', loadWounds);
document.getElementById('locChip').addEventListener('input', (e)=>{
  searchQuery = e.target.value.trim().toLowerCase();
  render();
});
document.getElementById('duskBtn').addEventListener('click', ()=>{
  document.body.classList.toggle('dusk');
  document.getElementById('duskBtn').classList.toggle('on');
});
document.getElementById('emptyBtn').href = CFG.BOT_URL || "#";

// Fill chrome icons (kept out of HTML so the markup stays clean).
document.getElementById('searchIc').innerHTML = uiIcon('search',15,'var(--soft)');
document.getElementById('refreshBtn').innerHTML = uiIcon('refresh',18,'var(--forest)');
document.getElementById('duskBtn').innerHTML = uiIcon('dusk',18,'var(--forest)');
document.getElementById('dosClose').innerHTML = uiIcon('close',18,'var(--forest)');
document.getElementById('zeroCheck').innerHTML = uiIcon('check',10,'var(--mint)');
if (typeof lucide !== 'undefined') lucide.createIcons();

// --- init ---
updateLiveLine();
setInterval(updateLiveLine, 30000);
buildCatbar();
placeName(CFG.CENTER.lat, CFG.CENTER.lng).then(setLocName);
loadWounds();

// live updates when new wounds are published
sb.channel('public_problems_changes')
  .on('postgres_changes',{event:'*',schema:'public',table:'problems'},()=>loadWounds())
  .subscribe();
