'use strict';

// ── Validação de dados do storage (defense against storage tampering) ─────────
function isValidCapture(c) {
  return c && typeof c.id === 'string'
    && typeof c.src === 'string'
    && c.src.startsWith('data:image/')
    && !c.src.includes('svg')
    && c.src.length <= 50_000_000
    && typeof c.ts === 'string' && !isNaN(Date.parse(c.ts));
}

// ── State ─────────────────────────────────────────────────────────────────────
let captures   = [];
let selectedIds = new Set();
let lastCheckedIdx = -1;
let sortOrder  = 'newest';
let currentId  = null;
let armedTimer = null;
let toastTimer = null;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const gridEl      = document.getElementById('grid');
const emptyHintEl = document.getElementById('emptyHint');
const countEl     = document.getElementById('count');
const btnClear    = document.getElementById('btnClear');
const btnZip      = document.getElementById('btnZip');
const dot         = document.getElementById('dot');
const statusTxt   = document.getElementById('statusTxt');
const lightbox    = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightboxImg');
const toastEl     = document.getElementById('toast');

// ── UI helpers ────────────────────────────────────────────────────────────────
function showToast(msg) {
  clearTimeout(toastTimer);
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
}

function setStatus(active, text) {
  dot.className  = active ? 'on' : '';
  statusTxt.textContent = text;
}

function fmtTime(ts) {
  const d   = new Date(ts);
  const now = new Date();
  const hm  = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return 'hoje ' + hm;
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return 'ontem ' + hm;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + hm;
}

function sorted() {
  return [...captures].sort((a, b) =>
    sortOrder === 'newest' ? (b.ts > a.ts ? 1 : -1) : (a.ts > b.ts ? 1 : -1)
  );
}

// ── Grid colunas ─────────────────────────────────────────────────────────────
let gridCols = parseInt(localStorage.getItem('gridCols') || '3', 10);

function applyGridCols(n) {
  gridCols = Math.min(6, Math.max(2, n));
  document.documentElement.style.setProperty('--cols', gridCols);
  document.getElementById('colsSlider').value = gridCols;
  document.getElementById('colsVal').textContent = gridCols;
  try { localStorage.setItem('gridCols', gridCols); } catch {}
}

document.getElementById('colsSlider').addEventListener('input', e => applyGridCols(+e.target.value));
applyGridCols(gridCols);

// ── Seleção ───────────────────────────────────────────────────────────────────
const btnSelDl  = document.getElementById('btnSelDl');
const btnSelDel = document.getElementById('btnSelDel');
const btnSelClr = document.getElementById('btnSelClr');
const sepSel    = document.getElementById('sepSel');

function updateSelButtons() {
  const n = selectedIds.size;
  const on = n > 0;
  btnSelDl.hidden  = !on;
  btnSelDel.hidden = !on;
  btnSelClr.hidden = !on;
  sepSel.hidden    = !on;
  btnSelDl.textContent  = `Baixar (${n})`;
  btnSelDel.textContent = `Excluir (${n})`;
}

btnSelClr.addEventListener('click', () => {
  selectedIds.clear();
  render();
});

btnSelDel.addEventListener('click', () => {
  captures = captures.filter(c => !selectedIds.has(c.id));
  selectedIds.clear();
  saveStorage();
  render();
  showToast('Capturas excluídas');
});

btnSelDl.addEventListener('click', async () => {
  const toDownload = sorted().filter(c => selectedIds.has(c.id));
  btnSelDl.disabled = true;
  btnSelDl.textContent = 'Gerando…';
  try {
    if (toDownload.length === 1) {
      const blob = await capToJpegBlob(toDownload[0].src);
      triggerDownload(blob, `rapidex-${ts()}.jpg`);
    } else {
      const files = await Promise.all(toDownload.map(async (cap, i) => {
        const blob = await capToJpegBlob(cap.src);
        return { name: `captura-${String(i+1).padStart(2,'0')}.jpg`, data: new Uint8Array(await blob.arrayBuffer()) };
      }));
      triggerDownload(buildZip(files), `RAPIDEX-SELECIONADOS-${ts()}.zip`);
    }
    showToast(`${toDownload.length} imagem${toDownload.length !== 1 ? 's' : ''} baixada${toDownload.length !== 1 ? 's' : ''}`);
    selectedIds.clear();
    render();
  } catch { showToast('Erro ao gerar arquivo'); }
  finally { updateSelButtons(); btnSelDl.disabled = false; }
});

