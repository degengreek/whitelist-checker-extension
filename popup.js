const addrInput = document.getElementById('addr-input');
const labelInput = document.getElementById('label-input');
const addBtn = document.getElementById('add-btn');
const walletList = document.getElementById('wallet-list');
const emptyState = document.getElementById('empty-state');
const walletCount = document.getElementById('wallet-count');
const importToggle = document.getElementById('import-toggle');
const importArea = document.getElementById('import-area');
const importText = document.getElementById('import-text');
const importBtn = document.getElementById('import-btn');

// ── Storage ────────────────────────────────────────────────────────────────

async function load() {
  const data = await chrome.storage.sync.get(['wallets', 'labels']);
  return { wallets: data.wallets || [], labels: data.labels || {} };
}

async function save(wallets, labels) {
  await chrome.storage.sync.set({ wallets, labels });
}

// ── Render ─────────────────────────────────────────────────────────────────

function render(wallets, labels) {
  const count = wallets.length;
  walletCount.textContent = count === 1 ? '1 wallet' : `${count} wallets`;
  emptyState.style.display = count === 0 ? 'flex' : 'none';
  walletList.innerHTML = '';

  wallets.forEach(w => {
    const short = w.slice(0, 8) + '…' + w.slice(-6);
    const lbl = labels[w] || '';

    // Built with DOM APIs + textContent (never innerHTML) so labels can't inject markup.
    const row = document.createElement('div');
    row.className = 'wallet-row';
    const info = document.createElement('div');
    info.className = 'wallet-info';
    const addrEl = document.createElement('div');
    addrEl.className = 'wallet-addr';
    addrEl.textContent = short;
    info.appendChild(addrEl);
    if (lbl) {
      const lblEl = document.createElement('div');
      lblEl.className = 'wallet-label';
      lblEl.textContent = lbl;
      info.appendChild(lblEl);
    }
    const del = document.createElement('button');
    del.className = 'delete-btn';
    del.dataset.wallet = w;
    del.title = 'Remove';
    del.textContent = '×';
    row.append(info, del);
    walletList.appendChild(row);
  });

  walletList.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', () => removeWallet(btn.dataset.wallet));
  });
}

// ── Actions ────────────────────────────────────────────────────────────────

async function addWallet(address, label) {
  address = address.trim();
  label = label.trim();

  if (!address.match(/^0x[0-9a-fA-F]{40}$/)) {
    flash('Invalid address format');
    return false;
  }

  const { wallets, labels } = await load();
  if (wallets.includes(address)) {
    flash('Already in list');
    return false;
  }

  wallets.push(address);
  if (label) labels[address] = label;
  await save(wallets, labels);
  render(wallets, labels);
  flash(`Added ${address.slice(0, 8)}…`);
  return true;
}

async function removeWallet(address) {
  const { wallets, labels } = await load();
  const updated = wallets.filter(w => w !== address);
  delete labels[address];
  await save(updated, labels);
  render(updated, labels);
}

async function importBulk(raw) {
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  const { wallets, labels } = await load();
  let added = 0;

  for (const line of lines) {
    const parts = line.split(/[\s,\t]+/);
    const addr = parts[0];
    const lbl = parts.slice(1).join(' ');

    if (!addr.match(/^0x[0-9a-fA-F]{40}$/i)) continue;

    // Normalize checksum loosely — keep original casing from input
    if (!wallets.some(w => w.toLowerCase() === addr.toLowerCase())) {
      wallets.push(addr);
      if (lbl) labels[addr] = lbl;
      added++;
    }
  }

  await save(wallets, labels);
  render(wallets, labels);
  flash(`Imported ${added} wallet${added !== 1 ? 's' : ''}`);
  return added;
}

// ── Toast ──────────────────────────────────────────────────────────────────

let toastTimer;
function flash(msg) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
}

// ── Events ─────────────────────────────────────────────────────────────────

addBtn.addEventListener('click', async () => {
  const ok = await addWallet(addrInput.value, labelInput.value);
  if (ok) { addrInput.value = ''; labelInput.value = ''; addrInput.focus(); }
});

addrInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') addBtn.click();
});

importToggle.addEventListener('click', () => {
  const hidden = importArea.classList.toggle('hidden');
  importToggle.textContent = hidden ? 'Import bulk ▾' : 'Import bulk ▴';
});

importBtn.addEventListener('click', async () => {
  const raw = importText.value;
  if (!raw.trim()) return;
  await importBulk(raw);
  importText.value = '';
  importArea.classList.add('hidden');
  importToggle.textContent = 'Import bulk ▾';
});

// ── Init ───────────────────────────────────────────────────────────────────

load().then(({ wallets, labels }) => render(wallets, labels));
