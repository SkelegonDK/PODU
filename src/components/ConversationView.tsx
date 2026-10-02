import { useState, useEffect, useCallback, useRef } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { TranscriptQueue } from "../lib/transcriptQueue";
import { cn } from "@/lib/utils";
import {
  describeException,
  failureCopyFromApiError,
  type FailureCopy,
} from "@/lib/failureCopy";
import * as poduApi from "@/lib/poduApi";
import { PlayButton } from "./PlayButton";
import type { ConversationMode } from "./ModeSelector";
import { X, Volume2, VolumeX, Mic, AlertCircle } from "lucide-react";

interface ConversationViewProps {
  conversationId?: string;
  mode: ConversationMode;
  agentId: string;
  systemPrompt: string;
  firstMessage: string;
  subjectCount: number;
  onClose: () => void;
}

const modeStyles = {
  fun: {
    gradient: "from-pink-400/20 via-pink-500/20 to-rose-500/20",
    border: "border-pink-500/30",
    text: "text-pink-400",
    bg: "bg-pink-500",
  },
  edu: {
    gradient: "from-sky-400/20 via-blue-500/20 to-blue-600/20",
    border: "border-blue-500/30",
    text: "text-blue-400",
    bg: "bg-blue-500",
  },
  deep: {
    gradient: "from-purple-400/20 via-purple-500/20 to-violet-600/20",
    border: "border-purple-500/30",
    text: "text-purple-400",
    bg: "bg-purple-500",
  },
};

const modeNames = {
  fun: "FUN",
  edu: "EDU",
  deep: "DEEP",
};

