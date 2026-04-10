"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
// 预加载脚本 - 暴露安全的 API 给渲染进程
electron_1.contextBridge.exposeInMainWorld("electronAPI", {
    // 平台信息
    platform: process.platform,
    // 应用版本
    getVersion: () => electron_1.ipcRenderer.invoke("get-version"),
    // 应用控制
    quit: () => electron_1.ipcRenderer.send("app-quit"),
    restart: () => electron_1.ipcRenderer.send("app-restart"),
    // 后端状态
    onBackendReady: (callback) => {
        electron_1.ipcRenderer.on("backend-ready", callback);
    },
    onBackendError: (callback) => {
        electron_1.ipcRenderer.on("backend-error", (_, message) => callback(message));
    },
    // 日志
    log: (level, message) => {
        electron_1.ipcRenderer.send("log", { level, message });
    },
});
//# sourceMappingURL=preload.js.map