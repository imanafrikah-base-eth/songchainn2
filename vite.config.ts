import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

/**
 * Packages that exist only to render the 3D and VR world, and that nothing
 * outside WorldScene3D imports. Kept out of the eager vendor chunk so they
 * load with the lazy scene instead of on every visit.
 *
 * THIS LIST MUST COVER THE WHOLE three-DEPENDENT SUBTREE, not just the obvious
 * names. A first pass listed only three and @react-three, which did nothing:
 * @monogrid/gainmap-js, @react-spring/three, stats-gl and three-mesh-bvh were
 * left out, so they landed in vendor, and because each of them imports three,
 * three was reachable from the eager chunk and Rollup hoisted it straight back
 * in. One unlisted package is enough to drag the entire renderer along with it.
 *
 * To re-check after adding a 3D dependency: `npm ls three` lists everything
 * that depends on it. Every one of those names belongs here.
 *
 * zustand is deliberately absent. It arrives via @react-three/fiber but is a
 * generic state library, so it stays in vendor where a future shared import
 * cannot break it. Same reasoning for react, react-dom and scheduler.
 */
const IS_3D_ONLY =
  /node_modules[\\/](three|three-stdlib|three-mesh-bvh|@react-three[\\/]|@react-spring[\\/]|@monogrid[\\/]|@use-gesture[\\/]|troika-[a-z-]+|camera-controls|maath|meshline|stats-gl|suspend-react|its-fine|react-reconciler)/;

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
        //
        // The 3D and WebXR stack is the one carve-out, and it is safe for the
        // reason the split above was not. Those packages are reachable ONLY
        // through the lazy import in EnterVR, so Rollup emits them as an async
        // chunk that loads long after React has finished evaluating. There is
        // no eager load order to race. Returning undefined hands placement
        // back to Rollup, which puts them with the dynamic import.
        //
        // Without this they land in the eager vendor blob and every phone
        // downloads about 290 kB gzipped of renderer to look at a flat map.
        // Verified: vendor is ~579 kB gzipped without three, ~871 kB with it.
        //
        // Nothing shared lives here on purpose. React, react-dom, scheduler
        // and zustand stay in vendor, because moving anything the rest of the
        // app also imports would recreate the load-order bug above.
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (IS_3D_ONLY.test(id)) return;
          return 'vendor';
        },
      },
    },
  },
  plugins: [
    {
      // api/img.ts only exists on Vercel, so 3D rooms could not load a single
      // texture in local dev. Same allowlist, same headers, so what is tested
      // here is what ships.
      name: "dev-image-proxy",
      apply: "serve",
      configureServer(server) {
        server.middlewares.use("/api/img", async (req: any, res: any) => {
          try {
            const target = new URL(req.url, "http://localhost").searchParams.get("u");
            if (!target) {
              res.statusCode = 400;
              return res.end("Missing u");
            }
            const url = new URL(target);
            if (url.protocol !== "https:" || !/^pub-[a-z0-9]+\.r2\.dev$/i.test(url.hostname)) {
              res.statusCode = 403;
              return res.end("Host not allowed");
            }
            const upstream = await fetch(url.toString());
            if (!upstream.ok) {
              res.statusCode = 502;
              return res.end("Upstream failed");
            }
            res.setHeader("content-type", upstream.headers.get("content-type") ?? "image/jpeg");
            res.setHeader("access-control-allow-origin", "*");
            res.setHeader("cross-origin-resource-policy", "cross-origin");
            res.end(Buffer.from(await upstream.arrayBuffer()));
          } catch {
            res.statusCode = 500;
            res.end("Proxy error");
          }
        });
      },
    },
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
