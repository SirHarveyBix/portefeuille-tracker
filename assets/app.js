/* =============================================================
   Suivi de portefeuille — logique applicative (script classique)

   CONFIDENTIALITÉ
   - Le CSV de transactions est lu et traité dans le navigateur.
     Il n'est JAMAIS téléversé ni écrit dans Firebase.
   - Seules les valeurs d'allocation (saisie manuelle) sont
     persistées : en local par défaut, ou dans Firestore si une
     configuration Firebase est fournie (assets/config.js).

   SÉCURITÉ (mode en ligne)
   - L'app passe derrière une connexion Google.
   - Seul le compte propriétaire (OWNER_EMAIL) est accepté côté
     interface, et les règles Firestore (firestore.rules)
     verrouillent l'accès côté serveur (uid + e-mail vérifié).

   VIX
   - Valeur récupérée depuis une source de marché réelle
     (CBOE officiel par défaut), jamais inventée. Repli manuel
     possible si la source est indisponible.

   Sommaire : 0 version  1 constantes  2 utils  3 stockage+auth
              4 état  5 vue d'ensemble  6 constellation
              7 allocation  8 VIX  9 navigation/init
   ============================================================= */
(function () {
"use strict";

/* ---------- 0. VERSION & CHANGELOG -------------------------- */
const APP_VERSION = "1.2.1";
const CHANGELOG = [
  { v: "1.2.1", date: "2026-06-18", items: [
      "Le chargeur CSV est masqué dans l'onglet Allocation.",
      "Nouvelle icône de chargement (plus propre) à la place du symbole ↻.",
  ]},
  { v: "1.2.0", date: "2026-06-18", items: [
      "VIX récupéré depuis une source de marché réelle (CBOE officiel par défaut, proxy ou Twelve Data en option) — plus aucune valeur saisie à la main par défaut.",
      "Prix de revient unitaire (PRU) et quantité affichés par position.",
      "Export en un clic de la liste d'ordres du mois (cœur + satellite).",
      "Indicateur du nombre de lignes hors bande de rééquilibrage.",
      "Sécurité : règle Firestore exigeant un e-mail vérifié ; connexion par redirection en repli (Safari/PWA) ; écritures espacées.",
  ]},
  { v: "1.1.0", date: "2026-06-18", items: [
      "Interface mobile repensée (carrousel KPI, cartes d'allocation, navigation basse, constellation plein écran).",
      "Stockage en ligne optionnel via Firebase (Firestore) avec connexion Google, restreint au compte propriétaire.",
      "Repli automatique en stockage local.",
  ]},
  { v: "1.0.0", date: "2026-06-18", items: [
      "Première version : Vue d'ensemble, Constellation, Allocation.",
      "Chargement CSV 100 % local, sauvegarde locale + export/import JSON.",
      "Rééquilibrage par allocation cible, moyenne mensuelle nette.",
  ]},
];

/* ---------- 1. CONSTANTES ----------------------------------- */
const CLASS_META = {
  FUND:   { label: "Fonds / ETF", hex: "#e8b339" },
  STOCK:  { label: "Actions",     hex: "#5b8def" },
  CRYPTO: { label: "Crypto",      hex: "#a07bf0" },
  OTHER:  { label: "Autre",       hex: "#8093b3" },
};
const cls = (c) => CLASS_META[c] || CLASS_META.OTHER;
const ACOLORS = ["#5b8def","#9aa3b2","#e8b339","#e0705c","#46cca3","#a07bf0","#e879c9","#5fd0e0"];
const MONTHS = ["janv.","févr.","mars","avr.","mai","juin","juil.","août","sept.","oct.","nov.","déc."];
const REDUCED = window.matchMedia("(prefers-reduced-motion:reduce)").matches;
const ALLOC_KEY = "pf-alloc-v1";
const DRIFT_BAND = 5;          // points d'écart cible/réel au-delà desquels on signale un rééquilibrage
const CFG = window.APP_CONFIG || {};
const VIXCFG = CFG.VIX || { source: "cboe" };
const CBOE_VIX_CSV = "https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv";

const ALLOC_SEED = {
  monthly: 100,
  core: [
    { name: "Actions Monde (ex. ACWI)", amount: 800, target: 50 },
    { name: "Thématique 1",             amount: 240, target: 15 },
    { name: "Thématique 2",             amount: 240, target: 15 },
    { name: "Thématique 3",             amount: 160, target: 10 },
    { name: "Or physique",              amount: 160, target: 10 },
  ],
  sat: [
    { name: "Argent",  amount: 40,  target: 2 },
    { name: "Bitcoin", amount: 160, target: 10 },
  ],
  vix: 0, vixTs: 0, vixDate: "",
};

/* ---------- 2. UTILITAIRES ---------------------------------- */
const $  = (id) => document.getElementById(id);
const NS = "http://www.w3.org/2000/svg";
const svgEl = (n, a) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); return e; };
const eur0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const eur2 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtEur = (n, d = 0) => (d ? eur2 : eur0).format(n) + " €";
const fmtNum = (n, d = 2) => n.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtDate = (s) => { const [y, m, d] = s.split("-"); return `${d}/${m}/${y.slice(2)}`; };
const shortName = (n) => n.replace(/\s*(USD|EUR)?\s*\(Acc\)\s*$/i, "").trim();
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
const num = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };

async function fetchWithTimeout(url, ms = 7000) {
  const ctrl = new AbortController(), to = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { signal: ctrl.signal }); }
  finally { clearTimeout(to); }
}

function parseCSV(text) {
  text = text.replace(/^\uFEFF/, "");
  const rows = []; let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const head = (rows.shift() || []).map((h) => h.trim());
  return rows.filter((r) => r.length > 1).map((r) => { const o = {}; head.forEach((h, i) => (o[h] = (r[i] ?? "").trim())); return o; });
}

