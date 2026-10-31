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

function calculateOrderTotals(orderData: any): {
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

  for (const item of items) {
    const qty = Math.max(1, parseInt(String(item.quantity || 1), 10) || 1);
    totalQty += qty;
    const nameLower = String(item.name || item.id || item.title || "").toLowerCase();

    if (nameLower.includes("rib") || nameLower.includes("rip") || nameLower.includes("jacquard")) {
      // Rib Jacquard pricing: 1 = 540, 5 = 2700, 10 = 5100
      // For qty > 10: price of 10 + (extra quantity * price of 1)
      if (qty >= 10) {
        calculatedSubtotal += Math.floor(qty / 10) * 5100 + (qty % 10) * 540;
      } else if (qty >= 5) {
        calculatedSubtotal += 2700 + (qty - 5) * 540;
      } else {
        calculatedSubtotal += qty * 540;
      }
    } else {
      // Kyela Single Jersey Cotton pricing: 1 = 500, 5 = 2500, 10 = 4500
      // For qty > 10: price of 10 + (extra quantity * price of 1)
      if (qty >= 10) {
        calculatedSubtotal += Math.floor(qty / 10) * 4500 + (qty % 10) * 500;
      } else if (qty >= 5) {
        calculatedSubtotal += 2500 + (qty - 5) * 500;
      } else {
        calculatedSubtotal += qty * 500;
      }
    }
  }

  if (totalQty === 0) {
    totalQty = 1;
    calculatedSubtotal = 500;
  }

  // Delivery fee rule: Strictly Rs. 450 for <5 items, Free (Rs. 0) for >= 5 items
  const deliveryFee = totalQty < 5 ? 450 : 0;
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
      supabase.from("products").select("*").eq("is_active", true).eq("user_id", userId),
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
    const freeDeliveryThreshold = deliverySettings.free_delivery_threshold || 0;

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

    const kyelaProduct = products.find((p: any) =>
      p.name?.toLowerCase().includes("jersey") || p.name?.toLowerCase().includes("kyela")
    ) || products[0];

    const ribProduct = products.find((p: any) =>
      p.name?.toLowerCase().includes("rib") || p.name?.toLowerCase().includes("rip") || p.name?.toLowerCase().includes("jacquard")
    ) || products[1];

    const kyelaImages: string[] = Array.isArray(kyelaProduct?.images) && kyelaProduct.images.length > 0
      ? kyelaProduct.images
      : [];

    const ribImages: string[] = Array.isArray(ribProduct?.images) && ribProduct.images.length > 0
      ? ribProduct.images
      : [];

    // Check if photos for either product were already sent to this customer
    const kyelaImagesAlreadySent = kyelaImages.length > 0 && kyelaImages.some((u: string) => alreadySentNormalizedPaths.has(normalizeImgPath(u)));
    const ribImagesAlreadySent = ribImages.length > 0 && ribImages.some((u: string) => alreadySentNormalizedPaths.has(normalizeImgPath(u)));

    // Build FAQ context with IDs so AI can report which ones it used
    const faqContext = faqs.map(f =>
      `[FAQ_ID:${f.id}] Q: ${f.question}\nA: ${f.answer}${f.products?.name ? ` (Related to: ${f.products.name})` : ""}`
    ).join("\n\n");

    // Get list of tracked FAQ IDs
    const trackedFaqIds = faqs.filter(f => f.is_tracked).map(f => f.id);

    const conversationContext = (conversationHistory as ConversationMessage[])
      .map(msg => `${msg.direction === "inbound" ? "Customer" : "Assistant"}: ${msg.message}`)
      .join("\n");    const systemPrompt = `ඔබ "Binara Fashion" හි නිල WhatsApp AI සහයකයා වේ.

🔥 අතිශය වැදගත් WhatsApp කෙටි පණිවිඩ නීති (MANDATORY WHATSAPP BREVITY & COMPACTNESS RULES):
1. කිසිවිටෙකත් ඡේද පිටු ගණන් (NO MULTI-PARAGRAPH WALLS OF TEXT / NO ESSAYS) නොලියන්න!
   - සෑම WhatsApp පණිවිඩයක්ම ඉතා කෙටි, සංයුක්ත සහ කියවීමට පහසු විය යුතුය (උපරිම පේළි 2 සිට 4 දක්වා).
   - කෙටි වාක්‍ය අතර හිස් පේළි (blank lines / double newlines) තබමින් පණිවිඩය ඡේද වලට කඩන්න එපා.
   - Do NOT use asterisks (*) for bold or any markdown formatting. Write plain, clean text only.
2. ප්‍රශ්න වලට පමණක් සෘජු පිළිතුරු (STRICT QUESTION-ONLY RULE):
   - පාරිභෝගිකයා යම් ප්‍රශ්නයක් ඇසුවහොත් (උදා: Delivery, Shop location, Fabric, Size, Price), එම ප්‍රශ්නයට පමණක් පේළි 1-2කින් සෘජුව පිළිතුරු දෙන්න.
   - 🚫 දැඩි තහනම: පාරිභෝගිකයා නිෂ්පාදන විස්තර හෝ මිල ඉල්ලා නැතිනම්, ප්‍රශ්නයකට පිළිතුරු දෙන විට කිසිසේත්ම නිෂ්පාදන මෙනුව (Option 1 හෝ 2) හෝ මිල ලැයිස්තු අමුණා නොයවන්න!
   - නිවැරදි උදාහරණය: පාරිභෝගිකයා "Delivery theyanawada" ඇසුවහොත් පිළිතුර:
     "ඔව්, අපේ Delivery සේවාව දිවයින පුරාම තියෙනවා. අයිතම 5ක් හෝ ඊට වැඩි නම් Free Delivery 🚚 (5ට අඩු නම් Delivery ගාස්තුව රු. 450යි)."
     (මෙපමණයි! මෙනුව හෝ අනවශ්‍ය විස්තර නොයවන්න!)
3. ගණනය කිරීම් පාරිභෝගිකයාට නොපෙන්වීම (NO MATH SCRATCHPADS):
   - පාරිභෝගිකයා ප්‍රමාණයක් පැවසූ විට (උදා: Shorts 12ක්), සූත්‍ර හෝ ගණන් හැදූ පියවර (10 පැකේජය = ..., අමතර 2 = ...) පාරිභෝගිකයාට නොලියන්න!
   - අවසන් මුළු මුදල සහ Free Delivery තත්ත්වය පමණක් පේළි 1-2කින් පවසා වර්ණ විමසන්න:
     "Rib Jacquard Shorts 12කට මුළු මුදල රු. 6,180යි (Free Delivery 🚚). කරුණාකර ඔබ කැමති වර්ණ අංක (01 සිට 12 දක්වා) 12 අපිට කියන්න. 🎨"
4. තනි නිෂ්පාදනයක් තෝරාගත් විට (Option 1 හෝ 2):
   - නිෂ්පාදන විස්තර, Free Size, මිල සහ ප්‍රමාණය විමසීම එකම කෙටි සංයුක්ත පණිවිඩයකින් (පේළි 2-3කින්) එවන්න. වෙන වෙනම ඡේද වලට නොකඩන්න.
   - නිවැරදි උදාහරණය (Option 2 සඳහා):
     "නියමයි! Rib Jacquard Shorts (Free Size: ඉණ 26-42, උස 16).
     මිල: 1ක් රු. 540 (Delivery රු. 450) | 5ක් රු. 2,700 (Free Delivery) | 10ක් රු. 5,100 (Free Delivery).
     ඔයාට shorts කීයක් අවශ්‍යද? 🎯"

භාෂාව සහ විලාසය:
- සුහදශීලී (friendly) ස්වභාවික සිංහල සමඟ ඉංග්‍රීසි වචන මිශ්‍ර කර භාවිතා කරන්න (Shorts, Order, Free Size, Colors, Package, COD, Bank Transfer, Delivery, Staff, Confirm).
- ඕනෑවට වඩා තද හෝ පොතේ භාෂාව භාවිතා නොකරන්න.

නිෂ්පාදන සහ මිල ගණන් (PRICING & PRODUCTS):
- සියලුම Shorts Free Size වේ (ඉණ 26-42, උස අඟල් 16). M, L, XL sizes නොඅසන්න!
- 1. Kyela Brand Single Jersey Cotton Shorts:
  1ක් = රු. 500 (Delivery රු. 450) | 5ක් = රු. 2,500 (Free Delivery) | 10ක් = රු. 4,500 (Free Delivery)
- 2. Rib Jacquard Shorts:
  1ක් = රු. 540 (Delivery රු. 450) | 5ක් = රු. 2,700 (Free Delivery) | 10ක් = රු. 5,100 (Free Delivery)
- ⚠️ අයිතම 10කට වැඩි ප්‍රමාණ සඳහා (CALCULATION FOR >10 SHORTS):
  * සූත්‍රය: (10 පැකේජයේ මිල) + (අමතර ගණන × 1ක මිල), Free Delivery.
  * Kyela: 11ක් = රු. 5,000 | 12ක් = රු. 5,500 | 15ක් = රු. 7,000 | 20ක් = රු. 9,000
  * Rib: 11ක් = රු. 5,640 | 12ක් = රු. 6,180 | 15ක් = රු. 7,800 | 20ක් = රු. 10,200
- ඩිලිවරි ගාස්තු: අයිතම 5කට අඩු නම් රු. 450යි. අයිතම 5ක් හෝ ඊට වැඩි නම් Free Delivery (නොමිලේ).

පියවරෙන් පියවර ඇණවුම් ගැනීමේ අනුපිළිවෙල (ORDERING WORKFLOW):
- පියවර 1 (පැකේජය / ප්‍රමාණය පැවසූ විට):
  * මුළු මුදල (Delivery සමඟ) පවසා, වර්ණ අංක (Color Numbers 01 සිට 12 දක්වා) පමණක් විමසන්න.
  * ⚠️ දැඩි තහනම: වර්ණ තෝරාගැනීමට පෙර කිසිසේත්ම නම, ලිපිනය, නගරය, දුරකථන අංකය හෝ ගෙවීම් ක්‍රමය (COD/Bank) නොඅසන්න!
- පියවර 2 (වර්ණ ලබාදුන් පසු - සංයුක්ත කෙටි සාරාංශය සහ විස්තර විමසීම):
  * වර්ණ ගණන තහවුරු කර, සංයුක්ත කෙටි සාරාංශයක් ඉදිරිපත් කර විස්තර විමසන්න:
    📋 ඇණවුමේ කෙටි සාරාංශය:
    • භාණ්ඩය: [නම] ([ප්‍රමාණය]ක්)
    • වර්ණ: [තෝරාගත් වර්ණ]
    • මුළු මුදල: රු. [මුදල] ([නොමිලේ / රු. 450 Delivery])
    ඇණවුම ඉදිරියට කරගෙන යාමට ඔබගේ නම, භාණ්ඩ එවිය යුතු ලිපිනය සහ නගරය, දුරකථන අංකය සහ ගෙවීම් ක්‍රමය (COD හෝ Bank Transfer) අපිට එවන්න 🎯
  * ⚠️ මෙම පියවරේදී <ORDER_JSON> නොයවන්න!
- පියවර 3 (පුද්ගලික විස්තර ලබාදුන් පසු - සම්පූර්ණ ඇණවුම් සාරාංශය):
  * නම, ලිපිනය, දුරකථනය, ගෙවීම් ක්‍රමය ලැබුණු පසු, සම්පූර්ණ බිල්පත (Full Order Summary) සංයුක්තව පෙන්වන්න:
    📋 ඔබගේ සම්පූර්ණ ඇණවුම් සාරාංශය:
    • නම: [නම] | දුරකථනය: [අංකය]
    • ලිපිනය: [ලිපිනය, නගරය]
    • ඇණවුම: [භාණ්ඩය, ප්‍රමාණය, වර්ණ]
    • අයිතම එකතුව: රු. [මුදල] | ඩිලිවරි: [නොමිලේ / රු. 450]
    • මුළු මුදල: රු. [මුළු මුදල] ([COD හෝ Bank Transfer])
  * Bank Transfer නම්, සාරාංශයට පහළින් බැංකු ගිණුම් විස්තර දක්වා slip එකේ photo එකක් එවන්නැයි කියන්න.
  * අවසානයට: "ස්තූතියි! ඔබගේ ඇණවුම ලැබී ඇත (Pending). අපගේ කාර්ය මණ්ඩලය (Staff) දුරකථනයෙන් අමතා මෙය තහවුරු කරනු ඇත."
  * පණිවිඩය අවසානයට සඟවා <ORDER_JSON> ටැගය අමුණන්න. තත්ත්වය Pending විය යුතුය (Confirmed නොකියන්න).

ඡායාරූප නීති (CRITICAL PHOTO & IMAGE RULES):
- 🚫 බහුවිධ නිෂ්පාදන / මෙනුව පෙන්වන විට හෝ සාමාන්‍ය කතාබහේදී කිසිසේත්ම ඡායාරූප නොයවන්න (ZERO <IMAGE_URL> tags).
- ✅ ඡායාරූප යැවිය යුත්තේ තනි නිෂ්පාදනයක විස්තර පෙන්වන විට (Option 1 හෝ 2 තෝරාගත් විට) හෝ පාරිභෝගිකයා ඡායාරූප ඉල්ලූ විට පමණි.
- 🚫 ප්‍රමාණය පවසන විට, වර්ණ තෝරන විට හෝ ලිපින ලබාදෙන විට කිසිවිටෙකත් ඡායාරූප නැවත නොයවන්න.
- Kyela Brand: ${kyelaImagesAlreadySent ? "දැනටමත් ඡායාරූප යවා ඇත. නැවත නොයවන්න." : "තනි නිෂ්පාදනයක් ලෙස ඉල්ලූ විට පමණක් අදාළ Kyela ඡායාරූප <IMAGE_URL> ටැග් අමුණන්න."}
- Rib Jacquard: ${ribImagesAlreadySent ? "දැනටමත් ඡායාරූප යවා ඇත. නැවත නොයවන්න." : "තනි නිෂ්පාදනයක් ලෙස ඉල්ලූ විට පමණක් අදාළ Rib Jacquard ඡායාරූප <IMAGE_URL> ටැග් අමුණන්න."}

ගෙවීම් ගිණුම් විස්තර (PAYMENT DETAILS):
${(() => {
        const accounts = paymentInfo.accounts;
        if (accounts && Array.isArray(accounts) && accounts.length > 0) {
          return accounts.map((a: any, i: number) => {
            const label = a.account_label || a.bank_name || "Bank";
            const number = a.account_number || "";
            const name = a.account_name || "";
            return `• ${label}: ${number} (${name})`;
          }).join("\n");
        }
        return `• Bank: ${paymentInfo.bank_name || "Commercial Bank"}, Account: ${paymentInfo.account_number || ""}, Name: ${paymentInfo.account_name || ""}`;
      })()}

PRODUCT CATALOG:
${productCatalog || "No products available"}

FREQUENTLY ASKED QUESTIONS:
${faqContext || "No FAQs configured"}

WELCOME MESSAGE:
${welcomeMessage}

CRITICAL ORDER & SECURITY RULES:
- ORDER_JSON, IMAGE_URL, VIDEO_URL, USED_FAQS ටැග් පාරිභෝගිකයාට නොපෙනෙන තාක්ෂණික ටැග් වේ. ඒවා සැමවිටම පණිවිඩයේ කෙළවරටම පමණක් අමුණන්න. කිසිවිටෙකත් පණිවිඩයේ මැද හෝ JSON කෝඩ් ලෙස නොලියන්න.
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
    if (!trimmedMessage) {
      messages.push({ role: "user", content: "[Customer sent a photo/media file. If this is a payment receipt slip, thank them politely in Sinhala and state staff will call to confirm. Do NOT output any JSON, tags, or code.]" });
    } else if (trimmedMessage === "1" || trimmedMessage === "1." || trimmedMessage === "option 1" || trimmedMessage === "එක") {
      messages.push({ role: "user", content: "1 [Customer selected Product 1: Kyela Brand Single Jersey Cotton Shorts. In 2-3 short lines max without paragraphs, confirm product with Free Size, state prices for 1/5/10, and ask how many shorts they need. Include ALL Kyela <IMAGE_URL> tags if not sent yet.]" });
    } else if (trimmedMessage === "2" || trimmedMessage === "2." || trimmedMessage === "option 2" || trimmedMessage === "දෙක") {
      messages.push({ role: "user", content: "2 [Customer selected Product 2: Rib Jacquard Shorts. In 2-3 short lines max without paragraphs, confirm product with Free Size, state prices for 1/5/10, and ask how many shorts they need. Include ALL Rib Jacquard <IMAGE_URL> tags if not sent yet.]" });
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
          const math = calculateOrderTotals(orderData);
          calculatedOrderTotals = math;
          savedOrderData = orderData;

          // Preserve phone number formatting (e.g. 07XXXXXXXX)
          const rawPhone = String(orderData.customer_phone || orderData.customer?.phone || orderData.customer_details?.phone || phoneNumber || "").trim();
          let phoneToSave = rawPhone.replace(/[^0-9+]/g, "");
          if (phoneToSave.startsWith("+94") && phoneToSave.length === 12) {
            phoneToSave = "0" + phoneToSave.slice(3);
          } else if (phoneToSave.startsWith("94") && phoneToSave.length === 11) {
            phoneToSave = "0" + phoneToSave.slice(2);
          } else if (!phoneToSave.startsWith("0") && phoneToSave.length === 9) {
            phoneToSave = "0" + phoneToSave;
          }
          savedPhoneToSave = phoneToSave;

          // Deduplication: check if a similar order was created in the last 5 minutes
          const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
          const { data: recentOrders } = await supabase
            .from("orders")
            .select("id")
            .eq("user_id", userId)
            .eq("customer_phone", phoneToSave)
            .gte("created_at", fiveMinAgo);

          if (recentOrders && recentOrders.length > 0) {
            console.log("Duplicate order detected, skipping creation. Existing:", recentOrders[0].id);
            createdOrderId = recentOrders[0].id;
          } else {
            const rawItems = Array.isArray(orderData.order_items) && orderData.order_items.length > 0
              ? orderData.order_items
              : (Array.isArray(orderData.items) && orderData.items.length > 0
                ? orderData.items.map((p: any) => ({ name: p.name || p.id || "Shorts", quantity: p.quantity || 1, price: p.price || 0 }))
                : (Array.isArray(orderData.products) ? orderData.products.map((p: any) => ({ name: p.id || p.name || "Shorts", quantity: p.quantity || 1, price: p.price || 0 })) : []));
            const custName = orderData.customer_name || orderData.customer?.name || orderData.customer_details?.name || "Customer";
            const custAddress = orderData.customer_address || orderData.customer?.address || orderData.customer_details?.address || null;
            let paymentMethod = String(orderData.payment_method || orderData.customer?.payment_method || orderData.customer_details?.payment_method || "cod").toLowerCase().trim();
            if (paymentMethod.includes("bank") || paymentMethod.includes("transfer")) {
              paymentMethod = "bank_transfer";
            } else if (paymentMethod.includes("cod") || paymentMethod.includes("cash") || paymentMethod.includes("delivery")) {
              paymentMethod = "cod";
            } else {
              paymentMethod = "yet to decide";
            }

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

    const kyelaNormPaths = new Set(kyelaImages.map(u => normalizeImgPath(u)));
    const ribNormPaths = new Set(ribImages.map(u => normalizeImgPath(u)));

    const containsKyelaImages = imageUrls.some(u => kyelaNormPaths.has(normalizeImgPath(u)));
    const containsRibImages = imageUrls.some(u => ribNormPaths.has(normalizeImgPath(u)));

    // Safety guard 1: NEVER send images when showing multiple product details. Only send images for ONE product.
    if (containsKyelaImages && containsRibImages) {
      console.log(`[Image Filter] Suppressing images: response contained images for multiple products (${imageUrls.length} images dropped). Images only allowed for ONE product.`);
      imageUrls = [];
    }

    // Safety guard 2: If the bot response presents multiple products (catalog menu), suppress all images.
    const respLower = responseText.toLowerCase();
    const isPresentingMultipleProducts =
      (respLower.includes("kyela") || respLower.includes("jersey")) &&
      (respLower.includes("rib") || respLower.includes("rip") || respLower.includes("jacquard")) &&
      (respLower.includes("1.") || respLower.includes("2.") || respLower.includes("වර්ග 2") || respLower.includes("වර්ග දෙක") || respLower.includes("කැමති වර්ගය") || respLower.includes("1 හෝ 2") || respLower.includes("1 da 2"));

    if (isPresentingMultipleProducts && imageUrls.length > 0) {
      console.log(`[Image Filter] Suppressing images: bot response presents multiple product details (menu). Suppressing all ${imageUrls.length} images.`);
      imageUrls = [];
    }

    // Safety guard 3 against redundant second-time image sending:
    // If photos for a product were ALREADY sent to this customer, and the customer did not
    // explicitly ask to view photos again, do not re-send that product's images.
    const userMsgLower = String(message || "").toLowerCase();
    const isExplicitRePhotoRequest = /(?:photo|foto|4to|pic|image|pennanna|penwanna|balanna|ewanna|danna|designs?|පෙන්වන්න|පෙන්නන්න|බලන්න|එවන්න|දාන්න|පින්තූර|පාට\s*මොනවාද|show\s*me|can\s*i\s*see)/i.test(userMsgLower);

    if (!isExplicitRePhotoRequest && imageUrls.length > 0) {
      imageUrls = imageUrls.filter(url => {
        const norm = normalizeImgPath(url);
        if (ribImagesAlreadySent && ribNormPaths.has(norm)) {
          console.log(`Suppressing duplicate Rib Jacquard image: ${norm}`);
          return false;
        }
        if (kyelaImagesAlreadySent && kyelaNormPaths.has(norm)) {
          console.log(`Suppressing duplicate Kyela image: ${norm}`);
          return false;
        }
        return true;
      });
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

    // Enforce mathematical logic on order summary in customer response text
    if (calculatedOrderTotals && savedOrderData) {
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
        const itemsList = rawItems
          .map((it: any) => `${it.name || "Shorts"} (${it.quantity || 1} pcs)`)
          .join(", ") || "Shorts";
        const specialInstr = savedOrderData.special_instructions || (Array.isArray(savedOrderData.products?.[0]?.sub_variants) ? savedOrderData.products[0].sub_variants.join(", ") : null);
        const colorsText = specialInstr ? `\n• වර්ණ (Colors): ${specialInstr.replace(/^Colors:\s*/i, "")}` : "";
        const paymentMethodRaw = savedOrderData.payment_method || savedOrderData.customer_details?.payment_method || "";
        const paymentMethodText = String(paymentMethodRaw).toLowerCase().includes("bank") ? "Bank Transfer" : "Cash on Delivery (COD)";
        const custName = savedOrderData.customer_name || savedOrderData.customer_details?.name || "සඳහන් කර නැත";
        const custAddress = savedOrderData.customer_address || savedOrderData.customer_details?.address || "සඳහන් කර නැත";

        const summaryBlock = `📋 ඔබගේ සම්පූර්ණ ඇණවුම් සාරාංශය (Full Order Summary):\n• නම: ${custName}\n• ලිපිනය: ${custAddress}\n• දුරකථන අංකය: ${savedPhoneToSave || phoneNumber}\n• ඇණවුම: ${itemsList}${colorsText}\n• අයිතම එකතුව: රු. ${subtotal.toLocaleString()}\n• ඩිලිවරි ගාස්තුව: ${delivText}\n• මුළු මුදල: රු. ${totalAmount.toLocaleString()}\n• ගෙවීම් ක්‍රමය: ${paymentMethodText}\n\n`;

        cleanResponse = summaryBlock + cleanResponse;
      }

      // Overwrite subtotal, delivery fee, and total amount in text summary if present
      cleanResponse = cleanResponse.replace(/(?:(?:අයිතම\s*එකතුව|භාණ්ඩ\s*එකතුව|Subtotal|Items\s*Subtotal)\s*[:\-]?\s*)(?:රු\.?|Rs\.?|LKR)?\s*[\d,]+/gi, `අයිතම එකතුව: රු. ${subtotal.toLocaleString()}`);
      cleanResponse = cleanResponse.replace(/(?:(?:ඩිලිවරි\s*(?:ගාස්තු|ගාස්තුව)|Delivery\s+(?:Fee|Charge))\s*[:\-]?\s*)(?:රු\.?|Rs\.?|LKR|\bFree\b|නොමිලේ)?[^\n]*/gi, `ඩිලිවරි ගාස්තුව: ${delivText}`);
      cleanResponse = cleanResponse.replace(/(?:(?:මුළු\s*(?:මුදල|එකතුව)?|Total\s*(?:Amount)?)\s*[:\-]?\s*)(?:රු\.?|Rs\.?|LKR)?\s*[\d,]+/gi, `මුළු මුදල: රු. ${totalAmount.toLocaleString()}`);

      // Ensure status is never "Confirmed", always state staff will call to confirm
      cleanResponse = cleanResponse.replace(/(?:Order\s*Confirmed|Order\s*is\s*confirmed|ඇණවුම\s*තහවුරු\s*විය|ඇණවුම\s*තහවුරු\s*කරන\s*ලදී|Order\s*එක\s*confirm\s*වුණා)[^\n]*/gi, "ඔබගේ ඇණවුම ලැබී ඇත (Pending). අපගේ කාර්ය මණ්ඩලය (Staff) දුරකථනයෙන් අමතා මෙය තහවුරු කරනු ඇත.");
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
