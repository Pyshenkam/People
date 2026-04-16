# ============================================
# Build Script for Digital Human System
# Usage: ./scripts/build-release.ps1
# ============================================

param(
    [switch]$SkipFrontend,
    [switch]$SkipBackend
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

# Use timestamp for output directory - NO FILE CONFLICTS!
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$outputDir = "$ProjectRoot\electron\release_$timestamp"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Digital Human System - Build Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Kill processes
Write-Host "[1/5] Killing processes..." -ForegroundColor Yellow
$processes = @("python", "backend", "electron", "node")
foreach ($proc in $processes) {
    Get-Process -Name $proc -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Seconds 1
Write-Host "      Done" -ForegroundColor Green

# 2. Create output directory (new folder each time)
Write-Host ""
Write-Host "[2/5] Creating output directory..." -ForegroundColor Yellow
Write-Host "      Output: release_$timestamp" -ForegroundColor Gray
Write-Host "      Done" -ForegroundColor Green

# 3. Build frontend
if (-not $SkipFrontend) {
    Write-Host ""
    Write-Host "[3/5] Building frontend..." -ForegroundColor Yellow
    Push-Location "$ProjectRoot\frontend"
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Frontend build failed!" -ForegroundColor Red
        Pop-Location
        exit 1
    }
    Pop-Location
    Write-Host "      Done" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "[3/5] Skipping frontend build" -ForegroundColor Gray
}

# 4. Build backend
if (-not $SkipBackend) {
    Write-Host ""
    Write-Host "[4/5] Building backend..." -ForegroundColor Yellow
    Push-Location "$ProjectRoot\backend"
    .venv\Scripts\python -m pip install -r requirements.txt
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Install backend requirements failed!" -ForegroundColor Red
        Pop-Location
        exit 1
    }
    .venv\Scripts\python -m pip install pyinstaller
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Install PyInstaller failed!" -ForegroundColor Red
        Pop-Location
        exit 1
    }
    .venv\Scripts\python -c "import pymysql"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "pymysql import check failed in build venv!" -ForegroundColor Red
        Pop-Location
        exit 1
    }
    .venv\Scripts\python -m PyInstaller backend.spec --noconfirm --clean
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Backend build failed!" -ForegroundColor Red
        Pop-Location
        exit 1
    }
    Pop-Location
    Write-Host "      Done" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "[4/5] Skipping backend build" -ForegroundColor Gray
}

# 5. Package Electron
Write-Host ""
Write-Host "[5/5] Packaging Electron..." -ForegroundColor Yellow
Push-Location "$ProjectRoot\electron"

# Set mirror for downloading binaries (fixes GitHub timeout in China)
$env:ELECTRON_BUILDER_BINARIES_MIRROR = "https://npmmirror.com/mirrors/electron-builder-binaries/"

# Compile TypeScript
npx tsc
if ($LASTEXITCODE -ne 0) {
    Write-Host "TypeScript compile failed!" -ForegroundColor Red
    Pop-Location
    exit 1
}

# Set output directory via environment variable
$env:BUILD_OUTPUT_DIR = $outputDir

# Package
node build-script.js
if ($LASTEXITCODE -ne 0) {
    Write-Host "Electron packaging failed!" -ForegroundColor Red
    Pop-Location
    exit 1
}

Pop-Location

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Build Complete!" -ForegroundColor Green
Write-Host "  Output: $outputDir" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green

# Show generated files
Get-ChildItem $outputDir -Filter "*.exe" -Recurse | ForEach-Object {
    Write-Host "  Installer: $($_.FullName)" -ForegroundColor White
}
