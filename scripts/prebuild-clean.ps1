# 预构建清理脚本 - 杀掉所有相关进程
Write-Host "Cleaning up processes..." -ForegroundColor Yellow

$processes = @(
  "python",
  "backend",
  "electron",
  "科技馆数字人讲解系统"
)

foreach ($proc in $processes) {
  Get-Process -Name $proc -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}

Write-Host "Processes cleaned." -ForegroundColor Green
