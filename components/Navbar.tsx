// components/Navbar.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tv, Clapperboard, Film } from 'lucide-react';

const navItems = [
    { href: '/dashboard', label: 'Live TV', icon: Tv },
    { href: '/dashboard/movies', label: 'Movies', icon: Film },
    { href: '/dashboard/series', label: 'Series', icon: Clapperboard },
];

export default function Navbar() {
    const pathname = usePathname();
    const currentPath = pathname ?? '/dashboard';

    const activeTab =
        navItems.find(item => currentPath === item.href)?.href ||
        (currentPath.startsWith('/dashboard/movies') ? '/dashboard/movies' : null) ||
        (currentPath.startsWith('/dashboard/series') ? '/dashboard/series' : null) ||
        '/dashboard';

    return (
        // Header nimmt volle Breite
        <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            {/* Container zentriert sich selbst auf großen Schirmen und hat Padding */}
            {/* WICHTIG: KEIN justify-center hier! */}
            <div className="container mx-auto flex h-14 items-center px-4 md:px-6">
                 {/* Optional: Platzhalter links, wenn benötigt */}
                 {/* <div className="flex-none w-16 md:w-24"></div> */}

                {/* Tabs WIRD HIER MIT mx-auto ZENTRIERT */}
                <Tabs value={activeTab} className="w-full max-w-md mx-auto"> {/* <-- DAS IST ENTSCHEIDEND */}
                    <TabsList className="grid w-full grid-cols-3">
                        {navItems.map((item) => (
                            <TabsTrigger value={item.href} key={item.href} asChild>
                                <Link href={item.href} className="flex items-center justify-center gap-1.5">
                                    <item.icon className="h-4 w-4 flex-shrink-0" />
                                    <span>{item.label}</span>
                                </Link>
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>

                 {/* Optional: Platzhalter rechts, symmetrisch zum linken */}
                 {/* <div className="flex-none w-16 md:w-24"></div> */}
            </div>
        </header>
    );
}