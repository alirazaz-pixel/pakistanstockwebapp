/* ============================================================================
   Pakistan Market Hub — app.js
   No build step, no frameworks. Plain JS, polls data/latest.json + history.json
   every POLL_INTERVAL_MS and re-renders. Charts are drawn by hand on <canvas>
   (no chart library) to keep the whole app dependency-free.
   ========================================================================== */

const POLL_INTERVAL_MS = 10_000; // "feels live" polling of the local JSON file
const DATA_URL = "data/latest.json";
const HISTORY_URL = "data/history.json";

const ACCENTS = {
  green: "#10b981", amber: "#f59e0b", blue: "#0ea5e9",
  blue2: "#60a5fa", purple: "#8b5cf6", pink: "#ec4899", red: "#f87171",
};

let state = {
  latest: null,
  history: [],
  kseRange: "1Y",
};

/* ---------------------------------------------------------------------------
   Tiny helpers
--------------------------------------------------------------------------- */

function $(sel) { return document.querySelector(sel); }
function $all(sel) { return Array.from(document.querySelectorAll(sel)); }

function fmtNum(n, decimals = 0) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Number(n).toLocaleString("en-PK", { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
}

function fmtPKR(n, decimals = 0) {
  if (n === null || n === undefined) return "—";
  return "₨" + fmtNum(n, decimals);
}

function fmtUSD(n, decimals = 2) {
  if (n === null || n === undefined) return "—";
  return "$" + fmtNum(n, decimals);
}

function changeClass(pct) {
  if (pct === null || pct === undefined || Number.isNaN(pct)) return "flat";
  if (pct > 0.001) return "up";
  if (pct < -0.001) return "down";
  return "flat";
}

function arrow(cls) {
  if (cls === "up") return "▲";
  if (cls === "down") return "▼";
  return "•";
}

function setAccent(el, hex) {
  if (el) el.style.setProperty("--accent-color", hex);
}

function timeAgo(isoString) {
  if (!isoString) return "unknown";
  const then = new Date(isoString).getTime();
  const diffSec = Math.round((Date.now() - then) / 1000);
  if (diffSec < 10) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  return `${diffHr}h ago`;
}

/* ---------------------------------------------------------------------------
   Data loading
--------------------------------------------------------------------------- */

async function loadData() {
  try {
    const [latestRes, historyRes] = await Promise.all([
      fetch(DATA_URL + "?t=" + Date.now(), { cache: "no-store" }),
      fetch(HISTORY_URL + "?t=" + Date.now(), { cache: "no-store" }),
    ]);
    if (!latestRes.ok || !historyRes.ok) throw new Error("Bad response");
    state.latest = await latestRes.json();
    state.history = await historyRes.json();
    hideToast();
    renderAll();
  } catch (err) {
    console.error("[data] failed to load:", err);
    showToast("Couldn't refresh data — showing last known values.");
  }
}

/* ---------------------------------------------------------------------------
   Toast (non-blocking error notice)
--------------------------------------------------------------------------- */

let toastEl = null;
function ensureToast() {
  if (toastEl) return toastEl;
  toastEl = document.createElement("div");
  toastEl.className = "toast";
  document.body.appendChild(toastEl);
  return toastEl;
}
function showToast(msg) {
  const el = ensureToast();
  el.textContent = msg;
  el.classList.add("show");
}
function hideToast() {
  if (toastEl) toastEl.classList.remove("show");
}

/* ---------------------------------------------------------------------------
   Rendering — top bar
--------------------------------------------------------------------------- */

function renderTopBar() {
  const { latest } = state;
  if (!latest) return;

  const kse = latest.kse100;
  $("#kse-live-value").textContent = kse ? fmtNum(kse.price, 0) : "—";

  const badge = $("#kse-live-badge");
  if (kse) {
    const cls = changeClass(kse.change_pct);
    badge.textContent = `${arrow(cls)} ${kse.change_pct > 0 ? "+" : ""}${kse.change_pct}%`;
    badge.className = "badge " + cls;
  } else {
    badge.textContent = "no data";
    badge.className = "badge flat";
  }

  $("#last-updated").textContent = `Updated ${timeAgo(latest.fetched_at_utc)}`;
}

/* ---------------------------------------------------------------------------
   Rendering — overview stat cards
--------------------------------------------------------------------------- */

function renderStatCard(valueId, changeId, value, changePct, changeLabel, subId, subText) {
  $(valueId).textContent = value;
  if (subId && subText !== undefined) $(subId).textContent = subText;
  const changeEl = $(changeId);
  if (changePct === null || changePct === undefined) {
    changeEl.textContent = "—";
    changeEl.className = "stat-change flat";
    return;
  }
  const cls = changeClass(changePct);
  changeEl.innerHTML = `${arrow(cls)} ${Math.abs(changePct).toFixed(2)}% <span class="sub-label">${changeLabel}</span>`;
  changeEl.className = "stat-change " + cls;
}

function renderOverviewStats() {
  const { latest } = state;
  if (!latest) return;

  const kse = latest.kse100;
  renderStatCard("#stat-kse-value", "#stat-kse-change",
    kse ? fmtNum(kse.price, 0) : "—", kse ? kse.change_pct : null, "today");

  const cpi = latest.manual?.cpi;
  $("#stat-cpi-sub").textContent = cpi ? cpi.month_label : "—";
  renderStatCard("#stat-cpi-value", "#stat-cpi-change",
    cpi ? cpi.yoy_percent + "%" : "—",
    cpi && cpi.previous_month_yoy_percent !== undefined
      ? cpi.yoy_percent - cpi.previous_month_yoy_percent
      : null,
    "vs prior reading");

  const petrol = latest.manual?.petrol;
  renderStatCard("#stat-petrol-value", "#stat-petrol-change",
    petrol ? fmtPKR(petrol.pkr_per_litre, 2) : "—",
    petrol ? (petrol.change_pkr / (petrol.pkr_per_litre - petrol.change_pkr) * 100) : null,
    "vs prior fortnight");

  const gold = latest.gold;
  renderStatCard("#stat-gold-value", "#stat-gold-change",
    gold ? fmtPKR(gold.pkr_per_tola_24k, 0) : "—",
    gold ? gold.change_pct : null, "vs yesterday");

  const oil = latest.oil_brent;
  renderStatCard("#stat-oil-value", "#stat-oil-change",
    oil ? fmtUSD(oil.price, 2) : "—", oil ? oil.change_pct : null, "today");

  $("#stat-usd-value").textContent = latest.usd_pkr ? fmtPKR(latest.usd_pkr, 2) : "—";
}

/* ---------------------------------------------------------------------------
   Rendering — market feed (generated from current snapshot, newest first)
--------------------------------------------------------------------------- */

function generateFeed() {
  const { latest } = state;
  if (!latest) return [];
  const items = [];
  const now = latest.fetched_at_utc;

  if (latest.kse100) {
    const cls = changeClass(latest.kse100.change_pct);
    items.push({
      type: cls === "down" ? "bear" : cls === "up" ? "bull" : "info",
      text: `KSE-100 at ${fmtNum(latest.kse100.price)} — ${cls === "up" ? "up" : cls === "down" ? "down" : "flat"} ${Math.abs(latest.kse100.change_pct)}% vs previous close`,
      t: now,
    });
  }
  if (latest.gold) {
    const cls = changeClass(latest.gold.change_pct);
    items.push({
      type: cls === "up" ? "bull" : cls === "down" ? "bear" : "info",
      text: `Gold (24K) at ${fmtPKR(latest.gold.pkr_per_tola_24k)}/tola — ${cls === "up" ? "up" : "down"} ${Math.abs(latest.gold.change_pct)}% on the day`,
      t: now,
    });
  }
  if (latest.oil_brent) {
    const cls = changeClass(latest.oil_brent.change_pct);
    items.push({
      type: cls === "down" ? "bull" : cls === "up" ? "bear" : "info",
      text: `Brent crude at ${fmtUSD(latest.oil_brent.price)}/bbl (${cls === "up" ? "+" : ""}${latest.oil_brent.change_pct}%) — ${cls === "down" ? "supports lower import bill" : "watch fuel price impact"}`,
      t: now,
    });
  }
  if (latest.manual?.petrol) {
    items.push({
      type: latest.manual.petrol.change_pkr < 0 ? "bull" : "bear",
      text: `Petrol ${latest.manual.petrol.change_pkr < 0 ? "cut" : "raised"} by ₨${Math.abs(latest.manual.petrol.change_pkr)}/L, effective ${latest.manual.petrol.effective_date}`,
      t: now,
    });
  }
  if (latest.manual?.cpi) {
    items.push({
      type: "info",
      text: `CPI inflation at ${latest.manual.cpi.yoy_percent}% YoY (${latest.manual.cpi.month_label})`,
      t: now,
    });
  }
  if (latest.usd_pkr) {
    items.push({
      type: "info",
      text: `USD/PKR around ${fmtPKR(latest.usd_pkr, 2)}`,
      t: now,
    });
  }
  if (latest.manual?.policy_rate) {
    items.push({
      type: "info",
      text: `SBP policy rate holding at ${latest.manual.policy_rate.percent}%`,
      t: now,
    });
  }
  return items;
}

function renderFeed() {
  const list = $("#feed-list");
  const items = generateFeed();
  if (!items.length) {
    list.innerHTML = `<div class="feed-empty">No feed data yet — waiting for first data fetch.</div>`;
    return;
  }
  list.innerHTML = items.map(item => `
    <div class="feed-item">
      <div class="feed-dot ${item.type}"></div>
      <div>
        <div class="feed-text">${item.text}</div>
        <div class="feed-time">${timeAgo(item.t)}</div>
      </div>
    </div>
  `).join("");
}

/* ---------------------------------------------------------------------------
   Rendering — Market tab
--------------------------------------------------------------------------- */

function renderMarketTab() {
  const { latest } = state;
  if (!latest || !latest.kse100) return;
  const kse = latest.kse100;
  const rows = [
    ["Current Level", fmtNum(kse.price) + " pts"],
    ["Previous Close", fmtNum(kse.prev_close) + " pts"],
    ["Change Today", (kse.change >= 0 ? "+" : "") + fmtNum(kse.change, 2) + " pts"],
    ["Change %", (kse.change_pct >= 0 ? "+" : "") + kse.change_pct + "%"],
    ["USD/PKR", latest.usd_pkr ? fmtPKR(latest.usd_pkr, 2) : "—"],
    ["SBP Policy Rate", latest.manual?.policy_rate ? latest.manual.policy_rate.percent + "%" : "—"],
  ];
  $("#market-kv-list").innerHTML = rows.map(([k, v]) => `
    <div class="kv-row"><span class="kv-key">${k}</span><span class="kv-val">${v}</span></div>
  `).join("");
}

/* ---------------------------------------------------------------------------
   Rendering — Macro tab
--------------------------------------------------------------------------- */

function renderMacroTab() {
  const { latest } = state;
  if (!latest) return;
  const cpi = latest.manual?.cpi;
  const core = latest.manual?.core_inflation;

  const miniStats = [
    ["CPI YoY", cpi ? cpi.yoy_percent + "%" : "—", ACCENTS.red],
    ["Core Inflation", core ? core.yoy_percent + "%" : "—", ACCENTS.amber],
    ["Policy Rate", latest.manual?.policy_rate ? latest.manual.policy_rate.percent + "%" : "—", ACCENTS.pink],
    ["USD/PKR", latest.usd_pkr ? fmtNum(latest.usd_pkr, 1) : "—", ACCENTS.blue2],
  ];
  $("#macro-mini-stats").innerHTML = miniStats.map(([k, v, c]) => `
    <div class="mini-stat"><div class="mini-stat-label">${k}</div><div class="mini-stat-value" style="color:${c}">${v}</div></div>
  `).join("");

  const kv = [
    ["CPI (YoY)", cpi ? `${cpi.yoy_percent}% (${cpi.month_label})` : "—"],
    ["Core Inflation", core ? `${core.yoy_percent}% (${core.month_label})` : "—"],
    ["SBP Policy Rate", latest.manual?.policy_rate ? `${latest.manual.policy_rate.percent}%` : "—"],
    ["USD / PKR", latest.usd_pkr ? fmtPKR(latest.usd_pkr, 2) : "—"],
    ["Source (CPI)", cpi?.source || "Pakistan Bureau of Statistics"],
    ["Last Manual Update", latest.manual?.last_manual_update || "—"],
  ];
  $("#macro-kv-list").innerHTML = kv.map(([k, v]) => `
    <div class="kv-row"><span class="kv-key">${k}</span><span class="kv-val">${v}</span></div>
  `).join("");
}

/* ---------------------------------------------------------------------------
   Rendering — Commodities tab
--------------------------------------------------------------------------- */

function renderCommoditiesTab() {
  const { latest } = state;
  if (!latest) return;

  const oil = latest.oil_brent;
  $("#oil-mini-stats").innerHTML = [
    ["Current", oil ? fmtUSD(oil.price, 2) : "—", ACCENTS.blue2],
    ["Prev Close", oil ? fmtUSD(oil.prev_close, 2) : "—", ACCENTS.blue],
    ["Change", oil ? (oil.change >= 0 ? "+" : "") + oil.change.toFixed(2) : "—", oil && oil.change < 0 ? ACCENTS.green : ACCENTS.red],
  ].map(([k, v, c]) => `<div class="mini-stat"><div class="mini-stat-label">${k}</div><div class="mini-stat-value" style="color:${c}">${v}</div></div>`).join("");

  const gold = latest.gold;
  $("#gold-mini-stats").innerHTML = [
    ["24K / Tola", gold ? fmtPKR(gold.pkr_per_tola_24k) : "—", ACCENTS.amber],
    ["24K / Gram", gold ? fmtPKR(gold.pkr_per_gram_24k) : "—", "#d97706"],
    ["1-Day Change", gold ? (gold.change_pct >= 0 ? "+" : "") + gold.change_pct + "%" : "—", gold && gold.change_pct >= 0 ? ACCENTS.green : ACCENTS.red],
  ].map(([k, v, c]) => `<div class="mini-stat"><div class="mini-stat-label">${k}</div><div class="mini-stat-value" style="color:${c}">${v}</div></div>`).join("");

  const petrol = latest.manual?.petrol;
  const diesel = latest.manual?.diesel;
  $("#fuel-kv-list").innerHTML = [
    ["Petrol", petrol ? fmtPKR(petrol.pkr_per_litre, 2) + "/L" : "—"],
    ["Diesel (HSD)", diesel ? fmtPKR(diesel.pkr_per_litre, 2) + "/L" : "—"],
    ["Last Change", petrol ? `${petrol.change_pkr >= 0 ? "+" : ""}₨${petrol.change_pkr} on ${petrol.effective_date}` : "—"],
    ["Source", petrol?.source || "OGRA / PSO"],
  ].map(([k, v]) => `<div class="kv-row"><span class="kv-key">${k}</span><span class="kv-val">${v}</span></div>`).join("");

  $("#fx-kv-list").innerHTML = [
    ["USD / PKR", latest.usd_pkr ? fmtPKR(latest.usd_pkr, 2) : "—"],
    ["Gold spot (USD/oz)", gold ? fmtUSD(gold.usd_per_oz, 2) : "—"],
    ["Updated", timeAgo(latest.fetched_at_utc)],
  ].map(([k, v]) => `<div class="kv-row"><span class="kv-key">${k}</span><span class="kv-val">${v}</span></div>`).join("");
}

/* ---------------------------------------------------------------------------
   Canvas line chart (lightweight, no library)
--------------------------------------------------------------------------- */

function drawLineChart(canvas, points, opts = {}) {
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(rect.width, 280);
  const h = canvas.height || 200;

  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";

  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const padding = { top: 14, right: 12, bottom: 22, left: 54 };
  const plotW = w - padding.left - padding.right;
  const plotH = h - padding.top - padding.bottom;

  const validPoints = points.filter(p => p.value !== null && p.value !== undefined && !Number.isNaN(p.value));
  if (validPoints.length < 2) {
    ctx.fillStyle = "#3a4255";
    ctx.font = "12px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Not enough data yet — check back after a few refreshes", w / 2, h / 2);
    return;
  }

  const values = validPoints.map(p => p.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * 0.1;
  min -= pad; max += pad;

  const color = opts.color || ACCENTS.green;

  function xFor(i) { return padding.left + (i / (validPoints.length - 1)) * plotW; }
  function yFor(v) { return padding.top + (1 - (v - min) / (max - min)) * plotH; }

  // Grid lines + Y labels
  ctx.strokeStyle = "#1e2536";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#4a5568";
  ctx.font = "10px IBM Plex Mono, monospace";
  ctx.textAlign = "right";
  const gridLines = 4;
  for (let g = 0; g <= gridLines; g++) {
    const v = min + (max - min) * (g / gridLines);
    const y = yFor(v);
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(w - padding.right, y);
    ctx.stroke();
    ctx.fillText(opts.formatY ? opts.formatY(v) : Math.round(v).toLocaleString(), padding.left - 8, y + 3);
  }

  // X labels (sparse)
  ctx.textAlign = "center";
  const labelEvery = Math.max(1, Math.ceil(validPoints.length / 6));
  validPoints.forEach((p, i) => {
    if (i % labelEvery === 0 || i === validPoints.length - 1) {
      ctx.fillText(p.label, xFor(i), h - 6);
    }
  });

  // Area fill
  const gradient = ctx.createLinearGradient(0, padding.top, 0, h - padding.bottom);
  gradient.addColorStop(0, color + "4D"); // ~30% opacity
  gradient.addColorStop(1, color + "00");
  ctx.beginPath();
  ctx.moveTo(xFor(0), yFor(validPoints[0].value));
  validPoints.forEach((p, i) => ctx.lineTo(xFor(i), yFor(p.value)));
  ctx.lineTo(xFor(validPoints.length - 1), h - padding.bottom);
  ctx.lineTo(xFor(0), h - padding.bottom);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  // Line
  ctx.beginPath();
  ctx.moveTo(xFor(0), yFor(validPoints[0].value));
  validPoints.forEach((p, i) => ctx.lineTo(xFor(i), yFor(p.value)));
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.25;
  ctx.lineJoin = "round";
  ctx.stroke();

  // Last point dot
  const lastIdx = validPoints.length - 1;
  ctx.beginPath();
  ctx.arc(xFor(lastIdx), yFor(validPoints[lastIdx].value), 3.5, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function historyToPoints(field, rangeFilter) {
  let rows = state.history;
  if (rangeFilter === "6M") rows = rows.slice(-Math.min(rows.length, 1800)); // ~6mo @5min cadence cap
  if (rangeFilter === "1Y") rows = rows.slice(-Math.min(rows.length, 2000));
  return rows.map(r => ({
    value: r[field],
    label: new Date(r.t).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
  }));
}

function renderCharts() {
  if (!state.history.length) return;

  drawLineChart($("#chart-kse-overview"), historyToPoints("kse100", state.kseRange), {
    color: ACCENTS.green,
    formatY: v => (v / 1000).toFixed(0) + "K",
  });
  drawLineChart($("#chart-kse-extended"), historyToPoints("kse100", "ALL"), {
    color: ACCENTS.green,
    formatY: v => (v / 1000).toFixed(0) + "K",
  });
  drawLineChart($("#chart-oil"), historyToPoints("oil_brent", "ALL"), {
    color: ACCENTS.blue,
    formatY: v => "$" + v.toFixed(0),
  });
  drawLineChart($("#chart-gold"), historyToPoints("gold_tola", "ALL"), {
    color: ACCENTS.amber,
    formatY: v => (v / 1000).toFixed(0) + "K",
  });

  const lastTwo = state.history.slice(-2);
  if (lastTwo.length === 2 && lastTwo[0].kse100 && lastTwo[1].kse100) {
    $("#kse-footnote").textContent = `${state.history.length} data points tracked since ${new Date(state.history[0].t).toLocaleDateString()}`;
  }
}

/* ---------------------------------------------------------------------------
   Section title accent colours (set once on load)
--------------------------------------------------------------------------- */

function applyAccents() {
  $all(".section-title[data-accent]").forEach(el => setAccent(el, el.dataset.accent));
  $all(".stat-card[data-accent]").forEach(el => el.style.setProperty("--accent-color", el.dataset.accent));
}

/* ---------------------------------------------------------------------------
   Master render
--------------------------------------------------------------------------- */

function renderAll() {
  renderTopBar();
  renderOverviewStats();
  renderFeed();
  renderMarketTab();
  renderMacroTab();
  renderCommoditiesTab();
  renderCharts();
}

/* ---------------------------------------------------------------------------
   Tabs
--------------------------------------------------------------------------- */

function setupTabs() {
  $all(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      $all(".tab").forEach(b => { b.classList.remove("active"); b.setAttribute("aria-selected", "false"); });
      btn.classList.add("active");
      btn.setAttribute("aria-selected", "true");

      $all(".panel").forEach(p => { p.classList.remove("active"); p.hidden = true; });
      const target = $("#panel-" + btn.dataset.tab);
      target.classList.add("active");
      target.hidden = false;

      // Charts need re-measuring after becoming visible
      requestAnimationFrame(renderCharts);
    });
  });
}

function setupRangeToggle() {
  $all("#kse-range-toggle .range-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      $all("#kse-range-toggle .range-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.kseRange = btn.dataset.range;
      renderCharts();
    });
  });
}

/* ---------------------------------------------------------------------------
   Boot
--------------------------------------------------------------------------- */

window.addEventListener("resize", () => requestAnimationFrame(renderCharts));

function init() {
  applyAccents();
  setupTabs();
  setupRangeToggle();
  loadData();
  setInterval(loadData, POLL_INTERVAL_MS);
}

document.addEventListener("DOMContentLoaded", init);