function donut(host, segments, centerTop, centerBottom) {
  host.innerHTML = "";
  const total = segments.reduce((s, x) => s + x.value, 0) || 1, C = 2 * Math.PI * 48;
  const svg = svgEl("svg", { viewBox: "0 0 140 140", width: 140, height: 140 });
  let off = 0;
  segments.forEach((seg) => {
    const frac = seg.value / total;
    svg.appendChild(svgEl("circle", { cx: 70, cy: 70, r: 48, fill: "none", stroke: seg.color, "stroke-width": 20,
      "stroke-dasharray": `${frac * C} ${C}`, "stroke-dashoffset": -off * C, transform: "rotate(-90 70 70)" }));
    off += frac;
  });
  const g = svgEl("g", { class: "donut-center" });
  g.innerHTML =
    `<text x="70" y="${centerBottom ? 66 : 74}" style="font-family:'Space Grotesk';font-weight:600;font-size:${centerBottom ? 19 : 13}px;fill:${centerBottom ? "var(--ink)" : "var(--muted)"}">${centerTop}</text>` +
    (centerBottom ? `<text x="70" y="84" style="font-family:'JetBrains Mono';font-size:9.5px;fill:var(--muted)">${centerBottom}</text>` : "");
  svg.appendChild(g); host.appendChild(svg);
}
function legend(host, rows) {
  host.innerHTML = rows.map((r) =>
    `<div class="lrow"><span class="lswatch" style="background:${r.color}"></span>` +
    `<span class="lname">${esc(r.name)}</span>` +
    (r.val != null ? `<span class="lval">${r.val}</span>` : "") +
    (r.right != null ? `<span class="lpct"${r.title ? ` title="${esc(r.title)}"` : ""}${r.rightColor ? ` style="color:${r.rightColor}"` : ""}>${r.right}</span>` : "") +
    `</div>`).join("");
}

/* ---------- 3. STOCKAGE + AUTHENTIFICATION ------------------ */
const MEM = {};
let fb = null;
const Store = {
  mode: "local",
  async load() {
    if (this.mode === "firebase" && fb) {
      try { const d = await fb.db.collection("portfolios").doc(fb.uid).get(); return d.exists ? (d.data().alloc || null) : null; }
      catch (e) { console.warn("Firestore load:", e); return null; }
    }
    try { const v = localStorage.getItem(ALLOC_KEY); return v ? JSON.parse(v) : null; }
    catch (e) { return MEM[ALLOC_KEY] ?? null; }
  },
  save(cfg) {
    if (this.mode === "firebase" && fb) {
      fb.db.collection("portfolios").doc(fb.uid).set({ alloc: cfg, updatedAt: Date.now() }, { merge: true }).catch((e) => console.warn("Firestore save:", e));
      return;
    }
    try { localStorage.setItem(ALLOC_KEY, JSON.stringify(cfg)); } catch (e) { MEM[ALLOC_KEY] = cfg; }
  },
};

function startFirebase() {
  document.body.classList.add("gated");
  firebase.initializeApp(CFG.FIREBASE);
  const auth = firebase.auth(), db = firebase.firestore();
  auth.getRedirectResult().catch(() => {});           // termine une éventuelle connexion par redirection
  auth.onAuthStateChanged(async (user) => {
    if (!user) { openGate(auth, ""); return; }
    const email = (user.email || "").toLowerCase();
    if (CFG.OWNER_EMAIL && email !== String(CFG.OWNER_EMAIL).toLowerCase()) {
      await auth.signOut().catch(() => {});
      openGate(auth, "Compte non autorisé : " + (user.email || "") + "."); return;
    }
    fb = { auth, db, uid: user.uid };
    Store.mode = "firebase";
    closeGate(); document.body.classList.remove("gated");
    renderAccount(user, auth);
    ALLOC = (await Store.load()) || JSON.parse(JSON.stringify(ALLOC_SEED));
    renderAlloc();
  });
}
function openGate(auth, msg) {
  document.body.classList.add("gated");
  $("authgate").classList.add("open");
  $("ag-msg").textContent = msg || "";
  $("ag-btn").onclick = () => {
    const p = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(p).catch((e) => {
      const code = e && e.code;
      if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment" || code === "auth/cancelled-popup-request") {
        auth.signInWithRedirect(p);                    // repli Safari / PWA plein écran
      } else { $("ag-msg").textContent = "Échec de connexion. Réessaie."; }
    });
  };
}
function closeGate() { $("authgate").classList.remove("open"); }
function renderAccount(user, auth) {
  const el = $("account"); el.style.display = "flex";
  el.innerHTML = `<span class="acc-email">${esc(user.email || "connecté")}</span><button class="acc-out">Déconnexion</button>`;
  el.querySelector(".acc-out").onclick = () => auth.signOut();
}

/* ---------- 4. ÉTAT ----------------------------------------- */
let MODEL = null, ALLOC = null, SIM = null;
let LAST_ORDERS = { core: [], sat: [], total: 0 };
let vixManual = false, vixStatus = null, vixAutoTried = false;

/* ---------- 5. VUE D'ENSEMBLE ------------------------------- */
function build(rows) {
  const t = rows.filter((r) => (r.category || "").toUpperCase() === "TRADING").map((r) => ({
    date: r.date, type: (r.type || "").toUpperCase(), ac: (r.asset_class || "OTHER").toUpperCase(),
    name: r.name || r.symbol || "—", symbol: r.symbol || "", shares: Math.abs(num(r.shares)),
    price: num(r.price), amount: num(r.amount), fee: num(r.fee),
  })).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (!t.length) return { t: [] };

  const buys = t.filter((r) => r.type === "BUY"), sells = t.filter((r) => r.type === "SELL");
  const bought = buys.reduce((s, r) => s - r.amount, 0), sold = sells.reduce((s, r) => s + r.amount, 0);
  const fees = t.reduce((s, r) => s - r.fee, 0), netDeployed = bought - sold;

  const byInstr = {};
  t.forEach((r) => {
    (byInstr[r.name] ||= { name: r.name, ac: r.ac, net: 0, shares: 0, buys: 0, bAmt: 0, bSh: 0 });
    const o = byInstr[r.name];
    o.net += -r.amount;
    o.shares += (r.type === "SELL" ? -1 : 1) * r.shares;
    if (r.type === "BUY") { o.buys++; o.bAmt += -r.amount; o.bSh += r.shares; }
  });
  const instruments = Object.values(byInstr).filter((i) => i.net > 1)
    .map((i) => ({ ...i, avgCost: i.bSh > 0 ? i.bAmt / i.bSh : 0 }))
    .sort((a, b) => b.net - a.net);
  const totalNet = instruments.reduce((s, i) => s + i.net, 0);

  const byClass = {};
  instruments.forEach((i) => (byClass[i.ac] = (byClass[i.ac] || 0) + i.net));
  const classes = Object.entries(byClass).map(([k, v]) => ({ ac: k, val: v })).sort((a, b) => b.val - a.val);

  const dayMap = {}; t.forEach((r) => (dayMap[r.date] = (dayMap[r.date] || 0) + -r.amount));
  let cum = 0; const series = Object.keys(dayMap).sort().map((d) => ((cum += dayMap[d]), { date: d, val: cum }));

  const monMap = {}, monSold = {};
  t.forEach((r) => { const k = r.date.slice(0, 7); monMap[k] = (monMap[k] || 0) + -r.amount; if (r.type === "SELL") monSold[k] = (monSold[k] || 0) + r.amount; });
  const months = Object.keys(monMap).sort().map((k) => ({ key: k, val: monMap[k], sold: monSold[k] || 0, label: MONTHS[parseInt(k.slice(5, 7), 10) - 1] }));
  const avgMonth = months.length ? months.reduce((s, m) => s + m.val, 0) / months.length : 0;

  return { t, buys, sells, bought, sold, fees, netDeployed, instruments, totalNet, classes, series, months, avgMonth };
}

