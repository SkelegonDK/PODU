import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Cpu,
  Leaf,
  BookOpen,
  Brain,
  TrendingUp,
  Heart,
  Palette,
  Check,
  Upload,
} from "lucide-react";
import { UploadDialog } from "./UploadDialog";

const subjects = [
  { id: "tech", name: "Technology & AI", icon: Cpu },
  { id: "science", name: "Science & Nature", icon: Leaf },
  { id: "history", name: "History & Culture", icon: BookOpen },
  { id: "philosophy", name: "Philosophy & Ethics", icon: Brain },
  { id: "business", name: "Business", icon: TrendingUp },
  { id: "health", name: "Health & Wellness", icon: Heart },
  { id: "arts", name: "Arts & Creativity", icon: Palette },
];

interface SubjectSelectorProps {
  selected: string[];
  onSelectionChange: (selected: string[]) => void;
  maxSelections?: number;
}

export function SubjectSelector({
  selected,
  onSelectionChange,
  maxSelections = 3,
}: SubjectSelectorProps) {
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const atLimit = selected.length >= maxSelections;
  return (
    <div className="subject-selector">
      <div className="section-heading">
        <div>
          <p className="eyebrow">01 / Your interests</p>
          <h2 id="subjects-heading">Where shall we begin?</h2>
        </div>
        <span className="selection-count" role="status">
          {selected.length}/{maxSelections} selected
        </span>
      </div>
      <p id="subjects-help" className="section-description">
        Choose up to {maxSelections} topics. Follow whatever interests you.
      </p>
      <div
        className="subject-grid"
        role="group"
        aria-labelledby="subjects-heading"
        aria-describedby="subjects-help"
      >
        {subjects.map(({ id, name, icon: Icon }) => {
          const isSelected = selected.includes(id);
          return (
            <button
              type="button"
              key={id}
              aria-pressed={isSelected}
              disabled={!isSelected && atLimit}
              onClick={() =>
                onSelectionChange(
                  isSelected
                    ? selected.filter((subject) => subject !== id)
                    : [...selected, id],
                )
              }
              className={cn("subject-option", isSelected && "is-selected")}
            >
              <Icon size={20} aria-hidden="true" />
              <span>{name}</span>
              <span className="subject-check" aria-hidden="true">
                {isSelected && <Check size={16} />}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          className="subject-option upload-option"
          onClick={() => setIsUploadDialogOpen(true)}
          aria-haspopup="dialog"
        >
          <Upload size={20} aria-hidden="true" />
          <span>
            Upload Document <small>Bring your own notes</small>
          </span>
        </button>
      </div>
      <p className="selection-help" role="status">
        {atLimit
          ? "Three topics selected. Deselect one to try another."
          : "A broad interest is enough. You can find your question as you go."}
      </p>
      <UploadDialog
        open={isUploadDialogOpen}
        onOpenChange={setIsUploadDialogOpen}
      />
    </div>
  );
}
export { subjects };
