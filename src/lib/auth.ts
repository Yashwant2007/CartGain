import { PrismaAdapter } from '@auth/prisma-adapter'
import GoogleProvider from 'next-auth/providers/google'
import CredentialsProvider from 'next-auth/providers/credentials'
import EmailProvider from 'next-auth/providers/email'
import type { NextAuthOptions } from 'next-auth'
import { getToken } from 'next-auth/jwt'
import { cookies } from 'next/headers'
import prisma from '@/lib/db'
import { checkRateLimit } from '@/lib/rate-limit'
import { loginSchema } from '@/lib/auth-utils'
import { createFreeSubscription } from '@/lib/subscription'
import { verifyTotpCode } from '@/lib/totp'

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

// ── JWT session revocation ────────────────────────────────────────────────────
// JWTs are stateless, so a password change cannot reach tokens already in the
// wild. Every token is stamped with the account's `tokenVersion` at sign-in;
// when the password changes we bump the DB value and any token holding the old
// version is rejected. The version is cached briefly per instance so a session
// authed on every API request does not hit the DB on every call — worst-case
// revocation lag is the TTL below.
const TOKEN_VERSION_TTL_MS = 60 * 1000
const tokenVersionCache = new Map<string, { version: number; at: number }>()

async function getCurrentTokenVersion(userId: string): Promise<number | null> {
  const cached = tokenVersionCache.get(userId)
  if (cached && Date.now() - cached.at < TOKEN_VERSION_TTL_MS) return cached.version
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { tokenVersion: true },
  })
  if (!row) return null
  tokenVersionCache.set(userId, { version: row.tokenVersion, at: Date.now() })
  return row.tokenVersion
}