function renderKpis(m) {
  const cards = [
    { l: "Capital net déployé", v: fmtEur(m.netDeployed), s: m.t.length + " transactions", a: "var(--gold)" },
    { l: "Moyenne nette / mois", v: fmtEur(m.avgMonth), s: "ventes déduites · " + m.months.length + " mois", a: "var(--teal)" },
    { l: "Positions", v: m.instruments.length, s: m.classes.length + " classes d'actif", a: "var(--cobalt)" },
    { l: "Produit des ventes", v: fmtEur(m.sold), s: m.sells.length + " ventes", a: "var(--violet)" },
    { l: "Frais payés", v: fmtEur(m.fees, 2), s: "ordres + plan d'épargne", a: "var(--coral)" },
  ];
  $("kpis").innerHTML = cards.map((c) =>
    `<div class="kpi" style="--accent:${c.a}"><div class="klabel"><span class="kdot"></span>${c.l}</div>` +
    `<div class="kval">${c.v}</div><div class="ksub">${c.s}</div></div>`).join("");
}

function renderCurve(m) {
  const host = $("chart"); host.querySelectorAll("svg,.tip").forEach((e) => e.remove());
  const s = m.series; if (!s.length) return;
  const W = 680, H = 240, P = { t: 14, r: 14, b: 26, l: 50 }, iw = W - P.l - P.r, ih = H - P.t - P.b;
  const t0 = new Date(s[0].date).getTime(), t1 = new Date(s[s.length - 1].date).getTime(), span = Math.max(1, t1 - t0);
  const maxV = Math.max(...s.map((p) => p.val)) * 1.08 || 1;
  const X = (d) => P.l + ((new Date(d).getTime() - t0) / span) * iw, Y = (v) => P.t + ih - (v / maxV) * ih;
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none" });
  const defs = document.createElementNS(NS, "defs");
  defs.innerHTML = `<linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#e8b339" stop-opacity="0.32"/><stop offset="100%" stop-color="#e8b339" stop-opacity="0"/></linearGradient>`;
  svg.appendChild(defs);
  for (let i = 0; i <= 4; i++) {
    const v = (maxV * i) / 4, y = Y(v);
    svg.appendChild(svgEl("line", { class: "grid-line", x1: P.l, x2: W - P.r, y1: y, y2: y }));
    const tx = svgEl("text", { class: "axis-label", x: P.l - 8, y: y + 3, "text-anchor": "end" }); tx.textContent = Math.round(v) + "€"; svg.appendChild(tx);
  }
  [s[0], s[Math.floor(s.length / 2)], s[s.length - 1]].forEach((p, i) => {
    const tx = svgEl("text", { class: "axis-label", x: X(p.date), y: H - 8, "text-anchor": i === 0 ? "start" : i === 2 ? "end" : "middle" }); tx.textContent = fmtDate(p.date); svg.appendChild(tx);
  });
  let d = `M ${X(s[0].date)} ${Y(s[0].val)}`; s.forEach((p) => (d += ` L ${X(p.date)} ${Y(p.val)}`));
  svg.appendChild(svgEl("path", { d: `${d} L ${X(s[s.length - 1].date)} ${Y(0)} L ${X(s[0].date)} ${Y(0)} Z`, fill: "url(#ag)" }));
  const line = svgEl("path", { d, class: "area-line" }); svg.appendChild(line);
  if (!REDUCED) { const len = line.getTotalLength(); line.style.strokeDasharray = len; line.style.strokeDashoffset = len;
    requestAnimationFrame(() => { line.style.transition = "stroke-dashoffset 1s ease"; line.style.strokeDashoffset = 0; }); }
  m.sells.forEach((r) => { const pt = s.find((p) => p.date === r.date); if (pt) svg.appendChild(svgEl("circle", { class: "sell-dot", cx: X(pt.date), cy: Y(pt.val), r: 4 })); });
  const hl = svgEl("line", { class: "hover-line", y1: P.t, y2: P.t + ih }); hl.style.opacity = 0; svg.appendChild(hl); host.appendChild(svg);
  const tip = document.createElement("div"); tip.className = "tip"; host.appendChild(tip);
  svg.addEventListener("mousemove", (e) => {
    const r = svg.getBoundingClientRect(), px = ((e.clientX - r.left) / r.width) * W;
    let best = s[0], bd = 1e9; s.forEach((p) => { const dd = Math.abs(X(p.date) - px); if (dd < bd) { bd = dd; best = p; } });
    const xx = X(best.date); hl.setAttribute("x1", xx); hl.setAttribute("x2", xx); hl.style.opacity = 1;
    tip.style.opacity = 1; tip.style.left = (xx / W) * r.width + "px"; tip.style.top = (Y(best.val) / H) * r.height + "px";
    tip.innerHTML = `<div class="tdate">${fmtDate(best.date)}</div><div class="tval">${fmtEur(best.val)}</div>`;
  });
  svg.addEventListener("mouseleave", () => { hl.style.opacity = 0; tip.style.opacity = 0; });
}

