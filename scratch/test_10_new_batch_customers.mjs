import { execSync } from "child_process";
import fs from "fs";

const AI_CHAT_URL = "http://localhost:8000/functions/v1/ai-chat_Binara_Fashion";
const USER_ID = "8ec761ff-b716-411b-85d2-1b56980d1e8a";

const scenarios = [
  {
    id: 1,
    name: "Customer 1 - Chaminda Vaas (Cargo Fleece 1 pc custom)",
    phone: "94766600001",
    productInquiry: "Cargo Fleece Casual Shorts",
    quantity: 1,
    expectedSubtotal: 1200,
    expectedDelivery: 450,
    expectedTotal: 1650,
    colors: "1",
    customerName: "Chaminda Vaas",
    customerAddress: "14 Galle Face Court, Colombo 03",
    turns: [
      { msg: "Hi", expectImages: false },
      { msg: "Cargo Fleece Casual Shorts", expectImages: true },
      { msg: "මට 1ක් ගන්න පුළුවන්ද?", expectImages: false },
      { msg: "පාට අංක 1", expectImages: false },
      { msg: "Chaminda Vaas, 14 Galle Face Court, Colombo 03, 0766600001", expectImages: false },
      { msg: "හරි confirm කරන්න", expectImages: false },
    ]
  },
  {
    id: 2,
    name: "Customer 2 - Nilakshi Silva (Cargo Fleece 2-Pack Package)",
    phone: "94766600002",
    productInquiry: "Cargo Fleece Casual Shorts",
    quantity: 2,
    expectedSubtotal: 2400,
    expectedDelivery: 0,
    expectedTotal: 2400,
    colors: "1, 2",
    customerName: "Nilakshi Silva",
    customerAddress: "55 Station Road, Nugegoda",
    turns: [
      { msg: "Hello", expectImages: false },
      { msg: "Cargo Fleece Casual Shorts", expectImages: true },
      { msg: "2 Pack එකක් ගන්නවා", expectImages: false },
      { msg: "පාට 1 සහ 2", expectImages: false },
      { msg: "Nilakshi Silva, 55 Station Road, Nugegoda, 0766600002", expectImages: false },
      { msg: "විස්තර නිවැරදියි confirm කරන්න", expectImages: false },
    ]
  },
  {
    id: 3,
    name: "Customer 3 - Lasith Malinga (Denim Stretch 2 pcs custom)",
    phone: "94766600003",
    productInquiry: "Denim Stretch Comfort Shorts",
    quantity: 2,
    expectedSubtotal: 2000,
    expectedDelivery: 450,
    expectedTotal: 2450,
    colors: "1, 2",
    customerName: "Lasith Malinga",
    customerAddress: "99 Beach Road, Rathgama",
    turns: [
      { msg: "විස්තර එවන්න", expectImages: false },
      { msg: "Denim Stretch Comfort Shorts", expectImages: true },
      { msg: "මට කලිසම් 2ක් ඕනේ, ගාණ කීයද?", expectImages: false },
      { msg: "පාට 1 සහ 2", expectImages: false },
      { msg: "Lasith Malinga, 99 Beach Road, Rathgama, 0766600003", expectImages: false },
      { msg: "හරි ඇණවුම දාන්න", expectImages: false },
    ]
  },
  {
    id: 4,
    name: "Customer 4 - Dilshan Madushanka (Denim Stretch 3-Pack Package)",
    phone: "94766600004",
    productInquiry: "Denim Stretch Comfort Shorts",
    quantity: 3,
    expectedSubtotal: 3000,
    expectedDelivery: 0,
    expectedTotal: 3000,
    colors: "1, 2, 3",
    customerName: "Dilshan Madushanka",
    customerAddress: "12 Tangalle Road, Hambantota",
    turns: [
      { msg: "Hi", expectImages: false },
      { msg: "Denim Stretch Comfort Shorts", expectImages: true },
      { msg: "3 Pack එකක් දාන්න", expectImages: false },
      { msg: "පාට 1, 2, 3", expectImages: false },
      { msg: "Dilshan Madushanka, 12 Tangalle Road, Hambantota, 0766600004", expectImages: false },
      { msg: "ඔව් විස්තර හරි", expectImages: false },
    ]
  },
  {
    id: 5,
    name: "Customer 5 - Chamari Athapaththu (Denim Stretch 5 pcs custom)",
    phone: "94766600005",
    productInquiry: "Denim Stretch Comfort Shorts",
    quantity: 5,
    expectedSubtotal: 5000,
    expectedDelivery: 0,
    expectedTotal: 5000,
    colors: "1, 2, 3, 4, 5",
    customerName: "Chamari Athapaththu",
    customerAddress: "77 Temple Road, Kurunegala",
    turns: [
      { msg: "Hi", expectImages: false },
      { msg: "Denim Stretch Comfort Shorts", expectImages: true },
      { msg: "කලිසම් 5ක් ගන්න පුළුවන්ද?", expectImages: false },
      { msg: "පාට 1, 2, 3, 4, 5", expectImages: false },
      { msg: "Chamari Athapaththu, 77 Temple Road, Kurunegala, 0766600005", expectImages: false },
      { msg: "හරි confirm කරන්න", expectImages: false },
    ]
  },
  {
    id: 6,
    name: "Customer 6 - Rangana Herath (Popcorn 16 inch 5-Pack Package)",
    phone: "94766600006",
    productInquiry: "පොප්කොන් ශෝර්ට් උස අගල් 16",
    quantity: 5,
    expectedSubtotal: 2600,
    expectedDelivery: 0,
    expectedTotal: 2600,
    colors: "1, 2, 3, 4, 5",
    customerName: "Rangana Herath",
    customerAddress: "33 Kandy Road, Kegalle",
    turns: [
      { msg: "Hello", expectImages: false },
      { msg: "පොප්කොන් ශෝර්ට් උස අගල් 16", expectImages: true },
      { msg: "5 Pack එකක් ඕනේ", expectImages: false },
      { msg: "පාට 1, 2, 3, 4, 5", expectImages: false },
      { msg: "Rangana Herath, 33 Kandy Road, Kegalle, 0766600006", expectImages: false },
      { msg: "විස්තර නිවැරදියි confirm කරන්න", expectImages: false },
    ]
  },
  {
    id: 7,
    name: "Customer 7 - Marvan Atapattu (Cargo Fleece 4-Pack Package)",
    phone: "94766600007",
    productInquiry: "Cargo Fleece Casual Shorts",
    quantity: 4,
    expectedSubtotal: 4400,
    expectedDelivery: 0,
    expectedTotal: 4400,
    colors: "1, 2, 3, 4",
    customerName: "Marvan Atapattu",
    customerAddress: "88 Flower Road, Colombo 07",
    turns: [
      { msg: "විස්තර එවන්න", expectImages: false },
      { msg: "Cargo Fleece Casual Shorts", expectImages: true },
      { msg: "4 Pack එකක් දාන්න", expectImages: false },
      { msg: "පාට 1, 2, 3, 4", expectImages: false },
      { msg: "Marvan Atapattu, 88 Flower Road, Colombo 07, 0766600007", expectImages: false },
      { msg: "හරි ඇණවුම දාන්න", expectImages: false },
    ]
  },
  {
    id: 8,
    name: "Customer 8 - Oshada Fernando (Linen Blend 4 pcs custom)",
    phone: "94766600008",
    productInquiry: "Linen Blend Casual Shorts",
    quantity: 4,
    expectedSubtotal: 3600,
    expectedDelivery: 0,
    expectedTotal: 3600,
    colors: "1, 2, 3, 4",
    customerName: "Oshada Fernando",
    customerAddress: "22 Park Road, Panadura",
    turns: [
      { msg: "Hi", expectImages: false },
      { msg: "Linen Blend Casual Shorts", expectImages: true },
      { msg: "කලිසම් 4ක් ගන්න පුළුවන්ද?", expectImages: false },
      { msg: "පාට 1, 2, 3, 4", expectImages: false },
      { msg: "Oshada Fernando, 22 Park Road, Panadura, 0766600008", expectImages: false },
      { msg: "හරි confirm කරන්න", expectImages: false },
    ]
  },
  {
    id: 9,
    name: "Customer 9 - Ramesh Mendis (Waffle Knit 3 pcs custom)",
    phone: "94766600009",
    productInquiry: "Waffle Knit Cotton Shorts",
    quantity: 3,
    expectedSubtotal: 2100,
    expectedDelivery: 450,
    expectedTotal: 2550,
    colors: "1, 2, 3",
    customerName: "Ramesh Mendis",
    customerAddress: "15 Main Street, Ambalangoda",
    turns: [
      { msg: "Hello", expectImages: false },
      { msg: "Waffle Knit Cotton Shorts", expectImages: true },
      { msg: "මට කලිසම් 3ක් ඕනේ, ගාණ කීයද?", expectImages: false },
      { msg: "පාට 1, 2, 3", expectImages: false },
      { msg: "Ramesh Mendis, 15 Main Street, Ambalangoda, 0766600009", expectImages: false },
      { msg: "විස්තර නිවැරදියි confirm කරන්න", expectImages: false },
    ]
  },
  {
    id: 10,
    name: "Customer 10 - Shashikala Siriwardene (Denim Stretch 6-Pack Package)",
    phone: "94766600010",
    productInquiry: "Denim Stretch Comfort Shorts",
    quantity: 6,
    expectedSubtotal: 5400,
    expectedDelivery: 0,
    expectedTotal: 5400,
    colors: "1, 2, 3, 4, 5, 6",
    customerName: "Shashikala Siriwardene",
    customerAddress: "40 Matara Road, Galle",
    turns: [
      { msg: "විස්තර එවන්න", expectImages: false },
      { msg: "Denim Stretch Comfort Shorts", expectImages: true },
      { msg: "6 Pack එකක් ගන්න කැමතියි", expectImages: false },
      { msg: "පාට 1 සිට 6 දක්වා", expectImages: false },
      { msg: "Shashikala Siriwardene, 40 Matara Road, Galle, 0766600010", expectImages: false },
      { msg: "හරි ඇණවුම දාන්න", expectImages: false },
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
  console.log("TESTING 10 NEW CUSTOMERS WITH NEW PRODUCTS (NO SOURCE FILE EDITS)");
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
  fs.writeFileSync("scratch/new_batch_test_results.json", JSON.stringify(res, null, 2));
  console.log("Testing complete. Results written to scratch/new_batch_test_results.json");
}).catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});

