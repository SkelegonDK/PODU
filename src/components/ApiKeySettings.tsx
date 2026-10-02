import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import {
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Loader2,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { failureCopy } from "@/lib/failureCopy";
import type { ConfigStatus } from "@/shared/config";
import * as poduApi from "@/lib/poduApi";

interface ApiKeySettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Current config, owned and refreshed by the parent. */
  status: ConfigStatus | null;
  /**
   * The stored key changed. The parent re-reads config and decides what to do
   * with the result — this dialog deliberately has no config request of its
   * own, so there is one reader of /api/config in the app.
   */
  onSaved: () => void;
  /** When true, the dialog cannot be dismissed (first-run / blocker mode). */
  blocking?: boolean;
}

export function ApiKeySettings({
  open,
  onOpenChange,
  status,
  onSaved,
  blocking = false,
}: ApiKeySettingsProps) {
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setApiKey("");
      setError(null);
      setSuccess(null);
    }
  }, [open]);

  const handleSave = async () => {
    setError(null);
    setSuccess(null);
    const trimmed = apiKey.trim();
    if (!trimmed) {
      setError("Paste your ElevenLabs API key to save.");
      return;
    }

    setSaving(true);
    try {
      const result = await poduApi.setApiKey(trimmed);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setSuccess("API key verified and saved.");
      setApiKey("");
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  // Same error path as save: a failed DELETE used to be reported as a bare
  // status code while POST showed the server's sentence.
  const handleClear = async () => {
    setError(null);
    setSuccess(null);
    setClearing(true);
    try {
      const result = await poduApi.clearApiKey();
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setSuccess("API key removed from this session.");
      onSaved();
    } finally {
      setClearing(false);
    }
  };

  const missingAgents = status?.missingAgentModes ?? [];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (blocking && !next) return;
        onOpenChange(next);
      }}
    >
      <DialogContent
        className="sm:max-w-lg"
        showCloseButton={!blocking}
        onEscapeKeyDown={(e) => {
          if (blocking) e.preventDefault();
        }}
        onPointerDownOutside={(e) => {
          if (blocking) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (blocking) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="w-5 h-5" />
            ElevenLabs API connection
          </DialogTitle>
          <DialogDescription>
            Connect ElevenLabs to use PODU locally. You can update or remove
            your API key here.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!saving && !clearing) void handleSave();
          }}
          className="space-y-4"
        >
          <div className="space-y-4 py-2">
            <StatusRow
              label="API key"
              value={
                status?.hasApiKey
                  ? `${status.apiKeyPreview ?? "configured"} ${
                      status.apiKeySource === "env"
                        ? "(from .env)"
                        : "(from session)"
                    }`
                  : "Not configured"
              }
              ok={!!status?.hasApiKey}
            />

            <div>
              <Label htmlFor="elevenlabs-api-key" className="text-sm font-mono">
                {status?.hasApiKey
                  ? "Replace key"
                  : "Paste your ElevenLabs API key"}
              </Label>
              <Input
                id="elevenlabs-api-key"
                type="password"
                autoComplete="off"
                aria-invalid={!!error}
                aria-describedby={
                  error ? "api-key-help api-key-error" : "api-key-help"
                }
                spellCheck={false}
                placeholder="sk_..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                disabled={saving || clearing}
                className="mt-1 font-mono"
              />
              <p
                id="api-key-help"
                className="mt-2 text-sm font-mono text-muted-foreground"
              >
                Generate one under Profile → API Keys in the ElevenLabs
                dashboard.
              </p>
            </div>

            {missingAgents.length > 0 && (
              <div
                className={cn(
                  "flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3",
                  "text-primary",
                )}
              >
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div className="text-sm font-mono leading-relaxed">
                  {
                    failureCopy("missing_agent_id", "setup", {
                      modes: missingAgents,
                    }).message
                  }
                </div>
              </div>
            )}

            {error && (
              <div
                id="api-key-error"
                role="alert"
                className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-destructive"
              >
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <p className="text-sm font-mono leading-relaxed">{error}</p>
              </div>
            )}

            {success && (
              <div
                role="status"
                className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/10 p-3 text-primary"
              >
                <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <p className="text-sm font-mono leading-relaxed">{success}</p>
              </div>
            )}
          </div>

          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            {status?.hasApiKey && status.apiKeySource === "session" ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClear}
                disabled={saving || clearing}
                className="text-sm font-mono"
              >
                {clearing ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Trash2 className="w-3 h-3" />
                )}
                Remove stored key
              </Button>
            ) : (
              <span />
            )}

            <Button
              type="submit"
              disabled={saving || clearing || !apiKey.trim()}
              className="font-mono text-xs"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Verifying…
                </>
              ) : (
                "Verify & save"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StatusRow({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border/40 bg-card/40 px-3 py-2">
      <span className="text-sm font-mono text-muted-foreground">{label}</span>
      <span
        className={cn(
          "flex items-center gap-1.5 text-sm font-mono",
          ok ? "text-primary" : "text-destructive",
        )}
      >
        {ok ? (
          <CheckCircle2 className="w-3.5 h-3.5" />
        ) : (
          <AlertCircle className="w-3.5 h-3.5" />
        )}
        {value}
      </span>
    </div>
  );
}
