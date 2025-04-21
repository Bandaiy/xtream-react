import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Behalte hier deine anderen Konfigurationsoptionen bei, falls vorhanden */
  /* Beispiel: reactStrictMode ist oft standardmäßig aktiviert */
  reactStrictMode: true,

  /**
   * Konfiguriert URL-Rewrites. Dies wird oft als Proxy während der Entwicklung verwendet,
   * um CORS-Probleme zu umgehen. Anfragen an den 'source'-Pfad (in unserer App) werden
   * im Hintergrund an den 'destination'-Pfad (die externe API) weitergeleitet.
   */
  async rewrites() {
    return [
      {
        // Der Pfad, den deine Frontend-Anwendung aufrufen wird (z.B. /api/xtream/player_api.php?...)
        // Das ':path*' fängt alles nach /api/xtream/ auf (inkl. Query-Parameter).
        source: '/api/xtream/:path*',

        // Die tatsächliche Ziel-URL, an die die Anfrage weitergeleitet wird.
        // Wir verwenden hier HTTP, wie gewünscht.
        // Das ':path*' am Ende fügt den aufgefangenen Pfad und die Parameter wieder an.
        destination: 'http://URL/:path*',
      },
    ];
  },

  // Hier können weitere Next.js-Konfigurationen folgen
  // z.B. images, env, webpack Anpassungen etc.
};

export default nextConfig;