function renderMonths(m) {
  const host = $("mbars");
  const vals = m.months.map((x) => x.val), maxAbs = Math.max(...vals.map((v) => Math.abs(v)), 1), peakV = Math.max(...vals);
  $("month-hint").textContent = "achats − reventes · moyenne " + fmtEur(m.avgMonth) + " / mois";
  host.innerHTML = m.months.map((x) => {
    const neg = x.val < 0, peak = x.val === peakV && !neg, klass = neg ? "neg" : peak ? "peak" : "";
    const dot = x.sold > 0.5 ? `<span class="msold" title="${fmtEur(x.sold, 0)} revendus ce mois">↺</span>` : "";
    return `<div class="mcol ${klass}"><span class="mval">${fmtEur(x.val)}${dot}</span>` +
      `<div class="mbar" data-h="${Math.max(3, (Math.abs(x.val) / maxAbs) * 100)}"></div><span class="mlab">${x.label}</span></div>`;
  }).join("");
  const innerH = (host.clientHeight || 150) - 22;
  const avgPx = 22 + Math.max(0, Math.min(1, m.avgMonth / maxAbs)) * innerH;
  const ln = document.createElement("div"); ln.className = "mavg-line"; ln.style.bottom = avgPx + "px";
  const tag = document.createElement("div"); tag.className = "mavg-tag"; tag.style.bottom = avgPx + "px"; tag.textContent = "moy. nette " + fmtEur(m.avgMonth);
  host.appendChild(ln); host.appendChild(tag);
  requestAnimationFrame(() => host.querySelectorAll(".mbar").forEach((b) => (b.style.height = b.dataset.h + "%")));
}

function renderClassDonut(m) {
  donut($("donut"), m.classes.map((c) => ({ value: c.val, color: cls(c.ac).hex })), fmtEur(m.totalNet), "net investi");
  const total = m.totalNet || 1;
  legend($("legend"), m.classes.map((c) => ({ color: cls(c.ac).hex, name: cls(c.ac).label, val: fmtEur(c.val), right: (c.val / total * 100).toFixed(1) + "%" })));
}

function renderBars(m) {
  const max = Math.max(...m.instruments.map((i) => i.net), 1);
  $("bars").innerHTML = m.instruments.map((i) => {
    const pru = i.avgCost ? `PRU ${fmtNum(i.avgCost, i.avgCost < 10 ? 4 : 2)} € · ${fmtNum(Math.abs(i.shares), i.shares < 1 ? 4 : 2)} parts` : "";
    return `<div class="bar"><div class="btop"><span class="bname" title="${esc(i.name)}">${esc(i.name)}</span>` +
      `<span class="bval">${fmtEur(i.net)}</span></div>` +
      (pru ? `<div class="bsub">${pru}</div>` : "") +
      `<div class="btrack"><div class="bfill" style="background:${cls(i.ac).hex}" data-w="${(i.net / max) * 100}"></div></div></div>`;
  }).join("");
  requestAnimationFrame(() => document.querySelectorAll(".bfill").forEach((b) => (b.style.width = b.dataset.w + "%")));
}

let TABLE = [], sortKey = "date", sortDir = -1, filter = "ALL";
function renderTable() {
  let rows = TABLE.filter((r) => filter === "ALL" || r.type === filter);
  rows.sort((a, b) => { const x = a[sortKey], y = b[sortKey]; return typeof x === "string" ? (x < y ? -1 : x > y ? 1 : 0) * sortDir : (x - y) * sortDir; });
  $("tbody").innerHTML = rows.map((r) =>
    `<tr><td class="num" data-label="Date" style="color:var(--muted)">${fmtDate(r.date)}</td>` +
    `<td class="name" data-label="Instrument">${esc(r.name)}</td>` +
    `<td data-label="Sens"><span class="badge ${r.type === "BUY" ? "buy" : "sell"}">${r.type === "BUY" ? "Achat" : "Vente"}</span></td>` +
    `<td class="num" data-label="Parts">${r.shares ? fmtNum(r.shares, r.shares < 1 ? 4 : 2) : "—"}</td>` +
    `<td class="num" data-label="Prix">${r.price ? fmtNum(r.price) : "—"}</td>` +
    `<td class="num ${r.amount >= 0 ? "pos" : "neg"}" data-label="Montant €">${fmtNum(r.amount)}</td>` +
    `<td class="num" data-label="Frais €" style="color:var(--muted)">${r.fee ? fmtNum(r.fee) : "—"}</td></tr>`
  ).join("") || `<tr><td class="empty">Aucune transaction</td></tr>`;
}

