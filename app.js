
const FIELD = {
  id: "ID Bangunan",
  block: "Blok",
  function: "Fungsi Bangunan",
  functionClass: "Klasifikasi Fungsi",
  floors: "Jumlah Lantai",
  material: "Material Dominan",
  structure: "Sistem Stuktur Tampak",
  roof: "Tipe Atap",
  roofMaterial: "Material Penutup Atap",
  wall: "Dinding Luar",
  condition: "Kondisi Visual",
  confidence: "Tingkat Keyakinan",
  taxonomy: "TAKSONOMI",
  shortTaxonomy: "KODE SIGKAT",
  area: "LUAS_M2",
  coefficient: "Koefisien",
  exposure: "Nilai Exposure"
};

const functionColors = {
  "Hunian": "#17694f",
  "Perdagangan dan Jasa": "#d79a35",
  "Keagamaan": "#6c5ba7",
  "Pendidikan": "#397ca5",
  "Kesehatan": "#b64c55",
  "Peternakan": "#8b6f47",
  "Pergudangan": "#667985",
  "Perkantoran dan Pelayanan Umum": "#2d7f88",
  "Fasilitas Penunjang": "#9b704e",
  "Industri": "#8a4d67",
  "Utilitas": "#5f7e50",
  "Bangunan Kosong/Rusak": "#9a3c3c"
};

const fallbackPalette = [
  "#17694f","#d79a35","#6c5ba7","#397ca5",
  "#b64c55","#7b8580","#9b704e","#609784"
];

const conditionColors = {
  "Baik":"#24805c",
  "Sedang":"#d6a135",
  "Rusak Ringan":"#d97837",
  "Rusak Sedang":"#c84a3e",
  "Rusak Berat":"#8e3135"
};

let rawData = null;
let currentData = null;
let map = null;
let pointLayer = null;
let boundaryLayer = null;
let initialBounds = null;
let overlayControl = null;

let functionChart = null;
let exposureChart = null;
let exposureBarChart = null;

// --------------------------------
// UTILITIES
// --------------------------------
function safe(v){
  return (v === null || v === undefined || v === "") ? "-" : v;
}

function numberID(v,digits=0){
  return Number(v || 0).toLocaleString(
    "id-ID",
    {maximumFractionDigits:digits}
  );
}

function money(v){
  return new Intl.NumberFormat(
    "id-ID",
    {
      style:"currency",
      currency:"IDR",
      maximumFractionDigits:0
    }
  ).format(Number(v || 0));
}

function compactMoney(v){
  const n = Number(v || 0);
  if(n >= 1e12) return `Rp${numberID(n/1e12,2)} T`;
  if(n >= 1e9) return `Rp${numberID(n/1e9,2)} M`;
  if(n >= 1e6) return `Rp${numberID(n/1e6,2)} jt`;
  return money(n);
}

function unique(field,data=rawData){
  return [...new Set(
    (data?.features || [])
      .map(f => f.properties?.[field])
      .filter(v => v !== null && v !== undefined && v !== "")
      .map(String)
  )].sort((a,b)=>a.localeCompare(b,"id"));
}

function categoricalColor(field,value){
  if(field === FIELD.functionClass && functionColors[value]){
    return functionColors[value];
  }

  const values = unique(field);
  const i = Math.max(0,values.indexOf(String(value)));
  return fallbackPalette[i % fallbackPalette.length];
}

function sumField(data,field){
  return (data.features || []).reduce(
    (sum,f)=>sum + Number(f.properties?.[field] || 0),
    0
  );
}

// --------------------------------
// PAGE NAVIGATION
// --------------------------------
function showPage(page){
  const dashboard = document.getElementById("dashboardPage");
  const mapPage = document.getElementById("mapPage");
  const navDashboard = document.getElementById("navDashboard");
  const navMap = document.getElementById("navMap");

  dashboard.classList.toggle("active",page==="dashboard");
  mapPage.classList.toggle("active",page==="map");
  navDashboard.classList.toggle("active",page==="dashboard");
  navMap.classList.toggle("active",page==="map");

  if(page==="map"){
    initMap();
    setTimeout(()=>map.invalidateSize(),150);
  }
}

// --------------------------------
// DASHBOARD SUMMARY
// --------------------------------
function renderSummary(){
  const total = rawData.features.length;
  const totalExposure = sumField(rawData,FIELD.exposure);
  const totalArea = sumField(rawData,FIELD.area);
  const avgExposure = total ? totalExposure/total : 0;

  document.getElementById("heroCount").textContent = numberID(total);
  document.getElementById("dashTotal").textContent = numberID(total);
  document.getElementById("dashExposure").textContent = compactMoney(totalExposure);
  document.getElementById("dashAvgExposure").textContent = compactMoney(avgExposure);
  document.getElementById("dashArea").textContent = `${numberID(totalArea,0)} m²`;
}

