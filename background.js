// service worker — native host + offscreen doc, recebe capturas, persiste no storage

const MAX_CAPTURES = 200;
const MAX_SRC_BYTES = 50_000_000;

// ── Native Messaging Host ─────────────────────────────────────────────────────
let nativePort = null;

function connectNative() {
  if (nativePort) return; // já conectado
  try {
    nativePort = chrome.runtime.connectNative('com.rapidex.clipboard');
    chrome.storage.local.set({ nativeStatus: 'ok' });

    nativePort.onMessage.addListener(msg => {
      if (msg.type === 'newCapture') handleCapture(msg);
    });

    nativePort.onDisconnect.addListener(() => {
      const err = chrome.runtime.lastError?.message || 'desconectado';
      nativePort = null;
      chrome.storage.local.set({ nativeStatus: 'erro: ' + err });
      // Agenda reconexão via alarm (setTimeout morre com o SW)
      chrome.alarms.create('nativeReconnect', { delayInMinutes: 0.2 });
    });
  } catch (e) {
    chrome.storage.local.set({ nativeStatus: 'erro: ' + (e?.message || 'não instalado') });
  }
}

// ── Validação ─────────────────────────────────────────────────────────────────
function isValidDataUrl(s) {
  return typeof s === 'string'
    && s.startsWith('data:image/')
    && !s.includes('svg')
    && s.length <= MAX_SRC_BYTES;
}

// ── Offscreen doc (fallback) ──────────────────────────────────────────────────
async function ensureOffscreen() {
  try {
    const has = await chrome.offscreen.hasDocument();
    if (!has) {
      await chrome.offscreen.createDocument({
        url: chrome.runtime.getURL('offscreen.html'),
        reasons: ['CLIPBOARD'],
        justification: 'Monitorar clipboard para capturas automáticas de tela'
      });
    }
  } catch {}
}

// ── Alarms ────────────────────────────────────────────────────────────────────
chrome.alarms.create('keepalive', { periodInMinutes: 0.4 });

chrome.alarms.onAlarm.addListener(name => {
  ensureOffscreen();
  // Reconecta native host se caiu (alarms sobrevivem ao SW dormindo)
  if (name === 'nativeReconnect' || !nativePort) connectNative();
});

// ── Startup ───────────────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async () => {
  const r = await chrome.storage.local.get(['captures']);
  if (!r.captures) await chrome.storage.local.set({ captures: [] });
  await ensureOffscreen();
  connectNative();
});

chrome.runtime.onStartup.addListener(() => {
  ensureOffscreen();
  connectNative();
});

// ── Captura ───────────────────────────────────────────────────────────────────
let lastHash = null;

function handleCapture(msg) {
  if (!isValidDataUrl(msg.dataUrl)) return;
  if (msg.hash === lastHash) return;
  lastHash = msg.hash;
  chrome.storage.local.get(['captures', 'lastNativeHash'], ({ captures = [], lastNativeHash: storedHash }) => {
    if (storedHash === msg.hash) return; // já salva na sessão anterior
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const updated = [...captures, { id, src: msg.dataUrl, ts: new Date().toISOString() }]
      .slice(-MAX_CAPTURES);
    chrome.storage.local.set({ captures: updated, lastNativeHash: msg.hash });
  });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'newCapture') {
    handleCapture(msg);
    sendResponse({ ok: true });
  }
});
