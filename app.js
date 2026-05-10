// ══════════════════════════════════════
// HEXAGONAL INTERACTIVE BACKGROUND
// ══════════════════════════════════════
const canvas = document.getElementById('nc');
const ctx    = canvas.getContext('2d');
let scanState = 'idle';

const HS   = 54;               // circumradius
const GAP  = 2;                // gap between hexes in px
const IR   = HS - GAP;         // inner (drawn) radius
const W3   = Math.sqrt(3);
const COL_W = W3 * HS;         // pointy-top: col spacing
const ROW_H = HS * 1.5;        // row spacing

let grid = [];
let mX = -9999, mY = -9999;

document.addEventListener('mousemove', e => { mX = e.clientX; mY = e.clientY; });

function buildGrid(W, H) {
  grid = [];
  const cols = Math.ceil(W / COL_W) + 3;
  const rows = Math.ceil(H / ROW_H) + 3;
  for (let r = -1; r <= rows; r++) {
    for (let c = -1; c <= cols; c++) {
      const cx = c * COL_W + (r % 2 !== 0 ? COL_W / 2 : 0);
      const cy = r * ROW_H;
      grid.push({
        cx, cy,
        glow:   0,
        pulse:  Math.random() * Math.PI * 2,
        pSpd:   0.00035 + Math.random() * 0.00055,
        color:  Math.random(),   // slight color variation per hex
      });
    }
  }
}

function hexPath(cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 3 * i - Math.PI / 6;
    i === 0
      ? ctx.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a))
      : ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  ctx.closePath();
}

function resize() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  buildGrid(canvas.width, canvas.height);
}

const MOUSE_R  = 160;   // mouse influence radius
const SCAN_R   = 240;   // wider when scanning

function drawFrame(ts) {
  const W = canvas.width, H = canvas.height;
  const mr = scanState === 'scanning' ? SCAN_R : MOUSE_R;

  // Base background
  ctx.fillStyle = '#050709';
  ctx.fillRect(0, 0, W, H);

  for (const h of grid) {
    const dx   = mX - h.cx;
    const dy   = mY - h.cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const prox = Math.max(0, 1 - dist / mr);

    // Subtle ambient pulse
    const amb  = (Math.sin(ts * h.pSpd + h.pulse) * 0.5 + 0.5) * 0.018;

    const tgt  = prox * prox * 0.72 + amb;
    h.glow    += (tgt - h.glow) * 0.09;

    const g = h.glow;

    // ── Fill — interpolate to deep navy, not bright cyan ──
    const fR = Math.round(5  + 12 * g);
    const fG = Math.round(7  + 32 * g);
    const fB = Math.round(12 + 58 * g);

    const hi = ctx.createRadialGradient(
      h.cx - IR * 0.28, h.cy - IR * 0.28, 0,
      h.cx, h.cy, IR
    );
    hi.addColorStop(0,   `rgba(${fR+6},${fG+8},${fB+10},0.97)`);
    hi.addColorStop(0.6, `rgba(${fR},${fG},${fB},0.96)`);
    hi.addColorStop(1,   `rgba(${Math.max(0,fR-2)},${Math.max(0,fG-3)},${Math.max(0,fB-4)},0.96)`);

    hexPath(h.cx, h.cy, IR);
    ctx.fillStyle = hi;
    ctx.fill();

    // ── Edge — very subtle ──
    const edgeA = 0.055 + g * 0.22;
    ctx.strokeStyle = `rgba(${fR+14},${fG+18},${fB+26},${edgeA.toFixed(3)})`;
    ctx.lineWidth   = 0.75;
    ctx.stroke();

    // ── Soft glow only when strongly lit ──
    if (g > 0.25) {
      hexPath(h.cx, h.cy, IR + 3);
      const halo = ctx.createRadialGradient(h.cx, h.cy, IR - 2, h.cx, h.cy, IR + 8);
      halo.addColorStop(0, `rgba(14,165,233,${(g * 0.11).toFixed(3)})`);
      halo.addColorStop(1, 'rgba(14,165,233,0)');
      ctx.strokeStyle = halo;
      ctx.lineWidth   = 6;
      ctx.stroke();
    }
  }

  requestAnimationFrame(drawFrame);
}

window.addEventListener('resize', resize);
resize();
requestAnimationFrame(drawFrame);

// ══════════════════════════════════════
// SCREEN TRANSITIONS + BROWSER HISTORY
// ══════════════════════════════════════
function showScreen(id, pushHistory = true) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + id).classList.add('active');
  // Show left price ticker only on dashboard
  document.getElementById('dash-ticker').style.display = (id === 'dashboard') ? 'flex' : 'none';
  if (pushHistory && id !== 'scanning') {
    history.pushState({ screen: id }, '', '#' + id);
  }
}

// Handle browser back/forward
window.addEventListener('popstate', e => {
  const screen = (e.state && e.state.screen) || 'connect';
  if (screen === 'connect') {
    disconnect(true);
  } else {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById('screen-' + screen);
    if (el) el.classList.add('active');
  }
});

// Seed initial history entry
history.replaceState({ screen: 'connect' }, '', '#connect');

let _sfActive = null;
function toggleSfSection(key, btn) {
  const acc = document.getElementById('sfAccordion');
  if (_sfActive === key) {
    acc.classList.remove('open');
    btn.classList.remove('active');
    _sfActive = null;
  } else {
    acc.classList.add('open');
    document.querySelectorAll('.sf-link-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    _sfActive = key;
  }
}

// ══════════════════════════════════════
// PHANTOM WALLET CONNECTOR
// ══════════════════════════════════════

// Returns the Phantom Solana provider per official docs: https://docs.phantom.com/solana/detecting-the-provider
// Phantom only injects on https://, localhost, or 127.0.0.1 — NOT on file:// pages
function getPhantomProvider() {
  if ('phantom' in window) {
    const provider = window.phantom?.solana;
    if (provider?.isPhantom) return provider;
  }
  // Legacy fallback
  if (window.solana?.isPhantom) return window.solana;
  return null;
}

function isFileProtocol() {
  return location.protocol === 'file:';
}

// Detect Phantom on load and update button status
window.addEventListener('load', () => {
  const statusEl = document.getElementById('phantom-status');
  if (!statusEl) return;

  if (isFileProtocol()) {
    // Phantom never injects on file:// — show a warning banner
    let banner = document.getElementById('file-protocol-warning');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'file-protocol-warning';
      banner.style.cssText = [
        'position:fixed;top:0;left:0;right:0;z-index:9999',
        'background:rgba(220,38,38,.92);color:#fff',
        'font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px',
        'padding:10px 20px;text-align:center;backdrop-filter:blur(4px)',
        'border-bottom:1px solid rgba(255,255,255,.15)'
      ].join(';');
      banner.innerHTML = '⚠️ <strong>Phantom cannot connect on file://</strong> — serve this file from localhost. &nbsp;Run: <code style="background:rgba(0,0,0,.3);padding:2px 6px;border-radius:4px">npx serve .</code> &nbsp;in the file\'s folder, then open <code style="background:rgba(0,0,0,.3);padding:2px 6px;border-radius:4px">http://localhost:3000</code>';
      document.body.prepend(banner);
    }
    statusEl.textContent = 'Needs localhost';
    statusEl.classList.add('not-installed');
    return;
  }

  // Give extension a tick to inject after load
  setTimeout(() => {
    if (getPhantomProvider()) {
      statusEl.textContent = 'Connect';
      statusEl.classList.remove('not-installed');
    } else {
      statusEl.textContent = 'Install';
      statusEl.classList.add('not-installed');
    }
  }, 150);
});

async function connectPhantom() {
  const btn      = document.getElementById('btn-phantom');
  const statusEl = document.getElementById('phantom-status');
  const provider = getPhantomProvider();

  // Not installed → open phantom.app
  if (!provider) {
    window.open('https://phantom.app/', '_blank');
    return;
  }

  // Connecting state
  btn.classList.add('connecting');
  statusEl.textContent = 'Connecting...';

  try {
    const resp   = await provider.connect();
    const pubkey = resp.publicKey.toString();
    const short  = pubkey.slice(0,4) + '...' + pubkey.slice(-4);

    // Read real SOL balance from mainnet RPC
    try {
      const rpc = await fetch('https://api.mainnet-beta.solana.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1,
          method: 'getBalance',
          params: [pubkey, { commitment: 'confirmed' }]
        })
      });
      const rpcData = await rpc.json();
      window._realSolBalance = (rpcData.result?.value || 0) / 1e9;
    } catch (_) { window._realSolBalance = null; }

    btn.classList.remove('connecting');
    if (activeMainTab !== 'dust') {
      const urls = { swap:'https://changelly.com/', buy:'https://changelly.com/buy-crypto', sell:'https://changelly.com/sell-crypto' };
      window._exchRedirectUrl = urls[activeMainTab] || 'https://changelly.com/';
      // Update phantom button to connected state
      const exchBtn = document.getElementById('exch-btn-phantom');
      const exchStatus = document.getElementById('exch-phantom-status');
      if (exchBtn) { exchBtn.classList.add('connected'); exchBtn.classList.remove('wb-phantom'); }
      if (exchStatus) exchStatus.textContent = 'Connected ✓';
      // Show proceed button
      const proceedBtn = document.getElementById('exch-proceed-btn');
      if (proceedBtn) proceedBtn.classList.remove('hidden');
      return;
    }
    startScan('phantom', short, pubkey);

  } catch (err) {
    btn.classList.remove('connecting');
    statusEl.textContent = err.code === 4001 ? 'Rejected' : 'Error';
    setTimeout(() => { statusEl.textContent = 'Connect'; }, 2000);
  }
}

// Coming Soon toast
function showComingSoon(name) {
  let toast = document.getElementById('cs-toast');
  if (toast) { clearTimeout(toast._t); toast.remove(); }
  toast = document.createElement('div');
  toast.id = 'cs-toast';
  toast.innerHTML = `<span>${name}</span> — Coming Soon`;
  document.body.appendChild(toast);
  requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('vis')));
  toast._t = setTimeout(() => {
    toast.classList.remove('vis');
    setTimeout(() => toast.remove(), 300);
  }, 2600);
}

// ══════════════════════════════════════
// SEEDED PORTFOLIO GENERATOR ($1–$500)
// Seed derived from wallet address — same wallet = same values always
// ══════════════════════════════════════
let PF = {};

function addrSeed(addr) {
  let h = 0x12345678;
  for (let i = 0; i < addr.length; i++) {
    h = Math.imul(h ^ addr.charCodeAt(i), 0x9e3779b9) | 0;
    h = (h << 13) | (h >>> 19);
  }
  return (h >>> 0) / 0xFFFFFFFF;
}

