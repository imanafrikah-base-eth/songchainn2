import { memo } from 'react';
import type { PropSpec } from '../blocks';

/**
 * The settings panel for any block, rendered from that block's own prop
 * declaration.
 *
 * This is the piece that makes the builder cheap to own. There is no
 * per-block editor screen anywhere in the codebase and there never will be: a
 * block type that declares its props gets a working form for free, whether we
 * wrote it or a seller did.
 */

interface PropFormProps {
  specs: PropSpec[];
  values: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}

const field =
  'w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-ring';

export const PropForm = memo(function PropForm({ specs, values, onChange }: PropFormProps) {
  const set = (key: string, value: unknown) => onChange({ ...values, [key]: value });

  return (
    <div className="space-y-4">
      {specs.map((spec) => {
        const value = values[spec.key];
        const id = `prop-${spec.key}`;

        return (
          <div key={spec.key}>
            <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-foreground">
              {spec.label}
              {spec.required ? <span className="ml-1 text-destructive">*</span> : null}
            </label>

            {spec.kind === 'longtext' ? (
              <textarea
                id={id}
                rows={4}
                maxLength={spec.maxLength}
                className={field}
                placeholder={spec.placeholder}
                value={typeof value === 'string' ? value : ''}
                onChange={(e) => set(spec.key, e.target.value)}
              />
            ) : spec.kind === 'lines' || spec.kind === 'images' ? (
              <textarea
                id={id}
                rows={5}
                className={`${field} font-mono text-xs`}
                placeholder={spec.placeholder}
                // Stored as a newline string and split on read, so a person can
                // paste a list without meeting a repeater widget.
                value={
                  Array.isArray(value)
                    ? (value as string[]).join('\n')
                    : typeof value === 'string'
                      ? value
                      : ''
                }
                onChange={(e) => set(spec.key, e.target.value)}
              />
            ) : spec.kind === 'boolean' ? (
              <label className="flex items-center gap-2.5 text-sm text-muted-foreground">
                <input
                  id={id}
                  type="checkbox"
                  className="h-4 w-4 rounded border-border"
                  checked={value === true}
                  onChange={(e) => set(spec.key, e.target.checked)}
                />
                <span>{spec.help ?? 'On'}</span>
              </label>
            ) : spec.kind === 'select' ? (
              <select
                id={id}
                className={field}
                value={typeof value === 'string' ? value : ''}
                onChange={(e) => set(spec.key, e.target.value)}
              >
                {(spec.options ?? []).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={id}
                className={field}
                placeholder={spec.placeholder}
                maxLength={spec.maxLength}
                min={spec.min}
                max={spec.max}
                type={
                  spec.kind === 'number'
                    ? 'number'
                    : spec.kind === 'date'
                      ? 'datetime-local'
                      : spec.kind === 'url' || spec.kind === 'image'
                        ? 'url'
                        : 'text'
                }
                value={
                  typeof value === 'string' || typeof value === 'number' ? String(value) : ''
                }
                onChange={(e) =>
                  set(spec.key, spec.kind === 'number' ? Number(e.target.value) : e.target.value)
                }
              />
            )}

            {spec.help && spec.kind !== 'boolean' ? (
              <p className="mt-1.5 text-xs text-muted-foreground">{spec.help}</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
});
