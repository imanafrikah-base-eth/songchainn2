import { Fragment, useMemo, useRef, useState, type ReactNode } from "react";
import { AtSign, Send, Smile } from "lucide-react";

/**
 * The battle chat box, with @ to tag somebody in the room (founder, 15 Sep 2026).
 *
 * Typing @ opens the people in the room, filtered as you type; picking one puts
 * "@Name " in the message. When the message is sent the room page works out who
 * was tagged (mentionedIn) and they get a notification that opens the room.
 */
export interface MentionPerson {
  userId: string;
  name: string;
}

/** The @word being typed at the end of the text, if any. */
function activeQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at < 0) return null;
  if (at > 0 && !/\s/.test(before[at - 1])) return null;
  const query = before.slice(at + 1);
  if (query.length > 24 || /\n/.test(query)) return null;
  return { start: at, query };
}

/** Everybody tagged in a message: "@Name" for a name of somebody in the room, longest names first. */
export function mentionedIn(text: string, people: MentionPerson[]): MentionPerson[] {
  const lower = text.toLowerCase();
  const found = new Map<string, MentionPerson>();
  for (const p of [...people].sort((a, b) => b.name.length - a.name.length)) {
    if (!p.name) continue;
    const needle = `@${p.name.toLowerCase()}`;
    let i = lower.indexOf(needle);
    while (i >= 0) {
      const after = lower[i + needle.length];
      if (after === undefined || /[\s.,!?:;)]/.test(after)) {
        found.set(p.userId, p);
        break;
      }
      i = lower.indexOf(needle, i + 1);
    }
  }
  return [...found.values()];
}

/** A chat line with every @Name of somebody in the room lit up. */
export function MentionText({ text, people, meId }: { text: string; people: MentionPerson[]; meId?: string | null }) {
  const parts = useMemo(() => {
    const names = [...people].filter((p) => p.name).sort((a, b) => b.name.length - a.name.length);
    if (!names.length || !text.includes("@")) return [text];
    const escaped = names.map((p) => p.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const re = new RegExp(`@(${escaped.join("|")})(?=$|[\\s.,!?:;)])`, "gi");
    const out: ReactNode[] = [];
    let last = 0;
    for (const m of text.matchAll(re)) {
      const idx = m.index ?? 0;
      if (idx > last) out.push(text.slice(last, idx));
      const who = names.find((p) => p.name.toLowerCase() === m[1].toLowerCase());
      const isMe = !!who && who.userId === meId;
      out.push(
        <span
          key={`${idx}-${m[1]}`}
          className={`rounded px-1 font-semibold ${isMe ? "bg-accent/20 text-accent" : "bg-primary/15 text-primary"}`}
        >
          @{who?.name ?? m[1]}
        </span>,
      );
      last = idx + m[0].length;
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
  }, [text, people, meId]);
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>{part}</Fragment>
      ))}
    </>
  );
}

export function RoomChatComposer({
  value,
  onChange,
  onSend,
  people,
}: {
  value: string;
  onChange: (next: string) => void;
  onSend: () => void;
  people: MentionPerson[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [caret, setCaret] = useState(0);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const q = activeQuery(value, caret);
  const matches = useMemo(() => {
    if (!q) return [];
    const needle = q.query.toLowerCase();
    return people.filter((p) => p.name && p.name.toLowerCase().includes(needle)).slice(0, 6);
  }, [q, people]);
  const open = !!q && matches.length > 0;

  const pick = (p: MentionPerson) => {
    if (!q) return;
    const next = `${value.slice(0, q.start)}@${p.name} ${value.slice(caret)}`;
    onChange(next);
    const pos = q.start + p.name.length + 2;
    setCaret(pos);
    setHighlight(0);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(pos, pos);
    });
  };

  const insertAt = () => {
    const el = inputRef.current;
    const pos = el?.selectionStart ?? value.length;
    const needsSpace = pos > 0 && !/\s/.test(value[pos - 1]);
    const next = `${value.slice(0, pos)}${needsSpace ? " " : ""}@${value.slice(pos)}`;
    onChange(next);
    const at = pos + (needsSpace ? 2 : 1);
    setCaret(at);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at, at);
    });
  };

  return (
    <div className="relative flex gap-2">
      {open && (
        <ul
          role="listbox"
          aria-label="Tag somebody in the room"
          className="absolute bottom-full left-0 right-12 z-20 mb-2 overflow-hidden rounded-xl border border-primary/30 bg-card shadow-[0_0_24px_hsl(var(--neon-green)/0.15)]"
        >
          {matches.map((p, i) => (
            <li key={p.userId}>
              <button
                type="button"
                role="option"
                aria-selected={i === highlight}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(p)}
                className={`flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm ${
                  i === highlight ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-muted/40"
                }`}
              >
                <AtSign className="h-3.5 w-3.5 text-primary" />
                <span className="truncate font-semibold">{p.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="relative flex-1">
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setCaret(e.target.selectionStart ?? e.target.value.length);
            setHighlight(0);
          }}
          onSelect={(e) => setCaret((e.target as HTMLInputElement).selectionStart ?? value.length)}
          onKeyDown={(e) => {
            if (open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
              e.preventDefault();
              setHighlight((h) => (e.key === "ArrowDown" ? (h + 1) % matches.length : (h - 1 + matches.length) % matches.length));
              return;
            }
            if (open && (e.key === "Enter" || e.key === "Tab")) {
              e.preventDefault();
              pick(matches[highlight] ?? matches[0]);
              return;
            }
            if (e.key === "Enter") onSend();
          }}
          placeholder="Say something, @ to tag"
          aria-label="Chat message"
          className="w-full rounded-xl border border-border bg-background py-2.5 pl-3 pr-16 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/40"
        />
        <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center">
          <button
            type="button"
            aria-label="Tag somebody"
            onClick={insertAt}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-primary"
          >
            <AtSign className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Add an emoji"
            onClick={() => setEmojiOpen((o) => !o)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
          >
            <Smile className="h-4 w-4" />
          </button>
        </div>
        {emojiOpen && (
          <div className="absolute bottom-full right-0 z-20 mb-2 flex gap-1 rounded-xl border border-border bg-card p-2">
            {["🔥", "💯", "👏", "❤️", "😮", "😂", "💪", "🎵"].map((em) => (
              <button
                key={em}
                type="button"
                onClick={() => {
                  onChange(value + em);
                  setEmojiOpen(false);
                }}
                className="text-lg transition-transform hover:scale-125"
              >
                {em}
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onSend}
        aria-label="Send"
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-[0_0_16px_hsl(var(--neon-green)/0.35)] hover:bg-primary/90"
      >
        <Send className="h-4 w-4" />
      </button>
    </div>
  );
}

export default RoomChatComposer;
