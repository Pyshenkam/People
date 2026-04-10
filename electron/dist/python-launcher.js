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
exports.PythonLauncher = void 0;
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const http = __importStar(require("http"));
const electron_1 = require("electron");
const DEFAULT_CONFIG = {
    port: 4800,
    startupTimeout: 30000,
    healthCheckInterval: 5000,
    maxRestarts: 3,
    restartCooldown: 5000,
};
/**
 * Python 后端进程管理器
 *
 * 功能：
 * - 启动/停止 Python 后端子进程
 * - 健康检查和自动重启
 * - 防止僵尸进程（内存泄漏防护）
 * - 优雅关闭
 */
class PythonLauncher {
    constructor(config, events) {
        this.process = null;
        this.isShuttingDown = false;
        this.isReady = false;
        this.restartCount = 0;
        this.healthCheckTimer = null;
        this.startupTimer = null;
        this.lastHealthCheck = 0;
        this.consecutiveFailures = 0;
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.events = events;
    }
    /**
     * 启动 Python 后端
     */
    async start() {
        if (this.process) {
            console.log("[PythonLauncher] Process already running");
            return;
        }
        this.isShuttingDown = false;
        this.isReady = false;
        const exePath = this.resolveExePath();
        if (!fs.existsSync(exePath)) {
            throw new Error(`Python backend not found: ${exePath}`);
        }
        console.log("[PythonLauncher] Starting Python backend:", exePath);
        // 设置环境变量
        const env = {
            ...process.env,
            // 用户数据目录
            MUSEUM_DATA_DIR: path.join(this.config.userDataPath, "data"),
            // 日志目录
            MUSEUM_LOG_DIR: path.join(this.config.userDataPath, "logs"),
            // 端口
            MUSEUM_PORT: String(this.config.port),
        };
        // 确保用户数据目录存在
        const dataDir = path.join(this.config.userDataPath, "data");
        const logDir = path.join(this.config.userDataPath, "logs");
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        // 启动子进程
        this.process = (0, child_process_1.spawn)(exePath, [], {
            env,
            stdio: ["ignore", "pipe", "pipe"],
            detached: false, // 确保子进程随父进程退出
            windowsHide: true, // Windows 下隐藏控制台窗口
        });
        this.setupProcessHandlers();
        this.startHealthCheck();
        this.startStartupTimeout();
        // 等待后端就绪
        await this.waitForReady();
    }
    /**
     * 停止 Python 后端
     */
    async stop() {
        if (!this.process) {
            return;
        }
        console.log("[PythonLauncher] Stopping Python backend");
        this.isShuttingDown = true;
        this.stopHealthCheck();
        this.clearStartupTimeout();
        const proc = this.process;
        this.process = null;
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                console.log("[PythonLauncher] Force killing process");
                proc.kill("SIGKILL");
            }, 5000);
            proc.on("exit", () => {
                clearTimeout(timeout);
                resolve();
            });
            // 先尝试优雅关闭
            proc.kill("SIGTERM");
        });
    }
    /**
     * 检查后端是否就绪
     */
    isBackendReady() {
        return this.isReady;
    }
    /**
     * 解析 exe 路径
     */
    resolveExePath() {
        // 开发模式：使用 Python 解释器
        if (electron_1.app.isPackaged === false) {
            const backendDir = path.resolve(__dirname, "../../backend");
            return path.join(backendDir, ".venv/Scripts/python.exe");
        }
        // 生产模式：使用打包的 exe
        const resourcesPath = process.resourcesPath;
        return path.join(resourcesPath, "backend.exe");
    }
    /**
     * 设置进程事件处理器
     */
    setupProcessHandlers() {
        if (!this.process)
            return;
        // 标准输出
        this.process.stdout?.on("data", (data) => {
            const output = data.toString().trim();
            if (output) {
                console.log("[Python stdout]", output);
            }
        });
        // 标准错误
        this.process.stderr?.on("data", (data) => {
            const output = data.toString().trim();
            if (output) {
                console.error("[Python stderr]", output);
            }
        });
        // 进程退出
        this.process.on("exit", (code, signal) => {
            console.log(`[PythonLauncher] Process exited: code=${code}, signal=${signal}`);
            this.process = null;
            this.isReady = false;
            this.events.onExit(code, signal);
            // 非正常退出且未在关闭中，尝试重启
            if (!this.isShuttingDown && code !== 0) {
                this.handleCrash();
            }
        });
        // 进程错误
        this.process.on("error", (error) => {
            console.error("[PythonLauncher] Process error:", error);
            this.events.onError(`Process error: ${error.message}`);
        });
    }
    /**
     * 处理进程崩溃
     */
    handleCrash() {
        if (this.isShuttingDown)
            return;
        this.restartCount++;
        console.log(`[PythonLauncher] Crash detected, restart attempt ${this.restartCount}/${this.config.maxRestarts}`);
        if (this.restartCount > this.config.maxRestarts) {
            console.error("[PythonLauncher] Max restarts exceeded");
            this.events.onError("后端服务多次重启失败，请检查日志或重启应用。");
            return;
        }
        this.events.onRestart(this.restartCount);
        // 冷却后重启
        setTimeout(() => {
            if (!this.isShuttingDown) {
                this.start().catch((error) => {
                    console.error("[PythonLauncher] Restart failed:", error);
                });
            }
        }, this.config.restartCooldown);
    }
    /**
     * 启动健康检查
     */
    startHealthCheck() {
        this.healthCheckTimer = setInterval(() => {
            this.checkHealth();
        }, this.config.healthCheckInterval);
    }
    /**
     * 停止健康检查
     */
    stopHealthCheck() {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = null;
        }
    }
    /**
     * 健康检查
     */
    checkHealth() {
        if (!this.process || this.isShuttingDown)
            return;
        const now = Date.now();
        if (now - this.lastHealthCheck < this.config.healthCheckInterval / 2) {
            return;
        }
        this.lastHealthCheck = now;
        const url = `http://127.0.0.1:${this.config.port}/api/health`;
        const req = http.get(url, { timeout: 3000 }, (res) => {
            if (res.statusCode === 200) {
                this.consecutiveFailures = 0;
                if (!this.isReady) {
                    this.isReady = true;
                    this.clearStartupTimeout();
                    this.events.onReady();
                    console.log("[PythonLauncher] Backend is ready");
                }
            }
            res.resume();
        });
        req.on("error", (error) => {
            this.consecutiveFailures++;
            console.log(`[PythonLauncher] Health check failed (${this.consecutiveFailures}):`, error.message);
            // 连续多次失败，可能进程已死
            if (this.consecutiveFailures >= 3 && this.process) {
                console.error("[PythonLauncher] Backend unresponsive, killing process");
                this.process.kill("SIGKILL");
            }
        });
        req.on("timeout", () => {
            req.destroy();
            this.consecutiveFailures++;
        });
    }
    /**
     * 启动超时检查
     */
    startStartupTimeout() {
        this.startupTimer = setTimeout(() => {
            if (!this.isReady) {
                console.error("[PythonLauncher] Startup timeout");
                this.events.onError("后端服务启动超时，请检查配置或重启应用。");
                this.stop();
            }
        }, this.config.startupTimeout);
    }
    /**
     * 清除启动超时
     */
    clearStartupTimeout() {
        if (this.startupTimer) {
            clearTimeout(this.startupTimer);
            this.startupTimer = null;
        }
    }
    /**
     * 等待后端就绪
     */
    async waitForReady() {
        return new Promise((resolve, reject) => {
            const check = () => {
                if (this.isReady) {
                    resolve();
                }
                else if (this.isShuttingDown) {
                    reject(new Error("Backend shutdown"));
                }
                else {
                    setTimeout(check, 100);
                }
            };
            check();
        });
    }
}
exports.PythonLauncher = PythonLauncher;
//# sourceMappingURL=python-launcher.js.map