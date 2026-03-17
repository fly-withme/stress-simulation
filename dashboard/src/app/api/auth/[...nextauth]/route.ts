import NextAuth from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"

const handler = NextAuth({
  providers: [
    CredentialsProvider({
      name: 'Credentials (Prototype)',
      credentials: {
        username: { label: "Username", type: "text", placeholder: "johndoe" },
        email: { label: "Email", type: "email", placeholder: "lukas@uni-tuebingen.de" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        // Mock authorization for prototyping
        if (credentials?.email && credentials?.password) {
          return { id: "1", name: credentials.username || credentials.email.split('@')[0], email: credentials.email }
        }
        return null
      }
    })
  ],
  secret: process.env.NEXTAUTH_SECRET || 'fallback_secret_for_local_dev',
})

export { handler as GET, handler as POST }
