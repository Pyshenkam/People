import { Alert, Button, Spin } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AvatarStage } from "../components/AvatarStage";
import { SubtitleHud } from "../components/SubtitleHud";
import { useRealtimeSession } from "../hooks/useRealtimeSession";
import { fetchPublicConfig } from "../lib/api";
import type { PublicConfigResponse, VisitorPhase } from "../types/api";

const activePhases = new Set<VisitorPhase>([
  "opening_session",
  "greeting",
  "listening",
  "user_speaking",
  "thinking",
  "speaking",
  "interrupted",
  "closing_session",
]);

const ADMIN_TAP_COUNT = 10;
const ADMIN_TAP_WINDOW_MS = 3000;
const COUNTDOWN_SECONDS = 5;

export function VisitorPage() {
  const navigate = useNavigate();
  const [configResponse, setConfigResponse] = useState<PublicConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const {
    phase,
    statusText,
    assistantText,
    assistantReplyId,
    userText,
    error,
    assistantLevel,
    activeConfig,
    startConversation,
    endConversation,
  } = useRealtimeSession(configResponse?.config ?? null);

  // --- Hidden admin entry: 10 taps on panda head in idle ---
  const adminTapsRef = useRef<number[]>([]);
  const handleAdminTap = useCallback(() => {
    if (phase !== "idle") return;
    const now = Date.now();
    adminTapsRef.current = [...adminTapsRef.current.filter((t) => now - t < ADMIN_TAP_WINDOW_MS), now];
    if (adminTapsRef.current.length >= ADMIN_TAP_COUNT) {
      adminTapsRef.current = [];
      void navigate("/admin/login");
    }
  }, [phase, navigate]);

  // --- Screen inactivity timeout with countdown ---
  const [countdown, setCountdown] = useState<number | null>(null);
  const idleTimerRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null);

  const clearAllIdleTimers = useCallback(() => {
    if (idleTimerRef.current !== null) {
      window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    if (countdownTimerRef.current !== null) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setCountdown(null);
  }, []);

  const resetIdleTimer = useCallback(() => {
    clearAllIdleTimers();
    const timeoutSec = activeConfig?.idle_timeout_sec ?? 60;
    const autoEnd = activeConfig?.auto_end_mode ?? "screen_idle";
    if (autoEnd !== "screen_idle" || timeoutSec <= COUNTDOWN_SECONDS) return;

    idleTimerRef.current = window.setTimeout(() => {
      let remaining = COUNTDOWN_SECONDS;
      setCountdown(remaining);
      countdownTimerRef.current = window.setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          clearAllIdleTimers();
          void endConversation();
        } else {
          setCountdown(remaining);
        }
      }, 1000);
    }, (timeoutSec - COUNTDOWN_SECONDS) * 1000);
  }, [activeConfig, clearAllIdleTimers, endConversation]);

  const loadLatestConfig = async (): Promise<PublicConfigResponse> => {
    const result = await fetchPublicConfig();
    setConfigResponse(result);
    setLoadError(null);
    return result;
  };

  useEffect(() => {
    let cancelled = false;
    void fetchPublicConfig()
      .then((result) => {
        if (cancelled) {
          return;
        }
        setConfigResponse(result);
        setLoadError(null);
      })
      .catch((requestError) => {
        if (cancelled) {
          return;
        }
        setLoadError(requestError instanceof Error ? requestError.message : "加载配置失败。");
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const config = configResponse?.config ?? null;
  const isActive = activePhases.has(phase);

  // Start / stop idle timer based on session active state
  useEffect(() => {
    if (!isActive) {
      clearAllIdleTimers();
      return;
    }
    resetIdleTimer();
    const events = ["pointerdown", "pointermove", "keydown"] as const;
    const onInteraction = () => resetIdleTimer();
    for (const evt of events) {
      window.addEventListener(evt, onInteraction, { passive: true });
    }
    return () => {
      clearAllIdleTimers();
      for (const evt of events) {
        window.removeEventListener(evt, onInteraction);
      }
    };
  }, [isActive, resetIdleTimer, clearAllIdleTimers]);

  const handleStartConversation = async () => {
    try {
      const latest = await loadLatestConfig();
      await startConversation(latest.config);
    } catch (requestError) {
      setLoadError(requestError instanceof Error ? requestError.message : "加载配置失败。");
    }
  };

  if (loading) {
    return (
      <main className="visitor-screen visitor-screen--loading">
        <Spin size="large" />
        <p>正在加载数字人展台...</p>
      </main>
    );
  }

  if (loadError || !config) {
    return (
      <main className="visitor-screen visitor-screen--loading">
        <Alert
          type="error"
          message="加载失败"
          description={loadError ?? "无法加载展台配置。"}
          showIcon
        />
      </main>
    );
  }

  return (
    <main className="visitor-screen visitor-screen--immersive">
      <section className="visitor-stage-shell">
        <AvatarStage avatarUrl={config.avatar_url} level={assistantLevel} phase={phase} />
        {/* Hidden admin tap zone over panda head area */}
        <div
          className="admin-tap-zone"
          onClick={handleAdminTap}
        />
        <div className="visitor-overlay">
          <div className="visitor-overlay__top">
            {phase === "idle" ? (
              <div className="idle-title">
                <svg className="idle-title__svg" viewBox="0 0 600 200" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <path id="title-arc" d="M 60,180 Q 300,20 540,180" fill="none" />
                  </defs>
                  <text className="idle-title__text-shadow" dy="-8">
                    <textPath href="#title-arc" startOffset="50%" textAnchor="middle">熊猫猜年龄</textPath>
                  </text>
                  <text className="idle-title__text" dy="-8">
                    <textPath href="#title-arc" startOffset="50%" textAnchor="middle">熊猫猜年龄</textPath>
                  </text>
                </svg>
              </div>
            ) : (
              <>
                <div className={`status-pill status-pill--${phase}`}>
                  <span className="status-dot" />
                  {statusText}
                </div>
                {phase === "listening" || phase === "user_speaking" ? (
                  <div className="listening-banner">正在听你说话</div>
                ) : null}
              </>
            )}
          </div>

          {error ? (
            <div className="visitor-overlay__error">
              <Alert type="error" showIcon message={error} />
            </div>
          ) : null}

          <div className="visitor-overlay__bottom">
            <SubtitleHud
              phase={phase}
              assistantText={assistantText}
              assistantReplyId={assistantReplyId}
              userText={userText}
            />

            <div className="control-row">
              {!isActive ? (
                <Button
                  type="primary"
                  size="large"
                  className="hero-button"
                  loading={phase === "opening_session"}
                  onClick={() => void handleStartConversation()}
                >
                  开始对话
                </Button>
              ) : (
                <Button
                  danger
                  size="large"
                  className="hero-button hero-button--danger"
                  loading={phase === "closing_session"}
                  onClick={() => void endConversation()}
                >
                  结束对话
                </Button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Inactivity countdown overlay */}
      {countdown !== null ? (
        <div
          className="idle-countdown-overlay"
          onClick={() => resetIdleTimer()}
        >
          <div className="idle-countdown-overlay__content">
            <span className="idle-countdown-overlay__number">{countdown}</span>
            <p className="idle-countdown-overlay__text">即将自动退出，点击屏幕继续</p>
          </div>
        </div>
      ) : null}
    </main>
  );
}
