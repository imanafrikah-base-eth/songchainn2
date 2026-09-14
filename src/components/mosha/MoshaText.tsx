import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

/**
 * Mo$ha's words with light formatting, the way a chat assistant reads:
 * **bold**, bullet and numbered lines as real lists, web links that open, and
 * app pages (/studio, /worlds) that are a tap away. Plain text stays plain.
 */

const TOKEN = /(\*\*[^*\n]+\*\*|https?:\/\/[^\s)]+|(?:^|\s)\/[a-z][a-z0-9\-/_?=&%]*)/gi;

function inline(line: string, key: string): ReactNode[] {
  return line
    .split(TOKEN)
    .filter((p) => p !== undefined && p !== '')
    .map((p, i) => {
      const k = `${key}-${i}`;
      if (p.length > 4 && p.startsWith('**') && p.endsWith('**')) {
        return <strong key={k} className="font-semibold">{p.slice(2, -2)}</strong>;
      }
      if (/^https?:\/\//i.test(p)) {
        const m = p.match(/^(.*?)([.,!?:;]*)$/) ?? [p, p, ''];
        return (
          <Fragment key={k}>
            <a href={m[1]} target="_blank" rel="noopener noreferrer" className="break-all underline underline-offset-2">{m[1]}</a>
            {m[2]}
          </Fragment>
        );
      }
      const path = p.match(/^(\s?)(\/[a-z][a-z0-9\-/_?=&%]*?)([.,!?:;]*)$/i);
      if (path) {
        return (
          <Fragment key={k}>
            {path[1]}
            <Link to={path[2]} className="underline underline-offset-2">{path[2]}</Link>
            {path[3]}
          </Fragment>
        );
      }
      return <Fragment key={k}>{p}</Fragment>;
    });
}

export function MoshaText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*[-*•]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*•]\s+/, ''));
      blocks.push(
        <ul key={`u${i}`} className="my-1 list-disc space-y-0.5 pl-5">
          {items.map((t, j) => <li key={j}>{inline(t, `u${i}-${j}`)}</li>)}
        </ul>,
      );
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+[.)]\s+/, ''));
      blocks.push(
        <ol key={`o${i}`} className="my-1 list-decimal space-y-0.5 pl-5">
          {items.map((t, j) => <li key={j}>{inline(t, `o${i}-${j}`)}</li>)}
        </ol>,
      );
      continue;
    }
    blocks.push(
      line.trim() ? <span key={`p${i}`} className="block">{inline(line, `p${i}`)}</span> : <span key={`p${i}`} className="block h-2" />,
    );
    i += 1;
  }
  return <>{blocks}</>;
}
