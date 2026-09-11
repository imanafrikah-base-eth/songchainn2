import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

/**
 * Changing what you wrote, in place.
 *
 * Before this, fixing one word in a caption meant deleting the post, and the
 * post took its likes, its comments and its place in everybody's feed with
 * it. So people left the typo. The same was true of comments, which could not
 * be touched at all.
 *
 * It saves on Enter and gives up on Escape, because that is what every text
 * box on a phone already does, and a shift-Enter still makes a new line.
 */
export function InlineEdit({
  value,
  onSave,
  onCancel,
  maxLength = 5000,
  placeholder = 'Say something',
  rows = 3,
}: {
  value: string;
  onSave: (next: string) => Promise<boolean> | boolean;
  onCancel: () => void;
  maxLength?: number;
  placeholder?: string;
  rows?: number;
}) {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const clean = draft.trim();
  const changed = clean !== value.trim();

  const save = async () => {
    if (!clean || !changed || saving) {
      if (!changed) onCancel();
      return;
    }
    setSaving(true);
    const ok = await onSave(clean);
    setSaving(false);
    if (ok) onCancel();
  };

  return (
    <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
      <Textarea
        ref={ref}
        rows={rows}
        value={draft}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void save();
          }
        }}
        className="text-sm"
      />
      <div className="flex items-center gap-2">
        <Button size="sm" className="h-9" disabled={!clean || !changed || saving} onClick={() => void save()}>
          {saving ? 'Saving' : 'Save'}
        </Button>
        <Button size="sm" variant="ghost" className="h-9" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <span className="ml-auto text-[11px] text-muted-foreground">{draft.length}/{maxLength}</span>
      </div>
    </div>
  );
}

/** The small honest mark next to something whose words changed after posting. */
export function EditedMark({ at, className = '' }: { at?: string | null; className?: string }) {
  if (!at) return null;
  return (
    <span className={'text-[11px] text-muted-foreground ' + className} title={new Date(at).toLocaleString()}>
      edited
    </span>
  );
}
