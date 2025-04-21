'use client';

// === Imports ===
import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useSession, signOut } from 'next-auth/react'; // Added signOut
import axios from 'axios';
import ReactPlayer from 'react-player';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
    Loader2, AlertCircle, Clapperboard, Search, XCircle, Star, ChevronsUpDown, LogOut // Added LogOut
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { AspectRatio } from "@/components/ui/aspect-ratio";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Label } from "@/components/ui/label";
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogClose,
} from "@/components/ui/dialog";
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton"; // Added Skeleton
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"; // Importiert für Details (optional)

// === Interfaces ===
interface SeriesCategory {
    category_id: string;
    category_name: string;
    parent_id: number;
}

interface SeriesStream {
    num: number;
    name: string;
    series_id: number;
    cover: string | null;
    plot: string | null;
    cast: string | null;
    director: string | null;
    genre: string | null;
    releaseDate: string | null;
    last_modified: string | null;
    rating: string | number | null;
    rating_5based: string | number | null;
    episode_run_time: string | null;
    youtube_trailer: string | null;
    category_id: string;
}

interface Episode {
    id: string | number;
    episode_num: number;
    season: number;
    title: string | null;
    container_extension: string;
    info?: {
        movie_image?: string; // Often holds episode thumbnail
        plot?: string;
        duration_secs?: number;
        duration?: string;
        rating?: number | string;
        releasedate?: string;
        name?: string;
    };
    stream_id?: number;
}

interface SeriesInfoResponse {
    episodes: {
        [season_number: string]: Episode[];
    };
    info?: SeriesStream; // Contains series details like plot, cast etc.
}


// === Helper Component: SeriesListItem (Unverändert) ===
interface SeriesListItemProps {
    series: SeriesStream;
    onClick: (series: SeriesStream) => void;
    isSelected: boolean;
}

function SeriesListItem({ series, onClick, isSelected }: SeriesListItemProps) {
    const handleImageError = useCallback((e: React.SyntheticEvent<HTMLImageElement, Event>) => {
        e.currentTarget.onerror = null;
        e.currentTarget.style.display = 'none';
        const fallback = e.currentTarget.parentElement?.querySelector('.list-item-fallback');
        if (fallback) fallback.classList.remove('hidden');
    }, []);

    const numericRating = useMemo(() => {
        if (series.rating_5based != null) {
            const parsed = parseFloat(String(series.rating_5based));
            if (!isNaN(parsed)) return parsed;
        }
        return null;
    }, [series.rating_5based]);

    const ratingDisplay = useMemo(() => {
        if (numericRating !== null) {
            return (
                <span className="flex items-center text-xs text-muted-foreground">
                    <Star className="h-3 w-3 mr-1 text-yellow-500 fill-yellow-500" />
                    {numericRating.toFixed(1)} / 5
                </span>
            );
        } else if (series.rating) {
             return <span className="text-xs text-muted-foreground">{series.rating}</span>;
        } else if (series.genre) {
            // Fallback to genre if no rating
            return <span className='text-xs text-muted-foreground truncate'>{series.genre}</span>;
        }
        return null;
    }, [numericRating, series.rating, series.genre]);

    return (
        <div
            className={`flex items-center p-2 cursor-pointer rounded-md transition-colors duration-150 border-b border-transparent ${
                isSelected
                    ? 'bg-primary/10 ring-1 ring-primary/30'
                    : 'hover:bg-muted/50'
            }`}
            onClick={() => onClick(series)}
            title={`Zeige Episoden für ${series.name}`}
            style={{ minHeight: '72px' }}
        >
            <div className="w-10 h-14 flex-shrink-0 bg-muted rounded-sm overflow-hidden relative mr-3">
                {series.cover ? (
                    <img
                        src={series.cover}
                        alt=""
                        className="object-cover w-full h-full"
                        loading="lazy"
                        onError={handleImageError}
                    />
                ) : null}
                 <div className={`absolute inset-0 flex items-center justify-center bg-muted ${series.cover ? 'hidden list-item-fallback' : 'list-item-fallback'}`}>
                    <Clapperboard className="w-5 h-5 text-muted-foreground/40" />
                </div>
            </div>
            <div className="flex-1 overflow-hidden py-1">
                <p
                    className={`text-sm font-medium leading-tight mb-1 ${
                        isSelected ? 'text-primary font-semibold' : ''
                    } truncate`}
                >
                    {series.name}
                </p>
                {ratingDisplay && <div className="mt-0.5">{ratingDisplay}</div>}
            </div>
        </div>
    );
}