// Called right after a password change/reset so the bump is honoured immediately
// on this instance instead of waiting out the TTL.
export function invalidateTokenVersionCache(userId?: string): void {
  if (userId) tokenVersionCache.delete(userId)
  else tokenVersionCache.clear()
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
      // Second factor. Supplied on the follow-up request once the server has
      // told the client that this account requires a TOTP code.
      code: { label: '2FA code', type: 'text' },
    },
    async authorize(credentials) {
      const parsed = loginSchema.safeParse(credentials)
      if (!parsed.success) {
        throw new Error(parsed.error.errors[0]?.message || 'Invalid credentials')
      }

      // Normalize so "User@X.com" and "user@x.com" resolve to the same account
      // (and the same rate-limit bucket).
      const email = parsed.data.email.trim().toLowerCase()
      const { password } = parsed.data

      const rateLimitResult = await checkRateLimit(`auth/login:${email}`, {
        maxAttempts: 10,
        windowMs: 15 * 60 * 1000,
      })

      if (!rateLimitResult.success) {
        throw new Error('Too many login attempts. Please try again later.')
      }

      // Case-insensitive lookup tolerates accounts created before email
      // normalization was enforced.
      const user = await prisma.user.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
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

      // Password verified — only now is it safe to disclose verification state.
      // Unverified credentials accounts may not sign in until they confirm their
      // email (the resend link is available on the login page).
      if (!user.emailVerified) {
        throw new Error('EmailNotVerified')
      }

      // Second factor. A password alone must never complete a sign-in for an
      // account that has TOTP enabled. The first request (no code) is answered
      // with 2FARequired so the client can prompt for the code; the follow-up
      // carries `code` and is only accepted when it verifies. This runs AFTER
      // the password check so an attacker cannot use it to probe 2FA state.
      if (user.totpEnabled) {
        if (!user.totpSecret) {
          // Enabled flag without a secret is an inconsistent state — fail closed.
          throw new Error('2FAConfigError')
        }
        const code = typeof credentials?.code === 'string' ? credentials.code.trim() : ''
        if (!code) {
          throw new Error('2FARequired')
        }
        if (!/^\d{6}$/.test(code) || !verifyTotpCode(user.totpSecret, code)) {
          throw new Error('2FAInvalid')
        }
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
      // The callback URL must be NextAuth's canonical absolute redirect_uri
      // ({NEXTAUTH_URL}/api/auth/callback/google). Do NOT pass a callbackUrl
      // param in authorization.params — a relative value breaks Google's
      // redirect_uri validation with redirect_uri_mismatch. Google's OAuth
      // server also strips unknown params, so it could never work anyway.
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
  // NOTE: cookies use SameSite=None so they're sent to cross-site requests
  // from the embedded Shopify admin iframe (admin.shopify.com → cart-gain.com).
  // Lax cookies are withheld for iframe requests, which broke the session
  // in the embedded app. Secure is required for SameSite=None.
  cookies: {
    sessionToken: {
      name: 'next-auth.session-token',
      // partitioned (CHIPS) lets Chrome keep the session when the app is
      // embedded in a cross-site iframe (admin.shopify.com -> cart-gain.com)
      // under third-party-cookie blocking. The OAuth popup opened from the
      // iframe inherits the opener's partition, so the cookie it sets during
      // the Google callback is readable by the iframe afterwards.
      options: {
        httpOnly: true,
        sameSite: 'none',
        path: '/',
        secure: true,
        partitioned: true,
      } as any,
    },
    callbackUrl: {
      name: 'next-auth.callback-url',
      options: {
        httpOnly: true,
        sameSite: 'none',
        path: '/',
        secure: true,
        partitioned: true,
      } as any,
    },
    csrfToken: {
      name: 'next-auth.csrf-token',
      options: {
        httpOnly: true,
        sameSite: 'none',
        path: '/',
        secure: true,
        partitioned: true,
      } as any,
    },
    pkceCodeVerifier: {
      name: 'next-auth.pkce.code_verifier',
      options: {
        httpOnly: true,
        sameSite: 'none',
        path: '/',
        secure: true,
        partitioned: true,
      } as any,
    },
  },
  pages: {
    signIn: '/login',
    // NextAuth redirects failed OAuth callbacks (OAuthAccountNotLinked, etc.)
    // here with ?error=<code>. The embedded popup flow listens for cg_auth_error
    // messages from this page to surface the real error inside the Shopify app.
    error: '/auth/error',
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

        // Flag accounts that still need a password so the client can route
        // Google-only merchants to the set-password step instead of leaving
        // them stranded after an OAuth redirect. Also stamp the current
        // session-revocation version onto the token.
        try {
          const accountRow = await prisma.user.findUnique({
            where: { id: user.id },
            select: { password: true, tokenVersion: true },
          })
          token.requirePassword = accountRow?.password ? false : true
          token.tokenVersion = accountRow?.tokenVersion ?? 0
        } catch (error) {
          console.error('Failed to check user password:', error)
        }

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
      } else if (token.revoked) {
        // Already revoked — keep rejecting without another DB round-trip.
        return token
      } else if (token.id && typeof token.tokenVersion === 'number') {
        // Existing session: verify the token wasn't minted before a password
        // change/reset. Fail OPEN on a DB error so a transient outage cannot
        // log every merchant out at once.
        try {
          const current = await getCurrentTokenVersion(token.id as string)
          if (current != null && current !== token.tokenVersion) {
            return { ...token, revoked: true }
          }
        } catch (error) {
          console.error('Failed to verify session token version:', error)
        }
      }
      return token
    },
    async session({ session, token }) {
      if (token.revoked) {
        // Surface an unauthenticated session so callers redirect to /login
        // instead of rendering a dashboard for a revoked token.
        return { ...session, user: undefined } as any
      }
      if (session.user) {
        session.user.id = token.id as string
        session.user.storeId = token.storeId as string
        session.user.requirePassword = token.requirePassword as boolean | undefined
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

          // NextAuth v4 links a new OAuth account to the *current session
          // user* instead of creating a new user when a session already
          // exists (core/lib/callback-handler.js, handleLoginOrRegistration).
          // So signing in with a Google account whose email belongs to nobody
          // — or to another user — while signed in silently attaches that
          // Google account to the signed-in user and never creates an account.
          // Block that: the visitor must sign out first. The session JWT is
          // decoded directly because the signIn callback cannot clear the
          // session cookie (NextAuth's SessionStore reads it up front).
          const sessionToken = await getToken({
            req: { cookies: cookies() } as any,
            secret: process.env.NEXTAUTH_SECRET,
          })
          if (sessionToken?.sub && (!existingUser || sessionToken.sub !== existingUser.id)) {
            return `/login?error=AlreadySignedIn`
          }


          // Sign-in flow: the account must already exist. Block silent
          // account creation and send the visitor back to sign up first.
          if (!existingUser) {
            if (isSignupIntent) {
              // Allow the signup flow to create the account. NextAuth v4
              // creates the User + Account records after this callback
              // returns, and the `createUser` event then creates the
              // Store + free subscription with the real user id.
              // No early return — keep going.
            } else {
              // Login flow — account does not exist. Surface friendly error.
              return `/login?error=NoAccount`
            }
          } else {
            // A Google OAuth round-trip cannot collect a TOTP. For accounts
            // with 2FA enabled, block the OAuth session and route the merchant
            // to the credentials login, which enforces the second factor.
            // (2FA setup requires a password, so this path is always usable.)
            if (existingUser.totpEnabled) {
              return `/login?error=2FARequired&email=${encodeURIComponent(email)}`
            }

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
                  // Not on Shopify until the merchant connects a store — the
                  // OAuth callback sets platform: 'shopify' when it does.
                  platform: 'custom',
                  currency: 'USD',
                  timezone: 'UTC',
                },
              })
            }

            // Force users without a password through the set-password flow
            // so they can later sign in with email + password too.
            if (!existingUser.password) {
              return `/setup?requirePassword=1`
            }

            return true
          }
        }

        // NOTE: no store-creation block here. In the OAuth signIn callback
        // `user.id` is the provider's account id (Google sub), not the DB
        // user id — creating a Store here used to attach orphan stores to
        // non-existent users. The `createUser` event below creates the
        // Store + free subscription with the real user id for new users,
        // and the Google branch above ensures one for existing users.
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
              // Direct/OAuth signups are not on Shopify until they connect a
              // store; the OAuth callback upgrades platform to 'shopify' then.
              platform: 'custom',
              currency: 'USD',
              timezone: 'UTC',
            },
          })
        }
      } catch (error) {
        console.error('createUser: failed to create default store:', error)
      }
      try {
        await createFreeSubscription(user.id)
      } catch (error) {
        console.error('createUser: failed to create free subscription:', error)
      }
    },
  },
}
