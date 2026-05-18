import { PrismaAdapter } from '@auth/prisma-adapter'
import GoogleProvider from 'next-auth/providers/google'
import CredentialsProvider from 'next-auth/providers/credentials'
import EmailProvider from 'next-auth/providers/email'
import type { NextAuthOptions } from 'next-auth'
import prisma from '@/lib/db'

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

// Shopify OAuth Provider (disabled - can be re-enabled with proper types)
/*
interface ShopifyProfile {
  id: string
  email: string
  first_name: string
  last_name: string
  account_owner: boolean
  collaborator: boolean
  email_verified: boolean
}

const ShopifyProvider = (options: any): any => ({
  id: 'shopify',
  name: 'Shopify',
  type: 'oauth',
  authorization: {
    url: 'https://admin.shopify.com/oauth/authorize',
    params: {
      client_id: options.clientId,
      redirect_uri: options.redirectProxyUrl || options.callbackUrl,
      response_type: 'code',
      scope: [
        'read_checkouts',
        'write_checkouts',
        'read_orders',
        'write_orders',
        'read_customers',
        'write_customers',
        'read_products',
        'write_products',
        'read_merchant_managed_fulfillment_orders',
      ].join(','),
    },
  },
  token: {
    url: ({ params }: any) => {
      return `https://admin.shopify.com/oauth/access_token`
    },
    async request(context: any) {
      const response = await fetch(context.provider.token.url({ params: context.params }), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: context.provider.clientId,
          client_secret: context.provider.clientSecret,
          code: context.params.code,
          redirect_uri: context.redirectProxyUrl || context.options.callbackUrl,
        }),
      })

      const data = await response.json()
      return { tokens: data }
    },
  },
  userinfo: {
    url: ({ tokens }: any) => {
      const shop = new URL(tokens.access_token || '').searchParams.get('shop')
      return `https://${shop}/admin/api/2024-04/oauth/current_user.json`
    },
    async request(context: any) {
      const response = await fetch(context.provider.userinfo.url({ tokens: context.tokens }), {
        headers: {
          'X-Shopify-Access-Token': context.tokens.access_token,
        },
      })

      return await response.json()
    },
  },
  profile(profile: any, tokens: any) {
    return {
      id: profile.id,
      name: `${profile.first_name} ${profile.last_name}`,
      email: profile.email,
      image: null,
    }
  },
  ...options,
})
*/

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

// Shopify provider disabled (can be re-enabled with proper types)
/*
if (process.env.SHOPIFY_API_KEY && process.env.SHOPIFY_API_SECRET) {
  providers.push(
    ShopifyProvider({
      clientId: process.env.SHOPIFY_API_KEY,
      clientSecret: process.env.SHOPIFY_API_SECRET,
      callbackUrl: `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/auth/callback/shopify`,
    })
  )
}
*/

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
    strategy: 'database',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id
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