function getFunctionStats(){
  const stats = {};

  rawData.features.forEach(f=>{
    const p=f.properties || {};
    const category = safe(p[FIELD.functionClass]);

    if(!stats[category]){
      stats[category] = {
        count:0,
        exposure:0
      };
    }

    stats[category].count += 1;
    stats[category].exposure += Number(
      p[FIELD.exposure] || 0
    );
  });

  return stats;
}

function renderFunctionCards(){
  const stats = getFunctionStats();
  const total = rawData.features.length;
  const container = document.getElementById("functionCards");

  const preferredOrder = [
    "Hunian",
    "Perdagangan dan Jasa",
    "Keagamaan",
    "Pendidikan",
    "Kesehatan",
    "Peternakan",
    "Pergudangan",
    "Perkantoran dan Pelayanan Umum",
    "Fasilitas Penunjang",
    "Industri",
    "Utilitas",
    "Bangunan Kosong/Rusak"
  ];

  const categories = [
    ...preferredOrder.filter(c=>stats[c]),
    ...Object.keys(stats).filter(c=>!preferredOrder.includes(c))
  ];

  container.innerHTML = categories.map((category,index)=>{
    const s = stats[category];
    const pct = total ? s.count/total*100 : 0;
    const color = functionColors[category] || fallbackPalette[index%fallbackPalette.length];

    return `
      <button class="function-card" data-category="${category}">
        <div class="function-card-top">
          <div style="display:flex;align-items:center;gap:9px">
            <span class="function-dot" style="background:${color}"></span>
            <h4>${category}</h4>
          </div>
          <strong>${numberID(s.count)}</strong>
        </div>
        <p>${pct.toFixed(1)}% dari seluruh bangunan • ${compactMoney(s.exposure)} exposure</p>
      </button>
    `;
  }).join("");

  container.querySelectorAll(".function-card").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const category = btn.dataset.category;
      showPage("map");
      document.getElementById("filterFunction").value = category;
      applyFilters();
    });
  });
}

// --------------------------------
// DASHBOARD CHARTS
// --------------------------------
function renderCharts(){
  const stats = getFunctionStats();

  const labels = Object.keys(stats);
  const counts = labels.map(l=>stats[l].count);
  const exposures = labels.map(l=>stats[l].exposure);
  const colors = labels.map(
    (l,i)=>functionColors[l] || fallbackPalette[i%fallbackPalette.length]
  );

  const totalCount = counts.reduce((a,b)=>a+b,0);
  const totalExposure = exposures.reduce((a,b)=>a+b,0);

  if(functionChart) functionChart.destroy();
  if(exposureChart) exposureChart.destroy();
  if(exposureBarChart) exposureBarChart.destroy();

  functionChart = new Chart(
    document.getElementById("functionChart"),
    {
      type:"doughnut",
      data:{
        labels,
        datasets:[{
          data:counts,
          backgroundColor:colors,
          borderWidth:0
        }]
      },
      options:{
        responsive:true,
        maintainAspectRatio:false,
        cutout:"65%",
        plugins:{
          legend:{
            position:"bottom",
            labels:{usePointStyle:true,boxWidth:8,font:{size:10}}
          },
          tooltip:{
            callbacks:{
              label:(ctx)=>{
                const pct = totalCount ? ctx.raw/totalCount*100 : 0;
                return ` ${ctx.label}: ${ctx.raw} (${pct.toFixed(1)}%)`;
              }
            }
          }
        }
      }
    }
  );

  exposureChart = new Chart(
    document.getElementById("exposureChart"),
    {
      type:"doughnut",
      data:{
        labels,
        datasets:[{
          data:exposures,
          backgroundColor:colors,
          borderWidth:0
        }]
      },
      options:{
        responsive:true,
        maintainAspectRatio:false,
        cutout:"65%",
        plugins:{
          legend:{
            position:"bottom",
            labels:{usePointStyle:true,boxWidth:8,font:{size:10}}
          },
          tooltip:{
            callbacks:{
              label:(ctx)=>{
                const pct = totalExposure ? ctx.raw/totalExposure*100 : 0;
                return ` ${ctx.label}: ${compactMoney(ctx.raw)} (${pct.toFixed(1)}%)`;
              }
            }
          }
        }
      }
    }
  );

  exposureBarChart = new Chart(
    document.getElementById("exposureBarChart"),
    {
      type:"bar",
      data:{
        labels,
        datasets:[{
          label:"Total Exposure",
          data:exposures,
          backgroundColor:colors,
          borderWidth:0,
          borderRadius:8
        }]
      },
      options:{
        responsive:true,
        maintainAspectRatio:false,
        plugins:{
          legend:{display:false},
          tooltip:{
            callbacks:{
              label:(ctx)=>` ${compactMoney(ctx.raw)}`
            }
          }
        },
        scales:{
          x:{
            grid:{display:false},
            ticks:{font:{size:9}}
          },
          y:{
            ticks:{
              callback:(value)=>compactMoney(value),
              font:{size:9}
            }
          }
        }
      }
    }
  );
}

