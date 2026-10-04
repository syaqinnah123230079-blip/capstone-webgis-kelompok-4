
const FIELD = {
  id: "ID Bangunan",
  block: "Blok",
  function: "Fungsi Bangunan",
  functionClass: "Klasifikasi 6 Kategori",
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
  exposure: "N_Exp"
};

const functionColors = {
  "Hunian": "#17694f",
  "Perdagangan dan Jasa": "#d79a35",
  "Keagamaan": "#6c5ba7",
  "Pendidikan": "#397ca5",
  "Kesehatan": "#b64c55",
  "Bangunan Lainnya": "#7b8580"
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
    "Bangunan Lainnya"
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
