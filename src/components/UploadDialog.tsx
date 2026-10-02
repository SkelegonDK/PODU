import { useState, useRef } from "react";
import { cn } from "@/lib/utils";
import { Upload, File, X, Loader2, CheckCircle2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import * as poduApi from "@/lib/poduApi";

interface UploadedDocument {
  id: string;
  name: string;
  size: number;
  status: "uploading" | "success" | "error";
  serverId?: string;
  /**
   * The server's explanation for this specific file, when it sent one (e.g.
   * "notes.pdf: only .txt and .md files are supported.", or why a delete was
   * rolled back). Undefined for failures with nothing useful to say, which
   * fall back to generic copy.
   */
  errorMessage?: string;
}

interface UploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDocumentsChange?: (documents: UploadedDocument[]) => void;
}

export function UploadDialog({
  open,
  onOpenChange,
  onDocumentsChange,
}: UploadDialogProps) {
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;

    const fileArray = Array.from(files);

    // Create initial document entries
    const newDocs: UploadedDocument[] = fileArray.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: file.name,
      size: file.size,
      status: "uploading" as const,
    }));

    setDocuments((prev) => {
      const updated = [...prev, ...newDocs];
      onDocumentsChange?.(updated);
      return updated;
    });

    // Upload each file to the server
    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      const doc = newDocs[i];

      if (!file || !doc) continue;

      const result = await poduApi.uploadDocument(file);

      if (!result.ok) {
        console.error("Error uploading file:", result.error);
        // A rejection the server named (unsupported type, empty file) carries
        // a sentence written for this file. Show that sentence; an anonymous
        // failure has nothing better than the generic fallback.
        const serverMessage = poduApi.isServerNamedError(result.error)
          ? result.error.message
          : undefined;
        setDocuments((prev) => {
          const updated = prev.map((d) =>
            d.id === doc.id
              ? { ...d, status: "error" as const, errorMessage: serverMessage }
              : d,
          );
          onDocumentsChange?.(updated);
          return updated;
        });
        continue;
      }

      setDocuments((prev) => {
        const updated = prev.map((d) =>
          d.id === doc.id
            ? {
                ...d,
                id: result.data.id,
                serverId: result.data.id,
                status: "success" as const,
              }
            : d,
        );
        onDocumentsChange?.(updated);
        return updated;
      });
    }
  };

  const removeDocument = async (id: string) => {
    const index = documents.findIndex((d) => d.id === id);
    const doc = documents[index];
    if (!doc) return;

    // Optimistic: the row disappears on click.
    setDocuments((prev) => {
      const updated = prev.filter((d) => d.id !== id);
      onDocumentsChange?.(updated);
      return updated;
    });

    // Only a successful upload has a server-side id worth deleting. A row
    // still uploading, or one whose upload failed, exists on this client only.
    if (!doc.serverId && doc.status !== "success") return;

    const result = await poduApi.deleteDocument(id);
    // 404 means the row is already gone server-side, so the optimistic removal
    // was right after all — deletion is idempotent.
    if (result.ok || result.error.status === 404) return;

    // Roll back: the document is still on the server, so a list that no longer
    // shows it is a lie — and the prompt would still include it.
    console.error("Error deleting document:", result.error);
    setDocuments((prev) => {
      if (prev.some((d) => d.id === doc.id)) return prev;
      const restored = [...prev];
      restored.splice(Math.min(index, restored.length), 0, {
        ...doc,
        status: "error",
        errorMessage: `Couldn't remove this file — ${result.error.message}`,
      });
      onDocumentsChange?.(restored);
      return restored;
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Documents</DialogTitle>
          <DialogDescription>
            Upload TXT or MD files to add to your knowledge base
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Upload zone */}
          <div
            role="button"
            tabIndex={0}
            aria-label="Choose documents to upload"
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              "relative cursor-pointer",
              "flex flex-col items-center justify-center gap-3",
              "p-8 rounded-xl border-2 border-dashed",
              "transition-all duration-300",
              isDragging
                ? "border-primary bg-primary/10 scale-[1.02]"
                : "border-border/50 bg-card/30 hover:border-border hover:bg-card/50",
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              aria-label="Upload TXT or MD documents"
              multiple
              accept=".txt,.md"
              className="hidden"
              onChange={(e) => {
                void handleFiles(e.target.files);
                e.target.value = "";
              }}
            />

            <div
              className={cn(
                "p-4 rounded-full",
                "bg-primary/10",
                "transition-transform duration-300",
                isDragging && "scale-110",
              )}
            >
              <Upload className="w-8 h-8 text-primary" />
            </div>

            <div className="text-center">
              <p className="font-display font-medium text-sm text-foreground/90">
                Drop files or tap to upload
              </p>
              <p className="font-mono text-sm text-muted-foreground mt-1">
                TXT, MD supported
              </p>
            </div>
          </div>

          {/* Uploaded files list */}
          {documents.length > 0 && (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              <p role="status" className="sr-only">
                {documents.filter((doc) => doc.status === "uploading").length}{" "}
                uploading,{" "}
                {documents.filter((doc) => doc.status === "success").length}{" "}
                uploaded,{" "}
                {documents.filter((doc) => doc.status === "error").length} with
                errors.
              </p>
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className={cn(
                    "flex items-center gap-3 p-2.5 rounded-lg",
                    "bg-card/50 border border-border/50",
                  )}
                >
                  <div
                    className={cn(
                      "p-1.5 rounded-md",
                      doc.status === "success"
                        ? "bg-primary/20 text-primary"
                        : doc.status === "error"
                          ? "bg-destructive/20 text-destructive"
                          : "bg-primary/20 text-primary",
                    )}
                  >
                    {doc.status === "uploading" ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : doc.status === "success" ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      <File className="w-4 h-4" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-sm text-foreground truncate">
                      {doc.name}
                    </p>
                    <p className="font-mono text-sm text-muted-foreground">
                      {doc.status === "error"
                        ? (doc.errorMessage ?? "Upload failed")
                        : formatFileSize(doc.size)}
                    </p>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeDocument(doc.id);
                    }}
                    disabled={doc.status === "uploading"}
                    aria-label={`Remove ${doc.name}`}
                    className={cn(
                      "min-w-11 min-h-11 flex items-center justify-center rounded-md disabled:opacity-40",
                      "text-muted-foreground hover:text-destructive",
                      "hover:bg-destructive/10 transition-colors",
                    )}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
