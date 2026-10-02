import { useEffect, useState } from "react";
import * as poduApi from "../lib/poduApi";
import type { ConversationMode } from "../shared/config";

export function ConversationHistory({
  onResume,
}: {
  onResume: (id: string, mode: ConversationMode, topics: string[]) => void;
}) {
  const [items, setItems] = useState<poduApi.SavedConversation[]>([]);
  const [error, setError] = useState("");
  const [audio, setAudio] = useState<{ id: string; url: string } | null>(null);
  const [transcript, setTranscript] = useState<{
    id: string;
    turns: poduApi.TranscriptTurn[];
  } | null>(null);
  async function refresh() {
    const result = await poduApi.listConversations();
    if (result.ok) {
      setItems(result.data);
      setError("");
    } else setError(result.error.message);
  }
  useEffect(() => {
    void refresh();
  }, []);
  async function play(id: string) {
    const result = await poduApi.getRecording(id);
    if (result.ok && result.data.url) {
      setAudio({ id, url: result.data.url });
      setError("");
    } else
      setError(
        result.ok
          ? "The recording is still processing or was not saved. Refresh and try again."
          : result.error.message,
      );
  }
  async function showTranscript(id: string) {
    const result = await poduApi.getTranscript(id);
    if (result.ok) setTranscript({ id, turns: result.data });
    else setError(result.error.message);
  }
  async function remove(id: string) {
    const result = await poduApi.deleteConversation(id);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    if (audio?.id === id) setAudio(null);
    if (transcript?.id === id) setTranscript(null);
    await refresh();
  }
  return (
    <section className="conversation-history">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold">Your conversations</h2>
        <button onClick={() => void refresh()} className="quiet-link">
          Refresh
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm mb-3">
          {error}
        </p>
      )}
      {!items.length && (
        <p className="text-sm text-muted-foreground">
          Your saved conversations will appear here.
        </p>
      )}
      {items.map((item) => (
        <article
          key={item._id}
          className="border border-border rounded-xl p-4 mb-3 bg-card/80"
        >
          <p className="font-medium">
            {item.topics?.join(", ") || "Podcast conversation"} ·{" "}
            {item.mode.toUpperCase()}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {new Date(item.startedAt).toLocaleString()} ·{" "}
            {Math.round(item.durationSeconds / 60)} min
          </p>
          <div className="flex flex-wrap gap-x-4 mt-3 text-sm">
            {item.topics?.length && (
              <button
                onClick={() =>
                  onResume(
                    item._id,
                    item.mode as ConversationMode,
                    item.topics!,
                  )
                }
                className="quiet-link"
              >
                Continue
              </button>
            )}
            <button
              onClick={() => void showTranscript(item._id)}
              className="quiet-link"
            >
              Transcript
            </button>
            {item.saveRecording && (
              <button
                onClick={() => void play(item._id)}
                className="quiet-link"
              >
                Listen
              </button>
            )}
            <button
              onClick={() => void remove(item._id)}
              className="quiet-link"
            >
              Delete
            </button>
          </div>
          {audio?.id === item._id && (
            <audio controls autoPlay src={audio.url} className="w-full mt-3" />
          )}
          {transcript?.id === item._id && (
            <div className="max-h-72 overflow-y-auto mt-4 space-y-2 text-sm">
              {transcript.turns.map((t) => (
                <p key={t.sequence}>
                  <strong>{t.role === "user" ? "You" : "Hosts"}:</strong>{" "}
                  {t.message
                    .replace(/<\/?[A-Za-z]+>/g, "")
                    .replace(/\[[^\]]+\]/g, "")}
                </p>
              ))}
            </div>
          )}
        </article>
      ))}
    </section>
  );
}
