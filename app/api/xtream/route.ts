// app/api/xtream/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next'; // getServerSession is from here
import type { Session } from 'next-auth';         // Session type is from here
import authOptions from '@/pages/api/auth/[...nextauth]';
import axios from 'axios';

export async function POST(request: Request) {
  // Use 'Session' type imported from 'next-auth'
  const session = await getServerSession(authOptions) as Session | null;

  // Überprüfen, ob die Sitzung und die Benutzerdaten vorhanden sind
  // Accessing user.name as configured in your callbacks
  if (!session?.user?.serverUrl || !session?.user?.name || !session?.user?.password) {
    console.error('[API Route] Authentication failed: Missing session data.', {
        hasSession: !!session,
        hasUser: !!session?.user,
        hasServerUrl: !!session?.user?.serverUrl,
        hasName: !!session?.user?.name, // Check for name
        hasPassword: !!session?.user?.password,
    });
    return NextResponse.json({ error: 'Nicht authentifiziert oder fehlende Anmeldedaten in der Sitzung' }, { status: 401 });
  }

  // accountName is available as session.user.name based on your NextAuth callbacks
  const { serverUrl, name: accountName, password } = session.user;

  // Erwarte optional 'action' und 'category_id' vom Client
  const body = await request.json().catch(() => ({})); // Leeres Objekt, falls kein Body
  const action = body.action || 'get_live_streams'; // Standardaktion
  const categoryId = body.category_id; // Optional

  let apiUrl = `${serverUrl}/player_api.php?username=${accountName}&password=${password}&action=${action}`;

  // Füge category_id hinzu, falls vorhanden und für die Aktion benötigt
  const actionsRequiringCategoryId = ['get_live_streams', 'get_vod_streams', 'get_series'];
  if (actionsRequiringCategoryId.includes(action) && categoryId) {
    apiUrl += `&category_id=${categoryId}`;
  }

  console.log(`[API Route] Requesting URL: ${apiUrl}`); // Logging für Debugging

  try {
    const response = await axios.get(apiUrl, {
        timeout: 10000, // 10 Sekunden Timeout
        headers: {
            'User-Agent': 'Mozilla/5.0 (NextJsApp/1.0)' // Example User-Agent
        },
        // Wichtig: Stelle sicher, dass der Server gültige HTTPS-Zertifikate hat
        // Bei selbst-signierten Zertifikaten ggf. Validierung deaktivieren (NICHT EMPFOHLEN für Produktion):
        // httpsAgent: new https.Agent({ rejectUnauthorized: false }) // Benötigt 'import https from 'https';'
    });

    // Überprüfen, ob die Antwort gültig ist und Daten enthält
    if (response.status !== 200 || !response.data) {
        console.error('[API Route] Invalid response from Xtream API:', response.status, response.data);
        throw new Error(`Ungültige Antwort von der Xtream API (Status: ${response.status})`);
    }

    // Spezifische Prüfung für Authentifizierungsfehler in der Antwort
    // Manche APIs geben 200 OK zurück, aber mit auth: 0 im Body
    if (response.data?.user_info?.auth === 0) {
        console.error('[API Route] Authentication failed at Xtream API.');
        // Gib den spezifischen Fehler zurück, den wir vom Xtream-Server erhalten haben
        return NextResponse.json({ error: 'Xtream API Authentifizierung fehlgeschlagen', details: response.data }, { status: 401 });
    }

     // Spezifische Prüfung für leere Arrays
     if (Array.isArray(response.data) && response.data.length === 0) {
        console.warn('[API Route] Empty data array received from Xtream API.');
        // Hier entscheiden, ob das okay ist oder ein Fehler/Warnung zurückgegeben werden soll
        // return NextResponse.json({ warning: 'Keine Daten für diese Anfrage gefunden.' }, { status: 200 });
    }


    console.log('[API Route] Successful response from Xtream API.');
    return NextResponse.json(response.data);

  } catch (error) {
    console.error('[API Route] Error fetching Xtream data:', error);

    if (axios.isAxiosError(error)) {
        console.error('[API Route] Axios Error Details:', {
            message: error.message,
            code: error.code,
            status: error.response?.status,
            data: error.response?.data,
            url: error.config?.url, // Zeigt die tatsächlich angefragte URL
        });

        if (error.code === 'ECONNABORTED') {
            return NextResponse.json({ error: 'Timeout beim Verbinden mit dem Xtream Server' }, { status: 504 }); // Gateway Timeout
        } else if (error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN') {
            return NextResponse.json({ error: 'Xtream Server nicht gefunden oder DNS-Problem' }, { status: 502 }); // Bad Gateway
        } else if (error.response) {
            // Server hat geantwortet, aber mit einem Fehlerstatus (z.B. 4xx, 5xx)
             // Versuche, eine spezifischere Fehlermeldung vom Xtream-Server zu extrahieren, falls vorhanden
            const xtreamError = error.response.data?.message || error.response.data?.error || `Xtream Server Fehler: ${error.response.status}`;
            return NextResponse.json({ error: xtreamError, statusText: error.response.statusText }, { status: error.response.status });
        } else if (error.request) {
             // Anfrage wurde gesendet, aber keine Antwort erhalten (Netzwerkfehler, CORS etc.)
             return NextResponse.json({ error: 'Keine Antwort vom Xtream Server erhalten (Netzwerkproblem?)' }, { status: 503 }); // Service Unavailable
        } else {
           // Fehler beim Einrichten der Anfrage
           return NextResponse.json({ error: 'Fehler beim Erstellen der Anfrage an den Xtream Server' }, { status: 500 });
        }
    } else {
        // Andere, nicht-Axios Fehler (z.B. Fehler im Code hier)
        const errorMessage = error instanceof Error ? error.message : 'Unbekannter interner Fehler';
        return NextResponse.json({ error: 'Interner Serverfehler beim Verarbeiten der Anfrage', details: errorMessage }, { status: 500 });
    }
  }
}