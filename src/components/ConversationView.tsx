import { useState, useEffect, useRef } from "react";
import { useConversation } from "@elevenlabs/react";
import {
  describeException,
  failureCopyFromApiError,
  type FailureCopy,
} from "@/lib/failureCopy";
import * as poduApi from "@/lib/poduApi";
import { PlayButton } from "./PlayButton";
import type { ConversationMode } from "./ModeSelector";
import { X, Volume2, VolumeX, Mic, MicOff, AlertCircle } from "lucide-react";

interface ConversationViewProps {
  mode: ConversationMode;
  agentId: string;
  systemPrompt: string;
  firstMessage: string;
  subjectCount: number;
  onClose: () => void;
}
const modeNames = { fun: "FUN", edu: "EDU", deep: "DEEP" };

export function ConversationView({
  mode,
  agentId,
  systemPrompt,
  firstMessage,
  subjectCount,
  onClose,
}: ConversationViewProps) {
  const [isMuted, setIsMuted] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [pending, setPending] = useState(false);
  const [startFailure, setStartFailure] = useState<FailureCopy | null>(null);
  const [transcript, setTranscript] = useState<
    { source: string; text: string }[]
  >([]);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(false);
  const starting = useRef(false);
  const conversationRef = useRef<ReturnType<typeof useConversation> | null>(
    null,
  );

  const conversation = useConversation({
    micMuted,
    volume: isMuted ? 0 : 1,
    onConnect: () => {
      if (mounted.current) setStartFailure(null);
    },
    onMessage: ({ message, source }) => {
      if (mounted.current)
        setTranscript((previous) => [...previous, { source, text: message }]);
    },
    onError: (error: unknown) => {
      if (mounted.current)
        setStartFailure(describeException(error, "conversation"));
    },
  });
  conversationRef.current = conversation;
  const { status, isSpeaking } = conversation;

  useEffect(() => {
    mounted.current = true;
    headingRef.current?.focus();
    return () => {
      mounted.current = false;
      void conversationRef.current?.endSession().catch(() => {});
    };
  }, []);

  const startConversation = async () => {
    if (starting.current || status === "connecting") return;
    starting.current = true;
    setPending(true);
    setStartFailure(null);
    try {
      // This permission-check stream is separate from the SDK's own stream.
      // Release it immediately, including when the user leaves while granting access.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      if (!mounted.current) return;
      const tokenResult = await poduApi.getConversationToken(agentId);
      if (!mounted.current) return;
      if (!tokenResult.ok) {
        setStartFailure(
          failureCopyFromApiError(tokenResult.error, "conversation", { mode }),
        );
        return;
      }
      await conversation.startSession({
        conversationToken: tokenResult.data.token,
        connectionType: "webrtc",
        overrides: {
          agent: { prompt: { prompt: systemPrompt }, firstMessage },
        },
      });
      if (!mounted.current) await conversation.endSession();
    } catch (error) {
      if (mounted.current)
        setStartFailure(describeException(error, "conversation"));
    } finally {
      starting.current = false;
      if (mounted.current) setPending(false);
    }
  };

  const toggleConversation = async () => {
    if (status !== "connected") {
      await startConversation();
      return;
    }
    setPending(true);
    try {
      await conversation.endSession();
    } catch (error) {
      setStartFailure(describeException(error, "conversation"));
    } finally {
      if (mounted.current) setPending(false);
    }
  };
  const connecting = pending || status === "connecting";
  const statusText =
    status === "connected"
      ? isSpeaking
        ? "Host is speaking..."
        : micMuted
          ? "Microphone muted"
          : "Listening..."
      : connecting
        ? "Connecting..."
        : "Ready to start";

  return (
    <div className="conversation-page">
      <header className="conversation-header">
        <div className="conversation-meta">
          <span data-testid="conversation-mode-badge" className="mode-badge">
            {modeNames[mode]}
          </span>
          <span>
            {subjectCount} topic{subjectCount > 1 ? "s" : ""}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="icon-button"
          aria-label="Leave conversation"
        >
          <X size={20} aria-hidden="true" />
        </button>
      </header>
      <main className="conversation-main">
        <p className="eyebrow">Room for a conversation</p>
        <h1 ref={headingRef} tabIndex={-1}>
          {status === "connected"
            ? "A little space to explore."
            : "Your conversation is ready."}
        </h1>
        <p className="conversation-status" role="status">
          {statusText}
        </p>
        {startFailure && (
          <div role="alert" className="conversation-error">
            <AlertCircle size={20} aria-hidden="true" />
            <p>{startFailure.message}</p>
            <button
              type="button"
              className="icon-button"
              onClick={() => setStartFailure(null)}
              aria-label="Dismiss error"
            >
              <X size={18} aria-hidden="true" />
            </button>
            {startFailure.action === "sign_in" && (
              <a href="/sign-in" className="quiet-link">
                Sign in again
              </a>
            )}
          </div>
        )}
        <div className="voice-orbit" aria-hidden="true">
          <div className="voice-wave">
            {[22, 38, 60, 82, 52, 96, 65, 42, 72, 45, 24].map((height, i) => (
              <span
                key={i}
                style={{
                  height: status === "connected" ? height : 12,
                  animationDelay: `${i * 90}ms`,
                }}
                className={
                  status === "connected" && isSpeaking
                    ? "voice-bar-speaking"
                    : ""
                }
              />
            ))}
          </div>
        </div>
        <PlayButton
          mode={mode}
          isLoading={connecting}
          isActive={status === "connected"}
          onClick={() => void toggleConversation()}
          describedBy="conversation-help"
        />
        <p id="conversation-help" className="conversation-help">
          {status === "connected"
            ? "Take your time. You can interrupt or ask a follow-up."
            : "When you’re ready, allow microphone access and start talking."}
        </p>
        <details className="transcript">
          <summary>Conversation transcript</summary>
          <div
            role="log"
            aria-label="Conversation transcript"
            aria-live="off"
            tabIndex={0}
          >
            {transcript.length === 0 ? (
              <p>The words from your conversation will appear here.</p>
            ) : (
              transcript.map((line, i) => (
                <p key={i}>
                  <strong>{line.source === "user" ? "You" : "PODU"}</strong>
                  <span>{line.text}</span>
                </p>
              ))
            )}
          </div>
          <p className="transcript-note">
            This transcript stays here until you leave the conversation.
          </p>
        </details>
      </main>
      <footer className="conversation-controls">
        <button
          type="button"
          onClick={() => setMicMuted((value) => !value)}
          disabled={status !== "connected"}
          aria-pressed={micMuted}
          aria-label={micMuted ? "Unmute microphone" : "Mute microphone"}
          className="audio-control"
        >
          {micMuted ? (
            <MicOff size={18} aria-hidden="true" />
          ) : (
            <Mic size={18} aria-hidden="true" />
          )}
          <span>{micMuted ? "Mic off" : "Microphone"}</span>
        </button>
        <button
          type="button"
          onClick={() => setIsMuted((value) => !value)}
          aria-pressed={isMuted}
          aria-label={isMuted ? "Unmute host audio" : "Mute host audio"}
          className="audio-control"
        >
          {isMuted ? (
            <VolumeX size={18} aria-hidden="true" />
          ) : (
            <Volume2 size={18} aria-hidden="true" />
          )}
          <span>{isMuted ? "Sound off" : "Sound on"}</span>
        </button>
      </footer>
    </div>
  );
}