/* ---------- 6. CONSTELLATION (dimensions adaptatives) ------- */
function stopSim() { if (SIM) { cancelAnimationFrame(SIM); SIM = null; } }
function renderConstellation(m) {
  const stage = $("stage"); stage.querySelectorAll("svg").forEach((e) => e.remove());
  const data = m.instruments, rect = stage.getBoundingClientRect();
  const W = Math.max(300, Math.round(rect.width || 720)), H = Math.max(320, Math.round(rect.height || 470));
  const cx = W / 2, cy = H / 2, base = Math.min(W, H);
  const rmax = Math.max(34, Math.min(78, base * 0.2)), rmin = Math.max(13, rmax * 0.34);
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "xMidYMid meet" }); stage.appendChild(svg);
  const vals = data.map((d) => d.net), mn = Math.min(...vals), mx = Math.max(...vals);
  const radius = (v) => mx === mn ? (rmin + rmax) / 2 : rmin + ((Math.sqrt(v) - Math.sqrt(mn)) / (Math.sqrt(mx) - Math.sqrt(mn))) * (rmax - rmin);

  const top = data[0], small = data[data.length - 1];
  $("feature").innerHTML =
    `<div class="ck"><span class="cdot" style="background:${cls(top.ac).hex}"></span>Plus gros investissement</div>` +
    `<div class="cname">${esc(shortName(top.name))}</div><div class="camt">${fmtEur(top.net)}</div>` +
    `<div class="cmeta">${(top.net / m.totalNet * 100).toFixed(1)}% du portefeuille · ${cls(top.ac).label} · ${top.buys} achat${top.buys > 1 ? "s" : ""}</div>`;
  $("cstats").innerHTML =
    `Plus petite position : <b style="color:var(--ink)">${esc(shortName(small.name))}</b> (${fmtEur(small.net)})<br>` +
    `${data.length} positions · moyenne <b style="color:var(--ink)">${fmtEur(m.avgMonth)}</b>/mois investis`;

  const nodes = data.map((d, i) => ({ ...d, r: radius(d.net), x: cx + (Math.random() - 0.5) * Math.min(120, W * 0.3), y: -40 - Math.random() * 260, vx: 0, vy: 0, top: i === 0 }));
  nodes.forEach((n) => {
    const g = svgEl("g", { class: "bubble" }); g.style.setProperty("--glow", cls(n.ac).hex);
    g.appendChild(svgEl("circle", { r: n.r, fill: cls(n.ac).hex, "fill-opacity": ".92" }));
    if (n.r > 30) { const t1 = svgEl("text", { "font-size": Math.min(15, n.r / 3.4), dy: n.r > 44 ? "-2" : "3" }); t1.textContent = shortName(n.name).slice(0, n.r > 52 ? 16 : 11); g.appendChild(t1); }
    if (n.r > 44) { const t2 = svgEl("text", { class: "bsub", "font-size": Math.min(12, n.r / 5), dy: "15" }); t2.textContent = fmtEur(n.net); g.appendChild(t2); }
    n._g = g; svg.appendChild(g);
    g.addEventListener("mouseenter", () => hot(n)); g.addEventListener("mouseleave", cool); g.addEventListener("mousemove", (e) => moveTip(e, n));
  });
  const tip = $("ctip");
  function hot(n) {
    stage.classList.add("dim"); n._g.classList.add("hot");
    $("live").innerHTML =
      `<div class="ck"><span class="cdot" style="background:${cls(n.ac).hex}"></span>${cls(n.ac).label}</div>` +
      `<div class="cname">${esc(shortName(n.name))}</div><div class="camt" style="color:${cls(n.ac).hex}">${fmtEur(n.net)}</div>` +
      `<div class="cmeta">${(n.net / m.totalNet * 100).toFixed(1)}% du portefeuille · ${fmtNum(Math.abs(n.shares), n.shares < 1 ? 4 : 2)} parts${n.avgCost ? " · PRU " + fmtNum(n.avgCost, n.avgCost < 10 ? 4 : 2) + " €" : ""}</div>`;
  }
  function cool() { stage.classList.remove("dim"); stage.querySelectorAll(".bubble.hot").forEach((g) => g.classList.remove("hot")); tip.style.opacity = 0; }
  function moveTip(e, n) {
    const r = stage.getBoundingClientRect();
    tip.style.opacity = 1; tip.style.left = e.clientX - r.left + "px"; tip.style.top = e.clientY - r.top - 12 + "px";
    tip.innerHTML = `<div class="tdate">${esc(shortName(n.name))}</div><div class="tval">${fmtEur(n.net)}</div>`;
  }
  const paint = () => nodes.forEach((n) => n._g.setAttribute("transform", `translate(${n.x},${n.y})`));
  stopSim(); let alpha = 1;
  function tick() {
    alpha *= 0.992;
    for (const n of nodes) { n.vx += (cx - n.x) * 0.0016; n.vy += (cy - n.y) * 0.0016;
      if (!REDUCED) { n.vx += (Math.random() - 0.5) * 0.05 * alpha; n.vy += (Math.random() - 0.5) * 0.05 * alpha; } }
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j], dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy) || 0.01, min = a.r + b.r + 3;
      if (dist < min) { const p = ((min - dist) / dist) * 0.5, ox = dx * p, oy = dy * p; a.x -= ox; a.y -= oy; b.x += ox; b.y += oy; }
    }
    for (const n of nodes) { n.x += n.vx; n.y += n.vy; n.vx *= 0.86; n.vy *= 0.86;
      n.x = Math.max(n.r + 4, Math.min(W - n.r - 4, n.x)); n.y = Math.max(n.r + 4, Math.min(H - n.r - 4, n.y)); }
    paint();
    if (REDUCED && alpha < 0.05) return;
    SIM = requestAnimationFrame(tick);
  }
  if (REDUCED) { for (let k = 0; k < 260; k++) tick(); paint(); stopSim(); } else tick();
}

/* ---------- 7. ALLOCATION ----------------------------------- */
let saveT = null;
const persist = () => { clearTimeout(saveT); saveT = setTimeout(() => Store.save(ALLOC), Store.mode === "firebase" ? 1200 : 250); };
const aInvestCore = (a, t, ct, m) => Math.max(0, (ct + m) * t / 100 - a);
const aInvestSat  = (a, t, ct, m) => (ct + m) * t / 100 - a;
const round0 = (n) => Math.round(n);

function holdHTML(r, i, t) {
  const nm = esc(r.name || ("Ligne " + (i + 1)));
  return `<div class="hold" data-i="${i}" data-t="${t}">` +
    `<div class="hc hc-name"><input class="h-name" data-f="name" value="${esc(r.name)}" placeholder="Titre" aria-label="Nom — ${nm}"></div>` +
    `<div class="hc hc-num"><span class="h-lab">Montant €</span><input class="h-amount" data-f="amount" type="number" inputmode="decimal" step="1" value="${r.amount}" aria-label="Montant — ${nm}"></div>` +
    `<div class="hc hc-num"><span class="h-lab">% réel</span><span class="calc pctreel">—</span></div>` +
    `<div class="hc hc-num"><span class="h-lab">% cible</span><input class="h-target" data-f="target" type="number" inputmode="decimal" step="0.5" value="${r.target}" aria-label="Cible — ${nm}"></div>` +
    `<div class="hc hc-num"><span class="h-lab">À investir</span><span class="ainv">—</span></div>` +
    `<div class="hc hc-del"><button class="delrow" title="Supprimer" aria-label="Supprimer ${nm}">✕</button></div></div>`;
}

