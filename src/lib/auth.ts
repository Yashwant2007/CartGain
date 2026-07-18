import { PrismaAdapter } from '@auth/prisma-adapter'
import GoogleProvider from 'next-auth/providers/google'
import CredentialsProvider from 'next-auth/providers/credentials'
import EmailProvider from 'next-auth/providers/email'
import type { NextAuthOptions } from 'next-auth'
import prisma from '@/lib/db'
import { checkRateLimit } from '@/lib/rate-limit'
import { loginSchema } from '@/lib/auth-utils'

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
      const parsed = loginSchema.safeParse(credentials)
      if (!parsed.success) {
        throw new Error(parsed.error.errors[0]?.message || 'Invalid credentials')
      }

      const { email, password } = parsed.data

      const rateLimitResult = await checkRateLimit(`auth/login:${email}`, {
        maxAttempts: 10,
        windowMs: 15 * 60 * 1000,
      })

      if (!rateLimitResult.success) {
        throw new Error('Too many login attempts. Please try again later.')
      }

      const user = await prisma.user.findUnique({
        where: { email },
      })

      if (!user || !user.password) {
        throw new Error('Invalid credentials')
      }

      const isCorrectPassword = await bcrypt.compare(
        password,
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

const vercelUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined
const nextAuthUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || vercelUrl || 'https://cart-gain.com'

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          prompt: 'select_account',
        },
      },
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
  // SameSite=none is required so the session cookie is sent when CartGain
  // runs inside a third-party iframe (e.g. Shopify admin). Without this,
  // Safari blocks the cookie entirely and the user appears logged out.
  cookies: nextAuthUrl.startsWith('https://') ? {
    sessionToken: {
      name: '__Secure-next-auth.session-token',
      options: { httpOnly: true, sameSite: 'none', path: '/', secure: true },
    },
  } : undefined,
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
    async signIn({ user, account, profile }) {
      try {
        // Allow linking Google OAuth to existing credentials-based accounts
        if (account?.provider === 'google') {
          const email = user.email || profile?.email
          if (email) {
            const existingUser = await prisma.user.findUnique({
              where: { email },
              include: { accounts: true },
            })
            if (existingUser) {
              const isLinked = existingUser.accounts.some(
                a => a.provider === 'google'
              )
              if (!isLinked) {
                await prisma.account.upsert({
                  where: {
                    provider_providerAccountId: {
                      provider: 'google',
                      providerAccountId: account.providerAccountId,
                    },
                  },
                  update: {},
                  create: {
                    userId: existingUser.id,
                    type: account.type,
                    provider: 'google',
                    providerAccountId: account.providerAccountId,
                    access_token: account.access_token,
                    refresh_token: account.refresh_token,
                    expires_at: account.expires_at,
                    token_type: account.token_type,
                    scope: account.scope,
                    id_token: account.id_token,
                    session_state: account.session_state,
                  },
                })
              }
              // Ensure store exists for the existing user
              const existingStore = await prisma.store.findFirst({
                where: { userId: existingUser.id },
              })
              if (!existingStore) {
                await prisma.store.create({
                  data: {
                    userId: existingUser.id,
                    name: existingUser.name || 'My Store',
                    domain: (email || '').split('@')[0] || 'store',
                    platform: 'shopify',
                    currency: 'USD',
                    timezone: 'UTC',
                  },
                })
              }
              return true
            }
          }
        }

        // For all other OAuth providers, ensure a store exists
        if (account?.provider !== 'credentials' && user.id) {
          const existingStore = await prisma.store.findFirst({
            where: { userId: user.id },
          })
          if (!existingStore) {
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
          }
        }
      } catch (error) {
        console.error('signIn callback error:', error)
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
