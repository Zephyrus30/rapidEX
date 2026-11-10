# RapidEX

Extensão Chrome para capturar screenshots automaticamente da área de transferência e organizá-las em cards. Ideal para coletar referências visuais enquanto navega — sem precisar interromper o fluxo.

![RapidEX v1.6](https://img.shields.io/badge/versão-1.6-5b8cf7) ![MV3](https://img.shields.io/badge/Manifest-v3-green) ![Windows](https://img.shields.io/badge/Windows-only_(native_host)-blue)

---

## Funcionalidades

- **Captura automática** — detecta imagens na área de transferência sem clicar em nada (requer Native Host)
- **Cards organizados** — grid com miniatura, data/hora e exclusão individual
- **Colunas ajustáveis** — slider de 2 a 6 colunas, salvo entre sessões
- **Lightbox com zoom** — scroll para zoom (até 8×), arrastar para mover, setas ← → para navegar
- **Download** — salvar card como JPG ou baixar todas as capturas em ZIP
- **Status em tempo real** — indica se o monitoramento automático está ativo
- **Aba independente** — pode ser aberta em tela separada e atualiza automaticamente

---

## Instalação

### 1 — Carregar a extensão no Chrome

1. Baixe ou clone este repositório
2. Abra `chrome://extensions`
3. Ative **Modo do desenvolvedor** (canto superior direito)
4. Clique em **Carregar sem compactação** e selecione a pasta `rapidex-extension`
5. Anote o **ID** exibido no card da extensão

### 2 — Instalar o Native Host (captura automática)

> Sem este passo a extensão funciona, mas exige clicar no ícone para capturar.

**Pré-requisito:** Python 3.8+ instalado e no PATH

```powershell
cd rapidex-extension
.\setup.ps1
```

O script vai:
- Instalar `Pillow` se necessário
- Pedir o ID da extensão (obtido no passo anterior)
- Gerar `com.rapidex.clipboard.json` com os caminhos corretos
- Registrar o host no Windows Registry

Após o setup, recarregue a extensão. O status deve mostrar **"automático ativo"**.

---

## Como usar

| Ação | Resultado |
|------|-----------|
| `PrtScn` / Snipping Tool | Imagem vai para o clipboard |
| Aguardar ~0.5s (com Native Host) | Card aparece automaticamente |
| Clicar no ícone da extensão | Captura manual (sem Native Host) |
| Scroll no lightbox | Zoom in/out |
| Arrastar no lightbox (zoomed) | Mover imagem |
| `←` `→` ou botões | Navegar entre capturas |
| `Esc` | Fechar lightbox |
| Slider de colunas | Redimensionar grid (2–6 colunas) |

---

## Como funciona

```
PrtScn
  └─ clipboard do Windows
       └─ rapidex_host.py (Python, via Native Messaging)
            └─ background.js (Service Worker)
                 └─ chrome.storage.local
                      └─ popup.js (onChanged) → card renderizado
```

Sem o Native Host, o `popup.js` lê o clipboard diretamente quando a popup está em foco.

---

## Estrutura

```
rapidex-extension/
├── manifest.json        # Configuração MV3
├── background.js        # Service Worker — Native Host + offscreen
├── offscreen.html/js    # Documento offscreen (fallback)
├── popup.html/js        # UI principal
├── rapidex_host.py      # Monitor de clipboard (Python)
├── rapidex_host.bat     # Wrapper para o host nativo
└── setup.ps1            # Script de instalação (Windows)
```

---

## Requisitos

- Chrome 116+
- Windows 10/11
- Python 3.8+ com Pillow (apenas para captura automática)

---

## Limitação conhecida

O Chrome não permite que extensões leiam o clipboard sem foco do documento. O Native Host contorna isso monitorando o clipboard via API do sistema operacional (PIL `ImageGrab`). Sem ele, a captura só ocorre quando a popup está aberta.
