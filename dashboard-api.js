// dashboard-api.js
// Wiring dashboard.html (template lama) memakai data lokal ./data/live_data.json
// Tanpa backend. Role-based access ada di auth.js.

(async function () {
  const CFG = window.APP_CONFIG || {};
  const DATA_URL = CFG.DATA_URL || "./data/live_data.json";

  function $(id){ return document.getElementById(id); }
  function pad2(n){ return String(n).padStart(2,'0'); }

  function fmtCompact(num){
    const n = Number(num);
    if (!Number.isFinite(n)) return "—";
    const abs = Math.abs(n);
    const fmt = (v, d) => {
      try { return v.toLocaleString("id-ID", { maximumFractionDigits: d }); }
      catch(e){ return String(Number(v).toFixed(d)); }
    };
    if (abs >= 1e12) return fmt(n/1e12, 2) + " T";
    if (abs >= 1e9)  return fmt(n/1e9,  2) + " M";
    if (abs >= 1e6)  return fmt(n/1e6,  2) + " jt";
    if (abs >= 1e3)  return fmt(n/1e3,  0) + " rb";
    return fmt(n, 0);
  }

  function monthLabel(ym){
    const [y,m] = ym.split("-").map(Number);
    const d = new Date(y, m-1, 1);
    try { return new Intl.DateTimeFormat("id-ID",{month:"short", year:"numeric"}).format(d); }
    catch(e){ return ym; }
  }

  function isoWeekKey(dateStr){
    const [y,m,d] = dateStr.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m-1, d));
    const dayNum = dt.getUTCDay() || 7;
    dt.setUTCDate(dt.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(dt.getUTCFullYear(),0,1));
    const weekNo = Math.ceil((((dt - yearStart) / 86400000) + 1) / 7);
    return `${dt.getUTCFullYear()}-W${String(weekNo).padStart(2,"0")}`;
  }

  async function loadData(){
    const res = await fetch(DATA_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("Gagal load data: " + res.status);
    return await res.json();
  }

  // ===== Charts =====
  let hourlyChart = null;
  function ensureHourlyChart(){
    const el = document.querySelector("#totalRevenueChart");
    if (!el) return;
    if (hourlyChart) return;
    el.innerHTML = "";
    hourlyChart = new ApexCharts(el, {
      chart: { type:"bar", height: 280, toolbar:{show:false} },
      plotOptions:{ bar:{ borderRadius:6, columnWidth:"55%" } },
      dataLabels:{ enabled:false },
      xaxis:{ categories: Array.from({length:24},(_,i)=>`${pad2(i)}:00`) },
      yaxis:{ labels:{ formatter:(v)=>fmtCompact(v) } },
      tooltip:{ y:{ formatter:(v)=> fmtCompact(v) + " views" } },
      series:[{ name:"Potential Views", data:new Array(24).fill(0) }]
    });
    hourlyChart.render();
  }
  function updateHourlyChart(arr24){
    ensureHourlyChart();
    if (!hourlyChart) return;
    hourlyChart.updateSeries([{ name:"Potential Views", data: arr24 }], true);
  }

  let irChart = null;
  let irAgg = "day";
  function ensureIRChart(){
    const el = document.querySelector("#irTrendChart");
    if (!el) return;
    if (irChart) return;
    el.innerHTML = "";
    irChart = new ApexCharts(el, {
      chart:{ type:"line", height:320, toolbar:{show:false} },
      stroke:{ curve:"smooth", width:3 },
      dataLabels:{ enabled:false },
      xaxis:{ categories:[] },
      yaxis:{ labels:{ formatter:(v)=>fmtCompact(v) } },
      tooltip:{ y:{ formatter:(v)=>fmtCompact(v) } },
      series:[{ name:"Impressions", data:[] }, { name:"Reach", data:[] }]
    });
    irChart.render();
  }
  function aggregateIR(rows, mode){
    if (!rows?.length) return {cat:[], imp:[], reach:[]};
    if (mode === "month"){
      const totalImp = rows.reduce((a,r)=>a+r.impressions,0);
      const totalReach = rows.reduce((a,r)=>a+r.reach,0);
      const ym = ($("#filterMonth")?.value || rows[0].date.slice(0,7));
      return { cat:[ym], imp:[totalImp], reach:[totalReach] };
    }
    const map = new Map(); const order=[];
    for (const r of rows){
      const key = (mode==="week") ? isoWeekKey(r.date) : r.date;
      if (!map.has(key)){ map.set(key,{imp:0,reach:0}); order.push(key); }
      const g = map.get(key); g.imp += r.impressions; g.reach += r.reach;
    }
    return { cat: order, imp: order.map(k=>map.get(k).imp), reach: order.map(k=>map.get(k).reach) };
  }
  function renderIR(rows){
    ensureIRChart();
    if (!irChart) return;
    const d = aggregateIR(rows, irAgg);
    irChart.updateOptions({ xaxis:{ categories:d.cat } }, false, true);
    irChart.updateSeries([{ name:"Impressions", data:d.imp }, { name:"Reach", data:d.reach }], true);

    const bDay = $("#irAggDay"), bWeek = $("#irAggWeek"), bMonth = $("#irAggMonth");
    [[bDay,"day"],[bWeek,"week"],[bMonth,"month"]].forEach(([btn,val])=>{
      if (!btn) return;
      const active = (val===irAgg);
      btn.classList.toggle("btn-primary", active);
      btn.classList.toggle("btn-outline-primary", !active);
    });
  }
  function wireIRToggle(){
    const bDay = $("#irAggDay"), bWeek = $("#irAggWeek"), bMonth = $("#irAggMonth");
    if (bDay) bDay.addEventListener("click", ()=>{ irAgg="day"; if (window.__IR_ROWS) renderIR(window.__IR_ROWS); });
    if (bWeek) bWeek.addEventListener("click", ()=>{ irAgg="week"; if (window.__IR_ROWS) renderIR(window.__IR_ROWS); });
    if (bMonth) bMonth.addEventListener("click", ()=>{ irAgg="month"; if (window.__IR_ROWS) renderIR(window.__IR_ROWS); });
  }

  // ===== Demography charts =====
  let demoGenderChart = null;
  let demoAgeChart = null;
  function ensureDemoCharts(){
    const elG = document.querySelector("#demoGenderChart");
    const elA = document.querySelector("#demoAgeChart");
    if (!elG || !elA) return;
    if (!demoGenderChart){
      demoGenderChart = new ApexCharts(elG, {
        chart:{ type:"donut", height:260, toolbar:{show:false} },
        labels:["Male","Female"],
        legend:{ position:"bottom" },
        series:[50,50]
      });
      demoGenderChart.render();
    }
    if (!demoAgeChart){
      demoAgeChart = new ApexCharts(elA, {
        chart:{ type:"bar", height:260, toolbar:{show:false} },
        plotOptions:{ bar:{ borderRadius:8, columnWidth:"45%" } },
        dataLabels:{ enabled:false },
        xaxis:{ categories:["18–24","25–34","35–44","45–54","55+"] },
        yaxis:{ labels:{ formatter:(v)=>fmtCompact(v) } },
        tooltip:{ y:{ formatter:(v)=>fmtCompact(v) } },
        series:[{ name:"Reach", data:[0,0,0,0,0] }]
      });
      demoAgeChart.render();
    }
  }

  function parseJsonSafe(s){
    try { return JSON.parse(s); } catch(e){ return null; }
  }

  function updateDemography(demoRows){
    ensureDemoCharts();
    if (!demoGenderChart || !demoAgeChart) return;

    if (!demoRows?.length){
      demoGenderChart.updateSeries([0,0], true);
      demoAgeChart.updateSeries([{name:"Reach", data:[0,0,0,0,0]}], true);
      return;
    }

    // gunakan rata-rata (atau last) untuk tampilan stabil
    const last = demoRows[demoRows.length-1];
    const gObj = parseJsonSafe(last.gender) || { male: 0, female: 0 };
    const ages = parseJsonSafe(last.age_groups) || [];

    const male = Number(gObj.male || 0);
    const female = Number(gObj.female || 0);

    demoGenderChart.updateOptions({ labels:["male","female"] }, false, true);
    demoGenderChart.updateSeries([male, female], true);

    const labels = ages.map(x=>String(x.label));
    const vals = ages.map(x=>Number(x.value||0));

    demoAgeChart.updateOptions({ xaxis:{ categories: labels } }, false, true);
    demoAgeChart.updateSeries([{ name:"Reach", data: vals }], true);

    // badges
    const top = ages.slice().sort((a,b)=>Number(b.value||0)-Number(a.value||0))[0]?.label || "—";
    if ($("#demoTopAge")) $("#demoTopAge").textContent = top;
    if ($("#demoMalePct")) $("#demoMalePct").textContent = (male+female>0) ? Math.round((male/(male+female))*100)+"%" : "—";
    if ($("#demoFemalePct")) $("#demoFemalePct").textContent = (male+female>0) ? Math.round((female/(male+female))*100)+"%" : "—";
    if ($("#demoSegmentReach")) $("#demoSegmentReach").textContent = "—";
  }

  // ===== Mini map (Leaflet) =====
  let map = null;
  let marker = null;
  function ensureMap(){
    const el = document.querySelector("#miniMapLeaflet");
    if (!el) return;
    if (map) return;

    map = L.map(el, { zoomControl: true, scrollWheelZoom: false });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);
  }
  function updateMap(site){
    const el = document.querySelector("#miniMapLeaflet");
    if (!el) return;
    if (!site || site.lat == null || site.lon == null) return;

    ensureMap();
    if (!map) return;

    const latlng = [site.lat, site.lon];
    map.setView(latlng, 15);
    if (marker) marker.remove();
    marker = L.marker(latlng).addTo(map);
    marker.bindPopup(site.name || site.site_code).openPopup();
  }

  // ===== UI bind =====
  function setSelectOptions(sel, options, selectedValue){
    sel.innerHTML = "";
    for (const opt of options){
      const o = document.createElement("option");
      o.value = opt.value;
      o.textContent = opt.label;
      sel.appendChild(o);
    }
    if (selectedValue != null) sel.value = selectedValue;
  }

  function getAllowedSites(data, session){
    const allowed = Array.isArray(session?.allowedSites) ? new Set(session.allowedSites) : null;
    const sites = (data?.sites || []);
    return allowed ? sites.filter(s => allowed.has(s.site_code)) : sites.slice();
  }

  function deriveMonthBounds(site){
    const dates = (site?.daily || []).map(x=>x.date).sort();
    const min = dates[0]?.slice(0,7);
    const max = dates[dates.length-1]?.slice(0,7);
    return { min, max };
  }

  function lastDayOfMonth(ym){
    const [y,m] = ym.split("-").map(Number);
    return new Date(y, m, 0).getDate();
  }

  function clampRangeToMonth(start, end, ym){
    const [y,m] = ym.split("-").map(Number);
    const min = `${y}-${pad2(m)}-01`;
    const max = `${y}-${pad2(m)}-${pad2(lastDayOfMonth(ym))}`;
    let s = start || min;
    let e = end || max;
    if (s < min) s = min;
    if (s > max) s = max;
    if (e < min) e = min;
    if (e > max) e = max;
    if (e < s) e = s;
    return { min, max, start: s, end: e };
  }

  function applyBadges(ym, start, end){
    if ($("#periodBadge")) $("#periodBadge").textContent = monthLabel(ym);
    if ($("#periodLabelImpressions")) $("#periodLabelImpressions").textContent = monthLabel(ym);
    if ($("#periodLabelReach")) $("#periodLabelReach").textContent = monthLabel(ym);
    if ($("#periodLabelInsights")) $("#periodLabelInsights").textContent = monthLabel(ym);

    if ($("#dateRangeBadge")){
      const sd = start.slice(-2);
      const ed = end.slice(-2);
      $("#dateRangeBadge").textContent = `${sd}–${ed}`;
    }
  }

  function computeHourly24(site, start, end){
    const rows = (site?.hourly || []).filter(r=>{
      const d = r.ts_hour.slice(0,10);
      return d >= start && d <= end;
    });
    const buckets = new Array(24).fill(0);
    const counts = new Array(24).fill(0);
    for (const r of rows){
      const h = Number(r.ts_hour.slice(11,13));
      buckets[h] += Number(r.volume || 0);
      counts[h] += 1;
    }
    // average per hour-slot
    return buckets.map((sum,i)=> counts[i] ? Math.round(sum / counts[i]) : 0);
  }

  function computeScores(site, start, end){
    const rows = (site?.scores || []).filter(r=>{
      const d = String(r.d || r.date || "").slice(0,10);
      return d >= start && d <= end;
    });
    if (!rows.length) return null;
    const avg = (k)=> rows.reduce((a,r)=>a+Number(r[k]||0),0)/rows.length;
    return {
      traffic: avg("traffic_score"),
      poi: avg("poi_score"),
      demo: avg("demographic_score"),
      total: avg("total_score"),
      avgPoiCount: null
    };
  }

  function computeDailyIR(site, ym, start, end){
    const rows = (site?.daily || []).filter(r=>{
      return r.date.slice(0,7) === ym && r.date >= start && r.date <= end;
    });
    return rows;
  }

  function computeKpi(rows){
    const sumImp = rows.reduce((a,r)=>a+Number(r.impressions||0),0);
    const sumReach = rows.reduce((a,r)=>a+Number(r.reach||0),0);
    return { sumImp, sumReach };
  }

  function updateKpis(kpi, scores){
    if ($("#kpiMonthlyImpressions")) $("#kpiMonthlyImpressions").textContent = fmtCompact(kpi.sumImp);
    if ($("#kpiReachImpressions")) $("#kpiReachImpressions").textContent = fmtCompact(kpi.sumReach);

    if (scores){
      if ($("#kpiTrafficScore")) $("#kpiTrafficScore").innerHTML = `${Math.round(scores.traffic)}<span class="fs-6">/100</span>`;
      if ($("#kpiPoiScore")) $("#kpiPoiScore").innerHTML = `${Math.round(scores.poi)}<span class="fs-6">/100</span>`;
      if ($("#kpiDemoScore")) $("#kpiDemoScore").innerHTML = `${Math.round(scores.demo)}<span class="fs-6">/100</span>`;
      if ($("#kpiTotalScore")) $("#kpiTotalScore").textContent = (Math.round(scores.total)/10).toFixed(1);
      if ($("#kpiTotalScoreBadge")){
        const t = scores.total;
        $("#kpiTotalScoreBadge").textContent = t>=85 ? "Excellent" : t>=75 ? "Good" : "Average";
      }
    }
  }

  function updateMiniMapBadges(site, kpi, scores){
    if ($("#miniMapTitle")) $("#miniMapTitle").textContent = `Mini Map – ${site?.name || site?.site_code || "—"}`;
    if ($("#miniMapSubtitle")) $("#miniMapSubtitle").textContent = `Lokasi terpilih untuk periode ${monthLabel($("#filterMonth")?.value || "")}`;

    if ($("#miniMapReach")) $("#miniMapReach").textContent = fmtCompact(kpi.sumReach);
    if ($("#miniMapTrafficScore") && scores) $("#miniMapTrafficScore").textContent = `${Math.round(scores.traffic)}/100`;
    if ($("#miniMapPoiCount")) $("#miniMapPoiCount").textContent = "—";
  }

  function updateQuickInsights(hourly24, irRows){
    const ul = $("#autoInsightsList");
    if (!ul) return;

    if (!hourly24?.length || !irRows?.length){
      ul.innerHTML = "<li>—</li>";
      return;
    }

    const pairs = hourly24.map((v,i)=>({h:i,v})).sort((a,b)=>b.v-a.v);
    const top1 = pairs[0]?.h ?? 0;
    const top2 = pairs[1]?.h ?? 0;

    const bestImp = irRows.slice().sort((a,b)=>b.impressions-a.impressions)[0];
    const bestReach = irRows.slice().sort((a,b)=>b.reach-a.reach)[0];

    const fmtHr = (h)=>`${pad2(h)}:00`;
    ul.innerHTML = `
      <li><span class="fw-semibold">Peak Hours:</span> <span class="badge bg-label-primary">${fmtHr(top1)}</span> (Morning) &nbsp; <span class="badge bg-label-danger">${fmtHr(top2)}</span> (Evening)</li>
      <li><span class="fw-semibold">Best day (Impressions):</span> <span class="badge bg-label-success">${bestImp.date}</span></li>
      <li><span class="fw-semibold">Best day (Reach):</span> <span class="badge bg-label-info">${bestReach.date}</span></li>
    `;
  }

  // ===== Main flow =====
  try {
    if (window.Auth?.requireDashboardAccess) window.Auth.requireDashboardAccess();

    const data = await loadData();

    // apply role policy based on data
    const session = window.Auth?.ensureAccessPolicy ? window.Auth.ensureAccessPolicy(data) : null;
    // hide blocks per role
    window.Auth?.applyFeatureFlags?.();

    const allowedSites = getAllowedSites(data, session);
    if (!allowedSites.length) throw new Error("Tidak ada lokasi yang bisa diakses untuk role ini.");

    const selLoc = $("#filterLocation");
    const selCity = $("#filterCity");
    const selType = $("#filterOOHType");
    const inpMonth = $("#filterMonth");
    const inpStart = $("#filterStartDate");
    const inpEnd = $("#filterEndDate");
    const btnApply = $("#filterApply");
    const btnPdf = $("#btnExportPdf");

    // Build option lists
    const cities = Array.from(new Set(allowedSites.map(s=>s.city))).sort();
    const types = Array.from(new Set(allowedSites.map(s=>s.type_ooh))).sort();

    if (selCity) setSelectOptions(selCity, [{value:"__all__", label:"All"}].concat(cities.map(c=>({value:c,label:c}))), "__all__");
    if (selType) setSelectOptions(selType, types.map(t=>({value:t,label:t})), types[0] || "");

    // default selected site: first
    let currentSiteCode = allowedSites[0].site_code;
    function refreshTypeOptionsForCity(){
  if (!selType) return;
  const cityVal = selCity?.value || "__all__";

  // type list depends on selected city (and allowedSites)
  const pool = allowedSites.filter(s=>{
    return (cityVal==="__all__") ? true : (s.city===cityVal);
  });

  const typeList = Array.from(new Set(pool.map(s=>s.type_ooh).filter(Boolean))).sort();
  const prev = selType.value;

  // If empty, keep one option
  const opts = typeList.length ? typeList.map(t=>({value:t,label:t})) : [{value:"",label:""}];
  setSelectOptions(selType, opts, (typeList.includes(prev) ? prev : (opts[0]?.value || "")));
}

function refreshLocationOptions(){
  const cityVal = selCity?.value || "__all__";
  const typeVal = selType?.value || null;

  const filtered = allowedSites.filter(s=>{
    const okCity = (cityVal==="__all__") ? true : (s.city===cityVal);
    const okType = typeVal ? (s.type_ooh===typeVal) : true;
    return okCity && okType;
  });

  const opts = filtered.map(s=>({ value:s.site_code, label:`${s.name} — ${s.city}` }));
  if (selLoc) setSelectOptions(selLoc, opts, (opts.some(o=>o.value===currentSiteCode) ? currentSiteCode : (opts[0]?.value)));
  currentSiteCode = selLoc?.value || currentSiteCode;
}

    function getSite(code){
      return allowedSites.find(s=>s.site_code===code) || allowedSites[0];
    }

    function refreshDateControls(){
      const site = getSite(currentSiteCode);
      const bounds = deriveMonthBounds(site);
      if (inpMonth){
        if (bounds.min) inpMonth.min = bounds.min;
        if (bounds.max) inpMonth.max = bounds.max;
        if (!inpMonth.value) inpMonth.value = bounds.max || bounds.min;
        if (bounds.min && inpMonth.value < bounds.min) inpMonth.value = bounds.min;
        if (bounds.max && inpMonth.value > bounds.max) inpMonth.value = bounds.max;
      }

      const ym = inpMonth?.value || bounds.max || bounds.min;
      const range = clampRangeToMonth(inpStart?.value, inpEnd?.value, ym);
      if (inpStart){ inpStart.min = range.min; inpStart.max = range.max; inpStart.value = range.start; }
      if (inpEnd){ inpEnd.min = range.min; inpEnd.max = range.max; inpEnd.value = range.end; }
      applyBadges(ym, range.start, range.end);
    }

    function applyAll(){
      const site = getSite(currentSiteCode);
      // sync city/type selects to match site (agar terasa "nyambung")
      if (selCity && selCity.value !== "__all__" && site.city !== selCity.value) {
        // biarkan user punya filter sendiri
      }
      if (selType && site.type_ooh && selType.value !== site.type_ooh) {
        // sama, biarkan
      }

      refreshDateControls();

      const ym = inpMonth?.value;
      const start = inpStart?.value;
      const end = inpEnd?.value;

      const irRows = computeDailyIR(site, ym, start, end);
      const kpi = computeKpi(irRows);
      const scores = computeScores(site, start, end);

      updateKpis(kpi, scores);

      const h24 = computeHourly24(site, start, end);
      updateHourlyChart(h24);

      window.__IR_ROWS = irRows;
      renderIR(irRows);

      updateQuickInsights(h24, irRows);

      // demography
      const demoRows = (site.demography || []).filter(r=>{
        const d = String(r.d).slice(0,10);
        return d >= start && d <= end;
      });
      updateDemography(demoRows);

      // map
      updateMap(site);
      updateMiniMapBadges(site, kpi, scores);
    }

    // Wire events
    refreshTypeOptionsForCity();
    refreshLocationOptions();
    refreshDateControls();
    wireIRToggle();

    if (selCity) selCity.addEventListener("change", ()=>{ refreshTypeOptionsForCity(); refreshLocationOptions(); refreshDateControls(); applyAll(); });
    if (selType) selType.addEventListener("change", ()=>{ refreshLocationOptions(); refreshDateControls(); applyAll(); });
    if (selLoc) selLoc.addEventListener("change", ()=>{ currentSiteCode = selLoc.value; refreshDateControls(); applyAll(); });
    if (inpMonth) inpMonth.addEventListener("change", ()=>{ refreshDateControls(); applyAll(); });
    if (inpStart) inpStart.addEventListener("change", ()=>{ refreshDateControls(); });
    if (inpEnd) inpEnd.addEventListener("change", ()=>{ refreshDateControls(); });

    if (btnApply) btnApply.addEventListener("click", (e)=>{ e.preventDefault(); applyAll(); });

    if (btnPdf) btnPdf.addEventListener("click", (e)=>{ e.preventDefault(); window.print(); });

    // First render
    applyAll();

  } catch (err) {
    console.error(err);
    const body = document.body;
    if (body) {
      const div = document.createElement("div");
      div.style.cssText = "position:fixed;inset:16px;max-width:760px;margin:auto;background:#fff;padding:16px 18px;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.15);z-index:99999;font-family:system-ui";
      div.innerHTML = `<div style="font-weight:700;margin-bottom:8px;">Dashboard gagal dimuat</div>
        <div style="color:#444;font-size:14px;">${String(err?.message || err)}</div>
        <div style="margin-top:10px;font-size:12px;color:#666;">Tips: pastikan deploy di Vercel sebagai static site (tanpa folder root yang salah).</div>`;
      body.appendChild(div);
    }
  }
})();
