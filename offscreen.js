// Roda em background (offscreen doc, reason CLIPBOARD).
// Não depende de foco — monitora clipboard mesmo com outra tela ativa.

let lastHash = null;

async function hashBlob(blob) {
  const buf    = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-1', buf);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

async function checkClipboard() {
  try {
    // Verifica permissão antes de tentar (detecta bloqueio precocemente)
    const perm = await navigator.permissions.query({ name: 'clipboard-read' });
    if (perm.state === 'denied') {
      chrome.runtime.sendMessage({ type: 'offscreenError', error: 'clipboard-read: denied' }).catch(() => {});
      return;
    }
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const imgType = item.types.find(t => t.startsWith('image/') && !t.includes('svg'));
      if (!imgType) continue;
      const blob = await item.getType(imgType);
      const hash = await hashBlob(blob);
      if (hash === lastHash) break;
      lastHash = hash;
      const reader = new FileReader();
      reader.onload = e => {
        chrome.runtime.sendMessage({ type: 'newCapture', dataUrl: e.target.result, hash })
          .catch(() => {
            // Service worker dormindo — acorda e reenvia
            setTimeout(() =>
              chrome.runtime.sendMessage({ type: 'newCapture', dataUrl: e.target.result, hash }).catch(() => {}),
            500);
          });
      };
      reader.readAsDataURL(blob);
      break;
    }
  } catch {}
}

setInterval(checkClipboard, 600);

// Checa imediatamente quando popup abre (sem esperar o próximo ciclo)
chrome.runtime.onMessage.addListener(msg => {
  if (msg.type === 'checkNow') checkClipboard();
});
