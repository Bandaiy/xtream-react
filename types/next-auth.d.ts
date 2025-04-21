import { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  /**
   * Returned by `useSession`, `getSession` and received as a prop on the `SessionProvider` React Context
   */
  interface Session {
    user: {
      /** The user's postal address. */
      id: string
      serverUrl?: string // Hinzufügen
      accountName?: string // Hinzufügen
      password?: string // Hinzufügen
    } & DefaultSession['user']
  }

  // Erweitern des User-Objekts, das in Callbacks verwendet wird
  interface User {
    serverUrl?: string
    accountName?: string // Hinzufügen
    password?: string
  }
}

// Erweitern des JWT-Objekts
declare module 'next-auth/jwt' {
  interface JWT {
    serverUrl?: string
    accountName?: string // Hinzufügen
    password?: string
  }
}