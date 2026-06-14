import { PrismaAdapter } from '@auth/prisma-adapter'
import GoogleProvider from 'next-auth/providers/google'
import CredentialsProvider from 'next-auth/providers/credentials'
import EmailProvider from 'next-auth/providers/email'
import type { NextAuthOptions } from 'next-auth'
import prisma from '@/lib/db'
import { checkRateLimit } from '@/lib/rate-limit'

// Server-side only - load bcrypt when needed
let bcrypt: any = null;
if (typeof window === 'undefined') {
  try {
    // eslint-disable-next-line global-require
    bcrypt = require('bcryptjs');
  } catch (e) {
    console.error('Failed to load bcryptjs:', e);
  }
}

// Shopify sign-in OAuth is handled via API routes at /api/shopify/connect and /api/shopify/callback
// These allow merchants to connect their Shopify stores to CartGain.
// The flow is: settings page → /api/shopify/connect → Shopify auth → /api/shopify/callback → store linked

const providers: any[] = [
  CredentialsProvider({
    name: 'credentials',
    credentials: {
      email: { label: 'Email', type: 'email' },
      password: { label: 'Password', type: 'password' },
    },
    async authorize(credentials) {
      if (!credentials?.email || !credentials?.password) {
        throw new Error('Invalid credentials')
      }

      const rateLimitResult = await checkRateLimit(`auth/login:${credentials.email}`, {
        maxAttempts: 10,
        windowMs: 15 * 60 * 1000,
      })

      if (!rateLimitResult.success) {
        throw new Error('Too many login attempts. Please try again later.')
      }

      const user = await prisma.user.findUnique({
        where: { email: credentials.email },
      })

      if (!user || !user.password) {
        throw new Error('Invalid credentials')
      }

      const isCorrectPassword = await bcrypt.compare(
        credentials.password,
        user.password
      )

      if (!isCorrectPassword) {
        throw new Error('Invalid credentials')
      }

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
      }
    },
  }),
]

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    })
  )
}



if (process.env.EMAIL_SERVER && process.env.EMAIL_FROM) {
  providers.push(
    EmailProvider({
      server: process.env.EMAIL_SERVER,
      from: process.env.EMAIL_FROM,
    })
  )
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as any,
  providers,
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
    updateAge: 24 * 60 * 60, // Update token every 24 hours
  },
  callbacks: {
    async jwt({ token, user, account }) {
      // Add user info to token when signing in
      if (user) {
        token.id = user.id
        token.email = user.email
        
        // Get user's primary store
        try {
          const store = await prisma.store.findFirst({
            where: { userId: user.id },
            orderBy: { createdAt: 'asc' },
          })
          if (store) {
            token.storeId = store.id
          }
        } catch (error) {
          console.error('Failed to fetch user store:', error)
        }
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.storeId = token.storeId as string
      }
      return session
    },
    async signIn({ user, account }) {
      // If signing in with Google/OAuth, ensure user has a store
      if (account?.provider !== 'credentials' && user.id) {
        const existingStore = await prisma.store.findFirst({
          where: { userId: user.id },
        })

        if (!existingStore) {
          // Create default store for OAuth users
          try {
            await prisma.store.create({
              data: {
                userId: user.id,
                name: user.name || 'My Store',
                domain: user.email?.split('@')[0] || 'store',
                platform: 'shopify',
                currency: 'USD',
                timezone: 'UTC',
              },
            })
          } catch (error) {
            console.error('Failed to create store for OAuth user:', error)
          }
        }
      }
      return true
    },
  },
  events: {
    async createUser({ user }) {
      console.log('New user created:', user.email)
    },
  },
}
