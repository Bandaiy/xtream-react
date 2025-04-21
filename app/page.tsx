// app/page.tsx
import Link from "next/link"; // Wichtig für interne Navigation
// Image wird nicht mehr benötigt, es sei denn, du möchtest ein Logo hinzufügen
// import Image from "next/image";

export default function Home() {
  return (
    // Hauptcontainer: Zentriert den Inhalt vertikal und horizontal auf dem Bildschirm
    <div className="flex flex-col items-center justify-center min-h-screen p-8 sm:p-20 text-center font-[family-name:var(--font-geist-sans)] bg-gray-50 dark:bg-gray-900">

      {/* Hauptinhaltsbereich */}
      <main className="flex flex-col gap-8 items-center max-w-2xl"> {/* max-w-2xl begrenzt die Breite für bessere Lesbarkeit */}

        {/* Optional: Hier könntest du dein eigenes Logo einfügen */}
        {/* <Image src="/dein-logo.svg" alt="Dein Logo" width={180} height={50} priority className="mb-8"/> */}

        {/* Titel der Seite */}
        <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 dark:text-white">
          Willkommen bei Deinem Xtream IPTV Portal
        </h1>

        {/* Kurze Beschreibung */}
        <p className="text-lg text-gray-600 dark:text-gray-300">
          Melde dich an, um auf dein persönliches Dashboard zuzugreifen und deine IPTV-Streams zu verwalten.
        </p>

        {/* Button-Container */}
        <div className="flex flex-col sm:flex-row gap-4 mt-6"> {/* mt-6 für etwas Abstand nach oben */}

          {/* Login Button */}
          <Link href="/login" legacyBehavior>
            <a className="rounded-md bg-blue-600 px-6 py-3 text-lg font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors duration-200 ease-in-out">
              Anmelden
            </a>
          </Link>

          {/* Dashboard Button */}
          <Link href="/dashboard" legacyBehavior>
            <a className="rounded-md border border-gray-300 dark:border-gray-600 px-6 py-3 text-lg font-semibold text-gray-700 dark:text-gray-200 shadow-sm hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors duration-200 ease-in-out">
              Zum Dashboard
            </a>
          </Link>

        </div>
      </main>

      {/* Optional: Ein einfacher Footer */}
      <footer className="mt-16 text-sm text-gray-500 dark:text-gray-400">
        © {new Date().getFullYear()} Sfabu
      </footer>

    </div>
  );
}