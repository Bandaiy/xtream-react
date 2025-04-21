'use client';

// === Imports ===
import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useSession, signOut } from 'next-auth/react';
import axios from 'axios';
import ReactPlayer from 'react-player';
import { useVirtualizer } from '@tanstack/react-virtual'; // Nur noch dieser Virtualizer
import { Loader2, AlertCircle, Film, Search, XCircle, Star, ChevronsUpDown, LogOut } from 'lucide-react';
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from '@/components/ui/scroll-area'; // ScrollArea wird nur noch für Details verwendet
import { Skeleton } from "@/components/ui/skeleton";

// === Interfaces ===
interface VodCategory {
    category_id: string;
    category_name: string;
    parent_id: number;
}

interface VodStream {
    num: number;
    name: string;
    stream_type: string; // 'movie'
    stream_id: number;
    stream_icon: string | null; // Poster
    rating: string | number | null;
    rating_5based: string | number | null;
    added: string;
    category_id: string;
    container_extension: string;
    custom_sid: string | null;
    direct_source: string;
    plot?: string | null;
    cast?: string | null;
    director?: string | null;
    genre?: string | null;
    releaseDate?: string | null;
    episode_run_time?: string | null;
    youtube_trailer?: string | null;
}

// === Helper Component: MovieListItem ===
interface MovieListItemProps {
    movie: VodStream;
    onClick: (movie: VodStream) => void;
    isSelected: boolean;
}

function MovieListItem({ movie, onClick, isSelected }: MovieListItemProps) {
    const handleImageError = useCallback((e: React.SyntheticEvent<HTMLImageElement, Event>) => {
        e.currentTarget.onerror = null;
        e.currentTarget.style.display = 'none';
        const fallback = e.currentTarget.parentElement?.querySelector('.list-item-fallback');
        if (fallback) fallback.classList.remove('hidden');
    }, []);

    const numericRating = useMemo(() => {
        if (movie.rating_5based != null) {
            const parsed = parseFloat(String(movie.rating_5based));
            if (!isNaN(parsed)) return parsed;
        }
        return null;
    }, [movie.rating_5based]);

    const ratingDisplay = useMemo(() => {
        if (numericRating !== null) {
            return (
                <span className="flex items-center text-xs text-muted-foreground">
                    <Star className="h-3 w-3 mr-1 text-yellow-500 fill-yellow-500" />
                    {numericRating.toFixed(1)} / 5
                </span>
            );
        }
        return null;
    }, [numericRating]); // Removed movie.rating dependency as fallback isn't needed here

    return (
        <div
            className={`flex items-center p-2 cursor-pointer rounded-md transition-colors duration-150 border-b border-transparent ${
                isSelected
                    ? 'bg-primary/10 ring-1 ring-primary/30'
                    : 'hover:bg-muted/50'
            }`}
            onClick={() => onClick(movie)}
            title={`Spiele ${movie.name}`}
            style={{ minHeight: '72px' }} // Feste Mindesthöhe für Virtualisierung
        >
            {/* Kleines Poster links */}
            <div className="w-10 h-14 flex-shrink-0 bg-muted rounded-sm overflow-hidden relative mr-3">
                {movie.stream_icon ? (
                    <img
                        src={movie.stream_icon}
                        alt=""
                        className="object-cover w-full h-full"
                        loading="lazy"
                        onError={handleImageError}
                    />
                ) : null}
                 <div className={`absolute inset-0 flex items-center justify-center bg-muted ${movie.stream_icon ? 'hidden list-item-fallback' : 'list-item-fallback'}`}>
                    <Film className="w-5 h-5 text-muted-foreground/40" />
                </div>
            </div>

            {/* Titel und Rating rechts */}
            <div className="flex-1 overflow-hidden py-1">
                <p
                    className={`text-sm font-medium leading-tight mb-1 ${
                        isSelected ? 'text-primary font-semibold' : ''
                    } truncate`} // Added truncate
                >
                    {movie.name}
                </p>
                {ratingDisplay && <div className="mt-0.5">{ratingDisplay}</div>}
            </div>
        </div>
    );
}