// --------------------------------
// MAP
// --------------------------------
function initMap(){
  if(map) {
    setTimeout(()=>map.invalidateSize(),150);
    return;
  }

  map = L.map("map",{
    preferCanvas:true
  });

  // FALLBACK VIEW: peta tetap tampil walaupun GeoJSON gagal dimuat.
  // Lokasi awal sekitar Desa Sidodadi / area survei.
  map.setView([-5.552, 105.238], 15);

  const osm = L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom:21,
      attribution:"© OpenStreetMap contributors"
    }
  );

  const satellite = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {
      maxZoom:21,
      attribution:"Tiles © Esri"
    }
  );

  // OSM dijadikan default agar basemap paling stabil di GitHub Pages
  osm.addTo(map);

  overlayControl = L.control.layers(
    {
      "OpenStreetMap":osm,
      "Citra Satelit":satellite
    },
    {},
    {collapsed:false}
  ).addTo(map);

  // Jika data titik sudah berhasil dibaca, tampilkan.
  if(currentData && currentData.features && currentData.features.length){
    renderPointLayer(currentData,true);
  } else if(rawData && rawData.features && rawData.features.length){
    renderPointLayer(rawData,true);
  } else {
    console.warn("Data titik belum tersedia saat map diinisialisasi.");
  }

  // Muat AOI secara terpisah.
  tryLoadBoundary();

  setTimeout(()=>map.invalidateSize(),250);
}
function exposureClass(value){
  const values = (rawData.features || [])
    .map(f=>Number(f.properties?.[FIELD.exposure]))
    .filter(Number.isFinite)
    .sort((a,b)=>a-b);

  if(!values.length){
    return {label:"Tidak ada data",color:"#8b9691"};
  }

  const q = p=>values[Math.floor((values.length-1)*p)];
  const q1=q(.25),q2=q(.50),q3=q(.75);
  const n=Number(value||0);

  if(n<=q1) return {label:"Rendah",color:"#dcefe6"};
  if(n<=q2) return {label:"Sedang",color:"#97cbb2"};
  if(n<=q3) return {label:"Tinggi",color:"#4e9a73"};
  return {label:"Sangat Tinggi",color:"#145d43"};
}

function markerColor(p){
  const mode = document.getElementById("mapMode").value;

  if(mode==="function"){
    return categoricalColor(
      FIELD.functionClass,
      p[FIELD.functionClass]
    );
  }

  if(mode==="taxonomy"){
    return categoricalColor(
      FIELD.shortTaxonomy,
      p[FIELD.shortTaxonomy] || p[FIELD.taxonomy]
    );
  }

  if(mode==="condition"){
    return conditionColors[p[FIELD.condition]] || "#7b8580";
  }

  return exposureClass(
    p[FIELD.exposure]
  ).color;
}

function pointToLayer(feature,latlng){
  const p=feature.properties || {};

  return L.circleMarker(
    latlng,
    {
      radius:7,
      weight:1.4,
      color:"#fff",
      fillColor:markerColor(p),
      fillOpacity:.94
    }
  );
}

function popupHTML(feature){
  const p=feature.properties || {};

  return `
    <div class="popup-title">${safe(p[FIELD.id])}</div>
    <span class="popup-tag">${safe(p[FIELD.functionClass])}</span>

    <div class="popup-grid">
      <div class="key">Blok</div>
      <div>${safe(p[FIELD.block])}</div>

      <div class="key">Fungsi</div>
      <div>${safe(p[FIELD.function])}</div>

      <div class="key">Jumlah lantai</div>
      <div>${safe(p[FIELD.floors])}</div>

      <div class="key">Material</div>
      <div>${safe(p[FIELD.material])}</div>

      <div class="key">Struktur</div>
      <div>${safe(p[FIELD.structure])}</div>

      <div class="key">Tipe atap</div>
      <div>${safe(p[FIELD.roof])}</div>

      <div class="key">Dinding luar</div>
      <div>${safe(p[FIELD.wall])}</div>

      <div class="key">Kondisi</div>
      <div>${safe(p[FIELD.condition])}</div>

      <div class="key">Taksonomi</div>
      <div>${safe(p[FIELD.taxonomy])}</div>

      <div class="key">Kode singkat</div>
      <div>${safe(p[FIELD.shortTaxonomy])}</div>

      <div class="key">Luas</div>
      <div>${numberID(p[FIELD.area],2)} m²</div>

      <div class="key">Exposure</div>
      <div><b>${money(p[FIELD.exposure])}</b></div>
    </div>
  `;
}

function renderPointLayer(data,fit=false){
  if(!map) return;

  if(pointLayer){
    map.removeLayer(pointLayer);
  }

  pointLayer = L.geoJSON(
    data,
    {
      pointToLayer,
      onEachFeature:(feature,layer)=>{
        layer.bindPopup(
          popupHTML(feature),
          {maxWidth:350}
        );

        layer.on({
          mouseover:e=>{
            e.target.setStyle({
              radius:10,
              weight:2,
              color:"#17211d"
            });
          },
          mouseout:e=>{
            pointLayer.resetStyle(e.target);
          }
        });
      }
    }
  ).addTo(map);

  if(fit && pointLayer.getBounds().isValid()){
    initialBounds = pointLayer.getBounds();
    map.fitBounds(
      initialBounds,
      {padding:[25,25]}
    );
  }

  updateMapStats(data);
  updateLegend();
}