export function ConversationView(props: ConversationViewProps) {
  return <ConversationProvider><ActiveConversation {...props} /></ConversationProvider>;
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
  const [volume, setVolume] = useState(1);
  // Holds mapped copy, never a raw string, so a rendered message can't be fed
  // back into a mapper.
  const [startFailure, setStartFailure] = useState<FailureCopy | null>(null);
  const styles = modeStyles[mode];
  const conversationRef = useRef<ReturnType<typeof useConversation> | null>(null);
  const [saveFailure, setSaveFailure] = useState(false);
  const [hasEnded, setHasEnded] = useState(false);
  const queueRef = useRef<TranscriptQueue | null>(null);
  const memoryRevision = useRef(0);
  const connectedAt = useRef<number | null>(null);
  const lastTranscriptAt = useRef<number | null>(null);
  if (!queueRef.current && conversationId) queueRef.current = new TranscriptQueue(turns => poduApi.saveTurns(conversationId, turns));

  const save = useCallback(async () => {
    const ok = await queueRef.current?.flush();
    if (ok !== undefined) setSaveFailure(!ok);
  }, []);

  const finish = useCallback(async () => {
    await save();
    if (conversationId) {
      const result = await poduApi.endConversation(conversationId);
      if (!result.ok) setSaveFailure(true);
      setHasEnded(true);
    }
  }, [save, conversationId]);

  const conversation = useConversation({
    onConnect: () => {
      setStartFailure(null);
      connectedAt.current = performance.now();
    },
    onDisconnect: () => { void finish(); },
    onMessage: ({ role, message, event_id }) => {
      if (role === "user") lastTranscriptAt.current = performance.now();
      if (typeof message === "string") queueRef.current?.push({ eventId: `${role}:${event_id}`, role, message });
    },
    onModeChange: ({ mode }) => {
      if (mode === "speaking" && lastTranscriptAt.current !== null) {
        performance.measure("podu-transcript-to-speech", { start: lastTranscriptAt.current, end: performance.now() });
        lastTranscriptAt.current = null;
      }
    },
    onInterruption: () => { lastTranscriptAt.current = null; },
    onAgentResponseCorrection: (event) => {
      queueRef.current?.push({ eventId: `agent:${event.event_id}`, role: "agent", message: event.corrected_agent_response });
    },
    onError: (error: unknown) => {
      setStartFailure(describeException(error, "conversation"));
    },
  });

  // Keep ref in sync for cleanup
  conversationRef.current = conversation;

  const { status, isSpeaking } = conversation;

  const startConversation = useCallback(async () => {
    setStartFailure(null);

    // Request microphone permission
    try {
      const permission = await navigator.mediaDevices.getUserMedia({ audio: true });
      permission.getTracks().forEach(track => track.stop());
    } catch (micError) {
      setStartFailure(describeException(micError, "conversation"));
      return;
    }

    // Fetch conversation token for WebRTC. poduApi resolves with an ApiError
    // instead of throwing, so the server's failure is mapped here and nowhere
    // else, and the resulting copy is stored as-is — it never reaches
    // describeException(), which stays reserved for thrown values.
    const tokenResult = await poduApi.getConversationToken(agentId, conversationId);
    if (!tokenResult.ok) {
      setStartFailure(failureCopyFromApiError(tokenResult.error, "conversation", { mode }));
      return;
    }
    const { token } = tokenResult.data;

    // Start the conversation with server-built prompt
    try {
      await conversation.startSession({
        conversationToken: token,
        connectionType: "webrtc",
        overrides: {
          agent: {
            prompt: {
              prompt: systemPrompt,
            },
            firstMessage,
          },
        },
      });
    } catch (error) {
      setStartFailure(describeException(error, "conversation"));
    }
  }, [conversation, agentId, mode, systemPrompt, firstMessage, conversationId]);

  const stopConversation = useCallback(async () => {
    await conversation.endSession();
    await finish();
  }, [conversation, finish]);

  const toggleConversation = () => {
    if (hasEnded) { onClose(); return; }
    if (status === "connected") {
      stopConversation();
    } else {
      startConversation();
    }
  };

  const toggleMute = () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    setVolume(newMuted ? 0 : 1);
    conversation.setVolume({ volume: newMuted ? 0 : 1 });
  };

  // Cleanup on unmount using ref to avoid stale closure
  useEffect(() => {
    const timer = setInterval(() => { void save(); }, 2500);
    const pageHide = () => { void queueRef.current?.flush(); };
    window.addEventListener("pagehide", pageHide);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pagehide", pageHide);
      conversationRef.current?.endSession();
      void queueRef.current?.flush();
      if (conversationId && connectedAt.current !== null) void poduApi.endConversation(conversationId);
    };
  }, [conversationId, save]);

  useEffect(() => {
    if (!conversationId) return;
    const timer = setInterval(async () => {
      if (conversationRef.current?.status !== "connected" || conversationRef.current?.isSpeaking) return;
      const result = await poduApi.getMemory(conversationId);
      if (result.ok && result.data.revision > memoryRevision.current && result.data.context && conversationRef.current?.status === "connected") {
        memoryRevision.current = result.data.revision;
        // Silent context event: this never triggers a spoken turn.
        conversationRef.current.sendContextualUpdate(result.data.context, { contextId: "podu-topic-memory" });
      }
    }, 20_000);
    return () => clearInterval(timer);
  }, [conversationId]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Animated background */}
      <div className={cn(
        "absolute inset-0 bg-gradient-to-br opacity-50",
        styles.gradient
      )} />

      {/* Animated circles background */}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className={cn(
              "absolute rounded-full blur-3xl opacity-20",
              styles.bg,
              "animate-float"
            )}
            style={{
              width: `${150 + i * 50}px`,
              height: `${150 + i * 50}px`,
              left: `${10 + i * 20}%`,
              top: `${20 + i * 15}%`,
              animationDelay: `${i * 0.5}s`,
              animationDuration: `${6 + i}s`,
            }}
          />
        ))}
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <div
            data-testid="conversation-mode-badge"
            className={cn(
            "px-3 py-1 rounded-full text-xs font-bold font-mono",
            styles.bg,
            "text-white"
          )}>
            {modeNames[mode]}
          </div>
          <span className="font-mono text-xs text-muted-foreground">
            {subjectCount} topic{subjectCount > 1 ? "s" : ""}
          </span>
        </div>

        <button
          onClick={onClose}
          className={cn(
            "p-2 rounded-full",
            "bg-card/50 border border-border/50",
            "hover:bg-card transition-colors"
          )}
        >
          <X className="w-5 h-5" />
        </button>
      </header>

      {/* Main content */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6">
        {saveFailure && <p role="status" className="text-sm mb-4">Transcript sync is delayed. We’ll retry while you keep talking.</p>}
        {hasEnded && <button onClick={onClose} className="underline text-sm mb-4">Back to topics and saved conversations</button>}
        {/* Error banner */}
        {startFailure && (
          <div
            role="alert"
            className={cn(
              "mb-6 flex items-center gap-3 px-4 py-3 rounded-lg max-w-md w-full",
              "bg-destructive/10 border border-destructive/30 text-destructive"
            )}
          >
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p className="font-mono text-sm">{startFailure.message}</p>
            <button
              onClick={() => setStartFailure(null)}
              className="ml-auto p-1 rounded hover:bg-destructive/20 transition-colors"
              aria-label="Dismiss error"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        {/* Status indicator */}
        <div className={cn(
          "mb-8 px-4 py-2 rounded-full",
          "bg-card/50 backdrop-blur border",
          styles.border
        )}>
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-2 h-2 rounded-full",
              status === "connected"
                ? isSpeaking
                  ? "bg-green-500 animate-pulse"
                  : "bg-green-500"
                : status === "connecting"
                ? "bg-yellow-500 animate-pulse"
                : "bg-muted-foreground"
            )} />
            <span className="font-mono text-xs text-foreground/80">
              {status === "connected"
                ? isSpeaking
                  ? "Host is speaking..."
                  : "Listening..."
                : status === "connecting"
                ? "Connecting..."
                : "Ready to start"
              }
            </span>
          </div>
        </div>

        {/* Play button */}
        <PlayButton
          mode={mode}
          isLoading={status === "connecting"}
          isActive={status === "connected"}
          onClick={toggleConversation}
        />

        {/* Audio visualizer placeholder */}
        {status === "connected" && (
          <div className="mt-16 flex items-end justify-center gap-1 h-12">
            {[...Array(20)].map((_, i) => (
              <div
                key={i}
                className={cn(
                  "w-1 rounded-full transition-all duration-150",
                  styles.bg
                )}
                style={{
                  height: isSpeaking
                    ? `${Math.random() * 100}%`
                    : "20%",
                  opacity: isSpeaking ? 0.8 : 0.3,
                  animationDelay: `${i * 50}ms`,
                }}
              />
            ))}
          </div>
        )}
      </main>

      {/* Footer controls */}
      <footer className="relative z-10 p-6 pb-10">
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={toggleMute}
            className={cn(
              "p-3 rounded-full",
              "bg-card/50 backdrop-blur border border-border/50",
              "hover:bg-card transition-colors"
            )}
          >
            {isMuted ? (
              <VolumeX className="w-5 h-5 text-muted-foreground" />
            ) : (
              <Volume2 className="w-5 h-5" />
            )}
          </button>

          <div className={cn(
            "px-4 py-2 rounded-full",
            "bg-card/50 backdrop-blur border border-border/50",
            "font-mono text-xs text-muted-foreground"
          )}>
            {status === "connected" ? (
              <span className="flex items-center gap-2">
                <Mic className="w-3 h-3" />
                Live
              </span>
            ) : (
              "Tap play to begin"
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
