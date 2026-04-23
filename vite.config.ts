import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    port: 5173,
    host: true,
    strictPort: true,
  },
  esbuild: {
    sourcemap: false,
  },
  optimizeDeps: {
    esbuildOptions: {
      sourcemap: false,
    },
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          // Core React — always needed, cached aggressively
          if (id.includes('react-dom') || id.includes('react-router') || id.includes('/react/')) {
            return 'vendor-react';
          }
          // Animation — needed on most pages
          if (id.includes('framer-motion')) {
            return 'vendor-motion';
          }
          // Supabase — needed on most pages
          if (id.includes('@supabase')) {
            return 'vendor-supabase';
          }
          // Server-state — small, needed at app root (QueryClientProvider in main.tsx)
          if (id.includes('@tanstack')) {
            return 'vendor-query';
          }
          // Wagmi core — needed at root (WagmiProvider in main.tsx)
          if (
            id.includes('wagmi') ||
            id.includes('/viem/') ||
            id.includes('@wagmi') ||
            id.includes('web3modal') ||
            id.includes('walletconnect') ||
            id.includes('@walletconnect')
          ) {
            return 'vendor-web3';
          }
          // Coinbase OnchainKit — only used on Auth/Marketplace pages (lazy)
          if (id.includes('@coinbase') || id.includes('onchainkit')) {
            return 'vendor-coinbase';
          }
          // LiveKit — only used in Room page (lazy)
          if (id.includes('livekit') || id.includes('@livekit')) {
            return 'vendor-livekit';
          }
          // UI primitives — needed on most pages
          if (id.includes('@radix-ui') || id.includes('lucide-react')) {
            return 'vendor-ui';
          }
          // Date utils — small, lazy (only pages that format dates)
          if (id.includes('date-fns')) {
            return 'vendor-date';
          }
          return 'vendor-misc';
        },
      },
    },
  },
  plugins: [
    {
      name: "dev-upload-image-mock",
      apply: "serve",
      configureServer(server) {
        server.middlewares.use("/api/upload/image", (req: any, res: any, next: any) => {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Method not allowed" }));
            return;
          }

          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              url: "https://placehold.co/800x800/png",
              path: "dev-placeholder",
              key: "dev-placeholder",
            })
          );
        });
      },
    },
    {
      name: "dev-livekit-token",
      apply: "serve",
      configureServer(server) {
        server.middlewares.use("/api/livekit-token", async (req: any, res: any, next: any) => {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Method not allowed" }));
            return;
          }

          try {
            // Parse request body
            const body = await new Promise((resolve, reject) => {
              let data = "";
              req.on("data", chunk => data += chunk);
              req.on("end", () => {
                try {
                  resolve(JSON.parse(data));
                } catch (e) {
                  reject(e);
                }
              });
              req.on("error", reject);
            });

            const { roomId, userId, participantName } = body as any;

            if (!roomId || !userId || !participantName) {
              res.statusCode = 400;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "Missing required fields" }));
              return;
            }

            // Call our local LiveKit server
            const response = await fetch("http://localhost:7880/token", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                roomName: roomId,
                participantName,
                userId,
              }),
            });

            if (!response.ok) {
              throw new Error(`LiveKit server error: ${response.status}`);
            }

            const tokenData = await response.json();
            
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({
              ...tokenData,
              wsUrl: `ws://localhost:7881`, // Use our local WebSocket server
              role: "participant",
            }));
          } catch (error) {
            console.error("LiveKit token error:", error);
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ 
              error: "Failed to generate LiveKit token",
              details: error instanceof Error ? error.message : "Unknown error"
            }));
          }
        });
      },
    },
    react(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
