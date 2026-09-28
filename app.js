
const F = {
  id: "ID Bangunan",
  block: "Blok",
  function: "Fungsi Bangunan",
  classFunction: "Klasifikasi 6 Kategori",
  floors: "Jumlah Lantai",
  material: "Material Dominan",
  structure: "Sistem Stuktur Tampak",
  roof: "Tipe Atap",
  roofMaterial: "Material Penutup Atap",
  wall: "Dinding Luar",
  condition: "Kondisi Visual",
  confidence: "Tingkat Keyakinan",
  taxonomy: "TAKSONOMI",
  shortCode: "KODE SIGKAT",
  area: "LUAS_M2",
  coefficient: "Koefisien",
  exposure: "N_Exp"
};

const map = L.map("map", {preferCanvas:true});

const satellite = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  {maxZoom:21, attribution:"Tiles © Esri"}
);

const osm = L.tileLayer(
  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  {maxZoom:21, attribution:"© OpenStreetMap contributors"}
);

satellite.addTo(map);
L.control.layers({"Citra Satelit": satellite, "OpenStreetMap": osm}).addTo(map);

let rawData = null;
let visibleData = null;
let pointLayer = null;
let initialBounds = null;

const palette = [
  "#0f6b4f","#2f8f6d","#71ae8f","#dca645","#d36b43",
  "#9e5160","#6652a3","#3c78a8","#7d8c42","#8f6d4f"
];

const conditionColors = {
  "Baik":"#2d8a5f",
  "Sedang":"#dba53b",
  "Rusak Ringan":"#da7b33",
  "Rusak Sedang":"#cf4c3e",
  "Rusak Berat":"#8f3035"
};

function val(p, key){
  const x = p?.[key];
  return (x === null || x === undefined || x === "") ? "-" : x;
}

function money(n){
  n = Number(n || 0);
  return new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(n);
}

function compactMoney(n){
  n = Number(n || 0);
  if(n >= 1e12) return `Rp${(n/1e12).toLocaleString("id-ID",{maximumFractionDigits:2})} T`;
  if(n >= 1e9) return `Rp${(n/1e9).toLocaleString("id-ID",{maximumFractionDigits:2})} M`;
  if(n >= 1e6) return `Rp${(n/1e6).toLocaleString("id-ID",{maximumFractionDigits:2})} jt`;
  return money(n);
}

function unique(field){
  return [...new Set(
    (rawData?.features || [])
      .map(f => f.properties?.[field])
      .filter(v => v !== null && v !== undefined && v !== "")
      .map(String)
  )].sort((a,b)=>a.localeCompare(b,"id"));
}

function catColor(field, value){
  const vals = unique(field);
  const i = Math.max(0, vals.indexOf(String(value ?? "-")));
  return palette[i % palette.length];
}

function exposureClass(value){
  const values = (rawData?.features || [])
    .map(f => Number(f.properties?.[F.exposure]))
    .filter(Number.isFinite)
    .sort((a,b)=>a-b);

  if(!values.length) return {label:"Tidak ada data", color:"#999"};

  const q = p => values[Math.floor((values.length - 1) * p)];
  const q1=q(.25), q2=q(.50), q3=q(.75);
  const n=Number(value||0);

  if(n<=q1) return {label:"Rendah",color:"#dcefe6"};
  if(n<=q2) return {label:"Sedang",color:"#91c8ad"};
  if(n<=q3) return {label:"Tinggi",color:"#4c9972"};
  return {label:"Sangat Tinggi",color:"#145e43"};
}

function markerColor(props){
  const mode = document.getElementById("mode").value;
  if(mode === "taxonomy") return catColor(F.shortCode, props[F.shortCode] || props[F.taxonomy]);
  if(mode === "function") return catColor(F.classFunction, props[F.classFunction] || props[F.function]);
  if(mode === "condition") return conditionColors[props[F.condition]] || "#78857f";
  return exposureClass(props[F.exposure]).color;
}

function pointToLayer(feature, latlng){
  const p = feature.properties || {};
  return L.circleMarker(latlng,{
    radius:7,
    weight:1.5,
    color:"#ffffff",
    fillColor:markerColor(p),
    fillOpacity:.92
  });
}

function popup(feature){
  const p = feature.properties || {};
  return `
    <div class="popup-title">${val(p,F.id)}</div>
    <div class="popup-grid">
      <span>Blok</span><b>${val(p,F.block)}</b>
      <span>Fungsi</span><b>${val(p,F.function)}</b>
      <span>Kelas fungsi</span><b>${val(p,F.classFunction)}</b>
      <span>Lantai</span><b>${val(p,F.floors)}</b>
      <span>Material</span><b>${val(p,F.material)}</b>
      <span>Struktur</span><b>${val(p,F.structure)}</b>
      <span>Tipe atap</span><b>${val(p,F.roof)}</b>
      <span>Dinding</span><b>${val(p,F.wall)}</b>
      <span>Kondisi</span><b>${val(p,F.condition)}</b>
      <span>Taksonomi</span><b>${val(p,F.taxonomy)}</b>
      <span>Kode singkat</span><b>${val(p,F.shortCode)}</b>
      <span>Luas</span><b>${Number(p[F.area]||0).toLocaleString("id-ID",{maximumFractionDigits:2})} m²</b>
      <span>Exposure</span><b>${money(p[F.exposure])}</b>
    </div>`;
}

