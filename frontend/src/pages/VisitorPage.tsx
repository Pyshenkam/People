import { Alert, Button, Spin } from "antd";
import { useEffect, useRef, useState } from "react";
import { AvatarStage } from "../components/AvatarStage";
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

const subtitleEligiblePhases = new Set<VisitorPhase>([
  "greeting",
  "listening",
  "user_speaking",
  "thinking",
  "speaking",
  "interrupted",
]);

export function VisitorPage() {
  const [configResponse, setConfigResponse] = useState<PublicConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [assistantFading, setAssistantFading] = useState(false);
  const [assistantHidden, setAssistantHidden] = useState(false);
  const fadeTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const lastReplyIdRef = useRef<string | null>(null);
  const {
    phase,
    statusText,
    assistantText,
    assistantReplyId,
    userText,
    error,
    assistantLevel,
    startConversation,
    endConversation,
  } = useRealtimeSession(configResponse?.config ?? null);

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
  const shouldShowUserSubtitle = Boolean(userText) && subtitleEligiblePhases.has(phase);

  // --- 字幕可见性逻辑（简化版）---
  // 当收到新的 replyId 或新文本时，立即显示字幕
  // 淡出只在 user_speaking 或 listening 超时后触发
  useEffect(() => {
    const clearTimers = () => {
      if (fadeTimerRef.current !== null) {
        window.clearTimeout(fadeTimerRef.current);
        fadeTimerRef.current = null;
      }
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };

    // 新的 replyId → 新一轮回复，重置
    if (assistantReplyId !== lastReplyIdRef.current) {
      lastReplyIdRef.current = assistantReplyId;
      setAssistantFading(false);
      setAssistantHidden(false);
      clearTimers();
    }

    // 没有文本 → 不需要淡出逻辑
    if (!assistantText) {
      clearTimers();
      return;
    }

    // 有新文本进来 → 重新显示（取消之前的淡出）
    setAssistantFading(false);
    setAssistantHidden(false);
    clearTimers();

    // user_speaking → 快速淡出旧字幕
    if (phase === "user_speaking") {
      fadeTimerRef.current = window.setTimeout(() => {
        setAssistantFading(true);
      }, 40);
      hideTimerRef.current = window.setTimeout(() => {
        setAssistantHidden(true);
      }, 220);
      return clearTimers;
    }

    // listening → 延迟淡出（TTS 结束后保留一段时间）
    if (phase === "listening") {
      fadeTimerRef.current = window.setTimeout(() => {
        setAssistantFading(true);
      }, 3200);
      hideTimerRef.current = window.setTimeout(() => {
        setAssistantHidden(true);
      }, 4600);
      return clearTimers;
    }

    return clearTimers;
  }, [assistantReplyId, assistantText, phase]);

  const shouldShowAssistantSubtitle =
    Boolean(assistantText) && !assistantHidden && subtitleEligiblePhases.has(phase);

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
        <div className="visitor-overlay">
          <div className="visitor-overlay__top">
            <div className={`status-pill status-pill--${phase}`}>
              <span className="status-dot" />
              {statusText}
            </div>
            {phase === "listening" || phase === "user_speaking" ? (
              <div className="listening-banner">正在听你说话</div>
            ) : null}
          </div>

          {error ? (
            <div className="visitor-overlay__error">
              <Alert type="error" showIcon message={error} />
            </div>
          ) : null}

          <div className="visitor-overlay__bottom">
            {(shouldShowUserSubtitle || shouldShowAssistantSubtitle) ? (
              <div className="subtitle-hud" aria-live="polite">
                {shouldShowUserSubtitle ? <div className="subtitle-hud__line subtitle-hud__line--user">{userText}</div> : null}
                {shouldShowAssistantSubtitle ? (
                  <div
                    className={`subtitle-hud__line subtitle-hud__line--assistant ${assistantFading ? "subtitle-hud__line--is-fading" : ""
                      }`}
                  >
                    {assistantText}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="control-row">
              {!isActive ? (
                <Button
                  type="primary"
                  size="large"
                  className="hero-button"
                  loading={phase === "opening_session"}
                  onClick={() => void startConversation()}
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
    </main>
  );
}