function renderAlloc() {
  if (!ALLOC) ALLOC = JSON.parse(JSON.stringify(ALLOC_SEED));
  $("a-monthly").value = ALLOC.monthly;
  $("core-list").innerHTML = ALLOC.core.map((r, i) => holdHTML(r, i, "core")).join("");
  $("sat-list").innerHTML = ALLOC.sat.map((r, i) => holdHTML(r, i, "sat")).join("");
  recompute();
  renderVix();
  maybeAutoVix();
}

function recompute() {
  const monthly = ALLOC.monthly || 0;
  const coreTotal = ALLOC.core.reduce((s, r) => s + (+r.amount || 0), 0);
  const satTotal = ALLOC.sat.reduce((s, r) => s + (+r.amount || 0), 0);
  let coreInvest = 0, targetSum = 0, driftCount = 0;
  const orders = { core: [], sat: [], total: 0 };

  $("core-list").querySelectorAll(".hold").forEach((row) => {
    const r = ALLOC.core[+row.dataset.i], amt = +r.amount || 0, tgt = +r.target || 0;
    const pr = coreTotal ? (amt / coreTotal) * 100 : 0, inv = aInvestCore(amt, tgt, coreTotal, monthly);
    coreInvest += inv; targetSum += tgt;
    if (Math.abs(pr - tgt) > DRIFT_BAND) driftCount++;
    if (round0(inv) >= 1) orders.core.push({ name: r.name || "—", inv: round0(inv) });
    row.querySelector(".pctreel").textContent = pr.toFixed(2) + " %";
    const a = row.querySelector(".ainv"); a.textContent = round0(inv) + " €"; a.className = "ainv " + (inv >= 1 ? "go" : "zero");
    row.classList.toggle("under", pr < tgt - 0.5); row.classList.toggle("over", pr > tgt + 0.5);
  });
  $("sat-list").querySelectorAll(".hold").forEach((row) => {
    const r = ALLOC.sat[+row.dataset.i], amt = +r.amount || 0, tgt = +r.target || 0;
    const pr = coreTotal ? (amt / coreTotal) * 100 : 0, inv = aInvestSat(amt, tgt, coreTotal, monthly);
    if (round0(inv) >= 1) orders.sat.push({ name: r.name || "—", inv: round0(inv) });
    row.querySelector(".pctreel").textContent = pr.toFixed(2) + " %";
    const a = row.querySelector(".ainv"); a.textContent = (inv >= 0 ? "" : "−") + Math.abs(round0(inv)) + " €";
    a.className = "ainv " + (inv >= 1 ? "go" : inv <= -1 ? "neg" : "zero");
    row.classList.toggle("over", inv < -0.5); row.classList.toggle("under", inv > 0.5);
  });
  orders.total = [...orders.core, ...orders.sat].reduce((s, o) => s + o.inv, 0);
  LAST_ORDERS = orders;

  $("core-foot").innerHTML = `<div class="holds-foot">` +
    `<div class="hc" data-label="">Portefeuille</div>` +
    `<div class="hc num" data-label="Montant">${round0(coreTotal)} €</div>` +
    `<div class="hc num" data-label="% réel">100 %</div>` +
    `<div class="hc num tsum ${Math.abs(targetSum - 100) < 0.5 ? "good" : "bad"}" data-label="Σ cibles">${targetSum.toFixed(0)} %</div>` +
    `<div class="hc num" data-label="À investir" style="color:var(--gold)">${round0(coreInvest)} €</div><div class="hc"></div></div>`;
  $("sat-foot").innerHTML = `<div class="holds-foot">` +
    `<div class="hc" data-label="">Sous-total</div>` +
    `<div class="hc num" data-label="Montant">${round0(satTotal)} €</div>` +
    `<div class="hc num" data-label="% du cœur">${coreTotal ? (satTotal / coreTotal * 100).toFixed(2) : "0"} %</div>` +
    `<div class="hc"></div><div class="hc"></div><div class="hc"></div></div>`;

  const chips = [
    { l: "Total portefeuille", v: round0(coreTotal + satTotal) + " €", c: "" },
    { l: "À investir ce mois", v: round0(coreInvest) + " €", c: "ok" },
    { l: "Somme des cibles", v: targetSum.toFixed(0) + " %", c: Math.abs(targetSum - 100) < 0.5 ? "ok" : "warn" },
    { l: "Hors bande ±" + DRIFT_BAND + "pts", v: driftCount + (driftCount > 1 ? " lignes" : " ligne"), c: driftCount ? "warn" : "ok" },
  ];
  $("a-chips").innerHTML = chips.map((c) => `<div class="achip ${c.c}"><div class="cl">${c.l}</div><div class="cv">${c.v}</div></div>`).join("");

  renderAllocDonut(coreTotal);
  persist();
}

function renderAllocDonut(coreTotal) {
  const data = ALLOC.core.filter((r) => (+r.target || 0) > 0);
  donut($("a-donut"), data.map((r, i) => ({ value: +r.target || 0, color: ACOLORS[i % ACOLORS.length] })), "cible");
  legend($("a-legend"), data.map((r, i) => {
    const pr = coreTotal ? (+r.amount || 0) / coreTotal * 100 : 0, tgt = +r.target || 0, gap = pr - tgt;
    return { color: ACOLORS[i % ACOLORS.length], name: r.name || "—", right: (gap >= 0 ? "+" : "−") + Math.abs(gap).toFixed(1),
      rightColor: Math.abs(gap) < 0.6 ? "var(--muted)" : gap < 0 ? "var(--teal)" : "var(--coral)", title: `réel ${pr.toFixed(1)}% vs cible ${tgt}%` };
  }));
}

function copyOrders() {
  const o = LAST_ORDERS, today = new Date().toLocaleDateString("fr-FR");
  let txt = `Ordres du mois — ${today}\n`;
  if (o.core.length) { txt += `\nCœur :\n` + o.core.map((x) => `  • ${x.name} : ${x.inv} €`).join("\n"); }
  if (o.sat.length)  { txt += `\n\nSatellite :\n` + o.sat.map((x) => `  • ${x.name} : ${x.inv} €`).join("\n"); }
  txt += `\n\nTotal à investir : ${o.total} €`;
  if (!o.core.length && !o.sat.length) txt = "Aucun ordre à passer ce mois (tout est à la cible).";
  const btn = $("a-orders");
  const done = () => { const t = btn.textContent; btn.textContent = "✓ copié"; setTimeout(() => (btn.textContent = t), 1600); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done).catch(() => alert(txt));
  else alert(txt);
}

