/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Optional: URL of the realtime server for a split deploy (Vercel client +
  // Render/Railway server). Unset = same-origin (single-host deploy).
  readonly VITE_SERVER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