async function tryLoadBoundary(){
  const status = document.getElementById("boundaryStatus");

  try{
    const r = await fetch(
      "./data/batas_wilayah.geojson",
      {cache:"no-store"}
    );

    if(!r.ok){
      throw new Error(
        `AOI HTTP ${r.status}: data/batas_wilayah.geojson`
      );
    }

    const gj = await r.json();

    if(boundaryLayer){
      map.removeLayer(boundaryLayer);
    }

    boundaryLayer = L.geoJSON(
      gj,
      {
        style:{
          color:"#f4c542",
          weight:4,
          opacity:1,
          fillColor:"#f4c542",
          fillOpacity:.06,
          dashArray:"8 5"
        }
      }
    ).addTo(map);

    if(boundaryLayer.bringToBack){
      boundaryLayer.bringToBack();
    }

    if(overlayControl){
      overlayControl.addOverlay(
        boundaryLayer,
        "Batas Wilayah / AOI"
      );
    }

    if(boundaryLayer.getBounds().isValid()){
      initialBounds = boundaryLayer.getBounds();

      map.fitBounds(
        initialBounds,
        {
          padding:[25,25],
          maxZoom:18
        }
      );
    }

    if(status){
      status.textContent="AOI aktif";
      status.classList.add("ok");
    }

    console.log("AOI berhasil dimuat.");

  }catch(err){
    console.error("AOI gagal dimuat:",err);

    if(status){
      status.textContent="AOI gagal dimuat";
    }
  }
}
function updateMapStats(data){
  const total=data.features.length;
  const exposure=sumField(data,FIELD.exposure);

  document.getElementById("mapTotal").textContent=numberID(total);
  document.getElementById("mapExposure").textContent=compactMoney(exposure);
}

function fillSelect(id,field,label){
  const el=document.getElementById(id);

  el.innerHTML=
    `<option value="">${label}</option>`+
    unique(field).map(
      v=>`<option value="${v}">${v}</option>`
    ).join("");
}

function updateLegend(){
  const el=document.getElementById("legend");
  const mode=document.getElementById("mapMode").value;

  if(mode==="function"){
    const vals=unique(FIELD.functionClass);

    el.innerHTML=
      "<b>Klasifikasi Fungsi</b>"+
      vals.map((v,i)=>{
        const c=functionColors[v] || fallbackPalette[i%fallbackPalette.length];
        return `
          <div class="legend-row">
            <span class="legend-dot" style="background:${c}"></span>
            <span>${v}</span>
          </div>`;
      }).join("");
    return;
  }

  if(mode==="condition"){
    el.innerHTML=
      "<b>Kondisi Visual</b>"+
      Object.entries(conditionColors).map(
        ([v,c])=>`
          <div class="legend-row">
            <span class="legend-dot" style="background:${c}"></span>
            <span>${v}</span>
          </div>`
      ).join("");
    return;
  }

  if(mode==="exposure"){
    const cls=[
      ["Rendah","#dcefe6"],
      ["Sedang","#97cbb2"],
      ["Tinggi","#4e9a73"],
      ["Sangat Tinggi","#145d43"]
    ];

    el.innerHTML=
      "<b>Kelas Exposure</b>"+
      cls.map(
        ([v,c])=>`
          <div class="legend-row">
            <span class="legend-dot" style="background:${c}"></span>
            <span>${v}</span>
          </div>`
      ).join("");
    return;
  }

  const vals=unique(FIELD.shortTaxonomy);

  el.innerHTML=
    "<b>Taksonomi</b>"+
    vals.map(
      (v,i)=>`
        <div class="legend-row">
          <span class="legend-dot" style="background:${fallbackPalette[i%fallbackPalette.length]}"></span>
          <span>${v}</span>
        </div>`
    ).join("");
}

function applyFilters(){
  const query=document.getElementById("searchId").value.trim().toLowerCase();
  const block=document.getElementById("filterBlock").value;
  const fn=document.getElementById("filterFunction").value;
  const cond=document.getElementById("filterCondition").value;

  currentData={
    type:"FeatureCollection",
    features:rawData.features.filter(f=>{
      const p=f.properties || {};

      return (
        (!query || String(p[FIELD.id] || "").toLowerCase().includes(query))
        &&
        (!block || String(p[FIELD.block])===block)
        &&
        (!fn || String(p[FIELD.functionClass])===fn)
        &&
        (!cond || String(p[FIELD.condition])===cond)
      );
    })
  };

  renderPointLayer(currentData,false);
}

