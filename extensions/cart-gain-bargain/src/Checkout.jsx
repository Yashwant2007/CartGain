import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';

const MAX_ATTEMPTS = 3;
const PROFIT_PERCENT = 25;

const PersonaLabels = {
  friendly: '😊 Alex — Friendly Shopkeeper',
  strict: '📊 Morgan — Strict Negotiator',
  playful: '😏 Riley — Playful Friend',
};

const PersonaOpenings = {
  friendly: (item, price) =>
    `Hey! Welcome 👋 I see you're interested in ${item}. It's listed at ₹${price.toFixed(2)}. I'd love to help you get a good deal — what price were you thinking? You've got ${MAX_ATTEMPTS} attempts to bargain with me.`,
  strict: (item, price) =>
    `Thank you for your interest in ${item}. The current price is ₹${price.toFixed(2)}. I'm open to reasonable offers within ${MAX_ATTEMPTS} exchanges. What price were you considering?`,
  playful: (item, price) =>
    `Hey hey! 👋 I see you're checking out ${item} — nice choice! Listed at ₹${price.toFixed(2)}, but hey, that's just the starting point 😏 You've got ${MAX_ATTEMPTS} chances to charm me into a better deal. What's your move?`,
};

const PersonaAccept = {
  friendly: (p) => `Done! ₹${p.toFixed(2)} works for me 🎉 Shall we lock it in?`,
  strict: (p) => `Transaction confirmed at ₹${p.toFixed(2)}. A discount code will be generated.`,
  playful: (p) => `DEAL! 🎉🎉🎉 Told you we'd get there! Code's coming right up.`,
};

const PersonaLowball = {
  friendly: (offer, counter) => `I appreciate the creativity 😄 but I can't do ₹${offer.toFixed(2)}. Let me offer ₹${counter.toFixed(2)} — a fair starting point. What do you think?`,
  strict: (offer, counter) => `That is not a viable offer. A reasonable starting point would be ₹${counter.toFixed(2)}.`,
  playful: (offer, counter) => `Free?! 😂 I like your confidence! Best I can do is ₹${counter.toFixed(2)} and that's me being generous.`,
};

const PersonaCounter = {
  friendly: (offer, counter) => `Hmm, ₹${offer.toFixed(2)} is a bit low for me. Let me meet you partway — how about ₹${counter.toFixed(2)}? I think that's fair given the quality.`,
  strict: (offer, counter) => `My offer already reflects the market rate for this quality tier. I can offer ₹${counter.toFixed(2)}.`,
  playful: (offer, counter) => `Can *I* do better? The real question is, can *you*? 😏 Just kidding — here's my final. ₹${counter.toFixed(2)}. That's it. No more. Maybe.`,
};

const PersonaFinal = {
  friendly: (floor) => `Alright, I've done my best 🙂 This is my final offer: ₹${floor.toFixed(2)}. It's the lowest I can go. Take it or leave it — but I really hope you take it!`,
  strict: (floor) => `This is my final position: ₹${floor.toFixed(2)}. Beyond this, the offer stands. Your decision.`,
  playful: (floor) => `OKAY OKAY you win! Here's my absolute last offer: ₹${floor.toFixed(2)}. My manager is gonna kill me 🙃 Deal?`,
};

const PersonaRetention = {
  friendly: (price) => `Wait, friend — before you go! For you, I can do ₹${price.toFixed(2)}. That's me stretching every rupee. Please stay — I really want this to work for you.`,
  strict: (price) => `One moment. I am prepared to make a one-time adjustment to ₹${price.toFixed(2)}. Beyond that, my offer stands. Your decision.`,
  playful: (price) => `WAIT WAIT WAIT! 😅 Okay, you drive a hard bargain. FINAL final offer: ₹${price.toFixed(2)}. I'm risking my job for this 🙃 Deal?`,
};

const PersonaFarewell = {
  friendly: "I understand, friend. The door's always open. Take care! 👋",
  strict: 'Understood. This negotiation is closed.',
  playful: 'Aw, really? 😅 No hard feelings! Come back anytime 🙌',
};

const extractPrice = (text) => {
  const patterns = [
    /(?:₹|INR|Rs\.?)\s*(\d+(?:\.\d{1,2})?)/i,
    /(\d+(?:\.\d{1,2})?)\s*(?:₹|rs\.?|inr|rupees?)/i,
    /\b(\d+(?:\.\d{1,2})?)\b/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const v = parseFloat(m[1]);
      if (v > 0 && v < 1_000_000) return v;
    }
  }
  return null;
};

