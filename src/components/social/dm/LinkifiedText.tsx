import { Fragment } from 'react';

/** Plain message text with web addresses made clickable. Nothing else is parsed. */
const URL_RE = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi;
const TRAILING = /[.,!?;:)\]'"]+$/;

export function LinkifiedText({ text, mine }: { text: string; mine?: boolean }) {
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 0) return <Fragment key={i}>{part}</Fragment>;
        const trail = part.match(TRAILING)?.[0] ?? '';
        const url = trail ? part.slice(0, -trail.length) : part;
        const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
        return (
          <Fragment key={i}>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={`underline underline-offset-2 ${mine ? 'decoration-primary-foreground/60' : 'decoration-foreground/40'} hover:decoration-current`}
              onClick={(e) => e.stopPropagation()}
            >
              {url}
            </a>
            {trail}
          </Fragment>
        );
      })}
    </>
  );
}