function resetFilters(){
  document.getElementById("searchId").value="";
  document.getElementById("filterBlock").value="";
  document.getElementById("filterFunction").value="";
  document.getElementById("filterCondition").value="";

  currentData=rawData;
  renderPointLayer(rawData,false);

  if(initialBounds){
    map.fitBounds(initialBounds,{padding:[25,25]});
  }
}

// --------------------------------
// INIT
// --------------------------------
async function loadData(){
  const response = await fetch(
    "./data/bangunan_points.geojson",
    {cache:"no-store"}
  );

  if(!response.ok){
    throw new Error(
      `Data titik HTTP ${response.status}: data/bangunan_points.geojson`
    );
  }

  rawData = await response.json();
  currentData = rawData;

  console.log(
    "Jumlah titik GeoJSON:",
    rawData?.features?.length || 0
  );

  renderSummary();
  renderFunctionCards();

  // Chart tidak boleh membuat seluruh aplikasi berhenti
  // bila CDN Chart.js sedang gagal.
  try{
    if(typeof Chart !== "undefined"){
      renderCharts();
    }else{
      console.warn("Chart.js belum tersedia.");
    }
  }catch(chartErr){
    console.error("Diagram gagal dibuat:",chartErr);
  }

  fillSelect(
    "filterBlock",
    FIELD.block,
    "Semua blok"
  );

  fillSelect(
    "filterFunction",
    FIELD.functionClass,
    "Semua fungsi"
  );

  fillSelect(
    "filterCondition",
    FIELD.condition,
    "Semua kondisi"
  );

  // Jika user sudah berada di halaman peta,
  // refresh layer setelah data selesai dibaca.
  if(map){
    renderPointLayer(rawData,true);
    setTimeout(()=>map.invalidateSize(),150);
  }
}
// NAV
document.getElementById("navDashboard").addEventListener(
  "click",
  ()=>showPage("dashboard")
);

document.getElementById("navMap").addEventListener(
  "click",
  ()=>showPage("map")
);

document.getElementById("openMapBtn").addEventListener(
  "click",
  ()=>showPage("map")
);

// MAP CONTROLS
document.getElementById("applyFilter").addEventListener(
  "click",
  applyFilters
);

document.getElementById("resetFilter").addEventListener(
  "click",
  resetFilters
);

document.getElementById("searchId").addEventListener(
  "keydown",
  e=>{
    if(e.key==="Enter"){
      applyFilters();
    }
  }
);

document.getElementById("mapMode").addEventListener(
  "change",
  ()=>{
    renderPointLayer(
      currentData || rawData,
      false
    );
  }
);

document.getElementById("mapHome").addEventListener(
  "click",
  ()=>{
    if(initialBounds){
      map.fitBounds(
        initialBounds,
        {padding:[25,25]}
      );
    }
  }
);

document.getElementById("mapFullscreen").addEventListener(
  "click",
  async()=>{
    if(!document.fullscreenElement){
      await document.documentElement.requestFullscreen();
    }else{
      await document.exitFullscreen();
    }

    setTimeout(
      ()=>map.invalidateSize(),
      200
    );
  }
);

loadData().catch(err=>{
  console.error(err);
  alert(
    "Data WebGIS gagal dimuat. Cek apakah data/bangunan_points.geojson sudah ada di GitHub. Detail error ada di Console browser."
  );
});

/* =========================================================
   TAXONOMY BROWSER
   Building Taxonomy Viewer
========================================================= */


/* =========================================================
   1. DEFINISI KOMPONEN TAXONOMY
========================================================= */

