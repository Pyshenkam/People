# 科技馆数字人讲解系统 - Electron 桌面应用构建指南

## 概述

本项目将 Python FastAPI 后端 + React 前端封装为 Electron 桌面应用，支持：

- ✅ 标准安装向导（用户可选择安装路径）
- ✅ 强制开机自启（系统级注册表，用户不可关闭）
- ✅ 自动卸载旧版本
- ✅ 系统托盘图标
- ✅ 进程守护（Python 崩溃自动重启）
- ✅ 内存泄漏防护

## 目录结构

```
question/
├── electron/                 # Electron 项目
│   ├── main.ts              # 主进程
│   ├── preload.ts           # 预加载脚本
│   ├── python-launcher.ts   # Python 进程管理
│   ├── package.json         # 依赖配置
│   ├── tsconfig.json        # TypeScript 配置
│   └── electron-builder.yml # 打包配置
├── backend/
│   └── backend.spec         # PyInstaller 配置
├── build/
│   ├── installer.nsh        # NSIS 自定义脚本
│   └── icon.ico             # 应用图标（需自行添加）
├── scripts/
│   ├── build-all.ps1        # 一键打包
│   ├── build-python.ps1     # 单独构建后端
│   └── build-frontend.ps1   # 单独构建前端
└── ELECTRON_BUILD.md        # 本文档
```

## 快速开始

### 一键打包

```powershell
# 完整构建
./scripts/build-all.ps1

# 跳过前端（前端已构建）
./scripts/build-all.ps1 -SkipFrontend

# 跳过后端（后端已构建）
./scripts/build-all.ps1 -SkipBackend
```

### 单独构建

```powershell
# 只构建前端
./scripts/build-frontend.ps1

# 只构建后端
./scripts/build-python.ps1
```

## 环境要求

| 依赖 | 版本 | 说明 |
|------|------|------|
| Node.js | 18+ | 前端构建 |
| Python | 3.10+ | 后端运行 |
| PyInstaller | 6.x | 后端打包 |

## 开发模式

```powershell
# 1. 安装 Electron 依赖
cd electron
npm install

# 2. 编译 TypeScript
npm run build

# 3. 启动后端（开发模式）
cd ../backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn app.main:app --port 4800

# 4. 启动前端开发服务器
cd ../frontend
npm install
npm run dev

# 5. 启动 Electron（连接开发服务器）
cd ../electron
npm run start
```

## 安装包功能

### 开机自启

安装时自动写入注册表：

```
HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Run
```

用户无法在任务管理器中关闭（系统级自启）。

### 卸载旧版本

安装前自动检测并卸载旧版本：

```nsis
ReadRegStr $0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "UninstallString"
ExecWait '"$0" /S'
```

### 数据持久化

用户数据存储在独立目录，升级不丢失：

```
%APPDATA%/science-museum-digital-human/
├── data/
│   └── museum.db          # 数据库
├── logs/
│   └── runtime.log        # 运行日志
└── config/
    └── upstream.json      # 上游配置
```

## 内存泄漏防护

### Python 后端

- 子进程随父进程退出（`detached: false`）
- 健康检查检测僵尸进程
- 进程崩溃自动重启

### Electron

- `before-quit` 事件清理资源
- WebSocket/定时器正确清理
- 托盘图标销毁

### 前端

- `useEffect` cleanup 清理资源
- AudioRuntime/WebSocket 正确关闭
- Three.js 纹理 dispose

## 自定义图标

将 256x256 的 ICO 文件放入：

```
build/icon.ico
```

## 故障排查

### 后端启动失败

1. 检查端口 4800 是否被占用
2. 查看日志：`%APPDATA%/science-museum-digital-human/logs/runtime.log`
3. 检查上游配置是否正确

### 安装包过大

- 后端 exe 包含所有 Python 依赖
- 可在 `backend.spec` 中排除不需要的模块

### 开机自启不生效

- 确保以管理员权限安装
- 检查注册表项是否存在

## 更新日志

### v1.0.0

- 初始版本
- Electron 桌面应用封装
- 强制开机自启
- 自动卸载旧版本
