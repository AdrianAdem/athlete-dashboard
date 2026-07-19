import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const isDemo = process.env.VITE_DEMO === "1";

export default defineConfig({
  base: "/athlete-dashboard/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "./src") },
      // Outside demo builds, resolve the demo client to an inert stub so the
      // fixture data is never bundled for real users.
      ...(isDemo
        ? []
        : [
            {
              find: /^\.\/demo-client$/,
              replacement: path.resolve(__dirname, "./src/lib/demo-client.noop.ts"),
            },
          ]),
    ],
  },
  server: {
    host: true,
    proxy: {
      // In dev: proxy /api/chat to Supabase Edge Function
      "/api/chat": {
        target: process.env.VITE_SUPABASE_URL
          ? `${process.env.VITE_SUPABASE_URL}/functions/v1/chat`
          : "http://localhost:54321/functions/v1/chat",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/chat/, ""),
      },
      // Food lookup Edge Function
      "/api/food": {
        target: process.env.VITE_SUPABASE_URL
          ? `${process.env.VITE_SUPABASE_URL}/functions/v1/food-lookup`
          : "http://localhost:54321/functions/v1/food-lookup",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/food/, ""),
      },
    },
  },
});