function seededRng(seed) {
  let s = (seed * 9301 + 49297) % 233280;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

function generatePortfolio(addr = '') {
  // Deterministic: hash of wallet address → always same values per wallet
  const seedVal = addr ? addrSeed(addr) : Math.random();
  const r = seededRng((seedVal * 233280) | 0);

  const recoverable = 1 + r() * 499;
  const total       = recoverable / (0.68 + r() * 0.15);
  const dust        = 6 + Math.floor(r() * 7);
  const tokens      = dust + Math.floor(r() * 9) + 4;

  const raw  = Array.from({length:8}, () => r());
  const sum  = raw.reduce((a,b) => a+b, 0);
  const vals = raw.map(w => w / sum * total);
  const solV = vals[0]+vals[1]+vals[2];
  const ethV = vals[3]+vals[4]+vals[5];
  const bscV = vals[6];
  const aptV = vals[7];

  PF = {
    total, recoverable, dust, tokens, vals,
    solV, ethV, bscV, aptV,
    cSol: solV * (0.32 + r() * 0.12),
    cEth: ethV * (0.28 + r() * 0.14),
    cBsc: bscV * (0.22 + r() * 0.12),
  };
}

function $ (id) { return document.getElementById(id); }
function $set(id, val) { const el = $(id); if (el) el.textContent = val; }
function fmt(v) { return '$' + v.toFixed(2); }
function pct(v, t) { return Math.round(v/t*100) + '%'; }

function populateDashboard() {
  const {total,recoverable,dust,tokens,vals,solV,ethV,bscV,aptV} = PF;

  $set('m-dust',       dust);
  $set('m-total',      fmt(total));
  $set('m-recover',    fmt(recoverable));
  $set('hero-cta-btn', 'Recover ' + fmt(recoverable) + ' → Jupiter Aggregator');

  // Consolidation savings (guard: elements may not exist if card was removed)
  $set('cs-sol', '~' + fmt(PF.cSol));
  $set('cs-eth', '~' + fmt(PF.cEth) + ' saved');
  $set('cs-bsc', 'value: ' + fmt(PF.cBsc));

  startTerminal();
}

// ══════════════════════════════════════
// SCAN SIMULATION
// ══════════════════════════════════════
function startScan(wallet, displayAddr, fullAddr = null) {
  document.getElementById('scanAddr').textContent = displayAddr;
  document.getElementById('dashAddr').textContent = displayAddr;
  generatePortfolio(fullAddr || displayAddr); // seed from wallet address
  showScreen('scanning');
  scanState = 'scanning';
  runScan();
}

function startScanFromInput() {
  const v = document.getElementById('addrInput').value.trim();
  if (!v) return;
  const d = v.length > 14 ? v.slice(0, 6) + '...' + v.slice(-4) : v;
  startScan('manual', d);
}

function runScan() {
  const {total, recoverable, dust, tokens} = PF;

  // Reset bars
  ['eth','sol','bsc','apt'].forEach(c => {
    document.getElementById('bar-'+c).style.width = '0%';
    document.getElementById('pct-'+c).textContent = '0%';
  });
  ['stTokens','stDust','stNets'].forEach(id => document.getElementById(id).textContent = '0');
  document.getElementById('stVal').textContent = '$0.00';
  document.querySelectorAll('.log-ln').forEach(l => l.classList.remove('vis'));

  // Logs (include generated values)
  const bonkBal = (Math.random()*500000+50000).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,',');
  const shibBal = (Math.random()*10000000+500000).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,',');
  const logs = [
    { id:'l0', text:'> Initializing blockchain scanner...',    cls:'info', t:100  },
    { id:'l1', text:'> Ethereum RPC connected [✓]',            cls:'ok',   t:900  },
    { id:'l2', text:'> Indexing ERC-20 token accounts...',    cls:'info', t:1700 },
    { id:'l3', text:`> Detected SHIB: ${shibBal} tokens`,     cls:'ok',   t:2500 },
    { id:'l4', text:'> Solana RPC connected, scanning...',    cls:'info', t:3200 },
    { id:'l5', text:`> Detected BONK: ${bonkBal} residuals`,  cls:'ok',   t:4000 },
    { id:'l6', text:'> Warning: gas fees exceed ETH L1 value', cls:'warn', t:5200 },
  ];
  logs.forEach(({ id, text, cls, t }) => {
    setTimeout(() => {
      const el = document.getElementById(id);
      el.textContent = text;
      el.className = `log-ln ${cls}`;
      el.classList.add('vis');
    }, t);
  });

  // Chain bars
  animBar('eth', 0,    2200);
  animBar('sol', 1200, 3400);
  animBar('bsc', 3000, 3800);
  animBar('apt', 4600, 2000);

  // Counters animate to generated values
  animInt('stTokens', 0, tokens, 1200, 5400);
  animInt('stDust',   0, dust,   2000, 5400);
  animInt('stNets',   0, 4,      600,  5800);
  animFloat('stVal',  0, total,  2200, 5000);

  // Go to dashboard
  setTimeout(() => {
    scanState = 'done';
    populateDashboard();
    showScreen('dashboard');
  }, 7400);
}

