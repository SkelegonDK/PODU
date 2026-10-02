import { useState, useEffect, type ReactNode } from "react";
import { SubjectSelector } from "./SubjectSelector";
import { ModeSelector } from "./ModeSelector";
import { PlayButton } from "./PlayButton";
import { ConversationView } from "./ConversationView";
import { Brand } from "./Brand";
import { Button } from "./ui/button";
import { AlertCircle, Settings2, Mic } from "lucide-react";
import { ApiKeySettings } from "./ApiKeySettings";
import { ConversationHistory } from "./ConversationHistory";
import { clientConfig } from "../shared/publicConfig";
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

interface LandingPageProps {
  accountControls?: ReactNode;
  userName?: string;
  /** Kept for compatibility; the setup screen no longer renders heavy effects. */
  disableHeavyEffects?: boolean;
}

export function LandingPage({
  accountControls,
  userName,
}: LandingPageProps = {}) {
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [selectedMode, setSelectedMode] = useState<ConversationMode>("fun");
  const [isLoading, setIsLoading] = useState(false);
  const [saveRecording, setSaveRecording] = useState(false);
  const [resumeId, setResumeId] = useState<string | undefined>();
  // Holds mapped copy, never a raw string, so a rendered message can't be fed
  // back into a mapper.
  const [startFailure, setStartFailure] = useState<FailureCopy | null>(null);
  /**
   * The agent to hand to <ConversationView>, or null while we're on the
   * landing page. One nullable object rather than three parallel strings plus
   * a boolean: there is no longer a combination of those four that means
   * "showing the conversation with half an agent".
   */
  const [agent, setAgent] = useState<poduApi.AgentSession | null>(null);

  const config = useRequest<ConfigStatus>();
  const runConfig = config.run;
  const [settingsOpen, setSettingsOpen] = useState(false);

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
  const needsApiKey =
    !configUnreachable && !!configStatus && !configStatus.hasApiKey;
  const missingAgentForMode =
    !configUnreachable && configStatus
      ? !configStatus.agentIds[selectedMode]
      : false;
  const canStart =
    selectedSubjects.length > 0 &&
    config.status !== "idle" &&
    config.status !== "loading" &&
    !needsApiKey &&
    !missingAgentForMode &&
    !configUnreachable;

  useEffect(() => {
    void runConfig(poduApi.getConfig);
  }, [runConfig]);

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
        if (clientConfig.local) setSettingsOpen(true);
        return;
      }
      if (latest.ok && !latest.data.agentIds[selectedMode]) {
        setStartFailure(
          failureCopy("missing_agent_id", "landing", { mode: selectedMode }),
        );
        return;
      }

      const result = await poduApi.getAgent(selectedMode, selectedSubjects, {
        resumeId,
        saveRecording,
      });
      if (!result.ok) {
        // Server codes are mapped here and nowhere else; the result is stored
        // as-is rather than thrown, so it never reaches describeException().
        const failure = failureCopyFromApiError(result.error, "landing", {
          mode: selectedMode,
        });
        console.error("Failed to start conversation:", result.error);
        setStartFailure(failure);
        if (clientConfig.local && requiresApiKeyAction(failure.code)) {
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
        onClose={() => {
          setAgent(null);
          setResumeId(undefined);
          requestAnimationFrame(() =>
            document
              .querySelector<HTMLButtonElement>('[data-testid="play-button"]')
              ?.focus(),
          );
        }}
      />
    );
  }

  return (
    <div className="workspace-page">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <header className="site-header">
        <Brand subtitle="Room for a conversation." />
        <div className="account-nav">
          {clientConfig.local && (
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label="API settings"
              className="settings-button"
            >
              <Settings2 size={18} aria-hidden="true" />
              <span>Settings</span>
            </button>
          )}
          {accountControls}
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="workspace-layout">
        <div className="workspace-intro">
          <p className="eyebrow">
            {userName ? `Welcome back, ${userName}` : "A little room to think"}
          </p>
          <h1>
            Follow a thought.
            <br />
            See where it goes.
          </h1>
          <p>
            A question, a new interest, or something you want to work through.
            Make this conversation yours.
          </p>
          <div className="workspace-aside">
            <Mic size={18} aria-hidden="true" />
            <span>
              Speak naturally. Take your time.
              <br />
              There’s no perfect place to start.
            </span>
          </div>
        </div>
        <div className="conversation-setup">
          <SubjectSelector
            selected={selectedSubjects}
            onSelectionChange={(subjects) => {
              setSelectedSubjects(subjects);
              setResumeId(undefined);
            }}
            maxSelections={3}
          />
          <ModeSelector selected={selectedMode} onSelect={setSelectedMode} />
          {!clientConfig.local && (
            <div className="recording-options">
              <label className="recording-option">
                <input
                  type="checkbox"
                  checked={saveRecording}
                  onChange={(event) => setSaveRecording(event.target.checked)}
                />
                <span>Save audio so I can listen again.</span>
              </label>
              <p>
                Transcripts and topic notes are saved to your account.
                ElevenLabs also processes and may retain call audio.
              </p>
              {resumeId && (
                <p>
                  Continuing with notes from an earlier conversation.{" "}
                  <button
                    type="button"
                    className="quiet-link"
                    onClick={() => setResumeId(undefined)}
                  >
                    Cancel continuation
                  </button>
                </p>
              )}
            </div>
          )}
          <div className="start-section">
            <div id="start-guidance" className="start-guidance" role="status">
              {startFailure ? (
                <p className="inline-error">
                  <AlertCircle size={18} aria-hidden="true" />
                  {startFailure.message}
                </p>
              ) : configUnreachable ? (
                <p className="inline-error">
                  {config.error?.status === 401
                    ? failureCopy("authentication_error", "landing").message
                    : config.error?.code === "backend_not_configured"
                      ? "PODU’s voice service is still being set up. Please try again later."
                      : "We couldn’t connect to PODU. Please try again."}
                </p>
              ) : config.status === "loading" && !configStatus ? (
                <p>Getting your conversation ready…</p>
              ) : needsApiKey ? (
                <p>
                  {clientConfig.local
                    ? "Connect ElevenLabs in Settings to start your local conversation."
                    : "PODU’s voice service is still being set up. Please try again later."}
                </p>
              ) : missingAgentForMode ? (
                <p>
                  {clientConfig.local
                    ? failureCopy("missing_agent_id", "setup", {
                        mode: selectedMode,
                      }).message
                    : "This conversation style is still being set up. Please try another style."}
                </p>
              ) : selectedSubjects.length === 0 ? (
                <p>Choose at least one topic to get started.</p>
              ) : (
                <p>
                  {selectedSubjects.length} topic
                  {selectedSubjects.length === 1 ? "" : "s"} selected. Ready
                  when you are.
                </p>
              )}
            </div>
            <div className="start-actions">
              <PlayButton
                mode={selectedMode}
                isLoading={isLoading}
                disabled={!canStart}
                onClick={handleStart}
                describedBy="start-guidance microphone-note"
              />
              {clientConfig.local &&
                (needsApiKey || requiresApiKeyAction(startFailure?.code)) && (
                  <Button
                    variant="outline"
                    onClick={() => setSettingsOpen(true)}
                  >
                    Open Settings
                  </Button>
                )}
              {(config.error?.status === 401 ||
                startFailure?.action === "sign_in") && (
                <a className="quiet-link" href="/sign-in">
                  Sign in again
                </a>
              )}
              {configUnreachable && (
                <Button
                  variant="outline"
                  onClick={() => void runConfig(poduApi.getConfig)}
                  disabled={config.status === "loading"}
                >
                  Retry
                </Button>
              )}
              {startFailure && (
                <Button
                  variant="outline"
                  onClick={handleStart}
                  disabled={isLoading || !canStart}
                >
                  Retry
                </Button>
              )}
            </div>
            <p id="microphone-note" className="microphone-note">
              <Mic size={14} aria-hidden="true" /> You’ll be asked for
              microphone access before you speak.
            </p>
          </div>
          {!clientConfig.local && (
            <ConversationHistory
              onResume={(id, mode, topics) => {
                const ids: Record<string, string> = {
                  Technology: "tech",
                  Science: "science",
                  History: "history",
                  Philosophy: "philosophy",
                  Business: "business",
                  "Health & Wellness": "health",
                  "Arts & Culture": "arts",
                };
                setSelectedSubjects(
                  topics
                    .map((topic) => ids[topic])
                    .filter((id): id is string => !!id),
                );
                setSelectedMode(mode);
                setResumeId(id);
              }}
            />
          )}
        </div>
      </main>
      <footer className="site-footer">
        <span>PODU · Made for curious minds.</span>
        <span>Your conversation partner is AI.</span>
      </footer>
      <ApiKeySettings
        open={clientConfig.local && settingsOpen}
        onOpenChange={setSettingsOpen}
        status={configStatus}
        onSaved={async () => {
          const next = await runConfig(poduApi.getConfig);
          if (next.ok && next.data.hasApiKey) {
            setSettingsOpen(false);
            if (requiresApiKeyAction(startFailure?.code)) setStartFailure(null);
          }
        }}
      />
    </div>
  );
}
