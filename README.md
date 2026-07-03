# RecoverFlow 🚀

**Multi-Channel Cart Recovery SaaS** - Recover abandoned carts with SMS, WhatsApp, Email, and Push notifications.

![RecoverFlow](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

## Features

- 📱 **Multi-Channel Recovery**: SMS, WhatsApp, Email, Push notifications
- 🤖 **AI Optimization**: Smart timing and channel selection
- 💳 **Pay-As-You-Go**: No monthly minimums, pay only for what you use
- 🔌 **Multi-Platform**: Shopify, WooCommerce, Magento, BigCommerce, Custom API
- 📊 **Real-Time Analytics**: Track recovered revenue and ROI
- 🎯 **A/B Testing**: Optimize messages and timing
- 💰 **Dynamic Discounts**: Auto-generate discount codes
- 🔒 **Compliance Ready**: TCPA, GDPR, WhatsApp Business Policy compliant

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14, TypeScript, Tailwind CSS, Framer Motion |
| Backend | Next.js API Routes, Prisma ORM |
| Database | PostgreSQL |
| Cache/Queue | Redis (Upstash) |
| Auth | NextAuth.js |
| Payments | Razorpay |
| SMS | MSG91 |
| WhatsApp | Meta Business API |
| Email | Resend |
| Hosting | Vercel |

## Quick Start

### Prerequisites

- Node.js 18+ 
- npm or yarn
- PostgreSQL database
- Accounts for: MSG91, Resend, Razorpay

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/recoverflow.git
cd recoverflow

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local

# Edit .env.local with your credentials
# Required: DATABASE_URL, NEXTAUTH_SECRET, RAZORPAY keys, MSG91 credentials

# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate dev

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Project Structure

```
recoverflow/
├── prisma/
│   └── schema.prisma          # Database schema
├── src/
│   ├── app/
│   │   ├── api/               # API routes
│   │   │   ├── auth/          # Authentication
│   │   │   ├── webhooks/      # Shopify, Razorpay, Cashfree webhooks
│   │   │   ├── carts/         # Cart operations
│   │   │   ├── campaigns/     # Campaign management
│   │   │   ├── analytics/     # Analytics data
│   │   │   ├── rto/           # RTO risk scoring & config endpoints
│   │   │   ├── payments/      # Payment recovery config & metrics
│   │   │   └── jobs/          # Cron job endpoints
│   │   ├── r/                 # Secure redirect links (click tracking, COD confirm, payment resume)
│   │   ├── dashboard/         # User dashboard
│   │   │   ├── campaigns/     # Campaign management UI
│   │   │   ├── analytics/     # Analytics UI
│   │   │   ├── integrations/  # Integration settings
│   │   │   └── settings/      # User settings
│   │   ├── login/             # Login page
│   │   ├── signup/            # Signup page
│   │   ├── layout.tsx         # Root layout
│   │   └── page.tsx           # Landing page
│   ├── components/            # React components
│   ├── lib/
│   │   ├── rto/               # RTO risk scoring engine (scorer, config, nudge)
│   │   ├── payments/          # Payment-failure recovery (gateway adapters, classifier, recovery)
│   │   ├── links/             # Secure token generation/verification
│   │   ├── jobs/              # Background job processors
│   │   ├── queue/             # Bull/Redis queue management
│   │   ├── services/          # SMS, WhatsApp, Email services
│   │   ├── alerter.ts         # Monitoring alert system
│   │   ├── data-protection.ts # PII redaction & audit logging
│   │   ├── db.ts              # Prisma client
│   │   └── utils.ts           # Utility functions
│   └── types/                 # TypeScript types
├── .env.example               # Environment variables template
├── LAUNCH_GUIDE.md            # Comprehensive launch guide
├── next.config.js             # Next.js configuration
├── package.json               # Dependencies
├── tailwind.config.js         # Tailwind configuration
└── tsconfig.json              # TypeScript configuration
```

## Environment Variables

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/recoverflow"

# NextAuth
NEXTAUTH_SECRET="your-secret-key"
NEXTAUTH_URL="http://localhost:3000"

# Razorpay (Payments)
RAZORPAY_KEY_ID="rzp_test_..."
RAZORPAY_KEY_SECRET="..."
RAZORPAY_WEBHOOK_SECRET="..."

# Cashfree (Payment Gateway — optional, for payment-failure recovery)
CASHFREE_WEBHOOK_SECRET=""

# MSG91 (SMS)
MSG91_AUTH_KEY="your_auth_key"
MSG91_SENDER_ID="CARTGN"

# WhatsApp Business API
WHATSAPP_BUSINESS_TOKEN="..."
WHATSAPP_PHONE_NUMBER_ID="..."

# Email (Resend)
RESEND_API_KEY="re_xxx"
FROM_EMAIL="noreply@cart-gain.com"
FROM_NAME="CartGain"

# Redis
REDIS_URL="redis://localhost:6379"

# Secure link token secret (for single-use payment/confirmation links)
# If not set, falls back to NEXTAUTH_SECRET
LINK_SECRET=""

# Monitoring alerts — email address for webhook/cron error notifications
ALERT_EMAIL=""
```

## API Routes

### Authentication
- `POST /api/auth/register` - Create new account
- `POST /api/auth/signin` - Sign in
- `POST /api/auth/signout` - Sign out

### Carts
- `GET /api/carts` - List abandoned carts
- `POST /api/carts` - Create/update cart
- `POST /api/carts/[id]/recover` - Trigger recovery

### Campaigns
- `GET /api/campaigns` - List campaigns
- `POST /api/campaigns` - Create campaign
- `PUT /api/campaigns/[id]` - Update campaign
- `DELETE /api/campaigns/[id]` - Delete campaign

### Analytics
- `GET /api/analytics/overview` - Dashboard metrics
- `GET /api/analytics/channels` - Channel performance
- `GET /api/analytics/revenue` - Revenue data

### Webhooks
- `POST /api/webhooks/shopify` - Shopify cart/order webhooks
- `POST /api/payment/webhook` - Razorpay payment webhook (legacy)
- `POST /api/webhooks/payment/razorpay` - Razorpay payment-failure webhook
- `POST /api/webhooks/payment/cashfree` - Cashfree payment-failure webhook

### RTO / COD-Fraud Reduction
- `POST /api/rto/score` - Score a COD order for RTO risk and trigger nudge
- `GET /api/rto/config` - Get RTO config for a merchant
- `PUT /api/rto/config` - Update RTO config (weights, thresholds, incentive, categories)
- `GET /api/rto/metrics` - RTO metrics dashboard (scores by band, nudge conversion rate)
- `GET /api/rto/pincode-stats` - Pincode-level RTO statistics

### Payment-Failure Recovery
- `GET /api/payments/recovery/config` - Get payment recovery config
- `PUT /api/payments/recovery/config` - Update payment recovery config
- `GET /api/payments/recovery/metrics` - Payment recovery metrics dashboard

### Jobs (Secured with JOB_SECRET)
- `POST /api/jobs/process-carts` - Process abandoned carts (every 5 min)
- `POST /api/jobs/retry-payments` - Process payment-failure retries
- `POST /api/jobs/process-billing` - Process revenue share billing (daily)

## Database Schema

```
User
├── Account
├── Session
├── Store
│   ├── Cart
│   │   └── Message
│   ├── Campaign
│   │   └── ABTest
│   ├── RecoveredCart
│   ├── MerchantConfig           # Feature flags & tuning per merchant
│   ├── RtoRiskScore             # Per-order RTO risk assessment
│   ├── PincodeStats             # Historical RTO rates per pincode
│   ├── CodNudge                 # COD→prepaid conversion nudges
│   └── Customer                 # Per-merchant customer aggregates
├── PaymentAttempt               # Normalized payment failures from any gateway
├── PaymentRecoveryCampaign       # Per-attempt recovery message tracking
├── Analytics
├── Subscription
└── DataAccessLog                # Audit trail for GDPR/compliance
```

## Key Features Explained

### 1. Multi-Channel Recovery

```
Cart Abandoned
    ↓
┌───────────────────────────────────────┐
│  AI decides optimal channel/timing   │
├───────────────────────────────────────┤
│  SMS (15 min)    → 99% open rate     │
│  WhatsApp (1 hr) → Rich media        │
│  Email (3 hr)    → Detailed content  │
│  Push (24 hr)    → Free reminder     │
└───────────────────────────────────────┘
```

### 2. AI Optimization

- Analyzes historical recovery data
- Considers customer timezone, device, cart value
- Predicts best channel and send time
- A/B tests message variants

### 3. Dynamic Discounting

- Only offers discounts when abandonment pattern suggests needed
- Calculates optimal discount amount
- Generates unique discount codes
- Tracks discount ROI

## Monetization

### Pricing Tiers

| Tier | Price | Best For |
|------|-------|----------|
| Free | $0 | Testing, <50 carts/month |
| Pay-As-You-Go | $0.02/SMS | Growing stores |
| Pro | $99/month | High-volume stores |

### Revenue Model

- SMS: $0.02/message (cost: ~$0.0075)
- WhatsApp: $0.005/message (cost: ~$0.0025)
- Email: Free (included)
- Push: Free (included)

**Margin**: ~60-70% on messaging

## Deployment

### Vercel (Recommended)

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel

# Follow prompts to connect GitHub, set env vars
```

### Database

1. Create PostgreSQL database (Supabase, PlanetScale, or self-hosted)
2. Run migrations: `npx prisma migrate deploy`
3. Update DATABASE_URL in environment

### Razorpay Webhooks

Configure these webhook events in Razorpay Dashboard:
- `payment.captured`
- `order.paid`
- `subscription.activated`
- `payment.failed` (required for payment-failure recovery)

Endpoint: `https://yourdomain.com/api/payment/webhook`
Secret: Your `RAZORPAY_WEBHOOK_SECRET` from .env.local

### Payment-Failure Recovery Webhooks

#### Razorpay
Configure `payment.failed` event in Razorpay Dashboard:
- Endpoint: `https://yourdomain.com/api/webhooks/payment/razorpay`
- Secret: Your `RAZORPAY_WEBHOOK_SECRET`

#### Cashfree
Configure `ORDER_PAYMENT_FAILED` event in Cashfree Dashboard:
- Endpoint: `https://yourdomain.com/api/webhooks/payment/cashfree`
- Secret: Your `CASHFREE_WEBHOOK_SECRET`

### Cron Jobs

For the retry-payments job, schedule a cron to call:
```
GET/POST https://yourdomain.com/api/jobs/retry-payments?secret=YOUR_JOB_SECRET
```

Recommended schedule: every 15 minutes for payment retries.

## Testing

```bash
# Run tests
npm test

# Run E2E tests
npm run test:e2e

# Check types
npm run type-check
```

## Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/new-feature`
3. Commit changes: `git commit -am 'Add new feature'`
4. Push to branch: `git push origin feature/new-feature`
5. Submit pull request

## License

MIT License - see LICENSE file for details

## Support

- Documentation: [docs.recoverflow.com](https://docs.recoverflow.com)
- Email: support@recoverflow.com
- Twitter: [@recoverflow](https://twitter.com/recoverflow)

## Acknowledgments

- Inspired by CartBoss's success ($37k/mo)
- Built for the Surgent.dev community
- Thanks to all beta testers!

---

**Built with ❤️ by RecoverFlow Team**

*Version 1.0.0 - April 2026*
