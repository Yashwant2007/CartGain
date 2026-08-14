import { extension, CheckoutExtensionPoint } from '@shopify/ui-extensions/checkout';
import { useState, useEffect } from 'react';
import { render, useApi } from '@shopify/ui-extensions-react/checkout';
import {
  Banner,
  Button,
  InlineStack,
  Text,
  Modal,
  View,
  BlockStack,
  Divider,
  Image,
  Heading,
  Subheading,
  TextBlock,
  TextField,
  Select,
  Alert,
} from '@shopify/ui-extensions/checkout';

interface CartLine {
  merchandise: {
    id: string;
    title: string;
    price: { amount: string; currencyCode: string };
    image?: { url: string };
  };
  quantity: number;
}

interface DiscountCode {
  code: string;
  amount?: { amount: string; currencyCode: string };
}

const MAX_ATTEMPTS = 3;
const PROFIT_PERCENT = 25;

type Persona = 'friendly' | 'strict' | 'playful';
type BargainStep = 'intro' | 'chat' | 'deal' | 'rejected';

interface Message {
  role: 'customer' | 'ai';
  content: string;
  price?: number;
}

const PersonaLabels: Record<Persona, string> = {
  friendly: '😊 Alex — Friendly Shopkeeper',
  strict: '📊 Morgan — Strict Negotiator',
  playful: '😏 Riley — Playful Friend',
};

const PersonaOpenings: Record<Persona, (productTitle: string, originalPrice: number) => string> = {
  friendly: (item, price) =>
    `Hey! Welcome 👋 I see you're interested in ${item}. It's listed at ₹${price.toFixed(2)}. I'd love to help you get a good deal — what price were you thinking? You've got ${MAX_ATTEMPTS} attempts to bargain with me.`,
  strict: (item, price) =>
    `Thank you for your interest in ${item}. The current price is ₹${price.toFixed(2)}. I'm open to reasonable offers within ${MAX_ATTEMPTS} exchanges. What price were you considering?`,
  playful: (item, price) =>
    `Hey hey! 👋 I see you're checking out ${item} — nice choice! Listed at ₹${price.toFixed(2)}, but hey, that's just the starting point 😏 You've got ${MAX_ATTEMPTS} chances to charm me into a better deal. What's your move?`,
};

const PersonaAccept: Record<Persona, (price: number) => string> = {
  friendly: (p) => `Done! ₹${p.toFixed(2)} works for me 🎉 Shall we lock it in?`,
  strict: (p) => `Transaction confirmed at ₹${p.toFixed(2)}. A discount code will be generated.`,
  playful: (p) => `DEAL! 🎉🎉🎉 Told you we'd get there! Code's coming right up.`,
};

const PersonaLowball: Record<Persona, (offer: number, counter: number) => string> = {
  friendly: (offer, counter) => `I appreciate the creativity 😄 but I can't do ₹${offer.toFixed(2)}. Let me offer ₹${counter.toFixed(2)} — a fair starting point. What do you think?`,
  strict: (offer, counter) => `That is not a viable offer. A reasonable starting point would be ₹${counter.toFixed(2)}.`,
  playful: (offer, counter) => `Free?! 😂 I like your confidence! Best I can do is ₹${counter.toFixed(2)} and that's me being generous.`,
};

const PersonaCounter: Record<Persona, (offer: number, counter: number) => string> = {
  friendly: (offer, counter) => `Hmm, ₹${offer.toFixed(2)} is a bit low for me. Let me meet you partway — how about ₹${counter.toFixed(2)}? I think that's fair given the quality.`,
  strict: (offer, counter) => `My offer already reflects the market rate for this quality tier. I can offer ₹${counter.toFixed(2)}.`,
  playful: (offer, counter) => `Can *I* do better? The real question is, can *you*? 😏 Just kidding — here's my final. ₹${counter.toFixed(2)}. That's it. No more. Maybe.`,
};

const PersonaFinal: Record<Persona, (floor: number) => string> = {
  friendly: (floor) => `Alright, I've done my best 🙂 This is my final offer: ₹${floor.toFixed(2)}. It's the lowest I can go. Take it or leave it — but I really hope you take it!`,
  strict: (floor) => `This is my final position: ₹${floor.toFixed(2)}. Beyond this, the offer stands. Your decision.`,
  playful: (floor) => `OKAY OKAY you win! Here's my absolute last offer: ₹${floor.toFixed(2)}. My manager is gonna kill me 🙃 Deal?`,
};

