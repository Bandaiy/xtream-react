'use client'

import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useSession, signOut } from 'next-auth/react'
import axios from 'axios'
import ReactPlayer from 'react-player/lazy'
import { format, parseISO, fromUnixTime } from 'date-fns' // Zum Formatieren von Daten

// Shadcn UI Components & Icons
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { AspectRatio } from '@/components/ui/aspect-ratio'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card" // Card für EPG
import { Separator } from "@/components/ui/separator" // Separator für EPG
import { Skeleton } from "@/components/ui/skeleton" // Skeleton für Ladeanzeige
import { CalendarClock } from 'lucide-react'; // Icon für EPG
import {
    Search, Tv, LogOut, AlertCircle, Loader2, XCircle,
    Heart, Clock, Globe
} from 'lucide-react'

// ----- Interfaces -----
interface Channel {
    num: number
    name: string
    stream_type: string
    stream_id: number
    stream_icon: string
    epg_channel_id: string | null // Wichtig für EPG
    added: string
    category_id: string
    custom_sid: string | null
    tv_archive: number
    direct_source: string
    tv_archive_duration: number
}

interface Category {
    category_id: string
    category_name: string
    parent_id: number
}

// Interface für die PARSIERTEN EPG-Daten
interface EpgEntry {
    id: string; // Eindeutige ID des EPG-Eintrags
    epg_id: string;
    title: string | null; // Kann nach Dekodierung null sein
    lang: string | null;
    start: string; // Zeitstempel als String (z.B. "YYYY-MM-DD HH:MM:SS") oder Unix-Timestamp
    end: string;   // Zeitstempel als String oder Unix-Timestamp
    description: string | null; // Kann nach Dekodierung null sein
    channel_id: string;
    start_timestamp: string; // Unix timestamp string
    stop_timestamp: string;  // Unix timestamp string
    // Möglicherweise weitere Felder, je nach API
    now_playing?: number; // 0 oder 1
    has_archive?: number; // 0 oder 1
}

// Interface für die ROHEN EPG-Daten von der API (vor Base64-Dekodierung etc.)
interface RawEpgListing {
    id: string;
    epg_id: string;
    title: string; // Potenziell Base64
    lang: string | null;
    start: string;
    end: string;
    description: string | null; // Potenziell Base64
    channel_id: string;
    start_timestamp: string;
    stop_timestamp: string;
    now_playing?: number;
    has_archive?: number;
    // Füge hier ggf. weitere Felder hinzu, die die API liefert
}

// NEU: Interface für EPG-Daten NACH Verarbeitung (mit Millisekunden-Timestamps)
interface ProcessedEpgEntry extends EpgEntry {
    startMs: number;
    stopMs: number;
}

// ----- Typen -----
type FilterViewType = 'all' | 'favorites' | 'recent';

// ----- Konstanten -----
const MAX_RECENT_CHANNELS = 10;
const LOCALSTORAGE_FAVORITES_KEY = 'iptv_favorites';
const LOCALSTORAGE_RECENT_KEY = 'iptv_recent_channels';

