import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Loader2, Image as ImageIcon, RefreshCw } from 'lucide-react';
import { useGenerateArtwork } from '@/hooks/useGenerateArtwork';
import { cn } from '@/lib/utils';

interface AIArtworkProps {
  songTitle: string;
  artistName: string;
  fallbackImage?: string;
  className?: string;
  showGenerateButton?: boolean;
}

export function AIArtwork({
  songTitle,
  artistName,
  fallbackImage,
  className,
  showGenerateButton = true,
}: AIArtworkProps) {
  const { imageUrl, isLoading, error, generateArtwork } = useGenerateArtwork(songTitle, artistName);
  const [showFallback, setShowFallback] = useState(true);

  const handleGenerate = async () => {
    setShowFallback(false);
    await generateArtwork();
  };

  return (
    <div className={cn("relative aspect-square overflow-hidden rounded-xl", className)}>
      <AnimatePresence mode="wait">
        {isLoading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-primary/20 to-cyan-400/20"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            >
              <Loader2 className="w-8 h-8 text-primary" />
            </motion.div>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="text-xs text-muted-foreground mt-2"
            >
              Creating artwork...
            </motion.p>
            {/* Animated background particles */}
            <div className="absolute inset-0 pointer-events-none">
              {[...Array(5)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute w-2 h-2 rounded-full bg-primary/30"
                  style={{
                    left: `${20 + i * 15}%`,
                    top: `${30 + (i % 3) * 20}%`,
                  }}
                  animate={{
                    y: [0, -20, 0],
                    opacity: [0.3, 0.7, 0.3],
                  }}
                  transition={{
                    duration: 1.5,
                    delay: i * 0.2,
                    repeat: Infinity,
                  }}
                />
              ))}
            </div>
          </motion.div>
        ) : imageUrl && !showFallback ? (
          <motion.div
            key="generated"
            initial={{ opacity: 0, scale: 1.1 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="relative w-full h-full"
          >
            <img
              src={imageUrl}
              alt={`AI generated artwork for ${songTitle}`}
              className="w-full h-full object-contain"
              onError={() => setShowFallback(true)}
            />
            {/* AI badge */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full glass text-[10px] text-primary font-medium"
            >
              <Sparkles className="w-3 h-3" />
              AI Art
            </motion.div>
          </motion.div>
        ) : (
          <motion.div
            key="fallback"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative w-full h-full"
          >
            {fallbackImage ? (
              <img
                src={fallbackImage}
                alt={songTitle}
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-primary/30 via-secondary to-cyan-400/20 flex items-center justify-center">
                <ImageIcon className="w-8 h-8 text-muted-foreground/50" />
              </div>
            )}
            
            {/* Generate button overlay */}
            {showGenerateButton && (
              <motion.button
                onClick={handleGenerate}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="absolute inset-0 flex flex-col items-center justify-center bg-background/60 backdrop-blur-sm opacity-0 hover:opacity-100 transition-opacity duration-300"
              >
                <motion.div
                  className="p-3 rounded-full bg-gradient-to-br from-primary to-cyan-400 shadow-glow"
                  whileHover={{ rotate: 180 }}
                  transition={{ duration: 0.3 }}
                >
                  <Sparkles className="w-5 h-5 text-primary-foreground" />
                </motion.div>
                <span className="text-xs font-medium text-foreground mt-2">Generate AI Art</span>
              </motion.button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error state with retry */}
      {error && !isLoading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute bottom-2 left-2 right-2 flex items-center justify-between gap-2 px-2 py-1 rounded-lg bg-destructive/20 border border-destructive/30"
        >
          <span className="text-[10px] text-destructive truncate">{error}</span>
          <button
            onClick={handleGenerate}
            className="p-1 rounded hover:bg-destructive/20 transition-colors"
          >
            <RefreshCw className="w-3 h-3 text-destructive" />
          </button>
        </motion.div>
      )}
    </div>
  );
}
