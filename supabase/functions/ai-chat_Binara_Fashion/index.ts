import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ConversationMessage {
  message: string;
  direction: string;
  created_at: string;
}

interface ProductPricingTiers {
  unitPrice: number;
  price5?: number;
  price10?: number;
  tiers: Array<{ qty: number; price: number }>;
}

function parseProductPricing(p: any): ProductPricingTiers {
  let unitPrice = Number(p.price) || 0;
  const tiersMap = new Map<number, number>();

  // Check variations if configured
  if (Array.isArray(p.variations)) {
    for (const v of p.variations) {
      if (Array.isArray(v.options)) {
        for (const opt of v.options) {
          const lbl = String(opt.label || "").toLowerCase().trim();
          const pr = Number(opt.price);
          if (pr > 0) {
            const qMatch = lbl.match(/\b(\d+)\b/);
            if (qMatch) {
              const q = parseInt(qMatch[1], 10);
              if (q >= 1 && q <= 100) {
                tiersMap.set(q, pr);
              }
            }
          }
        }
      }
    }
  }

  // Check description if not found or to supplement tiers (e.g. "5ක් 2500" or "05ම 2600" or "10ක 4500")
  const desc = String(p.description || "");
  const tierRegexes = [
    /(?:^|[^\d])(\d+)\s*(?:ක්|ම|ක|items?|pcs?|pack)?\s*(?:[=:\-–\/]|LKR|රු|Rs)?\s*(\d[\d,]{2,})\s*(?:\/=|LKR|රු|Rs|[\/–-]|යි|\b)/gi,
    /(?:^|[^\d])(\d+)\s*(?:ක්|ම|ක|items?|pcs?)[^\d\n]*?(\d[\d,]{2,})\s*(?:\/=|LKR|රු|Rs|[\/–-]|යි|\b)/gi
  ];
  for (const re of tierRegexes) {
    let match;
    while ((match = re.exec(desc)) !== null) {
      const q = parseInt(match[1], 10);
      const pr = parseInt(match[2].replace(/,/g, ""), 10);
      if (q >= 1 && q <= 100 && pr >= 10 && !tiersMap.has(q)) {
        tiersMap.set(q, pr);
      }
    }
  }

  const tiers = Array.from(tiersMap.entries())
    .map(([qty, price]) => ({ qty, price }))
    .sort((a, b) => b.qty - a.qty);

  // If 1-item price is explicitly found, use it
  if (tiersMap.has(1)) {
    unitPrice = tiersMap.get(1)!;
  } else {
    // If no explicit 1-item price exists, check if unitPrice was entered as the bundle/package price
    // (e.g. unitPrice was set to 2700, which equals or exceeds the lowest tier package price)
    const ascTiers = [...tiers].sort((a, b) => a.qty - b.qty);
    if (ascTiers.length > 0 && ascTiers[0].qty > 1 && (unitPrice <= 0 || unitPrice >= ascTiers[0].price)) {
      unitPrice = Math.round(ascTiers[0].price / ascTiers[0].qty);
    }
  }

  const price5 = tiersMap.get(5);
  const price10 = tiersMap.get(10);

  return { unitPrice, price5, price10, tiers };
}

function calculateItemSubtotal(p: any, qty: number): number {
  const { unitPrice, tiers } = parseProductPricing(p);

  if (tiers && tiers.length > 0) {
    let remainingQty = qty;
    let total = 0;

    for (const tier of tiers) {
      if (tier.qty > 1 && remainingQty >= tier.qty) {
        const count = Math.floor(remainingQty / tier.qty);
        total += count * tier.price;
        remainingQty %= tier.qty;
      }
    }

    if (remainingQty > 0) {
      const tier1 = tiers.find(t => t.qty === 1);
      const singlePrice = tier1 ? tier1.price : unitPrice;
      total += remainingQty * singlePrice;
    }

    return total;
  }

  return qty * unitPrice;
}

