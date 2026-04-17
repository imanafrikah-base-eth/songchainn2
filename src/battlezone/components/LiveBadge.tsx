const LiveBadge = ({ className = "" }: { className?: string }) => (
  <span className={`inline-flex items-center gap-1.5 rounded-full bg-live/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-live ${className}`}>
    <span className="h-2 w-2 rounded-full bg-live pulse-live" />
    Live
  </span>
);

export default LiveBadge;
