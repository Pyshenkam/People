import { contextBridge, ipcRenderer } from "electron";

// 预加载脚本 - 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld("electronAPI", {
  // 平台信息
  platform: process.platform,

  // 应用版本
  getVersion: () => ipcRenderer.invoke("get-version"),

  // 应用控制
  quit: () => ipcRenderer.send("app-quit"),
  restart: () => ipcRenderer.send("app-restart"),

  // 后端状态
  onBackendReady: (callback: () => void) => {
    ipcRenderer.on("backend-ready", callback);
  },
  onBackendError: (callback: (message: string) => void) => {
    ipcRenderer.on("backend-error", (_, message) => callback(message));
  },

  // 日志
  log: (level: string, message: string) => {
    ipcRenderer.send("log", { level, message });
  },
});
