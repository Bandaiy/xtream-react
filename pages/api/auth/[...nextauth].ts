import NextAuth from 'next-auth'
import { PrismaAdapter } from '@next-auth/prisma-adapter'
import CredentialsProvider from 'next-auth/providers/credentials'
// import bcrypt from 'bcrypt' // bcrypt wird nicht mehr benötigt für den API-Check
import prisma from '@/lib/prisma'
import axios from 'axios' // Importiere axios

export default NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        playlistTitle: { label: 'Playlist Titel', type: 'text' },
        accountName: { label: 'Account Name', type: 'text' },
        password: { label: 'Passwort', type: 'password' },
        serverUrl: { label: 'Server-URL', type: 'text' }
      },
      async authorize(credentials) {
        if (!credentials) return null

        const { serverUrl, accountName, password, playlistTitle } = credentials

        // Bereinige die Server-URL (entferne / am Ende, falls vorhanden)
        const cleanedServerUrl = serverUrl.endsWith('/') ? serverUrl.slice(0, -1) : serverUrl
        const apiUrl = `${cleanedServerUrl}/player_api.php?username=${accountName}&password=${password}`

        try {
          const response = await axios.get(apiUrl)
          const data = response.data

          // Überprüfe, ob die Authentifizierung erfolgreich war (user_info.auth === 1)
          if (!data || !data.user_info || data.user_info.auth !== 1) {
            throw new Error('Xtream Codes Authentifizierung fehlgeschlagen')
          }

          // Authentifizierung erfolgreich, suche oder erstelle Benutzer in der DB
          let user = await prisma.user.findUnique({
            where: { accountName: accountName } // Annahme: accountName ist eindeutig
          })

          // WICHTIG: Passwort sollte sicher gehasht werden, wenn es für *lokale* Logins verwendet wird.
          // Da wir uns direkt gegen die Xtream API authentifizieren, speichern wir das Passwort hier *nicht*.
          // Wenn das Passwort für spätere API-Aufrufe benötigt wird, muss es im Session-Token gespeichert werden (siehe callbacks).
          // Für dieses Beispiel speichern wir es *nicht* in der DB.
          const userData = {
            playlistTitle: playlistTitle || 'Standard Playlist',
            accountName: accountName,
            hashedPassword: '', // Passwort nicht speichern oder hashen, da API-Login
            serverUrl: cleanedServerUrl
          }

          if (user) {
            // Benutzer existiert, aktualisiere ggf. Daten
            user = await prisma.user.update({
              where: { id: user.id },
              data: {
                playlistTitle: userData.playlistTitle,
                serverUrl: userData.serverUrl,
                // hashedPassword nicht aktualisieren
                updatedAt: new Date() // Aktualisiere updatedAt
              }
            })
          } else {
            // Benutzer existiert nicht, erstelle neuen Eintrag
            user = await prisma.user.create({
              data: userData
            })
          }

          // Gib das User-Objekt für NextAuth zurück
          return {
            id: user.id,
            name: user.accountName, // Verwende accountName als 'name'
            email: null, // email ist nicht relevant hier, kann null sein
            // Zusätzliche Daten für den Token können hier hinzugefügt werden
            serverUrl: user.serverUrl,
            password: password // Passwort für spätere API-Calls im Token speichern
          }
        } catch (error) {
          console.error('Fehler bei der Xtream Codes Authentifizierung:', error)
          // Wirf einen spezifischeren Fehler oder den Originalfehler weiter
          throw new Error(error instanceof Error ? error.message : 'Authentifizierungsfehler')
        }
      }
    })
  ],
  session: {
    strategy: 'jwt'
  },
  callbacks: {
    async session({ session, token }) {
      // Füge benutzerdefinierte Daten zum Session-Objekt hinzu
      if (token) {
        session.user.id = token.sub!
        session.user.serverUrl = token.serverUrl as string
        session.user.password = token.password as string // Passwort zur Session hinzufügen
        session.user.name = token.name // Stelle sicher, dass der Name auch übergeben wird
      }
      return session
    },
    async jwt({ token, user }) {
      // Füge benutzerdefinierte Daten zum JWT hinzu, wenn der Benutzer sich anmeldet
      if (user) {
        token.sub = user.id
        token.serverUrl = user.serverUrl // Kein Cast mehr nötig
        token.password = user.password // Kein Cast mehr nötig
        token.name = user.name
      }
      return token
    }
  },
  pages: {
    signIn: '/login', // Leite zur benutzerdefinierten Login-Seite weiter
  }
})