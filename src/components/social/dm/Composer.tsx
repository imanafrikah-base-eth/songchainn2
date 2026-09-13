import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { ArrowUp, Loader2 } from 'lucide-react';

/**
 * The message box. Grows with what is typed up to about five lines, then
 * scrolls. On a keyboard, Enter sends and Shift+Enter starts a new line; on a
 * touch screen Enter is a new line and the button sends, as in every phone app.
 */
const MAX_HEIGHT = 128;

function isTouchKeyboard() {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
}

export function Composer({
  value,
  onChange,
  onSubmit,
  sending,
  disabled,
  placeholder,
  maxLength = 2000,
  above,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  sending: boolean;
  disabled?: boolean;
  placeholder: string;
  maxLength?: number;
  above?: ReactNode;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const canSend = value.trim().length > 0 && !sending && !disabled;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    const next = Math.min(el.scrollHeight, MAX_HEIGHT);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > MAX_HEIGHT ? 'auto' : 'hidden';
  }, [value]);

  const submit = () => {
    if (!canSend) return;
    onSubmit();
    // Keep the keyboard up so the next message can follow straight away.
    requestAnimationFrame(() => ref.current?.focus());
  };

  return (
    <div className="border-t border-border bg-background pb-safe">
      {above}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex items-end gap-2 px-3 py-2.5"
      >
        <label className="sr-only" htmlFor="dm-composer">
          {placeholder}
        </label>
        <textarea
          id="dm-composer"
          ref={ref}
          rows={1}
          value={value}
          maxLength={maxLength}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
            if (isTouchKeyboard()) return;
            e.preventDefault();
            submit();
          }}
          className="min-h-11 flex-1 resize-none rounded-3xl border border-border bg-muted/50 px-4 py-[11px] text-base leading-[22px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:bg-background disabled:opacity-60 sm:text-sm sm:leading-[22px]"
        />
        <button
          type="submit"
          disabled={!canSend}
          aria-label={sending ? 'Sending' : 'Send message'}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-40"
        >
          {sending ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <ArrowUp size={18} aria-hidden="true" />}
        </button>
      </form>
    </div>
  );
}
