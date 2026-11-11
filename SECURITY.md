# Segurança — RapidEX

Este documento descreve as defesas implementadas contra os vetores de ataque mais comuns em extensões Chrome que lidam com dados externos (clipboard, storage, mensagens entre contextos).

---

## 1. Content Security Policy (CSP)

Declarada no `manifest.json`:

```
default-src 'self';
img-src 'self' data: blob:;
style-src 'self' 'unsafe-inline';
object-src 'none';
```

- Nenhum script externo pode ser carregado (CDNs, inline eval, etc.)
- `object-src 'none'` bloqueia Flash e plugins legados
- Imagens aceitas apenas como `data:` ou `blob:` — sem requests a servidores externos

---

## 2. Bloqueio de SVG

SVG é bloqueado em todos os pontos de entrada porque pode conter scripts embutidos (`<script>` dentro de SVG é válido e executável):

| Ponto | Código |
|-------|--------|
| Validação de captura (`background.js`) | `!s.includes('svg')` |
| Validação de storage (`popup.js`) | `!c.src.includes('svg')` |
| Leitura do clipboard (`popup.js`, `offscreen.js`) | `!t.includes('svg')` |

---

## 3. Validação de data URLs

Toda imagem recebida — seja do clipboard, do Native Host ou do `chrome.storage` — passa por `isValidDataUrl()` antes de ser processada ou persistida:

```js
// background.js
function isValidDataUrl(s) {
  return typeof s === 'string'
    && s.startsWith('data:image/')
    && !s.includes('svg')
    && s.length <= 50_000_000; // 50 MB por captura
}
```

E `isValidCapture()` no `popup.js` revalida os dados ao ler o storage, incluindo verificação do timestamp:

```js
function isValidCapture(c) {
  return c && typeof c.id === 'string'
    && typeof c.src === 'string'
    && c.src.startsWith('data:image/')
    && !c.src.includes('svg')
    && c.src.length <= 50_000_000
    && typeof c.ts === 'string' && !isNaN(Date.parse(c.ts));
}
```

---

## 4. Defesa contra XSS por storage tampering

Se um atacante conseguisse gravar dados maliciosos no `chrome.storage.local`, um `innerHTML` com esses dados executaria scripts. A extensão evita isso construindo todos os elementos do DOM programaticamente:

```js
// popup.js — render()
// DOM puro — sem innerHTML com dados do storage (evita XSS por storage tampering)
const img = document.createElement('img');
img.src = cap.src;   // data: URL — atributo src nunca executa script

const spanTime = document.createElement('span');
spanTime.textContent = fmtTime(cap.ts);  // textContent, nunca innerHTML
```

A única chamada a `innerHTML` limpa o grid antes de re-renderizar (`gridEl.innerHTML = ''`), sem injetar dados externos.

---

## 5. Limite de capturas e tamanho (DoS)

Para evitar que o `chrome.storage.local` seja saturado:

```js
// background.js
const MAX_CAPTURES = 200;    // máximo de cards
const MAX_SRC_BYTES = 50_000_000; // 50 MB por imagem

const updated = [...captures, entry].slice(-MAX_CAPTURES);
```

Uma imagem que ultrapasse 50 MB é rejeitada antes de ser escrita no storage.

---

## 6. Deduplicação por hash SHA-1

Capturas duplicadas (mesmo PrtScn enviado duas vezes) são descartadas via hash do blob antes de qualquer escrita no storage:

```js
// popup.js — saveBlob()
const dg   = await crypto.subtle.digest('SHA-1', buf);
const hash = Array.from(new Uint8Array(dg))
               .map(b => b.toString(16).padStart(2,'0')).join('').slice(0,16);
if (r.lastHash === hash) { showToast('Já salva'); return; }
```

O mesmo mecanismo existe no `background.js` (variável `lastHash`) para capturas vindas do Native Host.

---

## 7. Native Host — canal de comunicação

A comunicação com `rapidex_host.py` usa o protocolo **Native Messaging** do Chrome (stdin/stdout com prefixo de 4 bytes), que é:

- Isolado do processo do browser
- Restrito ao ID da extensão declarado em `com.rapidex.clipboard.json` (campo `allowed_origins`)
- Incapaz de expor sockets ou endpoints de rede

O Native Host só envia mensagens do tipo `newCapture`, que são validadas por `isValidDataUrl()` antes de qualquer persistência.

---

## Superfície de ataque restante

| Vetor | Status |
|-------|--------|
| XSS via storage | Mitigado (DOM programático + textContent) |
| SVG com script | Bloqueado em todos os pontos |
| Script externo | Bloqueado via CSP |
| Storage overflow | Limitado (200 capturas / 50 MB cada) |
| Duplicate replay | Mitigado via SHA-1 hash |
| Native Host malicioso | Mitigado por `allowed_origins` + validação de tipo |
| Clipboard injection (não-imagem) | Filtrado por `startsWith('data:image/')` |
| `eval` / dynamic code | Impossível pela CSP (`default-src 'self'`) |
