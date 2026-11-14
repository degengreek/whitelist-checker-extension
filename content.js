(function () {
  // ── Re-injection guard ─────────────────────────────────────────────────────
  const HOST_ID = 'wlc-shadow-host';
  const existing = document.getElementById(HOST_ID);
  if (existing) {
    existing.__wlcShow?.();
    return;
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  // Stops spreadsheet apps from treating a cell as a formula (CSV injection).
  const csvSafe = v => { const s = String(v ?? ''); return /^[=+\-@\t\r]/.test(s) ? "'" + s : s; };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ── Generic signal lists (fallback for non-Bugz sites) ─────────────────────
  const POS = [
    'whitelisted', 'eligible', 'congratulations', 'congrats',
    'approved', 'allowlisted', 'guaranteed', 'winner', 'selected',
    'fcfs', 'og mint', 'presale', 'vip mint', 'you can mint',
    'you are on', "you're on", 'is on the whitelist', 'is on the allowlist',
    'is on the fcfs', 'is on the og', 'free mint'
  ];
  const NEG = [
    'not whitelisted', 'not eligible', 'not found', 'sorry', 'unfortunately',
    'not on', 'no allocation', 'not included', 'not approved', 'not allowlisted',
    "isn't on", "is not on", "aren't on", "are not on",
    'not on the whitelist', 'not on the allowlist',
    'not in', 'no access', 'invalid', 'not listed',
    'does not qualify', 'did not qualify'
  ];
  const PHASE_RE = [
    /\b(og|fcfs|guaranteed|presale|vip|early\s*access|private\s*(?:mint|sale)?)\b/i,
    /\b(?:phase|tier|round)\s*[:\-]?\s*([a-z0-9]+)\b/i,
    /mint\s+in\s+the\s+(\w+)\s+phase/i,
    /(\d+)\s+free\s+mint/i,
    /(\d+)\s+(?:nft|token)s?\s+(?:to\s+)?mint/i,
    /allocation\s*[:\-]?\s*(\d+)/i,
  ];
  const RESULT_SELECTORS = [
    '[class*="result"]', '[class*="status"]', '[class*="eligible"]',
    '[class*="whitelist"]', '[class*="allowlist"]', '[class*="message"]',
    '[class*="response"]', '[class*="error"]', '[class*="success"]',
    '[id*="result"]', '[id*="status"]', 'p', 'h2', 'h3'
  ];
  const INPUT_HINTS = ['wallet', 'address', 'eth', '0x', 'metamask', 'check', 'whitelist', 'wl'];
  const SUBMIT_HINTS = ['check', 'verify', 'submit', 'search', 'lookup', 'enter', 'go', 'confirm'];

  function genericScore(text) {
    const t = text.toLowerCase();
    if (NEG.some(s => t.includes(s))) return 'NO';
    if (POS.some(s => t.includes(s))) return 'YES';
    return 'UNKNOWN';
  }
  function extractPhase(text) {
    for (const re of PHASE_RE) {
      const m = text.match(re);
      if (m) return (m[1] || m[0]).trim();
    }
    return null;
  }

  // ── DOM helpers ────────────────────────────────────────────────────────────
  function findInput() {
    const known = document.getElementById('bugz-wallet-check');
    if (known) return known;
    for (const el of document.querySelectorAll('input')) {
      const attrs = [el.placeholder, el.name, el.id, el.getAttribute('aria-label'), el.className].join(' ').toLowerCase();
      if (INPUT_HINTS.some(h => attrs.includes(h)) || el.placeholder.startsWith('0x')) return el;
    }
    return document.querySelector('input[type="text"]:not([hidden])') ||
           document.querySelector('input:not([type]):not([hidden])');
  }
  function findSubmit() {
    const known = document.querySelector('.bugz-checker__submit');
    if (known) return known;
    let best = null, bestScore = -1;
    for (const el of document.querySelectorAll('button, input[type="submit"], [role="button"]')) {
      const t = (el.innerText || el.value || '').toLowerCase();
      const s = SUBMIT_HINTS.filter(h => t.includes(h)).length;
      if (s > bestScore) { bestScore = s; best = el; }
    }
    return best;
  }
  function fillInput(input, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (setter) setter.call(input, value); else input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ── Site adapter: unvault.com/bugz ─────────────────────────────────────────
  // Reads the site's structured result instead of guessing from keywords.
  function readBugz() {
    const st = document.querySelector('.bugz-checker__status');
    const statusMsgs = [...(st?.querySelectorAll('.bugz-checker__msg') || [])].map(e => e.textContent.trim().toUpperCase());
    const joined = statusMsgs.join(' ');
    if (joined.includes('TOO MANY CHECKS')) return { kind: 'rate_limited' };
    if (joined.includes('TEMPORARILY UNAVAILABLE')) return { kind: 'unavailable' };
    if (joined.includes('VALID EVM OR SOLANA')) return { kind: 'invalid' };

    const res = document.querySelector('.bugz-checker__result');
    const elig = res?.querySelector('.bugz-checker__elig');
    if (!elig) return { kind: 'wait' };
    if (elig.classList.contains('bugz-checker__elig--pending')) return { kind: 'pending' };

    const text = elig.textContent.toUpperCase();
    const eligible = elig.classList.contains('bugz-checker__elig--ok');
    const phases = [];
    if (/PHASE\s*1/.test(text)) phases.push(1);
    if (/PHASE\s*2/.test(text)) phases.push(2);

    const notes = [...res.querySelectorAll('.bugz-checker__msg')].map(e => e.textContent.trim());
    const via = notes.find(n => /^via\s/i.test(n));
    const sources = via ? via.replace(/^via\s+/i, '').replace(/\.$/, '').split(/\s*\+\s*/).map(s => s.toLowerCase()) : [];
    const warnings = [];
    for (const n of notes) {
      if (/^via\s/i.test(n)) continue;
      if (/DELEGATION LOOKUP IS DEGRADED/i.test(n)) warnings.push('delegation lookup degraded — vault NFTs may be missing');
      else if (/NOT YOUR CONNECTED WALLET/i.test(n)) continue;
    }
    return { kind: 'result', eligible, phases, sources, warnings };
  }

  async function checkBugz(input, submit, wallet) {
    const t0 = performance.now();
    let retries = 0;
    const warnings = [];
    for (;;) {
      fillInput(input, wallet);
      await sleep(200);               // let React flush state → clears previous result
      submit.click();
      let r = { kind: 'wait' };
      const deadline = performance.now() + 90000; // site polls on-chain scans for up to ~2 min
      while (performance.now() < deadline) {
        await sleep(250);
        r = readBugz();
        if (r.kind !== 'wait' && r.kind !== 'pending') break;
      }
      if (r.kind === 'rate_limited' && retries < 4) {
        retries++; warnings.push('rate limited');
        await sleep(8000 * retries);
        continue;
      }
      if (r.kind === 'unavailable' && retries < 3) {
        retries++; warnings.push('checker unavailable');
        await sleep(4000);
        continue;
      }
      const ms = Math.round(performance.now() - t0);
      if (r.kind === 'result') {
        return {
          status: r.eligible ? 'ELIGIBLE' : 'NOT_ELIGIBLE',
          phases: r.phases, sources: r.sources,
          warnings: [...warnings, ...r.warnings], retries, ms
        };
      }
      const reason = { rate_limited: 'rate limited', unavailable: 'checker unavailable', invalid: 'invalid address',
                       pending: 'on-chain scan did not finish', wait: 'no response from page' }[r.kind] || r.kind;
      return { status: 'INCONCLUSIVE', phases: [], sources: [], warnings: [...warnings, reason], retries, ms };
    }
  }

  // ── Generic fallback adapter (other whitelist checkers) ────────────────────
  function pageSnapshot() {
    const texts = new Set();
    for (const sel of RESULT_SELECTORS)
      for (const el of document.querySelectorAll(sel)) {
        const t = el.innerText?.trim();
        if (t && t.length > 2 && t.length < 500) texts.add(t);
      }
    return texts;
  }
  function bestResult(prevSnap, wallet) {
    const shortAddr = wallet.slice(0, 6).toLowerCase();
    let best = '', bestScore = 0;
    for (const pass of [1, 2]) {
      for (const sel of RESULT_SELECTORS)
        for (const el of document.querySelectorAll(sel)) {
          const t = el.innerText?.trim() || '';
          if (!t || t.length < 3 || t.length > 500) continue;
          if (pass === 1 && prevSnap.has(t)) continue;
          const lower = t.toLowerCase();
          if (pass === 2 && !lower.includes(shortAddr)) continue;
          const sig = NEG.filter(s => lower.includes(s)).length * 2 + POS.filter(s => lower.includes(s)).length * 2 +
                      (pass === 1 && lower.includes(shortAddr) ? 3 : 0);
          if (sig > bestScore) { bestScore = sig; best = t; }
        }
      if (best) return best;
    }
    return best;
  }
  function waitForChange(prevSnap, wallet, timeout = 4000) {
    return new Promise(resolve => {
      let done = false, debounce;
      const finish = () => { if (done) return; done = true; resolve(bestResult(prevSnap, wallet)); };
      const obs = new MutationObserver(() => {
        clearTimeout(debounce);
        debounce = setTimeout(() => {
          const t = bestResult(prevSnap, wallet);
          if (t && genericScore(t) !== 'UNKNOWN') { obs.disconnect(); finish(); }
        }, 300);
      });
      obs.observe(document.body, { childList: true, subtree: true, characterData: true });
      setTimeout(() => { obs.disconnect(); finish(); }, timeout);
    });
  }
  async function checkGeneric(input, submit, wallet) {
    const t0 = performance.now();
    const snap = pageSnapshot();
    fillInput(input, wallet);
    if (submit) submit.click();
    else {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', keyCode: 13, bubbles: true }));
      input.form?.requestSubmit?.();
    }
    const text = await waitForChange(snap, wallet);
    const s = genericScore(text);
    const phase = s === 'YES' ? extractPhase(text) : null;
    return {
      status: s === 'YES' ? 'ELIGIBLE' : s === 'NO' ? 'NOT_ELIGIBLE' : 'INCONCLUSIVE',
      phases: [], sources: [], note: phase, evidence: text.slice(0, 160),
      warnings: s === 'UNKNOWN' ? ['no recognisable result text'] : [], retries: 0,
      ms: Math.round(performance.now() - t0)
    };
  }

  // ── State & analytics ──────────────────────────────────────────────────────
  const state = {
    wallets: [], labels: {}, results: {}, running: null, done: 0, total: 0,
    startedAt: 0, finishedAt: 0, minimized: false, mode: 'generic', filter: 'all',
    os: null, osFilter: 'allow'
  };

  // ── Site adapter: opensea.io drops (account-wide wallet × phase eligibility) ─
  // Uses the signed-in OpenSea session; read-only, nothing is signed or minted.
  const OS_ENDPOINT = location.origin + '/__api/graphql/';
  const OS_ELIG = `accountStageEligibility { walletCount allowlistedWalletCount wallets { address quantityMinted stages { dropStageUuid isEligible maxTotalMintableByWallet } } }`;
  const OS_STAGES = `stages { uuid stageType stageIndex label startTime endTime perWalletLimit maxTokenSupplyForStage }`;

  async function osQuery(slug, withStages) {
    const query = `query DropEligibilityQuery($collectionSlug: String!) { dropBySlug(slug: $collectionSlug) { __typename ${OS_ELIG} ${withStages ? OS_STAGES : ''} } }`;
    const r = await fetch(OS_ENDPOINT, {
      method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ operationName: 'DropEligibilityQuery', query, variables: { collectionSlug: slug } })
    });
    if (!r.ok) throw new Error('OpenSea returned HTTP ' + r.status);
    return r.json();
  }

  function osFmtTime(v) {
    if (!v) return '';
    const d = new Date(typeof v === 'number' && v < 1e12 ? v * 1000 : v);
    return isNaN(d) ? '' : d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  async function loadOpenSea(slug) {
    let j = await osQuery(slug, true);
    let stagesOk = !!j?.data?.dropBySlug?.accountStageEligibility;
    if (!stagesOk) j = await osQuery(slug, false);   // fall back to the minimal, known-good query
    const drop = j?.data?.dropBySlug;
    const e = drop?.accountStageEligibility;
    if (!e || !Array.isArray(e.wallets)) {
      const msg = j?.errors?.[0]?.message;
      throw new Error(msg ? 'OpenSea said: ' + String(msg).slice(0, 140)
                          : 'No wallet data returned. Are you signed in to OpenSea, and is this a drop page?');
    }

    const wallets = e.wallets.map(w => {
      const by = {};
      for (const s of w.stages || []) by[s.dropStageUuid] = { eligible: !!s.isEligible, max: s.maxTotalMintableByWallet };
      return { address: w.address, minted: w.quantityMinted, by };
    });

    let stages = (stagesOk ? drop.stages || [] : []).map(s => ({
      id: s.uuid, label: s.label || '', type: s.stageType || '', index: s.stageIndex,
      start: s.startTime, end: s.endTime, perWallet: s.perWalletLimit, supply: s.maxTokenSupplyForStage
    })).sort((a, b) => (a.index ?? 0) - (b.index ?? 0) || new Date(a.start) - new Date(b.start));

    const ids = (e.wallets[0]?.stages || []).map(s => s.dropStageUuid);
    for (const id of ids) if (!stages.some(s => s.id === id)) stages.push({ id, label: '', type: '' });
    stages = stages.filter(s => ids.includes(s.id) || !ids.length);

    // Names fall back to the "Phase N: …" lines on the page, if they line up one-to-one.
    const dom = [...new Set([...document.body.innerText.matchAll(/^\s*(Phase\s*\d+[^\n]*)$/gim)].map(m => m[1].trim()))];
    stages.forEach((s, i) => {
      if (!s.label) s.label = dom.length === stages.length ? dom[i] : `Stage ${i + 1}`;
      s.short = (s.label.match(/phase\s*(\d+)/i) || [])[1] ? 'P' + s.label.match(/phase\s*(\d+)/i)[1] : s.label.slice(0, 8);
      const allIn = wallets.length > 1 && wallets.every(w => w.by[s.id]?.eligible);
      s.isPublic = /public/i.test(s.type) || /public/i.test(s.label) || (allIn && i === stages.length - 1);
    });

    const allowlisted = w => stages.some(s => !s.isPublic && w.by[s.id]?.eligible);
    wallets.forEach(w => { w.allow = allowlisted(w); w.count = stages.filter(s => !s.isPublic && w.by[s.id]?.eligible).length; });
    wallets.sort((a, b) => b.count - a.count || (b.by[stages[0]?.id]?.max || 0) - (a.by[stages[0]?.id]?.max || 0));

    return { slug, stages, wallets, stagesOk, walletCount: e.walletCount, allowlistedWalletCount: e.allowlistedWalletCount };
  }

  const osShort = a => /^0x/i.test(a) ? a.slice(0, 6) + '…' + a.slice(-4) : a.slice(0, 4) + '…' + a.slice(-4);
  const osLabel = a => state.labels[a] || state.labels[Object.keys(state.labels).find(k => k.toLowerCase() === a.toLowerCase())] || '';

  function renderOS() {
    const os = state.os;
    const $ = id => shadow.getElementById(id);
    const head = (sub) => `
      <div id="hdr">
        <div><div id="ttl">WL Checker <span style="font-weight:400;color:#5a5a78">· OpenSea</span></div><div id="sub">${esc(sub)}</div></div>
        <div id="btns"><button id="minBtn" title="Minimize">${state.minimized ? '+' : '−'}</button><button id="closeBtn" title="Close">×</button></div>
      </div>`;
    const wire = () => {
      $('closeBtn').onclick = () => panel.style.display = 'none';
      $('minBtn').onclick = () => { state.minimized = !state.minimized; renderOS(); };
    };
    if (!os || os.loading) { panel.innerHTML = head('Reading your OpenSea account…') + '<div id="bar"><div id="fill" style="width:40%"></div></div>'; wire(); return; }
    if (os.error) {
      panel.innerHTML = head('Could not read eligibility') + `<div class="err"><b>${esc(os.error)}</b>Make sure you are signed in on this page.</div>
        <div id="ftr"><button id="osRetry">Try again</button></div>`;
      wire(); $('osRetry').onclick = () => runOS(); return;
    }

    const { stages, wallets } = os;
    const nAllow = wallets.filter(w => w.allow).length;
    const per = stages.map(s => ({ s, n: wallets.filter(w => w.by[s.id]?.eligible).length }));
    const shown = state.osFilter === 'allow' ? wallets.filter(w => w.allow) : wallets;
    const cols = `grid-template-columns: minmax(120px,1.4fr) repeat(${stages.length}, minmax(44px,1fr))`;

    const tiles = per.map(({ s, n }) => `<div class="tile"><b class="${s.isPublic ? 'c-neu' : 'c-yes'}">${n}<small style="font-size:11px;color:#5a5a78">/${wallets.length}</small></b><span>${esc(s.short)}${s.isPublic ? ' · public' : ''}</span></div>`).join('');
    const legend = stages.map(s => `<div class="meta"><b>${esc(s.short)}</b> ${esc(s.label)}${s.start ? ' · ' + esc(osFmtTime(s.start)) : ''}${s.perWallet ? ' · limit ' + esc(s.perWallet) + '/wallet' : ''}</div>`).join('');
    const rows = shown.map(w => {
      const lbl = osLabel(w.address);
      const cells = stages.map(s => {
        const c = w.by[s.id];
        return c?.eligible ? `<div class="osc yes">✓<small>${esc(c.max ?? '')}</small></div>` : '<div class="osc no">—</div>';
      }).join('');
      return `<div class="osrow" style="${cols}"><div><div class="addr">${esc(osShort(w.address))}${/^0x/i.test(w.address) ? '' : '<span class="lbl">SOL</span>'}${lbl ? `<span class="lbl">${esc(lbl)}</span>` : ''}</div></div>${cells}</div>`;
    }).join('') || '<div class="err">No wallets in this view.</div>';

    const tab = (k, label) => `<button data-f="${k}" class="${state.osFilter === k ? 'on' : ''}">${label}</button>`;
    panel.innerHTML = head(`${os.slug} · ${wallets.length} wallets · ${nAllow} on an allowlist`) + `
      <div id="bar"><div id="fill" style="width:100%"></div></div>
      ${state.minimized ? '' : `
      <div id="scroll">
        <div class="sec"><h4>Eligible wallets per phase</h4><div class="tiles" style="grid-template-columns:repeat(${Math.min(stages.length, 5)},1fr)">${tiles}</div></div>
        <div class="sec"><h4>Schedule</h4>${legend}
          <div class="meta" style="margin-top:6px">Small number in a cell = max total this wallet can mint through that phase (OpenSea's <i>maxTotalMintableByWallet</i>).${os.stagesOk ? '' : '<br><b class="c-unk">Phase names come from the page — OpenSea did not return the stage list.</b>'}</div>
        </div>
        <div class="tabs">${tab('allow', `Allowlisted ${nAllow}`)}${tab('all', `All ${wallets.length}`)}</div>
        <div class="osgrid"><div class="osrow oshead" style="${cols}"><div>Wallet</div>${stages.map(s => `<div class="osc">${esc(s.short)}</div>`).join('')}</div>${rows}</div>
      </div>
      <div id="ftr"><button id="csvBtn">Copy CSV</button><button id="phaseBtn">Copy by phase</button><button id="osRetry">Refresh</button></div>`}`;
    wire();
    if (state.minimized) return;
    shadow.querySelectorAll('.tabs button').forEach(b => b.onclick = () => { state.osFilter = b.dataset.f; renderOS(); });
    $('csvBtn').onclick = () => copy(osCSV(), 'CSV copied');
    $('phaseBtn').onclick = () => copy(stages.map(s => `${s.label}\n` + wallets.filter(w => w.by[s.id]?.eligible).map(w => w.address).join('\n')).join('\n\n'), 'Copied, grouped by phase');
    $('osRetry').onclick = () => runOS();
  }

  function osCSV() {
    const os = state.os, q = v => `"${csvSafe(v).replace(/"/g, '""')}"`;
    const head = ['address', 'label', 'chain', ...os.stages.flatMap(s => [s.label + ' eligible', s.label + ' max'])];
    const lines = [head.map(q).join(',')];
    for (const w of os.wallets) lines.push([w.address, osLabel(w.address), /^0x/i.test(w.address) ? 'evm' : 'solana',
      ...os.stages.flatMap(s => [w.by[s.id]?.eligible ? 'yes' : 'no', w.by[s.id]?.max ?? ''])].map(q).join(','));
    return lines.join('\n');
  }

  async function runOS() {
    const slug = location.pathname.split('/')[2];
    state.os = { loading: true, slug };
    renderOS();
    try {
      state.os = await loadOpenSea(slug);
      if (!state.os.wallets.some(w => w.allow)) state.osFilter = 'all';
    } catch (e) {
      state.os = { error: e.message, slug };
    }
    renderOS();
  }

  function analyze() {
    const rs = state.wallets.map(w => state.results[w]).filter(Boolean);
    const a = { checked: rs.length, eligible: 0, no: 0, inc: 0, p1only: 0, p2only: 0, both: 0, other: 0,
                sources: {}, degraded: 0, retried: 0, totalMs: 0 };
    for (const r of rs) {
      a.totalMs += r.ms || 0;
      if (r.retries) a.retried++;
      if (r.warnings?.some(w => /degraded/.test(w))) a.degraded++;
      if (r.status === 'NOT_ELIGIBLE') a.no++;
      else if (r.status === 'INCONCLUSIVE') a.inc++;
      else {
        a.eligible++;
        const has1 = r.phases.includes(1), has2 = r.phases.includes(2);
        if (has1 && has2) a.both++; else if (has1) a.p1only++; else if (has2) a.p2only++; else a.other++;
        for (const s of r.sources) a.sources[s] = (a.sources[s] || 0) + 1;
      }
    }
    return a;
  }

  const pct = (n, d) => d ? Math.round(n / d * 100) : 0;
  const fmtSec = ms => (ms / 1000).toFixed(1) + 's';

  // ── Panel ──────────────────────────────────────────────────────────────────
  const CSS = `
    :host { all: initial; position: fixed; bottom: 24px; right: 24px; z-index: 2147483647; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    * { box-sizing: border-box; }
    #p { width: 460px; max-height: 640px; background: #0f0f13; border: 1px solid #252535; border-radius: 12px; box-shadow: 0 24px 64px rgba(0,0,0,.85), 0 0 0 1px rgba(255,255,255,.04); display: flex; flex-direction: column; overflow: hidden; color: #e2e2e8; animation: si .18s ease-out; }
    @keyframes si { from { transform: translateY(16px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    #hdr { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px 10px; border-bottom: 1px solid #1a1a28; flex-shrink: 0; }
    #ttl { font-size: 13px; font-weight: 600; letter-spacing: .3px; }
    #sub { font-size: 11px; color: #5a5a78; margin-top: 1px; }
    #btns { display: flex; gap: 4px; }
    #btns button { all: unset; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; border-radius: 5px; color: #5a5a78; font-size: 15px; cursor: pointer; }
    #btns button:hover { background: #1a1a28; color: #e2e2e8; }
    #bar { height: 2px; background: #1a1a28; flex-shrink: 0; }
    #fill { height: 100%; background: linear-gradient(90deg,#22c55e,#4ade80); transition: width .35s ease; }
    #scroll { flex: 1; overflow-y: auto; min-height: 0; }
    #scroll::-webkit-scrollbar { width: 3px; } #scroll::-webkit-scrollbar-thumb { background: #252535; border-radius: 2px; }
    .sec { padding: 12px 14px; border-bottom: 1px solid #1a1a28; }
    .sec h4 { font-size: 10px; letter-spacing: 1px; text-transform: uppercase; color: #5a5a78; font-weight: 600; margin-bottom: 8px; }
    .tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
    .tile { background: #14141c; border: 1px solid #1d1d2c; border-radius: 8px; padding: 8px 6px; text-align: center; }
    .tile b { display: block; font-size: 19px; font-weight: 700; line-height: 1.1; }
    .tile span { display: block; font-size: 9.5px; color: #5a5a78; margin-top: 3px; text-transform: uppercase; letter-spacing: .5px; }
    .c-yes { color: #22c55e; } .c-no { color: #ef4444; } .c-unk { color: #f59e0b; } .c-neu { color: #a5a5c8; }
    .stack { display: flex; height: 8px; border-radius: 4px; overflow: hidden; background: #1a1a28; margin-bottom: 8px; }
    .stack i { display: block; height: 100%; }
    .legend { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 11px; color: #8a8aa8; }
    .legend em { font-style: normal; display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 5px; }
    .kv { display: grid; grid-template-columns: auto 1fr auto; gap: 5px 10px; align-items: center; font-size: 11.5px; color: #a5a5c8; }
    .kv .m { height: 6px; background: #1a1a28; border-radius: 3px; overflow: hidden; } .kv .m i { display: block; height: 100%; background: #6366f1; }
    .kv .n { color: #e2e2e8; font-weight: 600; font-variant-numeric: tabular-nums; }
    .meta { font-size: 11px; color: #5a5a78; line-height: 1.6; }
    .meta b { color: #a5a5c8; font-weight: 600; }
    .tabs { display: flex; gap: 4px; padding: 8px 14px 4px; }
    .tabs button { all: unset; cursor: pointer; font-size: 11px; color: #5a5a78; padding: 3px 9px; border-radius: 12px; border: 1px solid #1d1d2c; }
    .tabs button.on { color: #e2e2e8; background: #1a1a28; border-color: #2c2c44; }
    .row { display: grid; grid-template-columns: 1fr auto; gap: 4px 10px; padding: 8px 14px; border-top: 1px solid #14141c; }
    .row:hover { background: rgba(255,255,255,.018); }
    .addr { font-size: 11.5px; font-family: 'Courier New', monospace; color: #9090b8; }
    .lbl { font-size: 10.5px; color: #4a4a62; margin-left: 6px; font-family: inherit; }
    .chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
    .chip { font-size: 10px; padding: 1px 6px; border-radius: 4px; background: #1a1a28; color: #8a8aa8; white-space: nowrap; }
    .chip.p { background: rgba(168,85,247,.14); color: #c084fc; } .chip.s { background: rgba(99,102,241,.14); color: #818cf8; }
    .chip.w { background: rgba(245,158,11,.12); color: #f59e0b; }
    .st { font-size: 11.5px; font-weight: 700; text-align: right; white-space: nowrap; }
    .st small { display: block; font-weight: 400; font-size: 10px; color: #4a4a62; margin-top: 2px; }
    .st.yes { color: #22c55e; } .st.no { color: #ef4444; } .st.unk { color: #f59e0b; } .st.pend { color: #36364a; } .st.run { color: #6366f1; animation: pu 1s infinite; }
    @keyframes pu { 0%,100%{opacity:1}50%{opacity:.3} }
    #ftr { display: flex; gap: 6px; padding: 9px 14px; border-top: 1px solid #1a1a28; flex-shrink: 0; }
    #ftr button { all: unset; cursor: pointer; font-size: 11px; color: #a5a5c8; padding: 5px 10px; border: 1px solid #252535; border-radius: 6px; }
    #ftr button:hover { background: #1a1a28; color: #fff; } #ftr button[disabled] { opacity: .35; pointer-events: none; }
    .err { padding: 20px 14px; text-align: center; color: #5a5a78; font-size: 12.5px; line-height: 1.5; }
    .err b { display: block; color: #f59e0b; margin-bottom: 6px; font-size: 13px; }
    .osgrid { overflow-x: auto; }
    .osrow { display: grid; gap: 4px 8px; align-items: center; padding: 7px 14px; border-top: 1px solid #14141c; }
    .osrow:hover { background: rgba(255,255,255,.018); }
    .oshead { font-size: 10px; letter-spacing: .8px; text-transform: uppercase; color: #5a5a78; border-top: 0; }
    .osc { text-align: center; font-size: 12px; font-weight: 700; }
    .osc.yes { color: #22c55e; } .osc.no { color: #2c2c40; }
    .osc small { display: block; font-size: 9.5px; font-weight: 500; color: #5a5a78; }
  `;

  const host = document.createElement('div');
  host.id = HOST_ID;
  // 'closed' keeps the page's own scripts from reaching into the results panel.
  const shadow = host.attachShadow({ mode: 'closed' });
  document.body.appendChild(host);
  const style = document.createElement('style');
  style.textContent = CSS;
  shadow.appendChild(style);
  const panel = document.createElement('div');
  panel.id = 'p';
  shadow.appendChild(panel);
  host.__wlcShow = () => { panel.style.display = 'flex'; };

  function showError(msg, detail) {
    panel.innerHTML = `
      <div id="hdr"><div><div id="ttl">WL Checker</div></div><div id="btns"><button id="closeBtn">×</button></div></div>
      <div class="err"><b>${esc(msg)}</b>${esc(detail)}</div>`;
    shadow.getElementById('closeBtn').onclick = () => panel.style.display = 'none';
  }

  function statusCell(w) {
    const r = state.results[w];
    if (!r) return state.running === w ? '<div class="st run">checking…</div>' : '<div class="st pend">—</div>';
    const t = `<small>${fmtSec(r.ms)}${r.retries ? ` · ${r.retries} retr${r.retries > 1 ? 'ies' : 'y'}` : ''}</small>`;
    if (r.status === 'ELIGIBLE') return `<div class="st yes">✓ ELIGIBLE${t}</div>`;
    if (r.status === 'NOT_ELIGIBLE') return `<div class="st no">✗ NOT ELIGIBLE${t}</div>`;
    return `<div class="st unk">? INCONCLUSIVE${t}</div>`;
  }

  function chipsFor(w) {
    const r = state.results[w];
    if (!r) return '';
    let h = '';
    for (const p of r.phases) h += `<span class="chip p">Phase ${p}</span>`;
    if (r.note) h += `<span class="chip p">${esc(r.note)}</span>`;
    for (const s of r.sources) h += `<span class="chip s">${esc(s)}</span>`;
    for (const x of r.warnings || []) h += `<span class="chip w">⚠ ${esc(x)}</span>`;
    return h ? `<div class="chips">${h}</div>` : '';
  }

  function render() {
    const a = analyze();
    const n = state.total;
    const finished = state.done >= n && !state.running;
    const sub = finished ? `Done — ${a.checked} of ${n} wallets checked in ${fmtSec((state.finishedAt || Date.now()) - state.startedAt)}`
                         : `Checking ${Math.min(state.done + 1, n)} of ${n}…`;

    const seg = (v, c) => v ? `<i style="width:${pct(v, a.checked)}%;background:${c}"></i>` : '';
    const eligPct = pct(a.eligible, a.checked);
    const srcEntries = Object.entries(a.sources).sort((x, y) => y[1] - x[1]);
    const srcRows = srcEntries.map(([k, v]) =>
      `<span>${esc(k)}</span><div class="m"><i style="width:${pct(v, a.eligible)}%"></i></div><span class="n">${v}</span>`).join('');

    const visible = state.wallets.filter(w => {
      const r = state.results[w];
      if (state.filter === 'all') return true;
      if (state.filter === 'yes') return r?.status === 'ELIGIBLE';
      if (state.filter === 'no') return r?.status === 'NOT_ELIGIBLE';
      return r?.status === 'INCONCLUSIVE';
    });
    const rows = visible.map(w => {
      const short = w.slice(0, 6) + '…' + w.slice(-4);
      const lbl = state.labels[w] ? `<span class="lbl">${esc(state.labels[w])}</span>` : '';
      return `<div class="row"><div><div class="addr">${short}${lbl}</div>${chipsFor(w)}</div>${statusCell(w)}</div>`;
    }).join('') || '<div class="err">Nothing in this view yet.</div>';

    const tab = (k, label) => `<button data-f="${k}" class="${state.filter === k ? 'on' : ''}">${label}</button>`;
    const body = state.minimized ? '' : `
      <div id="scroll">
        <div class="sec">
          <h4>Overview</h4>
          <div class="tiles">
            <div class="tile"><b class="c-yes">${a.eligible}</b><span>Eligible</span></div>
            <div class="tile"><b class="c-no">${a.no}</b><span>Not eligible</span></div>
            <div class="tile"><b class="c-unk">${a.inc}</b><span>Inconclusive</span></div>
            <div class="tile"><b class="c-neu">${eligPct}%</b><span>Hit rate</span></div>
          </div>
        </div>
        ${a.eligible ? `
        <div class="sec">
          <h4>Phase breakdown (of ${a.eligible} eligible)</h4>
          <div class="stack">${seg(a.both, '#22c55e')}${seg(a.p1only, '#6366f1')}${seg(a.p2only, '#a855f7')}${seg(a.other, '#64748b')}</div>
          <div class="legend">
            <span><em style="background:#22c55e"></em>Phase 1 + 2 · ${a.both}</span>
            <span><em style="background:#6366f1"></em>Phase 1 only · ${a.p1only}</span>
            <span><em style="background:#a855f7"></em>Phase 2 only · ${a.p2only}</span>
            ${a.other ? `<span><em style="background:#64748b"></em>Other · ${a.other}</span>` : ''}
          </div>
        </div>` : ''}
        ${srcEntries.length ? `
        <div class="sec"><h4>Qualified via</h4><div class="kv">${srcRows}</div></div>` : ''}
        <div class="sec">
          <h4>Diagnostics</h4>
          <div class="meta">
            Avg check <b>${a.checked ? fmtSec(a.totalMs / a.checked) : '—'}</b> ·
            Retried <b>${a.retried}</b> ·
            Delegation degraded <b>${a.degraded}</b>
            ${a.inc ? `<br><b class="c-unk">${a.inc} wallet${a.inc > 1 ? 's' : ''} could not be verified</b> — not the same as "not eligible". Use “Retry inconclusive”.` : ''}
            ${a.degraded ? `<br>Vault-held NFTs may be missing for ${a.degraded} wallet${a.degraded > 1 ? 's' : ''}; consider re-checking later.` : ''}
          </div>
        </div>
        <div class="tabs">${tab('all', `All ${n}`)}${tab('yes', `Eligible ${a.eligible}`)}${tab('no', `Not ${a.no}`)}${tab('inc', `Inconclusive ${a.inc}`)}</div>
        <div id="rows">${rows}</div>
      </div>
      <div id="ftr">
        <button id="csvBtn">Copy CSV</button>
        <button id="eligBtn" ${a.eligible ? '' : 'disabled'}>Copy eligible</button>
        <button id="retryBtn" ${a.inc && !state.running ? '' : 'disabled'}>Retry inconclusive</button>
      </div>`;

    panel.innerHTML = `
      <div id="hdr">
        <div><div id="ttl">WL Checker <span style="font-weight:400;color:#5a5a78">· ${state.mode === 'bugz' ? 'Bugz adapter' : 'generic'}</span></div><div id="sub">${esc(sub)}</div></div>
        <div id="btns"><button id="minBtn" title="Minimize">${state.minimized ? '+' : '−'}</button><button id="closeBtn" title="Close">×</button></div>
      </div>
      <div id="bar"><div id="fill" style="width:${pct(state.done, n)}%"></div></div>
      ${body}`;

    const $ = id => shadow.getElementById(id);
    $('closeBtn').onclick = () => panel.style.display = 'none';
    $('minBtn').onclick = () => { state.minimized = !state.minimized; render(); };
    if (state.minimized) return;
    shadow.querySelectorAll('.tabs button').forEach(b => b.onclick = () => { state.filter = b.dataset.f; render(); });
    $('csvBtn').onclick = () => copy(toCSV(), 'CSV copied');
    $('eligBtn').onclick = () => copy(state.wallets.filter(w => state.results[w]?.status === 'ELIGIBLE').join('\n'), 'Eligible addresses copied');
    $('retryBtn').onclick = () => {
      const todo = state.wallets.filter(w => state.results[w]?.status === 'INCONCLUSIVE');
      todo.forEach(w => delete state.results[w]);
      run(todo);
    };
  }

  function toCSV() {
    const q = v => `"${csvSafe(v).replace(/"/g, '""')}"`;
    const lines = [['address', 'label', 'status', 'phase1', 'phase2', 'sources', 'notes', 'seconds'].map(q).join(',')];
    for (const w of state.wallets) {
      const r = state.results[w];
      if (!r) continue;
      lines.push([w, state.labels[w] || '', r.status, r.phases.includes(1) ? 'yes' : '', r.phases.includes(2) ? 'yes' : '',
        r.sources.join(' + '), [r.note, ...(r.warnings || [])].filter(Boolean).join('; '), (r.ms / 1000).toFixed(1)].map(q).join(','));
    }
    return lines.join('\n');
  }

  async function copy(text, msg) {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const t = document.createElement('textarea');
      t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
    }
    const sub = shadow.getElementById('sub');
    if (sub) { const old = sub.textContent; sub.textContent = msg; setTimeout(() => { const s = shadow.getElementById('sub'); if (s) s.textContent = old; }, 1500); }
  }

  // ── Main ───────────────────────────────────────────────────────────────────
  let busy = false;
  async function run(list) {
    if (busy) return;
    busy = true;
    const input = findInput();
    const submit = findSubmit();
    const check = state.mode === 'bugz' ? checkBugz : checkGeneric;
    state.done = state.wallets.length - list.length;
    state.total = state.wallets.length;
    state.finishedAt = 0;
    if (!state.startedAt || list.length === state.wallets.length) state.startedAt = Date.now();

    for (let i = 0; i < list.length; i++) {
      const w = list[i];
      state.running = w;
      render();
      try {
        state.results[w] = await check(input, submit, w);
      } catch (e) {
        state.results[w] = { status: 'INCONCLUSIVE', phases: [], sources: [], warnings: ['script error: ' + e.message], retries: 0, ms: 0 };
      }
      state.done++;
      state.running = null;
      render();
      if (i < list.length - 1) await sleep(state.mode === 'bugz' ? 900 : 600); // be polite to the site
    }
    state.finishedAt = Date.now();
    busy = false;
    render();
  }

  async function init() {
    const data = await chrome.storage.sync.get(['wallets', 'labels']);
    state.wallets = (data.wallets || []).filter(Boolean);
    state.labels = data.labels || {};

    // OpenSea drop page → account-wide eligibility (uses wallets linked to your OpenSea account)
    if (/(^|\.)opensea\.io$/.test(location.hostname) && /^\/collection\/[^/]+/.test(location.pathname)) {
      state.mode = 'opensea';
      runOS();
      return;
    }

    if (state.wallets.length === 0) { showError('No wallets saved', 'Open the extension popup to add your wallet addresses.'); return; }
    if (!findInput()) { showError('No input found', 'Could not detect a wallet address input on this page. Navigate to the whitelist checker section.'); return; }

    state.mode = document.getElementById('bugz-wallet-check') ? 'bugz' : 'generic';
    state.total = state.wallets.length;
    run(state.wallets.slice());
  }

  init();
})();
