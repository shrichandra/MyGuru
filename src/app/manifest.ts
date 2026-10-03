import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MyGuru",
    short_name: "MyGuru",
    description: "Your daily guide to the one next right thing.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f7f9",
    theme_color: "#12213a",
    orientation: "portrait",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [{ name: "Quick log", url: "/?log=1" }],
  };
}
