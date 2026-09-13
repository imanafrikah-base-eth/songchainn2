import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, MoreHorizontal } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const ICON_BTN =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** The bar across the top of a thread: back, who it is with, and the options. */
export function ThreadHeader({
  onBack,
  avatar,
  title,
  subtitle,
  profileHref,
  menu,
}: {
  onBack?: () => void;
  avatar: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  profileHref?: string;
  menu?: ReactNode;
}) {
  const who = (
    <>
      {avatar}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold leading-tight text-foreground">{title}</span>
        {subtitle && <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>}
      </span>
    </>
  );

  return (
    <header className="flex min-h-[60px] shrink-0 items-center gap-1 border-b border-border bg-background px-1.5 pt-safe sm:px-3">
      {onBack && (
        <button type="button" onClick={onBack} className={ICON_BTN} aria-label="Back to messages">
          <ArrowLeft size={20} aria-hidden="true" />
        </button>
      )}
      {profileHref ? (
        <Link
          to={profileHref}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-xl px-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {who}
        </Link>
      ) : (
        <div className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 px-1.5">{who}</div>
      )}
      {menu && (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger className={ICON_BTN} aria-label="Conversation options">
            <MoreHorizontal size={20} aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="z-[80] w-52 rounded-xl p-1">
            {menu}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </header>
  );
}