function animBar(chain, delay, dur) {
  setTimeout(() => {
    const bar = document.getElementById('bar-' + chain);
    const pct = document.getElementById('pct-' + chain);
    const t0 = performance.now();
    (function step(now) {
      const p = Math.min((now - t0) / dur, 1);
      const e = 1 - Math.pow(1 - p, 3);
      const v = Math.round(e * 100);
      bar.style.width = v + '%';
      pct.textContent = v + '%';
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  }, delay);
}

function animInt(id, from, to, delay, dur) {
  setTimeout(() => {
    const el = document.getElementById(id);
    const t0 = performance.now();
    (function step(now) {
      const p = Math.min((now - t0) / dur, 1);
      el.textContent = Math.round(from + (to - from) * p);
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  }, delay);
}

function animFloat(id, from, to, delay, dur) {
  setTimeout(() => {
    const el = document.getElementById(id);
    const t0 = performance.now();
    (function step(now) {
      const p = Math.min((now - t0) / dur, 1);
      el.textContent = '$' + (from + (to - from) * p).toFixed(2);
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  }, delay);
}

function disconnect(fromHistory = false) {
  scanState = 'idle';
  document.getElementById('live-terminal').classList.remove('vis');
  document.getElementById('screen-dashboard').classList.remove('has-terminal');
  showScreen('connect', !fromHistory);
}

// ══════════════════════════════════════
// LIVE CLAIMS TERMINAL
// ══════════════════════════════════════
const T_WALLETS = [
  '0x7a2d...9f3e','0x3c8f...12ab','0xb3a4...8801','0x9e1c...ff02',
  '0x44fe...c091','0x18a7...5590','0xd1f0...3349','0x5592...aa17',
  'BPxX...4mKL','7xKM...Bq4P','DRpb...t5Kz','F3aB...Xw2Q',
  '4mRt...9sLp','HQzX...Wn3A','0x2b81...7f20','0xc93d...4412',
];
const T_TOKENS = ['USDC','USDT','WETH','SOL','BNB','MATIC','ARB','OP','SHIB','BONK','PEPE','WIF','FLOKI','CAKE'];
const T_ERRORS = [
  'insufficient gas','nonce too low','reverted: ERC20: transfer amount exceeds balance',
  'RPC timeout','signature invalid','slippage exceeded','allowance: 0',
  'network congestion','max fee per gas too low','execution reverted',
];
const T_WARNS = ['low liquidity, retrying...','gas spike detected, queued','partial fill: 71%','waiting for confirmation...'];

function tTs() {
  const n = new Date();
  return [n.getHours(),n.getMinutes(),n.getSeconds()].map(v=>String(v).padStart(2,'0')).join(':');
}

function makeClaimRow() {
  const r = Math.random();
  const wallet = T_WALLETS[Math.random() * T_WALLETS.length | 0];
  const row = document.createElement('div');
  if (r < 0.18) {
    const err = T_ERRORS[Math.random() * T_ERRORS.length | 0];
    row.className = 'trow terr';
    row.innerHTML = `<div><span class="tts">[${tTs()}]</span> <span class="twl">${wallet}</span></div><span class="tmsg-err">✗ FAILED: ${err}</span>`;
  } else if (r < 0.30) {
    row.className = 'trow twrn';
    row.innerHTML = `<div><span class="tts">[${tTs()}]</span> <span class="twl">${wallet}</span></div><span class="tmsg-wrn">⚠ ${T_WARNS[Math.random()*T_WARNS.length|0]}</span>`;
  } else {
    const token = T_TOKENS[Math.random() * T_TOKENS.length | 0];
    const raw = 10 + Math.random() * 4990;
    const fmtAmt = raw >= 1000
      ? '$' + raw.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
      : '$' + raw.toFixed(2);
    row.className = 'trow tok';
    row.innerHTML = `<div><span class="tts">[${tTs()}]</span> <span class="twl">${wallet}</span></div><span class="tmsg-ok">✓ ${fmtAmt} ${token} claimed</span>`;
  }
  return row;
}

function appendToTerminal(bodyEl, row) {
  bodyEl.appendChild(row);
  bodyEl.scrollTop = bodyEl.scrollHeight;
  while (bodyEl.children.length > 65) bodyEl.removeChild(bodyEl.firstChild);
}

// Bodies that receive live claim rows
const termBodies = [];

function initTerminalStream() {
  // Initial burst
  for (let i = 0; i < 9; i++) {
    setTimeout(() => {
      const row = makeClaimRow();
      termBodies.forEach(b => appendToTerminal(b, row.cloneNode(true)));
    }, i * 160);
  }
  // Continuous stream
  (function scheduleNext() {
    const delay = 700 + Math.random() * 2400;
    setTimeout(() => {
      const burst = Math.random() < 0.22 ? 2 : 1;
      for (let i = 0; i < burst; i++) {
        setTimeout(() => {
          const row = makeClaimRow();
          termBodies.forEach(b => appendToTerminal(b, row.cloneNode(true)));
        }, i * 220);
      }
      scheduleNext();
    }, delay);
  })();
}

let termStreamStarted = false;

function startConnectTerminal() {
  const ctBody = document.getElementById('ctBody');
  if (!termBodies.includes(ctBody)) termBodies.push(ctBody);
  if (!termStreamStarted) {
    termStreamStarted = true;
    initTerminalStream();
  }
}

function startTerminal() {
  const termBody = document.getElementById('termBody');
  const terminal = document.getElementById('live-terminal');
  const dash = document.getElementById('screen-dashboard');
  terminal.classList.add('vis');
  dash.classList.add('has-terminal');
  if (!termBodies.includes(termBody)) termBodies.push(termBody);
  if (!termStreamStarted) {
    termStreamStarted = true;
    initTerminalStream();
  }
}

// ══════════════════════════════════════
// WALLET ADDRESS STREAM BACKGROUND
// ══════════════════════════════════════
const wcEl = document.getElementById('wc');
const wctx = wcEl.getContext('2d');
let streams = [];

const HEX = '0123456789abcdef';
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function rHex(n){ return Array.from({length:n},()=>HEX[Math.random()*16|0]).join('') }
function rB58(n){ return Array.from({length:n},()=>B58[Math.random()*B58.length|0]).join('') }
function rAmt(){
  const v = 0.01 + Math.random() * 847293;
  if(v > 10000) return '$' + v.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,',');
  if(v > 100)   return '$' + v.toFixed(2);
  return '$' + v.toFixed(4);
}
function rText(){
  const r = Math.random();
  if(r < .25) return '0x' + rHex(40) + '   ' + rAmt();
  if(r < .45) return rB58(44) + '   ◎' + (Math.random()*8942).toFixed(4);
  if(r < .60) return '0x' + rHex(8) + '...' + rHex(4) + '  →  0x' + rHex(8) + '...' + rHex(4) + '   ' + rAmt();
  if(r < .73) return rAmt();
  if(r < .86) return rB58(8) + '...' + rB58(4) + '   ' + rAmt();
  return '0x' + rHex(40);
}

function buildStreams() {
  const count = Math.min(60, (wcEl.width * wcEl.height / 26000) | 0);
  streams = Array.from({length: count}, () => {
    const a = Math.random() * Math.PI * 2;
    const spd = .12 + Math.random() * .28;
    const palette = ['14,165,233','34,211,238','99,102,241','148,163,184'];
    const col = palette[Math.random() < .45 ? 0 : Math.random() < .5 ? 1 : Math.random() < .5 ? 2 : 3];
    return {
      x: Math.random() * wcEl.width,
      y: Math.random() * wcEl.height,
      vx: Math.cos(a) * spd,
      vy: Math.sin(a) * spd,
      text: rText(),
      sz: 9 + (Math.random() * 4 | 0),
      op: 0,
      topOp: .025 + Math.random() * .06,
      col,
      life: Math.random() * 500 | 0,
      maxLife: 350 + (Math.random() * 450 | 0),
    };
  });
}

function resizeWC() {
  wcEl.width = window.innerWidth;
  wcEl.height = window.innerHeight;
  buildStreams();
}

function drawStreams() {
  wctx.clearRect(0, 0, wcEl.width, wcEl.height);
  const W = wcEl.width, H = wcEl.height;
  for(const s of streams){
    s.x += s.vx; s.y += s.vy;
    if(s.x < -700) s.x = W + 60;
    if(s.x > W+700) s.x = -60;
    if(s.y < -20)   s.y = H + 10;
    if(s.y > H+20)  s.y = -10;
    s.life++;
    if(s.life > s.maxLife){
      s.text = rText();
      s.life = 0;
      s.maxLife = 350 + (Math.random()*450|0);
      const p = ['14,165,233','34,211,238','99,102,241','148,163,184'];
      s.col = p[Math.random()<.45?0:Math.random()<.5?1:Math.random()<.5?2:3];
    }
    // Opacity breathes gently
    const phase = (s.life / s.maxLife) * Math.PI;
    s.op += (s.topOp * Math.sin(phase) - s.op) * .04;
    if(s.op < 0) s.op = 0;
    wctx.font = `${s.sz}px 'Inter',monospace`;
    wctx.fillStyle = `rgba(${s.col},${s.op.toFixed(3)})`;
    wctx.fillText(s.text, s.x, s.y);
  }
  requestAnimationFrame(drawStreams);
}

window.addEventListener('resize', resizeWC);
resizeWC();
requestAnimationFrame(drawStreams);

// ══════════════════════════════════════
// FORUM POSTS DATA + NAVIGATION
// ══════════════════════════════════════
const POSTS = [
  {
    id: 0,
    source: 'BitcoinTalk',
    badgeClass: 'badge-btalk',
    category: 'Exchanges · Regulación',
    title: 'Kraken ya está bloqueando la recuperación de balances residuales en su panel — soporte confirma "limitación de funcionalidades" por presión regulatoria',
    author: 'satoshi_fork_99',
    authorInitial: 'S',
    authorColor: '#9945FF',
    rank: 'Senior Member · 2,847 posts',
    date: '2026-05-06 · 14:32 UTC',
    views: '18.4k',
    replies: 142,
    upvotes: '2.1k',
    body: `<p>Buenas a todos. Llevo unos días investigando algo que me parece bastante grave y quiero compartirlo aquí antes de que desaparezca de los motores de búsqueda (ya han eliminado un hilo similar en Reddit hace 48h).</p>

<p>La semana pasada intenté usar la función de "Consolidar activos pequeños" que Kraken tenía en su panel de usuario para ETH. El botón directamente no aparece. Abrí ticket con soporte y aquí está la respuesta literal que me dieron:</p>

<div class="post-quote">"Estimado cliente, en respuesta a su consulta: ciertas funcionalidades relacionadas con la gestión de micro-saldos han sido temporalmente suspendidas mientras revisamos su cumplimiento con las nuevas directrices regulatorias de la UE (MiCA) y los requerimientos de nuestro equipo legal interno. Lamentamos los inconvenientes causados."</div>

<p>Que yo sepa, <strong>MiCA no tiene ningún artículo que prohiba la consolidación de saldos residuales</strong>. He leído los 449 artículos del reglamento. Eso es una excusa. El motivo real, según fuentes internas que no puedo nombrar aquí, es que Kraken tiene en su balance pendiente de reclamar aproximadamente <strong>$47 millones en dust assets de usuarios inactivos</strong> de los últimos 3 años. Si los usuarios pudieran reclamarlos fácilmente, ese dinero desaparecería de su liquidez operativa.</p>

<p>No es un problema exclusivo de Kraken. Binance hizo lo mismo en Q3 2025, cuando eliminaron la función de "dust conversion" para tokens con valor inferior a $0.50. La justificación oficial fue "mejora de UX". La realidad es que esa función permitía que millones de usuarios recuperaran saldos que de otro modo permanecerían en las cuentas de forma indefinida.</p>

<div class="post-alert">⚠ IMPORTANTE: Si tienes balances residuales en exchanges centralizados, recupéralos YA con wallets propias. Un exchange puede suspender estas funciones sin previo aviso y sin obligación legal de notificarte.</div>

<p>La única forma segura de gestionar estos activos es a través de tu propia wallet on-chain, donde nadie puede bloquearte el acceso. Herramientas como CryptoResidual hacen el análisis on-chain directamente — sin pasar por el exchange — y eso es exactamente lo que los CEX quieren evitar que uses.</p>

<p>¿Alguien más ha tenido problemas similares con Kraken u otros exchanges en las últimas semanas? Necesito documentar más casos.</p>`,
    comments: [
      { name: 'defi_hermano', initial: 'D', color: '#00D68F', rank: 'Member · 445 posts', date: 'hace 1h', text: 'Confirmo. Yo tenía 0.003 ETH en Kraken y el botón de conversión a dust simplemente no existe desde hace 10 días. Antes funcionaba perfectamente.' },
      { name: 'CryptoWatcherES', initial: 'C', color: '#627EEA', rank: 'Full Member · 1.2k posts', date: 'hace 58 min', text: 'La clave está en el término "temporalmente". Llevan 3 semanas con ese mensaje y no hay ninguna actualización. <strong>Temporalmente</strong> es la palabra que usan cuando no piensan volver a activarlo.' },
      { name: 'onchain_only', initial: 'O', color: '#F5B942', rank: 'Hero Member · 3.1k posts', date: 'hace 42 min', text: 'Por eso siempre he dicho que la única solución real son las wallets propias. No tus claves, no tus coins. Y ahora también: no tu exchange, no tu liquidez.' },
      { name: 'normie_awakened', initial: 'N', color: '#FF4B6A', rank: 'Newbie · 12 posts', date: 'hace 28 min', text: '¿Cómo puedo saber si tengo dust en mi wallet directamente sin pasar por el exchange? ¿Hay alguna herramienta para eso?' },
      { name: 'satoshi_fork_99', initial: 'S', color: '#9945FF', rank: 'Senior Member · 2,847 posts', date: 'hace 15 min', text: '@normie_awakened Sí, hay varias. CryptoResidual es la que yo uso — escanea directamente on-chain sin necesidad de conectar con ningún CEX. Solo lectura, sin permisos de firma.' },
    ]
  },
  {
    id: 1,
    source: 'Reddit',
    badgeClass: 'badge-reddit',
    category: 'r/CryptoES · Denuncia',
    title: 'Bybit invierte más de $400k en tirar todas las páginas que permitan reclamar \'dust\' o \'balances residuales\' — aquí está la evidencia',
    author: 'u/blockchain_whistler',
    authorInitial: 'B',
    authorColor: '#FF6830',
    rank: 'Karma: 14.2k · 3 años',
    date: '2026-05-06 · 09:17 UTC',
    views: '31.2k',
    replies: 389,
    upvotes: '4.8k',
    body: `<p>No es un rumor. Tengo documentación. Voy a compartir lo que sé y luego vosotros juzgáis.</p>

<p>En enero de 2026, Bybit contrató a una empresa de ciberseguridad llamada ClearWeb Defense (con sede en Singapur) para realizar lo que ellos llaman "brand protection and competitive intelligence operations". En la práctica, esto incluye:</p>

<p><strong>1. Envío masivo de DMCA takedowns a plataformas que "simulen" funcionalidades de recuperación de dust.</strong> Sé de al menos 6 proyectos open source en GitHub que han recibido estas notificaciones en los últimos 4 meses. El argumento legal es absurdo — alegan que la "interfaz de usuario" es propiedad intelectual de Bybit — pero el proceso es suficientemente caro como para que muchos desarrolladores simplemente cierren el proyecto.</p>

<p><strong>2. Campañas de desinformación en foros cripto.</strong> Cuentas creadas hace más de un año (para parecer legítimas) publican mensajes advirtiendo de que "estas herramientas son scams" o "te roban las claves". No hay ninguna evidencia técnica de esto — es FUD deliberado para que los usuarios no las usen.</p>

<p><strong>3. Presión directa a Apple App Store y Google Play.</strong> Al menos dos apps legítimas de gestión de dust fueron eliminadas de las tiendas en los últimos 6 meses tras quejas "de seguridad" que no han podido ser verificadas.</p>

<div class="post-quote">El negocio de los balances residuales es más grande de lo que parece. Estimamos que en los principales CEX hay entre $800M y $1.2B en dust assets inactivos de usuarios. No es dinero "perdido" — está en el balance del exchange, generando rendimiento. Cada usuario que lo recupera es dinero que sale de su liquidez.</div>

<p>¿Por qué $400k? Eso es lo que se estima que han gastado en estas operaciones en los primeros 4 meses. Considerando que están "protegiendo" potencialmente cientos de millones, es un ROI ridículamente bueno para ellos.</p>

<p>La solución on-chain existe. Las wallets no custodiales no pueden ser presionadas por un exchange. Tu dust, en tu wallet, es tuyo. Punto.</p>

<div class="post-alert">⚠ EDIT: Bybit ha contactado con los moderadores de este subreddit solicitando la eliminación del post. La solicitud ha sido denegada. Guardad capturas por si acaso.</div>`,
    comments: [
      { name: 'u/defi_libre_2025', initial: 'D', color: '#00D68F', rank: 'Karma: 3.2k', date: 'hace 4h', text: 'Los DMCA a repositorios de GitHub son la táctica más sucia. El código es código — no es marca registrada. Pero claro, el proceso legal cuesta dinero y tiempo que muchos devs independientes no tienen.' },
      { name: 'u/moderncrypto_es', initial: 'M', color: '#9945FF', rank: 'Karma: 8.7k', date: 'hace 4h', text: '¿Tienes los nombres de los 6 proyectos de GitHub que recibieron las notificaciones? Pregunto porque si están en público podríamos hacer un fork coordinado antes de que los eliminen.' },
      { name: 'u/blockchain_whistler', initial: 'B', color: '#FF6830', rank: 'Karma: 14.2k', date: 'hace 3h', text: '@u/moderncrypto_es No puedo publicar los nombres por ahora — comprometería mis fuentes. Pero si les pasa a los repositorios, alguien del sector lo anunciará. El código siempre sobrevive.' },
      { name: 'u/anon_defi_node', initial: 'A', color: '#F5B942', rank: 'Karma: 1.1k', date: 'hace 2h', text: 'Hay algo que no cuadra. Si el dust está on-chain, ¿cómo puede un CEX "protegerlo"? Una vez que tus tokens están en tu wallet, nadie puede impedirte hacer nada con ellos.' },
      { name: 'u/blockchain_whistler', initial: 'B', color: '#FF6830', rank: 'Karma: 14.2k', date: 'hace 1h', text: '@u/anon_defi_node El problema es que la mayoría de la gente no sabe que tiene dust. Si el CEX controla la información y elimina las herramientas de descubrimiento, la gente nunca sabrá que tiene nada que reclamar. Ese es el juego.' },
    ]
  },
  {
    id: 2,
    source: 'Discord',
    badgeClass: 'badge-discord',
    category: 'DeFi Hispano · Alerta',
    title: 'URGENTE: Binance envía cartas cease & desist a 3 plataformas de recuperación de dust — el motivo real que ocultan en el comunicado oficial',
    author: 'CryptoNoticias_ES',
    authorInitial: 'C',
    authorColor: '#8A9BF8',
    rank: 'Moderador · Discord DeFi Hispano',
    date: '2026-05-05 · 22:08 UTC',
    views: '9.7k',
    replies: 207,
    upvotes: '1.3k',
    body: `<p>Comparto esto aquí porque el canal de Telegram donde se publicó originalmente fue eliminado hace 3 horas. Tenemos capturas.</p>

<p>Según información verificada por tres fuentes independientes dentro del ecosistema DeFi hispano, <strong>Binance Legal ha enviado cartas de cese y desistimiento (cease & desist) a al menos tres proyectos</strong> que ofrecían servicios de análisis y recuperación de balances residuales on-chain en las últimas dos semanas.</p>

<p>El comunicado oficial de Binance (que puedes encontrar en su blog bajo el título "Protegiendo a nuestros usuarios de aplicaciones fraudulentas") alega que estas plataformas:</p>

<ul style="margin:12px 0 12px 20px;line-height:2">
<li>Usan el nombre de Binance de forma engañosa</li>
<li>Prometen recuperar fondos "bloqueados" en Binance (cosa que las plataformas no afirman)</li>
<li>Solicitan acceso a wallets de usuarios (falso — son herramientas de solo lectura)</li>
</ul>

<p>Ninguno de estos puntos es verdad para las tres plataformas en cuestión. Son proyectos open source que simplemente leen datos públicos de la blockchain. <strong>Binance no tiene autoridad legal sobre la blockchain de Ethereum ni de Solana.</strong> Las cartas C&D son intimidación, no acción legal válida.</p>

<div class="post-quote">El motivo real, según un desarrollador de uno de los proyectos afectados que prefiere permanecer anónimo: "Nuestra herramienta mostraba a los usuarios que tenían dust en Binance Smart Chain (BSC). Cuando los usuarios lo descubrían, lo transferían a sus wallets propias y salían del ecosistema de Binance. Eso les cuesta dinero real."</div>

<p>La ironía es que Binance es el propietario de BSC. Controlan la cadena, pero no pueden controlar lo que los usuarios hacen con sus propios activos una vez que saben que existen. Por eso atacan la capa de información.</p>

<p>Si usas alguna de estas herramientas, descárgala localmente. El código open source no desaparece fácilmente, pero los dominios y los servidores sí pueden ser presionados para bajar el servicio. <strong>Protege tu acceso a las herramientas que te dan soberanía financiera.</strong></p>`,
    comments: [
      { name: 'hodl_hispano', initial: 'H', color: '#00D68F', rank: 'Miembro activo', date: 'hace 7h', text: 'BSC siendo controlada por Binance siempre fue una bandera roja. La descentralización que venden es marketing. Si atacan la capa de información, la siguiente capa que atacarán es la transaccional.' },
      { name: 'privacy_maxi_es', initial: 'P', color: '#627EEA', rank: 'Moderador', date: 'hace 7h', text: 'Los C&D a proyectos open source no tienen validez legal en la mayoría de jurisdicciones. Es intimidación pura. La respuesta correcta es ignorarlos y publicar la carta — lo que hace que el envío sea un error estratégico para Binance.' },
      { name: 'nuevo_en_defi', initial: 'N', color: '#F5B942', rank: 'Miembro nuevo', date: 'hace 6h', text: '¿Cómo puedo saber si tengo dust en BSC sin pasar por Binance?' },
      { name: 'CryptoNoticias_ES', initial: 'C', color: '#8A9BF8', rank: 'Moderador', date: 'hace 5h', text: '@nuevo_en_defi Cualquier explorador de BSC como BscScan funciona. También hay herramientas de análisis de cartera que leen directamente on-chain. No necesitas pasar por Binance para ver tus propios activos on-chain.' },
    ]
  },
  {
    id: 3,
    source: 'Telegram',
    badgeClass: 'badge-telegram',
    category: 'CryptoInsider ES · Filtración',
    title: 'Ex-empleado de Coinbase lo confirma: los exchanges ganan $200M/año con balances residuales olvidados — y están aterrorizados de que lo sepas',
    author: 'InsiderCrypto_Óscar',
    authorInitial: 'I',
    authorColor: '#29B6F6',
    rank: 'Periodista · CryptoInsider ES',
    date: '2026-05-05 · 17:44 UTC',
    views: '44.1k',
    replies: 512,
    upvotes: '6.2k',
    body: `<p>Hace dos semanas recibí un mensaje privado de alguien que trabajó en Coinbase durante 4 años en el equipo de gestión de activos de usuario. Lo llamaré "Marco". Después de varias verificaciones, decidí publicar su testimonio de forma anónima.</p>

<p><strong>¿Qué son exactamente los "balances residuales" para un exchange?</strong></p>

<p>Según Marco, dentro de Coinbase usan el término interno "dormant micro-positions" (posiciones micro-dormidas). Son saldos inferiores a $1 que no han tenido movimiento en más de 6 meses. La estadística interna que él conocía de 2024 era que aproximadamente el <strong>34% de las cuentas activas tienen al menos un dormant micro-position</strong>.</p>

<p>Con 110 millones de usuarios verificados, eso es aproximadamente 37 millones de cuentas con dust. Si el promedio es de $5.40 por cuenta (cifra estimada internamente según Marco), estamos hablando de <strong>~$200 millones en activos de usuarios que el exchange utiliza libremente en sus operaciones de liquidez.</strong></p>

<div class="post-quote">"No es que nos los quedemos — técnicamente siguen siendo del usuario. Pero como nadie los reclama, ese capital está disponible para nosotros. Cuando alguien aparece a reclamarlo, lo procesamos sin problema. Pero activamente no incentivamos que la gente sepa que los tiene. Eso sería ir en contra del propio modelo de negocio."</div>

<p>Marco me explicó que en 2023 hubo una propuesta interna de crear una función de "dust sweep" automático que notificara a los usuarios de sus saldos pequeños y los ayudara a consolidarlos. La propuesta fue rechazada por el equipo directivo con el argumento de que "no generaba ingresos suficientes para justificar el desarrollo". La realidad, según Marco, es que habría reducido significativamente la liquidez disponible que Coinbase usa en sus operaciones.</p>

<p><strong>¿Por qué ahora?</strong></p>

<p>Marco decidió hablar ahora porque en los últimos meses ha visto cómo los exchanges están empleando cada vez más recursos para <strong>activamente suprimir</strong> las herramientas externas que permiten a los usuarios descubrir y recuperar estos saldos. "Si fuera un negocio legítimo, no tendrían miedo de que la gente supiera lo que tiene."</p>

<div class="post-alert">⚠ Marco ha solicitado permanecer completamente anónimo. No tenemos forma de verificar todos los detalles al 100%, pero los números son consistentes con estimaciones públicas del sector. La historia se publica bajo responsabilidad editorial de CryptoInsider ES.</div>

<p>El mensaje es claro: si tienes activos en exchanges centralizados, tienes que saber lo que tienes. Las herramientas on-chain existen para que puedas descubrirlo sin depender de que el exchange te lo diga.</p>`,
    comments: [
      { name: 'macro_defi', initial: 'M', color: '#9945FF', rank: '14.2k miembros', date: 'hace 10h', text: '$200M parece mucho pero si piensas en la escala es perfectamente creíble. Los balances dormidos son básicamente liquidez gratuita para el exchange. No generan intereses para el usuario pero sí para ellos.' },
      { name: 'skeptic_always', initial: 'S', color: '#FF4B6A', rank: '3.1k miembros', date: 'hace 10h', text: 'Sin nombre, sin pruebas documentales. Puede ser real, puede ser una historia inventada. Hay que ser críticos. Dicho esto, el modelo de negocio que describe es perfectamente coherente con cómo funcionan los CEX.' },
      { name: 'InsiderCrypto_Óscar', initial: 'I', color: '#29B6F6', rank: 'Admin', date: 'hace 9h', text: '@skeptic_always Totalmente válido el escepticismo. Lo que sí podemos verificar públicamente: ningún CEX importante tiene una función prominente de "encuentra todo tu dust". La ausencia de esa feature es la evidencia más elocuente.' },
      { name: 'not_your_keys', initial: 'N', color: '#00D68F', rank: '8.9k miembros', date: 'hace 8h', text: 'Esto confirma lo que sabemos desde siempre: los CEX tienen incentivos estructurales en contra de los usuarios. No es malicia individual — es el modelo de negocio. Por eso existen las wallets propias.' },
      { name: 'nueva_en_crypto', initial: 'V', color: '#F5B942', rank: '892 miembros', date: 'hace 6h', text: '¿Cómo hago para ver mis balances en mi propia wallet sin el exchange? Nunca he usado una wallet no custodial.' },
      { name: 'InsiderCrypto_Óscar', initial: 'I', color: '#29B6F6', rank: 'Admin', date: 'hace 5h', text: '@nueva_en_crypto Empieza por Phantom (Solana) o MetaMask (Ethereum). Una vez que transfieres a tu wallet, herramientas como CryptoResidual te muestran exactamente qué tienes — incluyendo el dust que ni sabías que existía.' },
    ]
  },
  {
    id: 4,
    source: 'X / Twitter',
    badgeClass: 'badge-twitter',
    category: 'Thread · Tutorial',
    title: 'Thread: Recuperé $847 en dust assets que no sabía que tenía — guía completa paso a paso con capturas reales (2025)',
    author: '@cryptomadrid_eth',
    authorInitial: 'C',
    authorColor: '#3DAFF5',
    rank: '23.4k seguidores · ETH OG',
    date: '2026-05-05 · 11:22 UTC',
    views: '112k',
    replies: 934,
    upvotes: '18.4k',
    body: `<p>🧵 Thread largo. Guárdalo. Puede que tenga cientos de dólares tirados en wallets que ni recuerdas que existen. Me pasó a mí y a muchos más. Voy a explicar exactamente qué hice.</p>

<p><strong>1/ El problema del dust</strong></p>
<p>Cuando llevas años en crypto, acumulas una cantidad ridícula de "basura digital": fracciones de tokens de airdrops que nunca vendiste, restos de swaps con slippage malo, tokens de proyectos muertos que nunca limpié. Todo eso tiene valor, y yo no lo sabía.</p>

<p><strong>2/ El descubrimiento</strong></p>
<p>Un amigo me recomendó usar una herramienta de análisis de cartera que escanea directamente on-chain. Introduje mi dirección de Ethereum mainnet. En menos de 60 segundos me apareció una lista de 23 tokens con saldo mayor a cero. Conocía 8 de ellos. Los otros 15... ni idea de cuándo los había recibido.</p>

<p><strong>3/ Las cifras reales</strong></p>
<p>El desglose de lo que encontré:</p>
<ul style="margin:12px 0 12px 20px;line-height:2.2">
<li>SHIB residual de un airdrop de 2021: <strong>$312.40</strong></li>
<li>PEPE de cuando hice un swap en mayo de 2023 y quedó resto: <strong>$89.20</strong></li>
<li>Tokens UNI de cuando voté en una propuesta de governance: <strong>$144.80</strong></li>
<li>USDC bloqueado en un protocolo de lending que cerró: <strong>$200.00</strong> (requirió proceso especial)</li>
<li>Varios tokens pequeños de airdrops varios: <strong>~$101</strong></li>
</ul>
<p><strong>Total: $847.40</strong> — dinero que simplemente no sabía que tenía.</p>

<div class="post-quote">El caso del USDC "bloqueado" fue el más complicado. El protocolo había migrado a V2 pero los fondos del contrato V1 seguían accesibles si sabías la dirección del contrato. Requirió interactuar directamente con el contrato en Etherscan. No es trivial si no tienes experiencia técnica, pero tampoco es imposible.</div>

<p><strong>4/ El proceso de consolidación</strong></p>
<p>La mayor parte del dust estaba en Ethereum mainnet, donde las gas fees son el gran enemigo. La clave es <strong>no hacer transacciones individuales</strong> — eso te costará más en gas que lo que recuperas. En cambio:</p>
<ul style="margin:12px 0 12px 20px;line-height:2.2">
<li>Agrupa todos los tokens pequeños en una sola transacción usando un aggregator como 1inch o Jupiter (Solana)</li>
<li>Convierte todo a ETH o SOL primero — elimina la fragmentación</li>
<li>Si el valor total es menor a $20, considera si vale la pena (a veces no, especialmente en L1)</li>
<li>Para cantidades pequeñas en Ethereum, usa L2 si el token tiene bridging disponible</li>
</ul>

<p><strong>5/ El consejo más importante</strong></p>
<p>Hazlo ahora. No mañana. Los exchanges y protocolos cambian sus políticas. Los contratos expiran. Los tokens pueden depreciarse. Y sobre todo: <strong>hay empresas gastando dinero activamente para que no encuentres estas herramientas</strong>. Lo que hoy es fácil de hacer, mañana puede ser más difícil de descubrir.</p>

<p>Tengo wallets en Solana y BSC que todavía no he escaneado. Cuando lo haga, continuaré el thread. Si tú también lo haces, cuéntame — me encanta ver los números de la gente.</p>

<div class="post-alert">💡 REPLIES interesantes abajo: varios usuarios reportan haber encontrado entre $50 y $2,300 en dust. La mediana según los replies parece estar alrededor de $180.</div>`,
    comments: [
      { name: '@solana_nativa', initial: 'S', color: '#9945FF', rank: '8.2k seguidores', date: 'hace 13h', text: 'Yo hice esto hace 3 meses. Encontré $340 en SOL y SPL tokens que había olvidado de cuando el ecosistema Solana despegó en 2021. La mayoría eran airdrops de proyectos que luego no siguieron, pero varios sí valían algo.' },
      { name: '@eth_maxi_real', initial: 'E', color: '#627EEA', rank: '31.1k seguidores', date: 'hace 13h', text: 'El tema del USDC en contratos V1 es más común de lo que parece. Hay literalmente decenas de millones de dólares atrapados en contratos deprecated de protocolos que migraron. No están perdidos — solo son difíciles de recuperar sin saber dónde buscar.' },
      { name: '@nueva_en_web3', initial: 'N', color: '#F5B942', rank: '234 seguidores', date: 'hace 12h', text: '¿Qué herramienta exactamente usaste para el escaneo inicial? Pregunto porque he visto muchas que parecen scams.' },
      { name: '@cryptomadrid_eth', initial: 'C', color: '#3DAFF5', rank: '23.4k seguidores', date: 'hace 12h', text: '@nueva_en_web3 Buena pregunta. La clave es que sean de SOLO LECTURA — solo necesitas tu dirección pública, nunca tu seed phrase ni clave privada. Si una herramienta te pide eso, cierra y huye.' },
      { name: '@hodler_barcelona', initial: 'H', color: '#00D68F', rank: '5.6k seguidores', date: 'hace 11h', text: 'Acabo de escanear mis 4 wallets siguiendo este thread. Total encontrado: $1,247. Principalmente SHIB que tenía desde 2021 y nunca había movido. Gracias por el empujón — llevaba años posponiéndolo.' },
      { name: '@cryptomadrid_eth', initial: 'C', color: '#3DAFF5', rank: '23.4k seguidores', date: 'hace 10h', text: '@hodler_barcelona Eso es exactamente de lo que hablo. $1,247 que simplemente no sabías que tenías. Es dinero real, no números abstractos. Me alegra que hayas actuado.' },
    ]
  },
  {
    id: 5,
    source: 'BitcoinTalk',
    badgeClass: 'badge-btalk',
    category: 'DeFi · On-chain',
    title: 'Compound Finance congela $2.4M en dust tokens — usuarios sin notificación llevan semanas sin poder recuperar sus fondos del protocolo',
    author: 'defi_researcher_es',
    authorInitial: 'D',
    authorColor: '#00D68F',
    rank: 'Full Member · 1,644 posts',
    date: '2026-05-04 · 19:21 UTC',
    views: '22.1k',
    replies: 318,
    upvotes: '3.4k',
    body: `<p>Lo que voy a describir ha sido confirmado por al menos 12 usuarios distintos en los últimos 20 días. Todos tienen cuentas en Compound Finance V2 y todos están viviendo la misma situación: sus dust tokens — fragmentos de cDAI, cETH, cUSDC — están técnicamente en su cartera, pero el protocolo no permite ejecutar ninguna acción sobre ellos.</p>

<p>La situación técnica es la siguiente: Compound V2 requiere que el saldo supere un <strong>mínimo de gas efficiency threshold</strong> para procesar transacciones de redeem. Ese umbral, que antes era irrelevante, se ha vuelto problemático porque el precio del gas en Ethereum subió y varios tokens del protocolo perdieron valor. El resultado: tienes tokens en tu wallet cuyo valor en USD cae por debajo del coste de la propia transacción necesaria para sacarlos.</p>

<div class="post-quote">En agregado, estimamos que hay aproximadamente $2.4M en cTokens de Compound V2 que están en este estado: existentes on-chain, técnicamente de propiedad del usuario, pero económicamente irrecuperables bajo condiciones normales de gas.</div>

<p>¿Qué opciones hay? Tres escenarios:</p>
<ul style="margin:12px 0 12px 20px;line-height:2.2">
<li><strong>Esperar a que el gas baje</strong>: Si el gas de Ethereum cae por debajo de 12 gwei, algunas de estas posiciones se vuelven recuperables. Pero no hay garantía de cuándo o si esto ocurrirá para todos los saldos.</li>
<li><strong>Migrar a L2</strong>: Compound V3 tiene deployments en Base y Polygon. La migración oficial no soporta posiciones tan pequeñas automáticamente.</li>
<li><strong>Usar aggregators de batch transactions</strong>: Herramientas como CryptoResidual pueden agrupar múltiples operaciones pequeñas en una sola transacción, reduciendo el coste unitario significativamente.</li>
</ul>

<p>Lo que me parece más preocupante de este caso no es el fallo técnico en sí — los protocolos DeFi tienen límites operativos razonables — sino que <strong>Compound no ha comunicado nada a los usuarios afectados</strong>. No hay email, no hay notificación in-app, no hay banner en la interfaz. Simplemente el botón de "Withdraw" está desactivado sin explicación.</p>

<div class="post-alert">⚠ Si tienes posiciones en Compound V2 con saldo inferior a $15, revisa tu situación ahora. La ventana de recuperación puede cerrarse si el protocolo migra completamente a V3 y depreca los contratos V2.</div>`,
    comments: [
      { name: 'eth_yield_farmer', initial: 'E', color: '#627EEA', rank: 'Senior Member · 2.1k posts', date: 'hace 15h', text: 'Confirmo. Tengo 0.0023 cETH bloqueado desde hace 3 semanas. El botón de Withdraw aparece pero cuando ejecuto la transacción falla con "insufficient gas". El soporte de Compound me dijo que es un "problema conocido" sin fecha de resolución.' },
      { name: 'solidity_auditor_mx', initial: 'S', color: '#9945FF', rank: 'Hero Member · 3.8k posts', date: 'hace 14h', text: 'He revisado el contrato. El threshold mínimo de redeem está hardcodeado en el contrato V2 y no puede cambiarse sin un upgrade del protocolo. La gobernanza de Compound tardó más de 6 meses en aprobar el último upgrade crítico. No esperes solución rápida.' },
      { name: 'defi_researcher_es', initial: 'D', color: '#00D68F', rank: 'Full Member · 1,644 posts', date: 'hace 12h', text: '@solidity_auditor_mx Exactamente. Y ese es el problema estructural del DeFi que nadie quiere discutir: los contratos inmutatbles pueden crear trampas de liquidez permanentes. La descentralización tiene un coste real.' },
      { name: 'nocoiner_converted', initial: 'N', color: '#F5B942', rank: 'Newbie · 8 posts', date: 'hace 10h', text: '¿Hay alguna forma de verificar si tengo fondos bloqueados en Compound sin tener que conectar la wallet directamente al protocolo?' },
      { name: 'defi_researcher_es', initial: 'D', color: '#00D68F', rank: 'Full Member · 1,644 posts', date: 'hace 9h', text: '@nocoiner_converted Sí. Cualquier herramienta de análisis de cartera de solo lectura puede detectar cTokens en tu dirección. Solo necesitas introducir tu dirección pública — ninguna firma, ningún acceso. CryptoResidual hace exactamente esto y además te dice cuáles son recuperables bajo las condiciones actuales de gas.' },
    ]
  },
  {
    id: 6,
    source: 'Reddit',
    badgeClass: 'badge-reddit',
    category: 'r/ethfinance · Analysis',
    title: 'Análisis on-chain: $1.2B en dust assets llevan más de 365 días sin mover en wallets activas — nadie lo reclama porque nadie sabe que existe',
    author: 'u/onchain_archaeologist',
    authorInitial: 'O',
    authorColor: '#FF6830',
    rank: 'Karma: 22.8k · 5 años',
    date: '2026-05-03 · 11:45 UTC',
    views: '58.3k',
    replies: 741,
    upvotes: '9.1k',
    body: `<p>Llevo 4 meses construyendo un dataset de análisis on-chain y hoy publico los resultados. La metodología: utilicé datos públicos de Ethereum mainnet, Solana, y BNB Smart Chain para identificar wallets con actividad en los últimos 12 meses que mantienen saldos de tokens individuales por debajo de $50 y que no han ejecutado ninguna transacción con esos tokens en más de 365 días.</p>

<p><strong>Los números:</strong></p>
<ul style="margin:14px 0 14px 20px;line-height:2.4">
<li>Ethereum mainnet: <strong>$487M</strong> en dust distribuido en 2.3M de wallets activas</li>
<li>Solana: <strong>$312M</strong> en SPL tokens olvidados en 1.1M de wallets</li>
<li>BNB Smart Chain: <strong>$401M</strong> en BEP-20 tokens estáticos en 3.7M de wallets</li>
<li><strong>Total agregado: ~$1.2B</strong> en activos que existen, son rastreables, y pertenecen a sus propietarios, pero llevan más de un año sin ser tocados</li>
</ul>

<p>Para calificar como "wallet activa" en mi dataset, la dirección tenía que haber realizado al menos una transacción en los últimos 90 días. Esto elimina las wallets completamente abandonadas — el dust que analizo pertenece a personas que <strong>activamente usan crypto pero simplemente no saben que tienen estos saldos</strong>.</p>

<div class="post-quote">El token más común en el dataset es SHIB, seguido de PEPE y varios tokens de airdrops de 2021-2022. La mayoría de los titulares probablemente ni recuerdan haberlos recibido. En muchos casos, el valor actual supera ampliamente el valor en el momento del airdrop.</div>

<p>¿Por qué nadie lo reclama? Tres razones principales según el análisis de comportamiento on-chain:</p>
<ul style="margin:12px 0 12px 20px;line-height:2.2">
<li><strong>Desconocimiento</strong>: El 78% de estos tokens fueron recibidos vía airdrop automatizado. El propietario nunca tomó una acción consciente para recibirlos.</li>
<li><strong>Coste percibido vs. valor percibido</strong>: Las personas sobreestiman el coste en gas y subestiman el valor acumulado cuando hay múltiples dust positions.</li>
<li><strong>Falta de herramientas de descubrimiento</strong>: Las wallets convencionales no muestran tokens con valor inferior a un threshold predefinido. Son invisibles en la interfaz.</li>
</ul>

<div class="post-alert">💡 DATO: Si eres holder de SHIB desde 2021 y no has revisado tus wallets secundarias, hay una probabilidad estadísticamente significativa de que tengas saldos no reclamados. El token fue distribuido de forma masiva mediante airdrops que mucha gente ni procesó conscientemente.</div>

<p>El dataset completo está disponible en mi GitHub. No incluyo direcciones individuales por privacidad, solo agregados por cadena, token, y rango de valor. El objetivo es académico.</p>`,
    comments: [
      { name: 'u/data_hermano_eth', initial: 'D', color: '#627EEA', rank: 'Karma: 5.4k', date: 'hace 22h', text: 'Metodología sólida. ¿Has considerado incluir también los dust en Arbitrum y Polygon? Con el boom de L2 de 2023-2024, sospecho que hay otro par de cientos de millones ahí.' },
      { name: 'u/onchain_archaeologist', initial: 'O', color: '#FF6830', rank: 'Karma: 22.8k', date: 'hace 21h', text: '@u/data_hermano_eth Sí, está en el roadmap para la versión 2 del dataset. Arbitrum y Optimism juntos probablemente añadan otro $150-200M a la cifra. Los datos de L2 son más difíciles de indexar pero factibles.' },
      { name: 'u/skeptical_quant', initial: 'S', color: '#9945FF', rank: 'Karma: 31.2k', date: 'hace 20h', text: 'Los números son plausibles pero quisiera ver la distribución. ¿Es $1.2B concentrado en unas pocas wallets con saldos de $40-50 cada una, o es genuinamente distribuido entre millones de usuarios con saldos de $1-5? Eso cambia mucho la narrativa.' },
      { name: 'u/onchain_archaeologist', initial: 'O', color: '#FF6830', rank: 'Karma: 22.8k', date: 'hace 19h', text: '@u/skeptical_quant Distribución en el GitHub. La mediana es $8.40 por wallet. El P90 es $34. Hay outliers con $40-50 pero son minoría. Es genuinamente distribuido — millones de personas con saldos que van de $2 a $30.' },
      { name: 'u/defi_latenight', initial: 'L', color: '#00D68F', rank: 'Karma: 2.1k', date: 'hace 16h', text: 'Acabo de escanear mis wallets. Encontré $127 en dust que no sabía que tenía. Principalmente PEPE de 2023. Gracias por publicar esto — llevaba años sin revisar.' },
    ]
  },
  {
    id: 7,
    source: 'Discord',
    badgeClass: 'badge-discord',
    category: 'Solana Foundation · Dev',
    title: 'OKX activa sistema de "auto-sweep" silencioso que transfiere dust inactivo a cuenta de operaciones del exchange — thread con evidencia técnica',
    author: 'sol_dev_guerrero',
    authorInitial: 'G',
    authorColor: '#8A9BF8',
    rank: 'Dev Verificado · Solana Foundation',
    date: '2026-05-03 · 08:33 UTC',
    views: '14.8k',
    replies: 203,
    upvotes: '2.7k',
    body: `<p>Hilo técnico. Esto va a ser largo. Quiero que quede bien documentado porque sé que van a intentar eliminarlo.</p>

<p><strong>Contexto:</strong> OKX tiene una wallet on-chain en Solana (puedes verificar la dirección en Solscan: lleva el label "OKX: Operations"). En los últimos 45 días, hemos observado un patrón de transacciones entrantes altamente inusual que merece análisis.</p>

<p>Las transacciones tienen las siguientes características:</p>
<ul style="margin:12px 0 12px 20px;line-height:2.2">
<li>Siempre ocurren entre las 02:00 y las 04:00 UTC (horario de mínima actividad de usuarios)</li>
<li>Son siempre transferencias de SPL tokens con valor inferior a $2 por transacción</li>
<li>Provienen de wallets que tienen historial de depósitos en OKX</li>
<li>No hay ninguna notificación visible al usuario sobre estas transferencias</li>
</ul>

<div class="post-quote">En los 45 días analizados, la wallet de OKX Operations recibió aproximadamente 47,000 microtransacciones de este tipo. El valor agregado es de aproximadamente $94,000. Esto representa un promedio de $2 por transacción de 47,000 usuarios distintos cuyos saldos de dust fueron movidos sin acción explícita de su parte.</div>

<p>Ahora, la defensa obvia de OKX sería: "son usuarios que utilizaron la función de dust conversion que ofrecemos". Pero aquí está el problema: <strong>la función de dust conversion de OKX requiere acción explícita del usuario en la app</strong>. Hemos contactado a 12 de los titulares de las wallets de origen (a través de sus identidades verificables on-chain) y ninguno recuerda haber activado esa función para esos tokens específicos.</p>

<p>Hipótesis técnica: OKX podría estar usando permisos de token que los usuarios firmaron en el pasado (cuando se registraron o usaron alguna función de la app) para ejecutar estas transferencias de forma silenciosa. Este tipo de "pre-authorization" es técnicamente posible en Solana y legalmente ambigua en la mayoría de jurisdicciones.</p>

<div class="post-alert">⚠ ACCIÓN RECOMENDADA: Si has usado OKX con tu wallet de Solana, revisa tus permisos de token en revoke.cash o similar. Revoca cualquier autorización que no recuerdes haber dado explícitamente. Especialmente las autorizaciones de "max amount".</div>`,
    comments: [
      { name: 'solana_sec_researcher', initial: 'R', color: '#9945FF', rank: 'Verificado · Investigador', date: 'hace 7h', text: 'He replicado el análisis independientemente. Los patrones son reales. No puedo afirmar con certeza que sea intencional o un bug, pero el comportamiento es anómalo. OKX no ha respondido a nuestros intentos de contacto en 72h.' },
      { name: 'okx_community_mgr', initial: 'K', color: '#F5B942', rank: 'OKX Community', date: 'hace 6h', text: 'Estamos investigando las afirmaciones de este hilo. Las transacciones mencionadas corresponden a nuestra función legítima de consolidación de micro-saldos que los usuarios activan voluntariamente en la configuración de la app. Publicaremos una respuesta detallada en 24h.' },
      { name: 'sol_dev_guerrero', initial: 'G', color: '#8A9BF8', rank: 'Dev Verificado', date: 'hace 5h', text: '@okx_community_mgr Esperaremos la respuesta. Mientras tanto, el dataset de las 47,000 transacciones está en IPFS. No desaparece. Si la explicación es la función voluntaria, esperamos ver evidencia de que cada una de esas 47k transacciones fue precedida de una acción explícita del usuario.' },
      { name: 'anon_sol_holder', initial: 'A', color: '#00D68F', rank: 'Miembro', date: 'hace 4h', text: 'Acabo de revisar mis permisos. Tenía una autorización de "max amount" para un contrato de OKX que no recuerdo haber dado. La he revocado. Gracias por este hilo.' },
    ]
  },
  {
    id: 8,
    source: 'Telegram',
    badgeClass: 'badge-telegram',
    category: 'Whale Alert ES · Report',
    title: 'Detectamos 47 wallets con más de $500 en dust no reclamado cada una — patrón consistente en holders de 2020-2022 que no revisaron sus portfolios',
    author: 'WhaleAlert_Rodrigo',
    authorInitial: 'W',
    authorColor: '#29B6F6',
    rank: 'Analista · Whale Alert ES',
    date: '2026-05-02 · 15:17 UTC',
    views: '33.6k',
    replies: 287,
    upvotes: '4.1k',
    body: `<p>Reporte mensual de Whale Alert ES. Este mes hemos añadido una nueva categoría de análisis: "high-value dormant dust" — wallets activas (han hecho transacciones en los últimos 90 días) que mantienen dust positions con valor agregado superior a $500 sin movimiento en más de 12 meses.</p>

<p><strong>Hallazgo del mes:</strong> Identificamos 47 wallets en esta categoría. No publicamos las direcciones por privacidad, pero compartimos los patrones estadísticos:</p>

<ul style="margin:14px 0 14px 20px;line-height:2.4">
<li>Rango de valor de dust: $512 – $4,847 por wallet</li>
<li>Mediana: $1,240 por wallet</li>
<li>Red más frecuente: Ethereum mainnet (68%), seguida de Solana (21%)</li>
<li>Token más común en el top 5 de cada cartera: SHIB (31%), UNI (22%), LINK (19%), APE (15%), otros (13%)</li>
<li>Período de adquisición más frecuente del dust: Q3 2021 – Q2 2022</li>
</ul>

<div class="post-quote">Lo más llamativo de estas 47 wallets es que son activas. No son wallets abandonadas. Sus propietarios siguen haciendo transacciones regularmente — comprando, vendiendo, usando DeFi — pero tienen cientos o miles de dólares en dust que nunca han tocado. La hipótesis más probable: estos tokens fueron recibidos en un período de alta actividad especulativa (2021-2022) y simplemente nunca entraron en el radar del propietario.</div>

<p>¿Cómo identificamos estas wallets? Usamos un proceso de análisis on-chain de múltiples pasos:</p>
<ul style="margin:12px 0 12px 20px;line-height:2.2">
<li>Indexación de todos los tokens ERC-20/SPL en wallets con actividad reciente</li>
<li>Filtrado por valor de token ({'<'}$50 individual) y ausencia de movimiento ({'>'} 365 días)</li>
<li>Valoración al precio actual de mercado usando feeds de CoinGecko</li>
<li>Clasificación por valor agregado y cruce con actividad general de la wallet</li>
</ul>

<p><strong>Mensaje a los holders de 2020-2022:</strong> Si compraste crypto activamente durante el bull run de 2021, tienes una probabilidad estadística alta de tener dust significativo en wallets que no has revisado recientemente. No asumas que lo sabes todo sobre lo que tienes — los airdrops de ese período fueron masivos y muchos pasaron desapercibidos.</p>

<div class="post-alert">💡 TIP PRÁCTICO: El coste de descubrir qué tienes es cero — solo necesitas tu dirección pública. El coste de no descubrirlo puede ser cientos o miles de dólares que simplemente se quedan ahí mientras podrían estar en tu bolsillo.</div>`,
    comments: [
      { name: 'whale_watcher_2021', initial: 'W', color: '#3DAFF5', rank: '28.4k miembros', date: 'hace 13h', text: 'El patrón de 2021-2022 tiene mucho sentido. Fue la época de los airdrops masivos. Yo mismo recibí tokens de Uniswap, dYdX, Optimism, Arbitrum... Algunos los vendí. Otros probablemente todavía están en wallets que no revisé.' },
      { name: 'defi_numbers_guy', initial: 'N', color: '#9945FF', rank: '7.2k miembros', date: 'hace 12h', text: 'La mediana de $1,240 es sorprendente. Pensaba que el dust era poca cosa pero $1,200 en dust no reclamado es dinero muy real. ¿Tenéis algún estimado de cuántas wallets en total (no solo las 47) podrían tener más de $100 en dust?' },
      { name: 'WhaleAlert_Rodrigo', initial: 'W', color: '#29B6F6', rank: 'Admin', date: 'hace 11h', text: '@defi_numbers_guy Estimamos que en Ethereum mainnet solo, hay aproximadamente 340,000 wallets activas con más de $100 en dust agregado. En todas las cadenas que analizamos, la cifra sería de 800,000-1,000,000 wallets.' },
      { name: 'new_to_defi_es', initial: 'N', color: '#F5B942', rank: '1.1k miembros', date: 'hace 9h', text: '¿Cómo puedo saber si soy una de esas wallets? ¿Hay alguna herramienta que lo compruebe gratis?' },
      { name: 'WhaleAlert_Rodrigo', initial: 'W', color: '#29B6F6', rank: 'Admin', date: 'hace 8h', text: '@new_to_defi_es Hay varias. Solo necesitas tu dirección pública — nunca des tu seed phrase a nadie. Herramientas como CryptoResidual hacen el análisis directamente on-chain y te muestran exactamente cuánto dust tienes y en qué tokens, ordenado por valor.' },
    ]
  },
  {
    id: 9,
    source: 'X / Twitter',
    badgeClass: 'badge-twitter',
    category: 'Opinion · Hot take',
    title: 'Los exchanges han convertido el "dust" en su fuente de liquidez más rentable: sin KYC, sin intereses, sin fecha de devolución. Es dinero tuyo que usan gratis.',
    author: '@macro_crypto_latam',
    authorInitial: 'M',
    authorColor: '#3DAFF5',
    rank: '67.2k seguidores · Macro analyst',
    date: '2026-05-01 · 20:44 UTC',
    views: '87.2k',
    replies: 1200,
    upvotes: '22.8k',
    body: `<p>🧵 HILO: El negocio más oscuro de los exchanges de crypto. Nadie habla de esto porque es legal, pero no debería serlo. Esto va a molestar a mucha gente.</p>

<p><strong>1/ ¿Qué es el "float" en banca tradicional?</strong></p>
<p>En banca tradicional, el "float" es el dinero que está en tránsito — depositado por el cliente pero aún no procesado. Los bancos usan ese dinero para invertir y generar rendimientos durante el período de tránsito. Es un negocio enorme. En 2023, se estimó que PayPal generó más de $900M en ingresos por intereses sobre el float de sus usuarios.</p>

<p><strong>2/ Los exchanges hacen exactamente lo mismo con el dust — pero peor</strong></p>
<p>El dust de los usuarios no está "en tránsito" — está indefinidamente en el balance del exchange. Sin fecha de vencimiento. Sin intereses para el usuario. Sin notificación. El exchange lo usa como quiera: para market making, para préstamos internos, para colateral en sus operaciones de trading. <strong>Es liquidez gratis con cero coste de capital.</strong></p>

<div class="post-quote">Estimación: si los 5 grandes exchanges (Binance, Coinbase, Kraken, OKX, Bybit) tienen colectivamente $1B en dust de usuarios (cifra conservadora basada en datos públicos), y lo despliegan a una tasa de retorno conservadora del 8% anual, eso son $80M al año en ingresos que nunca aparecen en ningún reporte, no se reportan como ingresos de usuarios, y de los que los propietarios reales nunca ven ni un centavo.</div>

<p><strong>3/ ¿Por qué es peor que el float bancario?</strong></p>
<ul style="margin:12px 0 12px 20px;line-height:2.2">
<li>Los bancos están regulados y el float tiene límites legales precisos</li>
<li>Los bancos pagan intereses (aunque mínimos) por los depósitos</li>
<li>Los bancos informan al cliente de cuándo su dinero está disponible</li>
<li>Los exchanges de crypto no hacen ninguna de estas cosas con el dust</li>
</ul>

<p><strong>4/ La solución es tan sencilla como perturbadora para su modelo de negocio</strong></p>
<p>Si cada exchange implementara una notificación mensual automática que dijera "Tienes $X en saldos pequeños que puedes consolidar", la mayoría de ese $1B desaparecería de su balance en semanas. Por eso no lo implementan. Por eso activamente suprimen las herramientas externas que hacen exactamente eso.</p>

<p><strong>5/ La única solución real</strong></p>
<p>Mueve tu crypto a wallets propias. Escanea regularmente con herramientas on-chain. No dejes que los exchanges mantengan activos tuyos que no necesitas que custodien. Cada dólar de dust que recuperas es un dólar de liquidez que les quitas.</p>

<div class="post-alert">💡 Actualización 6h después: Este thread ha sido compartido por tres cuentas verificadas con más de 100k seguidores. Bybit y OKX me han enviado DMs solicitando que lo elimine. He guardado capturas. No pienso eliminarlo.</div>`,
    comments: [
      { name: '@econ_crypto_es', initial: 'E', color: '#627EEA', rank: '44.1k seguidores', date: 'hace 19h', text: 'La analogía con el float bancario es brillante y políticamente devastadora. Los reguladores saben exactamente cómo funciona el float y cómo regularlo. Solo tienen que aplicar el mismo marco al crypto. El lobby de los exchanges está intentando que eso no pase.' },
      { name: '@defi_maximalist_ar', initial: 'D', color: '#9945FF', rank: '18.3k seguidores', date: 'hace 19h', text: 'El número de $80M/año es conservador. Si consideramos que los exchanges también usan el dust en staking, lending, y market making (donde los retornos pueden ser del 15-25% en algunos mercados), la cifra real podría ser $200M+.' },
      { name: '@macro_crypto_latam', initial: 'M', color: '#3DAFF5', rank: '67.2k seguidores', date: 'hace 18h', text: '@defi_maximalist_ar Completamente de acuerdo. Usé 8% como cifra conservadora y verificable. La realidad es probablemente el doble. Pero incluso siendo conservadores, la escala del problema es escandalosa.' },
      { name: '@crypto_normie_mx', initial: 'C', color: '#F5B942', rank: '892 seguidores', date: 'hace 17h', text: 'Llevo 3 años en crypto y nunca había pensado en esto. Acabo de revisar mis wallets siguiendo este hilo. Tenía $312 en dust que no sabía que tenía. $312.' },
      { name: '@macro_crypto_latam', initial: 'M', color: '#3DAFF5', rank: '67.2k seguidores', date: 'hace 16h', text: '@crypto_normie_mx $312. Eso es exactamente de lo que hablo. Multiplica ese número por los millones de usuarios que hay en crypto y entenderás la escala del problema. Es dinero tuyo. Recupéralo.' },
      { name: '@exchanges_are_fine', initial: 'X', color: '#EF4444', rank: '234 seguidores', date: 'hace 14h', text: 'Esto es narrativa anti-exchange. Los exchanges proveen servicios y tienen costes. El "dust" es marginal y la mayoría de usuarios no le da valor. Estás haciendo montaña de un grano de arena.' },
      { name: '@macro_crypto_latam', initial: 'M', color: '#3DAFF5', rank: '67.2k seguidores', date: 'hace 13h', text: '@exchanges_are_fine $1B en activos de usuarios no es un grano de arena. Y si fuera realmente marginal, ¿por qué Bybit y OKX me están pidiendo que elimine el hilo?' },
    ]
  }
];

function openPost(idx) {
  const post = POSTS[idx];
  const badge = document.getElementById('postNavBadge');
  badge.className = 'post-nav-source ' + post.badgeClass;
  badge.textContent = post.source;
  document.getElementById('postNavCat').textContent = post.category;

  const commentsHtml = post.comments.map(c => `
    <div class="comment">
      <div class="comment-avatar" style="background:${c.color}">${c.initial}</div>
      <div>
        <div class="comment-name">${c.name}</div>
        <div class="comment-meta">${c.rank} · ${c.date}</div>
        <div class="comment-text">${c.text}</div>
      </div>
    </div>`).join('');

  document.getElementById('postBody').innerHTML = `
    <h1 class="post-title">${post.title}</h1>
    <div class="post-author-bar">
      <div class="post-avatar" style="background:${post.authorColor}">${post.authorInitial}</div>
      <div>
        <div class="post-author-name">${post.author}</div>
        <div class="post-author-meta">${post.rank} · ${post.date}</div>
      </div>
      <div class="post-stats">
        <span class="post-stat-item">👁 ${post.views}</span>
        <span class="post-stat-item">💬 ${post.replies}</span>
        <span class="post-stat-item">⬆ ${post.upvotes}</span>
      </div>
    </div>
    <div class="post-content">${post.body}</div>
    <div class="post-comments-hdr">${post.replies} respuestas</div>
    <div class="post-comments">${commentsHtml}</div>`;

  document.getElementById('screen-post').scrollTop = 0;
  showScreen('post');
}

function closePost() {
  showScreen('connect');
}

// ══════════════════════════════════════
// CUSTOM STAR CURSOR
// ══════════════════════════════════════
const curEl  = document.getElementById('cur');
const curRing = document.getElementById('cur-ring');
let mx = -200, my = -200, crx = -200, cry = -200;

document.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; });

document.querySelectorAll('button,a,.consol-item,input,.fpc').forEach(el => {
  el.addEventListener('mouseenter', () => document.body.classList.add('cur-hover'));
  el.addEventListener('mouseleave', () => document.body.classList.remove('cur-hover'));
});

let curScale = 1;
document.addEventListener('mousedown', () => { curScale = .6; });
document.addEventListener('mouseup',   () => { curScale = 1; });

(function animCur() {
  crx += (mx - crx) * .1;
  cry += (my - cry) * .1;
  curEl.style.transform   = `translate(${mx - 12}px,${my - 12}px) scale(${curScale})`;
  curRing.style.transform = `translate(${crx - 21}px,${cry - 21}px)`;
  requestAnimationFrame(animCur);
})();

// Start connect-screen terminal on load
startConnectTerminal();

// ══════════════════════════════════════
// COOKIE CONSENT
// ══════════════════════════════════════
(function(){
  if (!localStorage.getItem('cr_ck_done')) {
    document.getElementById('ck-overlay').classList.remove('hidden');
  }
})();

function acceptCookies(){
  localStorage.setItem('cr_ck_done', '1');
  document.getElementById('ck-overlay').classList.add('hidden');
}
function rejectCookies(){
  localStorage.setItem('cr_ck_done', 'essential');
  document.getElementById('ck-overlay').classList.add('hidden');
}

// ══════════════════════════════════════
// EXCHANGE TICKER
// ══════════════════════════════════════
(function buildExTicker(){
  const EXCHANGES = [
    { name: 'Binance',   role: 'Spot & Futures',  domain: 'binance.com'     },
    { name: 'Coinbase',  role: 'US Exchange',      domain: 'coinbase.com'    },
    { name: 'Kraken',    role: 'Regulated CEX',    domain: 'kraken.com'      },
    { name: 'OKX',       role: 'Derivatives',      domain: 'okx.com'         },
    { name: 'Bybit',     role: 'Derivatives',      domain: 'bybit.com'       },
    { name: 'KuCoin',    role: 'Altcoin Hub',      domain: 'kucoin.com'      },
    { name: 'HTX',       role: 'Global Exchange',  domain: 'htx.com'         },
    { name: 'Gate.io',   role: 'Multi-chain',      domain: 'gate.io'         },
    { name: 'Bitfinex',  role: 'Liquidity',        domain: 'bitfinex.com'    },
    { name: 'Gemini',    role: 'Regulated CEX',    domain: 'gemini.com'      },
    { name: 'Uniswap',   role: 'DEX Protocol',     domain: 'uniswap.org'     },
    { name: 'Jupiter',   role: 'Solana DEX',       domain: 'jup.ag'          },
    { name: 'dYdX',      role: 'Perps DEX',        domain: 'dydx.exchange'   },
    { name: 'Bitget',    role: 'Copy Trading',     domain: 'bitget.com'      },
  ];
  const track = document.getElementById('exTrack');
  if (!track) return;
  const html = EXCHANGES.map(e => `
    <div class="ex-item">
      <img class="ex-logo"
        src="https://www.google.com/s2/favicons?domain=${e.domain}&sz=64"
        alt="${e.name}"
        onerror="this.style.display='none'">
      <div style="min-width:0;overflow:hidden;flex:1">
        <div class="ex-name">${e.name}</div>
        <div class="ex-role">${e.role}</div>
      </div>
    </div>`).join('');
  // Duplicate for seamless infinite loop
  track.innerHTML = html + html;
})();

// ══════════════════════════════════════
// PRICE TRACKER
// ══════════════════════════════════════
(function fetchPrices(){
  const fmt$ = v => v >= 1000 ? '$' + v.toLocaleString('en-US',{maximumFractionDigits:0}) : '$' + v.toFixed(v < 0.01 ? 6 : 2);
  const coins = [
    {sym:'BTC',  id:'bitcoin',      elPrice:'ptPriceBTC',  elPct:'ptPctBTC'},
    {sym:'ETH',  id:'ethereum',     elPrice:'ptPriceETH',  elPct:'ptPctETH'},
    {sym:'SOL',  id:'solana',       elPrice:'ptPriceSOL',  elPct:'ptPctSOL'},
    {sym:'BNB',  id:'binancecoin',  elPrice:'ptPriceBNB',  elPct:'ptPctBNB'},
    {sym:'XRP',  id:'ripple',       elPrice:'ptPriceXRP',  elPct:'ptPctXRP'},
    {sym:'ADA',  id:'cardano',      elPrice:'ptPriceADA',  elPct:'ptPctADA'},
    {sym:'AVAX', id:'avalanche-2',  elPrice:'ptPriceAVAX', elPct:'ptPctAVAX'},
    {sym:'DOGE', id:'dogecoin',     elPrice:'ptPriceDOGE', elPct:'ptPctDOGE'},
    {sym:'LINK', id:'chainlink',    elPrice:'ptPriceLINK', elPct:'ptPctLINK'},
    {sym:'DOT',  id:'polkadot',     elPrice:'ptPriceDOT',  elPct:'ptPctDOT'},
  ];
  const idList = coins.map(c => c.id).join(',');
  // simple/price is far more permissive on rate limits than /coins/markets
  fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${idList}&vs_currencies=usd&include_24hr_change=true`)
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(data => {
      coins.forEach(({sym, id, elPrice, elPct}) => {
        const coin = data[id];
        if (!coin) return;
        swapPricesUSD[sym] = coin.usd;
        const priceEl = document.getElementById(elPrice);
        const pctEl   = document.getElementById(elPct);
        const dtPriceEl  = document.getElementById('dt' + elPrice.slice(2));
        const dtPriceEl2 = document.getElementById('dt' + elPrice.slice(2) + '2');
        const dtPctEl    = document.getElementById('dt' + elPct.slice(2));
        const dtPctEl2   = document.getElementById('dt' + elPct.slice(2) + '2');
        if (priceEl)    priceEl.textContent    = fmt$(coin.usd);
        if (dtPriceEl)  dtPriceEl.textContent  = fmt$(coin.usd);
        if (dtPriceEl2) dtPriceEl2.textContent = fmt$(coin.usd);
        if (pctEl && coin.usd_24h_change != null) {
          const pct  = coin.usd_24h_change;
          const sign = pct >= 0 ? '+' : '';
          pctEl.textContent = sign + pct.toFixed(1) + '%';
          pctEl.className = 'pt-pct ' + (pct >= 0 ? 'up' : 'down');
          if (dtPctEl)  { dtPctEl.textContent  = sign + pct.toFixed(1) + '%'; dtPctEl.className  = 'pt-pct ' + (pct >= 0 ? 'up' : 'down'); }
          if (dtPctEl2) { dtPctEl2.textContent = sign + pct.toFixed(1) + '%'; dtPctEl2.className = 'pt-pct ' + (pct >= 0 ? 'up' : 'down'); }
        }
      });
      if (activeMainTab !== 'dust') calcExch();
      // Clone ptTrack for seamless loop after first successful fetch
      const tracker = document.getElementById('priceTracker');
      const track   = document.getElementById('ptTrack');
      if (tracker && track && !tracker.querySelector('.pt-track-clone')) {
        const clone = track.cloneNode(true);
        clone.classList.add('pt-track-clone');
        clone.removeAttribute('id');
        tracker.appendChild(clone);
      }
    })
    .catch(() => {});
  setTimeout(fetchPrices, 90000);
})();

// ── Exchange tabs ──
const SWAP_COINS = [
  {sym:'BTC',  gid:'bitcoin',      name:'Bitcoin'},
  {sym:'ETH',  gid:'ethereum',     name:'Ethereum'},
  {sym:'SOL',  gid:'solana',       name:'Solana'},
  {sym:'BNB',  gid:'binancecoin',  name:'BNB'},
  {sym:'XRP',  gid:'ripple',       name:'XRP'},
  {sym:'ADA',  gid:'cardano',      name:'Cardano'},
  {sym:'AVAX', gid:'avalanche-2',  name:'Avalanche'},
  {sym:'DOGE', gid:'dogecoin',     name:'Dogecoin'},
  {sym:'LINK', gid:'chainlink',    name:'Chainlink'},
  {sym:'DOT',  gid:'polkadot',     name:'Polkadot'},
  {sym:'USDT', gid:'tether',       name:'Tether'},
  {sym:'USDC', gid:'usd-coin',     name:'USD Coin'},
];
const ICON_BASE = 'https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons@1.0.0/svg/color/';
const USD_ICON  = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='16' fill='%2385bb65'/%3E%3Ctext x='16' y='22' text-anchor='middle' font-size='18' font-family='Arial' fill='white' font-weight='bold'%3E%24%3C/text%3E%3C/svg%3E";
const swapCoinImages = {};

function coinIcon(sym){ return swapCoinImages[sym] || ICON_BASE + sym.toLowerCase() + '.svg'; }

(function fetchCoinImages(){
  const ids = SWAP_COINS.map(c => c.gid).join(',');
  fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&per_page=50&page=1`)
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (!data) return;
      data.forEach(coin => {
        const found = SWAP_COINS.find(c => c.gid === coin.id);
        if (found && coin.image) swapCoinImages[found.sym] = coin.image;
      });
      const fi = document.getElementById('from-img');
      const ti = document.getElementById('to-img');
      if (fi && swapCoinImages[exchFromSym]) fi.src = coinIcon(exchFromSym);
      if (ti && swapCoinImages[exchToSym])   ti.src = coinIcon(exchToSym);
    })
    .catch(() => {});
})();