// === Komponente ===
export default function MoviesPage() {
    // --- Session & Grund-States ---
    const { data: session, status } = useSession();
    const [categories, setCategories] = useState<VodCategory[]>([]);
    const [movies, setMovies] = useState<VodStream[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // --- Filter States ---
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
    const [selectedMinRating, setSelectedMinRating] = useState<string>('all');

    // --- Popover State ---
    const [categoryPopoverOpen, setCategoryPopoverOpen] = useState(false);

    // --- Player States ---
    const [selectedMovieStreamUrl, setSelectedMovieStreamUrl] = useState<string | null>(null);
    const [selectedMovie, setSelectedMovie] = useState<VodStream | null>(null);
    const [moviePlayerError, setMoviePlayerError] = useState<string | null>(null);
    const [isPlayerReady, setIsPlayerReady] = useState(false);
    const moviePlayerWrapperRef = useRef<HTMLDivElement>(null);
    const playerRef = useRef<ReactPlayer>(null);

    // --- Virtualization Ref ---
    const parentRef = useRef<HTMLDivElement>(null); // Ref für das Scroll-Element (jetzt ein div)

    // === Effekte ===
     useEffect(() => {
        const fetchMovieData = async () => {
             if (status !== 'authenticated' || !session?.user?.name || !session?.user?.password) { setIsLoading(false); return; }
            setIsLoading(true); setError(null);
            // Reset states on data fetch
            setCategories([]); setMovies([]); setSelectedCategories([]); setSearchTerm(''); setSelectedMinRating('all');
            setSelectedMovie(null); setSelectedMovieStreamUrl(null); setMoviePlayerError(null); setIsPlayerReady(false);

            const { name: username, password } = session.user;
            try {
                const catUrl = `/api/xtream/player_api.php?username=${username}&password=${password}&action=get_vod_categories`;
                const streamUrl = `/api/xtream/player_api.php?username=${username}&password=${password}&action=get_vod_streams`;
                const [catResponse, streamResponse] = await Promise.all([ axios.get(catUrl), axios.get(streamUrl) ]);

                if (catResponse.data && Array.isArray(catResponse.data)) {
                     const validCategories = catResponse.data.filter(cat => cat.category_name?.trim());
                    setCategories(validCategories.sort((a,b) => a.category_name.localeCompare(b.category_name)));
                } else { console.warn('No VOD categories found.'); }
                if (streamResponse.data && Array.isArray(streamResponse.data)) {
                     setMovies(streamResponse.data);
                     console.log("Movies loaded, count:", streamResponse.data.length); // Log movie count
                } else { console.warn('No VOD streams found.'); }
                if ((!catResponse.data || catResponse.data.length === 0) && (!streamResponse.data || streamResponse.data.length === 0)) {
                     setError('Keine Filme oder Kategorien gefunden.');
                }
            } catch (err) {
                console.error('Error fetching VOD data:', err);
                setError(err instanceof Error ? `Fehler: ${err.message}` : 'Unbekannter Fehler.');
                setCategories([]); setMovies([]);
            } finally { setIsLoading(false); }
        };
         if (status === 'authenticated') fetchMovieData();
         else if (status === 'unauthenticated') {
             // Clear data if logged out
             setIsLoading(false);
             setCategories([]); setMovies([]); setSelectedCategories([]); setSearchTerm(''); setSelectedMinRating('all');
             setSelectedMovie(null); setSelectedMovieStreamUrl(null); setMoviePlayerError(null); setIsPlayerReady(false); setError(null);
         }
     }, [status, session]);

    // === Memoized Filter ===
     const filteredMovies = useMemo(() => {
        const minRatingValue = selectedMinRating === 'all' ? 0 : parseInt(selectedMinRating, 10);
        const lowerCaseSearchTerm = searchTerm.toLowerCase();

        const result = movies.filter(movie => {
            const categoryMatch = selectedCategories.length === 0 || selectedCategories.includes(movie.category_id);
            if (!categoryMatch) return false;
            const searchMatch = lowerCaseSearchTerm === '' || movie.name.toLowerCase().includes(lowerCaseSearchTerm);
            if (!searchMatch) return false;
            let currentRating: number | null = null;
            if (movie.rating_5based != null) {
                const parsedRating = parseFloat(String(movie.rating_5based));
                if (!isNaN(parsedRating)) currentRating = parsedRating;
            }
            const ratingMatch = selectedMinRating === 'all' || (currentRating !== null && currentRating >= minRatingValue);
            if (!ratingMatch) return false;
            return true;
        });
        // Log filtered count whenever dependencies change
        // console.log("Filtered movies count:", result.length);
        return result;
     }, [movies, selectedCategories, searchTerm, selectedMinRating]);


    // === Hilfsfunktionen ===
     const handleCategorySelect = useCallback((categoryId: string) => {
        setSelectedCategories(prevSelected => {
            const newSelected = prevSelected.includes(categoryId) ? prevSelected.filter(id => id !== categoryId) : [...prevSelected, categoryId];
            return newSelected;
        });
     }, []);

     const categoryTriggerText = useMemo(() => {
         if (selectedCategories.length === 0) return "Genres/Kategorien wählen...";
         if (selectedCategories.length === 1) {
            const selectedCat = categories.find(cat => cat.category_id === selectedCategories[0]);
            return selectedCat?.category_name ?? "1 ausgewählt";
         }
         return `${selectedCategories.length} Genres/Kategorien`;
     }, [selectedCategories, categories]);

    // === Event Handlers ===
    const handleMovieClick = useCallback((movie: VodStream) => {
        if (!session?.user?.name || !session?.user?.password) return;
        const currentPlayer = playerRef.current;

        if (currentPlayer && selectedMovie?.stream_id !== movie.stream_id) {
            try {
                const internalPlayer = currentPlayer.getInternalPlayer();
                if (internalPlayer?.pause) internalPlayer.pause();
                // currentPlayer.seekTo(0, 'seconds'); // Optional: reset position on switch
                console.log("Attempted to stop previous player before switching.");
            } catch (e) { console.error("Error trying to stop previous player:", e); }
        }

        const { name: username, password } = session.user;
        const streamUrl = `/api/xtream/movie/${username}/${password}/${movie.stream_id}.${movie.container_extension}`;

        if (selectedMovie?.stream_id !== movie.stream_id) {
            console.log(`Switching player to: ${movie.name}`);
            setMoviePlayerError(null);
            setIsPlayerReady(false);
            setSelectedMovie(movie);
            setSelectedMovieStreamUrl(streamUrl);
        } else {
            console.log(`Clicked same movie: ${movie.name}. Ensuring player is visible.`);
        }

        // Scroll player into view (consider adding slight delay if needed)
        moviePlayerWrapperRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

    }, [session, selectedMovie]);

    const handlePlayerReady = useCallback(() => {
        if (selectedMovie) {
            console.log(`Player is ready for: ${selectedMovie.name}. Allowing playback.`);
            setIsPlayerReady(true);
        } else {
            console.warn("onReady called but no movie selected?");
        }
    }, [selectedMovie]);

    const handleMoviePlayerError = useCallback((err: unknown) => {
        console.error('Movie Player Error:', err);
        const message = 'Unbekannter Fehler beim Laden des Films.'; // Simplified error message
        setMoviePlayerError(`Film konnte nicht geladen werden. (${message})`);
        setIsPlayerReady(false);
    }, []);

    const closeMoviePlayer = useCallback(() => {
        console.log("Attempting to close player...");
        const player = playerRef.current;
        if (player) {
            try {
                const internalPlayer = player.getInternalPlayer();
                if (internalPlayer?.pause) internalPlayer.pause();
                // player.seekTo(0, 'seconds'); // Optional: Reset position on close
                console.log("Called internalPlayer.pause()");
            } catch (e) { console.error("Error during player cleanup:", e); }
        } else { console.warn("Player ref was null when trying to close."); }

        setSelectedMovieStreamUrl(null);
        setMoviePlayerError(null);
        setIsPlayerReady(false);
        setSelectedMovie(null); // Deselect movie
    }, []);


    // === Virtualization Setup ===
    const ESTIMATED_LIST_ITEM_HEIGHT = 72 + 4; // 72px MinHeight + 4px padding (2px oben/unten im Wrapper)
    const listVirtualizer = useVirtualizer({
        count: filteredMovies.length,
        getScrollElement: useCallback(() => parentRef.current, []), // Directly use the ref
        estimateSize: useCallback(() => ESTIMATED_LIST_ITEM_HEIGHT, []),
        overscan: 8,
    });

    // === Hilfsfunktionen für Formatierung ===
    const formatAddedDate = (addedTimestamp: string | null | undefined): string | null => {
        if (!addedTimestamp) return null;
        try {
            const date = new Date(parseInt(addedTimestamp, 10) * 1000);
            return date.toLocaleDateString('de-DE', { year: 'numeric', month: 'short', day: 'numeric' });
        } catch { return null; }
    };
    const formatReleaseDate = (releaseDate: string | null | undefined): string | null => {
        if (!releaseDate) return null;
        try {
             const date = new Date(releaseDate);
             if (isNaN(date.getTime())) return releaseDate; // Return original if invalid
             return date.toLocaleDateString('de-DE', { year: 'numeric', month: 'long' });
        } catch { return releaseDate; } // Return original on error
    }

    // === Render Conditions ===
    if (status === 'loading' || (status === 'authenticated' && isLoading && movies.length === 0 && !error)) {
       return <div className="flex items-center justify-center min-h-screen"><Loader2 className="h-8 w-8 animate-spin mr-2 text-primary" /><span>Lade Filme...</span></div>;
    }
    if (status === 'unauthenticated') {
        return <div className="flex flex-col items-center justify-center min-h-screen p-4"><Alert variant="destructive" className="max-w-md mb-4"><AlertCircle className="h-4 w-4" /><AlertTitle>Nicht angemeldet</AlertTitle><AlertDescription>Bitte melden Sie sich an.</AlertDescription></Alert><Button onClick={() => window.location.href = '/login'}>Zum Login</Button></div>;
    }
    if (!isLoading && (error || (status === 'authenticated' && movies.length === 0 && !error))) { // Adjusted condition for no movies
        const title = error ? "Fehler beim Laden" : "Keine Daten gefunden";
        const description = error ? error : `Es wurden keine Filme ${categories.length === 0 ? 'oder Kategorien' : ''} auf dem Server gefunden.`;
        return (
           <div className="flex flex-col h-screen bg-background">
                <div className="flex flex-col sm:flex-row justify-between sm:items-center p-3 md:p-4 border-b gap-2 shrink-0 bg-card text-card-foreground">
                     <h1 className="text-lg md:text-xl font-bold flex items-center truncate">
                        <Film className="mr-2 h-5 w-5 md:h-6 md:w-6 flex-shrink-0 text-primary" />
                         <span className="truncate">Filme</span>
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
    // Log total size for debugging
    // useEffect(() => {
    //      if (parentRef.current) {
    //          console.log("Scroll Parent Height:", parentRef.current.clientHeight);
    //          console.log("Virtualizer Total Size:", listVirtualizer.getTotalSize());
    //      }
    // }, [listVirtualizer, filteredMovies.length]); // Log when size or count changes

    return (
        <TooltipProvider delayDuration={300}>
            <div className="flex flex-col h-screen bg-background">
                {/* --- Header --- */}
                 <div className="flex flex-col sm:flex-row justify-between sm:items-center p-3 md:p-4 border-b gap-2 shrink-0 bg-card text-card-foreground">
                    <h1 className="text-lg md:text-xl font-bold flex items-center truncate">
                        <Film className="mr-2 h-5 w-5 md:h-6 md:w-6 flex-shrink-0 text-primary" />
                        <span className="truncate">Filme</span>
                    </h1>
                    <Button onClick={() => signOut({ callbackUrl: '/login' })} variant="outline" size="sm">
                        <LogOut className="mr-2 h-4 w-4" /> Abmelden
                    </Button>
                </div>

                {/* --- Hauptinhalt (Player links, Liste rechts) --- */}
                <div className="flex flex-1 overflow-hidden"> {/* overflow-hidden auf dem Parent */}

                     {/* --- Linke Spalte: Player & Film-Details --- */}
                    <div ref={moviePlayerWrapperRef} className={`relative flex flex-col ${selectedMovie ? 'w-full md:w-2/3 border-r border-border' : 'hidden md:flex md:w-2/3 border-r border-border'} overflow-hidden`}> {/* overflow-hidden hinzugefügt */}
                        {/* Container für Player + Details, ermöglicht internes Scrolling */}
                        <div className="flex flex-col h-full overflow-hidden"> {/* Parent für internes Scrolling */}
                            {selectedMovie ? (
                                <>
                                    {/* Player Sektion (feste Höhe) */}
                                    <div className="flex-shrink-0 p-3 md:p-4">
                                        <div className="flex justify-between items-center mb-3">
                                            <h2 className="text-lg md:text-xl font-semibold truncate pr-2" title={selectedMovie.name}>
                                                {selectedMovie.name}
                                            </h2>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Button onClick={closeMoviePlayer} variant="ghost" size="icon">
                                                        <XCircle className="h-5 w-5 text-muted-foreground hover:text-destructive" />
                                                    </Button>
                                                </TooltipTrigger>
                                                <TooltipContent><p>Player schließen</p></TooltipContent>
                                            </Tooltip>
                                        </div>
                                        <AspectRatio ratio={16 / 9} className="bg-black rounded-md overflow-hidden shadow-lg mb-4 relative">
                                            {!isPlayerReady && selectedMovieStreamUrl && (
                                                <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
                                                    <Loader2 className="h-10 w-10 animate-spin text-white" />
                                                </div>
                                            )}
                                            {selectedMovieStreamUrl && (
                                                <ReactPlayer
                                                    ref={playerRef} key={selectedMovieStreamUrl}
                                                    className='react-player absolute top-0 left-0'
                                                    url={selectedMovieStreamUrl}
                                                    playing={isPlayerReady} // Play only when ready
                                                    onReady={handlePlayerReady}
                                                    controls={true}
                                                    width='100%' height='100%'
                                                    onError={handleMoviePlayerError}
                                                    config={{ file: { attributes: { controlsList: 'nodownload' } } }}
                                                    onEnded={closeMoviePlayer}
                                                />
                                            )}
                                        </AspectRatio>
                                        {moviePlayerError && (
                                            <Alert variant="destructive" className="mt-4">
                                                <AlertCircle className="h-4 w-4" /><AlertTitle>Player Fehler</AlertTitle><AlertDescription>{moviePlayerError}</AlertDescription>
                                            </Alert>
                                        )}
                                    </div>

                                    {/* Film-Details Sektion (scrollbarer Rest) */}
                                    {/* ScrollArea wird jetzt hier verwendet */}
                                    <ScrollArea className="flex-grow min-h-0 p-3 md:p-4 pt-0"> {/* min-h-0 wichtig für Flex */}
                                        <div className="space-y-4 pb-4">
                                            <Card className="shadow-sm border-border/60">
                                                <CardHeader className="pb-2 pt-3 px-3 md:pt-4 md:px-4"><CardTitle className="text-base font-semibold">Details</CardTitle></CardHeader>
                                                <CardContent className="px-3 pb-3 md:px-4 md:pb-4 text-sm space-y-2">
                                                     {selectedMovie.genre && <div><span className="font-semibold">Genre:</span> {selectedMovie.genre}</div>}
                                                     {selectedMovie.releaseDate && <div><span className="font-semibold">Veröffentlicht:</span> {formatReleaseDate(selectedMovie.releaseDate)}</div>}
                                                     {selectedMovie.added && <div><span className="font-semibold">Hinzugefügt:</span> {formatAddedDate(selectedMovie.added)}</div>}
                                                     {selectedMovie.episode_run_time && <div><span className="font-semibold">Laufzeit:</span> ca. {selectedMovie.episode_run_time} Min.</div>}
                                                     {selectedMovie.cast && <div><span className="font-semibold">Besetzung:</span> <span className="text-muted-foreground text-xs">{selectedMovie.cast}</span></div>}
                                                     {selectedMovie.director && <div><span className="font-semibold">Regie:</span> <span className="text-muted-foreground text-xs">{selectedMovie.director}</span></div>}
                                                </CardContent>
                                            </Card>
                                             {selectedMovie.plot && (
                                                 <Card className="shadow-sm border-border/60">
                                                     <CardHeader className="pb-2 pt-3 px-3 md:pt-4 md:px-4"><CardTitle className="text-base font-semibold">Handlung</CardTitle></CardHeader>
                                                     <CardContent className="px-3 pb-3 md:px-4 md:pb-4 text-sm text-muted-foreground">{selectedMovie.plot}</CardContent>
                                                 </Card>
                                             )}
                                        </div>
                                    </ScrollArea>
                                </>
                            ) : (
                                // Platzhalter, wenn kein Film ausgewählt ist
                                <div className="hidden md:flex flex-col items-center justify-center h-full text-muted-foreground text-center px-6">
                                    <Film className="h-16 w-16 mb-4 opacity-30" />
                                    <p className="text-lg font-medium">Kein Film ausgewählt</p>
                                    <p className="text-sm">Wählen Sie rechts einen Film aus der Liste.</p>
                                </div>
                            )}
                         </div>
                    </div>


                    {/* --- Rechte Spalte: Filter & Filmliste --- */}
                    <div className={`flex flex-col ${selectedMovie ? 'w-full md:w-1/3' : 'w-full'} overflow-hidden`}> {/* overflow-hidden hinzugefügt */}
                        {/* --- Filter/Such Controls --- */}
                         <div className="p-3 md:p-4 space-y-4 border-b shrink-0 bg-card">
                            {/* Kategorie/Genre Popover */}
                            <div>
                                <Label htmlFor="category-trigger">Genres / Kategorien</Label>
                                <Popover open={categoryPopoverOpen} onOpenChange={setCategoryPopoverOpen}>
                                    <PopoverTrigger asChild>
                                        <Button id="category-trigger" variant="outline" role="combobox" aria-expanded={categoryPopoverOpen} className="w-full justify-between mt-1 h-9 text-sm" disabled={categories.length === 0} title={categoryTriggerText}>
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
                                                    {categories.map((category) => (<CommandItem key={category.category_id} value={category.category_name} onSelect={() => { handleCategorySelect(category.category_id); }} className="cursor-pointer"><Checkbox id={`cat-${category.category_id}`} className="mr-2 pointer-events-none" checked={selectedCategories.includes(category.category_id)} /><span className="flex-1 truncate" title={category.category_name}>{category.category_name}</span></CommandItem>))}
                                                </CommandGroup>
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                                {selectedCategories.length > 0 && (<div className="mt-2 flex flex-wrap gap-1">{selectedCategories.map(id => { const cat = categories.find(c => c.category_id === id); return cat ? (<Badge key={id} variant="secondary" className="text-xs">{cat.category_name}<button type="button" className="ml-1 rounded-full outline-none ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-1" onClick={() => handleCategorySelect(id)} aria-label={`Entferne ${cat.category_name}`}><XCircle className="h-3 w-3 text-muted-foreground hover:text-foreground" /></button></Badge>) : null; })}</div>)}
                            </div>
                             {/* Rating Select */}
                            <div>
                                <Label htmlFor="movie-rating-select">Mindestbewertung</Label>
                                <Select value={selectedMinRating} onValueChange={setSelectedMinRating}>
                                    <SelectTrigger id="movie-rating-select" className="w-full mt-1 h-9 text-sm"><SelectValue placeholder="Bewertung wählen..." /></SelectTrigger>
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
                                <Label htmlFor="movie-search">Suche nach Titel</Label>
                                <div className="relative mt-1">
                                    <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input id="movie-search" type="search" placeholder="Film suchen..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-8 w-full h-9 text-sm" />
                                    {searchTerm && (<Button variant="ghost" size="icon" className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7" onClick={() => setSearchTerm('')} aria-label="Suche zurücksetzen"><XCircle className="h-4 w-4" /></Button>)}
                                </div>
                            </div>
                        </div>

                        {/* --- Filmliste (Immer Listenansicht) --- */}
                        {/* Änderung: Einfaches div statt ScrollArea */}
                        <div
                             ref={parentRef} // Ref direkt auf das scrollbare Div
                             className="flex-1 min-h-0 overflow-y-auto bg-background" // Flex-Grow, min-h-0!, Scrollbar
                             style={{ scrollbarGutter: 'stable' }} // Verhindert Layout-Shift
                        >
                            {/* Inneres Div für Padding und Sticky Header */}
                            <div className="p-2 md:p-3">
                                <h2 className="text-xs font-semibold text-muted-foreground px-1 mb-2 sticky top-0 bg-background/80 backdrop-blur-sm z-10 pt-1 pb-1 border-b border-transparent">
                                    Filme ({filteredMovies.length})
                                </h2>

                                {isLoading && movies.length === 0 ? (
                                     // Skeleton für Listenansicht
                                     <div className="space-y-2">
                                         {[...Array(10)].map((_, i) => <Skeleton key={i} className="h-[72px] w-full rounded-md" />)}
                                     </div>
                                ) : filteredMovies.length > 0 ? (
                                    // --- Listenansicht mit Virtualisierung ---
                                    <div
                                        style={{
                                            height: `${listVirtualizer.getTotalSize()}px`,
                                            width: '100%',
                                            position: 'relative',
                                        }}
                                    >
                                        {listVirtualizer.getVirtualItems().map((virtualItem) => {
                                            const movie = filteredMovies[virtualItem.index];
                                            if (!movie) return null; // Sicherheitscheck
                                            return (
                                                <div
                                                    key={virtualItem.key}
                                                    data-index={virtualItem.index}
                                                    ref={listVirtualizer.measureElement} // Wichtig für Größenmessung
                                                    style={{
                                                        position: 'absolute',
                                                        top: 0,
                                                        left: 0,
                                                        width: '100%',
                                                        height: `${virtualItem.size}px`, // Use measured/estimated size
                                                        transform: `translateY(${virtualItem.start}px)`,
                                                        padding: '2px 0' // Kleiner vertikaler Abstand für ListItems
                                                    }}
                                                >
                                                    <MovieListItem
                                                        movie={movie}
                                                        onClick={handleMovieClick}
                                                        isSelected={selectedMovie?.stream_id === movie.stream_id}
                                                    />
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    // --- Keine Ergebnisse nach Filterung ---
                                    <div className="text-center text-muted-foreground py-12 px-4 text-sm italic">
                                        Keine Filme entsprechen den aktuellen Filtern.
                                    </div>
                                )}
                            </div>
                        </div>
                        {/* Ende des geänderten Scroll-Containers */}
                    </div>
                </div>
            </div>
        </TooltipProvider>
    );
}