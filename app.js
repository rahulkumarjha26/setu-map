const CFG = window.SETU_CONFIG;
const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);

// --- category + honest-state helpers ---
const CATS = ["all","sanitation","water","roads","education","health","environment","elderly","other"];
const CAT_EMOJI = {sanitation:"🚻",water:"💧",roads:"🛣️",education:"📚",health:"➕",environment:"🌿",elderly:"🧓",other:"📍"};
const STAGES = ["heard","sorted","funded","built","proven"];

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
function buildGovWebLink(p){
  const a = GOV[p.gov_authority] || GOV.MCD;
  return a.web;
}

// --- map setup ---
const map = L.map('map',{zoomControl:false,attributionControl:true,minZoom:4,maxZoom:18})
  .setView([CFG.CENTER.lat, CFG.CENTER.lng], CFG.CENTER.zoom);
const tiles = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
  {subdomains:'abcd',attribution:'&copy; OSM &copy; CARTO',maxZoom:19}).addTo(map);
const seedLayer = L.layerGroup().addTo(map);
let youMarker = L.marker([CFG.CENTER.lat, CFG.CENTER.lng],
  {icon:L.divIcon({className:'',html:'<div class="you"></div>',iconSize:[16,16],iconAnchor:[8,8]}),zIndexOffset:600}).addTo(map);

// Try to center on user's location
if(navigator.geolocation){
  navigator.geolocation.getCurrentPosition(
    (pos)=>{
      const lat = pos.coords.latitude, lng = pos.coords.longitude;
      map.setView([lat, lng], 14);
      map.removeLayer(youMarker);
      youMarker = L.marker([lat, lng],
        {icon:L.divIcon({className:'',html:'<div class="you"></div>',iconSize:[16,16],iconAnchor:[8,8]}),zIndexOffset:600}).addTo(map);
      document.getElementById('locChip').textContent = lat.toFixed(2)+', '+lng.toFixed(2);
    },
    ()=>{ /* user denied — keep default center */ }
  );
}

let ALL = [];
let curCat = "all";
let markers = {};
let selectedId = null;

function seedHTML(p){
  const c = pinColor(p);
  const fill = stageIndex(p)/(STAGES.length-1);
  const C = 100, off = C*(1-fill);
  const fuzz = p.is_sensitive ? '<div class="seed-fuzz"></div>' : '';
  let badge = '';
  if(p.legality_bin === "statutory" && p.gov_filed === "awaiting_citizen") badge = '<div class="sd-badge sd-alert">!</div>';
  else if(p.legality_bin === "statutory" && (p.gov_filed === "filed_by_citizen" || p.gov_filed === "acknowledged")) badge = '<div class="sd-badge sd-ok">✓</div>';
  return '<div class="seed'+(p.stage==="proven"?" proven":"")+'">'
    + '<svg width="40" height="40" viewBox="0 0 40 40">'
    + '<circle cx="20" cy="20" r="16" fill="rgba(255,254,252,.95)" stroke="#dfe3dc" stroke-width="3"/>'
    + '<circle cx="20" cy="20" r="16" fill="none" stroke="'+c+'" stroke-width="3" stroke-linecap="round" stroke-dasharray="'+C+'" stroke-dashoffset="'+off+'" transform="rotate(-90 20 20)"/>'
    + '</svg>'
    + '<div class="seed-glyph">'+(CAT_EMOJI[p.category]||"📍")+'</div>'
    + badge + fuzz + '</div>';
}

async function loadWounds(){
  const { data, error } = await sb.from('public_problems').select('*').order('created_at',{ascending:false});
  if(error){ console.error(error); toast("Could not load the map. Retry?"); return; }
  ALL = data || [];
  render();
}

