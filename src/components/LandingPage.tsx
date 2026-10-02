import { ConversationHistory } from "./ConversationHistory";
import { clientConfig } from "../shared/publicConfig";
import { useState, useMemo, useEffect } from "react";
import { cn } from "@/lib/utils";
import { SubjectSelector } from "./SubjectSelector";
import { ModeSelector } from "./ModeSelector";
import { PlayButton } from "./PlayButton";
import { ConversationView } from "./ConversationView";
import { Button } from "./ui/button";
import { AlertCircle, KeyRound, Settings2, WifiOff } from "lucide-react";
import LightRays from "./LightRays";
import Aurora from './Aurora';
import { ApiKeySettings } from "./ApiKeySettings";
import type { ConfigStatus, ConversationMode } from "@/shared/config";
import * as poduApi from "@/lib/poduApi";
import { useRequest } from "@/lib/useRequest";
import {
  describeException,
  failureCopy,
  failureCopyFromApiError,
  requiresApiKeyAction,
  type FailureCopy,
} from "@/lib/failureCopy";

/**
 * SSR-safe hook to detect prefers-reduced-motion media query.
 * Returns true if the user prefers reduced motion or if we're on the server.
 * Defaults to false (full motion) on initial client render, then updates.
 */
function usePrefersReducedMotion(): boolean {
  // Default to false (full motion) to avoid hydration mismatch
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    // Check if window is available (client-side only)
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    // Set initial value
    setPrefersReducedMotion(mediaQuery.matches);

    // Listen for changes
    const handleChange = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };

    // Modern browsers
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    } else {
      // Legacy browsers (Safari < 14)
      mediaQuery.addListener(handleChange);
      return () => mediaQuery.removeListener(handleChange);
    }
  }, []);

  return prefersReducedMotion;
}

const getModeColor = (mode: ConversationMode): string => {
  switch (mode) {
    case "fun":
      return "#F15BB5"; // pink
    case "edu":
      return "#00BBF9"; // blue
    case "deep":
      return "#9B5DE5"; // purple
    default:
      return "#00F5D4"; // mint
  }
};

// Map subject IDs to hex colors (using the "from" color from gradient)
const getSubjectColor = (subjectId: string): string => {
  const colorMap: Record<string, string> = {
    tech: "#00BBF9", // blue
    science: "#22c55e", // green-500
    history: "#FEE440", // yellow
    philosophy: "#9B5DE5", // purple
    business: "#94a3b8", // slate-400
    health: "#F15BB5", // pink
    arts: "#d946ef", // fuchsia-500
    upload: "#9B5DE5", // purple
  };
  return colorMap[subjectId] || "#3A29FF"; // default color
};

// Get Aurora colors based on selected subjects
const getAuroraColors = (selectedSubjects: string[]): string[] => {
  if (selectedSubjects.length === 0) {
    return ["#F15BB5", "#00BBF9", "#9B5DE5"]; // default colors
  }

  const colors = selectedSubjects.map(getSubjectColor);

  // Pad to 3 colors if needed
  while (colors.length < 3) {
    colors.push(colors[colors.length - 1] || "#3A29FF");
  }

  // Return only first 3 colors
  return colors.slice(0, 3);
};

interface LandingPageProps {
  /** Runtime opt-out to disable heavy effects (for low-end devices) */
  disableHeavyEffects?: boolean;
}

