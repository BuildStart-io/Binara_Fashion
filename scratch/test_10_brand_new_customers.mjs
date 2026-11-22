import { execSync } from "child_process";
import fs from "fs";

const AI_CHAT_URL = "http://localhost:8000/functions/v1/ai-chat_Binara_Fashion";
const USER_ID = "8ec761ff-b716-411b-85d2-1b56980d1e8a";

const scenarios = [
  {
    id: 1,
    name: "Customer 1 - Nuwan Kulasekara (Waffle Knit 1 pc)",
    phone: "94755500001",
    productInquiry: "Waffle Knit Cotton Shorts",
    quantity: 1,
    expectedSubtotal: 700,
    expectedDelivery: 450,
    expectedTotal: 1150,
    colors: "2",
    customerName: "Nuwan Kulasekara",
    customerAddress: "12 Beach Road, Mount Lavinia",
    turns: [
      { msg: "Hi", expectImages: false },
      { msg: "Waffle Knit Cotton Shorts", expectImages: true },
      { msg: "මට 1ක් ගන්න පුළුවන්ද?", expectImages: false },
      { msg: "පාට අංක 2", expectImages: false },
      { msg: "Nuwan Kulasekara, 12 Beach Road, Mount Lavinia, 0755500001", expectImages: false },
      { msg: "හරි confirm කරන්න", expectImages: false },
    ]
  },
  {
    id: 2,
    name: "Customer 2 - Chathuri Wijesinghe (Linen Blend 2 pcs)",
    phone: "94755500002",
    productInquiry: "Linen Blend Casual Shorts",
    quantity: 2,
    expectedSubtotal: 1800,
    expectedDelivery: 450,
    expectedTotal: 2250,
    colors: "1, 2",
    customerName: "Chathuri Wijesinghe",
    customerAddress: "45 Kandy Road, Peradeniya",
    turns: [
      { msg: "Hello", expectImages: false },
      { msg: "Linen Blend Casual Shorts", expectImages: true },
      { msg: "මට කලිසම් 2ක් ඕනේ, ගාණ කීයද?", expectImages: false },
      { msg: "පාට අංක 1 සහ 2", expectImages: false },
      { msg: "Chathuri Wijesinghe, 45 Kandy Road, Peradeniya, 0755500002", expectImages: false },
      { msg: "විස්තර නිවැරදියි confirm කරන්න", expectImages: false },
    ]
  },
  {
    id: 3,
    name: "Customer 3 - Tharindu Kaushal (Linen Blend 3-Pack Package)",
    phone: "94755500003",
    productInquiry: "Linen Blend Casual Shorts",
    quantity: 3,
    expectedSubtotal: 2700,
    expectedDelivery: 0,
    expectedTotal: 2700,
    colors: "1, 2, 3",
    customerName: "Tharindu Kaushal",
    customerAddress: "88 Main Street, Galle",
    turns: [
      { msg: "විස්තර එවන්න", expectImages: false },
      { msg: "Linen Blend Casual Shorts", expectImages: true },
      { msg: "3 Pack එකක් ගන්නවා", expectImages: false },
      { msg: "පාට 1, 2, 3", expectImages: false },
      { msg: "Tharindu Kaushal, 88 Main Street, Galle, 0755500003", expectImages: false },
      { msg: "හරි ඇණවුම දාන්න", expectImages: false },
    ]
  },
  {
    id: 4,
    name: "Customer 4 - Sanduni Hansika (Waffle Knit 4-Pack Package)",
    phone: "94755500004",
    productInquiry: "Waffle Knit Cotton Shorts",
    quantity: 4,
    expectedSubtotal: 2800,
    expectedDelivery: 0,
    expectedTotal: 2800,
    colors: "1, 2, 3, 4",
    customerName: "Sanduni Hansika",
    customerAddress: "105 Hospital Road, Jaffna",
    turns: [
      { msg: "Hi", expectImages: false },
      { msg: "Waffle Knit Cotton Shorts", expectImages: true },
      { msg: "4 Pack එකක් දාන්න", expectImages: false },
      { msg: "පාට අංක 1, 2, 3, 4", expectImages: false },
      { msg: "Sanduni Hansika, 105 Hospital Road, Jaffna, 0755500004", expectImages: false },
      { msg: "ඔව් විස්තර හරි", expectImages: false },
    ]
  },
  {
    id: 5,
    name: "Customer 5 - Dhananjaya de Silva (Popcorn 18 inch 5 pcs overflow)",
    phone: "94755500005",
    productInquiry: "popcorn 18",
    quantity: 5,
    expectedSubtotal: 3250,
    expectedDelivery: 0,
    expectedTotal: 3250,
    colors: "1, 2, 3, 3, 4",
    customerName: "Dhananjaya de Silva",
    customerAddress: "23 Lake Road, Kurunegala",
    turns: [
      { msg: "popcorn 18", expectImages: true },
      { msg: "1 2 3 3 4", expectImages: false },
      { msg: "ඔව් කලිසම් 5ම ගන්නවා", expectImages: false },
      { msg: "Dhananjaya de Silva, 23 Lake Road, Kurunegala, 0755500005", expectImages: false },
      { msg: "විස්තර නිවැරදියි, confirm කරන්න", expectImages: false },
    ]
  },
  {
    id: 6,
    name: "Customer 6 - Bhanuka Rajapaksa (Linen Blend 6-Pack Package)",
    phone: "94755500006",
    productInquiry: "Linen Blend Casual Shorts",
    quantity: 6,
    expectedSubtotal: 5100,
    expectedDelivery: 0,
    expectedTotal: 5100,
    colors: "1, 2, 3, 4, 5, 6",
    customerName: "Bhanuka Rajapaksa",
    customerAddress: "67 Colombo Road, Gampaha",
    turns: [
      { msg: "Hi", expectImages: false },
      { msg: "Linen Blend Casual Shorts", expectImages: true },
      { msg: "6 Pack එක ගන්න කැමතියි", expectImages: false },
      { msg: "පාට 1 සිට 6 දක්වා", expectImages: false },
      { msg: "Bhanuka Rajapaksa, 67 Colombo Road, Gampaha, 0755500006", expectImages: false },
      { msg: "හරි confirm කරන්න", expectImages: false },
    ]
  },
  {
    id: 7,
    name: "Customer 7 - Kavindi Oshadi (Kyela Single Jersey 7 pcs custom)",
    phone: "94755500007",
    productInquiry: "Kyela Brand Single Jersey Cotton Shorts",
    quantity: 7,
    expectedSubtotal: 3500, // 500 * 7
    expectedDelivery: 0,
    expectedTotal: 3500,
    colors: "1, 2, 3, 4, 5, 6, 7",
    customerName: "Kavindi Oshadi",
    customerAddress: "34 Hill Street, Nuwara Eliya",
    turns: [
      { msg: "Hello", expectImages: false },
      { msg: "Kyela Brand Single Jersey Cotton Shorts", expectImages: true },
      { msg: "මට කලිසම් 7ක් ගන්න ඕනෙ, ගාණ කීයද?", expectImages: false },
      { msg: "පාට අංක 1 සිට 7 දක්වා", expectImages: false },
      { msg: "Kavindi Oshadi, 34 Hill Street, Nuwara Eliya, 0755500007", expectImages: false },
      { msg: "ඔව් විස්තර හරි order එක දාන්න", expectImages: false },
    ]
  },
  {
    id: 8,
    name: "Customer 8 - Wanindu Hasaranga (Waffle Knit 8-Pack Package)",
    phone: "94755500008",
    productInquiry: "Waffle Knit Cotton Shorts",
    quantity: 8,
    expectedSubtotal: 5200,
    expectedDelivery: 0,
    expectedTotal: 5200,
    colors: "1, 2, 3, 4, 5, 6, 7, 8",
    customerName: "Wanindu Hasaranga",
    customerAddress: "77 Circular Road, Matara",
    turns: [
      { msg: "විස්තර එවන්න", expectImages: false },
      { msg: "Waffle Knit Cotton Shorts", expectImages: true },
      { msg: "8 Pack එකක් එවන්න", expectImages: false },
      { msg: "පාට 1, 2, 3, 4, 5, 6, 7, 8", expectImages: false },
      { msg: "Wanindu Hasaranga, 77 Circular Road, Matara, 0755500008", expectImages: false },
      { msg: "හරි confirm කරන්න", expectImages: false },
    ]
  },
  {
    id: 9,
    name: "Customer 9 - Dasun Shanaka (SingleJersey 20 inch 3 pcs custom)",
    phone: "94755500009",
    productInquiry: "SingleJersey Cotton උස අගල් 20",
    quantity: 3,
    expectedSubtotal: 1987.5, // 662.50 * 3
    expectedDelivery: 450,
    expectedTotal: 2437.5,
    colors: "1, 2, 3",
    customerName: "Dasun Shanaka",
    customerAddress: "90 Station Road, Negombo",
    turns: [
      { msg: "Hi", expectImages: false },
      { msg: "SingleJersey Cotton උස අගල් 20", expectImages: true },
      { msg: "කලිසම් 3ක් ගන්න පුළුවන්ද?", expectImages: false },
      { msg: "පාට 1, 2 සහ 3", expectImages: false },
      { msg: "Dasun Shanaka, 90 Station Road, Negombo, 0755500009", expectImages: false },
      { msg: "හරි ඇණවුම දාන්න", expectImages: false },
    ]
  },
  {
    id: 10,
    name: "Customer 10 - Avishka Fernando (Rib Jacquard 10-Pack Package)",
    phone: "94755500010",
    productInquiry: "Rib Jacquard Shorts",
    quantity: 10,
    expectedSubtotal: 5100,
    expectedDelivery: 0,
    expectedTotal: 5100,
    colors: "1, 2, 3, 4, 5, 6, 7, 8, 9, 10",
    customerName: "Avishka Fernando",
    customerAddress: "56 Temple Road, Kalutara",
    turns: [
      { msg: "Hello", expectImages: false },
      { msg: "Rib Jacquard Shorts", expectImages: true },
      { msg: "10 pack එකක් ඕනේ", expectImages: false },
      { msg: "පාට අංක 1 සිට 10 දක්වා", expectImages: false },
      { msg: "Avishka Fernando, 56 Temple Road, Kalutara, 0755500010", expectImages: false },
      { msg: "විස්තර නිවැරදියි confirm කරන්න", expectImages: false },
    ]
  }
];