const detectWalkout = (text) => {
  const t = text.toLowerCase();
  if (/(?:leaving|going)\s+(?:for|to)\s+(?:work|school|gym|dinner|lunch)/.test(t)) return false;
  if (/(?:i'?m|i am)\s+(?:out|leaving|done)/.test(t)) return true;
  if (/forget\s+(?:it|this)/.test(t)) return true;
  if (/never\s+mind|bye|goodbye/.test(t)) return true;
  if (/(?:too\s+expensive|rip\s*off|can'?t\s+afford)/.test(t) && /\b(?:leav|go|walk|out|away|elsewhere|another)\b/.test(t)) return true;
  if (/(?:take|taking|bring|bringing)\s+my\s+(?:business|money)/.test(t) && /\b(?:elsewhere|another|away|somewhere\s+else)\b/.test(t)) return true;
  return false;
};

const graduatedCounter = (originalPrice, minPrice, attemptsUsed) => {
  const progress = attemptsUsed / MAX_ATTEMPTS;
  const priceRange = originalPrice - minPrice;
  const counter = originalPrice - priceRange * progress;
  return Math.round(counter * 100) / 100;
};

function RecoveryOptIn() {
  const api = shopify;
  const [state, setState] = useState('idle');
  const phone = api.buyerIdentity?.phone?.current || '';
  const email = api.buyerIdentity?.email?.current || '';
  const customer = api.buyerIdentity?.customer?.current;
  const name =
    [customer?.firstName, customer?.lastName].filter(Boolean).join(' ') ||
    customer?.name ||
    '';
  const shopDomain = api.shop?.myshopifyDomain || '';
  const checkoutToken = api.checkoutToken?.current || '';
  const lastSynced = useRef('');

  // Shopify fills buyerIdentity as the shopper signs in or types their details,
  // often before the checkout webhook reaches the backend. Mirror that contact
  // onto the captured cart immediately so an abandoned cart has a name/email/
  // phone without the shopper re-entering anything or clicking a button.
  //
  // This is contact capture, not marketing consent: consent flags stay off and
  // the explicit opt-in button below remains the only way to turn them on.
  useEffect(() => {
    if (!shopDomain || !checkoutToken) return;
    if (!phone && !email && !name) return;
    const key = [checkoutToken, name, email, phone].join('|');
    if (lastSynced.current === key) return;
    lastSynced.current = key;
    fetch('https://cart-gain.com/api/recovery/checkout-contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shop: shopDomain,
        cartToken: checkoutToken,
        name: name || null,
        email: email || null,
        phone: phone || null,
      }),
    }).catch((err) => {
      console.error('Failed to sync checkout contact:', err);
    });
  }, [shopDomain, checkoutToken, name, email, phone]);

  if (!phone && !email) return null;

  const save = async (channel) => {
    if (state === 'saving' || state === 'saved') return;
    setState('saving');
    try {
      const response = await fetch('https://cart-gain.com/api/recovery/opt-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shop: shopDomain,
          cartToken: checkoutToken || null,
          name: name || null,
          email: channel === 'email' ? email || null : null,
          phone: channel === 'whatsapp' ? phone || null : null,
          consentEmail: channel === 'email',
          consentWhatsApp: channel === 'whatsapp',
          source: 'checkout_extension',
        }),
      });
      if (!response.ok) throw new Error('Could not save reminder preference');
      setState('saved');
    } catch (err) {
      console.error('Failed to save reminder consent:', err);
      setState('error');
    }
  };

  return (
    <s-banner heading="Want a reminder if you do not finish?">
      <s-stack direction="block" gap="small-200">
        <s-text color="subdued">
          Choose how we can remind you if you leave without ordering. Reply STOP or unsubscribe any time.
        </s-text>
        {state === 'saved' ? (
          <s-text>Reminder saved. We will only message you on the channel you chose.</s-text>
        ) : (
          <s-stack direction="inline" gap="small-200">
            {email && (
              <s-button onClick={() => save('email')} disabled={state === 'saving'}>
                {state === 'saving' ? 'Saving...' : 'Email me my cart'}
              </s-button>
            )}
            {phone && (
              <s-button onClick={() => save('whatsapp')} disabled={state === 'saving'}>
                {state === 'saving' ? 'Saving...' : 'Remind me on WhatsApp'}
              </s-button>
            )}
            {state === 'error' && <s-text color="critical">Could not save. Please try again.</s-text>}
          </s-stack>
        )}
      </s-stack>
    </s-banner>
  );
}