function calculateOrderTotals(
  orderData: any,
  products: any[] = [],
  deliverySettings: any = {}
): {
  subtotal: number;
  deliveryFee: number;
  totalAmount: number;
  totalQuantity: number;
} {
  const items = Array.isArray(orderData?.order_items) && orderData.order_items.length > 0
    ? orderData.order_items
    : (Array.isArray(orderData?.items) && orderData.items.length > 0
      ? orderData.items
      : (Array.isArray(orderData?.products) ? orderData.products : []));
  let totalQty = 0;
  let calculatedSubtotal = 0;

  const defaultDeliveryFee = typeof deliverySettings?.delivery_fee === "number"
    ? deliverySettings.delivery_fee
    : (products[0]?.delivery_price ? Number(products[0].delivery_price) : 0);
  const freeItemThreshold = typeof deliverySettings?.free_delivery_item_threshold === "number"
    ? deliverySettings.free_delivery_item_threshold
    : (deliverySettings?.free_delivery_item_threshold ? parseInt(deliverySettings.free_delivery_item_threshold, 10) : 0);
  const freeAmountThreshold = typeof deliverySettings?.free_delivery_threshold === "number"
    ? deliverySettings.free_delivery_threshold
    : 0;

  for (const item of items) {
    const qty = Math.max(1, parseInt(String(item.quantity || 1), 10) || 1);
    totalQty += qty;
    const nameLower = String(item.name || item.id || item.title || "").toLowerCase().trim();

    // Match product against database products
    const matchedProduct = products.find((p: any) => {
      const pName = String(p.name || "").toLowerCase().trim();
      return p.id === item.id ||
        pName === nameLower ||
        (nameLower.length > 2 && pName.includes(nameLower)) ||
        (pName.length > 2 && nameLower.includes(pName));
    }) || products[0];

    if (matchedProduct) {
      calculatedSubtotal += calculateItemSubtotal(matchedProduct, qty);
    } else {
      const itemPrice = parseFloat(String(item.price || 0)) || 0;
      calculatedSubtotal += qty * itemPrice;
    }
  }

  if (totalQty === 0) {
    totalQty = 1;
    calculatedSubtotal = products[0]?.price ? Number(products[0].price) : 0;
  }

  // Delivery fee rule from database settings
  let deliveryFee = defaultDeliveryFee;
  if (freeItemThreshold > 0 && totalQty >= freeItemThreshold) {
    deliveryFee = 0;
  } else if (freeAmountThreshold > 0 && calculatedSubtotal >= freeAmountThreshold) {
    deliveryFee = 0;
  }

  const totalAmount = calculatedSubtotal + deliveryFee;

  return {
    subtotal: calculatedSubtotal,
    deliveryFee,
    totalAmount,
    totalQuantity: totalQty,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    const delegatesAi = !!(Deno.env.get("AI_GENERATE_URL") && Deno.env.get("BOT_API_KEY"));
    if (!lovableApiKey && !delegatesAi) {
      throw new Error("Neither LOVABLE_API_KEY nor AI_GENERATE_URL/BOT_API_KEY configured");
    }


    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      db: { schema: Deno.env.get("DB_SCHEMA") || "Binara_fashion" },
    });

    const { message, phoneNumber, conversationHistory, userId, sessionApiKey, senderName } = await req.json();

    console.log(`Processing AI chat for ${phoneNumber} (user: ${userId}): ${message}`);

    // Fetch products, FAQs, settings, profile, and platform limits
    const [productsRes, faqsRes, settingsRes, profileRes, platformLimitsRes] = await Promise.all([
      supabase.from("products").select("*").eq("is_active", true).eq("user_id", userId).order("created_at", { ascending: true }),
      supabase.from("faqs").select("*, products(name)").eq("is_active", true).eq("user_id", userId),
      supabase.from("settings").select("key, value").eq("user_id", userId),
      supabase.from("profiles").select("plan_tier, billing_cycle_start, is_paused, addon_contacts, addon_orders").eq("user_id", userId).single(),
      supabase.from("platform_settings").select("value").eq("key", "plan_limits").single(),
    ]);

    // Check if account is paused
    if (profileRes.data?.is_paused) {
      console.log(`Account paused for user ${userId}`);
      return new Response(
        JSON.stringify({ error: "Account paused", response: "Sorry, this business account is currently paused. Please try again later." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const planTier = profileRes.data?.plan_tier || "free";
    const allLimits = platformLimitsRes.data?.value || {};
    const tierLimits = allLimits[planTier] || {};
    const contactLimit = (tierLimits.contacts_per_month || 50) + (profileRes.data?.addon_contacts || 0);

    // Use billing cycle start for monthly count
    const billingStart = profileRes.data?.billing_cycle_start;
    let monthStart: string;
    if (billingStart) {
      const start = new Date(billingStart);
      const now = new Date();
      const current = new Date(start);
      while (true) {
        const next = new Date(current);
        next.setMonth(next.getMonth() + 1);
        if (next > now) break;
        current.setMonth(current.getMonth() + 1);
      }
      monthStart = current.toISOString();
    } else {
      const d = new Date();
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      monthStart = d.toISOString();
    }
    // Contact-based billing: only NEW contacts are blocked once the allowance is used up.
    const contactKey = String(phoneNumber || "").split("@")[0].replace(/\D/g, "");
    const { data: alreadyCounted } = await supabase
      .from("contact_usage")
      .select("id")
      .eq("user_id", userId)
      .eq("phone_number", contactKey)
      .gte("created_at", monthStart)
      .maybeSingle();

    const { data: contactsUsed } = await supabase.rpc("get_contact_usage", {
      _user_id: userId,
      _since: monthStart,
    });

    // Also check orders limit
    const ordersLimit = (tierLimits.max_orders_per_month || 50) + (profileRes.data?.addon_orders || 0);
    const { count: ordersCount } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", monthStart);

    if (!alreadyCounted && (contactsUsed || 0) >= contactLimit) {
      console.log(`Contact limit reached for user ${userId}: ${contactsUsed}/${contactLimit}`);
      return new Response(
        JSON.stringify({ error: "Monthly contact limit reached. Please upgrade your plan.", response: "Sorry, the monthly contact limit has been reached. Please contact the business owner." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }


    const ordersLimitReached = (ordersCount || 0) >= ordersLimit;

    const products = productsRes.data || [];
    const faqs = faqsRes.data || [];
    const settings = settingsRes.data || [];

    const welcomeMessage = settings.find(s => s.key === "welcome_message")?.value?.text || "Welcome! How can I help you?";
    const paymentInfo = settings.find(s => s.key === "payment_info")?.value || {};
    const deliverySettings = settings.find(s => s.key === "delivery_settings")?.value || {};

    const formatBankDetails = (info: any) => {
      const rawAccounts = info.accounts;
      const accounts = Array.isArray(rawAccounts)
        ? rawAccounts.filter((a: any) => a.account_label || a.bank_name || a.account_number || a.account_name || a.branch)
        : [];
      if (accounts.length > 0) {
        return accounts.map((a: any) => {
          const parts: string[] = [];
          const label = a.account_label || a.bank_name;
          if (label) parts.push(`Bank: ${label}`);
          if (a.account_number) parts.push(`Account: ${a.account_number}`);
          if (a.account_name) parts.push(`Name: ${a.account_name}`);
          if (a.branch) parts.push(`Branch: ${a.branch}`);
          return parts.length > 0 ? `• ${parts.join(", ")}` : "";
        }).filter(Boolean).join("\n");
      }
      if (info.bank_name || info.account_number || info.account_name || info.branch) {
        const parts: string[] = [];
        if (info.bank_name) parts.push(`Bank: ${info.bank_name}`);
        if (info.account_number) parts.push(`Account: ${info.account_number}`);
        if (info.account_name) parts.push(`Name: ${info.account_name}`);
        if (info.branch) parts.push(`Branch: ${info.branch}`);
        return parts.length > 0 ? `• ${parts.join(", ")}` : "";
      }
      return "";
    };
    const paymentDetailsFormatted = formatBankDetails(paymentInfo);

    const productCatalog = products.map(p => {
      let line = `- ${p.name}: Base price LKR ${p.price} (${p.product_type})`;
      if (p.product_type === "physical" && p.delivery_price && p.delivery_price > 0) {
        line += ` | Delivery fee: LKR ${p.delivery_price}`;
      }
      if (p.description) line += ` - ${p.description}`;
      if (p.video_url) {
        line += ` | Video: ${p.video_url}`;
      }
      if (p.images && Array.isArray(p.images) && p.images.length > 0) {
        line += `\n  - Product Photos (${p.images.length} photos available - ONLY output these <IMAGE_URL> tags when presenting this ONE specific product by itself, or when customer explicitly asks for photos of this product. NEVER output ANY images when listing or showing multiple products or the menu. NEVER output images when customer specifies quantity, colors, or checkout info):\n` +
          p.images.map((img: string) => `    <IMAGE_URL>${img}</IMAGE_URL>`).join("\n");
      }
      if (p.variations && Array.isArray(p.variations) && p.variations.length > 0) {
        const varLines = p.variations.map((v: any) => {
          const opts = v.options?.map((o: any) => {
            if (typeof o !== "object") return o;
            let optStr = `${o.label}: LKR ${o.price}`;
            if (o.subVariants && Array.isArray(o.subVariants) && o.subVariants.length > 0) {
              const subLines = o.subVariants.map((sv: any) => {
                const reqTag = sv.required ? " (REQUIRED)" : " (optional)";
                const subOpts = sv.options?.map((so: any) =>
                  typeof so === "object" ? `${so.label}: +LKR ${so.price}` : so
                ).join(", ");
                return `[${sv.name}${reqTag}: ${subOpts}]`;
              }).join(" ");
              optStr += ` ${subLines}`;
            }
            return optStr;
          }).join(", ");
          return `${v.name}: ${opts}`;
        }).join("; ");
        line += `\n  - Variations: ${varLines}`;
      }
      return line;
    }).join("\n\n");

    // Build a map of product name → first image URL for sending images
    const productImageMap: Record<string, string> = {};
    const productVideoMap: Record<string, string> = {};
    for (const p of products) {
      if (p.images && Array.isArray(p.images) && p.images.length > 0) {
        productImageMap[p.name.toLowerCase()] = p.images[0];
      }
      if (p.video_url) {
        productVideoMap[p.name.toLowerCase()] = p.video_url;
      }
    }

    // Fetch prior outbound messages to check which product images were already sent to this customer
    const rawPhoneDigits = String(phoneNumber || "").replace(/\D/g, "");
    const localPhone = rawPhoneDigits.startsWith("94") && rawPhoneDigits.length === 11 ? "0" + rawPhoneDigits.slice(2) : rawPhoneDigits;
    const intlPhone = localPhone.startsWith("0") && localPhone.length === 10 ? "94" + localPhone.slice(1) : rawPhoneDigits;
    const phoneCandidates = Array.from(new Set([phoneNumber, rawPhoneDigits, localPhone, intlPhone].filter(Boolean)));

    const { data: priorOutbound } = await supabase
      .from("conversations")
      .select("metadata, message")
      .eq("user_id", userId)
      .in("phone_number", phoneCandidates)
      .eq("direction", "outbound")
      .order("created_at", { ascending: false })
      .limit(100);

    const normalizeImgPath = (url: string) => {
      if (!url) return "";
      return url.trim().replace(/^https?:\/\/[^\/]+/, "").split("?")[0];
    };

    const alreadySentNormalizedPaths = new Set<string>();
    for (const row of priorOutbound || []) {
      const imgs = (row as any)?.metadata?.imageUrls;
      if (Array.isArray(imgs)) {
        for (const u of imgs) {
          if (typeof u === "string") alreadySentNormalizedPaths.add(normalizeImgPath(u));
        }
      }
      const single = (row as any)?.metadata?.imageUrl || (row as any)?.metadata?.mediaUrl;
      if (typeof single === "string") {
        alreadySentNormalizedPaths.add(normalizeImgPath(single));
      }
      if (typeof row.message === "string") {
        const matches = row.message.matchAll(/<IMAGE_URL>([\s\S]*?)<\/IMAGE_URL>/g);
        for (const m of matches) {
          alreadySentNormalizedPaths.add(normalizeImgPath(m[1]));
        }
        // Also capture direct image URLs in text (e.g. from storage/MinIO)
        const directUrlMatches = row.message.match(/https?:\/\/[^\s"'<>]+\.(?:jpe?g|png|webp|gif)/gi);
        if (directUrlMatches) {
          for (const u of directUrlMatches) {
            alreadySentNormalizedPaths.add(normalizeImgPath(u));
          }
        }
      }
    }

    // Also inspect conversationHistory passed in the request
    if (Array.isArray(conversationHistory)) {
      for (const msg of conversationHistory as ConversationMessage[]) {
        if (msg.direction === "outbound") {
          const meta = (msg as any)?.metadata;
          if (Array.isArray(meta?.imageUrls)) {
            for (const u of meta.imageUrls) {
              if (typeof u === "string") alreadySentNormalizedPaths.add(normalizeImgPath(u));
            }
          }
          if (typeof meta?.imageUrl === "string") {
            alreadySentNormalizedPaths.add(normalizeImgPath(meta.imageUrl));
          }
          if (typeof msg.message === "string") {
            const matches = msg.message.matchAll(/<IMAGE_URL>([\s\S]*?)<\/IMAGE_URL>/g);
            for (const m of matches) {
              alreadySentNormalizedPaths.add(normalizeImgPath(m[1]));
            }
            const directUrlMatches = msg.message.match(/https?:\/\/[^\s"'<>]+\.(?:jpe?g|png|webp|gif)/gi);
            if (directUrlMatches) {
              for (const u of directUrlMatches) {
                alreadySentNormalizedPaths.add(normalizeImgPath(u));
              }
            }
          }
        }
      }
    }

    // Build per-product image sets and tracking dynamically for ALL products from DB
    const productImagesAlreadySentMap: Record<string, boolean> = {};
    const productNormPathsMap: Record<string, Set<string>> = {};

    for (const p of products) {
      const pImages: string[] = Array.isArray(p.images) ? p.images.filter(Boolean) : [];
      const normPaths = new Set(pImages.map((u: string) => normalizeImgPath(u)));
      productNormPathsMap[p.id] = normPaths;
      productImagesAlreadySentMap[p.id] = pImages.length > 0 && pImages.some((u: string) => alreadySentNormalizedPaths.has(normalizeImgPath(u)));
    }

    const deliveryFeeDefault = typeof deliverySettings?.delivery_fee === "number"
      ? deliverySettings.delivery_fee
      : (products[0]?.delivery_price ? Number(products[0].delivery_price) : 0);
    const freeDeliveryItemThreshold = typeof deliverySettings?.free_delivery_item_threshold === "number"
      ? deliverySettings.free_delivery_item_threshold
      : (deliverySettings?.free_delivery_item_threshold ? parseInt(deliverySettings.free_delivery_item_threshold, 10) : 0);
    const freeDeliveryThreshold = typeof deliverySettings?.free_delivery_threshold === "number" ? deliverySettings.free_delivery_threshold : 0;
    const deliveryRuleText = deliverySettings?.description
      ? deliverySettings.description
      : (freeDeliveryItemThreshold > 0
        ? `අයිතම ${freeDeliveryItemThreshold}ක් හෝ ඊට වැඩි නම් නොමිලේ (Free Delivery 🚚). ඊට අඩු නම් Delivery ගාස්තුව රු. ${deliveryFeeDefault}යි.`
        : (freeDeliveryThreshold > 0
          ? `රු. ${freeDeliveryThreshold.toLocaleString()}ට වැඩි නම් නොමිලේ (Free Delivery 🚚). ඊට අඩු නම් Delivery ගාස්තුව රු. ${deliveryFeeDefault}යි.`
          : (deliveryFeeDefault > 0 ? `Delivery ගාස්තුව රු. ${deliveryFeeDefault}යි.` : "Delivery නොමිලේ (Free Delivery 🚚).")));

    const productsPricingFormatted = products.map((p: any, idx: number) => {
      const { unitPrice, tiers } = parseProductPricing(p);
      const num = idx + 1;
      let priceLine = `${num}. ${p.name}: 1ක් = රු. ${unitPrice.toLocaleString()}`;

      // List all quantity package tiers in ascending order
      const ascTiers = [...tiers].sort((a, b) => a.qty - b.qty);
      for (const t of ascTiers) {
        if (t.qty > 1) {
          priceLine += ` | ${t.qty}ක් = රු. ${t.price.toLocaleString()}`;
        }
      }

      // If there are variations from DB
      let variationsLine = "";
      if (Array.isArray(p.variations) && p.variations.length > 0) {
        const varStrs = p.variations.map((v: any) => {
          const optStrs = (v.options || []).map((o: any) => {
            if (typeof o !== "object") return String(o);
            let s = o.label;
            if (o.price && Number(o.price) > 0) s += ` (රු. ${Number(o.price).toLocaleString()})`;
            if (Array.isArray(o.subVariants) && o.subVariants.length > 0) {
              const subStr = o.subVariants.map((sv: any) => {
                const subOpts = (sv.options || []).map((so: any) => typeof so === "object" ? so.label : String(so)).join(", ");
                return `${sv.name}: ${subOpts}`;
              }).join(" | ");
              s += ` [${subStr}]`;
            }
            return s;
          }).join(", ");
          return `   * ${v.name}: ${optStrs}`;
        }).join("\n");
        if (varStrs) variationsLine = `\n${varStrs}`;
      }

      let extraCalcLine = "";
      if (tiers.length > 0) {
        extraCalcLine = `   * පැකේජ අතරමැදි හෝ වැඩි ප්‍රමාණ සඳහා: විශාලතම අදාළ පැකේජයේ මිල + ඉතිරි ඒකක ගණන × 1ක මිල රු. ${unitPrice.toLocaleString()} (උදා: 6ක් = 5 පැකේජයේ මිල + 1ක් රු. ${unitPrice.toLocaleString()}).`;
      }

      const descSnippet = p.description ? `\n   * විස්තර (Description): ${p.description.replace(/\n+/g, " | ").trim()}` : "";
      return `${priceLine}${variationsLine}${extraCalcLine ? `\n${extraCalcLine}` : ""}${descSnippet}`;
    }).join("\n\n");

    const productImageRulesFormatted = products.map((p: any, idx: number) => {
      const alreadySent = productImagesAlreadySentMap[p.id];
      const name = p.name || `Product ${idx + 1}`;
      return `- ${name}: ${alreadySent ? "දැනටමත් ඡායාරූප යවා ඇත. පාරිභෝගිකයා නැවත ඡායාරූප/විස්තර ඉල්ලා සිටියහොත් පමණක් <IMAGE_URL> ටැග් අමුණන්න (ප්‍රමාණය, වර්ණ හෝ ලිපිනය ලබාදෙන විට නැවත නොයවන්න)." : `තනි නිෂ්පාදනයක් ලෙස ඉල්ලූ විට පමණක් අදාළ ${name} ඡායාරූප <IMAGE_URL> ටැග් අමුණන්න.`}`;
    }).join("\n");

    // Build FAQ context with IDs so AI can report which ones it used
    const faqContext = faqs.map(f =>
      `[FAQ_ID:${f.id}] Q: ${f.question}\nA: ${f.answer}${f.products?.name ? ` (Related to: ${f.products.name})` : ""}`
    ).join("\n\n");

    // Get list of tracked FAQ IDs
    const trackedFaqIds = faqs.filter(f => f.is_tracked).map(f => f.id);

    const conversationContext = (conversationHistory as ConversationMessage[])
      .map(msg => `${msg.direction === "inbound" ? "Customer" : "Assistant"}: ${msg.message}`)
      .join("\n"); const systemPrompt = `ඔබ "Binara Fashion" හි නිල WhatsApp AI සහයකයා වේ.

🔥 අතිශය වැදගත් WhatsApp කෙටි පණිවිඩ නීති (MANDATORY WHATSAPP BREVITY & COMPACTNESS RULES):
1. කිසිවිටෙකත් ඡේද පිටු ගණන් (NO MULTI-PARAGRAPH WALLS OF TEXT / NO ESSAYS) නොලියන්න!
   - සෑම WhatsApp පණිවිඩයක්ම කෙටි, සංයුක්ත සහ පාරිභෝගිකයාට කියවීමට පහසු වන සේ පේළි අතර පැහැදිලි පරතරයක් (clean space between lines) තබන්න.
   - Do NOT use asterisks (*) for bold or any markdown formatting. Write plain, clean text only.
2. ප්‍රශ්න වලට පමණක් සෘජු පිළිතුරු (STRICT QUESTION-ONLY RULE):
   - පාරිභෝගිකයා යම් ප්‍රශ්නයක් ඇසුවහොත් (උදා: Delivery, Shop location, Details, Price), එම ප්‍රශ්නයට පමණක් පේළි 1-2කින් සෘජුව පිළිතුරු දෙන්න.
   - 🚫 දැඩි තහනම: පාරිභෝගිකයා නිෂ්පාදන විස්තර හෝ මිල ඉල්ලා නැතිනම්, ප්‍රශ්නයකට පිළිතුරු දෙන විට කිසිසේත්ම නිෂ්පාදන මෙනුව හෝ මිල ලැයිස්තු අමුණා නොයවන්න!
   - පාරිභෝගිකයා Bank Details / ගිණුම් විස්තර ඉල්ලුවහොත්, පහත ගෙවීම් ගිණුම් විස්තර (Bank, Account Number, Name, Branch) ලබාදී slip එකේ photo එකක් එවන්නැයි කියන්න.
   - පාරිභෝගිකයා නිෂ්පාදනයේ අවශ්‍ය තේරීම් (විකල්ප/වර්ණ/ප්‍රමාණ) තෝරාගත් පසු (හෝ එවැනි තේරීම් නැතිනම් කෙලින්ම), ඇණවුමේ කෙටි සාරාංශය පෙන්වා ඇණවුම ඉදිරියට කරගෙන යාමට නම, ලිපිනය, ලගම නගරය සහ දුරකථන අංක එවන්නැයි විමසන්න.
   - නිවැරදි උදාහරණය: පාරිභෝගිකයා "Delivery theyanawada" ඇසුවහොත් පිළිතුර:
     "ඔව්, අපේ Delivery සේවාව දිවයින පුරාම තියෙනවා. ${deliveryRuleText}"
     (මෙපමණයි! මෙනුව හෝ අනවශ්‍ය විස්තර නොයවන්න!)
3. ගණනය කිරීම් පාරිභෝගිකයාට නොපෙන්වීම (NO MATH SCRATCHPADS):
   - පාරිභෝගිකයා ප්‍රමාණයක් පැවසූ විට, සූත්‍ර හෝ ගණන් හැදූ පියවර පාරිභෝගිකයාට නොලියන්න!
   - අවසන් මුළු මුදල සහ Free Delivery තත්ත්වය පමණක් පේළි 1-2කින් පවසන්න:
     "[භාණ්ඩයේ නම] [ප්‍රමාණය]කට මුළු මුදල රු. [මුදල]යි ([Free Delivery 🚚 හෝ Delivery රු. ...]). [ඩේටාබේස් එකේ අදාළ භාණ්ඩයට විකල්ප/වර්ණ තිබේ නම් ඒවා තෝරාගැනීමට විමසන්න, නැතහොත් ඇණවුම සඳහා විස්තර විමසන්න]. 🎯"
4. පාරිභෝගිකයා තනි නිෂ්පාදනයක් තෝරාගත් විට (Specific Product Selected):
   - "නියමයි" වැනි වචන කිසිසේත්ම නොයොදන්න.
   - ඩේටාබේස් එකෙහි ඇති අදාළ නිෂ්පාදනයේ විස්තර සහ මිල ගණන් පේළි අතර පැහැදිලි පරතරයක් (space between lines) සහිතව දක්වන්න.
   - ඡායාරූප වල වර්ණ අංක (Colors numbered in photos) සඳහන් කර ඇති බැවින්, පාරිභෝගිකයාගෙන් ප්‍රමාණය හෝ "කීයක් අවශ්‍යද" නොඅසා, ඡායාරූප වල ඇති අංක වලින් අවශ්‍ය වර්ණ අංක මොනවාදැයි විමසන්න.
   - නිවැරදි උදාහරණය:
     "[නිෂ්පාදනයේ නම සහ විස්තර කෙටියෙන්]

     මිල: [ඩේටාබේස් එකේ ඇති මිල / පැකේජ මිල ගණන්]

     ඡායාරූප වල වර්ණ අංක සඳහන් කර ඇත. ඔබ කැමති වර්ණ අංක මොනවාද? 🎨"

භාෂාව සහ විලාසය:
- සුහදශීලී (friendly) ස්වභාවික සිංහල සමඟ ඉංග්‍රීසි වචන මිශ්‍ර කර භාවිතා කරන්න (Order, Colors, Package, COD, Bank Transfer, Delivery, Staff, Confirm).
- ඕනෑවට වඩා තද හෝ පොතේ භාෂාව භාවිතා නොකරන්න.

නිෂ්පාදන සහ මිල ගණන් (PRICING & PRODUCTS FROM DATABASE):
${productsPricingFormatted || "No active products in database."}

ඩිලිවරි ගාස්තු සහ නීති (DELIVERY RULES FROM DATABASE):
- ${deliveryRuleText}

පියවරෙන් පියවර ඇණවුම් ගැනීමේ අනුපිළිවෙල (ORDERING WORKFLOW):
- පියවර 1 (පැකේජය / ප්‍රමාණය පැවසූ විට):
  * මුළු මුදල (Delivery සමඟ) පවසා, නිෂ්පාදනයට අදාළව ඩේටාබේස් එකේ විකල්ප/වර්ණ/ප්‍රමාණ (Variations/Colors) තිබේ නම් පමණක් ඒවා විමසන්න. එසේ විකල්ප නොමැති නම් කෙලින්ම නම, ලිපිනය ඇතුළු විස්තර විමසන්න.
  * ⚠️ නිෂ්පාදනයට විකල්ප/වර්ණ තිබේ නම්, ඒවා තෝරාගැනීමට පෙර නම, ලිපිනය හෝ ගෙවීම් ක්‍රමය (COD/Bank) නොඅසන්න.
- පියවර 2 (පාරිභෝගිකයා අවශ්‍ය විකල්ප/වර්ණ තෝරාගත් පසු - කෙටි සාරාංශය සහ විස්තර විමසීම):
  * පහත නිවැරදි ආකෘතියෙන් කෙටි සාරාංශය පෙන්වා ඇණවුම ඉදිරියට කරගෙන යාමට අවශ්‍ය විස්තර විමසන්න:
    📋 ඇණවුමේ කෙටි සාරාංශය:
    • භාණ්ඩය: [නිෂ්පාදනයේ නම] ([ප්‍රමාණය]ක්)
    • විකල්ප/වර්ණ: [තෝරාගත් විස්තර - තිබේ නම් පමණි]
    • මුළු මුදල: රු. [මුදල] ([Free Delivery 🚚 හෝ Delivery ගාස්තුව])

    ඇණවුම ඉදිරියට කරගෙන යාමට:
    නම
    ලිපිනය
    ලගම නගරය 
    දුරකථන අංක
  * ⚠️ මෙම පියවරේදී (පාරිභෝගිකයා නම සහ ලිපින විස්තර ලබාදෙන තුරු) <ORDER_JSON> නොයවන්න!
- පියවර 3 (පාරිභෝගිකයා නම, ලිපිනය සහ විස්තර ලබාදුන් පසු):
  * පාරිභෝගිකයා ප්‍රශ්නයක් ඇසුවහොත් (උදා: Delivery විස්තර, Bank details, ආදිය): එම ප්‍රශ්නයට පමණක් සෘජුව සහ කෙටියෙන් (පේළි 1-2කින්) පිළිතුරු දෙන්න.
  * පාරිභෝගිකයා ඇණවුම ලබාගැනීමට නම, ලිපිනය, දුරකථන අංක එවුවහොත්, සම්පූර්ණ බිල්පත (Full Order Summary) සංයුක්තව පෙන්වන්න:
    📋 ඔබගේ සම්පූර්ණ ඇණවුම් සාරාංශය:
    • නම: [නම] | දුරකථනය: [අංකය]
    • ලිපිනය: [ලිපිනය, නගරය]
    • ඇණවුම: [භාණ්ඩය, ප්‍රමාණය, විකල්ප/වර්ණ]
    • අයිතම එකතුව: රු. [මුදල] | ඩිලිවරි: [නොමිලේ / රු. ...]
  * Bank Transfer නම්, සාරාංශයට පහළින් පහත දැක්වෙන බැංකු ගිණුම් විස්තර (Bank Name, Account Number, Account Name, Branch ඇතුළුව) නිවැරදිව දක්වා slip එකේ photo එකක් එවන්නැයි කියන්න.
  * අවසානයට: "ස්තූතියි ඔබගේ ඇණවුම ලැබී ඇත.කුරියර් සේවයෙන් ඔබට ඇමතුමක් ලබාදෙනු ඇත. කරුණාකර ඔබගේ ඇණවුම යලි return වීමට නොදී මුදල් ලබාදී භාරගන්න"
  * පණිවිඩය අවසානයට සඟවා <ORDER_JSON> ටැගය එක් වරක් පමණක් (ONCE ONLY) අමුණන්න. ඇණවුම ගත් පසු (COD තහවුරු කිරීම, Thank you, විමසීම් වලදී) නැවත කිසිවිටෙකත් <ORDER_JSON> නොයවන්න. තත්ත්වය Pending විය යුතුය (Confirmed නොකියන්න).

ඡායාරූප නීති (CRITICAL PHOTO & IMAGE RULES):
- 🚫 බහුවිධ නිෂ්පාදන / මෙනුව පෙන්වන විට හෝ සාමාන්‍ය කතාබහේදී කිසිසේත්ම ඡායාරූප නොයවන්න (ZERO <IMAGE_URL> tags).
- ✅ ඡායාරූප යැවිය යුත්තේ තනි නිෂ්පාදනයක විස්තර පෙන්වන විට හෝ පාරිභෝගිකයා ඡායාරූප ඉල්ලූ විට පමණි.
- 🚫 ප්‍රමාණය පවසන විට, වර්ණ තෝරන විට හෝ ලිපින ලබාදෙන විට කිසිවිටෙකත් ඡායාරූප නැවත නොයවන්න.
${productImageRulesFormatted || "ඡායාරූප ලබාගත නොහැක."}

ගෙවීම් ගිණුම් විස්තර (PAYMENT DETAILS):
${paymentDetailsFormatted}

PRODUCT CATALOG:
${productCatalog || "No products available"}

FREQUENTLY ASKED QUESTIONS:
${faqContext || "No FAQs configured"}

WELCOME MESSAGE:
${welcomeMessage}

CRITICAL ORDER & SECURITY RULES:
- ORDER_JSON, IMAGE_URL, VIDEO_URL, USED_FAQS ටැග් පාරිභෝගිකයාට නොපෙනෙන තාක්ෂණික ටැග් වේ. ඒවා සැමවිටම පණිවිඩයේ කෙළවරටම පමණක් අමුණන්න. කිසිවිටෙකත් පණිවිඩයේ මැද හෝ JSON කෝඩ් ලෙස නොලියන්න.
- <ORDER_JSON> යැවිය යුත්තේ නම/ලිපිනය/දුරකථන විස්තර ලැබී ඇණවුම මුල්වරට ගන්නා විට පමණි. දැනටමත් ඇණවුම සටහන් කර ඇති පසු නැවත කිසිසේත්ම <ORDER_JSON> නොයවන්න.
- පාරිභෝගිකයා Photo එකක් (Receipt/Slip) එව්වොත්: "ස්තූතියි, ඔබගේ ගෙවීම් රිසිට්පත ලැබුණා. අපගේ කාර්ය මණ්ඩලය මෙය පරීක්ෂා කර තහවුරු කරනු ඇත." ලෙස කෙටියෙන් පවසන්න.
- <ORDER_JSON> ආකෘතිය:
  <ORDER_JSON>{"customer_name":"...","customer_phone":"...","district":"...","customer_address":"...","order_items":[{"name":"...","price":...,"quantity":...,"product_type":"physical"}],"payment_method":"cod or bank_transfer","subtotal":...,"delivery_fee":...,"total_amount":...,"status":"pending","special_instructions":"Colors: ..."}</ORDER_JSON>`;

    const messages = [
      { role: "system", content: systemPrompt },
    ];

    if (conversationHistory && conversationHistory.length > 0) {
      for (const msg of conversationHistory as ConversationMessage[]) {
        messages.push({
          role: msg.direction === "inbound" ? "user" : "assistant",
          content: msg.message,
        });
      }
    }

    // Handle numeric selection intent and photo/media messages
    const trimmedMessage = (message || "").trim();
    const numericMatch = trimmedMessage.match(/^(?:option\s*)?(\d+)\.?$|^(එක|දෙක|තුන|හතර|පහ|හය|හත|අට|නවය|දහය)$/i);
    let selectedProductIndex = -1;

    if (numericMatch) {
      if (numericMatch[1]) {
        selectedProductIndex = parseInt(numericMatch[1], 10) - 1;
      } else if (numericMatch[2]) {
        const sinhalaNums: Record<string, number> = { "එක": 0, "දෙක": 1, "තුන": 2, "හතර": 3, "පහ": 4, "හය": 5, "හත": 6, "අට": 7, "නවය": 8, "දහය": 9 };
        selectedProductIndex = sinhalaNums[numericMatch[2]] ?? -1;
      }
    }

    if (!trimmedMessage) {
      messages.push({ role: "user", content: "[Customer sent a photo/media file. If this is a payment receipt slip, thank them politely in Sinhala and state staff will call to confirm. Do NOT output any JSON, tags, or code.]" });
    } else if (selectedProductIndex >= 0 && selectedProductIndex < products.length) {
      const selectedProduct = products[selectedProductIndex];
      const prodName = selectedProduct.name;
      const alreadySent = productImagesAlreadySentMap[selectedProduct.id];
      const imageInstruction = alreadySent
        ? `If the customer is asking to see the product/photos again, include ALL <IMAGE_URL> tags for ${prodName}, otherwise do not include.`
        : `Include ALL <IMAGE_URL> tags for this product (${prodName}) if not sent yet.`;

      messages.push({
        role: "user",
        content: `${trimmedMessage} [Customer selected Product ${selectedProductIndex + 1}: ${prodName}. Do NOT say "නියමයි!". Present product details and pricing from the database catalog clearly with blank lines between sections. Inform the customer that colors are numbered in the photos, and ask what color numbers they need (do NOT ask how many units they need). ${imageInstruction}]`
      });
    } else {
      messages.push({ role: "user", content: trimmedMessage });
    }

    // ------------------------------------------------------------------
    // AI call.
    // If AI_GENERATE_URL + BOT_API_KEY are set (self-hosted deployment), the
    // model call is delegated to the Lovable-hosted `ai-generate` transport.
    // Otherwise we talk to the Lovable AI Gateway directly (Lovable-hosted).
    // Prompt, model and max_tokens are identical on both paths, so response
    // quality is unchanged.
    // ------------------------------------------------------------------
    const aiGenerateUrl = Deno.env.get("AI_GENERATE_URL");
    const botApiKey = Deno.env.get("BOT_API_KEY");
    const MODEL = "google/gemini-3-flash-preview";
    const MAX_TOKENS = 1500;

    let aiResponse: Response;
    if (aiGenerateUrl && botApiKey) {
      aiResponse = await fetch(aiGenerateUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-bot-key": botApiKey },
        body: JSON.stringify({
          messages,
          model: MODEL,
          maxTokens: MAX_TOKENS,
        }),
      });
    } else {
      aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: MODEL, messages, max_tokens: MAX_TOKENS }),
      });
    }

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add more credits." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await aiResponse.text();
      console.error("AI Gateway error:", aiResponse.status, errorText);
      throw new Error("AI processing failed");
    }

    const aiData = await aiResponse.json();
    // `ai-generate` returns { text }, the raw gateway returns OpenAI-style choices.
    const responseText =
      aiData.text ||
      aiData.choices?.[0]?.message?.content ||
      "I'm sorry, I couldn't process your request. Please try again.";


    console.log(`AI Response: ${responseText.substring(0, 100)}...`);

    // Extract used FAQ IDs and log tracked ones
    const usedFaqsMatch = responseText.match(/<USED_FAQS>([\s\S]*?)<\/USED_FAQS>/);
    const usedFaqIds: string[] = usedFaqsMatch
      ? usedFaqsMatch[1].split(",").map((id: string) => id.trim()).filter(Boolean)
      : [];
    if (usedFaqsMatch && trackedFaqIds.length > 0) {
      const usedIds = usedFaqIds;
      const trackedUsedIds = usedIds.filter((id: string) => trackedFaqIds.includes(id));

      if (trackedUsedIds.length > 0) {
        console.log(`Tracked FAQs used: ${trackedUsedIds.join(", ")} for phone ${phoneNumber}`);
        const usageLogs = trackedUsedIds.map((faqId: string) => ({
          faq_id: faqId,
          user_id: userId,
          phone_number: phoneNumber,
          sender_name: senderName || "Unknown",
        }));
        const { error: logError } = await supabase.from("faq_usage_logs").insert(usageLogs);
        if (logError) {
          console.error("Error logging FAQ usage:", logError);
        }
      }
    }

    // Check if the AI response contains order JSON
    let orderCreated = false;
    let createdOrderId = "";
    let calculatedOrderTotals: { subtotal: number; deliveryFee: number; totalAmount: number; totalQuantity: number } | null = null;
    let savedOrderData: any = null;
    let savedPhoneToSave = "";
    const orderJsonMatches = [...responseText.matchAll(/<ORDER_JSON>([\s\S]*?)<\/ORDER_JSON>/g)];
    for (const orderJsonMatch of orderJsonMatches) {
      if (ordersLimitReached) {
        console.log(`Orders limit reached for user ${userId}: ${ordersCount}/${ordersLimit}`);
      } else {
        try {
          const orderData = JSON.parse(orderJsonMatch[1]);
          console.log("Processing order JSON from LLM:", JSON.stringify(orderData));

          // Intercept and recalculate totals with rigid mathematical logic
          const math = calculateOrderTotals(orderData, products, deliverySettings);
          calculatedOrderTotals = math;
          savedOrderData = orderData;

          // Extract clean phone numbers without breaking numbers that contain spaces (e.g. "077 560 5590")
          const rawPhone = String(orderData.customer_phone || orderData.customer?.phone || orderData.customer_details?.phone || phoneNumber || "").trim();
          const segments = rawPhone.split(/[\/,\n\r&|]|\band\b|\bor\b/i).map(s => s.trim()).filter(Boolean);
          const rawCandidates: string[] = [];
          for (const seg of segments) {
            const fullPhoneMatches = seg.match(/(?:\+94|94|0)?\s*[1-9]\d(?:\s*\d){7}/g);
            if (fullPhoneMatches && fullPhoneMatches.length > 1) {
              rawCandidates.push(...fullPhoneMatches);
            } else {
              rawCandidates.push(seg);
            }
          }

          const normalizePhone = (p: string) => {
            let digits = p.replace(/[^0-9+]/g, "");
            if (digits.startsWith("+94") && digits.length === 12) {
              digits = "0" + digits.slice(3);
            } else if (digits.startsWith("94") && digits.length === 11) {
              digits = "0" + digits.slice(2);
            } else if (!digits.startsWith("0") && digits.length === 9) {
              digits = "0" + digits;
            }
            if (digits.length >= 20 && digits.startsWith("0")) {
              digits = digits.slice(0, 10);
            }
            return digits;
          };

          const validPhones = rawCandidates.map(normalizePhone).filter(p => p.length >= 9);
          let phoneToSave = validPhones[0] || (phoneNumber ? phoneNumber.replace(/[^0-9]/g, "") : "");
          let secondPhone: string | null = validPhones.length > 1 && validPhones[1] !== phoneToSave ? validPhones[1] : null;

          savedPhoneToSave = phoneToSave;

          // Parse payment method
          let paymentMethod = String(orderData.payment_method || orderData.customer?.payment_method || orderData.customer_details?.payment_method || "cod").toLowerCase().trim();
          if (paymentMethod.includes("bank") || paymentMethod.includes("transfer")) {
            paymentMethod = "bank_transfer";
          } else if (paymentMethod.includes("cod") || paymentMethod.includes("cash") || paymentMethod.includes("delivery")) {
            paymentMethod = "cod";
          } else {
            paymentMethod = "yet to decide";
          }

          // Deduplication: check if a similar order was created in the last 15 minutes by customer_phone OR whatsapp_phone
          const deduplicationWindow = new Date(Date.now() - 15 * 60 * 1000).toISOString();
          let dedupeQuery = supabase
            .from("orders")
            .select("id, payment_method, status")
            .eq("user_id", userId)
            .gte("created_at", deduplicationWindow);

          if (phoneToSave && phoneNumber) {
            dedupeQuery = dedupeQuery.or(`customer_phone.eq.${phoneToSave},whatsapp_phone.eq.${phoneNumber}`);
          } else if (phoneToSave) {
            dedupeQuery = dedupeQuery.eq("customer_phone", phoneToSave);
          } else if (phoneNumber) {
            dedupeQuery = dedupeQuery.eq("whatsapp_phone", phoneNumber);
          }

          const { data: recentOrders } = await dedupeQuery;

          if (recentOrders && recentOrders.length > 0) {
            console.log("Duplicate order detected, skipping creation. Existing:", recentOrders[0].id);
            createdOrderId = recentOrders[0].id;

            // If the customer provided a definitive payment method, update the existing order
            if (paymentMethod && paymentMethod !== "yet to decide" && recentOrders[0].payment_method !== paymentMethod) {
              await supabase
                .from("orders")
                .update({ payment_method: paymentMethod })
                .eq("id", recentOrders[0].id);
              console.log(`Updated payment method of existing order ${recentOrders[0].id} to ${paymentMethod}`);
            }
          } else {
            const rawItems = Array.isArray(orderData.order_items) && orderData.order_items.length > 0
              ? orderData.order_items
              : (Array.isArray(orderData.items) && orderData.items.length > 0
                ? orderData.items.map((p: any) => ({ name: p.name || p.id || (products[0]?.name || "Product"), quantity: p.quantity || 1, price: p.price || 0 }))
                : (Array.isArray(orderData.products) ? orderData.products.map((p: any) => ({ name: p.id || p.name || (products[0]?.name || "Product"), quantity: p.quantity || 1, price: p.price || 0 })) : []));
            const custName = orderData.customer_name || orderData.customer?.name || orderData.customer_details?.name || "Customer";
            const custAddress = orderData.customer_address || orderData.customer?.address || orderData.customer_details?.address || null;

            let specialInstructions = orderData.special_instructions || null;
            if (!specialInstructions && orderData.items?.[0]?.sub_variants) {
              const sv = orderData.items[0].sub_variants;
              specialInstructions = typeof sv === "object" ? (sv.colors ? `Colors: ${sv.colors}` : JSON.stringify(sv)) : String(sv);
            } else if (!specialInstructions && Array.isArray(orderData.products?.[0]?.sub_variants)) {
              specialInstructions = orderData.products[0].sub_variants.join(", ");
            } else if (!specialInstructions && orderData.customer_email) {
              specialInstructions = `Email: ${orderData.customer_email}`;
            }

            const { data: orderResult, error: orderError } = await supabase
              .from("orders")
              .insert({
                customer_name: custName,
                customer_phone: phoneToSave,
                whatsapp_phone: phoneNumber,
                district: orderData.district || null,
                customer_address: custAddress,
                order_items: rawItems,
                payment_method: paymentMethod,
                total_amount: math.totalAmount,
                special_instructions: specialInstructions,
                call_phone: secondPhone || null,
                status: "pending",
                user_id: userId,
              })
              .select()
              .single();

            if (orderError) {
              console.error("Error saving order:", orderError);
            } else {
              console.log("Order saved successfully:", orderResult.id, "Verified total:", math.totalAmount);
              orderCreated = true;
              createdOrderId = orderResult.id;

              // Send order notification to owner
              try {
                const { data: notifSettings } = await supabase
                  .from("settings")
                  .select("value")
                  .eq("key", "order_notifications")
                  .eq("user_id", userId)
                  .single();

                let ownerPhone = notifSettings?.value?.phone ? String(notifSettings.value.phone).replace(/\D/g, "") : null;
                if (ownerPhone) {
                  if (ownerPhone.startsWith("0") && ownerPhone.length === 10) {
                    ownerPhone = "94" + ownerPhone.substring(1);
                  } else if (ownerPhone.length === 9) {
                    ownerPhone = "94" + ownerPhone;
                  }
                  const items = (orderData.order_items || [])
                    .map((item: any) => `${item.quantity}x ${item.name}`)
                    .join(", ");
                  const notifMessage = `📦 New Order #${orderResult.id.substring(0, 8)}\n👤 ${orderData.customer_name}\n📱 ${phoneToSave}\n🛒 ${items}\n💰 Total: Rs. ${math.totalAmount}\n💳 ${orderData.payment_method === "cod" ? "Cash on Delivery" : (orderData.payment_method === "bank_transfer" ? "Bank Transfer" : "Yet to decide")}${orderData.district ? `\n🏘️ District: ${orderData.district}` : ""}${orderData.customer_address ? `\n📍 ${orderData.customer_address}` : ""}`;

                  let sendApiKey = sessionApiKey || null;
                  if (!sendApiKey) {
                    const { data: sessionData } = await supabase
                      .from("user_wsender_sessions")
                      .select("session_api_key")
                      .eq("user_id", userId)
                      .limit(1)
                      .maybeSingle();
                    sendApiKey = sessionData?.session_api_key || null;
                  }

                  const sendNotif = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp_Binara_Fashion`, {
                    method: "POST",
                    headers: {
                      Authorization: `Bearer ${supabaseServiceKey}`,
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                      to: ownerPhone,
                      message: notifMessage,
                      sessionApiKey: sendApiKey,
                    }),
                  });
                  if (!sendNotif.ok) {
                    console.error("Failed to send owner notification:", await sendNotif.text());
                  } else {
                    console.log("Owner notification sent to", ownerPhone);
                  }
                }
              } catch (notifError) {
                console.error("Error sending owner notification:", notifError);
              }
            }
          }
        } catch (parseError) {
          console.error("Error parsing order JSON:", parseError);
        }
      }
    }

    // Resolve FAQ attachments: only for FAQs the AI actually used, first time per conversation,
    // max 4 attachments in one reply.
    let faqMedia: string[] = [];
    if (usedFaqIds.length > 0) {
      const candidates: string[] = [];
      for (const id of usedFaqIds) {
        const faq = faqs.find((f: any) => f.id === id);
        const urls = Array.isArray(faq?.media_urls) ? faq!.media_urls : [];
        for (const u of urls) {
          if (typeof u === "string" && u.trim() && !candidates.includes(u)) candidates.push(u);
        }
      }

      if (candidates.length > 0) {
        // Skip anything already sent to this customer before
        const { data: priorRows } = await supabase
          .from("conversations")
          .select("metadata")
          .eq("user_id", userId)
          .eq("phone_number", phoneNumber)
          .eq("direction", "outbound")
          .not("metadata", "is", null)
          .order("created_at", { ascending: false })
          .limit(200);

        const alreadySent = new Set<string>();
        for (const row of priorRows || []) {
          const sent = (row as any)?.metadata?.faqMedia;
          if (Array.isArray(sent)) sent.forEach((u: string) => alreadySent.add(u));
        }

        faqMedia = candidates.filter((u) => !alreadySent.has(u)).slice(0, 4);
        if (faqMedia.length > 0) {
          console.log(`FAQ attachments to send (${faqMedia.length}): ${faqMedia.join(", ")}`);
        }
      }
    }

    // Extract image URLs generated by AI (prompt engineering governs when to send images)
    const imageUrlMatches = Array.from(responseText.matchAll(/<IMAGE_URL>([\s\S]*?)<\/IMAGE_URL>/g));
    const rawImageUrls = imageUrlMatches.map(m => m[1].trim()).filter(Boolean);

    // Deduplicate any repeated URLs within this response while preserving order (no hard cap)
    const seenImages = new Set<string>();
    let imageUrls: string[] = [];
    for (const rawUrl of rawImageUrls) {
      const norm = normalizeImgPath(rawUrl);
      if (norm && !seenImages.has(norm)) {
        seenImages.add(norm);
        imageUrls.push(rawUrl);
      }
    }

    // Safety guard 1: NEVER send images when showing multiple product details. Only send images for ONE product.
    const productsInImages = products.filter(p => {
      const paths = productNormPathsMap[p.id];
      return paths && paths.size > 0 && imageUrls.some(u => paths.has(normalizeImgPath(u)));
    });

    if (productsInImages.length > 1) {
      console.log(`[Image Filter] Suppressing images: response contained images for multiple products (${productsInImages.length} products, ${imageUrls.length} images dropped). Images only allowed for ONE product.`);
      imageUrls = [];
    }

    // Safety guard 2: If the bot response presents multiple products (catalog menu), suppress all images.
    const respLower = responseText.toLowerCase();
    const mentionedProductsCount = products.filter(p => {
      const pName = String(p.name || "").toLowerCase().replace(/[^\w\s\u0D80-\u0DFF]/g, "").trim();
      return pName.length > 2 && respLower.includes(pName);
    }).length;

    const hasMenuKeywords = /(?:1\.|2\.|වර්ග\s*\d|වර්ග\s*දෙක|කැමති\s*වර්ගය|\b1\s*හෝ\s*2\b|\b1\s*da\s*2\b|තෝරාගන්න|menu)/i.test(respLower);
    const isPresentingMultipleProducts = (mentionedProductsCount >= 2 || (products.length >= 2 && hasMenuKeywords && respLower.includes("1.") && respLower.includes("2.")));

    if (isPresentingMultipleProducts && imageUrls.length > 0) {
      console.log(`[Image Filter] Suppressing images: bot response presents multiple product details (menu). Suppressing all ${imageUrls.length} images.`);
      imageUrls = [];
    }

    // Safety guard 3: Suppress product images during order placement / checkout confirmation.
    // When the customer is placing an order or order JSON is generated, do not clutter with product images.
    // NOTE: Fragile keyword regex filtering for 2nd-time image requests was removed so the LLM's natural language understanding
    // can properly serve customer requests in any phrasing, dialect, or language (Sinhala, Singlish, English).
    if (orderJsonMatches.length > 0 || orderCreated) {
      if (imageUrls.length > 0) {
        console.log(`[Image Filter] Suppressing images: order being created or confirmed (${imageUrls.length} images dropped).`);
        imageUrls = [];
      }
    }

    const imageUrl = imageUrls.length > 0 ? imageUrls[0] : null;

    // Extract video URL if present
    const videoUrlMatch = responseText.match(/<VIDEO_URL>([\s\S]*?)<\/VIDEO_URL>/);
    const videoUrl = videoUrlMatch ? videoUrlMatch[1].trim() : null;

    // Aggressively strip any JSON or technical markup from the response
    let cleanResponse = responseText;
    // Remove complete tagged blocks WITH their content first
    cleanResponse = cleanResponse.replace(/<ORDER_JSON>[\s\S]*?<\/ORDER_JSON>/g, "");
    cleanResponse = cleanResponse.replace(/<IMAGE_URL>[\s\S]*?<\/IMAGE_URL>/g, "");
    cleanResponse = cleanResponse.replace(/<VIDEO_URL>[\s\S]*?<\/VIDEO_URL>/g, "");
    cleanResponse = cleanResponse.replace(/<USED_FAQS>[\s\S]*?<\/USED_FAQS>/g, "");
    // Remove truncated/incomplete tags and everything after them
    cleanResponse = cleanResponse.replace(/<ORDER_JSON>[\s\S]*/g, "");
    cleanResponse = cleanResponse.replace(/<IMAGE_URL>[\s\S]*/g, "");
    cleanResponse = cleanResponse.replace(/<VIDEO_URL>[\s\S]*/g, "");
    cleanResponse = cleanResponse.replace(/<USED_FAQS>[\s\S]*/g, "");
    // Remove any remaining orphan uppercase XML-like tags
    cleanResponse = cleanResponse.replace(/<\/?[A-Z_]+>/g, "");
    // Remove fenced code blocks (```json ... ``` or ``` ... ```)
    cleanResponse = cleanResponse.replace(/```[\s\S]*?```/g, "");
    // Remove any JSON object that looks like order data (greedy match for nested objects)
    cleanResponse = cleanResponse.replace(/\{[^{}]*"customer_name"[^}]*\}/g, "");
    cleanResponse = cleanResponse.replace(/\{[^{}]*"customername"[^}]*\}/g, "");
    cleanResponse = cleanResponse.replace(/\{[^{}]*"order_items"[^}]*\}/g, "");
    cleanResponse = cleanResponse.replace(/\{[^{}]*"payment_method"[^}]*\}/g, "");
    cleanResponse = cleanResponse.replace(/\{[^{}]*"total_amount"[^}]*\}/g, "");
    // Remove any remaining JSON-like structures with 2+ key-value pairs
    cleanResponse = cleanResponse.replace(/\{\s*"[^"]+"\s*:[\s\S]*?\}/g, "");
    // Remove any leftover image URLs on their own line (https://...supabase... patterns)
    cleanResponse = cleanResponse.replace(/^https?:\/\/[^\s]+$/gm, "");
    // Remove standalone UUIDs that leak from FAQ IDs or correlation IDs
    cleanResponse = cleanResponse.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "");
    // Remove [FAQ_ID:...] references that may leak into response
    cleanResponse = cleanResponse.replace(/\[FAQ_ID:[^\]]*\]/g, "");

    // Ensure "නියමයි" or similar celebratory greetings are removed from customer response
    cleanResponse = cleanResponse.replace(/^\s*(?:නියමයි!?|Great!?|Awesome!?)[,\s]*/i, "");

    // Enforce mathematical logic on order summary in customer response text only when a new order was actually created
    if (orderCreated && calculatedOrderTotals && savedOrderData) {
      const { subtotal, deliveryFee, totalAmount } = calculatedOrderTotals;
      const delivText = deliveryFee === 0 ? "නොමිලේ (Free Delivery)" : `රු. ${deliveryFee}`;

      // Check if visible cleanResponse lacks basic order summary fields (e.g. LLM jumped straight to bank accounts)
      const hasSummaryHeader = /(?:සාරාංශය|Order\s*Summary|Bill)/i.test(cleanResponse);
      const hasCustomerName = /(?:නම|\bName\b)[^:\n]*:/i.test(cleanResponse);
      const hasCustomerAddress = /(?:ලිපිනය|\bAddress\b)[^:\n]*:/i.test(cleanResponse);
      const hasCustomerDetails = hasCustomerName && hasCustomerAddress;

      if (!hasSummaryHeader || !hasCustomerDetails) {
        console.log("LLM omitted visible Order Summary before confirmation/bank details. Injecting complete Order Summary...");
        const rawItems = Array.isArray(savedOrderData.order_items) && savedOrderData.order_items.length > 0
          ? savedOrderData.order_items
          : (Array.isArray(savedOrderData.products) ? savedOrderData.products.map((p: any) => ({ name: p.id || p.name, quantity: p.quantity })) : []);
        const defaultProdName = products[0]?.name || "Item";
        const itemsList = rawItems
          .map((it: any) => `${it.name || defaultProdName} (${it.quantity || 1} pcs)`)
          .join(", ") || defaultProdName;
        const specialInstr = savedOrderData.special_instructions || (Array.isArray(savedOrderData.products?.[0]?.sub_variants) ? savedOrderData.products[0].sub_variants.join(", ") : null);
        const colorsText = specialInstr ? `\n• විකල්ප/වර්ණ (Options/Colors): ${specialInstr.replace(/^Colors:\s*/i, "")}` : "";
        const paymentMethodRaw = savedOrderData.payment_method || savedOrderData.customer_details?.payment_method || "";
        const paymentMethodText = String(paymentMethodRaw).toLowerCase().includes("bank") ? "Bank Transfer" : "Cash on Delivery (COD)";
        const custName = savedOrderData.customer_name || savedOrderData.customer_details?.name || "සඳහන් කර නැත";
        const custAddress = savedOrderData.customer_address || savedOrderData.customer_details?.address || "සඳහන් කර නැත";

        let summaryBlock = `📋 ඔබගේ සම්පූර්ණ ඇණවුම් සාරාංශය (Full Order Summary):\n• නම: ${custName}\n• ලිපිනය: ${custAddress}\n• දුරකථන අංකය: ${savedPhoneToSave || phoneNumber}\n• ඇණවුම: ${itemsList}${colorsText}\n• අයිතම එකතුව: රු. ${subtotal.toLocaleString()}\n• ඩිලිවරි ගාස්තුව: ${delivText}\n• මුළු මුදල: රු. ${totalAmount.toLocaleString()}\n• ගෙවීම් ක්‍රමය: ${paymentMethodText}\n\n`;

        if (paymentMethodText === "Bank Transfer" && paymentDetailsFormatted) {
          const hasBankInResp = /(?:Account|ගිණුම්|බැංකු|Branch|ශාඛා)/i.test(cleanResponse);
          if (!hasBankInResp) {
            summaryBlock += `💳 බැංකු ගිණුම් විස්තර (Bank Details):\n${paymentDetailsFormatted}\n\nකරුණාකර ඉහත ගිණුමට මුදල් තැන්පත් කර රිසිට්පතේ (Slip) ඡායාරූපයක් මෙහි එවන්න. 📸\n\n`;
          }
        }

        cleanResponse = summaryBlock + cleanResponse;
      }

      // Overwrite subtotal, delivery fee, and total amount in text summary if present
      cleanResponse = cleanResponse.replace(/(?:(?:අයිතම\s*එකතුව|භාණ්ඩ\s*එකතුව|Subtotal|Items\s*Subtotal)\s*[:\-]?\s*)(?:රු\.?|Rs\.?|LKR)?\s*[\d,]+/gi, `අයිතම එකතුව: රු. ${subtotal.toLocaleString()}`);
      cleanResponse = cleanResponse.replace(/(?:(?:ඩිලිවරි\s*(?:ගාස්තු|ගාස්තුව)|Delivery\s+(?:Fee|Charge))\s*[:\-]?\s*)(?:රු\.?|Rs\.?|LKR|\bFree\b|නොමිලේ)?[^\n]*/gi, `ඩිලිවරි ගාස්තුව: ${delivText}`);
      cleanResponse = cleanResponse.replace(/(?:(?:මුළු\s*(?:මුදල|එකතුව)?|Total\s*(?:Amount)?)\s*[:\-]?\s*)(?:රු\.?|Rs\.?|LKR)?\s*[\d,]+/gi, `මුළු මුදල: රු. ${totalAmount.toLocaleString()}`);

      // Ensure status states courier will call and request delivery acceptance
      cleanResponse = cleanResponse.replace(/(?:Order\s*Confirmed|Order\s*is\s*confirmed|ඇණවුම\s*තහවුරු\s*විය|ඇණවුම\s*තහවුරු\s*කරන\s*ලදී|Order\s*එක\s*confirm\s*වුණා|(?:ස්තූතියි!?\s*)?ඔබගේ\s*ඇණවුම\s*ලැබී\s*ඇත[^\n]*අපගේ\s*කාර්ය\s*මණ්ඩලය[^\n]*)[^\n]*/gi, "ස්තූතියි ඔබගේ ඇණවුම ලැබී ඇත.කුරියර් සේවයෙන් ඔබට ඇමතුමක් ලබාදෙනු ඇත. කරුණාකර ඔබගේ ඇණවුම යලි return වීමට නොදී මුදල් ලබාදී භාරගන්න");
    }

    // Replace order reference placeholder with actual order id if generated
    if (createdOrderId) {
      const orderRef = createdOrderId.substring(0, 8).toUpperCase();
      cleanResponse = cleanResponse.replace(/#?ORDER_REF/gi, `#${orderRef}`);
      cleanResponse = cleanResponse.replace(/\[ORDER_REF\]/gi, `#${orderRef}`);
      cleanResponse = cleanResponse.replace(/#REF\b/gi, `#${orderRef}`);
    } else {
      const fallbackRef = Math.floor(1000 + Math.random() * 9000);
      cleanResponse = cleanResponse.replace(/#?ORDER_REF/gi, `#BF-${fallbackRef}`);
      cleanResponse = cleanResponse.replace(/\[ORDER_REF\]/gi, `#BF-${fallbackRef}`);
      cleanResponse = cleanResponse.replace(/#REF\b/gi, `#BF-${fallbackRef}`);
    }

    // Clean up leftover whitespace & collapse extra blank lines between bullet points or labels
    cleanResponse = cleanResponse
      .replace(/(•[^\n]+)\n\n+(?=•)/g, "$1\n")
      .replace(/(:\s*)\n\n+(?=•)/g, "$1\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    // Log AI usage independently of conversations
    await supabase.from("ai_usage_logs").insert({
      user_id: userId,
      phone_number: contactKey || phoneNumber,
    });

    // If an order was created, check for follow-up message
    let followupMessage: string | null = null;
    if (orderCreated) {
      try {
        const { data: followupSettings } = await supabase
          .from("settings")
          .select("value")
          .eq("key", "order_followup_message")
          .eq("user_id", userId)
          .single();

        if (followupSettings?.value?.enabled && followupSettings?.value?.text?.trim()) {
          followupMessage = followupSettings.value.text.trim();
          console.log("Order follow-up message will be sent");
        }
      } catch (e) {
        console.warn("Could not fetch order followup setting:", e);
      }
    }

    return new Response(
      JSON.stringify({ response: cleanResponse, imageUrl, imageUrls, videoUrl, followupMessage, faqMedia }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("AI Chat error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