const taxonomyDefinitions = {

  /* -------------------------------------------------------
     MATERIAL / TIPE STRUKTUR UTAMA
  ------------------------------------------------------- */

  material: {

    CR: {
      name: "Reinforced Concrete",
      indonesia: "Beton Bertulang",

      description:
        "CR menunjukkan bangunan yang menggunakan beton bertulang " +
        "sebagai material utama sistem struktur. Beton bertulang merupakan " +
        "kombinasi beton dan tulangan baja yang bekerja bersama untuk " +
        "menahan gaya tekan, tarik, serta gaya akibat beban lateral seperti gempa."
    },


    MCF: {
      name: "Confined Masonry",
      indonesia: "Pasangan Bata Terkekang",

      description:
        "MCF menunjukkan konstruksi confined masonry atau pasangan bata terkekang. " +
        "Pada sistem ini dinding pasangan bata dibangun terlebih dahulu, kemudian " +
        "dilengkapi elemen beton bertulang vertikal dan horizontal berupa kolom " +
        "praktis dan balok pengikat. Elemen beton tersebut berfungsi mengikat " +
        "dan mengonfinemen panel dinding pasangan bata."
    },


    MUR: {
      name: "Unreinforced Masonry",
      indonesia: "Pasangan Bata Tanpa Perkuatan",

      description:
        "MUR menunjukkan konstruksi pasangan bata atau masonry tanpa sistem " +
        "perkuatan struktural yang memadai. Dinding masonry menjadi elemen utama " +
        "bangunan, tetapi tidak memiliki tulangan atau elemen pengikat struktural " +
        "yang dirancang khusus untuk meningkatkan ketahanan terhadap beban lateral."
    },


    MIX: {
      name: "Mixed Material",
      indonesia: "Material Campuran",

      description:
        "MIX pada WebGIS penelitian ini menunjukkan bangunan dengan material " +
        "dominan campuran, yaitu bangunan yang karakteristik material utamanya " +
        "tidak dapat direpresentasikan hanya oleh satu kelompok material. " +
        "Kode MIX pada bagian ini merupakan kode operasional pada dataset " +
        "penelitian dan digunakan untuk merepresentasikan kategori material campuran."
    },


    S: {
      name: "Steel",
      indonesia: "Baja",

      description:
        "S menunjukkan bangunan yang menggunakan baja sebagai material struktural " +
        "utama. Elemen baja dapat berupa kolom, balok, rangka, atau komponen lain " +
        "yang berperan dalam menahan beban gravitasi maupun gaya lateral."
    },


    W: {
      name: "Wood",
      indonesia: "Kayu",

      description:
        "W menunjukkan bangunan dengan kayu sebagai material struktural utama. " +
        "Konstruksi kayu dapat terdiri atas kolom, balok, rangka ringan, " +
        "atau elemen dinding kayu yang bekerja sebagai bagian dari sistem struktur."
    }

  },


  /* -------------------------------------------------------
     SISTEM PENAHAN BEBAN LATERAL
  ------------------------------------------------------- */

  system: {

    LFINF: {
      name: "Infilled Frame",
      indonesia: "Rangka dengan Dinding Pengisi",

      description:
        "LFINF menunjukkan sistem rangka yang terdiri atas balok dan kolom " +
        "dengan bidang rangka yang diisi oleh dinding, umumnya dinding pasangan bata. " +
        "Dinding pengisi dapat memengaruhi kekakuan dan respons lateral rangka " +
        "ketika bangunan menerima beban gempa."
    },


    LFM: {
      name: "Moment Frame",
      indonesia: "Rangka Pemikul Momen",

      description:
        "LFM menunjukkan sistem rangka pemikul momen yang terdiri atas balok " +
        "dan kolom dengan sambungan yang mampu meneruskan momen. Sistem ini " +
        "menahan gaya lateral terutama melalui aksi lentur pada balok dan kolom " +
        "serta kekakuan sambungan antar elemen."
    },


    LPB: {
      name: "Post and Beam",
      indonesia: "Sistem Tiang dan Balok",

      description:
        "LPB menunjukkan sistem post and beam atau tiang dan balok. " +
        "Bangunan tersusun dari elemen vertikal berupa tiang atau kolom dan " +
        "elemen horizontal berupa balok. Stabilitas lateral dapat dibantu oleh " +
        "pengaku, dinding, sambungan, atau mekanisme struktural lainnya."
    },


    LWAL: {
      name: "Wall",
      indonesia: "Sistem Dinding Pemikul",

      description:
        "LWAL menunjukkan sistem struktur yang mengandalkan dinding sebagai " +
        "elemen utama penahan gaya lateral. Dinding memberikan kekakuan dan " +
        "stabilitas bangunan terhadap gaya horizontal, termasuk gaya akibat gempa."
    }

  },


  /* -------------------------------------------------------
     JUMLAH LANTAI
  ------------------------------------------------------- */

  height: {

    HEX1: {
      name: "Exact Height: 1 Storey",
      indonesia: "Tepat 1 Lantai",

      description:
        "HEX:1 menunjukkan bahwa bangunan memiliki tepat satu lantai " +
        "di atas permukaan tanah."
    },


    HEX2: {
      name: "Exact Height: 2 Storeys",
      indonesia: "Tepat 2 Lantai",

      description:
        "HEX:2 menunjukkan bahwa bangunan memiliki tepat dua lantai " +
        "di atas permukaan tanah."
    }

  }

};



/* =========================================================
   2. DAFTAR TAXONOMY YANG TERDAPAT PADA DATA
========================================================= */

const taxonomyItems = [

  /* CR */
  "CR \\LFINF\\HEX:1",
  "CR \\LFINF\\HEX:2",
  "CR \\LFM\\HEX:1",
  "CR \\LWAL\\HEX:1",

  /* MCF */
  "MCF \\LFINF\\HEX:1",
  "MCF \\LFINF\\HEX:2",
  "MCF \\LFM\\HEX:1",
  "MCF \\LWAL\\HEX:1",
  "MCF \\LWAL\\HEX:2",

  /* MIX */
  "MIX \\LFINF\\HEX:1",
  "MIX \\LFM\\HEX:1",
  "MIX \\LFM\\HEX:2",
  "MIX \\LPB\\HEX:1",
  "MIX \\LWAL\\HEX:1",

  /* MUR */
  "MUR \\LFINF\\HEX:1",
  "MUR \\LFM\\HEX:1",
  "MUR \\LPB\\HEX:1",
  "MUR \\LWAL\\HEX:1",
  "MUR \\LWAL\\HEX:2",

  /* STEEL */
  "S \\LFM\\HEX:1",

  /* WOOD */
  "W \\LFM\\HEX:1",
  "W \\LPB\\HEX:1",
  "W \\LPB\\HEX:2",
  "W \\LWAL\\HEX:1"

];



