(() => {
  const state = {
    granularity: "day",
    data: null,
    chartLine: null,
    chartHourly: null,
    __reqSeq: 0
  };

  async function loadSample() {
    const res = await fetch("./data/sample.json", { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to load sample.json");
    return res.json();
  }

  function fmtNumber(n) {
    try { return new Intl.NumberFormat("id-ID").format(n); } catch { return String(n); }
  }

  function getSeries() {
    if (!state.data) return [];
    if (state.granularity === "day") return state.data.traffic.daily;
    if (state.granularity === "week") return state.data.traffic.weekly;
    return state.data.traffic.monthly;
  }

  function renderLine() {
    const series = getSeries();
    const labels = series.map(d => d.x);
    const imp = series.map(d => d.impressions);
    const reach = series.map(d => d.reach);

    const ctx = document.getElementById("chartImprReach").getContext("2d");
    if (state.chartLine) state.chartLine.destroy();

    state.chartLine = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Impressions",
            data: imp,
            tension: 0.35,
            borderWidth: 3,
            pointRadius: 0
          },
          {
            label: "Reach",
            data: reach,
            tension: 0.35,
            borderWidth: 3,
            pointRadius: 0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { position: "top", labels: { usePointStyle: true, pointStyle: "circle" } },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${fmtNumber(ctx.parsed.y)}`
            }
          }
        },
        scales: {
          x: { ticks: { maxRotation: 50, minRotation: 50 } },
          y: { ticks: { callback: (v) => fmtNumber(v) } }
        }
      }
    });
  }

  function renderHourly() {
    const series = state.data.traffic.hourly;
    const labels = series.map(d => d.x);
    const vals = series.map(d => d.value);

    const ctx = document.getElementById("chartHourly").getContext("2d");
    if (state.chartHourly) state.chartHourly.destroy();

    state.chartHourly = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: "Estimated potential views by hour",
          data: vals,
          borderWidth: 0,
          borderRadius: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: { label: (ctx) => ` ${fmtNumber(ctx.parsed.y)}` }
          }
        },
        scales: {
          x: { ticks: { maxRotation: 0, minRotation: 0 } },
          y: { ticks: { callback: (v) => fmtNumber(v) } }
        }
      }
    });

    // Fill quick insights
    const ins = state.data.traffic.insights;
    document.getElementById("peakMorning").textContent = ins.peak_morning;
    document.getElementById("peakEvening").textContent = ins.peak_evening;
    document.getElementById("bestImp").textContent = ins.best_day_impressions;
    document.getElementById("bestReach").textContent = ins.best_day_reach;
  }

  function setActiveTab(gran) {
    state.granularity = gran;
    document.querySelectorAll("[data-gran]").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.gran === gran);
    });
    renderLine();
  }

  async function init() {
    // Auth gate (redirect ke login.html jika belum ada session)
    const session = window.OMA_AUTH?.requireAuth({ redirectTo: 'login.html' });
    if (!session) return;
    try {
      const badge = document.getElementById('userBadge');
      const demo = document.getElementById('demoBadge');
      if (badge) badge.textContent = `${session.email || 'User'} (${session.role || '-'})`;
      if (demo && session.isDemo) demo.style.display = 'inline-block';
      const btn = document.getElementById('btnLogout');
      if (btn) btn.addEventListener('click', () => { window.OMA_AUTH?.logout(); window.location.href='index.html'; });
    } catch (e) {}

    // request guard
    const seq = ++state.__reqSeq;
    const data = await loadSample();
    if (seq !== state.__reqSeq) return;
    state.data = data;

    // chips
    const d = data.meta.default;
    document.getElementById("chipType").textContent = `Type OOH: ${d.type_ooh || "-"}`;
    document.getElementById("chipCity").textContent = `City: ${d.city || "-"}`;

    // map
    const q = encodeURIComponent(`${d.site_name || "Jl Laswi"} ${d.city || "Bandung"}`);
    document.getElementById("mapFrame").src = `https://www.google.com/maps?q=${q}&output=embed`;

    // render charts
    setActiveTab("day");
    renderHourly();

    // tab click
    document.querySelectorAll("[data-gran]").forEach(btn => {
      btn.addEventListener("click", () => setActiveTab(btn.dataset.gran));
    });
  }

  window.addEventListener("DOMContentLoaded", init);
})();