import type { NextConfig } from "next";

/**
 * Salonfunnels draaien in dit project als statische pagina's onder public/f/<salon>/.
 * Eigen domein per salon: zet het domein hieronder en koppel het in Vercel aan dit project.
 */
const FUNNEL_DOMEINEN: Record<string, string> = {
  "uvacare.afspraakmaken.com": "uvacare",
};

const nextConfig: NextConfig = {
  async rewrites() {
    const domeinen = Object.entries(FUNNEL_DOMEINEN).flatMap(([host, salon]) => [
      { source: "/", has: [{ type: "host" as const, value: host }], destination: `/f/${salon}/index.html` },
      { source: "/:pagina([a-z0-9-]+)", has: [{ type: "host" as const, value: host }], destination: `/f/${salon}/:pagina.html` },
    ]);
    return {
      beforeFiles: [
        ...domeinen,
        { source: "/f/:salon([a-z0-9-]+)", destination: "/f/:salon/index.html" },
        { source: "/f/:salon([a-z0-9-]+)/:pagina([a-z0-9-]+)", destination: "/f/:salon/:pagina.html" },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
