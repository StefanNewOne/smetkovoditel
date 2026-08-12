import type { MetadataRoute } from "next";

/**
 * PWA manifest (SM-120). Makes the app installable and gives the Edge --app window our own
 * branding/icon instead of a generic browser icon — so the local launcher feels like a native
 * app. Also improves the hosted version (installable, branded favicon).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Сметководител — GoDigital Finance OS",
    short_name: "Сметководител",
    description: "Интерен финансиски систем на АЛМА ДИЗАЈН ДООЕЛ Скопје",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f8fb",
    theme_color: "#3b76d1",
    lang: "mk",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
