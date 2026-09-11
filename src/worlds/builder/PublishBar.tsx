import { Link } from 'react-router-dom';
import { Check, DoorOpen, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Opening the doors, from anywhere in the builder.
 *
 * The publish button lived on the last screen of an eight step wizard, so an
 * artist who had finished building could not find the one control they were
 * looking for and had no idea how close they were. It is now a bar that sits
 * with them the whole way: what is still missing, one tap to see the world as
 * it stands, and one tap to open the doors the moment it is allowed.
 *
 * It says nothing when there is nothing to say. A published world shows its
 * number and a way in, not a publish button.
 */

export interface Requirement {
  ok: boolean;
  label: string;
}

export function PublishBar({
  slug,
  published,
  worldNumber,
  requirements,
  onPublish,
  onOpenPublishStep,
  publishing = false,
}: {
  slug: string;
  published: boolean;
  worldNumber?: number | null;
  /** Everything that has to be true before the doors can open. */
  requirements: Requirement[];
  onPublish: () => void;
  /** Where the remaining details are filled in. */
  onOpenPublishStep: () => void;
  publishing?: boolean;
}) {
  const missing = requirements.filter((r) => !r.ok);
  const ready = missing.length === 0;

  if (published) {
    return (
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground">
            {worldNumber ? `World #${String(worldNumber).padStart(3, '0')} is open` : 'Your world is open'}
          </span>
          <span className="block text-xs text-muted-foreground">
            Everything you change from here shows up straight away.
          </span>
        </span>
        <Button asChild variant="outline" className="h-11 shrink-0 rounded-full">
          <Link to={`/w/${slug}`}>
            <Eye className="mr-1.5 h-4 w-4" />
            Walk in
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-xl border border-border bg-card p-3.5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground">
            {ready ? 'Ready to open the doors' : 'Not open yet'}
          </span>
          <span className="block text-xs text-muted-foreground">
            {ready
              ? 'Your world number is stamped the moment you open it.'
              : missing.length === 1
                ? `One thing left: ${missing[0].label.toLowerCase()}.`
                : `${missing.length} things left before it can open.`}
          </span>
        </span>
        <Button asChild variant="outline" className="h-11 shrink-0 rounded-full">
          <Link to={`/w/${slug}`}>
            <Eye className="mr-1.5 h-4 w-4" />
            Preview
          </Link>
        </Button>
        <Button
          className="h-11 shrink-0 rounded-full"
          disabled={publishing}
          onClick={ready ? onPublish : onOpenPublishStep}
        >
          <DoorOpen className="mr-1.5 h-4 w-4" />
          {publishing ? 'Opening' : ready ? 'Open the doors' : 'What is left'}
        </Button>
      </div>

      {!ready && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {requirements.map((r) => (
            <li
              key={r.label}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${
                r.ok ? 'border-primary/40 text-foreground' : 'border-border text-muted-foreground'
              }`}
            >
              {r.ok ? <Check className="h-3 w-3 text-primary" /> : <span className="h-3 w-3 rounded-full border border-border" />}
              {r.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default PublishBar;