// ── Render ────────────────────────────────────────────────────────────────────
function render() {
  gridEl.innerHTML = '';
  const n = captures.length;
  emptyHintEl.hidden = n > 0;
  btnClear.disabled = n === 0;
  btnZip.disabled   = n === 0;
  countEl.textContent = `${n} captura${n !== 1 ? 's' : ''}`;
  // remove ids de capturas que não existem mais
  for (const id of selectedIds) { if (!captures.find(c => c.id === id)) selectedIds.delete(id); }
  updateSelButtons();

  sorted().forEach((cap, i) => {
    const idx  = i + 1;
    const card = document.createElement('div');
    card.className = 'card';
    card.tabIndex  = 0;
    card.setAttribute('role', 'button');
    if (selectedIds.has(cap.id)) card.classList.add('selected');

    // DOM puro — sem innerHTML com dados do storage (evita XSS por storage tampering)
    const img = document.createElement('img');
    img.src     = cap.src;   // data: URL — atributo src nunca executa script
    img.alt     = `Captura ${idx}`;
    img.loading = 'lazy';

    const check = document.createElement('input');
    check.type      = 'checkbox';
    check.className = 'card-check';
    check.checked   = selectedIds.has(cap.id);
    check.setAttribute('aria-label', `Selecionar captura ${idx}`);
    const bar = document.createElement('div');
    bar.className = 'card-bar';
    const spanTime = document.createElement('span');
    spanTime.textContent = fmtTime(cap.ts);
    const spanIdx = document.createElement('span');
    spanIdx.textContent = `#${idx}`;
    bar.appendChild(spanTime);
    bar.appendChild(spanIdx);

    const delBtn = document.createElement('button');
    delBtn.className = 'card-del';
    delBtn.setAttribute('aria-label', `Excluir captura ${idx}`);
    delBtn.textContent = '×';

    card.appendChild(check);
    card.appendChild(img);
    card.appendChild(bar);
    card.appendChild(delBtn);

    delBtn.addEventListener('click', e => { e.stopPropagation(); deleteCapture(cap.id); });

    check.addEventListener('change', e => {
      e.stopPropagation();
      if (check.checked) selectedIds.add(cap.id); else selectedIds.delete(cap.id);
      card.classList.toggle('selected', check.checked);
      lastCheckedIdx = i;
      updateSelButtons();
    });

    // Sem seleção → abre lightbox; Shift → range select; com seleção → togela card
    card.addEventListener('click', e => {
      if (e.target === delBtn) return;

      if (e.shiftKey) {
        if (e.target === check) e.preventDefault(); // evita toggle do checkbox
        if (lastCheckedIdx >= 0) {
          const list = sorted();
          const from = Math.min(lastCheckedIdx, i);
          const to   = Math.max(lastCheckedIdx, i);
          for (let j = from; j <= to; j++) selectedIds.add(list[j].id);
          render();
        } else {
          check.checked = true;
          check.dispatchEvent(new Event('change'));
        }
        return;
      }

      if (e.target === check) return; // change listener cuida
      if (selectedIds.size > 0) {
        check.checked = !check.checked;
        check.dispatchEvent(new Event('change'));
      } else {
        openLightbox(cap);
      }
    });
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLightbox(cap); }
    });
    gridEl.appendChild(card);
  });
}

// ── Storage ───────────────────────────────────────────────────────────────────
function saveStorage() {
  chrome.storage.local.set({ captures });
}

// Escuta mudanças feitas pelo background (offscreen → background → storage)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.captures) return;
  const prev = captures.length;
  captures = changes.captures.newValue || [];
  render();
  if (captures.length > prev) showToast('Captura salva');
});

// ── Capture CRUD ──────────────────────────────────────────────────────────────
function deleteCapture(id) {
  captures = captures.filter(c => c.id !== id);
  if (currentId === id) closeLightbox();
  saveStorage();
  render();
  showToast('Captura excluída');
}

// ── Clear ─────────────────────────────────────────────────────────────────────
btnClear.addEventListener('click', () => {
  if (!btnClear.classList.contains('armed')) {
    btnClear.classList.add('armed');
    btnClear.textContent = 'Confirmar';
    clearTimeout(armedTimer);
    armedTimer = setTimeout(() => {
      btnClear.classList.remove('armed');
      btnClear.textContent = 'Limpar';
    }, 3000);
    return;
  }
  clearTimeout(armedTimer);
  btnClear.classList.remove('armed');
  btnClear.textContent = 'Limpar';
  captures = [];
  saveStorage();
  render();
  showToast('Capturas apagadas');
});

// ── Sort ──────────────────────────────────────────────────────────────────────
document.getElementById('sortSel').addEventListener('change', e => {
  sortOrder = e.target.value;
  render();
});

// ── Lightbox ──────────────────────────────────────────────────────────────────
let zoom = 1, panX = 0, panY = 0, isPanning = false, panStart = { x: 0, y: 0 };