/* ---------- 8. VIX (source de marché réelle) ---------------- */
function vixRegime(v) {
  if (v <= 0) return { label: "—", color: "var(--muted)", note: "Aucune valeur disponible pour l'instant." };
  if (v < 15) return { label: "CALME", color: "var(--teal)", note: "Volatilité faible — conditions sereines." };
  if (v < 20) return { label: "NORMAL", color: "var(--cobalt)", note: "Régime de volatilité habituel." };
  if (v < 28) return { label: "ÉLEVÉ", color: "var(--gold)", note: "Volatilité élevée — marché nerveux ; certains lissent leurs achats." };
  return { label: "STRESS", color: "var(--coral)", note: "Forte volatilité — phase de stress, à aborder avec discipline." };
}
function vixSourceLabel() {
  return ({ cboe: "CBOE", proxy: "proxy", twelvedata: "Twelve Data" })[VIXCFG.source] || "source";
}
function renderVix() {
  const v = +ALLOC.vix || 0, reg = vixRegime(v), pos = Math.max(0, Math.min(100, (v / 50) * 100));
  const active = VIXCFG.source && VIXCFG.source !== "off";
  const showInput = vixManual || !active;
  const valHTML = showInput
    ? `<input id="vix-in" type="number" inputmode="decimal" step="0.1" value="${v || ""}" placeholder="—" aria-label="Valeur du VIX">`
    : `<span>${v ? v.toFixed(2) : "—"}</span>`;
  let status;
  if (vixStatus) status = vixStatus;
  else if (ALLOC.vixTs) status = `${vixSourceLabel()} · ${ALLOC.vixDate || new Date(ALLOC.vixTs).toLocaleDateString("fr-FR")}`;
  else status = active ? "prêt à récupérer" : "saisie manuelle";

  $("vixcard").innerHTML =
    `<div class="phead"><span class="ptitle">VIX · régime de marché</span></div>` +
    `<div class="vtop" style="margin-top:6px"><div class="vixval" style="color:${reg.color}">${valHTML}</div>` +
    `<span class="vregime" style="background:${reg.color}22;color:${reg.color}">${reg.label}</span></div>` +
    `<div class="vgauge"><div class="vmarker" style="left:calc(${pos}% - 1.5px)"></div></div>` +
    `<div class="vscale"><span>0</span><span>12</span><span>20</span><span>28</span><span>50</span></div>` +
    `<div class="vnote">${reg.note}</div>` +
    `<div class="vactions"><span class="vts" id="vix-ts">${esc(status)}</span>` +
    (active ? `<button class="atbtn" id="vix-fetch">↻ actualiser</button>` : "") +
    `<button class="atbtn" id="vix-edit">${showInput ? "auto" : "saisir"}</button></div>`;

  if ($("vix-in")) $("vix-in").addEventListener("change", (e) => { ALLOC.vix = +e.target.value || 0; ALLOC.vixTs = Date.now(); ALLOC.vixDate = ""; vixStatus = null; renderVix(); persist(); });
  if ($("vix-fetch")) $("vix-fetch").addEventListener("click", () => fetchVix(true));
  if ($("vix-edit")) $("vix-edit").addEventListener("click", () => { vixManual = !vixManual; renderVix(); });
}
function maybeAutoVix() {
  if (vixAutoTried) return; vixAutoTried = true;
  if (!VIXCFG.source || VIXCFG.source === "off") return;
  const stale = !ALLOC.vixTs || (Date.now() - ALLOC.vixTs > 6 * 3600 * 1000);
  if (stale) fetchVix(false);
}
async function fetchVix() {
  if (!VIXCFG.source || VIXCFG.source === "off") return;
  vixStatus = "récupération…"; if ($("vix-ts")) $("vix-ts").textContent = vixStatus;
  try {
    let vix, date;
    if (VIXCFG.source === "twelvedata") {
      const r = await fetchWithTimeout(`https://api.twelvedata.com/quote?symbol=VIX&apikey=${encodeURIComponent(VIXCFG.apiKey || "")}`);
      const j = await r.json(); vix = parseFloat(j.close); date = j.datetime;
      if (j.status === "error") throw new Error(j.message || "réponse API");
    } else if (VIXCFG.source === "proxy" || (VIXCFG.source === "cboe" && VIXCFG.proxyUrl)) {
      const r = await fetchWithTimeout(VIXCFG.proxyUrl);
      const j = await r.json(); vix = parseFloat(j.vix); date = j.date;
    } else { // CBOE officiel, direct
      const r = await fetchWithTimeout(CBOE_VIX_CSV);
      const txt = await r.text(); const lines = txt.trim().split("\n");
      const last = lines[lines.length - 1].split(","); vix = parseFloat(last[last.length - 1]); date = (last[0] || "").slice(0, 10);
    }
    if (!isFinite(vix) || vix <= 0) throw new Error("valeur invalide");
    ALLOC.vix = Math.round(vix * 100) / 100; ALLOC.vixTs = Date.now(); ALLOC.vixDate = date || ""; vixManual = false; vixStatus = null;
    renderVix(); persist();
  } catch (e) {
    const cors = (e && (e.name === "TypeError" || e.name === "AbortError"));
    vixStatus = cors ? "indisponible (CORS/réseau) — voir README pour le proxy" : "indisponible (" + (e.message || "erreur") + ")";
    renderVix();
  }
}