function render(data, fit=false){
  if(pointLayer) map.removeLayer(pointLayer);

  pointLayer = L.geoJSON(data,{
    pointToLayer,
    onEachFeature:(feature,layer)=>{
      layer.bindPopup(popup(feature));
      layer.on("mouseover",e=>e.target.setStyle({radius:10,weight:2,color:"#17201d"}));
      layer.on("mouseout",e=>pointLayer.resetStyle(e.target));
    }
  }).addTo(map);

  if(fit && pointLayer.getBounds().isValid()){
    initialBounds = pointLayer.getBounds();
    map.fitBounds(initialBounds,{padding:[25,25]});
  }

  updateLegend();
}

function fillSelect(id, field, label){
  const el=document.getElementById(id);
  el.innerHTML=`<option value="">${label}</option>`+
    unique(field).map(v=>`<option value="${v}">${v}</option>`).join("");
}

function updateStats(data){
  const fs=data.features||[];
  const exp=fs.reduce((s,f)=>s+Number(f.properties?.[F.exposure]||0),0);
  const area=fs.reduce((s,f)=>s+Number(f.properties?.[F.area]||0),0);
  const floors=fs.map(f=>Number(f.properties?.[F.floors])).filter(Number.isFinite);
  const avg=floors.length?floors.reduce((a,b)=>a+b,0)/floors.length:0;

  document.getElementById("statTotal").textContent=fs.length.toLocaleString("id-ID");
  document.getElementById("statExposure").textContent=compactMoney(exp);
  document.getElementById("statArea").textContent=`${area.toLocaleString("id-ID",{maximumFractionDigits:0})} m²`;
  document.getElementById("statFloors").textContent=avg.toLocaleString("id-ID",{maximumFractionDigits:1});
}

function updateLegend(){
  const el=document.getElementById("legend");
  const mode=document.getElementById("mode").value;

  if(mode==="exposure"){
    const rows=[
      ["Rendah","#dcefe6"],["Sedang","#91c8ad"],
      ["Tinggi","#4c9972"],["Sangat Tinggi","#145e43"]
    ];
    el.innerHTML="<b>Exposure</b>"+rows.map(([n,c])=>`<div class="legend-row"><span class="swatch" style="background:${c}"></span>${n}</div>`).join("");
    return;
  }

  if(mode==="condition"){
    el.innerHTML="<b>Kondisi</b>"+Object.entries(conditionColors).map(([n,c])=>`<div class="legend-row"><span class="swatch" style="background:${c}"></span>${n}</div>`).join("");
    return;
  }

  const field = mode==="taxonomy" ? F.shortCode : F.classFunction;
  const title = mode==="taxonomy" ? "Taksonomi" : "Fungsi";
  el.innerHTML=`<b>${title}</b>`+unique(field).map(v=>`<div class="legend-row"><span class="swatch" style="background:${catColor(field,v)}"></span>${v}</div>`).join("");
}

function applyFilter(){
  const block=document.getElementById("filterBlock").value;
  const fn=document.getElementById("filterFunction").value;
  const cond=document.getElementById("filterCondition").value;
  const q=document.getElementById("searchId").value.trim().toLowerCase();

  visibleData={
    type:"FeatureCollection",
    features:rawData.features.filter(f=>{
      const p=f.properties||{};
      return (!block || String(p[F.block])===block)
        && (!fn || String(p[F.function])===fn)
        && (!cond || String(p[F.condition])===cond)
        && (!q || String(p[F.id]||"").toLowerCase().includes(q));
    })
  };

  render(visibleData);
  updateStats(visibleData);
}

async function load(){
  const r=await fetch("data/bangunan_points.geojson");
  rawData=await r.json();
  visibleData=rawData;

  fillSelect("filterBlock",F.block,"Semua blok");
  fillSelect("filterFunction",F.function,"Semua fungsi");
  fillSelect("filterCondition",F.condition,"Semua kondisi");

  render(rawData,true);
  updateStats(rawData);
}

document.getElementById("applyBtn").addEventListener("click",applyFilter);
document.getElementById("resetBtn").addEventListener("click",()=>{
  document.getElementById("filterBlock").value="";
  document.getElementById("filterFunction").value="";
  document.getElementById("filterCondition").value="";
  document.getElementById("searchId").value="";
  visibleData=rawData;
  render(rawData);
  updateStats(rawData);
  if(initialBounds) map.fitBounds(initialBounds,{padding:[25,25]});
});
document.getElementById("searchId").addEventListener("keydown",e=>{if(e.key==="Enter")applyFilter()});
document.getElementById("mode").addEventListener("change",()=>render(visibleData));
document.getElementById("homeBtn").addEventListener("click",()=>{if(initialBounds)map.fitBounds(initialBounds,{padding:[25,25]})});
document.getElementById("fullscreenBtn").addEventListener("click",async()=>{
  if(!document.fullscreenElement) await document.documentElement.requestFullscreen();
  else await document.exitFullscreen();
  setTimeout(()=>map.invalidateSize(),200);
});

load().catch(err=>{
  console.error(err);
  alert("GeoJSON gagal dimuat. Jalankan lewat Live Server, bukan double-click index.html.");
});