function resetZoom() {
  zoom = 1; panX = 0; panY = 0;
  lightboxImg.style.transform = '';
  lightboxImg.classList.remove('zoomed');
}

function applyZoom() {
  lightboxImg.style.transform = `translate(${panX}px,${panY}px) scale(${zoom})`;
  lightboxImg.classList.toggle('zoomed', zoom > 1);
}

function updateNav() {
  const list = sorted();
  const idx  = list.findIndex(c => c.id === currentId);
  document.getElementById('lightboxPrev').disabled = idx <= 0;
  document.getElementById('lightboxNext').disabled = idx >= list.length - 1;
}

function openLightbox(cap) {
  currentId = cap.id;
  lightboxImg.src = cap.src;
  lightbox.hidden = false;
  resetZoom();
  updateNav();
  document.getElementById('lightboxClose').focus();
}

function closeLightbox() {
  lightbox.hidden = true;
  lightboxImg.src = '';
  currentId = null;
  resetZoom();
}

function navigateLightbox(dir) {
  const list = sorted();
  const idx  = list.findIndex(c => c.id === currentId);
  const next = list[idx + dir];
  if (next) openLightbox(next);
}

// Zoom via scroll
lightboxImg.addEventListener('wheel', e => {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
  zoom = Math.max(1, Math.min(8, zoom * factor));
  if (zoom === 1) { panX = 0; panY = 0; }
  applyZoom();
}, { passive: false });

// Drag quando zoomed
lightboxImg.addEventListener('mousedown', e => {
  if (zoom <= 1) return;
  isPanning = true;
  panStart = { x: e.clientX - panX, y: e.clientY - panY };
  lightboxImg.classList.add('panning');
  e.preventDefault();
});
document.addEventListener('mousemove', e => {
  if (!isPanning) return;
  panX = e.clientX - panStart.x;
  panY = e.clientY - panStart.y;
  applyZoom();
});
document.addEventListener('mouseup', () => {
  isPanning = false;
  lightboxImg.classList.remove('panning');
});

lightbox.addEventListener('click', e => { if (e.target === lightbox) closeLightbox(); });
document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
document.getElementById('lightboxPrev').addEventListener('click', () => navigateLightbox(-1));
document.getElementById('lightboxNext').addEventListener('click', () => navigateLightbox(1));

document.addEventListener('keydown', e => {
  if (lightbox.hidden) return;
  if (e.key === 'Escape')      closeLightbox();
  if (e.key === 'ArrowLeft')   navigateLightbox(-1);
  if (e.key === 'ArrowRight')  navigateLightbox(1);
});

// ── Downloads ─────────────────────────────────────────────────────────────────
function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  chrome.downloads.download({ url, filename, saveAs: false }, () => {
    URL.revokeObjectURL(url);
  });
}

function capToJpegBlob(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob')), 'image/jpeg', 0.92);
    };
    img.onerror = reject;
    img.src = src;
  });
}

function ts() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}-${p(d.getMonth()+1)}-${String(d.getFullYear()).slice(2)}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

document.getElementById('lightboxSave').addEventListener('click', async () => {
  const cap = captures.find(c => c.id === currentId);
  if (!cap) return;
  const btn = document.getElementById('lightboxSave');
  btn.textContent = '…';
  try {
    const blob = await capToJpegBlob(cap.src);
    triggerDownload(blob, `rapidex-${ts()}.jpg`);
    showToast('Download iniciado');
  } catch { showToast('Erro ao gerar JPG'); }
  finally { btn.textContent = 'Salvar JPG'; }
});

// ── ZIP ───────────────────────────────────────────────────────────────────────
function crc32(data) {
  if (!crc32._t) {
    crc32._t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      crc32._t[i] = c;
    }
  }
  let c = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) c = crc32._t[(c ^ data[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function u32(n) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n, true); return b; }
function u16(n) { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, n, true); return b; }
function cat(arrays) {
  const len = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(len); let pos = 0;
  for (const a of arrays) { out.set(a, pos); pos += a.length; }
  return out;
}
function buildZip(files) {
  const enc = s => new TextEncoder().encode(s);
  const parts = [], central = [];
  let offset = 0;
  for (const { name, data } of files) {
    const nb = enc(name), crc = crc32(data);
    const lh = cat([new Uint8Array([0x50,0x4B,0x03,0x04]), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length), u16(nb.length), u16(0)]);
    const cd = cat([new Uint8Array([0x50,0x4B,0x01,0x02]), u16(0), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length), u16(nb.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset)]);
    parts.push(lh, nb, data);
    central.push(cat([cd, nb]));
    offset += lh.length + nb.length + data.length;
  }
  const cdBlob = cat(central);
  const eocd = cat([new Uint8Array([0x50,0x4B,0x05,0x06]), u16(0), u16(0),
    u16(files.length), u16(files.length), u32(cdBlob.length), u32(offset), u16(0)]);
  return new Blob([cat([...parts, cdBlob, eocd])], { type: 'application/zip' });
}

