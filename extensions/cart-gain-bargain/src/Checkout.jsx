import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useState, useEffect } from 'preact/hooks';

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

function CartGainBargainWidget() {
  const api = shopify;
  const { lines, applyDiscount, discountCodes } = api;

  const [showBargain, setShowBargain] = useState(false);
  const [bargainStep, setBargainStep] = useState('intro');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [persona, setPersona] = useState('friendly');
  const [finalPrice, setFinalPrice] = useState(null);
  const [discountCode, setDiscountCode] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [productTitle, setProductTitle] = useState('');
  const [originalPrice, setOriginalPrice] = useState(0);
  const [minPrice, setMinPrice] = useState(0);

  const line = lines.current?.[0];

  useEffect(() => {
    if (line) {
      setProductTitle(line.merchandise.title);
      const price = parseFloat(line.merchandise.price.amount);
      setOriginalPrice(price);
      setMinPrice(Math.round(price * (1 - PROFIT_PERCENT / 100) * 100) / 100);
    }
  }, [line]);

  const hasCartGainDiscount = discountCodes.current?.some(
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
        newCode = `BARGAIN_${Date.now().toString(36).toUpperCase()}`;
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
    if (!discountCode || !finalPrice) return;
    setLoading(true);
    try {
      const shopDomain = api.shop?.domain || '';
      if (!shopDomain) throw new Error('Shop domain not available');

      const variantId = line.merchandise.id.includes('ProductVariant/')
        ? line.merchandise.id
        : null;

      const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'https://cart-gain.com'}/api/bargain/checkout-accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopDomain,
          shopifyProductId: line.merchandise.id,
          variantId,
          originalPrice,
          finalPrice,
          discountPercent: Math.round((1 - finalPrice / originalPrice) * 100),
          code: discountCode,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Failed to create discount code');

      await applyDiscount(discountCode);
    } catch (err) {
      console.error('Failed to apply bargain discount:', err);
      setError(err.message || 'Failed to apply discount. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!line) return null;

  if (hasCartGainDiscount && !showBargain) {
    return (
      <s-banner status="success" title="✅ Bargain Applied!">
        <s-text appearance="subdued">Your negotiated price has been applied to this order.</s-text>
      </s-banner>
    );
  }

  return (
    <>
      {!showBargain && !hasCartGainDiscount && (
        <s-banner status="info" title="Want a better price?">
          <s-inline-stack alignment="center" spacing="loose">
            <s-text appearance="subdued">Negotiate the price of {productTitle} with our AI shopkeeper</s-text>
            <s-button onPress={openBargain} variant="primary">
              🤝 Bargain Now
            </s-button>
          </s-inline-stack>
        </s-banner>
      )}

      {showBargain && (
        <s-modal title="🤝 Bargain with AI" open={showBargain} onClose={closeBargain}>
          <s-view padding="base">
            {bargainStep === 'intro' && (
              <s-block-stack spacing="loose">
                {line.merchandise.image?.url && (
                  <s-image source={line.merchandise.image.url} aspectRatio={1} border="base" />
                )}
                <s-heading>{productTitle}</s-heading>
                <s-subheading>Listed: ₹{originalPrice.toFixed(2)}</s-subheading>
                <s-divider />
                <s-text-block>{PersonaOpenings[persona](productTitle, originalPrice)}</s-text-block>
                <s-divider />
                <s-inline-stack spacing="loose">
                  <s-select
                    label="Choose negotiator"
                    value={persona}
                    options={Object.entries(PersonaLabels).map(([value, label]) => ({ label, value }))}
                    onChange={setPersona}
                  />
                  <s-button onPress={() => setBargainStep('chat')} variant="primary">
                    Start Bargaining
                  </s-button>
                </s-inline-stack>
              </s-block-stack>
            )}

            {bargainStep === 'chat' && (
              <s-block-stack spacing="base">
                <s-inline-stack justification="space-between">
                  <s-text appearance="subdued">Attempts left: {MAX_ATTEMPTS - attempts}/{MAX_ATTEMPTS}</s-text>
                  <s-text appearance="subdued">Floor: ₹{minPrice.toFixed(2)} (hidden)</s-text>
                </s-inline-stack>
                <s-divider />
                <s-block-stack spacing="tight" overflow="auto" maxBlockSize="300">
                  {messages.map((msg, idx) => (
                    <s-inline-stack key={String(idx)} alignment={msg.role === 'customer' ? 'end' : 'start'} spacing="tight">
                      <s-banner
                        status={msg.role === 'customer' ? 'info' : 'neutral'}
                        appearance={msg.role === 'customer' ? 'accent' : 'outline'}
                      >
                        <s-text>{msg.content}</s-text>
                        {msg.price != null && (
                          <s-text appearance="subdued" size="small">
                            {msg.role === 'customer' ? 'Offered' : 'Counter'}: ₹{msg.price.toFixed(2)}
                          </s-text>
                        )}
                      </s-banner>
                    </s-inline-stack>
                  ))}
                </s-block-stack>
                <s-divider />
                <s-inline-stack spacing="tight">
                  <s-text-field
                    label="Your offer"
                    placeholder={`e.g. "₹400" or "I'll think about it"`}
                    value={input}
                    onChange={setInput}
                    onSubmit={handleSend}
                  />
                  <s-button onPress={handleSend} loading={loading} variant="primary" disabled={!input.trim()}>
                    Send
                  </s-button>
                </s-inline-stack>
              </s-block-stack>
            )}

            {bargainStep === 'deal' && finalPrice != null && (
              <s-block-stack spacing="loose" alignment="center">
                <s-text appearance="success">🎉 Deal Accepted!</s-text>
                <s-heading>Final Price: ₹{finalPrice.toFixed(2)}</s-heading>
                <s-text appearance="subdued">You saved ₹{(originalPrice - finalPrice).toFixed(2)}</s-text>
                <s-text appearance="subdued">Discount code: {discountCode}</s-text>
                {error && <s-alert status="critical" title="Error">{error}</s-alert>}
                <s-button onPress={applyBargainDiscount} variant="primary" loading={loading}>
                  Apply to Checkout →
                </s-button>
                <s-button onPress={closeBargain} variant="secondary">
                  Close
                </s-button>
              </s-block-stack>
            )}

            {bargainStep === 'rejected' && (
              <s-block-stack spacing="loose" alignment="center">
                <s-text appearance="critical">😔 Negotiation Ended</s-text>
                <s-text appearance="subdued">Attempts exhausted. No deal this time.</s-text>
                <s-button onPress={closeBargain} variant="primary">
                  Continue Checkout
                </s-button>
              </s-block-stack>
            )}
          </s-view>
        </s-modal>
      )}
    </>
  );
}

// 1. Export the extension
export default async () => {
  render(<CartGainBargainWidget />, document.body);
};