import { useState, useEffect, useCallback, useRef } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { TranscriptQueue } from "../lib/transcriptQueue";
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
  conversationId?: string;
  mode: ConversationMode;
  agentId: string;
  systemPrompt: string;
  firstMessage: string;
  subjectCount: number;
  onClose: () => void;
}
const modeNames = { fun: "FUN", edu: "EDU", deep: "DEEP" };

export function ConversationView(props: ConversationViewProps) {
  return (
    <ConversationProvider>
      <ActiveConversation {...props} />
    </ConversationProvider>
  );
}

function ActiveConversation({
  conversationId,
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
  const [saveFailure, setSaveFailure] = useState(false);
  const [hasEnded, setHasEnded] = useState(false);
  const [transcript, setTranscript] = useState<
    { eventId: string; source: string; text: string }[]
  >([]);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(false);
  const starting = useRef(false);
  const queueRef = useRef<TranscriptQueue | null>(null);
  const memoryRevision = useRef(0);
  const connectedAt = useRef<number | null>(null);
  const lastTranscriptAt = useRef<number | null>(null);
  const finishing = useRef<Promise<void> | null>(null);
  if (!queueRef.current && conversationId)
    queueRef.current = new TranscriptQueue((turns) =>
      poduApi.saveTurns(conversationId, turns),
    );
  const save = useCallback(async () => {
    const ok = await queueRef.current?.flush();
    if (mounted.current && ok !== undefined) setSaveFailure(!ok);
    return ok !== false;
  }, []);
  const finish = useCallback(() => {
    if (finishing.current) return finishing.current;
    finishing.current = (async () => {
      const saved = await save();
      if (conversationId && connectedAt.current !== null) {
        const result = await poduApi.endConversation(conversationId);
        if (mounted.current) {
          setSaveFailure(!saved || !result.ok);
          setHasEnded(true);
        }
      }
    })().finally(() => {
      finishing.current = null;
    });
    return finishing.current;
  }, [save, conversationId]);
  const conversationRef = useRef<ReturnType<typeof useConversation> | null>(
    null,
  );

  const conversation = useConversation({
    micMuted,
    volume: isMuted ? 0 : 1,
    onConnect: () => {
      connectedAt.current = performance.now();
      if (mounted.current) setStartFailure(null);
    },
    onDisconnect: () => {
      void finish();
    },
    onMessage: ({ message, role, event_id }) => {
      if (role === "user") lastTranscriptAt.current = performance.now();
      if (typeof message !== "string") return;
      const eventId = `${role}:${event_id}`;
      queueRef.current?.push({ eventId, role, message });
      if (mounted.current)
        setTranscript((previous) => [
          ...previous,
          { eventId, source: role, text: message },
        ]);
    },
    onAgentResponseCorrection: (event) => {
      const eventId = `agent:${event.event_id}`;
      queueRef.current?.push({
        eventId,
        role: "agent",
        message: event.corrected_agent_response,
      });
      if (mounted.current)
        setTranscript((previous) =>
          previous.map((line) =>
            line.eventId === eventId
              ? { ...line, text: event.corrected_agent_response }
              : line,
          ),
        );
    },
    onModeChange: ({ mode }) => {
      if (mode === "speaking" && lastTranscriptAt.current !== null) {
        performance.measure("podu-transcript-to-speech", {
          start: lastTranscriptAt.current,
          end: performance.now(),
        });
        lastTranscriptAt.current = null;
      }
    },
    onInterruption: () => {
      lastTranscriptAt.current = null;
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
    const timer = window.setInterval(() => {
      void save();
    }, 2500);
    const pageHide = () => {
      void finish();
    };
    window.addEventListener("pagehide", pageHide);
    return () => {
      mounted.current = false;
      window.clearInterval(timer);
      window.removeEventListener("pagehide", pageHide);
      conversationRef.current?.endSession();
      void finish();
    };
  }, [finish, save]);

  useEffect(() => {
    if (!conversationId) return;
    const timer = window.setInterval(async () => {
      if (
        conversationRef.current?.status !== "connected" ||
        conversationRef.current.isSpeaking
      )
        return;
      const result = await poduApi.getMemory(conversationId);
      if (
        mounted.current &&
        result.ok &&
        result.data.revision > memoryRevision.current &&
        result.data.context &&
        conversationRef.current?.status === "connected"
      ) {
        memoryRevision.current = result.data.revision;
        conversationRef.current.sendContextualUpdate(result.data.context, {
          contextId: "podu-topic-memory",
        });
      }
    }, 20_000);
    return () => window.clearInterval(timer);
  }, [conversationId]);

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
      const tokenResult = await poduApi.getConversationToken(
        agentId,
        conversationId,
      );
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
    if (hasEnded) {
      onClose();
      return;
    }
    if (status !== "connected") {
      await startConversation();
      return;
    }
    setPending(true);
    try {
      await conversation.endSession();
      await finish();
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
          {hasEnded ? "Conversation ended" : statusText}
        </p>
        {saveFailure && (
          <p role="status" className="conversation-help">
            Transcript sync is delayed. We’ll keep trying.{" "}
            <button
              type="button"
              className="quiet-link"
              onClick={() => void finish()}
            >
              Retry sync
            </button>
          </p>
        )}
        {hasEnded && (
          <button type="button" className="quiet-link" onClick={onClose}>
            Back to topics and saved conversations
          </button>
        )}
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
        {!hasEnded && (
          <PlayButton
            mode={mode}
            isLoading={connecting}
            isActive={status === "connected"}
            onClick={() => void toggleConversation()}
            describedBy="conversation-help"
          />
        )}
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
            {conversationId
              ? "Your transcript is saved to your account."
              : "This transcript stays here until you leave the conversation."}
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
