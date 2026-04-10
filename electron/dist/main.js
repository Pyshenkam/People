"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const python_launcher_1 = require("./python-launcher");
// 禁用硬件加速（某些 Windows 环境下更稳定）
electron_1.app.disableHardwareAcceleration();
// 单实例锁
const gotTheLock = electron_1.app.requestSingleInstanceLock();
if (!gotTheLock) {
    electron_1.app.quit();
    process.exit(0);
}
let mainWindow = null;
let tray = null;
let pythonLauncher = null;
let isQuitting = false;
// 配置
const BACKEND_PORT = 4800;
const APP_URL = `http://127.0.0.1:${BACKEND_PORT}`;
/**
 * 创建主窗口
 */
function createMainWindow() {
    const win = new electron_1.BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        show: false, // 先隐藏，加载完成后显示
        fullscreen: true, // 启动即全屏
        frame: false, // 无边框（全屏模式下隐藏标题栏）
        autoHideMenuBar: true,
        icon: getIconPath(),
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: true,
        },
    });
    // 窗口加载完成后显示
    win.once("ready-to-show", () => {
        win.show();
        win.setFullScreen(true);
    });
    // 禁止 ESC 退出全屏（保持全屏状态）
    win.on("leave-full-screen", () => {
        setTimeout(() => {
            if (!isQuitting && win && !win.isDestroyed()) {
                win.setFullScreen(true);
            }
        }, 100);
    });
    // 外部链接用默认浏览器打开
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith("http://") || url.startsWith("https://")) {
            electron_1.shell.openExternal(url);
        }
        return { action: "deny" };
    });
    // 关闭窗口时最小化到托盘（不退出）
    win.on("close", (event) => {
        if (!isQuitting) {
            event.preventDefault();
            win.hide();
        }
    });
    win.on("closed", () => {
        mainWindow = null;
    });
    return win;
}
/**
 * 创建系统托盘
 */
function createTray() {
    const icon = electron_1.nativeImage.createFromPath(getIconPath());
    const trayIcon = new electron_1.Tray(icon.resize({ width: 16, height: 16 }));
    const contextMenu = electron_1.Menu.buildFromTemplate([
        {
            label: "显示窗口",
            click: () => {
                mainWindow?.show();
                mainWindow?.focus();
            },
        },
        {
            label: "重启服务",
            click: async () => {
                if (pythonLauncher) {
                    await pythonLauncher.stop();
                    await pythonLauncher.start();
                }
            },
        },
        { type: "separator" },
        {
            label: "退出",
            click: () => {
                isQuitting = true;
                electron_1.app.quit();
            },
        },
    ]);
    trayIcon.setToolTip("科技馆数字人讲解系统");
    trayIcon.setContextMenu(contextMenu);
    // 双击托盘图标显示窗口
    trayIcon.on("double-click", () => {
        mainWindow?.show();
        mainWindow?.focus();
    });
    return trayIcon;
}
/**
 * 获取图标路径
 */
function getIconPath() {
    if (electron_1.app.isPackaged) {
        return path.join(process.resourcesPath, "icon.ico");
    }
    return path.join(__dirname, "../build/icon.ico");
}
/**
 * 获取用户数据目录
 */
function getUserDataPath() {
    return electron_1.app.getPath("userData");
}
/**
 * 启动 Python 后端
 */
async function startPythonBackend() {
    const userDataPath = getUserDataPath();
    pythonLauncher = new python_launcher_1.PythonLauncher({
        port: BACKEND_PORT,
        userDataPath,
    }, {
        onReady: () => {
            console.log("[Main] Python backend ready");
            mainWindow?.webContents.send("backend-ready");
            // 加载应用页面
            if (mainWindow && !mainWindow.webContents.getURL().startsWith("http")) {
                mainWindow.loadURL(APP_URL);
            }
        },
        onError: (message) => {
            console.error("[Main] Python backend error:", message);
            mainWindow?.webContents.send("backend-error", message);
        },
        onExit: (code, signal) => {
            console.log(`[Main] Python backend exited: code=${code}, signal=${signal}`);
        },
        onRestart: (attempt) => {
            console.log(`[Main] Python backend restarting (attempt ${attempt})`);
            mainWindow?.webContents.send("backend-error", `后端服务异常，正在重启 (${attempt})...`);
        },
    });
    await pythonLauncher.start();
}
/**
 * 设置 IPC 处理器
 */
function setupIpcHandlers() {
    // 获取应用版本
    electron_1.ipcMain.handle("get-version", () => {
        return electron_1.app.getVersion();
    });
    // 退出应用
    electron_1.ipcMain.on("app-quit", () => {
        isQuitting = true;
        electron_1.app.quit();
    });
    // 重启应用
    electron_1.ipcMain.on("app-restart", async () => {
        isQuitting = true;
        await pythonLauncher?.stop();
        electron_1.app.relaunch();
        electron_1.app.quit();
    });
    // 日志
    electron_1.ipcMain.on("log", (_, { level, message }) => {
        const logPath = path.join(getUserDataPath(), "logs", "electron.log");
        const timestamp = new Date().toISOString();
        const logLine = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;
        fs.appendFileSync(logPath, logLine, { encoding: "utf-8" });
    });
}
/**
 * 应用启动
 */
async function bootstrap() {
    console.log("[Main] Application starting...");
    // 创建窗口
    mainWindow = createMainWindow();
    // 创建托盘
    tray = createTray();
    // 设置 IPC
    setupIpcHandlers();
    // 启动 Python 后端
    try {
        await startPythonBackend();
    }
    catch (error) {
        console.error("[Main] Failed to start Python backend:", error);
        mainWindow?.webContents.send("backend-error", `后端服务启动失败: ${error}`);
    }
}
// 应用就绪
electron_1.app.whenReady().then(bootstrap);
// 所有窗口关闭时（Windows/Linux）不退出，保持在托盘
electron_1.app.on("window-all-closed", () => {
    // macOS 上保持运行
});
// 应用激活（macOS 点击 Dock 图标）
electron_1.app.on("activate", () => {
    if (electron_1.BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createMainWindow();
    }
    else {
        mainWindow?.show();
    }
});
// 应用退出前清理
electron_1.app.on("before-quit", async () => {
    console.log("[Main] Application quitting...");
    isQuitting = true;
    if (pythonLauncher) {
        await pythonLauncher.stop();
    }
});
// 第二个实例启动时，聚焦现有窗口
electron_1.app.on("second-instance", () => {
    if (mainWindow) {
        if (mainWindow.isMinimized()) {
            mainWindow.restore();
        }
        mainWindow.show();
        mainWindow.focus();
    }
});
//# sourceMappingURL=main.js.map