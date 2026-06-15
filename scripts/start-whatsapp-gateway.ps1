param(
  [string]$AppDir
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($AppDir)) {
  $AppDir = Split-Path -Parent $PSScriptRoot
}

$AppDir = [IO.Path]::GetFullPath($AppDir)
$gatewayDir = Join-Path $AppDir 'whatsapp-gateway\whatsapp-gateway'
$rootEnvPath = Join-Path $AppDir '.env'
$gatewayEnvPath = Join-Path $gatewayDir '.env'
$logDir = Join-Path $AppDir '.logs'
$script:logFile = Join-Path $logDir 'gateway-window.log'
$script:logAvailable = $false
$script:sessionDumpDepth = 0
$script:decryptWarningShown = $false
$redacted = '[REDACTED]'

function Get-EnvValue {
  param([string]$Path, [string]$Name)

  if (-not (Test-Path -LiteralPath $Path)) {
    return $null
  }

  foreach ($line in [IO.File]::ReadLines($Path)) {
    if ($line -match "^\s*$([regex]::Escape($Name))\s*=(.*)$") {
      return $Matches[1].Trim().Trim('"').Trim("'")
    }
  }

  return $null
}

$sensitiveNames = @(
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'WEBHOOK_SECRET',
  'GATEWAY_SECRET',
  'JWT_SECRET',
  'REFRESH_TOKEN_SECRET',
  'GROQ_API_KEY',
  'WHATSAPP_ACCESS_TOKEN',
  'DATABASE_URL',
  'DIRECT_DATABASE_URL',
  'META_APP_SECRET',
  'EVOLUTION_API_KEY',
  'DEV_ACCOUNT_PASSWORD'
)

$knownSecrets = @(
  foreach ($name in $sensitiveNames) {
    $value = Get-EnvValue -Path $rootEnvPath -Name $name
    if ($value -and $value.Length -ge 6) {
      $value
    }
  }
)

function Protect-LogLine {
  param([AllowEmptyString()][string]$Line)

  $safe = $Line
  foreach ($secret in $knownSecrets) {
    $safe = $safe -replace [regex]::Escape($secret), $redacted
  }

  $patterns = @(
    'Bearer\s+[A-Za-z0-9._~+/=-]+',
    '\b(?:gsk|whsec|sk_(?:live|test)|rk_(?:live|test))_[A-Za-z0-9_-]+\b',
    '\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b',
    'postgres(?:ql)?:\/\/[^\s"''`]+',
    '<Buffer\s+[^>]+>',
    '(?i)\b(?:privKey|pubKey|rootKey|baseKey|remoteIdentityKey|lastRemoteEphemeralKey|chainKey|messageKeys)\b\s*:\s*[^,}]+',
    '(?i)"?(?:remoteJid|participant|phoneNumber|tenantId|messageId|registrationId)"?\s*:\s*(?:"[^"]*"|''[^'']*''|[^,\s}]+)',
    '(?i)\b(?:STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|WEBHOOK_SECRET|GATEWAY_SECRET|JWT_SECRET|REFRESH_TOKEN_SECRET|GROQ_API_KEY|WHATSAPP_ACCESS_TOKEN|DATABASE_URL|DIRECT_DATABASE_URL|META_APP_SECRET|EVOLUTION_API_KEY|DEV_ACCOUNT_PASSWORD)\b\s*[:=]\s*[^\s,;]+'
  )

  foreach ($pattern in $patterns) {
    $safe = $safe -replace $pattern, $redacted
  }

  return $safe
}

function Write-SafeLine {
  param([AllowEmptyString()][string]$Line)

  if ($Line -match '(?i)failed to decrypt message|Failed to decrypt message with any known session') {
    if (-not $script:decryptWarningShown) {
      $script:decryptWarningShown = $true
      Write-SafeLine -Line 'Aviso: uma mensagem antiga nao pode ser decifrada. O Gateway continuara funcionando.'
    }
    return
  }

  if ($Line -match '(?i)^Closing open session|^Closing session:') {
    return
  }

  if ($Line -match '^\s+(?:at|at async)\s+' -or
      $Line -match '(?i)^\s*(?:_chains|currentRatchet|ephemeralKeyPair|indexInfo|registrationId|previousCounter|baseKeyType|closed|used|created)\s*:' -or
      $Line -match '^\s*[''"]?[A-Za-z0-9+/=]{24,}[''"]?\s*:\s*\{' -or
      $Line -match '^\s*[{}]},?\s*$') {
    return
  }

  if ($script:sessionDumpDepth -gt 0) {
    $script:sessionDumpDepth += [regex]::Matches($Line, '\{').Count
    $script:sessionDumpDepth -= [regex]::Matches($Line, '\}').Count
    if ($script:sessionDumpDepth -le 0) {
      $script:sessionDumpDepth = 0
    }
    return
  }

  if ($Line -match 'SessionEntry\s*\{') {
    $script:sessionDumpDepth = [Math]::Max(
      1,
      [regex]::Matches($Line, '\{').Count - [regex]::Matches($Line, '\}').Count
    )
    $Line = '[REDACTED_SESSION_DUMP]'
  }

  $safe = Protect-LogLine -Line $Line
  Write-Host $safe
  if ($script:logAvailable) {
    try {
      [IO.File]::AppendAllText($script:logFile, "$safe`r`n", [Text.UTF8Encoding]::new($false))
    } catch {
      $script:logAvailable = $false
      Write-Host 'Log sanitizado indisponivel. A execucao continuara sem gravar logs.'
    }
  }
}