/* =========================================================
   3. MEMECAH KODE TAXONOMY
========================================================= */

function parseTaxonomyCode(code){

  /*
    Contoh input:

    MCF \LFINF\HEX:1

    hasil:

    material = MCF
    system   = LFINF
    height   = HEX1
  */

  const cleanCode = code
    .replace(/\s+/g, " ")
    .trim();


  const parts = cleanCode
    .split("\\")
    .map(part => part.trim());


  const material =
    parts[0] || "";


  const system =
    parts[1] || "";


  const heightRaw =
    parts[2] || "";


  const height =
    heightRaw
      .replace(":", "")
      .trim();


  return {
    material,
    system,
    height
  };

}



/* =========================================================
   4. MEMBUAT NAMA FILE GAMBAR OTOMATIS
========================================================= */

function taxonomyFileBase(code){

  /*
    Contoh:

    MCF \LFINF\HEX:1

    menjadi:

    MCF LFINFHEX1

    sehingga akan mencari:

    assets/taxonomy/MCF LFINFHEX1.jpg
  */

  return code
    .replace(/\\/g, "")
    .replace(/:/g, "")
    .replace(/\s+/g, " ")
    .trim();

}



/* =========================================================
   5. MENCARI FILE GAMBAR
========================================================= */

function findTaxonomyImage(code){

  const fileBase =
    taxonomyFileBase(code);


  const basePath =
    "assets/taxonomy/";


  /*
    Script mencoba beberapa format,
    sehingga gambar boleh JPG, PNG, JPEG, atau WEBP.
  */

  const extensions = [

    ".jpg",
    ".JPG",

    ".png",
    ".PNG",

    ".jpeg",
    ".JPEG",

    ".webp",
    ".WEBP"

  ];


  return new Promise((resolve) => {

    let index = 0;


    function tryImage(){

      if(index >= extensions.length){

        resolve(null);

        return;

      }


      const path =
        basePath +
        fileBase +
        extensions[index];


      index++;


      const img =
        new Image();


      img.onload = () => {

        resolve(path);

      };


      img.onerror = () => {

        tryImage();

      };


      img.src =
        encodeURI(path);

    }


    tryImage();

  });

}



/* =========================================================
   6. MEMBUAT PENJELASAN SINGKAT KOMBINASI
========================================================= */

function buildTaxonomySummary(parts){

  const material =
    taxonomyDefinitions
      .material[
        parts.material
      ];


  const system =
    taxonomyDefinitions
      .system[
        parts.system
      ];


  const height =
    taxonomyDefinitions
      .height[
        parts.height
      ];


  if(
    !material ||
    !system ||
    !height
  ){

    return (
      "Informasi komponen taxonomy belum tersedia."
    );

  }


  return `

    Bangunan ini diklasifikasikan sebagai

    <strong>
      ${material.indonesia}
    </strong>

    dengan sistem struktur

    <strong>
      ${system.indonesia}
    </strong>

    dan memiliki

    <strong>
      ${height.indonesia}
    </strong>.

  `;

}



/* =========================================================
   7. MEMBUAT DETAIL KOMPONEN KODE
========================================================= */

function buildTaxonomyBreakdown(parts){

  const container =
    document.getElementById(
      "taxonomyBreakdown"
    );


  if(!container){
    return;
  }


  const material =
    taxonomyDefinitions
      .material[
        parts.material
      ];


  const system =
    taxonomyDefinitions
      .system[
        parts.system
      ];


  const height =
    taxonomyDefinitions
      .height[
        parts.height
      ];


  container.innerHTML = `


    <!-- MATERIAL -->

    <div class="taxonomy-breakdown-item">

      <div class="taxonomy-component-head">

        <strong>
          ${parts.material}
        </strong>

        <span class="taxonomy-component-type">
          Material Struktur
        </span>

      </div>


      <h5>
        ${material.indonesia}
      </h5>


      <small>
        ${material.name}
      </small>


      <p>
        ${material.description}
      </p>

    </div>



    <!-- SISTEM STRUKTUR -->

    <div class="taxonomy-breakdown-item">

      <div class="taxonomy-component-head">

        <strong>
          ${parts.system}
        </strong>

        <span class="taxonomy-component-type">
          Sistem Penahan Lateral
        </span>

      </div>


      <h5>
        ${system.indonesia}
      </h5>


      <small>
        ${system.name}
      </small>


      <p>
        ${system.description}
      </p>

    </div>



    <!-- JUMLAH LANTAI -->

    <div class="taxonomy-breakdown-item">

      <div class="taxonomy-component-head">

        <strong>
          ${parts.height.replace(
            "HEX",
            "HEX:"
          )}
        </strong>

        <span class="taxonomy-component-type">
          Jumlah Lantai
        </span>

      </div>


      <h5>
        ${height.indonesia}
      </h5>


      <small>
        ${height.name}
      </small>


      <p>
        ${height.description}
      </p>

    </div>

  `;

}