function CartGainBargainWidget() {
  const api = shopify;

  // Thank-you page = buyer already checked out → bargain a % off their NEXT
  // order instead of the current one (no product/variant to attach).
  const isThankYou = !!(api.order || api.orderConfirmation);

  const [showBargain, setShowBargain] = useState(false);
  const [bargainStep, setBargainStep] = useState('intro');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [persona, setPersona] = useState('friendly');
  const [finalPrice, setFinalPrice] = useState(null);
  const [discountCode, setDiscountCode] = useState(null);
  const [codeSaved, setCodeSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [productTitle, setProductTitle] = useState('');
  const [originalPrice, setOriginalPrice] = useState(0);
  const [minPrice, setMinPrice] = useState(0);

  const line = isThankYou ? undefined : api.lines.value?.[0];
  const referencePrice = isThankYou
    ? parseFloat(api.cost?.subtotalAmount?.value?.amount ?? api.cost?.totalAmount?.value?.amount ?? 0) || 100
    : 0;

  useEffect(() => {
    if (isThankYou) {
      setProductTitle('your next order');
      const price = referencePrice || 100;
      setOriginalPrice(price);
      setMinPrice(Math.round(price * (1 - PROFIT_PERCENT / 100) * 100) / 100);
    } else if (line) {
      setProductTitle(line.merchandise.title);
      const price = parseFloat(line.cost.totalAmount.amount);
      setOriginalPrice(price);
      setMinPrice(Math.round(price * (1 - PROFIT_PERCENT / 100) * 100) / 100);
    }
  }, [line, referencePrice, isThankYou]);

  const appliedCodes = api.discountCodes.value || [];
  const hasCartGainDiscount = appliedCodes.some(
    (code) => code.code.startsWith('BARGAIN_') || code.code.startsWith('CARTGAIN_')
  );

  const openBargain = () => {
    setShowBargain(true);
    setBargainStep('intro');
    setMessages([]);
    setAttempts(0);
    setInput('');
    setFinalPrice(null);
    setDiscountCode(null);
    setCodeSaved(false);
    setError(null);
  };

  const closeBargain = () => {
    setShowBargain(false);
    setBargainStep('intro');
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const userText = input.trim();
    const offer = extractPrice(userText);
    const isWalkout = detectWalkout(userText);
    const nextAttempt = attempts + 1;
    const exhausted = nextAttempt >= MAX_ATTEMPTS;

    setMessages((prev) => [...prev, { role: 'customer', content: userText, price: offer ?? undefined }]);
    setInput('');
    setLoading(true);

    try {
      let result = { reply: '', decision: 'counter', counterOffer: null };
      let newStep = 'chat';
      let newFinal = null;
      let newCode = null;

      if (isWalkout && attempts < MAX_ATTEMPTS - 1) {
        const lastCounter = [...messages].reverse().find((m) => m.role === 'ai' && m.price != null)?.price ?? originalPrice;
        const step = Math.max(Math.round((originalPrice - minPrice) * 0.08 * 100) / 100, 1);
        const price = Math.max(minPrice, Math.round((lastCounter - step) * 100) / 100);
        result = { reply: PersonaRetention[persona](price), decision: 'counter', counterOffer: price };
      } else if (isWalkout) {
        setMessages((prev) => [...prev, { role: 'ai', content: PersonaFarewell[persona] }]);
        setBargainStep('rejected');
        setLoading(false);
        return;
      } else if (offer != null) {
        if (offer >= minPrice) {
          result = { reply: PersonaAccept[persona](offer), decision: 'accept', counterOffer: offer };
        } else if (offer < minPrice * 0.3) {
          const counter = graduatedCounter(originalPrice, minPrice, attempts);
          result = { reply: PersonaLowball[persona](offer, counter), decision: 'counter', counterOffer: counter };
        } else {
          const counter = graduatedCounter(originalPrice, minPrice, attempts);
          if (exhausted) {
            result = { reply: PersonaFinal[persona](minPrice), decision: 'counter', counterOffer: minPrice };
          } else {
            result = { reply: PersonaCounter[persona](offer, counter), decision: 'counter', counterOffer: counter };
          }
        }
      } else {
        const counter = graduatedCounter(originalPrice, minPrice, attempts);
        result = {
          reply: `What price did you have in mind? I could probably do ₹${counter.toFixed(2)} if you make me a fair offer.`,
          decision: 'counter',
          counterOffer: counter,
        };
      }

      if (exhausted && result.decision !== 'accept') {
        newStep = 'rejected';
        result = {
          reply: "Sorry, you've used all your attempts for this item. Maybe next time! 🙂",
          decision: 'reject',
        };
      } else if (result.decision === 'accept') {
        newStep = 'deal';
        newFinal = offer;
        newCode = null;
      }

      setMessages((prev) => [...prev, { role: 'ai', content: result.reply, price: result.counterOffer }]);
      setAttempts(nextAttempt);
      setBargainStep(newStep);
      if (newFinal) setFinalPrice(newFinal);
      if (newCode) setDiscountCode(newCode);
    } finally {
      setLoading(false);
    }
  };

  const applyBargainDiscount = async () => {
    if (!finalPrice) return;
    setLoading(true);
    setError(null);
    try {
      const shopDomain = api.shop?.myshopifyDomain || '';
      if (!shopDomain) throw new Error('Shop domain not available');
      if (isThankYou) throw new Error('Bargaining is available before checkout only.');

      const variantId = line?.merchandise?.id?.includes('ProductVariant/')
        ? line.merchandise.id
        : null;
      const productId = line?.merchandise?.id || null;
      const checkoutToken = await api.checkoutToken.current;
      if (!checkoutToken) throw new Error('Checkout token not available');

      // Buyer identity (available when the app has protected customer data
      // access). Sent so the quote and code can be bound to this checkout.
      const shopifyCustomerId = api.buyerIdentity?.customer?.current?.id || null;
      const customerEmail = api.buyerIdentity?.email?.current || null;
      const buyerPayload = {
        shopDomain,
        platform: 'shopify',
        shopifyProductId: productId,
        productId,
        variantId,
        cartToken: checkoutToken,
        shopifyCustomerId,
        customerEmail,
      };

      // First ask CartGain to re-price and sign the deal. The extension's local
      // number is only a request — the server re-checks the live price and floor
      // and returns the only price it is willing to honour.
      const quoteResponse = await fetch(`https://cart-gain.com/api/bargain/checkout-quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...buyerPayload, requestedPrice: finalPrice }),
      });
      const quoteData = await quoteResponse.json();
      if (!quoteResponse.ok) throw new Error(quoteData.message || 'Could not confirm your negotiated price');
      if (typeof quoteData.quoteToken !== 'string' || !quoteData.quoteToken) {
        throw new Error('The negotiated price could not be secured');
      }

      const response = await fetch(`https://cart-gain.com/api/bargain/checkout-accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...buyerPayload,
          originalPrice: quoteData.originalPrice,
          finalPrice: quoteData.finalPrice,
          code: quoteData.discountCode,
          quoteToken: quoteData.quoteToken,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Failed to create discount code');
      const issuedCode = data.code;
      if (typeof issuedCode !== 'string' || !issuedCode) {
        throw new Error('Shopify did not confirm a discount code');
      }
      setDiscountCode(issuedCode);

      const result = await api.applyDiscountCodeChange({
        type: 'addDiscountCode',
        code: issuedCode,
      });
      if (result.type === 'error') {
        throw new Error(result.message || 'Failed to apply discount code');
      }
    } catch (err) {
      console.error('Failed to apply bargain discount:', err);
      setError(err.message || 'Failed to apply discount. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!isThankYou && !line) return null;

  if (hasCartGainDiscount && !showBargain) {
    return (
      <s-banner tone="success" heading="Bargain Applied!">
        <s-text color="subdued">Your negotiated price has been applied to this order.</s-text>
      </s-banner>
    );
  }

  return (
    <>
      {!showBargain && !hasCartGainDiscount && (
        <s-banner heading="Want a better price?">
          <s-stack direction="inline" gap="small-200">
            <s-text color="subdued">Negotiate the price of {productTitle} with our AI shopkeeper</s-text>
            <s-button onClick={openBargain}>Bargain Now</s-button>
          </s-stack>
        </s-banner>
      )}

      {!isThankYou && <RecoveryOptIn />}

      {showBargain && (
        <s-modal title="Bargain with AI" open={showBargain} onClose={closeBargain}>
          <s-box padding="base">
            {bargainStep === 'intro' && (
              <s-stack direction="block" gap="small-200">
                {!isThankYou && line?.merchandise?.image?.url && (
                  <s-image src={line.merchandise.image.url} />
                )}
                <s-heading>{productTitle}</s-heading>
                <s-text color="subdued">Listed: ₹{originalPrice.toFixed(2)}</s-text>
                <s-divider />
                <s-text>{PersonaOpenings[persona](productTitle, originalPrice)}</s-text>
                <s-divider />
                <s-text>Choose your negotiator:</s-text>
                <s-stack direction="inline" gap="small-200">
                  {Object.entries(PersonaLabels).map(([value, label]) => (
                    <s-button key={value} onClick={() => setPersona(value)}>
                      {label}
                    </s-button>
                  ))}
                </s-stack>
                <s-button onClick={() => setBargainStep('chat')}>Start Bargaining</s-button>
              </s-stack>
            )}

            {bargainStep === 'chat' && (
              <s-stack direction="block" gap="small-200">
                <s-text color="subdued">Attempts left: {MAX_ATTEMPTS - attempts}/{MAX_ATTEMPTS}</s-text>
                <s-divider />
                <s-stack direction="block" gap="small-200">
                  {messages.map((msg, idx) => (
                    <s-banner key={String(idx)} tone={msg.role === 'customer' ? 'info' : 'neutral'}>
                      <s-text>{msg.content}</s-text>
                      {msg.price != null && (
                        <s-text color="subdued">
                          {msg.role === 'customer' ? 'Offered' : 'Counter'}: ₹{msg.price.toFixed(2)}
                        </s-text>
                      )}
                    </s-banner>
                  ))}
                </s-stack>
                <s-divider />
                <s-stack direction="inline" gap="small-200">
                  <s-text-field
                    label="Your offer"
                    placeholder='e.g. "₹400" or "I will think about it"'
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                  />
                  <s-button onClick={handleSend} disabled={!input.trim() || loading}>
                    {loading ? 'Sending...' : 'Send'}
                  </s-button>
                </s-stack>
              </s-stack>
            )}

            {bargainStep === 'deal' && finalPrice != null && (
              <s-stack direction="block" gap="small-200" align="center">
                <s-text>Deal Accepted!</s-text>
                {isThankYou ? (
                  <>
                    <s-heading>{Math.round((1 - finalPrice / originalPrice) * 100)}% off your next order</s-heading>
                    <s-text color="subdued">Use code below within 24 hours at your next checkout</s-text>
                  </>
                ) : (
                  <>
                    <s-heading>Final Price: ₹{finalPrice.toFixed(2)}</s-heading>
                    <s-text color="subdued">You saved ₹{(originalPrice - finalPrice).toFixed(2)}</s-text>
                  </>
                )}
                {discountCode ? (
                  <s-text color="subdued">Discount code: {discountCode}</s-text>
                ) : (
                  <s-text color="subdued">Your price is locked. Confirm below to create a one-time checkout code.</s-text>
                )}
                {error && <s-banner tone="critical" heading="Error">{error}</s-banner>}
                {isThankYou ? (
                  codeSaved ? (
                    <s-text color="subdued">Code is ready — apply it when you check out next time.</s-text>
                  ) : (
                    <s-button onClick={applyBargainDiscount} disabled={loading || !finalPrice}>
                      {loading ? 'Generating...' : 'Get My Code'}
                    </s-button>
                  )
                ) : (
                  <s-button onClick={applyBargainDiscount} disabled={loading}>
                    {loading ? 'Applying...' : 'Apply to Checkout'}
                  </s-button>
                )}
                <s-button onClick={closeBargain}>Close</s-button>
              </s-stack>
            )}

            {bargainStep === 'rejected' && (
              <s-stack direction="block" gap="small-200" align="center">
                <s-text>Negotiation Ended</s-text>
                <s-text color="subdued">Attempts exhausted. No deal this time.</s-text>
                <s-button onClick={closeBargain}>Continue Checkout</s-button>
              </s-stack>
            )}
          </s-box>
        </s-modal>
      )}
    </>
  );
}

export default async () => {
  render(<CartGainBargainWidget />, document.body);
};