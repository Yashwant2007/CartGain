# ⚡ RecoverFlow Quick Start Guide

**Get RecoverFlow running in 15 minutes**

---

## Step 1: Install Dependencies (2 min)

```bash
cd recoverflow
npm install
```

---

## Step 2: Set Up Environment Variables (3 min)

```bash
cp .env.example .env.local
```

Edit `.env.local` with these **minimum required** values:

```env
# Generate with: openssl rand -base64 32
NEXTAUTH_SECRET="your-random-secret-here"
NEXTAUTH_URL="http://localhost:3000"

# Use a free Supabase database
DATABASE_URL="postgresql://..."

# Razorpay (test mode)
RAZORPAY_KEY_ID="rzp_test_..."
RAZORPAY_KEY_SECRET="..."
RAZORPAY_WEBHOOK_SECRET="..."

# Twilio (free trial)
TWILIO_ACCOUNT_SID="AC..."
TWILIO_AUTH_TOKEN="..."
TWILIO_PHONE_NUMBER="+1..."

# Email (optional for local dev)
FROM_EMAIL="test@example.com"
```

**Quick setup for free services**:
- **Database**: [Supabase](https://supabase.com) → New project → Connection string
- **Twilio**: [Twilio](https://twilio.com) → Free trial → Get credentials
- **Razorpay**: [Razorpay](https://razorpay.com) → Settings → API Keys (test mode)

---

## Step 3: Initialize Database (2 min)

```bash
# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev --name init

# (Optional) Open Prisma Studio to view data
npx prisma studio
```

---

## Step 4: Start Development Server (1 min)

```bash
npm run dev
```

Open **http://localhost:3000**

---

## Step 5: Create Test Account (2 min)

1. Click "Sign Up"
2. Fill in the form:
   - Name: Test User
   - Email: test@example.com
   - Password: password123
   - Store: Test Store
   - Domain: teststore.com
3. Click "Create Account"

You'll be redirected to the dashboard.

---

## Step 6: Test Core Features (5 min)

### Create a Test Campaign
1. Go to Dashboard → Campaigns
2. Click "New Campaign"
3. Name: "Test Recovery"
4. Select channels: SMS, Email
5. Set delay: 15 minutes
6. Enable AI optimization
7. Click "Create Campaign"

### Simulate an Abandoned Cart
```bash
# In a new terminal, run this curl command:
curl -X POST http://localhost:3000/api/carts \
  -H "Content-Type: application/json" \
  -d '{
    "storeId": "your-store-id",
    "cartId": "test-cart-1",
    "customerEmail": "customer@example.com",
    "customerPhone": "+1234567890",
    "totalValue": 99.99,
    "items": [{"name": "Test Product", "price": 99.99, "quantity": 1}]
  }'
```

### Check Analytics
1. Go to Dashboard → Analytics
2. You should see:
   - 1 cart abandoned
   - Messages queued
   - Revenue potential: $99.99

---

## Troubleshooting

### "Module not found" errors
```bash
# Clear cache and reinstall
rm -rf node_modules .next
npm install
```

### Database connection error
- Check DATABASE_URL format
- Ensure database is accessible
- Try: `npx prisma db pull` to test connection

### NextAuth error
- Regenerate NEXTAUTH_SECRET: `openssl rand -base64 32`
- Ensure NEXTAUTH_URL matches your dev URL

### Port 3000 already in use
```bash
# Kill process on port 3000 (Mac/Linux)
lsof -ti:3000 | xargs kill -9

# Or use different port
PORT=3001 npm run dev
```

---

## Next Steps

### Immediate (Today)
- [ ] Complete all environment variables
- [ ] Set up Twilio for SMS testing
- [ ] Configure Razorpay for payments
- [ ] Read LAUNCH_GUIDE.md

### This Week
- [ ] Build Shopify integration
- [ ] Set up WhatsApp Business API
- [ ] Create email templates
- [ ] Test with real abandoned carts

### This Month
- [ ] Deploy to production (Vercel)
- [ ] Launch on Product Hunt
- [ ] Get first 10 paying customers
- [ ] Iterate based on feedback

---

## Free Tier Resources

All these services have free tiers perfect for development:

| Service | Free Tier | Link |
|---------|-----------|------|
| **Vercel** | Unlimited deployments | vercel.com |
| **Supabase** | 500MB database | supabase.com |
| **Upstash** | 10k commands/day | upstash.com |
| **Twilio** | $15 free credit | twilio.com |
| **SendGrid** | 100 emails/day | sendgrid.com |
| **Razorpay** | Test mode (free) | razorpay.com |

---

## Commands Cheat Sheet

```bash
# Development
npm run dev              # Start dev server
npm run build            # Build for production
npm run start            # Start production server
npm run lint             # Run ESLint

# Database
npx prisma generate      # Generate Prisma client
npx prisma migrate dev   # Run migrations (dev)
npx prisma migrate deploy # Run migrations (prod)
npx prisma studio        # Open database GUI
npx prisma db seed       # Seed database

# Utilities
openssl rand -base64 32  # Generate secret key
```

---

## Getting Help

- **Code Issues**: Check the inline comments in the codebase
- **Database Questions**: Review `prisma/schema.prisma`
- **API Reference**: See README.md → API Routes section
- **Launch Strategy**: Read LAUNCH_GUIDE.md

---

## What's Included Out of the Box

✅ Landing page with pricing  
✅ User authentication (email + Google OAuth)  
✅ Dashboard with analytics  
✅ Campaign builder with 5-step wizard  
✅ Multi-channel messaging (SMS, WhatsApp, Email, Push)  
✅ Shopify webhook integration  
✅ Razorpay payment integration  
✅ Settings pages  
✅ Responsive design (mobile + desktop)  

---

**You're ready to build! 🚀**

For detailed launch strategy, see [LAUNCH_GUIDE.md](./LAUNCH_GUIDE.md)
