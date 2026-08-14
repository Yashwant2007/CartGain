import {
  extension,
  useApi,
  Banner,
  Button,
  InlineStack,
  Text,
  TextField,
  Modal,
  View,
  BlockStack,
  Divider,
  Spinner,
  Image,
  Alert,
  Checkbox,
  Select,
  Heading,
  Subheading,
  TextBlock,
} from '@shopify/ui-extensions/checkout';

export default extension('purchase.checkout.block.render', (root) => {
  const api = useApi();
  const { lines, applyDiscount, removeDiscount, discountCodes } = api;

  // State
  const [showBargain, setShowBargain] = useState(false);
  const [bargainStep, setBargainStep] = useState<'intro' | 'chat' | 'deal' | 'rejected'>('intro');
  const [messages, setMessages] = useState<Array<{ role: 'customer' | 'ai'; content: string; price?: number }>>([]);
  const [input, setInput] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [maxAttempts] = useState(3);
  const [productTitle, setProductTitle] = useState('');
  const [originalPrice, setOriginalPrice] = useState(0);
  const [minPrice, setMinPrice] = useState(0);
  const [loading, setLoading] = useState(false);
  const [persona, setPersona] = useState<'friendly' | 'strict' | 'playful'>('friendly');
  const [finalPrice, setFinalPrice] = useState<number | null>(null);
  const [discountCode, setDiscountCode] = useState<string | null>(null);

  // Get the first line item for bargaining
  const line = lines.current?.[0];
  if (!line) {
    root.appendChild(
      root.createComponent(Text, { appearance: 'subdued' }, 'Add items to cart to start bargaining')
    );
    return;
  }

  // Initialize product info from cart line
  useEffect(() => {
    setProductTitle(line.merchandise.title);
    setOriginalPrice(parseFloat(line.merchandise.price.amount));
    // Floor price = 25% off (merchant configurable)
    setMinPrice(Math.round(parseFloat(line.merchandise.price.amount) * 0.75 * 100) / 100);
  }, [line]);

  // Check if already has a CartGain discount
  const hasCartGainDiscount = discountCodes.current?.some(
    (code) => code.code.startsWith('BARGAIN_') || code.code.startsWith('CARTGAIN_')
  );

  // Open bargain modal
  const openBargain = () => {
    setShowBargain(true);
    setBargainStep('intro');
    setMessages([]);
    setAttempts(0);
    setInput('');
    setFinalPrice(null);
    setDiscountCode(null);
  };

  // Close bargain modal
  const closeBargain = () => {
    setShowBargain(false);
    setBargainStep('intro');
  };

  // Extract price from message
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

  // Detect walkout intent
  const detectWalkout = (text: string): boolean => {
    const t = text.toLowerCase();
    if (/(?:leaving|going)\s+(?:for|to)\s+(?:work|school|gym|dinner|lunch)/.test(t)) return false;
    if (/(?:i'?m|i am)\s+(?:out|leaving|done)/.test(t)) return true;
    if (/forget\s+(?:it|this)/.test(t)) return true;
    if (/never\s+mind|bye|goodbye/.test(t)) return true;
    if (/(?:too\s+expensive|rip\s*off|can'?t\s+afford)/.test(t) && /\b(?:leav|go|walk|out|away|elsewhere|another)\b/.test(t)) return true;
    return false;
  };

  // Graduated counter logic
  const graduatedCounter = (attemptsUsed: number): number => {
    const progress = attemptsUsed / maxAttempts;
    const priceRange = originalPrice - minPrice;
    const counter = originalPrice - priceRange * progress;
    return Math.round(counter * 100) / 100;
  };

  // Persona responses
  const getPersonaOpening = (): string => {
    const item = productTitle ? `this ${productTitle}` : 'this';
    if (persona === 'playful') {
      return `Hey hey! 👋 I see you're checking out ${item} — nice choice! Listed at ₹${originalPrice.toFixed(2)}, but hey, that's just the starting point 😏 You've got ${maxAttempts} chances to charm me into a better deal. What's your move?`;
    }
    if (persona === 'strict') {
      return `Thank you for your interest in ${item}. The current price is ₹${originalPrice.toFixed(2)}. I'm open to reasonable offers within ${maxAttempts} exchanges. What price were you considering?`;
    }
    return `Hey! Welcome 👋 I see you're interested in ${item}. It's listed at ₹${originalPrice.toFixed(2)}. I'd love to help you get a good deal — what price were you thinking? You've got ${maxAttempts} attempts to bargain with me.`;
  };

  const getPersonaResponse = (offer: number, isWalkout: boolean): { reply: string; decision: 'accept' | 'counter' | 'reject'; counterOffer?: number } => {
    const attemptsLeft = maxAttempts - attempts;

    if (offer >= minPrice) {
      const replies = {
        friendly: `Done! ₹${offer.toFixed(2)} works for me 🎉 Shall we lock it in?`,
        strict: `Transaction confirmed at ₹${offer.toFixed(2)}. A discount code will be generated.`,
        playful: `DEAL! 🎉🎉🎉 Told you we'd get there! Code's coming right up.`,
      };
      return { reply: replies[persona], decision: 'accept', counterOffer: offer };
    }

    if (offer < minPrice * 0.3) {
      const counter = graduatedCounter(attempts);
      const replies = {
        friendly: `I appreciate the creativity 😄 but I can't do ₹${offer.toFixed(2)}. Let me offer ₹${counter.toFixed(2)} — a fair starting point. What do you think?`,
        strict: `That is not a viable offer. A reasonable starting point would be ₹${counter.toFixed(2)}.`,
        playful: `Free?! 😂 I like your confidence! Best I can do is ₹${counter.toFixed(2)} and that's me being generous.`,
      };
      return { reply: replies[persona], decision: 'counter', counterOffer: counter };
    }

    const counter = graduatedCounter(attempts);
    if (attemptsLeft > 1) {
      const replies = {
        friendly: `Hmm, ₹${offer.toFixed(2)} is a bit low for me. Let me meet you partway — how about ₹${counter.toFixed(2)}? I think that's fair given the quality.`,
        strict: `My offer already reflects the market rate for this quality tier. I can offer ₹${counter.toFixed(2)}.`,
        playful: `Can *I* do better? The real question is, can *you*? 😏 Just kidding — here's my final. ₹${counter.toFixed(2)}. That's it. No more. Maybe.`,
      };
      return { reply: replies[persona], decision: 'counter', counterOffer: counter };
    }

    // Final attempt
    const replies = {
      friendly: `Alright, I've done my best 🙂 This is my final offer: ₹${minPrice.toFixed(2)}. It's the lowest I can go. Take it or leave it — but I really hope you take it!`,
      strict: `This is my final position: ₹${minPrice.toFixed(2)}. Beyond this, the offer stands. Your decision.`,
      playful: `OKAY OKAY you win! Here's my absolute last offer: ₹${minPrice.toFixed(2)}. My manager is gonna kill me 🙃 Deal?`,
    };
    return { reply: replies[persona], decision: 'counter', counterOffer: minPrice };
  };

  // Walkout retention
  const getRetentionResponse = (lastCounter: number): { reply: string; counterOffer: number } => {
    const step = Math.max(Math.round((originalPrice - minPrice) * 0.08 * 100) / 100, 1);
    const price = Math.max(minPrice, Math.round((lastCounter - step) * 100) / 100);
    const replies = {
      friendly: `Wait, friend — before you go! For you, I can do ₹${price.toFixed(2)}. That's me stretching every rupee. Please stay — I really want this to work for you.`,
      strict: `One moment. I am prepared to make a one-time adjustment to ₹${price.toFixed(2)}. Beyond that, my offer stands. Your decision.`,
      playful: `WAIT WAIT WAIT! 😅 Okay, you drive a hard bargain. FINAL final offer: ₹${price.toFixed(2)}. I'm risking my job for this 🙃 Deal?`,
    };
    return { reply: replies[persona], counterOffer: price };
  };

  // Send message handler
  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const userText = input.trim();
    const offer = extractPrice(userText);
    const isWalkout = detectWalkout(userText);
    const nextAttempt = attempts + 1;
    const exhausted = nextAttempt >= maxAttempts;

    setMessages((prev) => [...prev, { role: 'customer', content: userText, price: offer ?? undefined }]);
    setInput('');
    setLoading(true);

    try {
      let result: { reply: string; decision: 'accept' | 'counter' | 'reject'; counterOffer?: number };
      let newStep: typeof bargainStep = 'chat';
      let newFinal: number | null = null;
      let newCode: string | null = null;

      if (isWalkout && attempts < maxAttempts - 1) {
        // First walkout - retention offer
        const lastCounter = [...messages].reverse().find((m) => m.role === 'ai' && m.price != null)?.price ?? originalPrice;
        result = getRetentionResponse(lastCounter);
      } else if (isWalkout) {
        // No attempts left + walkout
        const farewells = {
          friendly: "I understand, friend. The door's always open. Take care! 👋",
          strict: 'Understood. This negotiation is closed.',
          playful: 'Aw, really? 😅 No hard feelings! Come back anytime 🙌',
        };
        setMessages((prev) => [...prev, { role: 'ai', content: farewells[persona] }]);
        setBargainStep('rejected');
        setLoading(false);
        return;
      } else if (offer != null) {
        result = getPersonaResponse(offer, false);
        if (result.decision === 'accept') {
          newFinal = offer;
          newCode = `BARGAIN_${Date.now().toString(36).toUpperCase()}`;
        }
      } else {
        // No price mentioned - invite offer
        const counter = graduatedCounter(attempts);
        result = {
          reply: `What price did you have in mind? I could probably do ₹${counter.toFixed(2)} if you make me a fair offer.`,
          decision: 'counter',
          counterOffer: counter,
        };
      }

      // Check if exhausted
      if (exhausted && result.decision !== 'accept') {
        newStep = 'rejected';
        result = {
          reply: "Sorry, you've used all your attempts for this item. Maybe next time! 🙂",
          decision: 'reject',
        };
      } else if (result.decision === 'accept') {
        newStep = 'deal';
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

  // Apply discount code to checkout
  const applyBargainDiscount = async () => {
    if (!discountCode) return;
    setLoading(true);
    try {
      await applyDiscount(discountCode);
      // Success - the discount is applied
      setBargainStep('deal');
    } catch (error) {
      console.error('Failed to apply discount:', error);
    } finally {
      setLoading(false);
    }
  };

  // Render the main banner/button in checkout
  if (!showBargain && !hasCartGainDiscount) {
    const banner = root.createComponent(
      Banner,
      { status: 'info', title: 'Want a better price?' },
      root.createComponent(
        InlineStack,
        { alignment: 'center', spacing: 'loose' },
        root.createComponent(Text, { appearance: 'subdued' }, `Negotiate the price of ${productTitle} with our AI shopkeeper`),
        root.createComponent(
          Button,
          { onPress: openBargain, variant: 'primary' },
          '🤝 Bargain Now'
        )
      )
    );
    root.appendChild(banner);
    return;
  }

  // If discount already applied, show success
  if (hasCartGainDiscount && !showBargain) {
    const banner = root.createComponent(
      Banner,
      { status: 'success', title: '✅ Bargain Applied!' },
      root.createComponent(Text, { appearance: 'subdued' }, 'Your negotiated price has been applied to this order.')
    );
    root.appendChild(banner);
    return;
  }

  // Render the bargain modal
  const modal = root.createComponent(
    Modal,
    { title: '🤝 Bargain with AI', open: showBargain, onClose: closeBargain },
    root.createComponent(View, { padding: 'base' }, () => {
      // Product info header
      if (bargainStep === 'intro') {
        return root.createComponent(
          BlockStack,
          { spacing: 'loose' },
          root.createComponent(Image, { source: line.merchandise.image?.url ?? '', aspectRatio: 1, border: 'base' }),
          root.createComponent(Heading, {}, productTitle),
          root.createComponent(Subheading, {}, `Listed: ₹${originalPrice.toFixed(2)}`),
          root.createComponent(Divider, {}),
          root.createComponent(TextBlock, {}, getPersonaOpening()),
          root.createComponent(Divider, {}),
          root.createComponent(
            InlineStack,
            { spacing: 'loose' },
            root.createComponent(
              Select,
              { label: 'Choose negotiator', value: persona, options: [
                { label: '😊 Alex — Friendly Shopkeeper', value: 'friendly' },
                { label: '📊 Morgan — Strict Negotiator', value: 'strict' },
                { label: '😏 Riley — Playful Friend', value: 'playful' },
              ], onChange: setPersona }
            ),
            root.createComponent(
              Button,
              { onPress: () => setBargainStep('chat'), variant: 'primary' },
              'Start Bargaining'
            )
          )
        );
      }

      // Chat interface
      if (bargainStep === 'chat') {
        return root.createComponent(
          BlockStack,
          { spacing: 'base' },
          // Attempts indicator
          root.createComponent(
            InlineStack,
            { justification: 'space-between' },
            root.createComponent(Text, { appearance: 'subdued' }, `Attempts left: ${maxAttempts - attempts}/${maxAttempts}`),
            root.createComponent(Text, { appearance: 'subdued' }, `Floor: ₹${minPrice.toFixed(2)} (hidden)`)
          ),
          root.createComponent(Divider, {}),
          // Messages
          root.createComponent(
            BlockStack,
            { spacing: 'tight', overflow: 'auto', maxBlockSize: '300' },
            messages.map((msg, idx) =>
              root.createComponent(
                InlineStack,
                { alignment: msg.role === 'customer' ? 'end' : 'start', key: String(idx), spacing: 'tight' },
                root.createComponent(
                  Banner,
                  {
                    status: msg.role === 'customer' ? 'info' : 'neutral',
                    appearance: msg.role === 'customer' ? 'accent' : 'outline',
                  },
                  root.createComponent(Text, {}, msg.content),
                  msg.price != null && root.createComponent(Text, { appearance: 'subdued', size: 'small' }, `${msg.role === 'customer' ? 'Offered' : 'Counter'}: ₹${msg.price.toFixed(2)}`)
                )
              )
            )
          ),
          root.createComponent(Divider, {}),
          // Input
          root.createComponent(
            InlineStack,
            { spacing: 'tight' },
            root.createComponent(
              TextField,
              {
                label: 'Your offer',
                placeholder: 'e.g. "₹400" or "I\'ll think about it"',
                value: input,
                onChange: setInput,
                onSubmit: handleSend,
              }
            ),
            root.createComponent(
              Button,
              { onPress: handleSend, loading, variant: 'primary', disabled: !input.trim() },
              'Send'
            )
          )
        );
      }

      // Deal accepted
      if (bargainStep === 'deal' && finalPrice != null) {
        return root.createComponent(
          BlockStack,
          { spacing: 'loose', alignment: 'center' },
          root.createComponent(Text, { appearance: 'success' }, '🎉 Deal Accepted!'),
          root.createComponent(Heading, {}, `Final Price: ₹${finalPrice.toFixed(2)}`),
          root.createComponent(Text, { appearance: 'subdued' }, `You saved ₹${(originalPrice - finalPrice).toFixed(2)}`),
          root.createComponent(Text, { appearance: 'subdued' }, `Discount code: ${discountCode}`),
          root.createComponent(
            Button,
            { onPress: applyBargainDiscount, variant: 'primary', loading },
            'Apply to Checkout →'
          ),
          root.createComponent(
            Button,
            { onPress: closeBargain, variant: 'secondary' },
            'Close'
          )
        );
      }

      // Rejected
      if (bargainStep === 'rejected') {
        return root.createComponent(
          BlockStack,
          { spacing: 'loose', alignment: 'center' },
          root.createComponent(Text, { appearance: 'critical' }, '😔 Negotiation Ended'),
          root.createComponent(Text, { appearance: 'subdued' }, 'Attempts exhausted. No deal this time.'),
          root.createComponent(
            Button,
            { onPress: closeBargain, variant: 'primary' },
            'Continue Checkout'
          )
        );
      }

      return null;
    })
  );

  root.appendChild(modal);
});

// React-like hooks polyfill for UI Extensions
function useState(initial: any) {
  // In real extension, use useState from @shopify/ui-extensions-react
  // This is a simplified version for the extension format
  return [initial, (v: any) => v];
}

function useEffect(fn: any, deps: any[]) {
  // In real extension, use useEffect from @shopify/ui-extensions-react
}