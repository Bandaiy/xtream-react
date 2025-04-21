// app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Providers from '@/components/providers';
import Navbar from "@/components/Navbar";

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

export const metadata: Metadata = {
    title: "IPTV Dashboard",
    description: "Your IPTV Streaming Dashboard",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        // KEIN Leerzeichen oder Kommentar direkt hier drin
        <html lang="de">
            {/* Head wird von Next.js automatisch verwaltet oder über Metadata API */}
            {/* KEIN Leerzeichen oder Kommentar direkt hier drin */}
            <body
                className={`${geistSans.variable} ${geistMono.variable} antialiased flex flex-col h-screen`}
            >
                {/* KEIN Leerzeichen oder Kommentar direkt hier drin */}
                <Providers> {/* Nimmt standardmäßig volle Breite */}
                    <Navbar /> {/* Sollte jetzt intern zentrieren */}
                    <main className="flex-1 overflow-y-auto">
                         {/* Optional: Container für Seiteninhalt, falls benötigt */}
                         <div className="flex-1 overflow-y-auto">
                             {children}
                         </div>
                    </main>
                </Providers>
                {/* KEIN Leerzeichen oder Kommentar direkt hier drin */}
            </body>
             {/* KEIN Leerzeichen oder Kommentar direkt hier drin */}
        </html>
         // KEIN Leerzeichen oder Kommentar direkt hier drin
    );
}