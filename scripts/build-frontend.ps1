# 单独构建前端
# 使用方法: ./scripts/build-frontend.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path | Split-Path -Parent
$frontendDir = Join-Path $root "frontend"

Write-Host "构建前端..." -ForegroundColor Yellow

Push-Location $frontendDir
try {
    if (-not (Test-Path "node_modules")) {
        npm install
    }

    npm run build

    if (Test-Path "dist/index.html") {
        Write-Host "构建成功：$frontendDir/dist" -ForegroundColor Green
    } else {
        throw "构建失败：未找到 dist/index.html"
    }
}
finally {
    Pop-Location
}
