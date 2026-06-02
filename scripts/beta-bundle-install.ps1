#Requires -Version 5.1
<#
.SYNOPSIS
  Install GhostCrab beta bundle (root + platform tarballs).

.DESCRIPTION
  Run from the unzipped beta folder (same directory as install-beta.mjs and the .tgz files):
    .\install-beta.ps1

  Wraps node install-beta.mjs with prerequisite checks and a manual fallback hint.
#>
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$BundleRoot = $PSScriptRoot
$InstallScript = Join-Path $BundleRoot "install-beta.mjs"
$ManifestPath = Join-Path $BundleRoot "pack-manifest.json"

function Get-WindowsPlatformKey {
    if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") {
        return "win32-arm64"
    }
    return "win32-x64"
}

function Write-ManualFallback {
    param(
        [string]$Version,
        [string]$PlatformKey
    )
    Write-Host ""
    Write-Host "Manual fallback (cmd.exe):" -ForegroundColor Yellow
    Write-Host "  cmd /c npm install .\mindflight-ghostcrab-personal-mcp-$Version.tgz"
    Write-Host "  cmd /c npm install .\mindflight-ghostcrab-personal-mcp-$PlatformKey-$Version.tgz --no-package-lock"
}

if (-not (Test-Path -LiteralPath $InstallScript)) {
    Write-Error "Missing install-beta.mjs in $BundleRoot"
    exit 1
}

if (-not (Test-Path -LiteralPath $ManifestPath)) {
    Write-Error "Missing pack-manifest.json in $BundleRoot"
    exit 1
}

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Error "Node.js not found on PATH. Install Node.js 20+ from https://nodejs.org/"
    exit 1
}

$versionLine = & node --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Error "Could not run node --version"
    exit 1
}
Write-Host "[install-beta.ps1] Node $versionLine"

$manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
$version = $manifest.root.version
if (-not $version) {
    Write-Error "Invalid pack-manifest.json: missing root.version"
    exit 1
}

$platformKey = Get-WindowsPlatformKey

Push-Location $BundleRoot
try {
    & node $InstallScript
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
        Write-ManualFallback -Version $version -PlatformKey $platformKey
        exit $exitCode
    }
    Write-Host "[install-beta.ps1] Done. Try: node .\node_modules\@mindflight\ghostcrab-personal-mcp\bin\gcp.mjs --help"
} finally {
    Pop-Location
}