btnZip.addEventListener('click', async () => {
  if (captures.length === 0) return;
  btnZip.disabled = true;
  btnZip.textContent = 'Gerando…';
  try {
    const ordered = sorted();
    const files = await Promise.all(ordered.map(async (cap, i) => {
      const blob = await capToJpegBlob(cap.src);
      return { name: `captura-${String(i+1).padStart(2,'0')}.jpg`, data: new Uint8Array(await blob.arrayBuffer()) };
    }));
    triggerDownload(buildZip(files), `RAPIDEX-IMAGENS-${ts()}.zip`);
    showToast(`ZIP com ${captures.length} imagem${captures.length !== 1 ? 's' : ''} gerado`);
  } catch { showToast('Erro ao gerar ZIP'); }
  finally { btnZip.disabled = false; btnZip.textContent = 'Baixar tudo'; }
});

// ── Abrir em aba ──────────────────────────────────────────────────────────────
document.getElementById('btnTab').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') });
});

// ── Init ──────────────────────────────────────────────────────────────────────
chrome.storage.local.get(['captures'], r => {
  captures = r.captures || [];
  render();
});

// ── Salvar blob de imagem ─────────────────────────────────────────────────────
async function saveBlob(blob) {
  const buf  = await blob.arrayBuffer();
  const dg   = await crypto.subtle.digest('SHA-1', buf);
  const hash = Array.from(new Uint8Array(dg)).map(b => b.toString(16).padStart(2,'0')).join('').slice(0,16);

  const r = await chrome.storage.local.get(['captures', 'lastHash']);
  if (r.lastHash === hash) { showToast('Já salva'); return; }

  const src = await new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload  = e => res(e.target.result);
    reader.onerror = rej;
    reader.readAsDataURL(blob);
  });

  const id      = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const entry   = { id, src, ts: new Date().toISOString() };
  const updated = [...(r.captures || []), entry].slice(-200);
  await chrome.storage.local.set({ captures: updated, lastHash: hash });
  captures = updated; // sem filtro — mostra tudo que foi salvo
  render();
  showToast(`Captura salva (${captures.length})`);
}

// ── Polling automático (roda enquanto popup está aberta) ──────────────────────
let pollLastHash = null;
let nativeActive = false; // desligado quando native host está ativo (evita dupla captura)

async function pollClipboard() {
  if (nativeActive) return;
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const t = item.types.find(t => t.startsWith('image/') && !t.includes('svg'));
      if (!t) continue;
      const blob = await item.getType(t);
      const buf  = await blob.arrayBuffer();
      const dg   = await crypto.subtle.digest('SHA-1', buf);
      const hash = Array.from(new Uint8Array(dg)).map(b => b.toString(16).padStart(2,'0')).join('').slice(0,16);
      if (hash === pollLastHash) break;
      pollLastHash = hash;
      await saveBlob(blob);
      break;
    }
  } catch {}
}

setInterval(pollClipboard, 800);

// ── Botão manual — feedback de erro explícito ─────────────────────────────────
document.getElementById('btnCapture').addEventListener('click', async () => {
  const btn = document.getElementById('btnCapture');
  btn.disabled = true;
  try {
    const items = await navigator.clipboard.read();
    let found = false;
    for (const item of items) {
      const t = item.types.find(t => t.startsWith('image/') && !t.includes('svg'));
      if (!t) continue;
      await saveBlob(await item.getType(t));
      found = true;
      break;
    }
    if (!found) showToast('Nenhuma imagem no clipboard');
  } catch (e) {
    showToast(e.name === 'NotAllowedError' ? 'Permissão negada' : (e.name || String(e)));
  }
  btn.disabled = false;
});

document.getElementById('version').textContent = 'v' + chrome.runtime.getManifest().version;

chrome.storage.local.get(['nativeStatus'], r => {
  const s = r.nativeStatus || '';
  nativeActive = s === 'ok';
  if (s === 'ok') setStatus(true, 'automático ativo');
  else if (s) setStatus(false, s.slice(0, 50));
  else setStatus(false, 'aguardando native host');
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.nativeStatus) {
    const s = changes.nativeStatus.newValue || '';
    nativeActive = s === 'ok';
    if (s === 'ok') setStatus(true, 'automático ativo');
    else setStatus(false, s.slice(0, 50));
  }
});

