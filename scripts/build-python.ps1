# 单独构建 Python 后端
# 使用方法: ./scripts/build-python.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path | Split-Path -Parent
$backendDir = Join-Path $root "backend"

Write-Host "构建 Python 后端..." -ForegroundColor Yellow

# 确保虚拟环境存在
$venvPython = Join-Path $backendDir ".venv/Scripts/python.exe"
if (-not (Test-Path $venvPython)) {
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
    & $venvPython -m pip install -r requirements.txt -q

    # 安装 PyInstaller
    & $venvPython -m pip install pyinstaller -q

    # 执行打包
    & $venvPython -m PyInstaller backend.spec --noconfirm --clean

    $outputExe = Join-Path $backendDir "dist/backend.exe"
    if (Test-Path $outputExe) {
        Write-Host "构建成功：$outputExe" -ForegroundColor Green
    } else {
        throw "构建失败：未找到输出文件"
    }
}
finally {
    Pop-Location
}
