import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  shell,
  Tray,
} from "electron";
import * as path from "path";
import * as fs from "fs";
import { PythonLauncher } from "./python-launcher";

// GPU 硬件加速对 Three.js 3D 场景至关重要，不要禁用
// 如果个别机器有 GPU 兼容问题，可通过启动参数 --disable-gpu 临时关闭

// 单实例锁
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let pythonLauncher: PythonLauncher | null = null;
let isQuitting = false;

// 配置
const BACKEND_PORT = 4800;
const APP_URL = `http://127.0.0.1:${BACKEND_PORT}`;

/**
 * 创建主窗口
 */
function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
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
      shell.openExternal(url);
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
function createTray(): Tray {
  const icon = nativeImage.createFromPath(getIconPath());
  const trayIcon = new Tray(icon.resize({ width: 16, height: 16 }));

  const contextMenu = Menu.buildFromTemplate([
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
        app.quit();
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
function getIconPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "icon.ico");
  }
  return path.join(__dirname, "../build/icon.ico");
}

/**
 * 获取用户数据目录
 */
function getUserDataPath(): string {
  return app.getPath("userData");
}

/**
 * 启动 Python 后端
 */
async function startPythonBackend(): Promise<void> {
  const userDataPath = getUserDataPath();
  pythonLauncher = new PythonLauncher(
    {
      port: BACKEND_PORT,
      userDataPath,
    },
    {
      onReady: () => {
        console.log("[Main] Python backend ready");
        mainWindow?.webContents.send("backend-ready");
        // 加载应用页面
        if (mainWindow && !mainWindow.webContents.getURL().startsWith("http")) {
          mainWindow.loadURL(APP_URL);
        }
      },
      onError: (message: string) => {
        console.error("[Main] Python backend error:", message);
        mainWindow?.webContents.send("backend-error", message);
      },
      onExit: (code: number | null, signal: string | null) => {
        console.log(`[Main] Python backend exited: code=${code}, signal=${signal}`);
      },
      onRestart: (attempt: number) => {
        console.log(`[Main] Python backend restarting (attempt ${attempt})`);
        mainWindow?.webContents.send(
          "backend-error",
          `后端服务异常，正在重启 (${attempt})...`
        );
      },
    }
  );

  await pythonLauncher.start();
}

/**
 * 设置 IPC 处理器
 */
function setupIpcHandlers(): void {
  // 获取应用版本
  ipcMain.handle("get-version", () => {
    return app.getVersion();
  });

  // 退出应用
  ipcMain.on("app-quit", () => {
    isQuitting = true;
    app.quit();
  });

  // 重启应用
  ipcMain.on("app-restart", async () => {
    isQuitting = true;
    await pythonLauncher?.stop();
    app.relaunch();
    app.quit();
  });

  // 日志
  ipcMain.on("log", (_, { level, message }: { level: string; message: string }) => {
    const logPath = path.join(getUserDataPath(), "logs", "electron.log");
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;
    fs.appendFileSync(logPath, logLine, { encoding: "utf-8" });
  });
}

/**
 * 应用启动
 */
async function bootstrap(): Promise<void> {
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
  } catch (error) {
    console.error("[Main] Failed to start Python backend:", error);
    mainWindow?.webContents.send("backend-error", `后端服务启动失败: ${error}`);
  }
}

// 应用就绪
app.whenReady().then(bootstrap);

// 所有窗口关闭时（Windows/Linux）不退出，保持在托盘
app.on("window-all-closed", () => {
  // macOS 上保持运行
});

// 应用激活（macOS 点击 Dock 图标）
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    mainWindow = createMainWindow();
  } else {
    mainWindow?.show();
  }
});

// 应用退出前清理
app.on("before-quit", async () => {
  console.log("[Main] Application quitting...");
  isQuitting = true;
  if (pythonLauncher) {
    await pythonLauncher.stop();
  }
});

// 第二个实例启动时，聚焦现有窗口
app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.show();
    mainWindow.focus();
  }
});