// === Komponente ===
export default function SeriesPage() {
    // --- Session & Grund-States ---
    const { data: session, status } = useSession();
    const [categories, setCategories] = useState<SeriesCategory[]>([]);
    const [series, setSeries] = useState<SeriesStream[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // --- Filter States ---
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
    const [selectedMinRating, setSelectedMinRating] = useState<string>('all');

    // --- Popover State ---
    const [categoryPopoverOpen, setCategoryPopoverOpen] = useState(false);

    // --- Episoden-Dialog States ---
    const [isEpisodeDialogOpen, setIsEpisodeDialogOpen] = useState(false);
    const [selectedSeriesForDialog, setSelectedSeriesForDialog] = useState<SeriesStream | null>(null); // Renamed for clarity
    const [episodes, setEpisodes] = useState<Record<string, Episode[]>>({});
    const [isFetchingEpisodes, setIsFetchingEpisodes] = useState(false);
    const [episodeFetchError, setEpisodeFetchError] = useState<string | null>(null);
    const [seriesInfoForPlayer, setSeriesInfoForPlayer] = useState<SeriesStream | null>(null); // Holds info from get_series_info

    // --- Player States ---
    const [selectedEpisodeStreamUrl, setSelectedEpisodeStreamUrl] = useState<string | null>(null);
    const [selectedEpisode, setSelectedEpisode] = useState<Episode | null>(null);
    // seriesForPlayer now replaced by selectedSeriesForDialog OR seriesInfoForPlayer for more details
    const [episodePlayerError, setEpisodePlayerError] = useState<string | null>(null);
    const [isEpisodePlayerReady, setIsEpisodePlayerReady] = useState(false);
    const episodePlayerWrapperRef = useRef<HTMLDivElement>(null);
    const episodePlayerRef = useRef<ReactPlayer>(null);

    // --- Virtualization Ref ---
    const parentRef = useRef<HTMLDivElement>(null);

    // === Daten laden ===
    useEffect(() => {
        const fetchSeriesData = async () => {
             if (status !== 'authenticated' || !session?.user?.name || !session?.user?.password) { setIsLoading(false); return; }
            setIsLoading(true); setError(null);
            // Reset relevant states
            setCategories([]); setSeries([]); setSelectedCategories([]); setSearchTerm(''); setSelectedMinRating('all');
            // Player/Dialog Resets
            setIsEpisodeDialogOpen(false); setSelectedSeriesForDialog(null); setEpisodes({}); setIsFetchingEpisodes(false); setEpisodeFetchError(null);
            setSelectedEpisodeStreamUrl(null); setSelectedEpisode(null); setSeriesInfoForPlayer(null); setEpisodePlayerError(null); setIsEpisodePlayerReady(false);

            const { name: username, password } = session.user;
            try {
                const catUrl = `/api/xtream/player_api.php?username=${username}&password=${password}&action=get_series_categories`;
                const streamUrl = `/api/xtream/player_api.php?username=${username}&password=${password}&action=get_series`;
                const [catResponse, streamResponse] = await Promise.all([ axios.get(catUrl), axios.get(streamUrl) ]);
                if (catResponse.data && Array.isArray(catResponse.data)) {
                    const validCategories = catResponse.data.filter(cat => cat.category_name?.trim());
                    setCategories(validCategories.sort((a,b) => a.category_name.localeCompare(b.category_name)));
                } else { console.warn('No Series categories found.'); }
                if (streamResponse.data && Array.isArray(streamResponse.data)) {
                    setSeries(streamResponse.data);
                } else { console.warn('No Series streams found.'); }
                if (!catResponse.data?.length && !streamResponse.data?.length) {
                    setError('Keine Serien oder Kategorien gefunden.');
                }
            } catch (err) {
                console.error('Error fetching Series data:', err);
                setError(err instanceof Error ? `Fehler: ${err.message}` : 'Unbekannter Fehler.');
                setCategories([]); setSeries([]);
            } finally { setIsLoading(false); }
        };
        if (status === 'authenticated') { fetchSeriesData(); }
        else if (status === 'unauthenticated') {
             setIsLoading(false);
             // Clear all data on logout
             setCategories([]); setSeries([]); setSelectedCategories([]); setSearchTerm(''); setSelectedMinRating('all');
             setIsEpisodeDialogOpen(false); setSelectedSeriesForDialog(null); setEpisodes({}); setIsFetchingEpisodes(false); setEpisodeFetchError(null);
             setSelectedEpisodeStreamUrl(null); setSelectedEpisode(null); setSeriesInfoForPlayer(null); setEpisodePlayerError(null); setIsEpisodePlayerReady(false); setError(null);
         }
    }, [status, session]);

    // === Memoized Filter ===
    const filteredSeries = useMemo(() => {
        const minRatingValue = selectedMinRating === 'all' ? 0 : parseInt(selectedMinRating, 10);
        const lowerCaseSearchTerm = searchTerm.toLowerCase();

        return series.filter(s => {
            const categoryMatch = selectedCategories.length === 0 || selectedCategories.includes(s.category_id);
            if (!categoryMatch) return false;
            const searchMatch = lowerCaseSearchTerm === '' || s.name.toLowerCase().includes(lowerCaseSearchTerm);
            if (!searchMatch) return false;
            let currentRating: number | null = null;
            if (s.rating_5based != null) {
                const parsedRating = parseFloat(String(s.rating_5based));
                if (!isNaN(parsedRating)) { currentRating = parsedRating; }
            }
            const ratingMatch = selectedMinRating === 'all' || (currentRating !== null && currentRating >= minRatingValue);
            if (!ratingMatch) return false;
            return true;
        });
    }, [series, selectedCategories, searchTerm, selectedMinRating]);

    // === Hilfsfunktionen ===
    const handleCategorySelect = useCallback((categoryId: string) => {
        setSelectedCategories(prevSelected => {
            return prevSelected.includes(categoryId) ? prevSelected.filter(id => id !== categoryId) : [...prevSelected, categoryId];
        });
    }, []);

     const categoryTriggerText = useMemo(() => {
        if (selectedCategories.length === 0) { return "Genres/Kategorien wählen..."; }
        if (selectedCategories.length === 1) {
            const selectedCat = categories.find(cat => cat.category_id === selectedCategories[0]);
            return selectedCat?.category_name ?? "1 ausgewählt";
        }
        return `${selectedCategories.length} Genres/Kategorien`;
    }, [selectedCategories, categories]);

     const formatReleaseDate = (releaseDate: string | null | undefined): string | null => {
        if (!releaseDate) return null;
        try {
             const date = new Date(releaseDate);
             if (isNaN(date.getTime())) return releaseDate; // Return original if invalid
             // Only show year for series
             return date.toLocaleDateString('de-DE', { year: 'numeric' });
        } catch { return releaseDate; } // Return original on error
    }

    // === Event Handlers ===

    // handleSeriesClick (öffnet Dialog für Episoden)
    const handleSeriesClick = useCallback(async (seriesItem: SeriesStream) => {
        if (!session?.user?.name || !session?.user?.password) return;
        setSelectedSeriesForDialog(seriesItem); // Set context for the dialog
        setIsEpisodeDialogOpen(true);
        setIsFetchingEpisodes(true);
        setEpisodeFetchError(null);
        setEpisodes({});
        setSeriesInfoForPlayer(null); // Clear detailed info initially

        const { name: username, password } = session.user;
        const episodesUrl = `/api/xtream/player_api.php?username=${username}&password=${password}&action=get_series_info&series_id=${seriesItem.series_id}`;
        try {
            const response = await axios.get<SeriesInfoResponse>(episodesUrl);

            // Store series info if available (for player details later)
            if (response.data?.info) {
                setSeriesInfoForPlayer(response.data.info);
                // Optionally merge with initial seriesItem if info is missing details
                // setSelectedSeriesForDialog(prev => ({ ...prev, ...response.data.info }));
            } else {
                // Fallback to the basic info from the list if detailed info is missing
                setSeriesInfoForPlayer(seriesItem);
            }


            if (response.data?.episodes && typeof response.data.episodes === 'object') {
                 const sortedSeasons = Object.keys(response.data.episodes).sort((a, b) => parseInt(a) - parseInt(b));
                 const sortedEpisodesData: Record<string, Episode[]> = {};
                 sortedSeasons.forEach(seasonNum => {
                     sortedEpisodesData[seasonNum] = response.data.episodes[seasonNum].sort((a, b) => a.episode_num - b.episode_num);
                 });
                 setEpisodes(sortedEpisodesData);
            } else { setEpisodeFetchError('Keine Episoden gefunden.'); setEpisodes({}); }
        } catch (err) {
            console.error("Error fetching series info:", err);
            setEpisodeFetchError(err instanceof Error ? `Fehler: ${err.message}` : 'Unbekannter Fehler.');
            setEpisodes({});
             // Fallback to basic info on error too
             setSeriesInfoForPlayer(seriesItem);
        } finally { setIsFetchingEpisodes(false); }
    }, [session]);

    // handleEpisodeClick (startet Player aus dem Dialog)
    const handleEpisodeClick = useCallback((episode: Episode) => {
        // seriesContext (seriesInfoForPlayer) should be available from handleSeriesClick
        if (!session?.user?.name || !session?.user?.password || !seriesInfoForPlayer) return;

        // Cleanup previous player if exists and different episode
        const currentPlayer = episodePlayerRef.current;
        if (currentPlayer && (selectedEpisode?.id ?? selectedEpisode?.stream_id) !== (episode.id ?? episode.stream_id)) {
            try {
                const internalPlayer = currentPlayer.getInternalPlayer();
                if (internalPlayer?.pause) internalPlayer.pause();
                console.log("Attempted to stop previous episode player before switching.");
            } catch (e) { console.error("Error trying to stop previous episode player:", e); }
        }

        const episodeStreamId = episode.stream_id ?? episode.id;
        if (!episodeStreamId || !episode.container_extension) {
            setEpisodePlayerError("Fehler: Episoden-ID oder Typ fehlt."); setIsEpisodePlayerReady(false); return;
        }

        const { name: username, password } = session.user;
        const streamUrl = `/api/xtream/series/${username}/${password}/${episodeStreamId}.${episode.container_extension}`;
        console.log(`Starting episode player for: ${seriesInfoForPlayer.name} S${episode.season}E${episode.episode_num} (URL: ${streamUrl})`);

        setEpisodePlayerError(null);
        setIsEpisodePlayerReady(false);
        setSelectedEpisode(episode);
        // seriesInfoForPlayer is already set
        setSelectedEpisodeStreamUrl(streamUrl);

        setIsEpisodeDialogOpen(false); // Close Dialog
        // Ensure player column is visible and scroll into view
        setTimeout(() => episodePlayerWrapperRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);

    }, [session, selectedEpisode, seriesInfoForPlayer]); // Depend on seriesInfoForPlayer

    const handleEpisodePlayerReady = useCallback(() => {
        if (selectedEpisode) {
             console.log(`Episode player is ready for: ${seriesInfoForPlayer?.name} S${selectedEpisode?.season}E${selectedEpisode?.episode_num}. Allowing playback.`);
             setIsEpisodePlayerReady(true);
        } else { console.warn("Episode player onReady called but no episode selected?"); }
    }, [selectedEpisode, seriesInfoForPlayer]);

    const handleEpisodePlayerError = useCallback((err: unknown) => {
        console.error('Episode Player Error:', err);
        let message = 'Unbekannter Fehler beim Laden der Episode.';
        if (err instanceof Error) { message = err.message; }
        setEpisodePlayerError(`Episode konnte nicht geladen werden. (${message})`);
        setIsEpisodePlayerReady(false);
    }, []);

    // Player schließen
    const closeEpisodePlayer = useCallback(() => {
        console.log("Attempting to close episode player...");
        const player = episodePlayerRef.current;
        if (player) {
            try {
                const internalPlayer = player.getInternalPlayer();
                if (internalPlayer?.pause) internalPlayer.pause();
                console.log("Called internalPlayer.pause() for episode player.");
            } catch (e) { console.error("Error during episode player cleanup:", e); }
        } else { console.warn("Episode player ref was null when trying to close."); }

        setSelectedEpisodeStreamUrl(null);
        setSelectedEpisode(null);
        // Don't clear seriesInfoForPlayer here, keep it for potential details display
        setEpisodePlayerError(null);
        setIsEpisodePlayerReady(false);
         // Do NOT clear selectedSeriesForDialog here - this is only for dialog context
    }, []);

    // === Virtualization Setup ===
    const ESTIMATED_LIST_ITEM_HEIGHT = 72 + 4; // 72px minHeight + 4px Padding
    const listVirtualizer = useVirtualizer({
        count: filteredSeries.length,
        getScrollElement: useCallback(() => parentRef.current, []),
        estimateSize: useCallback(() => ESTIMATED_LIST_ITEM_HEIGHT, []),
        overscan: 8,
    });

    // === Render Conditions ===
    if (isLoading && status === 'authenticated' && series.length === 0 && !error) { return <div className="flex justify-center items-center min-h-screen"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>; }
    if (status === 'unauthenticated') { return <div className="flex flex-col items-center justify-center min-h-screen p-4"><Alert variant="default" className="max-w-md mb-4 border-l-4 border-yellow-500"><AlertCircle className="h-4 w-4" /><AlertTitle>Nicht angemeldet</AlertTitle><AlertDescription>Bitte melden Sie sich an.</AlertDescription></Alert></div>; }
     if (!isLoading && (error || (status === 'authenticated' && series.length === 0 && !error))) {
        const title = error ? "Fehler beim Laden" : "Keine Daten gefunden";
        const description = error ? error : `Es wurden keine Serien ${categories.length === 0 ? 'oder Kategorien' : ''} auf dem Server gefunden.`;
        return (
           <div className="flex flex-col h-screen bg-background">
                <div className="flex flex-col sm:flex-row justify-between sm:items-center p-3 md:p-4 border-b gap-2 shrink-0 bg-card text-card-foreground">
                     <h1 className="text-lg md:text-xl font-bold flex items-center truncate">
                        <Clapperboard className="mr-2 h-5 w-5 md:h-6 md:w-6 flex-shrink-0 text-primary" />
                         <span className="truncate">Serien</span>
                     </h1>
                    <Button onClick={() => signOut({ callbackUrl: '/login' })} variant="outline" size="sm">
                        <LogOut className="mr-2 h-4 w-4" /> Abmelden
                    </Button>
                </div>
                <div className="flex flex-1 items-center justify-center p-6">
                     <Alert variant={error ? "destructive" : "default"} className="max-w-lg mx-auto">
                         <AlertCircle className="h-4 w-4" />
                         <AlertTitle>{title}</AlertTitle>
                         <AlertDescription>{description}</AlertDescription>
                     </Alert>
                </div>
           </div>
        );
    }

    // === Haupt-Render ===
    return (
        <TooltipProvider delayDuration={300}>
            <div className="flex flex-col h-screen bg-background">
                {/* Header */}
                 <div className="flex flex-col sm:flex-row justify-between sm:items-center p-3 md:p-4 border-b gap-2 shrink-0 bg-card text-card-foreground">
                    <h1 className="text-lg md:text-xl font-bold flex items-center truncate">
                        <Clapperboard className="mr-2 h-5 w-5 md:h-6 md:w-6 flex-shrink-0 text-primary" />
                        <span className="truncate">Serien</span>
                    </h1>
                     <Button onClick={() => signOut({ callbackUrl: '/login' })} variant="outline" size="sm">
                        <LogOut className="mr-2 h-4 w-4" /> Abmelden
                     </Button>
                </div>

                 {/* Hauptinhalt: Flex-Zeile mit Überlauf-Handling */}
                 <div className="flex flex-1 overflow-hidden">

                    {/* Linke Spalte: Player & Serien-Details (Conditional) */}
                    {/* *** LAYOUT CHANGE HERE *** */}
                    <div ref={episodePlayerWrapperRef} className={`relative flex flex-col ${selectedEpisode ? 'w-full md:w-2/3 border-r border-border' : 'hidden md:flex md:w-2/3 border-r border-border'} overflow-hidden`}>
                         {/* Container für Player + Details, ermöglicht internes Scrolling */}
                         <div className="flex flex-col h-full overflow-hidden"> {/* Parent für internes Scrolling */}
                            {selectedEpisode && seriesInfoForPlayer ? ( // Check for both episode AND series info
                                <>
                                    {/* Player Sektion (feste Höhe) */}
                                    <div className="flex-shrink-0 p-3 md:p-4">
                                        {/* Player-Header */}
                                        <div className='flex justify-between items-center mb-3'>
                                            <h2 className="text-lg md:text-xl font-semibold truncate pr-2" title={`${seriesInfoForPlayer.name} - S${selectedEpisode.season} E${selectedEpisode.episode_num}`}>
                                                {seriesInfoForPlayer.name} - S{selectedEpisode.season}E{selectedEpisode.episode_num}
                                                {selectedEpisode.title ? `: ${selectedEpisode.title}` : (selectedEpisode.info?.name ? `: ${selectedEpisode.info.name}` : '')}
                                            </h2>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Button onClick={closeEpisodePlayer} variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive">
                                                        <XCircle className="h-5 w-5" />
                                                    </Button>
                                                </TooltipTrigger>
                                                <TooltipContent><p>Player schließen</p></TooltipContent>
                                            </Tooltip>
                                        </div>
                                        {/* Player-Bereich */}
                                        <AspectRatio ratio={16 / 9} className="bg-black rounded-md overflow-hidden shadow-inner relative">
                                            {!isEpisodePlayerReady && selectedEpisodeStreamUrl && (
                                                <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
                                                    <Loader2 className="h-10 w-10 animate-spin text-white" />
                                                </div>
                                            )}
                                            {selectedEpisodeStreamUrl && (
                                                <ReactPlayer
                                                    ref={episodePlayerRef} key={selectedEpisodeStreamUrl}
                                                    playing={isEpisodePlayerReady} onReady={handleEpisodePlayerReady}
                                                    className='react-player absolute top-0 left-0'
                                                    url={selectedEpisodeStreamUrl} controls={true}
                                                    width='100%' height='100%' onError={handleEpisodePlayerError}
                                                    config={{ file: { attributes: { controlsList: 'nodownload' } } }}
                                                    onEnded={closeEpisodePlayer}
                                                />
                                            )}
                                        </AspectRatio>
                                        {episodePlayerError && (
                                            <Alert variant="destructive" className="mt-4">
                                                <AlertCircle className="h-4 w-4" /> <AlertTitle>Player Fehler</AlertTitle> <AlertDescription>{episodePlayerError}</AlertDescription>
                                            </Alert>
                                        )}
                                    </div>

                                    {/* Serien/Episoden-Details Sektion (scrollbarer Rest) */}
                                    {/* Verwende seriesInfoForPlayer für Serien-Details */}
                                    <ScrollArea className="flex-grow min-h-0 p-3 md:p-4 pt-0"> {/* min-h-0 für Flex */}
                                        <div className="space-y-4 pb-4">
                                             {/* Episoden-Details (optional) */}
                                             {selectedEpisode.info && (
                                                 <Card className="shadow-sm border-border/60">
                                                     <CardHeader className="pb-2 pt-3 px-3 md:pt-4 md:px-4"><CardTitle className="text-base font-semibold">Episodeninfo</CardTitle></CardHeader>
                                                     <CardContent className="px-3 pb-3 md:px-4 md:pb-4 text-sm space-y-2">
                                                          {selectedEpisode.info.name && selectedEpisode.info.name !== selectedEpisode.title && <div><span className="font-semibold">Titel:</span> {selectedEpisode.info.name}</div>}
                                                          {selectedEpisode.info.releasedate && <div><span className="font-semibold">Ausstrahlung:</span> {formatReleaseDate(selectedEpisode.info.releasedate)}</div>}
                                                          {selectedEpisode.info.duration && <div><span className="font-semibold">Laufzeit:</span> {selectedEpisode.info.duration}</div>}
                                                          {selectedEpisode.info.plot && <div><span className="font-semibold">Handlung:</span> <p className="text-muted-foreground text-xs mt-1">{selectedEpisode.info.plot}</p></div>}
                                                     </CardContent>
                                                 </Card>
                                             )}
                                             {/* Serien-Details */}
                                             <Card className="shadow-sm border-border/60">
                                                 <CardHeader className="pb-2 pt-3 px-3 md:pt-4 md:px-4"><CardTitle className="text-base font-semibold">Serieninfo ({seriesInfoForPlayer.name})</CardTitle></CardHeader>
                                                 <CardContent className="px-3 pb-3 md:px-4 md:pb-4 text-sm space-y-2">
                                                      {seriesInfoForPlayer.genre && <div><span className="font-semibold">Genre:</span> {seriesInfoForPlayer.genre}</div>}
                                                      {seriesInfoForPlayer.releaseDate && <div><span className="font-semibold">Startjahr:</span> {formatReleaseDate(seriesInfoForPlayer.releaseDate)}</div>}
                                                      {/* Zeige Rating nur wenn vorhanden */}
                                                      {(seriesInfoForPlayer.rating_5based || seriesInfoForPlayer.rating) &&
                                                        <div>
                                                            <span className="font-semibold">Bewertung:</span> {seriesInfoForPlayer.rating_5based ? `${parseFloat(String(seriesInfoForPlayer.rating_5based)).toFixed(1)}/5` : seriesInfoForPlayer.rating}
                                                        </div>
                                                      }
                                                      {seriesInfoForPlayer.episode_run_time && <div><span className="font-semibold">Episodenlänge:</span> ca. {seriesInfoForPlayer.episode_run_time} Min.</div>}
                                                      {seriesInfoForPlayer.cast && <div><span className="font-semibold">Besetzung:</span> <span className="text-muted-foreground text-xs">{seriesInfoForPlayer.cast}</span></div>}
                                                      {seriesInfoForPlayer.director && <div><span className="font-semibold">Regie:</span> <span className="text-muted-foreground text-xs">{seriesInfoForPlayer.director}</span></div>}
                                                 </CardContent>
                                             </Card>
                                             {seriesInfoForPlayer.plot && (
                                                 <Card className="shadow-sm border-border/60">
                                                     <CardHeader className="pb-2 pt-3 px-3 md:pt-4 md:px-4"><CardTitle className="text-base font-semibold">Handlung (Serie)</CardTitle></CardHeader>
                                                     <CardContent className="px-3 pb-3 md:px-4 md:pb-4 text-sm text-muted-foreground">{seriesInfoForPlayer.plot}</CardContent>
                                                 </Card>
                                             )}
                                        </div>
                                    </ScrollArea>
                                </>
                            ) : (
                                // Platzhalter, wenn keine Episode ausgewählt ist (nur Desktop)
                                <div className="hidden md:flex flex-col items-center justify-center h-full text-muted-foreground text-center px-6">
                                    <Clapperboard className="h-16 w-16 mb-4 opacity-30" />
                                    <p className="text-lg font-medium">Keine Episode ausgewählt</p>
                                    <p className="text-sm">Wähle rechts eine Serie und dann eine Episode aus.</p>
                                </div>
                            )}
                        </div>
                    </div>


                    {/* Rechte Spalte: Filter & Serienliste */}
                    {/* *** LAYOUT CHANGE HERE (class logic remains the same but depends on selectedEpisode) *** */}
                    <div className={`flex flex-col ${selectedEpisode ? 'w-full md:w-1/3' : 'w-full'} overflow-hidden`}>
                        {/* Filter Controls */}
                         <div className="p-3 md:p-4 space-y-4 border-b shrink-0 bg-card">
                             {/* Kategorie/Genre Popover */}
                             <div>
                                 <Label htmlFor="category-trigger-series">Genres / Kategorien</Label>
                                 <Popover open={categoryPopoverOpen} onOpenChange={setCategoryPopoverOpen}>
                                     <PopoverTrigger asChild>
                                         <Button id="category-trigger-series" variant="outline" role="combobox" aria-expanded={categoryPopoverOpen} className="w-full justify-between mt-1 h-9 text-sm" disabled={categories.length === 0} title={categoryTriggerText}>
                                             <span className="truncate pr-2">{categoryTriggerText}</span>
                                             <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                         </Button>
                                     </PopoverTrigger>
                                     <PopoverContent className="w-[--radix-popover-trigger-width] max-h-[--radix-popover-content-available-height] p-0">
                                         <Command>
                                             <CommandInput placeholder="Genre/Kategorie suchen..." />
                                             <CommandList>
                                                 <CommandEmpty>Keine Kategorie gefunden.</CommandEmpty>
                                                 <CommandGroup>
                                                     {selectedCategories.length > 0 && (<CommandItem onSelect={() => { setSelectedCategories([]); }} className="text-sm text-muted-foreground cursor-pointer hover:bg-secondary/80"><XCircle className="mr-2 h-4 w-4" /> Auswahl zurücksetzen</CommandItem>)}
                                                     {categories.map((category) => (<CommandItem key={category.category_id} value={category.category_name} onSelect={() => { handleCategorySelect(category.category_id); }} className="cursor-pointer"><Checkbox id={`cat-series-${category.category_id}`} className="mr-2 pointer-events-none" checked={selectedCategories.includes(category.category_id)} /><span className="flex-1 truncate" title={category.category_name}>{category.category_name}</span></CommandItem>))}
                                                 </CommandGroup>
                                             </CommandList>
                                         </Command>
                                     </PopoverContent>
                                 </Popover>
                                 {selectedCategories.length > 0 && (<div className="mt-2 flex flex-wrap gap-1">{selectedCategories.map(id => { const cat = categories.find(c => c.category_id === id); return cat ? (<Badge key={id} variant="secondary" className="text-xs">{cat.category_name}<button type="button" className="ml-1 rounded-full outline-none ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-1" onClick={() => handleCategorySelect(id)} aria-label={`Entferne ${cat.category_name}`}><XCircle className="h-3 w-3 text-muted-foreground hover:text-foreground" /></button></Badge>) : null; })}</div>)}
                             </div>
                             {/* Rating Select */}
                            <div>
                                <Label htmlFor="series-rating-select">Mindestbewertung</Label>
                                <Select value={selectedMinRating} onValueChange={setSelectedMinRating}>
                                    <SelectTrigger id="series-rating-select" className="w-full mt-1 h-9 text-sm"><SelectValue placeholder="Bewertung wählen..." /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Alle Bewertungen</SelectItem>
                                        <SelectItem value="4"><Star className="h-4 w-4 inline mr-1 -mt-px text-yellow-400 fill-yellow-400" /> 4+</SelectItem>
                                        <SelectItem value="3"><Star className="h-4 w-4 inline mr-1 -mt-px text-yellow-400 fill-yellow-400" /> 3+</SelectItem>
                                        <SelectItem value="2"><Star className="h-4 w-4 inline mr-1 -mt-px text-yellow-400 fill-yellow-400" /> 2+</SelectItem>
                                        <SelectItem value="1"><Star className="h-4 w-4 inline mr-1 -mt-px text-yellow-400 fill-yellow-400" /> 1+</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                             {/* Suchfeld */}
                            <div>
                                <Label htmlFor="series-search">Suche nach Titel</Label>
                                <div className="relative mt-1">
                                    <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input id="series-search" type="search" placeholder="Serie suchen..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-8 w-full h-9 text-sm" />
                                    {searchTerm && (<Button variant="ghost" size="icon" className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7" onClick={() => setSearchTerm('')} aria-label="Suche zurücksetzen"><XCircle className="h-4 w-4" /></Button>)}
                                </div>
                            </div>
                         </div>

                        {/* --- Serienliste (Virtualisiert) --- */}
<div
    ref={parentRef}
    className="flex-1 min-h-0 overflow-y-auto bg-background"
    style={{ scrollbarGutter: 'stable' }}
>
    <div className="p-2 md:p-3">
        <h2 className="text-xs font-semibold text-muted-foreground px-1 mb-2 sticky top-0 bg-background/80 backdrop-blur-sm z-10 pt-1 pb-1 border-b border-transparent">
            Serien ({filteredSeries.length})
        </h2>
        {isLoading && series.length === 0 ? (
             <div className="space-y-2">
                 {[...Array(10)].map((_, i) => <Skeleton key={i} className="h-[72px] w-full rounded-md" />)}
             </div>
        ) : filteredSeries.length > 0 ? (
            <div style={{ height: `${listVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative', }}>
                {listVirtualizer.getVirtualItems().map((virtualItem) => {
                    const seriesItem = filteredSeries[virtualItem.index];
                    if (!seriesItem) return null;
                    return (
                        <div
                            key={virtualItem.key} data-index={virtualItem.index}
                            ref={listVirtualizer.measureElement}
                            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: `${virtualItem.size}px`, transform: `translateY(${virtualItem.start}px)`, padding: '2px 0' }}
                        >
                            <SeriesListItem
                                series={seriesItem}
                                onClick={handleSeriesClick} // Opens Dialog
                                 // *** KORRIGIERTE ZEILE ***
                                isSelected={!!(selectedSeriesForDialog?.series_id === seriesItem.series_id || (selectedEpisode && seriesInfoForPlayer?.series_id === seriesItem.series_id))}
                            />
                        </div>
                    );
                })}
            </div>
        ) : (
            <div className="text-center text-muted-foreground py-12 px-4 text-sm italic">
                Keine Serien entsprechen den aktuellen Filtern.
            </div>
        )}
    </div>
</div>
                    </div>
                 </div>

                 {/* --- Episoden Dialog --- */}
                 <Dialog open={isEpisodeDialogOpen} onOpenChange={(open) => {setIsEpisodeDialogOpen(open); if (!open) {setSelectedSeriesForDialog(null); setSeriesInfoForPlayer(null);/* Clear context when dialog closes */}}}>
                     <DialogContent className="sm:max-w-[625px] max-h-[80vh] flex flex-col">
                         <DialogHeader>
                              {/* Use selectedSeriesForDialog for title as it's always set when dialog opens */}
                             <DialogTitle>{selectedSeriesForDialog?.name ?? 'Episoden'}</DialogTitle>
                             {/* Use seriesInfoForPlayer for plot as it might be more detailed */}
                             {seriesInfoForPlayer?.plot && <DialogDescription className="line-clamp-3 text-xs">{seriesInfoForPlayer.plot}</DialogDescription>}
                         </DialogHeader>
                         <div className="flex-1 overflow-hidden pr-1"> {/* Maybe remove pr-1 if ScrollArea has padding */}
                             {isFetchingEpisodes ? ( <div className="flex items-center justify-center h-40"><Loader2 className="h-6 w-6 animate-spin text-primary" /><span className="ml-2">Lade Episoden...</span></div>
                             ) : episodeFetchError ? ( <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Fehler</AlertTitle><AlertDescription>{episodeFetchError}</AlertDescription></Alert>
                             ) : Object.keys(episodes).length > 0 ? (
                                 <ScrollArea className="h-[calc(80vh-180px)] pr-4"> {/* Adjust height if header/footer change */}
                                     <Accordion type="single" collapsible className="w-full" defaultValue={`season-${Object.keys(episodes).sort((a, b) => parseInt(a) - parseInt(b))[0]}`}>
                                         {Object.entries(episodes).map(([seasonNum, seasonEpisodes]) => (
                                             <AccordionItem value={`season-${seasonNum}`} key={seasonNum}>
                                                 <AccordionTrigger>Staffel {seasonNum}</AccordionTrigger>
                                                 <AccordionContent>
                                                     <div className="space-y-1">
                                                         {seasonEpisodes.map((episode) => (
                                                             <Button key={episode.id ?? episode.stream_id} variant="ghost" className="w-full justify-start text-left h-auto py-1.5 px-2 hover:bg-accent hover:text-accent-foreground" onClick={() => handleEpisodeClick(episode)} title={episode.info?.plot ?? episode.title ?? episode.info?.name ?? `Episode ${episode.episode_num}`}>
                                                                 <span className="font-mono text-xs w-8 text-right mr-2 flex-shrink-0">{episode.episode_num}.</span>
                                                                 <span className="flex-1 text-sm truncate">{episode.title || episode.info?.name || `Episode ${episode.episode_num}`}</span>
                                                                 {episode.info?.duration && <span className="text-xs text-muted-foreground ml-2">{episode.info.duration}</span>}
                                                             </Button>
                                                         ))}
                                                     </div>
                                                 </AccordionContent>
                                             </AccordionItem>
                                         ))}
                                     </Accordion>
                                 </ScrollArea>
                             ) : ( <div className="text-center text-muted-foreground py-8">Keine Episoden für diese Serie gefunden.</div>
                             )}
                         </div>
                         <DialogFooter className="mt-4 sm:justify-start"><DialogClose asChild><Button type="button" variant="secondary">Schließen</Button></DialogClose></DialogFooter>
                     </DialogContent>
                 </Dialog>

            </div>
        </TooltipProvider>
    );
}