export function LandingPage({ disableHeavyEffects: disableHeavyEffectsProp }: LandingPageProps = {}) {
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [selectedMode, setSelectedMode] = useState<ConversationMode>("fun");
  const [isLoading, setIsLoading] = useState(false);
  // Holds mapped copy, never a raw string, so a rendered message can't be fed
  // back into a mapper.
  const [startFailure, setStartFailure] = useState<FailureCopy | null>(null);
  /**
   * The agent to hand to <ConversationView>, or null while we're on the
   * landing page. One nullable object rather than three parallel strings plus
   * a boolean: there is no longer a combination of those four that means
   * "showing the conversation with half an agent".
   */
  const [saveRecording, setSaveRecording] = useState(false);
  const [resumeId, setResumeId] = useState<string | undefined>();
  const [agent, setAgent] = useState<poduApi.AgentSession | null>(null);

  const config = useRequest<ConfigStatus>();
  const runConfig = config.run;
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Runtime state for disabling heavy effects (can be toggled by user or set via prop)
  const [disableHeavyEffectsState, setDisableHeavyEffectsState] = useState(false);

  // SSR-safe detection of prefers-reduced-motion
  const prefersReducedMotion = usePrefersReducedMotion();

  // Combine all sources: prop, state, or user preference
  const shouldReduceMotion = prefersReducedMotion || disableHeavyEffectsProp || disableHeavyEffectsState;

  /**
   * Last config the server answered with. Kept across a refresh so the banners
   * below don't flicker while `handleStart` re-checks; `configUnreachable`
   * says whether it's still trustworthy.
   */
  const configStatus = config.data;
  /**
   * The server didn't answer. Distinct from "answered, and you have no key":
   * a dead server used to render as a fully-configured app with a Play button
   * that did nothing, which is the one state this page must never fake.
   */
  const configUnreachable = config.status === "error";
  const needsApiKey = !configUnreachable && !!configStatus && !configStatus.hasApiKey;
  const missingAgentForMode =
    !configUnreachable && configStatus ? !configStatus.agentIds[selectedMode] : false;
  const canStart =
    selectedSubjects.length > 0 &&
    !needsApiKey &&
    !missingAgentForMode &&
    !configUnreachable;

  useEffect(() => {
    void runConfig(poduApi.getConfig);
  }, [runConfig]);

  // Compute Aurora colors based on selected subjects
  const auroraColors = useMemo(() => getAuroraColors(selectedSubjects), [selectedSubjects]);

  const handleStart = async () => {
    if (selectedSubjects.length === 0) return;

    // Loading state must appear immediately on click, before any network wait.
    setStartFailure(null);
    setIsLoading(true);

    try {
      // Pre-flight: refresh config so a stale "needs key" banner doesn't block a
      // user who just saved their key in another tab. If the refresh itself
      // fails we fall through — /api/agents is about to fail the same way and
      // will produce the more specific message.
      const latest = await runConfig(poduApi.getConfig);
      if (latest.ok && !latest.data.hasApiKey) {
        setStartFailure(failureCopy("missing_api_key", "landing"));
        setSettingsOpen(true);
        return;
      }
      if (latest.ok && !latest.data.agentIds[selectedMode]) {
        setStartFailure(failureCopy("missing_agent_id", "landing", { mode: selectedMode }));
        return;
      }

      const result = await poduApi.getAgent(selectedMode, selectedSubjects, { resumeId, saveRecording });
      if (!result.ok) {
        // Server codes are mapped here and nowhere else; the result is stored
        // as-is rather than thrown, so it never reaches describeException().
        const failure = failureCopyFromApiError(result.error, "landing", {
          mode: selectedMode,
        });
        console.error("Failed to start conversation:", result.error);
        setStartFailure(failure);
        if (requiresApiKeyAction(failure.code)) {
          setSettingsOpen(true);
        }
        return;
      }

      setAgent(result.data);
    } catch (error) {
      // poduApi resolves rather than throws, so this only catches a genuine
      // bug. describeException is still the one mapper for thrown values.
      console.error("Failed to start conversation:", error);
      setStartFailure(describeException(error, "landing"));
    } finally {
      setIsLoading(false);
    }
  };

  if (agent) {
    return (
      <ConversationView
        mode={selectedMode}
        conversationId={agent.conversationId}
        agentId={agent.agentId}
        systemPrompt={agent.systemPrompt}
        firstMessage={agent.firstMessage}
        subjectCount={selectedSubjects.length}
        onClose={() => setAgent(null)}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* LightRays background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <LightRays
          raysOrigin="top-center"
          raysColor={getModeColor(selectedMode)}
          // Reduce animation intensity when motion should be reduced
          raysSpeed={shouldReduceMotion ? 0.3 : 1.5}
          lightSpread={0.8}
          rayLength={1.2}
          // Disable mouse following for motion-sensitive users
          followMouse={!shouldReduceMotion}
          mouseInfluence={shouldReduceMotion ? 0 : 0.1}
          // Reduce/eliminate noise and distortion effects
          noiseAmount={shouldReduceMotion ? 0 : 0.1}
          distortion={shouldReduceMotion ? 0 : 0.05}
          className="w-full h-full"
        />
      </div>

      {/* Aurora background - positioned at bottom, on top of LightRays */}
      <div className="fixed bottom-0 left-0 right-0 h-1/2 overflow-hidden pointer-events-none z-[1] bg-transparent">
        <div className="w-full h-full rotate-180 bg-transparent">
          <Aurora
            colorStops={auroraColors}
            blend={0.5}
            // Reduce animation intensity when motion should be reduced
            amplitude={shouldReduceMotion ? 0.2 : 1.0}
            speed={shouldReduceMotion ? 0.1 : 0.5}
            className="w-full h-full"
          />
        </div>
      </div>

      {/* Header */}
      <header className="relative z-10 px-6 pt-12 pb-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 rounded-xl bg-white blur-lg opacity-50" />
              <div className="relative p-3 rounded-xl bg-white">
                <img
                  src="/assets/podu-logo.png"
                  alt="PODU Logo"
                  className="w-[60px] h-[60px] object-contain"
                />
              </div>
            </div>
            <div>
              <h1 className="font-display text-4xl font-extrabold tracking-tight">
                PODU
              </h1>
              <p className="font-mono text-xs text-muted-foreground -mt-1">
                Interactive Podcast
              </p>
            </div>
          </div>

          {clientConfig.local && <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="API settings"
            title={
              configStatus?.hasApiKey
                ? `API key ${configStatus.apiKeyPreview ?? "configured"}`
                : "Add your ElevenLabs API key"
            }
            className={cn(
              "flex items-center gap-2 rounded-full border px-3 py-2 font-mono text-xs transition-colors",
              configStatus?.hasApiKey
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20"
                : "border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20",
            )}
          >
            {configStatus?.hasApiKey ? (
              <>
                <KeyRound className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Connected</span>
              </>
            ) : (
              <>
                <Settings2 className="w-3.5 h-3.5" />
                <span>Add API key</span>
              </>
            )}
          </button>}
        </div>
      </header>

      {/* Main content - scrollable */}
      <main className="relative z-10 flex-1 overflow-y-auto scrollbar-hide px-6 pb-48">
        <div className="space-y-5 max-w-md mx-auto">
          {/* Subject selector */}
          <section>
            <SubjectSelector
              selected={selectedSubjects}
              onSelectionChange={subjects => { setSelectedSubjects(subjects); setResumeId(undefined); }}
              maxSelections={3}
            />
          </section>

          {/* Mode selector */}
          <section>
            <ModeSelector
              selected={selectedMode}
              onSelect={setSelectedMode}
            />
          </section>
        </div>
        {!clientConfig.local && <div className="relative z-10 px-6 py-4 max-w-2xl mx-auto">
          <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={saveRecording} onChange={e => setSaveRecording(e.target.checked)} className="mt-1" />
            <span>Save audio so I can listen again. My transcript and topic notes are saved to my account. ElevenLabs also processes and may retain the call audio.</span>
          </label>
          {resumeId && <p className="mt-2 text-sm">Continuing with notes from your previous conversation. <button onClick={() => setResumeId(undefined)} className="underline">Cancel continuation</button></p>}
        </div>}
        {!clientConfig.local && <ConversationHistory onResume={(id, mode, topics) => {
          const ids: Record<string, string> = { Technology: "tech", Science: "science", History: "history", Philosophy: "philosophy", Business: "business", "Health & Wellness": "health", "Arts & Culture": "arts" };
          setSelectedSubjects(topics.map(t => ids[t]).filter((id): id is string => !!id));
          setSelectedMode(mode); setResumeId(id);
        }} />}
      </main>

      {/* Fixed bottom play button */}
      <footer className="fixed bottom-0 inset-x-0 z-20">
        {/* Content */}
        <div className="relative px-6 py-8 pb-10">
          <div className="flex flex-col items-center gap-4">
            {/* Validation / config messages */}
            {!startFailure && (
              <>
                {configUnreachable ? (
                  /**
                   * Never auto-opens Settings: the key isn't the problem, and
                   * a modal demanding one would send the user off to fix
                   * something that isn't broken.
                   */
                  <div className="flex flex-col items-center gap-2 w-full max-w-md">
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
                      <WifiOff className="w-4 h-4 flex-shrink-0" />
                      <p className="font-mono text-xs">
                        Can't reach the PODU server — is bun dev running?
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void runConfig(poduApi.getConfig)}
                      disabled={config.status === "loading"}
                      className="font-mono text-xs"
                    >
                      Retry
                    </Button>
                  </div>
                ) : needsApiKey ? (
                  <button
                    type="button"
                    onClick={() => setSettingsOpen(true)}
                    className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-400 hover:bg-amber-500/20 transition-colors"
                  >
                    <KeyRound className="w-4 h-4" />
                    <span className="font-mono text-xs">
                      {clientConfig.local ? failureCopy("missing_api_key", "setup").message : "The voice service needs to be configured by the app owner."}
                    </span>
                  </button>
                ) : missingAgentForMode ? (
                  <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-400 max-w-md">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <p className="font-mono text-xs">
                      {failureCopy("missing_agent_id", "setup", { mode: selectedMode }).message}
                    </p>
                  </div>
                ) : selectedSubjects.length === 0 ? (
                  <p className="font-mono text-xs text-muted-foreground">
                    Select at least one subject to start
                  </p>
                ) : null}
              </>
            )}

            {/* Error message */}
            {startFailure && (
              <div className="flex flex-col items-center gap-2 w-full max-w-md">
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <p className="font-mono text-xs">{startFailure.message}</p>
                </div>
                <div className="flex gap-2">
                  {requiresApiKeyAction(startFailure.code) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSettingsOpen(true)}
                      className="font-mono text-xs"
                    >
                      Open Settings
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleStart}
                    disabled={isLoading || !canStart}
                    className="font-mono text-xs"
                  >
                    Retry
                  </Button>
                </div>
              </div>
            )}

            {/* Play button */}
            <PlayButton
              mode={selectedMode}
              isLoading={isLoading}
              disabled={!canStart}
              onClick={handleStart}
            />
          </div>
        </div>
      </footer>

      <ApiKeySettings
        open={clientConfig.local && (settingsOpen || needsApiKey)}
        blocking={needsApiKey}
        onOpenChange={setSettingsOpen}
        status={configStatus}
        /**
         * The dialog no longer fetches config itself — it reports that
         * something changed and this page, which owns the one config request,
         * re-reads it.
         */
        onSaved={async () => {
          const next = await runConfig(poduApi.getConfig);
          if (next.ok && next.data.hasApiKey) {
            setSettingsOpen(false);
            if (requiresApiKeyAction(startFailure?.code)) {
              setStartFailure(null);
            }
          }
        }}
      />
    </div>
  );
}
