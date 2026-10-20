import type { MetadataRoute } from "next";

/** Op het beginscherm van de telefoon zetten als app (zonder browserbalk). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gewoon Sales Doen",
    short_name: "Sales Doen",
    description: "CRM van Gewoon Doen Marketing",
    start_url: "/crm",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#000000",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