function bindAlloc() {
  $("a-monthly").addEventListener("input", (e) => { ALLOC.monthly = +e.target.value || 0; recompute(); });
  ["core-list", "sat-list"].forEach((id) => {
    const body = $(id);
    body.addEventListener("input", (e) => {
      const inp = e.target.closest("input"); if (!inp) return;
      const row = inp.closest(".hold"), arr = ALLOC[row.dataset.t], r = arr[+row.dataset.i], f = inp.dataset.f;
      r[f] = f === "name" ? inp.value : +inp.value || 0; recompute();
    });
    body.addEventListener("click", (e) => {
      const del = e.target.closest(".delrow"); if (!del) return;
      const row = del.closest(".hold"); ALLOC[row.dataset.t].splice(+row.dataset.i, 1); renderAlloc();
    });
  });
  document.querySelectorAll(".addrow").forEach((b) => b.addEventListener("click", () => { ALLOC[b.dataset.t].push({ name: "", amount: 0, target: 0 }); renderAlloc(); }));
  $("a-reset").addEventListener("click", () => { if (confirm("Réinitialiser avec les valeurs d'exemple ? Tes modifications seront perdues.")) { ALLOC = JSON.parse(JSON.stringify(ALLOC_SEED)); renderAlloc(); } });
  $("a-orders").addEventListener("click", copyOrders);
  $("a-export").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(ALLOC, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "portefeuille-allocation.json"; a.click();
  });
  $("a-import").addEventListener("click", () => $("a-file").click());
  $("a-file").addEventListener("change", (e) => {
    const f = e.target.files[0]; if (!f) return; const rd = new FileReader();
    rd.onload = () => {
      try { const d = JSON.parse(rd.result);
        if (d && Array.isArray(d.core) && Array.isArray(d.sat)) { d.monthly = +d.monthly || 0; ALLOC = d; renderAlloc(); }
        else alert("Fichier non reconnu (il faut un JSON avec « core » et « sat »)."); }
      catch (err) { alert("JSON invalide."); }
    };
    rd.readAsText(f);
  });
}

/* ---------- 9. NAVIGATION & INIT ---------------------------- */
function hasData() { return MODEL && MODEL.t && MODEL.t.length; }

function renderAll(rows) {
  MODEL = build(rows || []);
  const ok = hasData();
  $("ov-empty").style.display = ok ? "none" : "block";
  $("ov-body").style.display = ok ? "block" : "none";
  $("const-empty").style.display = ok ? "none" : "block";
  $("const-body").style.display = ok ? "grid" : "none";
  if (!ok) { stopSim(); return; }
  const m = MODEL;
  $("period").innerHTML = `du <b>${fmtDate(m.t[0].date)}</b> au <b>${fmtDate(m.t[m.t.length - 1].date)}</b> · ${m.t.length} mouvements`;
  renderKpis(m); renderCurve(m); renderMonths(m); renderClassDonut(m); renderBars(m);
  TABLE = m.t.slice(); renderTable();
  if ($("tab-constellation").classList.contains("active")) renderConstellation(m);
}

function switchTab(name) {
  document.querySelectorAll("#tabs button").forEach((b) => { const on = b.dataset.tab === name; b.classList.toggle("active", on); b.setAttribute("aria-selected", on ? "true" : "false"); });
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
  $("tab-" + name).classList.add("active");
  $("drop").style.display = name === "allocation" ? "none" : "";   // chargeur CSV masqué dans l'allocation
  if (name === "constellation") { if (hasData()) renderConstellation(MODEL); } else stopSim();
}

function loadFile(file) {
  const rd = new FileReader();
  rd.onload = () => {
    try { renderAll(parseCSV(rd.result)); $("dfile").textContent = hasData() ? file.name + " · chargé localement" : "aucune ligne « Trading » trouvée"; }
    catch (err) { $("dfile").textContent = "erreur de lecture"; }
  };
  rd.readAsText(file);
}

function showChangelog() {
  $("cl-list").innerHTML = CHANGELOG.map((e) =>
    `<div class="cl-entry"><span class="clv">v${e.v}</span><span class="cld">${e.date}</span><ul>${e.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></div>`).join("");
  $("overlay").classList.add("open");
}

let resizeT = null;
function init() {
  $("tabs").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) switchTab(b.dataset.tab); });
  $("replay").addEventListener("click", () => { if (hasData()) renderConstellation(MODEL); });

  $("filters").addEventListener("click", (e) => {
    if (e.target.tagName !== "BUTTON") return;
    document.querySelectorAll("#filters button").forEach((b) => b.classList.remove("active"));
    e.target.classList.add("active"); filter = e.target.dataset.f; renderTable();
  });
  document.querySelectorAll("#tbl thead th").forEach((th) => th.addEventListener("click", () => {
    const k = th.dataset.s; if (sortKey === k) sortDir *= -1; else { sortKey = k; sortDir = k === "date" ? -1 : 1; }
    document.querySelectorAll("#tbl thead .arrow").forEach((a) => a.remove());
    const ar = document.createElement("span"); ar.className = "arrow"; ar.textContent = sortDir < 0 ? "▾" : "▴";
    th.appendChild(document.createTextNode(" ")); th.appendChild(ar); renderTable();
  }));

  const drop = $("drop"), fileInput = $("file");
  fileInput.addEventListener("change", (e) => { if (e.target.files[0]) loadFile(e.target.files[0]); });
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => { const f = e.dataTransfer.files[0]; if (f) loadFile(f); });
  document.querySelectorAll(".js-load").forEach((b) => b.addEventListener("click", () => fileInput.click()));

  bindAlloc();

  $("verbtn").textContent = "v" + APP_VERSION;
  $("verbtn").addEventListener("click", showChangelog);
  $("cl-close").addEventListener("click", () => $("overlay").classList.remove("open"));
  $("overlay").addEventListener("click", (e) => { if (e.target === $("overlay")) $("overlay").classList.remove("open"); });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopSim();
    else if ($("tab-constellation").classList.contains("active") && hasData()) renderConstellation(MODEL);
  });
  window.addEventListener("resize", () => { clearTimeout(resizeT); resizeT = setTimeout(() => { if ($("tab-constellation").classList.contains("active") && hasData()) renderConstellation(MODEL); }, 250); });

  renderAll([]);

  if (CFG.FIREBASE && typeof firebase !== "undefined") {
    try { startFirebase(); } catch (e) { console.warn("Firebase indisponible, mode local :", e); Store.mode = "local"; bootLocal(); }
  } else { Store.mode = "local"; bootLocal(); }
}
async function bootLocal() {
  ALLOC = (await Store.load()) || JSON.parse(JSON.stringify(ALLOC_SEED));
  renderAlloc();
}

document.addEventListener("DOMContentLoaded", init);
})();
