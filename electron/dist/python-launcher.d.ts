interface LauncherConfig {
    port: number;
    userDataPath: string;
    startupTimeout?: number;
    healthCheckInterval?: number;
    maxRestarts?: number;
    restartCooldown?: number;
}
interface LauncherEvents {
    onReady: () => void;
    onError: (message: string) => void;
    onExit: (code: number | null, signal: string | null) => void;
    onRestart: (attempt: number) => void;
}
/**
 * Python 后端进程管理器
 *
 * 功能：
 * - 启动/停止 Python 后端子进程
 * - 健康检查和自动重启
 * - 防止僵尸进程（内存泄漏防护）
 * - 优雅关闭
 */
export declare class PythonLauncher {
    private config;
    private events;
    private process;
    private isShuttingDown;
    private isReady;
    private restartCount;
    private healthCheckTimer;
    private startupTimer;
    private lastHealthCheck;
    private consecutiveFailures;
    constructor(config: LauncherConfig, events: LauncherEvents);
    /**
     * 启动 Python 后端
     */
    start(): Promise<void>;
    /**
     * 停止 Python 后端
     */
    stop(): Promise<void>;
    /**
     * 检查后端是否就绪
     */
    isBackendReady(): boolean;
    /**
     * 解析 exe 路径
     */
    private resolveExePath;
    /**
     * 设置进程事件处理器
     */
    private setupProcessHandlers;
    /**
     * 处理进程崩溃
     */
    private handleCrash;
    /**
     * 启动健康检查
     */
    private startHealthCheck;
    /**
     * 停止健康检查
     */
    private stopHealthCheck;
    /**
     * 健康检查
     */
    private checkHealth;
    /**
     * 启动超时检查
     */
    private startStartupTimeout;
    /**
     * 清除启动超时
     */
    private clearStartupTimeout;
    /**
     * 等待后端就绪
     */
    waitForReady(): Promise<void>;
}
export {};
//# sourceMappingURL=python-launcher.d.ts.map