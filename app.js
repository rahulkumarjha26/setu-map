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
