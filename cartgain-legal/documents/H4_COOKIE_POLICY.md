# H.4 — CARTGAIN COOKIE POLICY

> **Version:** 2026.08.15 | **Effective:** 2026-08-16
> **Note:** This Policy is incorporated into the Privacy Policy §13. A standalone page is published at `/cookies` for transparency.

---

## 1. WHAT ARE COOKIES

Small text files stored on your device when you visit our website. Used for authentication, security, analytics, preferences.

---

## 2. COOKIES WE USE

| Cookie | Purpose | Category | Duration | Source |
|---|---|---|---|---|
| `next-auth.session-token` | Authentication session | Essential | 30 days | CartGain |
| `next-auth.callback-url` | OAuth redirect | Essential | Session | CartGain |
| `next-auth.csrf-token` | CSRF protection | Essential | Session | CartGain |
| `next-auth.pkce.code_verifier` | PKCE security | Essential | Session | CartGain |
| `next-auth.state` | OAuth state | Essential | Session | CartGain |
| `cg_oauth_intent` | Signup vs login intent | Essential | 30 min | CartGain |
| `shopify_install_shop` | Shopify install flow | Essential | 30 min | CartGain |
| `cookie_consent` | Records your preferences | Essential | 1 year | CartGain |
| `_ga` | Google Analytics | Analytics | 2 years | Google |
| `_gid` | Google Analytics | Analytics | 24 hours | Google |

---

## 3. CATEGORIES

- **Essential:** Required for Platform function (auth, security, OAuth). Cannot be disabled.
- **Analytics:** Help us understand usage (Google Analytics). **Optional — requires your consent.**
- **Marketing:** None currently. If added, will require consent.

---

## 4. YOUR CHOICES

- **Cookie Banner:** First visit → granular toggles (Essential always on; Analytics opt-in).
- **Manage Anytime:** Click "Cookie Settings" in footer → reopen banner.
- **Withdraw:** Toggle Analytics off → `_ga`/`_gid` deleted immediately.
- **Browser Controls:** You may block/delete cookies via browser settings (may break Essential functions).

---

## 5. CONSENT RECORD

We record your consent (timestamp, IP, user agent, categories accepted) in `CookieConsent` model + `cookie_consent` cookie. Retained 1 year.

---

## 6. THIRD-PARTY COOKIES

Google Analytics sets `_ga`/`_gid` on `cart-gain.com` (first-party context). No third-party advertising cookies.

---

## 7. CONTACT

privacy@cart-gain.com