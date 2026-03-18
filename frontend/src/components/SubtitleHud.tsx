import { memo, useEffect, useRef, useState } from "react";
import type { VisitorPhase } from "../types/api";

const subtitleEligiblePhases = new Set<VisitorPhase>([
  "greeting",
  "listening",
  "user_speaking",
  "thinking",
  "speaking",
  "interrupted",
]);

interface SubtitleHudProps {
  phase: VisitorPhase;
  assistantText: string;
  assistantReplyId: string | null;
  userText: string;
}

export const SubtitleHud = memo(function SubtitleHud({
  phase,
  assistantText,
  assistantReplyId,
  userText,
}: SubtitleHudProps) {
  const [assistantFading, setAssistantFading] = useState(false);
  const [assistantHidden, setAssistantHidden] = useState(false);
  const fadeTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const lastReplyIdRef = useRef<string | null>(null);

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

    if (assistantReplyId !== lastReplyIdRef.current) {
      lastReplyIdRef.current = assistantReplyId;
      setAssistantFading(false);
      setAssistantHidden(false);
      clearTimers();
    }

    if (!assistantText) {
      setAssistantFading(false);
      setAssistantHidden(false);
      clearTimers();
      return clearTimers;
    }

    setAssistantFading(false);
    setAssistantHidden(false);
    clearTimers();

    if (phase === "user_speaking") {
      fadeTimerRef.current = window.setTimeout(() => {
        setAssistantFading(true);
      }, 40);
      hideTimerRef.current = window.setTimeout(() => {
        setAssistantHidden(true);
      }, 220);
      return clearTimers;
    }

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

  const shouldShowUserSubtitle = Boolean(userText) && subtitleEligiblePhases.has(phase);
  const shouldShowAssistantSubtitle =
    Boolean(assistantText) && !assistantHidden && subtitleEligiblePhases.has(phase);

  if (!shouldShowUserSubtitle && !shouldShowAssistantSubtitle) {
    return null;
  }

  return (
    <div className="subtitle-hud" aria-live="polite">
      {shouldShowUserSubtitle ? (
        <div className="subtitle-hud__line subtitle-hud__line--user">{userText}</div>
      ) : null}
      {shouldShowAssistantSubtitle ? (
        <div
          className={`subtitle-hud__line subtitle-hud__line--assistant ${
            assistantFading ? "subtitle-hud__line--is-fading" : ""
          }`}
        >
          {assistantText}
        </div>
      ) : null}
    </div>
  );
});
