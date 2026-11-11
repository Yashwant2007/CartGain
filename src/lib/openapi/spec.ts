/**
 * Curated OpenAPI 3.1 description of CartGain's public and merchant API.
 *
 * This is a hand-maintained subset (not an exhaustive reflection of every
 * internal route). It documents the endpoints integrations actually use, their
 * authentication, the uniform error envelope and rate-limit behaviour so a
 * merchant or partner can build against them. Keep it in sync when a documented
 * route changes its contract.
 */

type Json = Record<string, unknown>

const errorEnvelope: Json = {
  type: 'object',
  properties: {
    message: { type: 'string' },
    code: { type: 'string' },
  },
  required: ['message'],
}

const bearerSession: Json = {
  type: 'http',
  scheme: 'bearer',
  description:
    'Shopify App Bridge session token (embedded) or a CartGain API key (`Authorization: Bearer cg_...`).',
}

const cookieSession: Json = {
  type: 'apiKey',
  in: 'cookie',
  name: 'next-auth.session-token',
  description: 'Browser session cookie issued after sign-in.',
}

function merchantOp(summary: string, description: string, extra: Json = {}): Json {
  return {
    summary,
    description,
    security: [{ bearerSession: [] }, { cookieSession: [] }],
    responses: {
      200: { description: 'Success' },
      401: { $ref: '#/components/responses/Unauthorized' },
      403: { $ref: '#/components/responses/Forbidden' },
      404: { $ref: '#/components/responses/NotFound' },
      429: { $ref: '#/components/responses/RateLimited' },
      ...(extra.responses as Json | undefined),
    },
    ...extra,
  }
}

function publicOp(summary: string, description: string, extra: Json = {}): Json {
  return {
    summary,
    description,
    security: [],
    responses: {
      200: { description: 'Success' },
      400: { $ref: '#/components/responses/Validation' },
      429: { $ref: '#/components/responses/RateLimited' },
      ...(extra.responses as Json | undefined),
    },
    ...extra,
  }
}

export const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'CartGain API',
    version: '1.0.0',
    description:
      'Cart recovery, AI bargaining and storefront experience API. All responses are JSON. Errors share a `{ message, code? }` envelope. Sensitive and expensive endpoints are rate limited per IP and per merchant.',
    contact: { name: 'CartGain', url: 'https://cart-gain.com' },
  },
  servers: [{ url: 'https://cart-gain.com' }],
  tags: [
    { name: 'Health' },
    { name: 'Recovery' },
    { name: 'Bargain' },
    { name: 'Merchant' },
    { name: 'Webhooks' },
  ],
  components: {
    securitySchemes: { bearerSession, cookieSession },
    responses: {
      Unauthorized: { description: 'Unauthenticated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      Forbidden: { description: 'Insufficient permissions', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      NotFound: { description: 'Resource not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      Validation: { description: 'Invalid request', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      RateLimited: { description: 'Rate limit exceeded (see Retry-After)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
    },
    schemas: {
      Error: errorEnvelope,
      Cart: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          storeId: { type: 'string' },
          cartId: { type: 'string' },
          customerEmail: { type: 'string', nullable: true },
          customerPhone: { type: 'string', nullable: true },
          totalValue: { type: 'number' },
          currency: { type: 'string' },
          abandonedAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
  paths: {
    '/api/health': {
      get: {
        tags: ['Health'],
        summary: 'Service health',
        description: 'Returns database, redis, env, AI, email, WhatsApp and Shopify status plus the deployed release. Never exposes secrets.',
        security: [],
        responses: { 200: { description: 'Healthy' }, 503: { description: 'Degraded' } },
      },
    },
    '/api/recovery/opt-in': {
      post: publicOp(
        'Storefront recovery opt-in',
        'Records explicit email/WhatsApp consent for a shopper and optionally links an existing cart by its unguessable token. Consent is stored before any reminder can be sent.',
        {
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email'],
                  properties: {
                    email: { type: 'string', format: 'email' },
                    phone: { type: 'string' },
                    name: { type: 'string' },
                    cartToken: { type: 'string', description: 'Shopify cart token' },
                    consentEmail: { type: 'boolean' },
                    consentWhatsApp: { type: 'boolean' },
                  },
                },
              },
            },
          },
        },
      ),
    },
    '/api/recovery/checkout-contact': {
      post: publicOp(
        'Checkout contact capture',
        'Mirrors checkout buyer identity onto a cart that was already captured. Accepts only the checkout token and fills missing fields; never sets consent.',
        {
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['cartToken'],
                  properties: {
                    cartToken: { type: 'string' },
                    name: { type: 'string' },
                    email: { type: 'string', format: 'email' },
                    phone: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      ),
    },
    '/api/bargain/experience': {
      get: publicOp('Published storefront experience', 'Returns the published design, personality, invitation copy and avatar settings.'),
    },
    '/api/bargain/start': {
      post: publicOp('Start a bargain session', 'Opens a negotiation for a product. Returns the deterministic opening message and a session id.'),
    },
    '/api/bargain/offer': {
      post: publicOp('Negotiate one turn', 'Accepts the shopper message, returns the counter/accept/reject reply within merchant pricing boundaries.'),
    },
    '/api/carts': {
      get: merchantOp('List abandoned carts', 'Paginated, tenant-scoped list of the caller\'s carts. Unknown/foreign `storeId` returns 404.', {
        parameters: [
          { name: 'storeId', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'cursor', in: 'query', schema: { type: 'string' } },
          { name: 'take', in: 'query', schema: { type: 'integer', maximum: 200 } },
        ],
      }),
      post: merchantOp('Capture a cart', 'Create or update a cart in a store owned by the caller. Requires write permission.'),
    },
    '/api/bargain/products': {
      get: merchantOp('List product bargain rules', 'Tenant-scoped product overrides and floors.'),
      post: merchantOp('Upsert a product rule', 'Create or update a per-product bargain floor/override owned by the caller.'),
    },
    '/api/recipients': {
      get: merchantOp('List recovery recipients', 'Consent registry with email/WhatsApp status and sources.'),
    },
    '/api/analytics/overview': {
      get: merchantOp('Recovery analytics', 'Abandoned/recovered carts, net revenue and channel attribution for a 1–365 day window.'),
    },
    '/api/webhooks/shopify': {
      post: {
        tags: ['Webhooks'],
        summary: 'Shopify webhooks',
        description: 'HMAC-verified. Handles carts, checkouts, orders, customers and compliance topics. Duplicate deliveries are idempotent.',
        security: [],
        responses: { 200: { description: 'Accepted' }, 401: { description: 'Invalid HMAC' } },
      },
    },
    '/api/webhooks/whatsapp': {
      post: {
        tags: ['Webhooks'],
        summary: 'WhatsApp Cloud API webhooks',
        description: 'Signature-verified inbound messages and delivery receipts. Handles STOP/START consent and the 24h customer-service window.',
        security: [],
        responses: { 200: { description: 'Accepted' }, 401: { description: 'Invalid signature' } },
      },
    },
    '/api/webhooks/email': {
      post: {
        tags: ['Webhooks'],
        summary: 'Email delivery webhooks',
        description: 'Signed delivery/open/bounce events from the email provider.',
        security: [],
        responses: { 200: { description: 'Accepted' }, 401: { description: 'Invalid signature' } },
      },
    },
  },
} as const

export type OpenApiSpec = typeof openApiSpec
