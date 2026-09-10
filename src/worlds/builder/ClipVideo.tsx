// Cut a short silent loop out of a longer video, on the phone, before it
// uploads.
//
// IMan's world moves because every loop was cut to a few seconds by hand.
// Any artist can now do the same from the builder: pick where the loop
// starts, how long it runs, watch it go round, and cut. The cut is made in
// the browser by playing the chosen stretch through a canvas and recording
// it, so nothing but the clip ever leaves the phone. Sound is dropped on
// purpose: world loops play muted everywhere.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Scissors, Film } from 'lucide-react';
import { Button } from '@/components/ui/button';

const LENGTHS = [3, 5, 8, 12] as const;
const MAX_WIDTH = 1280;

/** True when this browser can record a canvas to a video file. */
export function canClipVideo(): boolean {
  if (typeof window === 'undefined') return false;
  const canvas = document.createElement('canvas') as HTMLCanvasElement & { captureStream?: unknown };
  return typeof MediaRecorder !== 'undefined' && typeof canvas.captureStream === 'function';
}

function pickMime(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const m of ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return null;
}

function mmss(s: number): string {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

export function ClipVideo({
  file,
  onDone,
}: {
  file: File;
  /** The cut clip, the whole file when they chose that, or null when they backed out. */
  onDone: (result: File | null) => void;
}) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);
  const [length, setLength] = useState<number>(5);
  const [cutting, setCutting] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const supported = canClipVideo();

  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  const end = Math.min(duration || Infinity, start + length);

  // Preview: play the chosen stretch round and round.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !duration || cutting !== null) return;
    v.currentTime = start;
    void v.play().catch(() => undefined);
    const onTime = () => {
      if (v.currentTime >= end - 0.05) v.currentTime = start;
    };
    v.addEventListener('timeupdate', onTime);
    return () => v.removeEventListener('timeupdate', onTime);
  }, [start, end, duration, cutting]);

  const cut = async () => {
    const v = videoRef.current;
    const mime = pickMime();
    if (!v || !mime || !supported) {
      setError('This browser cannot cut video. Use the whole video, or cut it on a computer.');
      return;
    }
    setError(null);
    setCutting(0);
    try {
      const scale = Math.min(1, MAX_WIDTH / (v.videoWidth || MAX_WIDTH));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round((v.videoWidth || 1280) * scale);
      canvas.height = Math.round((v.videoHeight || 720) * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no canvas');
      const stream = (canvas as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream }).captureStream(30);
      const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });

      v.pause();
      v.muted = true;
      v.currentTime = start;
      await new Promise<void>((resolve) => {
        const onSeek = () => { v.removeEventListener('seeked', onSeek); resolve(); };
        v.addEventListener('seeked', onSeek);
      });
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      recorder.start(250);
      await v.play();

      let frame = 0;
      await new Promise<void>((resolve) => {
        const tick = () => {
          ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
          setCutting(Math.min(99, Math.round(((v.currentTime - start) / length) * 100)));
          if (v.currentTime >= end || v.ended) {
            resolve();
            return;
          }
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      });
      cancelAnimationFrame(frame);
      v.pause();
      recorder.stop();
      await stopped;
      stream.getTracks().forEach((t) => t.stop());

      const blob = new Blob(chunks, { type: mime.split(';')[0] });
      if (blob.size < 1000) throw new Error('empty');
      const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
      const base = file.name.replace(/\.[^.]+$/, '') || 'loop';
      onDone(new File([blob], `${base}-loop.${ext}`, { type: blob.type }));
    } catch (err) {
      console.error('clip failed', err);
      setError('The cut did not come out. Try a shorter stretch, or use the whole video.');
      setCutting(null);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2 flex items-center gap-2">
        <Scissors className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold text-foreground">Cut a loop from this video</p>
      </div>
      <p className="mb-2 text-xs text-muted-foreground">
        A few seconds that go round is what makes a world move. Pick where it starts and how long it runs, watch it loop, then cut. Sound is dropped: loops play silent.
      </p>
      <div className="overflow-hidden rounded-md bg-black/40 aspect-video">
        <video
          ref={videoRef}
          src={url}
          muted
          playsInline
          preload="auto"
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
          className="h-full w-full object-contain"
        />
      </div>
      {duration > 0 && (
        <div className="mt-3 space-y-2">
          <label className="block text-xs text-muted-foreground">
            Starts at <span className="font-mono text-foreground">{mmss(start)}</span> of {mmss(duration)}
            <input
              type="range"
              min={0}
              max={Math.max(0, duration - 1)}
              step={0.1}
              value={start}
              disabled={cutting !== null}
              onChange={(e) => setStart(Math.min(Number(e.target.value), Math.max(0, duration - 1)))}
              className="mt-1 w-full accent-[hsl(var(--primary))]"
              aria-label="Clip start"
            />
          </label>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Runs for</span>
            {LENGTHS.map((l) => (
              <button
                key={l}
                type="button"
                disabled={cutting !== null || l > duration}
                onClick={() => setLength(l)}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${length === l ? 'bg-primary text-primary-foreground' : 'border border-border text-foreground'} disabled:opacity-40`}
              >
                {l}s
              </button>
            ))}
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Button type="button" size="sm" className="h-10 rounded-full text-xs" disabled={!duration || cutting !== null || !supported} onClick={() => void cut()}>
          {cutting !== null ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Scissors className="mr-1 h-3.5 w-3.5" />}
          {cutting !== null ? `Cutting ${cutting}%` : 'Cut this loop'}
        </Button>
        <Button type="button" size="sm" variant="outline" className="h-10 rounded-full text-xs" disabled={cutting !== null} onClick={() => onDone(file)}>
          <Film className="mr-1 h-3.5 w-3.5" /> Use the whole video
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-10 rounded-full text-xs" disabled={cutting !== null} onClick={() => onDone(null)}>
          Cancel
        </Button>
      </div>
      {!supported && (
        <p className="mt-2 text-xs text-muted-foreground">This browser cannot cut video. The whole video still works as a loop.</p>
      )}
    </div>
  );
}
