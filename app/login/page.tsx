'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react' // Importiere signIn
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export default function LoginPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [credentials, setCredentials] = useState({
    playlistTitle: '',
    accountName: '',
    password: '',
    serverUrl: ''
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    try {
      // Verwende signIn statt manuellem Fetch
      const result = await signIn('credentials', {
        ...credentials,
        redirect: false, // Verhindere automatische Weiterleitung durch signIn
      })

      if (result?.error) {
        // Fehlerbehandlung von signIn
        throw new Error(result.error === 'CredentialsSignin' ? 'Authentifizierung fehlgeschlagen. Überprüfen Sie Ihre Eingaben.' : result.error);
      } else if (result?.ok) {
        // Erfolgreich angemeldet, leite manuell weiter
        router.push('/dashboard')
      } else {
        // Anderer unerwarteter Fall
        throw new Error('Unbekannter Fehler beim Anmelden');
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className={cn('grid gap-6 w-[400px] mx-auto mt-20')}>
      <h1 className="text-2xl font-bold text-center">Xtream Login</h1>
      <form onSubmit={handleSubmit}>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="playlistTitle">Playlist Titel</Label>
            <Input
              id="playlistTitle"
              value={credentials.playlistTitle}
              onChange={(e) => setCredentials({...credentials, playlistTitle: e.target.value})}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="accountName">Account Name</Label>
            <Input
              id="accountName"
              value={credentials.accountName}
              onChange={(e) => setCredentials({...credentials, accountName: e.target.value})}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Passwort</Label>
            <Input
              id="password"
              type="password"
              value={credentials.password}
              onChange={(e) => setCredentials({...credentials, password: e.target.value})}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="serverUrl">Server-URL</Label>
            <Input
              id="serverUrl"
              value={credentials.serverUrl}
              onChange={(e) => setCredentials({...credentials, serverUrl: e.target.value})}
              required
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <Button type="submit" disabled={isLoading}>
            {isLoading ? 'Wird geladen...' : 'Anmelden'}
          </Button>
        </div>
      </form>
    </div>
  )
}