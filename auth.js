// auth.js
// Auth sederhana (frontend-only) + role-based access.
// Catatan: kredensial TIDAK ditampilkan di UI. Hanya untuk demo.

(function () {
  const STORAGE_KEY = "oma_session_v1";

  // Silakan ubah site_code di bawah jika ingin 1 demo lokasi & 3 client lokasi yang spesifik.
  // Jika null, akan dipilih otomatis dari data (demo=1 pertama, client=3 pertama).
  const FIXED_DEMO_SITE_CODE = null;
  const FIXED_CLIENT_SITE_CODES = null; // contoh: ["BDG-PASK-001","JKT-HATU-001","SBY-RYDM-001"]

  const USERS = [
    { email: "admin@pickooh.com",  password: "admin123",  role: "admin"  },
    { email: "demo@pickooh.com",   password: "demo123",   role: "demo"   },
    { email: "client@pickooh.com", password: "client123", role: "client" }
  ];

  function readSession() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); }
    catch (e) { return null; }
  }
  function writeSession(s) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch (e) {}
  }
  function clearSession() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  }

  function isLoggedIn() {
    const s = readSession();
    return !!(s && s.role);
  }

  function logout() {
    clearSession();
    window.location.href = "index.html";
  }

  // Dipanggil dari login.html
  function login(email, password) {
    const u = USERS.find(x => x.email === String(email || "").trim().toLowerCase() && x.password === String(password || ""));
    if (!u) return { ok: false, error: "Email atau password salah." };

    // allowedSites & featureFlags akan diisi/ditentukan oleh dashboard-api setelah data dibaca.
    writeSession({
      email: u.email,
      role: u.role,
      allowedSites: null,
      featureFlags: null,
      ts: Date.now()
    });
    return { ok: true, role: u.role };
  }

  // Dipanggil dari index.html (Lihat Demo)
  function enterDemo() {
    writeSession({
      email: "demo@pickooh.com",
      role: "demo",
      allowedSites: null,
      featureFlags: null,
      ts: Date.now()
    });
  }

  // Redirect guard
  function requireDashboardAccess() {
    if (!isLoggedIn()) window.location.href = "index.html";
  }

  // Dipanggil oleh dashboard-api.js setelah live_data.json ter-load
  function ensureAccessPolicy(liveData) {
    const s = readSession();
    if (!s || !s.role) return null;

    // Build list of all site codes in data
    const allSites = (liveData?.sites || []).map(x => x.site_code);

    let allowed = allSites.slice();
    let flags = {
      showMap: true,
      showScores: true,
      showExport: true
    };

    if (s.role === "demo") {
      const demoSite = FIXED_DEMO_SITE_CODE || allSites[0];
      allowed = demoSite ? [demoSite] : [];
      flags.showScores = false;
      flags.showExport = false;
    }

    if (s.role === "client") {
      const clientSites = (Array.isArray(FIXED_CLIENT_SITE_CODES) && FIXED_CLIENT_SITE_CODES.length === 3)
        ? FIXED_CLIENT_SITE_CODES
        : allSites.slice(0, 3);
      allowed = clientSites.filter(Boolean);
      // contoh pembatasan fitur untuk client
      flags.showMap = false;     // map disembunyikan
      flags.showScores = false;  // scores disembunyikan
      flags.showExport = true;
    }

    // Admin: full access
    if (s.role === "admin") {
      allowed = allSites.slice();
      flags = { showMap: true, showScores: true, showExport: true };
    }

    // Persist only if not set
    const needWrite = !Array.isArray(s.allowedSites) || !s.featureFlags;
    if (needWrite) {
      writeSession({ ...s, allowedSites: allowed, featureFlags: flags });
      return { ...s, allowedSites: allowed, featureFlags: flags };
    }
    return s;
  }

  // Hide UI blocks based on flags
  function applyFeatureFlags() {
    const s = readSession();
    const flags = s?.featureFlags || null;
    if (!flags) return;

    // Export button
    const btnPdf = document.getElementById("btnExportPdf");
    if (btnPdf) btnPdf.style.display = flags.showExport ? "" : "none";

    // Mini map card wrapper (closest .col-12 order-12)
    const mapEl = document.getElementById("miniMapLeaflet") || document.getElementById("miniMapFrame") || document.getElementById("miniMapStaticImg");
    if (mapEl) {
      const cardCol = mapEl.closest(".col-12");
      if (cardCol) cardCol.style.display = flags.showMap ? "" : "none";
    }

    // Scores: di template lama scores ada di KPI + (opsional) card lain.
    // Minimal: sembunyikan KPI "Traffic Score / POI Score / Demographic Match Score / Total Scoring" jika showScores=false
    if (!flags.showScores) {
      const ids = ["kpiTrafficScore", "kpiPoiScore", "kpiDemoScore", "kpiTotalScore"];
      ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          const card = el.closest(".kpi-card") || el.closest(".card");
          if (card) card.style.display = "none";
        }
      });
    }
  }

  // Compat: beberapa file lama memanggil applyCityRestrictions. Di versi ini kita batasi via lokasi, bukan city.
  function applyCityRestrictions() {
    // no-op (dibatasi di dashboard-api.js via allowedSites)
  }

  window.Auth = {
    readSession,
    login,
    logout,
    enterDemo,
    requireDashboardAccess,
    ensureAccessPolicy,
    applyFeatureFlags,
    applyCityRestrictions
  };

  // Backward compat untuk landing yang lama
  window.OMA_AUTH = { enterDemo, logout, login };

})();
