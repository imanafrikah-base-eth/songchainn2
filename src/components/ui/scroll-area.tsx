import * as React from "react";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";

import { cn } from "@/lib/utils";

/**
 * WHY THE VIEWPORT INHERITS max-height.
 *
 * Every call site in this app caps the Root with a max-height (max-h-[480px],
 * max-h-80, and so on) rather than a fixed height, which is the sane thing to
 * write: a short list should not leave a tall empty box under it.
 *
 * But the viewport was only h-full, and a percentage height against an
 * auto-height parent computes to auto. So the viewport grew to the full height
 * of its content, never became a scroller, and the Root's overflow-hidden
 * simply sliced the rest off. Nine lists in this app were quietly losing their
 * tails: notifications, catalog tracks, playlists, profile, song credits. No
 * scrollbar, no fade, no hint that anything was missing, which is the worst
 * possible way for content to go: nobody can report a bug they cannot see.
 *
 * max-h-[inherit] hands the Root's cap to the viewport, so the viewport itself
 * is the constrained box and Radix's own overflow makes it scroll. Short lists
 * still shrink, because it is a maximum and not a height.
 */
const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>
>(({ className, children, ...props }, ref) => (
  <ScrollAreaPrimitive.Root ref={ref} className={cn("relative overflow-hidden", className)} {...props}>
    <ScrollAreaPrimitive.Viewport className="h-full max-h-[inherit] w-full rounded-[inherit]">{children}</ScrollAreaPrimitive.Viewport>
    <ScrollBar />
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaPrimitive.Root>
));
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName;

const ScrollBar = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({ className, orientation = "vertical", ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    orientation={orientation}
    className={cn(
      "flex touch-none select-none transition-colors",
      orientation === "vertical" && "h-full w-2.5 border-l border-l-transparent p-[1px]",
      orientation === "horizontal" && "h-2.5 flex-col border-t border-t-transparent p-[1px]",
      className,
    )}
    {...props}
  >
    <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-border" />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
));
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName;

export { ScrollArea, ScrollBar };