export default function DashboardPage() {
    const { data: session, status } = useSession()
    const [channels, setChannels] = useState<Channel[]>([])
    const [categories, setCategories] = useState<Category[]>([])
    const [selectedCategory, setSelectedCategory] = useState<string>('all')
    const [searchTerm, setSearchTerm] = useState<string>('')
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [selectedStreamUrl, setSelectedStreamUrl] = useState<string | null>(null)
    const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null)
    const [playerError, setPlayerError] = useState<string | null>(null)

    // --- Filter States ---
    const [filterView, setFilterView] = useState<FilterViewType>('all');
    const [favorites, setFavorites] = useState<Set<number>>(new Set());
    const [recentChannelIds, setRecentChannelIds] = useState<number[]>([]);
    const [categoryFilterTerm, setCategoryFilterTerm] = useState<string>('');

    // --- EPG States ---
    const [epgData, setEpgData] = useState<EpgEntry[]>([]);
    const [isEpgLoading, setIsEpgLoading] = useState<boolean>(false);
    const [epgError, setEpgError] = useState<string | null>(null);

    const playerWrapperRef = useRef<HTMLDivElement>(null);

    // --- Lade/Speichere Effekte (LocalStorage) ---
    useEffect(() => {
        try {
            const storedFavorites = localStorage.getItem(LOCALSTORAGE_FAVORITES_KEY);
            if (storedFavorites) {
                const parsedFavorites: number[] = JSON.parse(storedFavorites);
                if(Array.isArray(parsedFavorites)) {
                    setFavorites(new Set(parsedFavorites));
                } else {
                    console.warn("Stored favorites format incorrect, resetting.");
                    localStorage.removeItem(LOCALSTORAGE_FAVORITES_KEY);
                }
            }
            const storedRecent = localStorage.getItem(LOCALSTORAGE_RECENT_KEY);
            if (storedRecent) {
                const parsedRecent: number[] = JSON.parse(storedRecent);
                if(Array.isArray(parsedRecent)) {
                    setRecentChannelIds(parsedRecent);
                } else {
                    console.warn("Stored recent channels format incorrect, resetting.");
                    localStorage.removeItem(LOCALSTORAGE_RECENT_KEY);
                }
            }
        } catch (e) { console.error("Error loading data from localStorage:", e); }
    }, []);

    useEffect(() => {
        try { localStorage.setItem(LOCALSTORAGE_FAVORITES_KEY, JSON.stringify(Array.from(favorites))); }
        catch (e) { console.error("Error saving favorites to localStorage:", e); }
    }, [favorites]);

    useEffect(() => {
        try { localStorage.setItem(LOCALSTORAGE_RECENT_KEY, JSON.stringify(recentChannelIds)); }
        catch (e) { console.error("Error saving recent channels to localStorage:", e); }
    }, [recentChannelIds]);

    // --- Daten Ladeeffekt ---
    useEffect(() => {
        const fetchXtreamData = async () => {
            if (status !== 'authenticated' || !session?.user?.name || !session?.user?.password) {
                setIsLoading(false); return;
            }
            setIsLoading(true); setError(null); setChannels([]); setCategories([]);
            const { name: username, password } = session.user;

            try {
                const categoriesUrl = `/api/xtream/player_api.php?username=${username}&password=${password}&action=get_live_categories`;
                const channelsUrl = `/api/xtream/player_api.php?username=${username}&password=${password}&action=get_live_streams`;
                const [categoriesResponse, channelsResponse] = await Promise.all([
                    axios.get(categoriesUrl), axios.get(channelsUrl)
                ]);

                if (categoriesResponse.data && Array.isArray(categoriesResponse.data)) {
                    const sortedCategories = [...categoriesResponse.data].sort((a, b) => a.category_name.localeCompare(b.category_name));
                    setCategories(sortedCategories);
                } else { setCategories([]); }

                if (channelsResponse.data && Array.isArray(channelsResponse.data)) {
                    setChannels(channelsResponse.data);
                } else { setChannels([]); }

                if (!channelsResponse.data || !Array.isArray(channelsResponse.data) || channelsResponse.data.length === 0) {
                    if (!categoriesResponse.data || !Array.isArray(categoriesResponse.data) || categoriesResponse.data.length === 0) {
                       throw new Error('Fehler beim Laden der Sender oder Kategorien oder ungültiges Format.');
                    } else {
                        setError('Keine Sender gefunden, aber Kategorien wurden geladen.');
                    }
                }
                 if(channelsResponse.data?.length === 0 && categoriesResponse.data?.length === 0) {
                    setError('Keine Sender oder Kategorien gefunden.');
                }
            } catch (err) {
                console.error('Error fetching Xtream data via proxy:', err);
                setError(err instanceof Error ? `Fehler über Proxy: ${err.message}` : 'Unbekannter Fehler beim Laden der Daten über Proxy.');
                setChannels([]); setCategories([]);
            } finally { setIsLoading(false); }
        };
        if (status === 'authenticated') fetchXtreamData();
        else if (status === 'unauthenticated') setIsLoading(false);
    }, [status, session?.user?.name, session?.user?.password]);

    // --- Hilfsfunktion zum Dekodieren von Base64 ---
    const tryDecodeBase64 = (encoded: string | null | undefined): string | null => {
        if (!encoded) return null;
        try {
             if (/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded.replace(/\s/g, ''))) {
                 const decoded = atob(encoded);
                 if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(decoded)) {
                    console.warn(`Decoded string might contain control characters, returning original: "${encoded}"`);
                    return encoded;
                 }
                 return decoded;
            }
            return encoded;
        } catch (e) {
            console.warn(`Failed to decode Base64 string: "${encoded}". Error:`, e);
            return encoded;
        }
    };

    // --- Funktion zum Abrufen von EPG-Daten ---
    const fetchEpgData = useCallback(async (streamId: number) => {
        if (status !== 'authenticated' || !session?.user?.name || !session?.user?.password) return;

        setIsEpgLoading(true);
        setEpgError(null);
        setEpgData([]);

        const { name: username, password } = session.user;
        const epgUrl = `/api/xtream/player_api.php?username=${username}&password=${password}&action=get_short_epg&stream_id=${streamId}`;

        try {
            console.log('Fetching EPG for stream_id:', streamId);
            const response = await axios.get<{ epg_listings: RawEpgListing[] }>(epgUrl);
            console.log('EPG API Response:', response.data);

            if (response.data && Array.isArray(response.data.epg_listings) && response.data.epg_listings.length > 0) {
                 const parsedEpg = response.data.epg_listings.map((entry: RawEpgListing): EpgEntry => ({
                    id: entry.id,
                    epg_id: entry.epg_id,
                    lang: entry.lang,
                    start: entry.start,
                    end: entry.end,
                    channel_id: entry.channel_id,
                    start_timestamp: entry.start_timestamp,
                    stop_timestamp: entry.stop_timestamp,
                    now_playing: entry.now_playing,
                    has_archive: entry.has_archive,
                    title: tryDecodeBase64(entry.title),
                    description: tryDecodeBase64(entry.description),
                 })).filter(entry => entry.title !== null);
                 setEpgData(parsedEpg);
            } else {
                console.log('No EPG listings found or invalid format for stream_id:', streamId);
                setEpgData([]);
            }
        } catch (err) {
            console.error('Error fetching EPG data:', err);
            setEpgError(err instanceof Error ? `EPG Fehler: ${err.message}` : 'Unbekannter EPG Fehler.');
            setEpgData([]);
        } finally {
            setIsEpgLoading(false);
        }
    }, [status, session?.user?.name, session?.user?.password]);

    // --- Kürzlich gesehen hinzufügen ---
    const addRecentChannel = useCallback((channelId: number) => {
        setRecentChannelIds(prev => {
            const filteredRecents = prev.filter(id => id !== channelId);
            const updatedRecents = [channelId, ...filteredRecents];
            return updatedRecents.slice(0, MAX_RECENT_CHANNELS);
        });
    }, []);

    // --- Event Handlers ---
    const handleChannelClick = useCallback((channel: Channel) => {
        if (session?.user?.name && session?.user?.password) {
            const { name: username, password } = session.user
            const streamUrl = `/api/xtream/live/${username}/${password}/${channel.stream_id}.m3u8`
            setSelectedStreamUrl(streamUrl);
            setSelectedChannel(channel);
            setPlayerError(null);
            addRecentChannel(channel.stream_id);
            fetchEpgData(channel.stream_id);

            if (window.innerWidth < 768 && playerWrapperRef.current) {
                 playerWrapperRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    }, [session, addRecentChannel, fetchEpgData]);

    const handlePlayerError = (err: unknown) => {
        console.error('Video Player Error:', err);
        let message = 'Unbekannter Fehler beim Laden des Videos.';
        if (err instanceof Error) { message = err.message; }
        else if (typeof err === 'string') { message = err; }
        else if (typeof err === 'object' && err !== null) {
            const errorObj = err as { type?: string; data?: { details?: string, type?: string, code?: number | string }; message?: string; code?: number | string; nativeError?: Error };
            if (errorObj.data?.details) { message = `Detail: ${errorObj.data.details}`; }
            else if (errorObj.message) { message = errorObj.message; }
            else if (errorObj.type) { message = `Fehlertyp: ${errorObj.type}`; }
            else if (errorObj.code) { message = `Fehlercode: ${errorObj.code}`; }
            else if (errorObj.nativeError instanceof Error) { message = errorObj.nativeError.message; }
        }
        setPlayerError(`Stream konnte nicht geladen werden. (${message})`);
     }

    const closePlayer = () => {
        setSelectedStreamUrl(null);
        setPlayerError(null);
        setSelectedChannel(null);
        setEpgData([]);
        setIsEpgLoading(false);
        setEpgError(null);
    }

    const toggleFavorite = useCallback((streamId: number, event: React.MouseEvent) => {
        event.stopPropagation();
        setFavorites(prev => {
            const newFavorites = new Set(prev);
            if (newFavorites.has(streamId)) newFavorites.delete(streamId);
            else newFavorites.add(streamId);
            return newFavorites;
        });
     }, []);

    // --- Hilfsfunktionen für Filter und Kategorien ---
    const channelsInCurrentView = useMemo(() => {
        if (filterView === 'favorites') return channels.filter(c => favorites.has(c.stream_id));
        if (filterView === 'recent') {
            const recentChannelsMap = new Map(channels.map(c => [c.stream_id, c]));
            return recentChannelIds
                .map(id => recentChannelsMap.get(id))
                .filter((c): c is Channel => c !== undefined);
        }
        return channels;
     }, [channels, filterView, favorites, recentChannelIds]);

    const availableCategories = useMemo(() => {
        const relevantCategoryIds = new Set(channelsInCurrentView.map(c => c.category_id));
        let filteredCategories = categories.filter(cat => relevantCategoryIds.has(cat.category_id));
        if (categoryFilterTerm) {
            const termLower = categoryFilterTerm.toLowerCase();
            filteredCategories = filteredCategories.filter(cat =>
                 cat.category_name.trim().toLowerCase().startsWith(termLower)
            );
        }
        return filteredCategories.sort((a, b) => a.category_name.localeCompare(b.category_name));
    }, [categories, channelsInCurrentView, categoryFilterTerm]);

    const filteredChannels = useMemo(() => {
        let result = channelsInCurrentView;
        if (selectedCategory !== 'all') result = result.filter(channel => channel.category_id === selectedCategory);
        if (searchTerm) {
            const termLower = searchTerm.toLowerCase();
            result = result.filter(channel => channel.name.toLowerCase().includes(termLower));
        }
        if (filterView !== 'recent') {
            result = [...result].sort((a, b) => a.name.localeCompare(b.name));
        }
        return result;
    }, [channelsInCurrentView, selectedCategory, searchTerm, filterView]);

    const getCategoryChannelCount = useCallback((categoryId: string): number => {
        const baseChannels = channelsInCurrentView;
        if (categoryId === 'all') {
            if (categoryFilterTerm) {
                 const filteredCategoryIds = new Set(availableCategories.map(c => c.category_id));
                 return baseChannels.filter(c => filteredCategoryIds.has(c.category_id)).length;
            }
             return baseChannels.length;
        }
         return baseChannels.filter(c => c.category_id === categoryId).length;
    }, [channelsInCurrentView, categoryFilterTerm, availableCategories]);

    const handleFilterViewChange = useCallback((value: string | null) => {
        if (value === 'all' || value === 'favorites' || value === 'recent') {
            setFilterView(value as FilterViewType);
            setSelectedCategory('all');
            setSearchTerm('');
        }
    }, []);

    const handleCategoryFilterChange = useCallback((value: string | null) => {
        setCategoryFilterTerm(value ?? '');
        setSelectedCategory('all');
        setSearchTerm('');
    }, []);

    // --- Hilfsfunktion zum Formatieren der EPG-Zeit ---
    const formatEpgTime = (timestamp: string | number | Date | null | undefined): string => {
        if (!timestamp) return '--:--';
        try {
            let dateObj: Date;
             if (timestamp instanceof Date) {
                 dateObj = timestamp;
            } else if (typeof timestamp === 'number') {
                 dateObj = fromUnixTime(timestamp);
            } else if (typeof timestamp === 'string') {
                 if (/^\d{10,13}$/.test(timestamp)) {
                     const tsNumber = parseInt(timestamp, 10);
                     dateObj = fromUnixTime(tsNumber.toString().length === 10 ? tsNumber : tsNumber / 1000);
                } else if (timestamp.includes('T') && timestamp.includes('Z')) {
                     dateObj = parseISO(timestamp);
                 } else if (timestamp.includes(' ') && timestamp.includes(':')) {
                     // KORREKTUR: let zu const geändert
                     const normalizedTimestamp = timestamp.replace(' ', 'T');
                     // Kommentar zur Zeitzonenproblematik belassen, aber Code funktioniert so
                     // if (!normalizedTimestamp.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(normalizedTimestamp)) {
                     // }
                     try {
                         dateObj = parseISO(normalizedTimestamp);
                         if (isNaN(dateObj.getTime())) {
                            dateObj = new Date(normalizedTimestamp);
                         }
                     } catch {
                        dateObj = new Date(normalizedTimestamp);
                     }
                 } else {
                     console.warn("Unrecognized date string format:", timestamp);
                     dateObj = new Date(timestamp);
                 }
            } else {
                return '--:--';
            }

            if (isNaN(dateObj.getTime())) {
                 console.warn("Invalid date timestamp received or parsed:", timestamp, dateObj);
                 return '--:--';
             }

            return format(dateObj, 'HH:mm');
        } catch (e) {
            console.error("Error formatting EPG time:", timestamp, e);
            return '--:--';
        }
    };

    // --- Logik zum Finden der aktuellen und nächsten Sendung ---
    const { currentProgram, nextProgram } = useMemo(() => {
        if (!epgData || epgData.length === 0) {
            return { currentProgram: null, nextProgram: null };
        }

        const now = Date.now();

        // KORREKTUR: Verwende map/filter/sort mit expliziter Typisierung/Type Predicate
        const sortedEpg: ProcessedEpgEntry[] = epgData
            .map((entry): ProcessedEpgEntry | null => {
                const startMs = parseInt(entry.start_timestamp, 10) * 1000;
                const stopMs = parseInt(entry.stop_timestamp, 10) * 1000;
                if (isNaN(startMs) || isNaN(stopMs)) {
                    console.warn("Invalid timestamp in EPG data during processing:", entry);
                    return null;
                }
                return { ...entry, startMs, stopMs };
            })
            .filter((entry): entry is ProcessedEpgEntry => entry !== null) // Filtert null raus und setzt Typ
            .sort((a, b) => a.startMs - b.startMs); // Sortiere nach Startzeit

        // Typ von current und next ist jetzt ProcessedEpgEntry | null
        let current: ProcessedEpgEntry | null = null;
        let next: ProcessedEpgEntry | null = null;

        for (let i = 0; i < sortedEpg.length; i++) {
            const entry = sortedEpg[i];

             if (entry.startMs <= now && entry.stopMs > now) {
                 current = entry;
                 if (i + 1 < sortedEpg.length) {
                     next = sortedEpg[i + 1];
                 }
                 break;
            }

             if (!current && entry.startMs > now && (!next || entry.startMs < next.startMs)) {
                 next = entry;
             }
        }

        return { currentProgram: current, nextProgram: next };
    }, [epgData]);


    // --- Render Conditions ---
    if (status === 'loading' || (status === 'authenticated' && isLoading && channels.length === 0)) {
        return <div className="flex items-center justify-center min-h-screen"><Loader2 className="h-8 w-8 animate-spin mr-2" /><span>Dashboard wird geladen...</span></div>;
     }
    if (status === 'unauthenticated') {
        return <div className="flex flex-col items-center justify-center min-h-screen p-4"><Alert variant="destructive" className="max-w-md mb-4"><AlertCircle className="h-4 w-4" /><AlertTitle>Nicht angemeldet</AlertTitle><AlertDescription>Bitte melden Sie sich an.</AlertDescription></Alert><Button onClick={() => window.location.href = '/login'}>Zum Login</Button></div>;
     }
    if (!isLoading && error) {
        return <div className="flex flex-col items-center justify-center min-h-screen p-4"><Alert variant="destructive" className="max-w-lg mb-4"><AlertCircle className="h-4 w-4" /><AlertTitle>Fehler beim Laden</AlertTitle><AlertDescription>{error}</AlertDescription></Alert><Button onClick={() => signOut({ callbackUrl: '/login' })} variant="outline"><LogOut className="mr-2 h-4 w-4" /> Abmelden</Button></div>;
    }
    if (!isLoading && !error && channels.length === 0) {
       return <div className="p-4 md:p-6"><div className="flex justify-between items-center mb-6 pb-4 border-b"><h1 className="text-2xl font-bold flex items-center"><Tv className="mr-2 h-6 w-6"/> Dashboard - {session?.user?.name}</h1><Button onClick={() => signOut({ callbackUrl: '/login' })} variant="outline"><LogOut className="mr-2 h-4 w-4"/> Abmelden</Button></div><Alert className="max-w-lg mx-auto"><AlertCircle className="h-4 w-4" /><AlertTitle>Keine Daten gefunden</AlertTitle><AlertDescription>Es wurden keine Kanäle {categories.length === 0 ? 'oder Kategorien' : ''} gefunden.</AlertDescription></Alert></div>;
    }

    // --- Haupt-Render ---
    return (
        <TooltipProvider delayDuration={100}>
            <div className="flex flex-col h-screen bg-background">
                {/* --- Header --- */}
                <div className="flex flex-col sm:flex-row justify-between sm:items-center p-3 md:p-4 border-b gap-2 shrink-0 bg-card text-card-foreground">
                     <h1 className="text-lg md:text-xl font-bold flex items-center truncate">
                        <Tv className="mr-2 h-5 w-5 md:h-6 md:w-6 flex-shrink-0" />
                         <span className="truncate">Dashboard</span>
                        <span className="text-muted-foreground hidden md:inline truncate"> - {session?.user?.name}</span>
                    </h1>
                    <Button onClick={() => signOut({ callbackUrl: '/login' })} variant="outline" size="sm">
                        <LogOut className="mr-2 h-4 w-4" /> Abmelden
                    </Button>
                </div>

                {/* --- Hauptinhalt (Player links, Liste rechts) --- */}
                <div className="flex flex-1 overflow-hidden">

                    {/* --- Linke Spalte: Player & EPG --- */}
                     <div ref={playerWrapperRef} className={`relative flex flex-col ${selectedStreamUrl ? 'w-full md:w-2/3' : 'hidden md:flex md:w-2/3'} p-3 md:p-4 overflow-y-auto bg-muted/20 md:bg-transparent`}>
                        {selectedStreamUrl ? (
                             <div className="flex flex-col h-full">
                                <div className="flex justify-between items-center mb-3 flex-shrink-0">
                                    <h2 className="text-lg md:text-xl font-semibold truncate pr-2" title={selectedChannel?.name}>
                                        {selectedChannel?.name || 'Lädt...'}
                                    </h2>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button onClick={closePlayer} variant="ghost" size="icon">
                                                <XCircle className="h-5 w-5 text-muted-foreground hover:text-destructive" />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent><p>Player schließen</p></TooltipContent>
                                    </Tooltip>
                                </div>

                                <div className="relative flex-shrink-0">
                                    <AspectRatio ratio={16 / 9} className="bg-black rounded-md overflow-hidden shadow-lg mb-4">
                                        <ReactPlayer
                                            key={selectedStreamUrl}
                                            className='react-player absolute top-0 left-0'
                                            url={selectedStreamUrl}
                                            playing={true}
                                            controls={true}
                                            width='100%'
                                            height='100%'
                                            onError={handlePlayerError}
                                            config={{ file: { forceHLS: true }}}
                                            onReady={() => console.log(`Player ready for: ${selectedChannel?.name}`)}
                                            onStart={() => console.log(`Player started for: ${selectedChannel?.name}`)}
                                            light={false}
                                            pip={true}
                                            stopOnUnmount={true}
                                        />
                                    </AspectRatio>
                                    {playerError && (
                                        <Alert variant="destructive" className="mt-4">
                                            <AlertCircle className="h-4 w-4" />
                                            <AlertTitle>Player Fehler</AlertTitle>
                                            <AlertDescription>{playerError}</AlertDescription>
                                        </Alert>
                                    )}
                                </div>

                                <div className="flex-grow overflow-y-auto mt-1 pr-1">
                                    <Card className="shadow-none border-0 md:border md:shadow">
                                        <CardHeader className="pb-2 pt-3 px-3 md:pt-4 md:px-4">
                                            <CardTitle className="text-base font-semibold flex items-center">
                                                <CalendarClock className="mr-2 h-4 w-4 text-muted-foreground flex-shrink-0"/>
                                                Programminformationen
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent className="px-3 pb-3 md:px-4 md:pb-4 text-sm">
                                            {isEpgLoading && (
                                                <div className="space-y-3 py-2">
                                                    <Skeleton className="h-4 w-3/4" />
                                                    <Skeleton className="h-3 w-1/2" />
                                                    <Separator className="my-3" />
                                                    <Skeleton className="h-4 w-3/4" />
                                                    <Skeleton className="h-3 w-1/2" />
                                                </div>
                                            )}
                                            {epgError && !isEpgLoading && (
                                                <Alert variant="default" className="bg-muted/50 border-muted-foreground/20 text-xs p-2">
                                                    <AlertCircle className="h-3 w-3 text-muted-foreground" />
                                                    <AlertTitle className="font-medium mb-0.5">EPG Fehler</AlertTitle>
                                                    <AlertDescription>{epgError}</AlertDescription>
                                                </Alert>
                                            )}
                                            {!isEpgLoading && !epgError && !currentProgram && !nextProgram && selectedChannel && (
                                                <p className="text-muted-foreground italic text-xs py-2">
                                                    {selectedChannel.epg_channel_id ? 'Keine EPG-Daten verfügbar.' : 'Für diesen Sender ist kein EPG vorhanden.'}
                                                </p>
                                            )}
                                            {!isEpgLoading && !epgError && (currentProgram || nextProgram) && (
                                                <div className="space-y-3">
                                                    {currentProgram ? (
                                                        <div>
                                                            <p className="font-semibold text-primary">{currentProgram.title || "Unbekannte Sendung"}</p>
                                                            <p className="text-muted-foreground text-xs">
                                                                {formatEpgTime(currentProgram.start)} - {formatEpgTime(currentProgram.end)}
                                                                {currentProgram.now_playing === 1 && <span className="ml-2 inline-block h-2 w-2 rounded-full bg-green-500 animate-pulse" title="Läuft jetzt"></span>}
                                                            </p>
                                                            {currentProgram.description && (
                                                                 <Tooltip delayDuration={300}>
                                                                    <TooltipTrigger asChild>
                                                                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2 hover:line-clamp-none cursor-help">
                                                                            {currentProgram.description}
                                                                        </p>
                                                                    </TooltipTrigger>
                                                                    <TooltipContent side="bottom" align="start" className="max-w-[300px] whitespace-pre-wrap bg-popover text-popover-foreground shadow-md rounded-md p-2 text-xs">
                                                                        {currentProgram.description}
                                                                    </TooltipContent>
                                                                </Tooltip>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        !nextProgram && <p className="text-muted-foreground italic text-xs py-2">Aktuell keine Programminformation.</p>
                                                    )}

                                                    {(currentProgram && nextProgram) ? <Separator className="my-2" /> : null}

                                                     {nextProgram ? (
                                                        <div>
                                                            <p className="text-xs font-medium text-muted-foreground mb-0.5">Als Nächstes:</p>
                                                             <p className="font-semibold">{nextProgram.title || "Unbekannte Sendung"}</p>
                                                            <p className="text-muted-foreground text-xs">
                                                                Ab {formatEpgTime(nextProgram.start)}
                                                             </p>
                                                              {nextProgram.description && (
                                                                 <Tooltip delayDuration={300}>
                                                                    <TooltipTrigger asChild>
                                                                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2 hover:line-clamp-none cursor-help">
                                                                            {nextProgram.description}
                                                                        </p>
                                                                    </TooltipTrigger>
                                                                    <TooltipContent side="bottom" align="start" className="max-w-[300px] whitespace-pre-wrap bg-popover text-popover-foreground shadow-md rounded-md p-2 text-xs">
                                                                        {nextProgram.description}
                                                                    </TooltipContent>
                                                                </Tooltip>
                                                              )}
                                                        </div>
                                                    ) : (
                                                       currentProgram && <p className="text-muted-foreground italic text-xs py-2">Keine Information zur nächsten Sendung.</p>
                                                    )}
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>
                                </div>
                             </div>
                         ) : (
                             <div className="hidden md:flex flex-col items-center justify-center h-full text-muted-foreground text-center px-6">
                                 <Tv className="h-16 w-16 mb-4 opacity-30" />
                                 <p className="text-lg font-medium">Kein Stream ausgewählt</p>
                                 <p className="text-sm">Wählen Sie rechts einen Sender aus der Liste, um die Wiedergabe zu starten.</p>
                             </div>
                         )}
                    </div>

                    {/* --- Rechte Spalte: Filter & Senderliste --- */}
                     <div className={`flex flex-col ${selectedStreamUrl ? 'w-full md:w-1/3' : 'w-full'} border-l border-border overflow-hidden`}>
                         {/* --- Filter/Such Controls --- */}
                         <div className="p-3 md:p-4 space-y-4 border-b shrink-0 bg-card">
                             <div>
                                 <Label className="text-xs text-muted-foreground mb-1.5 block font-medium">Ansicht</Label>
                                 <ToggleGroup type="single" defaultValue="all" value={filterView} onValueChange={handleFilterViewChange} className="flex flex-wrap gap-1 justify-start">
                                    <Tooltip><TooltipTrigger asChild><ToggleGroupItem value="all" aria-label="Alle Sender" size="sm" className="px-2.5"><Tv className="h-4 w-4" /></ToggleGroupItem></TooltipTrigger><TooltipContent><p>Alle Sender ({channels.length})</p></TooltipContent></Tooltip>
                                    <Tooltip><TooltipTrigger asChild><ToggleGroupItem value="favorites" aria-label="Favoriten" size="sm" className="px-2.5"><Heart className="h-4 w-4" /></ToggleGroupItem></TooltipTrigger><TooltipContent><p>Favoriten ({favorites.size})</p></TooltipContent></Tooltip>
                                    <Tooltip><TooltipTrigger asChild><ToggleGroupItem value="recent" aria-label="Kürzlich gesehen" size="sm" className="px-2.5"><Clock className="h-4 w-4" /></ToggleGroupItem></TooltipTrigger><TooltipContent><p>Kürzlich ({recentChannelIds.length})</p></TooltipContent></Tooltip>
                                 </ToggleGroup>
                             </div>
                             <div>
                                 <Label className="text-xs text-muted-foreground mb-1.5 block font-medium">Kategorie-Filter</Label>
                                 <ToggleGroup type="single" value={categoryFilterTerm} onValueChange={handleCategoryFilterChange} className="flex flex-wrap gap-1 justify-start">
                                    <Tooltip><TooltipTrigger asChild><ToggleGroupItem value="" aria-label="Alle Kategorien" size="sm" className="px-2.5"><Globe className="h-4 w-4" /></ToggleGroupItem></TooltipTrigger><TooltipContent><p>Alle Kategorien</p></TooltipContent></Tooltip>
                                    <Tooltip><TooltipTrigger asChild><ToggleGroupItem value="DE" aria-label="Deutsche Kategorien" size="sm" className="px-2.5 text-xs font-semibold">DE</ToggleGroupItem></TooltipTrigger><TooltipContent><p>Nur DE-Kategorien</p></TooltipContent></Tooltip>
                                    <Tooltip><TooltipTrigger asChild><ToggleGroupItem value="UK" aria-label="UK Kategorien" size="sm" className="px-2.5 text-xs font-semibold">UK</ToggleGroupItem></TooltipTrigger><TooltipContent><p>Nur UK-Kategorien</p></TooltipContent></Tooltip>
                                    <Tooltip><TooltipTrigger asChild><ToggleGroupItem value="US" aria-label="US Kategorien" size="sm" className="px-2.5 text-xs font-semibold">US</ToggleGroupItem></TooltipTrigger><TooltipContent><p>Nur US-Kategorien</p></TooltipContent></Tooltip>
                                 </ToggleGroup>
                              </div>
                              <div>
                                  <Label htmlFor="category-select" className="text-xs text-muted-foreground mb-1.5 block font-medium">Kategorie wählen</Label>
                                  <Select value={selectedCategory} onValueChange={setSelectedCategory} disabled={availableCategories.length === 0 && !categoryFilterTerm}>
                                      <SelectTrigger id="category-select" className="w-full h-9 text-sm">
                                          <SelectValue placeholder="Kategorie wählen..." />
                                      </SelectTrigger>
                                      <SelectContent>
                                          <SelectItem value="all" className="text-sm">
                                            {categoryFilterTerm ? `Alle ${categoryFilterTerm}... Kategorien` : 'Alle Kategorien'} ({getCategoryChannelCount('all')})
                                          </SelectItem>
                                          {availableCategories.map((cat) => (
                                            <SelectItem key={cat.category_id} value={cat.category_id} className="text-sm">
                                                {cat.category_name} ({getCategoryChannelCount(cat.category_id)})
                                            </SelectItem>
                                          ))}
                                          {availableCategories.length > 0 && !availableCategories.some(c => c.category_id === selectedCategory) && selectedCategory !== 'all' && (
                                              <SelectItem value={selectedCategory} disabled className="text-sm italic">
                                                  {categories.find(c => c.category_id === selectedCategory)?.category_name ?? 'Ausgewählte Kat. nicht im Filter'} (0)
                                              </SelectItem>
                                          )}
                                           {availableCategories.length === 0 && selectedCategory === 'all' && categoryFilterTerm && (<div className="px-2 py-1.5 text-xs text-muted-foreground italic">Keine Kategorien für Filter &quot;{categoryFilterTerm}&quot;.</div>)}
                                           {availableCategories.length === 0 && !categoryFilterTerm && (<div className="px-2 py-1.5 text-xs text-muted-foreground italic">Keine Kategorien in dieser Ansicht.</div>)}
                                      </SelectContent>
                                  </Select>
                              </div>
                              <div>
                                  <Label htmlFor="channel-search" className="text-xs text-muted-foreground mb-1.5 block font-medium">Sender suchen</Label>
                                  <div className="relative">
                                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                      <Input id="channel-search" type="search" placeholder="Sendername..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-8 w-full h-9 text-sm" />
                                       {searchTerm && (
                                         <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setSearchTerm('')}>
                                            <XCircle className="h-4 w-4 text-muted-foreground hover:text-destructive"/>
                                        </Button>
                                      )}
                                  </div>
                              </div>
                         </div>

                         {/* --- Senderliste --- */}
                         <div className="flex-1 overflow-y-auto bg-background">
                            <ScrollArea className="h-full p-2">
                                <h2 className="text-xs font-semibold text-muted-foreground px-2 mb-2 sticky top-0 bg-background/80 backdrop-blur-sm z-10 pt-2 pb-1 border-b border-transparent">
                                    {filterView === 'favorites' ? 'Favoriten' : filterView === 'recent' ? 'Kürzlich gesehen' : 'Sender'}
                                    {categoryFilterTerm && ` (${categoryFilterTerm}*)`}
                                    {selectedCategory !== 'all' && `: ${categories.find(c=>c.category_id === selectedCategory)?.category_name ?? selectedCategory}`}
                                    {' '} ({filteredChannels.length})
                                </h2>
                                {isLoading && channels.length > 0 ? (
                                     <div className="p-4 space-y-3">
                                        {[...Array(10)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
                                    </div>
                                ) : filteredChannels.length > 0 ? (
                                    <div className="space-y-1">
                                        {filteredChannels.map((channel) => (
                                            <div
                                                key={channel.stream_id}
                                                className={`flex items-center space-x-2 p-1.5 rounded-md cursor-pointer group ${selectedChannel?.stream_id === channel.stream_id ? 'bg-primary/10 ring-1 ring-primary/50' : 'hover:bg-muted/50'}`}
                                                onClick={() => handleChannelClick(channel)}
                                                title={channel.name}
                                            >
                                                 <div className="w-6 h-6 flex-shrink-0 flex items-center justify-center relative">
                                                    {channel.stream_icon ? (
                                                        <img
                                                            src={channel.stream_icon}
                                                            alt=""
                                                            className="w-full h-full object-contain rounded-sm bg-transparent group-hover:scale-110 transition-transform"
                                                             onError={(e) => { const target = e.currentTarget; target.style.display = 'none'; (target.nextElementSibling as HTMLElement)?.classList.remove('hidden'); }}
                                                             loading="lazy"
                                                         />
                                                    ) : null}
                                                    <div className={`w-5 h-5 flex items-center justify-center rounded-sm bg-muted ${channel.stream_icon ? 'hidden' : ''}`}>
                                                        <Tv className="w-3 h-3 text-muted-foreground" />
                                                     </div>
                                                 </div>
                                                <span className={`flex-1 truncate text-sm ${selectedChannel?.stream_id === channel.stream_id ? 'font-semibold text-primary' : ''}`}>
                                                    {channel.name}
                                                </span>
                                                <Tooltip delayDuration={300}>
                                                    <TooltipTrigger asChild>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className={`h-7 w-7 ml-auto flex-shrink-0 transition-opacity ${favorites.has(channel.stream_id) ? 'opacity-100' : 'opacity-0 group-hover:opacity-60 focus-visible:opacity-100 hover:opacity-100'}`}
                                                            onClick={(e) => toggleFavorite(channel.stream_id, e)}
                                                        >
                                                            <Heart className={`h-4 w-4 transition-colors ${favorites.has(channel.stream_id) ? 'fill-red-500 text-red-500' : 'text-muted-foreground group-hover:text-foreground'}`} />
                                                        </Button>
                                                    </TooltipTrigger>
                                                    <TooltipContent side="left" className="text-xs">
                                                        <p>{favorites.has(channel.stream_id) ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </div>
                                        ))}
                                    </div>
                                ) : ( <div className="text-center text-muted-foreground py-8 px-4 text-sm italic">Keine Sender entsprechen den aktuellen Filtern.</div> )}
                            </ScrollArea>
                         </div>
                    </div>
                </div>
            </div>
        </TooltipProvider>
    )
}