function Initialize-SafeLog {
  New-Item -ItemType Directory -Path $logDir -Force | Out-Null

  try {
    [IO.File]::WriteAllText($script:logFile, '', [Text.UTF8Encoding]::new($false))
    $script:logAvailable = $true
  } catch {
    $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $script:logFile = Join-Path $logDir "gateway-window-sanitized-$timestamp.log"
    [IO.File]::WriteAllText($script:logFile, '', [Text.UTF8Encoding]::new($false))
    $script:logAvailable = $true
    Write-Host 'O log principal esta ocupado. Um novo log sanitizado foi criado.'
  }
}

function Invoke-SanitizedCommand {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Command,
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments
  )

  # Merge stderr inside cmd.exe before PowerShell receives it. Windows
  # PowerShell otherwise turns harmless native stderr into NativeCommandError.
  $commandLine = (@($Command) + $Arguments) -join ' '
  & cmd.exe /d /s /c "$commandLine 2>&1" | ForEach-Object {
    Write-SafeLine -Line ([string]$_)
  }

  return $LASTEXITCODE
}

Write-Host ''
Write-Host 'Ligando WhatsApp Gateway...'
Write-Host ''

$gatewayListener = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue
if ($gatewayListener) {
  Write-Host 'O WhatsApp Gateway ja esta em execucao.'
  Write-Host 'Use a janela que ja esta aberta.'
  exit 0
}

Initialize-SafeLog

if (-not (Test-Path -LiteralPath (Join-Path $gatewayDir 'package.json'))) {
  Write-SafeLine 'Projeto do gateway: Variavel ausente'
  exit 1
}

Write-SafeLine 'Projeto do gateway: Variavel encontrada'
$gatewaySecret = Get-EnvValue -Path $rootEnvPath -Name 'GATEWAY_SECRET'

if (-not $gatewaySecret) {
  Write-SafeLine 'GATEWAY_SECRET: Variavel ausente'
  Write-SafeLine 'O gateway nao sera iniciado sem um segredo configurado.'
  exit 1
}

Write-SafeLine 'GATEWAY_SECRET: Variavel encontrada'

$gatewayEnv = @(
  'PORT=3001'
  "GATEWAY_SECRET=$gatewaySecret"
  'CRM_WEBHOOK_URL=http://localhost:3334/webhooks/whatsapp'
  'SESSIONS_DIR=./sessions'
  'LOG_LEVEL=warn'
) -join "`r`n"

[IO.File]::WriteAllText($gatewayEnvPath, "$gatewayEnv`r`n", [Text.UTF8Encoding]::new($false))
$gatewaySecret = $null

Push-Location $gatewayDir
try {
  if (-not (Test-Path -LiteralPath (Join-Path $gatewayDir 'node_modules\@whiskeysockets\baileys\package.json'))) {
    Write-SafeLine 'Dependencias do gateway: Variavel ausente'
    $installExit = Invoke-SanitizedCommand -Command 'npm.cmd' -Arguments @('install')
    if ($installExit -ne 0) {
      exit $installExit
    }
  } else {
    Write-SafeLine 'Dependencias do gateway: Variavel encontrada'
  }

  Write-SafeLine 'Gateway pronto em http://localhost:3001/health'
  Write-SafeLine 'Deixe esta janela aberta enquanto usa o WhatsApp no Syntra Food.'
  $nodeExit = Invoke-SanitizedCommand -Command 'node.exe' -Arguments @('--import', 'tsx', 'src/index.ts')
  exit $nodeExit
} finally {
  Pop-Location
}
