# 一键打包脚本 - 构建完整的 Electron 桌面应用安装包
# 使用方法: ./scripts/build-all.ps1 [-SkipFrontend] [-SkipBackend]

param(
    [switch]$SkipFrontend,
    [switch]$SkipBackend
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path | Split-Path -Parent
$frontendDir = Join-Path $root "frontend"
$backendDir = Join-Path $root "backend"
$electronDir = Join-Path $root "electron"
$buildDir = Join-Path $root "build"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " 科技馆数字人讲解系统 - 打包脚本" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查依赖
function Check-Dependencies {
    Write-Host "[1/6] 检查依赖..." -ForegroundColor Yellow

    # Node.js
    if (-not (Get-Command "node" -ErrorAction SilentlyContinue)) {
        throw "未安装 Node.js，请先安装 Node.js 18+"
    }

    # Python
    if (-not (Get-Command "python" -ErrorAction SilentlyContinue)) {
        throw "未安装 Python，请先安装 Python 3.10+"
    }

    # PyInstaller
    $pipList = python -m pip list --format=freeze 2>$null
    if ($pipList -notmatch "pyinstaller=") {
        Write-Host "  安装 PyInstaller..." -ForegroundColor Gray
        python -m pip install pyinstaller -q
    }

    Write-Host "  ✓ 依赖检查通过" -ForegroundColor Green
}

# 构建前端
function Build-Frontend {
    if ($SkipFrontend) {
        Write-Host "[2/6] 跳过前端构建" -ForegroundColor Gray
        return
    }

    Write-Host "[2/6] 构建前端..." -ForegroundColor Yellow

    Push-Location $frontendDir
    try {
        if (-not (Test-Path "node_modules")) {
            Write-Host "  安装前端依赖..." -ForegroundColor Gray
            npm install --loglevel=error
        }

        Write-Host "  执行 Vite 构建..." -ForegroundColor Gray
        npm run build

        if (-not (Test-Path "dist/index.html")) {
            throw "前端构建失败：未找到 dist/index.html"
        }

        Write-Host "  ✓ 前端构建完成" -ForegroundColor Green
    }
    finally {
        Pop-Location
    }
}

# 构建后端
function Build-Backend {
    if ($SkipBackend) {
        Write-Host "[3/6] 跳过后端构建" -ForegroundColor Gray
        return
    }

    Write-Host "[3/6] 构建后端..." -ForegroundColor Yellow

    # 确保虚拟环境存在
    $venvPython = Join-Path $backendDir ".venv/Scripts/python.exe"
    if (-not (Test-Path $venvPython)) {
        Write-Host "  创建虚拟环境..." -ForegroundColor Gray
        Push-Location $backendDir
        try {
            python -m venv .venv
        }
        finally {
            Pop-Location
        }
    }

    Push-Location $backendDir
    try {
        # 安装依赖
        Write-Host "  安装后端依赖..." -ForegroundColor Gray
        & $venvPython -m pip install -r requirements.txt -q

        # 执行 PyInstaller
        Write-Host "  执行 PyInstaller 打包..." -ForegroundColor Gray
        $specFile = Join-Path $backendDir "backend.spec"
        if (-not (Test-Path $specFile)) {
            throw "未找到 backend.spec，请确保文件存在"
        }

        & $venvPython -m PyInstaller $specFile --noconfirm --clean

        $outputExe = Join-Path $backendDir "dist/backend.exe"
        if (-not (Test-Path $outputExe)) {
            throw "后端构建失败：未找到 dist/backend.exe"
        }

        Write-Host "  ✓ 后端构建完成 ($outputExe)" -ForegroundColor Green
    }
    finally {
        Pop-Location
    }
}

# 构建 Electron
function Build-Electron {
    Write-Host "[4/6] 构建 Electron..." -ForegroundColor Yellow

    Push-Location $electronDir
    try {
        if (-not (Test-Path "node_modules")) {
            Write-Host "  安装 Electron 依赖..." -ForegroundColor Gray
            npm install --loglevel=error
        }

        Write-Host "  编译 TypeScript..." -ForegroundColor Gray
        npm run build

        Write-Host "  ✓ Electron 构建完成" -ForegroundColor Green
    }
    finally {
        Pop-Location
    }
}

# 准备资源
function Prepare-Resources {
    Write-Host "[5/6] 准备资源文件..." -ForegroundColor Yellow

    # 创建 build 目录
    if (-not (Test-Path $buildDir)) {
        New-Item -ItemType Directory -Path $buildDir -Force | Out-Null
    }

    # 检查图标
    $iconPath = Join-Path $buildDir "icon.ico"
    if (-not (Test-Path $iconPath)) {
        Write-Host "  ⚠ 未找到图标文件 build/icon.ico，将使用默认图标" -ForegroundColor Yellow
    }

    Write-Host "  ✓ 资源准备完成" -ForegroundColor Green
}

# 打包安装程序
function Build-Installer {
    Write-Host "[6/6] 打包安装程序..." -ForegroundColor Yellow

    Push-Location $electronDir
    try {
        Write-Host "  执行 electron-builder..." -ForegroundColor Gray
        npx electron-builder --win --x64

        $outputDir = Join-Path $electronDir "dist-electron"
        if (Test-Path $outputDir) {
            $installers = Get-ChildItem -Path $outputDir -Filter "*.exe"
            if ($installers.Count -gt 0) {
                Write-Host ""
                Write-Host "========================================" -ForegroundColor Green
                Write-Host " 构建成功！" -ForegroundColor Green
                Write-Host "========================================" -ForegroundColor Green
                Write-Host ""
                Write-Host "安装包位置：" -ForegroundColor Cyan
                foreach ($installer in $installers) {
                    Write-Host "  $($installer.FullName)" -ForegroundColor White
                }
                Write-Host ""
                Write-Host "安装包功能：" -ForegroundColor Cyan
                Write-Host "  ✓ 标准安装向导（可选安装路径）" -ForegroundColor White
                Write-Host "  ✓ 强制开机自启（HKLM 注册表）" -ForegroundColor White
                Write-Host "  ✓ 自动卸载旧版本" -ForegroundColor White
                Write-Host "  ✓ 桌面快捷方式" -ForegroundColor White
                Write-Host "  ✓ 开始菜单快捷方式" -ForegroundColor White
                Write-Host ""
            } else {
                throw "未找到生成的安装包"
            }
        } else {
            throw "electron-builder 执行失败"
        }
    }
    finally {
        Pop-Location
    }
}

# 主流程
try {
    Check-Dependencies
    Build-Frontend
    Build-Backend
    Build-Electron
    Prepare-Resources
    Build-Installer
}
catch {
    Write-Host ""
    Write-Host "构建失败：$($_.Exception.Message)" -ForegroundColor Red
    Write-Host $_.ScriptStackTrace -ForegroundColor Gray
    exit 1
}
