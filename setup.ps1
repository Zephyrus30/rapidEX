# Rapidex - Setup Native Messaging Host
# Execute UMA VEZ apos carregar a extensao no Chrome

param(
  [string]$ExtensionId = ""
)

$hostDir = $PSScriptRoot

# Verifica Python
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
  Write-Error "Python nao encontrado. Instale Python e adicione ao PATH."
  exit 1
}

# Verifica Pillow
$pillow = python -c "import PIL; print('ok')" 2>$null
if ($pillow -ne 'ok') {
  Write-Host "Instalando Pillow..."
  python -m pip install pillow
}

# Pede o ID da extensao se nao foi passado como argumento
if (-not $ExtensionId) {
  Write-Host ""
  Write-Host "1. Abra chrome://extensions no Chrome"
  Write-Host "2. Ative 'Modo do desenvolvedor' (canto superior direito)"
  Write-Host "3. Localize o card do Rapidex e copie o ID exibido abaixo do nome"
  Write-Host ""
  $ExtensionId = Read-Host "Cole o ID da extensao aqui"
}

if (-not $ExtensionId -or $ExtensionId.Length -lt 10) {
  Write-Error "ID invalido."
  exit 1
}

# Gera o manifesto do native host com os caminhos corretos desta maquina
$batPath = "$hostDir\rapidex_host.bat" -replace '\\', '\\'
$manifest = @"
{
  "name": "com.rapidex.clipboard",
  "description": "Rapidex clipboard monitor",
  "path": "$batPath",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$ExtensionId/"]
}
"@

$manifestPath = "$hostDir\com.rapidex.clipboard.json"
$manifest | Out-File -FilePath $manifestPath -Encoding utf8 -NoNewline

# Registra no Chrome
$regPath = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.rapidex.clipboard"
New-Item -Path $regPath -Force | Out-Null
Set-ItemProperty -Path $regPath -Name "(Default)" -Value $manifestPath

Write-Host ""
Write-Host "Pronto! Recarregue a extensao em chrome://extensions."
Write-Host "O status devera mostrar 'automatico ativo'."
Write-Host ""
Write-Host "Manifesto gerado em: $manifestPath"
