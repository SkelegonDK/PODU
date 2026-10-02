import { cn } from "@/lib/utils";
import { Play, Loader2, Square } from "lucide-react";
import type { ConversationMode } from "./ModeSelector";
interface PlayButtonProps {
  mode: ConversationMode;
  isLoading?: boolean;
  isActive?: boolean;
  disabled?: boolean;
  onClick: () => void;
  describedBy?: string;
}
export function PlayButton({
  isLoading = false,
  isActive = false,
  disabled = false,
  onClick,
  describedBy,
}: PlayButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || isLoading}
      data-testid="play-button"
      aria-describedby={describedBy}
      aria-busy={isLoading}
      className={cn("conversation-button", isActive && "is-active")}
    >
      {isLoading ? (
        <Loader2 size={22} className="animate-spin" aria-hidden="true" />
      ) : isActive ? (
        <Square size={20} aria-hidden="true" />
      ) : (
        <Play size={20} aria-hidden="true" />
      )}
      <span>
        {isLoading
          ? "Connecting..."
          : isActive
            ? "End conversation"
            : "Start conversation"}
      </span>
    </button>
  );
}
