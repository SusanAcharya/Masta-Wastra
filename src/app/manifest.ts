import type { MetadataRoute } from "next";
import { copy } from "@/lib/copy";

// Served at /manifest.webmanifest (prompt 11). Colours: linen-shop --bg and --surface.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: copy.app.name,
    short_name: copy.app.shortName,
    description: copy.app.description,
    id: "/",
    start_url: "/today?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#efe7dc",
    theme_color: "#f8f2e8",
    categories: ["lifestyle", "shopping"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Add a piece", short_name: "Add", url: "/scan", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Today's outfits", short_name: "Outfits", url: "/today", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