/* =========================================================
   8. UPDATE TAMPILAN TAXONOMY
========================================================= */

async function updateTaxonomyViewer(
  selectedCode
){

  const badge =
    document.getElementById(
      "taxonomyCodeBadge"
    );


  const title =
    document.getElementById(
      "taxonomyCodeTitle"
    );


  const intro =
    document.getElementById(
      "taxonomyCodeIntro"
    );


  const image =
    document.getElementById(
      "taxonomyPreviewImage"
    );


  const placeholder =
    document.getElementById(
      "taxonomyPlaceholder"
    );


  const caption =
    document.getElementById(
      "taxonomyImageCaption"
    );


  const breakdown =
    document.getElementById(
      "taxonomyBreakdown"
    );


  /*
    Bila HTML taxonomy belum tersedia,
    jangan lanjutkan.
  */

  if(
    !badge ||
    !title ||
    !intro ||
    !image ||
    !placeholder ||
    !caption ||
    !breakdown
  ){

    return;

  }



  /* -------------------------------------------------------
     BELUM MEMILIH TAXONOMY
  ------------------------------------------------------- */

  if(!selectedCode){

    badge.textContent =
      "Belum dipilih";


    title.textContent =
      "Silakan pilih salah satu kode taksonomi";


    intro.textContent =
      "Pilih salah satu jenis taksonomi untuk melihat " +
      "arti kode, karakteristik struktur, jumlah lantai, " +
      "dan contoh gambar bangunannya.";


    breakdown.innerHTML = `

      <div class="taxonomy-breakdown-empty">

        Informasi komponen kode akan ditampilkan
        setelah taxonomy dipilih.

      </div>

    `;


    image.style.display =
      "none";


    image.removeAttribute(
      "src"
    );


    placeholder.style.display =
      "flex";


    caption.textContent =
      "Belum ada taxonomy yang dipilih.";


    return;

  }



  /* -------------------------------------------------------
     TAXONOMY DIPILIH
  ------------------------------------------------------- */

  const parts =
    parseTaxonomyCode(
      selectedCode
    );


  badge.textContent =
    selectedCode;


  title.textContent =
    selectedCode;


  intro.innerHTML =
    buildTaxonomySummary(
      parts
    );


  buildTaxonomyBreakdown(
    parts
  );



  /* -------------------------------------------------------
     CARI GAMBAR
  ------------------------------------------------------- */

  placeholder.innerHTML =
    "<span>Memuat gambar...</span>";


  placeholder.style.display =
    "flex";


  image.style.display =
    "none";


  const imagePath =
    await findTaxonomyImage(
      selectedCode
    );



  /* -------------------------------------------------------
     GAMBAR DITEMUKAN
  ------------------------------------------------------- */

  if(imagePath){

    image.src =
      encodeURI(
        imagePath
      );


    image.style.display =
      "block";


    placeholder.style.display =
      "none";


    caption.innerHTML = `

      Contoh visual bangunan dengan kode

      <strong>
        ${selectedCode}
      </strong>.

    `;

  }


  /* -------------------------------------------------------
     GAMBAR TIDAK DITEMUKAN
  ------------------------------------------------------- */

  else{

    image.style.display =
      "none";


    image.removeAttribute(
      "src"
    );


    placeholder.innerHTML = `

      <div>

        <strong>
          Contoh Gambar
        </strong>

        <small>
          Gambar ${selectedCode}
          belum ditemukan
        </small>

      </div>

    `;


    placeholder.style.display =
      "flex";


    caption.textContent =
      "Periksa nama file gambar di folder assets/taxonomy.";

  }

}



/* =========================================================
   9. MEMBUAT DROPDOWN TAXONOMY
========================================================= */

function initTaxonomyViewer(){

  const select =
    document.getElementById(
      "taxonomySelect"
    );


  if(!select){

    return;

  }



  /*
    Kosongkan dahulu supaya tidak duplikat
    jika function terpanggil lebih dari sekali.
  */

  select.innerHTML = `

    <option value="">

      -- Pilih kode taksonomi --

    </option>

  `;



  /*
    Isi seluruh taxonomy.
  */

  taxonomyItems.forEach(
    code => {

      const option =
        document.createElement(
          "option"
        );


      option.value =
        code;


      option.textContent =
        code;


      select.appendChild(
        option
      );

    }
  );



  /*
    Ketika user memilih taxonomy.
  */

  select.addEventListener(
    "change",
    event => {

      updateTaxonomyViewer(
        event.target.value
      );

    }
  );



  /*
    Kondisi awal.
  */

  updateTaxonomyViewer(
    ""
  );

}



/* =========================================================
   10. JALANKAN SETELAH HTML SIAP
========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  initTaxonomyViewer
);