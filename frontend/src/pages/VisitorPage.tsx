import { Alert, Button, Spin } from "antd";
import { useEffect, useMemo, useState } from "react";
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
  const [subtitleVisible, setSubtitleVisible] = useState(false);
  const [subtitleFading, setSubtitleFading] = useState(false);
  const { phase, statusText, assistantText, userText, error, assistantLevel, startConversation, endConversation } =
    useRealtimeSession(configResponse?.config ?? null);

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
  const hasSubtitleContent = Boolean(assistantText || userText);
  const shouldMountSubtitleHud = useMemo(
    () => hasSubtitleContent && subtitleEligiblePhases.has(phase),
    [hasSubtitleContent, phase],
  );

  useEffect(() => {
    if (!hasSubtitleContent || !subtitleEligiblePhases.has(phase)) {
      setSubtitleVisible(false);
      setSubtitleFading(false);
      return;
    }

    setSubtitleVisible(true);
    setSubtitleFading(false);

    if (phase !== "listening") {
      return;
    }

    const fadeTimer = window.setTimeout(() => {
      setSubtitleFading(true);
    }, 1200);
    const hideTimer = window.setTimeout(() => {
      setSubtitleVisible(false);
    }, 2600);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(hideTimer);
    };
  }, [assistantText, hasSubtitleContent, phase, userText]);

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
            {shouldMountSubtitleHud && subtitleVisible ? (
              <div className={`subtitle-hud ${subtitleFading ? "subtitle-hud--fading" : ""}`} aria-live="polite">
                {userText ? <div className="subtitle-hud__line subtitle-hud__line--user">{userText}</div> : null}
                {assistantText ? <div className="subtitle-hud__line subtitle-hud__line--assistant">{assistantText}</div> : null}
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
