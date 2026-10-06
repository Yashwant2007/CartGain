# WhatsApp Templates - Verification

## Templates as Specified
1. **REMINDER** (Step 0) - Template: `abandoned_cart_reminder`
- Body: `Hey {{1}} 👋\n\n{{2}}\n\n{{3}}\n\nTap below to make it yours ✨`
- Params: {{1}}=name, {{2}}=bodyContent (AI-generated), {{3}}=discountLine, {{4}}=URL (button)
- Button: "🛍️ Complete Purchase" with cart URL

2. **FOLLOW-UP** (Step 1) - Template: `abandoned_cart_followup`  
- Body: `{{1}}, still thinking? 💫\n\n{{2}}\n\n{{3}}\n\nStill reserved just for you 👉`
- Params: {{1}} includes name+text as constructed, {{2}} bodyContent, {{3}} discountLine, {{4}} URL
- Button: "👉 Complete Order" with cart URL

3. **URGENT** (Step 2) - Template: `abandoned_cart_urgent`
- Body: `{{1}}, last chance ⏳\n\n{{2}}\n\n{{3}}\n\nAct now before it's gone 🏃‍♂️`
- Params: {{1}} includes name+last chance text, {{2}} bodyContent, {{3}} discountLine, {{4}} URL
- Button: "🏃‍♂️ Complete Now" with cart URL

## Implementation
- src/lib/services/whatsapp.ts - Template definitions with exact param ordering
- src/lib/services/ai.ts - AI generates bodyContent for each step (with fallback); uses Groq/OpenAI via getAiClient() with failover
- src/lib/jobs/processAbandonedCarts.ts - Generates cartUrl as `${appUrl}/r/${cart.id}?c=${ch}`, applies personalized discounts from campaigns, creates personalized discount codes via AI when needed
- Cart URLs include channel tracking (`c=${ch}`) and point to recovery route that reads checkout/payment status and updates analytics