const PersonaRetention: Record<Persona, (price: number) => string> = {
  friendly: (price) => `Wait, friend — before you go! For you, I can do ₹${price.toFixed(2)}. That's me stretching every rupee. Please stay — I really want this to work for you.`,
  strict: (price) => `One moment. I am prepared to make a one-time adjustment to ₹${price.toFixed(2)}. Beyond that, my offer stands. Your decision.`,
  playful: (price) => `WAIT WAIT WAIT! 😅 Okay, you drive a hard bargain. FINAL final offer: ₹${price.toFixed(2)}. I'm risking my job for this 🙃 Deal?`,
};

const PersonaFarewell: Record<Persona, string> = {
  friendly: "I understand, friend. The door's always open. Take care! 👋",
  strict: 'Understood. This negotiation is closed.',
  playful: 'Aw, really? 😅 No hard feelings! Come back anytime 🙌',
};

const extractPrice = (text: string): number | null => {
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

const detectWalkout = (text: string): boolean => {
  const t = text.toLowerCase();
  if (/(?:leaving|going)\s+(?:for|to)\s+(?:work|school|gym|dinner|lunch)/.test(t)) return false;
  if (/(?:i'?m|i am)\s+(?:out|leaving|done)/.test(t)) return true;
  if (/forget\s+(?:it|this)/.test(t)) return true;
  if (/never\s+mind|bye|goodbye/.test(t)) return true;
  if (/(?:too\s+expensive|rip\s*off|can'?t\s+afford)/.test(t) && /\b(?:leav|go|walk|out|away|elsewhere|another)\b/.test(t)) return true;
  if (/(?:take|taking|bring|bringing)\s+my\s+(?:business|money)/.test(t) && /\b(?:elsewhere|another|away|somewhere\s+else)\b/.test(t)) return true;
  return false;
};

const graduatedCounter = (originalPrice: number, minPrice: number, attemptsUsed: number): number => {
  const progress = attemptsUsed / MAX_ATTEMPTS;
  const priceRange = originalPrice - minPrice;
  const counter = originalPrice - priceRange * progress;
  return Math.round(counter * 100) / 100;
};

const CartGainBargainWidget = () => {
  const api = useApi<CheckoutExtensionPoint>();
  const { lines, applyDiscount, discountCodes } = api;

  const [showBargain, setShowBargain] = useState(false);
  const [bargainStep, setBargainStep] = useState<BargainStep>('intro');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [persona, setPersona] = useState<Persona>('friendly');
  const [finalPrice, setFinalPrice] = useState<number | null>(null);
  const [discountCode, setDiscountCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    (code: DiscountCode) => code.code.startsWith('BARGAIN_') || code.code.startsWith('CARTGAIN_')
  );

  const openBargain = () => {
    setShowBargain(true);
    setBargainStep('intro');
    setMessages([]);
    setAttempts(0);
    setInput('');
    setFinalPrice(null);
    setDiscountCode(null);
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
      let result: { reply: string; decision: 'accept' | 'counter' | 'reject'; counterOffer?: number };
      let newStep: BargainStep = 'chat';
      let newFinal: number | null = null;
      let newCode: string | null = null;

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
      // Get shop domain from the extension API
      const shopDomain = api.shop?.domain || '';
      if (!shopDomain) {
        throw new Error('Shop domain not available');
      }

      // Extract variant ID if available
      const variantId = line.merchandise.id.includes('ProductVariant/') 
        ? line.merchandise.id 
        : null;

      // Call backend to create discount code in Shopify
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
      if (!response.ok) {
        throw new Error(data.message || 'Failed to create discount code');
      }

      // Now apply the discount
      await applyDiscount(discountCode);
    } catch (error: any) {
      console.error('Failed to apply bargain discount:', error);
      setError(error.message || 'Failed to apply discount. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!line) return null;

  if (hasCartGainDiscount && !showBargain) {
    return (
      <Banner status="success" title="✅ Bargain Applied!">
        <Text appearance="subdued">Your negotiated price has been applied to this order.</Text>
      </Banner>
    );
  }

  return (
    <>
      {!showBargain && !hasCartGainDiscount && (
        <Banner status="info" title="Want a better price?">
          <InlineStack alignment="center" spacing="loose">
            <Text appearance="subdued">Negotiate the price of {productTitle} with our AI shopkeeper</Text>
            <Button onPress={openBargain} variant="primary">
              🤝 Bargain Now
            </Button>
          </InlineStack>
        </Banner>
      )}

      {showBargain && (
        <Modal title="🤝 Bargain with AI" open={showBargain} onClose={closeBargain}>
          <View padding="base">
            {bargainStep === 'intro' && (
              <BlockStack spacing="loose">
                {line.merchandise.image?.url && (
                  <Image source={line.merchandise.image.url} aspectRatio={1} border="base" />
                )}
                <Heading>{productTitle}</Heading>
                <Subheading>Listed: ₹{originalPrice.toFixed(2)}</Subheading>
                <Divider />
                <TextBlock>{PersonaOpenings[persona](productTitle, originalPrice)}</TextBlock>
                <Divider />
                <InlineStack spacing="loose">
                  <Select
                    label="Choose negotiator"
                    value={persona}
                    options={Object.entries(PersonaLabels).map(([value, label]) => ({ label, value: value as Persona }))}
                    onChange={setPersona}
                  />
                  <Button onPress={() => setBargainStep('chat')} variant="primary">
                    Start Bargaining
                  </Button>
                </InlineStack>
              </BlockStack>
            )}

            {bargainStep === 'chat' && (
              <BlockStack spacing="base">
                <InlineStack justification="space-between">
                  <Text appearance="subdued">Attempts left: {MAX_ATTEMPTS - attempts}/{MAX_ATTEMPTS}</Text>
                  <Text appearance="subdued">Floor: ₹{minPrice.toFixed(2)} (hidden)</Text>
                </InlineStack>
                <Divider />
                <BlockStack spacing="tight" overflow="auto" maxBlockSize="300">
                  {messages.map((msg, idx) => (
                    <InlineStack key={String(idx)} alignment={msg.role === 'customer' ? 'end' : 'start'} spacing="tight">
                      <Banner
                        status={msg.role === 'customer' ? 'info' : 'neutral'}
                        appearance={msg.role === 'customer' ? 'accent' : 'outline'}
                      >
                        <Text>{msg.content}</Text>
                        {msg.price != null && (
                          <Text appearance="subdued" size="small">
                            {msg.role === 'customer' ? 'Offered' : 'Counter'}: ₹{msg.price.toFixed(2)}
                          </Text>
                        )}
                      </Banner>
                    </InlineStack>
                  ))}
                </BlockStack>
                <Divider />
                <InlineStack spacing="tight">
                  <TextField
                    label="Your offer"
                    placeholder='e.g. "₹400" or "I\'ll think about it"'
                    value={input}
                    onChange={setInput}
                    onSubmit={handleSend}
                  />
                  <Button onPress={handleSend} loading={loading} variant="primary" disabled={!input.trim()}>
                    Send
                  </Button>
                </InlineStack>
              </BlockStack>
            )}

            {bargainStep === 'deal' && finalPrice != null && (
              <BlockStack spacing="loose" alignment="center">
                <Text appearance="success">🎉 Deal Accepted!</Text>
                <Heading>Final Price: ₹{finalPrice.toFixed(2)}</Heading>
                <Text appearance="subdued">You saved ₹{(originalPrice - finalPrice).toFixed(2)}</Text>
                <Text appearance="subdued">Discount code: {discountCode}</Text>
                {error && <Alert status="critical" title="Error">{error}</Alert>}
                <Button onPress={applyBargainDiscount} variant="primary" loading={loading}>
                  Apply to Checkout →
                </Button>
                <Button onPress={closeBargain} variant="secondary">
                  Close
                </Button>
              </BlockStack>
            )}

            {bargainStep === 'rejected' && (
              <BlockStack spacing="loose" alignment="center">
                <Text appearance="critical">😔 Negotiation Ended</Text>
                <Text appearance="subdued">Attempts exhausted. No deal this time.</Text>
                <Button onPress={closeBargain} variant="primary">
                  Continue Checkout
                </Button>
              </BlockStack>
            )}
          </View>
        </Modal>
      )}
    </>
  );
};

export default extension('purchase.checkout.block.render', render<'purchase.checkout.block.render'>(CartGainBargainWidget));