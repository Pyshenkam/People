@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

echo ============================================
echo   Electron Desktop App Build Script
echo ============================================

:: 1. 清理进程
echo.
echo [1/4] Cleaning processes...
powershell -ExecutionPolicy Bypass -File "%~dp0prebuild-clean.ps1"

:: 2. 生成时间戳
for /f %%i in ('powershell -Command "(Get-Date).ToString('yyyyMMdd-HHmmss')"') do set "BUILD_STAMP=%%i"
set "OUT_DIR=electron\release\build-%BUILD_STAMP%"
echo Build timestamp: %BUILD_STAMP%
echo Output directory: %OUT_DIR%

:: 3. 构建前端
echo.
echo [2/4] Building frontend...
cd /d "%~dp0..\frontend"
call npm run build
if errorlevel 1 (
    echo Frontend build failed!
    exit /b 1
)

:: 4. 构建后端
echo.
echo [3/4] Building backend...
cd /d "%~dp0..\backend"
call .venv\Scripts\python -m PyInstaller backend.spec --noconfirm
if errorlevel 1 (
    echo Backend build failed!
    exit /b 1
)

:: 5. 打包 Electron
echo.
echo [4/4] Building Electron app...
cd /d "%~dp0..\electron"

:: 更新构建脚本中的输出目录
powershell -Command "(Get-Content build-script.js) -replace 'dist-electron-\d+', 'release/build-%BUILD_STAMP%' | Set-Content build-script.js"

call node build-script.js
if errorlevel 1 (
    echo Electron build failed!
    exit /b 1
)

echo.
echo ============================================
echo   Build completed successfully!
echo   Output: %OUT_DIR%
echo ============================================