const swapPricesUSD = { USDT: 1, USDC: 1 };
let exchFromSym = 'BTC';
let exchToSym   = 'ETH';
let cpTarget    = 'from';
let activeMainTab = 'dust';

function switchMainTab(tab) {
  activeMainTab = tab;
  document.querySelectorAll('.main-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  const panelId = tab === 'dust' ? 'panel-dust' : 'panel-exchange';
  document.querySelectorAll('.main-panel').forEach(p => p.classList.toggle('active', p.id === panelId));
  if (tab !== 'dust') {
    setupExchForTab(tab);
    calcExch();
    // Always reset to step 1
    document.getElementById('exch-s1').classList.remove('hidden');
    document.getElementById('exch-s-confirm').classList.add('hidden');
    document.getElementById('exch-s2').classList.add('hidden');
    const pb = document.getElementById('exch-proceed-btn');
    if (pb) pb.classList.add('hidden');
  }
}

function setupExchForTab(tab) {
  const titleEl = document.getElementById('exch-step-title');
  if (tab === 'buy') {
    exchFromSym = 'USD';
    exchToSym   = 'BTC';
    document.getElementById('from-img').src = USD_ICON;
    document.getElementById('from-sym').textContent = 'USD';
    document.getElementById('from-btn').disabled = true;
    document.getElementById('from-amt').value = '100';
    document.getElementById('to-img').src   = coinIcon('BTC');
    document.getElementById('to-sym').textContent = 'BTC';
    document.getElementById('to-btn').disabled = false;
    if (titleEl) titleEl.textContent = 'Select crypto';
  } else if (tab === 'sell') {
    exchFromSym = 'ETH';
    exchToSym   = 'USD';
    document.getElementById('from-img').src = coinIcon('ETH');
    document.getElementById('from-sym').textContent = 'ETH';
    document.getElementById('from-btn').disabled = false;
    document.getElementById('from-amt').value = '1';
    document.getElementById('to-img').src   = USD_ICON;
    document.getElementById('to-sym').textContent = 'USD';
    document.getElementById('to-btn').disabled = true;
    if (titleEl) titleEl.textContent = 'Select pair';
  } else {
    exchFromSym = 'BTC';
    exchToSym   = 'ETH';
    document.getElementById('from-img').src = coinIcon('BTC');
    document.getElementById('from-sym').textContent = 'BTC';
    document.getElementById('from-btn').disabled = false;
    document.getElementById('from-amt').value = '0.1';
    document.getElementById('to-img').src   = coinIcon('ETH');
    document.getElementById('to-sym').textContent = 'ETH';
    document.getElementById('to-btn').disabled = false;
    if (titleEl) titleEl.textContent = 'Select pair';
  }
}

function calcExch() {
  const fromAmt = parseFloat(document.getElementById('from-amt').value) || 0;
  const isFixed = document.getElementById('fr-tog') && document.getElementById('fr-tog').checked;
  const fee     = isFixed ? 0.012 : 0.003;
  let fromUSD = 0, toUSD = 0, outAmt = 0;

  if (exchFromSym === 'USD') {
    fromUSD = fromAmt;
    const toP = swapPricesUSD[exchToSym] || 0;
    outAmt  = toP > 0 ? (fromAmt * (1 - fee)) / toP : 0;
    toUSD   = outAmt * toP;
  } else if (exchToSym === 'USD') {
    const fromP = swapPricesUSD[exchFromSym] || 0;
    fromUSD = fromAmt * fromP;
    outAmt  = fromUSD * (1 - fee);
    toUSD   = outAmt;
  } else {
    const fromP = swapPricesUSD[exchFromSym] || 0;
    const toP   = swapPricesUSD[exchToSym]   || 0;
    fromUSD = fromAmt * fromP;
    outAmt  = toP > 0 ? (fromUSD * (1 - fee)) / toP : 0;
    toUSD   = outAmt * toP;
  }

  const prefix = isFixed ? '' : '~';
  const fmtUSD = v => v > 0 ? '≈ $' + v.toLocaleString('en-US',{maximumFractionDigits:2}) : '≈ $0.00';
  const fmtAmt = n => {
    if (!n || n <= 0) return '—';
    if (n >= 1000) return prefix + n.toLocaleString('en-US',{maximumFractionDigits:2});
    if (n >= 1)    return prefix + n.toFixed(4);
    if (n >= 0.001)return prefix + n.toFixed(6);
    return prefix + n.toFixed(8);
  };

  const toAmtEl  = document.getElementById('to-amt');
  const fromUsdEl= document.getElementById('from-usd');
  const toUsdEl  = document.getElementById('to-usd');
  if (toAmtEl)   toAmtEl.textContent  = fmtAmt(outAmt);
  if (fromUsdEl) fromUsdEl.textContent= fmtUSD(fromUSD);
  if (toUsdEl)   toUsdEl.textContent  = fmtUSD(toUSD);
}

function flipPair() {
  if (exchFromSym === 'USD' || exchToSym === 'USD') return;
  [exchFromSym, exchToSym] = [exchToSym, exchFromSym];
  document.getElementById('from-sym').textContent = exchFromSym;
  document.getElementById('from-img').src = coinIcon(exchFromSym);
  document.getElementById('to-sym').textContent   = exchToSym;
  document.getElementById('to-img').src   = coinIcon(exchToSym);
  calcExch();
}

function openCoinPicker(side) {
  cpTarget = side;
  const list = document.getElementById('cp-list');
  if (!list) return;
  list.innerHTML = SWAP_COINS.map(c => `
    <button class="cp-item" onclick="selectCoin('${c.sym}')">
      <img class="cp-icon" src="${coinIcon(c.sym)}" alt="${c.sym}" onerror="this.style.opacity='.3'">
      <div><div class="cp-sym">${c.sym}</div><div class="cp-name">${c.name}</div></div>
      <div class="cp-price">${swapPricesUSD[c.sym] ? '$' + Number(swapPricesUSD[c.sym]).toLocaleString('en-US',{maximumFractionDigits:2}) : ''}</div>
    </button>`).join('');
  document.getElementById('coin-picker').classList.remove('hidden');
}

function closeCoinPicker() {
  const el = document.getElementById('coin-picker');
  if (el) el.classList.add('hidden');
}

function selectCoin(sym) {
  if (cpTarget === 'from') {
    if (sym === exchToSym) { exchToSym = exchFromSym; document.getElementById('to-sym').textContent = exchToSym; document.getElementById('to-img').src = coinIcon(exchToSym); }
    exchFromSym = sym;
    document.getElementById('from-sym').textContent = sym;
    document.getElementById('from-img').src = coinIcon(sym);
  } else {
    if (sym === exchFromSym) { exchFromSym = exchToSym; document.getElementById('from-sym').textContent = exchFromSym; document.getElementById('from-img').src = coinIcon(exchFromSym); }
    exchToSym = sym;
    document.getElementById('to-sym').textContent = sym;
    document.getElementById('to-img').src = coinIcon(sym);
  }
  closeCoinPicker();
  calcExch();
}

function proceedToExchange() {
  if (window._exchRedirectUrl) window.location.href = window._exchRedirectUrl;
}

function goExchConfirm() {
  const s1 = document.getElementById('exch-s1');
  const sc = document.getElementById('exch-s-confirm');
  if (!s1 || !sc) return;
  // Populate confirm fields
  const fromAmt = document.getElementById('from-amt').value || '0';
  const toAmt   = document.getElementById('to-amt').textContent || '—';
  const fromSym = exchFromSym;
  const toSym   = exchToSym;
  const fromUsd = document.getElementById('from-usd').textContent;
  const toUsd   = document.getElementById('to-usd').textContent;
  const isFixed = document.getElementById('fr-tog').checked;

  document.getElementById('conf-from-img').src = coinIcon(fromSym === 'USD' ? null : fromSym) || USD_ICON;
  if (fromSym === 'USD') document.getElementById('conf-from-img').src = USD_ICON;
  document.getElementById('conf-from-sym').textContent = fromSym;
  document.getElementById('conf-from-amt').textContent = fromAmt;
  document.getElementById('conf-from-usd').textContent = fromUsd;

  document.getElementById('conf-to-img').src = toSym === 'USD' ? USD_ICON : coinIcon(toSym);
  document.getElementById('conf-to-sym').textContent = toSym;
  document.getElementById('conf-to-amt').textContent = toAmt;
  document.getElementById('conf-to-usd').textContent = toUsd;

  // Exchange rate
  if (fromSym !== 'USD' && toSym !== 'USD') {
    const fromP = swapPricesUSD[fromSym] || 0;
    const toP   = swapPricesUSD[toSym]   || 0;
    const rate  = toP > 0 ? (fromP / toP).toFixed(6) : '—';
    document.getElementById('conf-rate').textContent = `1 ${fromSym} ≈ ${rate} ${toSym}`;
  } else {
    document.getElementById('conf-rate').textContent = '—';
  }

  // Fee
  const fromP = swapPricesUSD[fromSym] || 0;
  const amtUSD = parseFloat(fromAmt) * (fromSym === 'USD' ? 1 : fromP);
  const feeUSD = amtUSD * (isFixed ? 0.012 : 0.003);
  document.getElementById('conf-fee').textContent = feeUSD > 0 ? '~$' + feeUSD.toFixed(2) : '—';
  document.getElementById('conf-rate-type').textContent = isFixed ? 'Fixed' : 'Floating';

  s1.classList.add('hidden');
  sc.classList.remove('hidden');
}

function backToStep1() {
  const s1 = document.getElementById('exch-s1');
  const sc = document.getElementById('exch-s-confirm');
  if (sc) sc.classList.add('hidden');
  if (s1) s1.classList.remove('hidden');
}

function goExchStep2() {
  const sc = document.getElementById('exch-s-confirm');
  const s2 = document.getElementById('exch-s2');
  if (sc) sc.classList.add('hidden');
  if (s2) s2.classList.remove('hidden');
}

function backExchStep() {
  const sc = document.getElementById('exch-s-confirm');
  const s2 = document.getElementById('exch-s2');
  if (s2) s2.classList.add('hidden');
  if (sc) sc.classList.remove('hidden');
}

// ── Promo code ──
function openPromo(){
  document.getElementById('promo-overlay').classList.remove('hidden');
  document.getElementById('promo-input').focus();
  document.getElementById('promo-error').classList.add('hidden');
  document.getElementById('promo-input').classList.remove('error');
  document.getElementById('promo-input').value = '';
}
function closePromo(){
  document.getElementById('promo-overlay').classList.add('hidden');
}
function applyPromo(){
  const input = document.getElementById('promo-input');
  const err = document.getElementById('promo-error');
  input.classList.add('error');
  err.classList.remove('hidden');
  input.focus();
}

// ── Mobile gate ──
(function(){
  const isMobile = /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    || window.innerWidth <= 700;
  if (!isMobile) return;
  const gate = document.getElementById('mobile-gate');
  const urlEl = document.getElementById('mgUrl');
  if (urlEl) urlEl.textContent = location.hostname || 'cryptoresidual.io';
  if (gate) gate.style.display = 'flex';
})();