function render(){
  seedLayer.clearLayers(); markers = {};
  const shown = ALL.filter(p => curCat==="all" || p.category===curCat);

  const empty = document.getElementById('emptyState');
  if(shown.length === 0){ empty.classList.remove('hidden'); }
  else { empty.classList.add('hidden'); }

  // Stagger pin entrance (skip stagger if > 60 pins — just fade layer in)
  const useStagger = shown.length <= 60;

  shown.forEach((p, i)=>{
    if(p.latitude==null || p.longitude==null) return;
    const m = L.marker([p.latitude,p.longitude],
      {icon:L.divIcon({
        className:'mk'+(selectedId===p.id?' selected':''),
        html:seedHTML(p),
        iconSize:[40,40],iconAnchor:[20,20]
      })}).addTo(seedLayer);
    // Stagger delay
    if(useStagger){
      const el = m.getElement();
      if(el) el.style.animationDelay = (i * 40)+'ms';
    }
    m.on('click',()=>openDossier(p));
    markers[p.id]=m;
    if(p.is_sensitive){
      L.circle([p.latitude,p.longitude],{radius:300,color:'#9bbfa6',weight:1,dashArray:'4 5',fillColor:'#cfe7d3',fillOpacity:.16}).addTo(seedLayer);
    }
  });

  // Dock list
  const list = document.getElementById('dockList');
  list.innerHTML = '';
  const proven = shown.filter(p=>p.stage==="proven").length;
  document.getElementById('dockTitle').textContent =
    shown.length===0 ? "No wounds here yet." :
    (proven>0 ? proven+" healed, "+shown.length+" in motion" : shown.length+" wound"+(shown.length>1?"s":"")+" near you");
  shown.forEach((p, i)=>{
    const d = document.createElement('div'); d.className='dl-item';
    d.style.animationDelay = (i * 30)+'ms';
    const thumb = p.media_type==="photo" && p.media_url
      ? '<img src="'+p.media_url+'" alt="">' : (CAT_EMOJI[p.category]||"📍");
    d.innerHTML = '<div class="dl-thumb">'+thumb+'</div>'
      + '<div class="dl-main"><span class="chip '+chipClass(p)+'">'+stageLabel(p)+'</span>'
      + '<div class="dl-title">'+escapeHTML(p.title||"Untitled")+'</div>'
      + '<div class="dl-sub">'+escapeHTML(p.reporter_handle||"A citizen")+'</div></div>';
    d.addEventListener('click',()=>{ openDossier(p); map.flyTo([p.latitude,p.longitude],15,{duration:.7}); });
    list.appendChild(d);
  });
}

// --- dossier ---
function openDossier(p){
  // Update selected pin
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
  const img = document.getElementById('dosImg');
  if(p.media_type==="photo" && p.media_url){ img.src=p.media_url; img.style.display=''; }
  else { img.style.display='none'; }

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
    document.getElementById('dosFileAuth').textContent = authName;
    document.getElementById('dosFileWA').href = buildGovWhatsAppLink(p);
    document.getElementById('dosFileEmail').href = buildGovEmailLink(p);
    fa.classList.remove('hidden');
  } else {
    fa.classList.add('hidden');
  }

  setDosMode('heart');
  document.getElementById('dossier').classList.add('show');
}
function setDosMode(m){
  document.getElementById('heartBlock').classList.toggle('hidden', m!=="heart");
  document.getElementById('ledgerBlock').classList.toggle('hidden', m!=="ledger");
  document.getElementById('tabHeart').classList.toggle('active', m==="heart");
  document.getElementById('tabLedger').classList.toggle('active', m==="ledger");
}

// --- category bar ---
function buildCatbar(){
  const bar = document.getElementById('catbar'); bar.innerHTML='';
  CATS.forEach(c=>{
    const b=document.createElement('button');
    b.className='cat'+(c==="all"?' active':'');
    b.textContent = c==="all" ? "All wounds" : ((CAT_EMOJI[c]||"")+" "+c.charAt(0).toUpperCase()+c.slice(1));
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
document.getElementById('locChip').textContent = "Listening across Delhi";
document.getElementById('emptyBtn').href = CFG.BOT_URL || "#";

// Live line update
function updateLiveLine(){
  const now = new Date();
  const h = now.getHours().toString().padStart(2,'0');
  const m = now.getMinutes().toString().padStart(2,'0');
  document.getElementById('dockK').textContent = "Across Delhi · updated "+h+":"+m;
}
updateLiveLine();
setInterval(updateLiveLine, 30000);

buildCatbar();
loadWounds();

// live updates when new wounds are published
sb.channel('public_problems_changes')
  .on('postgres_changes',{event:'*',schema:'public',table:'problems'},()=>loadWounds())
  .subscribe();
