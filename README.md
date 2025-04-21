# Modern Xtream Codes Web Client 📺

Ein moderner, reaktionsfähiger Web-Client, der mit Next.js, TypeScript und shadcn/ui erstellt wurde, um Filme und Serien von deinem Xtream Codes kompatiblen IPTV/VOD-Anbieter zu durchsuchen und anzusehen.

![Screenshot Placeholder](http://i.epvpimg.com/FPXnfab.png) <!-- Füge hier einen Link zu einem Screenshot hinzu -->

## ✨ Features

*   **Film- & Serien-Browsing:** Getrennte, übersichtliche Seiten für Filme und Serien.
*   **Erweiterte Filterung:** Filtere Inhalte nach Genre/Kategorie, Mindestbewertung und suche nach Titeln.
*   **Performante Listen:** Verwendet `@tanstack/react-virtual` für reibungsloses Scrollen durch große Bibliotheken.
*   **Integrierter Player:** Spielt Streams direkt in der App mit `ReactPlayer` ab.
*   **Authentifizierung:** Sichere Anmeldung über `next-auth` mit deinen Xtream-Anmeldedaten.
*   **Moderne UI:** Saubere und ansprechende Benutzeroberfläche dank `shadcn/ui` und Tailwind CSS.
*   **Responsive Design:** Funktioniert auf Desktops und mobilen Geräten.

## 🛠️ Tech Stack

*   **Framework:** [Next.js](https://nextjs.org/) (App Router)
*   **Sprache:** [TypeScript](https://www.typescriptlang.org/)
*   **Styling:** [Tailwind CSS](https://tailwindcss.com/)
*   **UI Komponenten:** [shadcn/ui](https://ui.shadcn.com/)
*   **State Management:** React Context
*   **Datenabruf:** [Axios](https://axios-http.com/) / React Query (optional)
*   **Datenbank:** [Prisma SQLite 3](https://github.com/prisma/prisma)
*   **Authentifizierung:** [NextAuth.js](https://next-auth.js.org/)
*   **Video Player:** [ReactPlayer](https://github.com/CookPete/react-player)
*   **Virtualisierung:** [@tanstack/react-virtual](https://tanstack.com/virtual/latest)
*   **Package Manager:** [pnpm](https://pnpm.io/)

## 🚀 Getting Started

Folge diesen Schritten, um das Projekt lokal einzurichten und auszuführen.

### Voraussetzungen

*   [Node.js](https://nodejs.org/) (Version 18 oder höher empfohlen)
*   [pnpm](https://pnpm.io/installation)
*   Zugangsdaten zu einem Xtream Codes kompatiblen Anbieter (Server-URL, Benutzername, Passwort)

### Installation & Setup

1.  **Klone das Repository:**
    ```bash
    git clone https://github.com/Bandaiy/xtream-react.git
    cd xtream-react
    ```

2.  **Installiere die Abhängigkeiten mit pnpm:**
    ```bash
    pnpm install
    ```

3.  **Konfiguriere die Umgebungsvariablen:**
    Erstelle eine Datei namens `.env.local` im Hauptverzeichnis des Projekts und füge die folgenden Variablen hinzu. Ersetze die Platzhalterwerte durch deine tatsächlichen Daten.

    ```dotenv
    # .env.local

    # Die Basis-URL deiner Xtream Codes player_api.php
    # Beispiel: http://mein-iptv-anbieter.com:8080
    XTREAM_API_URL=http://DEINE_XTREAM_SERVER_URL:PORT

    # NextAuth Konfiguration
    # Siehe: https://next-auth.js.org/configuration/options#secret
    # Generiere einen sicheren Secret Key, z.B. mit: openssl rand -base64 32
    NEXTAUTH_SECRET=DEIN_SICHERER_NEXTAUTH_SECRET
    NEXTAUTH_URL=http://localhost:3000 # Ändere dies, wenn du einen anderen Port oder Domain verwendest
    ```

    *   `XTREAM_API_URL`: Dies ist die **Basis-URL** zu deiner Xtream Codes API. Die App hängt dann `/player_api.php?...` oder `/movie/...` usw. an. Stelle sicher, dass du hier **keinen** Pfad wie `/player_api.php` hinzufügst.
    *   `NEXTAUTH_SECRET`: Ein zufälliger String, der zur Signierung von Sitzungs-Cookies verwendet wird. Es ist wichtig, dass dieser geheim gehalten wird.
    *   `NEXTAUTH_URL`: Die URL, unter der deine App im Entwicklungsmodus erreichbar ist.

### Den Entwicklungsserver starten

Führe den folgenden Befehl aus, um den Next.js Entwicklungsserver zu starten:

```bash
pnpm dev
