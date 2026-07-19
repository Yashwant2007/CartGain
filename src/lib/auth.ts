import { PrismaAdapter } from '@auth/prisma-adapter'
import GoogleProvider from 'next-auth/providers/google'
import CredentialsProvider from 'next-auth/providers/credentials'
import EmailProvider from 'next-auth/providers/email'
import type { NextAuthOptions } from 'next-auth'
import { cookies } from 'next/headers'
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

      if (!user) {
        throw new Error('NoAccount')
      }

      if (!user.password) {
        throw new Error('GoogleOnly')
      }

      const isCorrectPassword = await bcrypt.compare(
        password,
        user.password
      )

      if (!isCorrectPassword) {
        throw new Error('WrongPassword')
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
      allowDangerousEmailAccountLinking: true,
      authorization: {
        params: {
          prompt: 'select_account consent',
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
  // SameSite=lax works for navigation flows (OAuth, login); the cookie is
  // still sent with Secure so it never leaks over plain HTTP. We intentionally
  // avoid the __Secure- prefix because Chromium may drop it in cross-site 302
  // redirect chains that happen during OAuth callbacks.
  cookies: {
    sessionToken: {
      name: 'next-auth.session-token',
      options: { httpOnly: true, sameSite: 'lax', path: '/', secure: true },
    },
  },
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
        if (account?.provider === 'google') {
          const email = user.email || profile?.email
          if (!email) {
            // No email returned by Google — block sign-in.
            return false
          }

          // The signup and login pages set a short-lived cookie before
          // redirecting to Google so we can tell whether this OAuth round-trip
          // is a brand-new sign-up attempt or an existing-user sign-in.
          const intent = cookies().get('cg_oauth_intent')?.value
          const isSignupIntent = intent === 'signup'

          console.log('[signIn:google] email:', email, 'intent:', intent)

          // Always clear the cookie once consumed.
          cookies().set('cg_oauth_intent', '', {
            path: '/',
            maxAge: 0,
            sameSite: 'lax',
            httpOnly: true,
          })

          const existingUser = await prisma.user.findUnique({
            where: { email },
            include: { accounts: true },
          })

          console.log('[signIn:google] existingUser:', !!existingUser, 'password:', !!existingUser?.password)

          // Sign-in flow: the account must already exist. Block silent
          // account creation and send the visitor back to sign up first.
          if (!existingUser) {
            if (isSignupIntent) {
              console.log('[signIn:google] new user signup — falling through to store creation')
              // Allow the signup flow to create the account. NextAuth v4
              // PrismaAdapter creates the User + Account records before this
              // callback fires, so user.id is already available. We fall
              // through to the generic store-creation block below to make
              // sure the new user has a Store row before they hit /setup.
              // No early return — keep going.
            } else {
              console.log('[signIn:google] no existing account and no signup intent — redirecting to login')
              // Login flow — account does not exist. Surface friendly error.
              return `/login?error=NoAccount`
            }
          } else {
            const isLinked = existingUser.accounts.some(
              a => a.provider === 'google'
            )
            console.log('[signIn:google] existing user, isLinked:', isLinked)
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
              console.log('[signIn:google] linked google account to existing user')
            }

            // Ensure a store exists for the existing user
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
              console.log('[signIn:google] created store for existing user')
            }

            // Force users without a password through the set-password flow
            // so they can later sign in with email + password too.
            if (!existingUser.password) {
              console.log('[signIn:google] user has no password — redirecting to /setup?requirePassword=1')
              return `/setup?requirePassword=1`
            }

            console.log('[signIn:google] user has password — returning true')
            return true
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
        // Fail closed on unexpected errors
        return false
      }
      return true
    },
  },
  events: {
    async createUser({ user }) {
      console.log('New user created:', user.email)
      // Make sure every new user has a Store row so the dashboard and the
      // /setup page can rely on it. This fires after the User row is
      // persisted, so user.id is the real DB cuid.
      try {
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
      } catch (error) {
        console.error('createUser: failed to create default store:', error)
      }
    },
  },
}
