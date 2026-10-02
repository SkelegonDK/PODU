import { cn } from "@/lib/utils";
import { Smile, GraduationCap, Waves } from "lucide-react";
import type { ConversationMode } from "@/shared/config";
export type { ConversationMode };
const modes = [
  {
    id: "fun" as const,
    name: "Fun",
    description: "Witty & lighthearted",
    icon: Smile,
  },
  {
    id: "edu" as const,
    name: "Educational",
    description: "Curious & clear",
    icon: GraduationCap,
  },
  {
    id: "deep" as const,
    name: "Deep",
    description: "Thoughtful & reflective",
    icon: Waves,
  },
];
export function ModeSelector({
  selected,
  onSelect,
}: {
  selected: ConversationMode;
  onSelect: (mode: ConversationMode) => void;
}) {
  return (
    <div className="mode-selector">
      <div className="section-heading">
        <div>
          <p className="eyebrow">02 / The mood</p>
          <h2 id="modes-heading">How would you like to talk?</h2>
        </div>
      </div>
      <div className="mode-grid" role="group" aria-labelledby="modes-heading">
        {modes.map(({ id, name, description, icon: Icon }) => (
          <button
            type="button"
            key={id}
            aria-pressed={selected === id}
            onClick={() => onSelect(id)}
            className={cn("mode-option", selected === id && "is-selected")}
          >
            <Icon size={20} aria-hidden="true" />
            <strong>{name}</strong>
            <span>{description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
export { modes };
