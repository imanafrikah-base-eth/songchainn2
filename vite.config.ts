import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    port: 5173,
    host: true,
    strictPort: true,
    open: true,
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
        // Single-vendor strategy. Earlier attempt to split chunks per package
        // family caused a "Cannot read properties of undefined (reading
        // 'forwardRef')" error in production because some chunks resolved
        // their React import before the React chunk had finished evaluating.
        // We're back on a single vendor blob until the split can be reworked
        // with React + react-dom + scheduler co-located and load order
        // verified on staging.
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          return 'vendor';
        },
      },
    },
  },
  plugins: [
    {
      name: "dev-upload-image-mock",
      apply: "serve",
      configureServer(server) {
        server.middlewares.use("/api/upload/image", (req: any, res: any) => {
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
        server.middlewares.use("/api/livekit-token", async (req: any, res: any) => {
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
              req.on("data", (chunk: Buffer | string) => {
                data += chunk.toString();
              });
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

            const tokenData = await response.json() as Record<string, unknown>;
            
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
    dedupe: ["react", "react-dom"],
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