async function callChat(phoneNumber, message, conversationHistory) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(AI_CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: USER_ID,
          phoneNumber,
          message,
          conversationHistory
        })
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }
      return await res.json();
    } catch (err) {
      console.warn(`    [Retry ${attempt}/3] ${err.message}`);
      if (attempt === 3) throw err;
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

async function runTest() {
  console.log("================================================================================");
  console.log("TESTING 10 BRAND-NEW CUSTOMERS (NO FILE EDITS)");
  console.log("================================================================================\n");

  const results = [];

  for (const scenario of scenarios) {
    console.log(`>>> Running Scenario ${scenario.id}: ${scenario.name}`);
    const conversationHistory = [];
    const turnResults = [];
    let photosSentTurn = -1;
    let prematureOrderTurn = -1;
    let imageSpamTurns = [];
    let orderCreatedTurn = -1;

    for (let t = 0; t < scenario.turns.length; t++) {
      const turn = scenario.turns[t];
      const turnNum = t + 1;
      
      const payload = await callChat(scenario.phone, turn.msg, conversationHistory);
      const resp = payload.response || "";
      const imgCount = (payload.imageUrls && payload.imageUrls.length) || (payload.imageUrl ? 1 : 0);
      const hasImages = imgCount > 0;
      const orderCreated = !!payload.orderCreated;

      console.log(`  [Turn ${turnNum}] User: "${turn.msg.substring(0, 30)}" -> Bot: ${resp.substring(0, 45).replace(/\n/g, " ")}... | Imgs: ${imgCount} | Order: ${orderCreated}`);

      if (hasImages && photosSentTurn === -1) {
        photosSentTurn = turnNum;
      } else if (hasImages && photosSentTurn !== -1) {
        imageSpamTurns.push(turnNum);
      }

      if (orderCreated && turnNum < scenario.turns.length) {
        prematureOrderTurn = turnNum;
      }
      if (orderCreated) {
        orderCreatedTurn = turnNum;
      }

      turnResults.push({
        turnNum,
        userMsg: turn.msg,
        botReply: resp,
        hasImages,
        imageCount: imgCount,
        orderCreated,
      });

      // Update history
      conversationHistory.push({
        direction: "inbound",
        message: turn.msg,
        created_at: new Date().toISOString()
      });
      conversationHistory.push({
        direction: "outbound",
        message: resp,
        metadata: hasImages ? { imageUrls: payload.imageUrls || [payload.imageUrl] } : undefined,
        created_at: new Date().toISOString()
      });
    }

    // Verify created order in database
    let dbOrder = null;
    try {
      const query = `SELECT json_build_object(
        'id', id,
        'customer_name', customer_name,
        'customer_phone', customer_phone,
        'total_amount', total_amount,
        'status', status,
        'order_items', order_items,
        'special_instructions', special_instructions
      ) FROM "Binara_fashion".orders WHERE customer_phone = '${scenario.phone}' OR customer_phone = '${scenario.phone.replace(/^94/, "0")}' ORDER BY created_at DESC LIMIT 1;`;
      const out = execSync(`docker exec -i supabase-db psql -U postgres -d postgres -t -A -c "${query.replace(/"/g, '\\"')}"`, { encoding: "utf8" }).trim();
      if (out) {
        dbOrder = JSON.parse(out);
      }
    } catch (e) {
      console.error(`    Database query error for ${scenario.phone}:`, e.message);
    }

    // Evaluation
    const calcCorrect = dbOrder ? (Number(dbOrder.total_amount) === scenario.expectedTotal) : false;
    const pacingCorrect = (prematureOrderTurn === -1) && (orderCreatedTurn === scenario.turns.length);
    const expectedInitialPhotoTurn = scenario.turns.findIndex(t => t.expectImages) + 1;
    const imageCorrect = (imageSpamTurns.length === 0) && (photosSentTurn === expectedInitialPhotoTurn);
    const coloursRecorded = dbOrder && (
      (dbOrder.special_instructions && dbOrder.special_instructions.includes("Colours:")) ||
      (Array.isArray(dbOrder.order_items) && dbOrder.order_items.some(i => i.selected_colors || (i.variations && i.variations.Color)))
    );

    console.log(`    📊 Results:`);
    console.log(`       - Photos sent turn: ${photosSentTurn} (Expected: ${expectedInitialPhotoTurn}) -> ${photosSentTurn === expectedInitialPhotoTurn ? "✅ PASS" : "❌ FAIL"}`);
    console.log(`       - Image spam turns: ${imageSpamTurns.length > 0 ? imageSpamTurns.join(", ") : "None"} -> ${imageCorrect ? "✅ PASS" : "❌ FAIL"}`);
    console.log(`       - Order pacing: ${pacingCorrect ? "✅ Confirmed at Turn " + scenario.turns.length + " (no premature orders)" : `❌ Turn ${prematureOrderTurn || orderCreatedTurn}`}`);
    console.log(`       - Total calculation: Expected LKR ${scenario.expectedTotal}, Got LKR ${dbOrder?.total_amount} -> ${calcCorrect ? "✅ PASS" : "❌ FAIL"}`);
    console.log(`       - Colours recorded in DB: ${coloursRecorded ? "✅ PASS" : "❌ FAIL"}\n`);

    results.push({
      scenario,
      turnResults,
      photosSentTurn,
      imageSpamTurns,
      prematureOrderTurn,
      orderCreatedTurn,
      dbOrder,
      calcCorrect,
      pacingCorrect,
      imageCorrect,
      coloursRecorded,
    });
  }

  return results;
}

runTest().then(async (res) => {
  fs.writeFileSync("scratch/brand_new_test_results.json", JSON.stringify(res, null, 2));
  console.log("Testing complete. Results written to scratch/brand_new_test_results.json");
}).catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});

