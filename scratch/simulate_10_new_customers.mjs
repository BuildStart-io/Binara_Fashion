import { execSync } from "child_process";
import fs from "fs";

const AI_CHAT_URL = "http://localhost:8000/functions/v1/ai-chat_Binara_Fashion";
const USER_ID = "8ec761ff-b716-411b-85d2-1b56980d1e8a";

const newScenarios = [
  {
    id: 1,
    name: "Customer 1 - Waffle Knit Cotton Shorts (1 pc custom)",
    phone: "94711100001",
    productInquiry: "Waffle Knit Cotton Shorts",
    quantity: 1,
    expectedSubtotal: 700,
    expectedDelivery: 450,
    expectedTotal: 1150,
    colors: "2",
    customerName: "Kusal Mendis",
    customerAddress: "15 Galle Face Terrace, Colombo 03",
    turns: [
      { msg: "Hi", expectImages: false },
      { msg: "Waffle Knit Cotton Shorts", expectImages: true },
      { msg: "මට 1ක් ගන්න පුළුවන්ද?", expectImages: false },
      { msg: "පාට අංක 2", expectImages: false },
      { msg: "Kusal Mendis, 15 Galle Face Terrace, Colombo 03, 0711100001", expectImages: false },
      { msg: "හරි confirm කරන්න", expectImages: false },
    ]
  },
  {
    id: 2,
    name: "Customer 2 - Linen Blend Casual Shorts (2 pcs custom)",
    phone: "94711100002",
    productInquiry: "Linen Blend Casual Shorts",
    quantity: 2,
    expectedSubtotal: 1800, // 900 * 2
    expectedDelivery: 450,
    expectedTotal: 2250,
    colors: "1, 2",
    customerName: "Dinuka Sanjeewa",
    customerAddress: "88 Peradeniya Road, Kandy",
    turns: [
      { msg: "Hello", expectImages: false },
      { msg: "Linen Blend Casual Shorts", expectImages: true },
      { msg: "මට කලිසම් 2ක් ඕනේ, ගාණ කීයද?", expectImages: false },
      { msg: "පාට අංක 1 සහ 2", expectImages: false },
      { msg: "Dinuka Sanjeewa, 88 Peradeniya Road, Kandy, 0711100002", expectImages: false },
      { msg: "විස්තර නිවැරදියි confirm කරන්න", expectImages: false },
    ]
  },
  {
    id: 3,
    name: "Customer 3 - Linen Blend Casual Shorts (3-Pack Package)",
    phone: "94711100003",
    productInquiry: "Linen Blend Casual Shorts",
    quantity: 3,
    expectedSubtotal: 2700,
    expectedDelivery: 0, // catalog package = Free delivery
    expectedTotal: 2700,
    colors: "1, 2, 3",
    customerName: "Nadeesha Perera",
    customerAddress: "42 Sea Street, Negombo",
    turns: [
      { msg: "විස්තර එවන්න", expectImages: false },
      { msg: "Linen Blend Casual Shorts", expectImages: true },
      { msg: "3 Pack එකක් ගන්නවා", expectImages: false },
      { msg: "පාට 1, 2, 3", expectImages: false },
      { msg: "Nadeesha Perera, 42 Sea Street, Negombo, 0711100003", expectImages: false },
      { msg: "හරි ඇණවුම දාන්න", expectImages: false },
    ]
  },
  {
    id: 4,
    name: "Customer 4 - Waffle Knit Cotton Shorts (4-Pack Package)",
    phone: "94711100004",
    productInquiry: "Waffle Knit Cotton Shorts",
    quantity: 4,
    expectedSubtotal: 2800,
    expectedDelivery: 0, // catalog package = Free delivery
    expectedTotal: 2800,
    colors: "1, 2, 3, 4",
    customerName: "Sajith Premadasa",
    customerAddress: "102 Beach Road, Matara",
    turns: [
      { msg: "Hi", expectImages: false },
      { msg: "Waffle Knit Cotton Shorts", expectImages: true },
      { msg: "4 Pack එකක් දාන්න", expectImages: false },
      { msg: "පාට අංක 1, 2, 3, 4", expectImages: false },
      { msg: "Sajith Premadasa, 102 Beach Road, Matara, 0711100004", expectImages: false },
      { msg: "ඔව් විස්තර හරි", expectImages: false },
    ]
  },
  {
    id: 5,
    name: "Customer 5 - Popcorn 18 inch (5 pcs custom / 5 colors chosen)",
    phone: "94711100005",
    productInquiry: "popcorn 18",
    quantity: 5,
    expectedSubtotal: 3250, // 650 * 5
    expectedDelivery: 0, // >= 5 items = Free delivery
    expectedTotal: 3250,
    colors: "1, 2, 3, 3, 4",
    customerName: "Malith Jayawardena",
    customerAddress: "67 Circular Road, Kurunegala",
    turns: [
      { msg: "popcorn 18", expectImages: true },
      { msg: "1 2 3 3 4", expectImages: false },
      { msg: "ඔව් කලිසම් 5ම ගන්නවා", expectImages: false },
      { msg: "Malith Jayawardena, 67 Circular Road, Kurunegala, 0711100005", expectImages: false },
      { msg: "විස්තර නිවැරදියි, confirm කරන්න", expectImages: false },
    ]
  },
  {
    id: 6,
    name: "Customer 6 - Linen Blend Casual Shorts (6-Pack Package)",
    phone: "94711100006",
    productInquiry: "Linen Blend Casual Shorts",
    quantity: 6,
    expectedSubtotal: 5100,
    expectedDelivery: 0, // 6-pack package = Free delivery
    expectedTotal: 5100,
    colors: "1, 2, 3, 4, 5, 6",
    customerName: "Charith Asalanka",
    customerAddress: "19 Nuwara Eliya Road, Gampola",
    turns: [
      { msg: "Hi", expectImages: false },
      { msg: "Linen Blend Casual Shorts", expectImages: true },
      { msg: "6 Pack එක ගන්න කැමතියි", expectImages: false },
      { msg: "පාට 1 සිට 6 දක්වා", expectImages: false },
      { msg: "Charith Asalanka, 19 Nuwara Eliya Road, Gampola, 0711100006", expectImages: false },
      { msg: "හරි confirm කරන්න", expectImages: false },
    ]
  },
  {
    id: 7,
    name: "Customer 7 - Kyela Single Jersey (6 pcs custom qty)",
    phone: "94711100007",
    productInquiry: "Kyela Brand Single Jersey Cotton Shorts",
    quantity: 6,
    expectedSubtotal: 3000, // 500 * 6
    expectedDelivery: 0, // >= 5 items = Free delivery
    expectedTotal: 3000,
    colors: "1, 2, 3, 4, 5, 6",
    customerName: "Harshani Silva",
    customerAddress: "54 Hospital Junction, Badulla",
    turns: [
      { msg: "Hello", expectImages: false },
      { msg: "Kyela Brand Single Jersey Cotton Shorts", expectImages: true },
      { msg: "මට කලිසම් 6ක් ගන්න ඕනෙ", expectImages: false },
      { msg: "පාට අංක 1, 2, 3, 4, 5, 6", expectImages: false },
      { msg: "Harshani Silva, 54 Hospital Junction, Badulla, 0711100007", expectImages: false },
      { msg: "ඔව් විස්තර හරි order එක දාන්න", expectImages: false },
    ]
  },
  {
    id: 8,
    name: "Customer 8 - Waffle Knit Cotton Shorts (8-Pack Package)",
    phone: "94711100008",
    productInquiry: "Waffle Knit Cotton Shorts",
    quantity: 8,
    expectedSubtotal: 5200,
    expectedDelivery: 0, // 8 pack = Free delivery
    expectedTotal: 5200,
    colors: "1, 2, 3, 4, 5, 6, 7, 8",
    customerName: "Pathum Nissanka",
    customerAddress: "73 Main Street, Ratnapura",
    turns: [
      { msg: "විස්තර එවන්න", expectImages: false },
      { msg: "Waffle Knit Cotton Shorts", expectImages: true },
      { msg: "8 Pack එකක් එවන්න", expectImages: false },
      { msg: "පාට 1, 2, 3, 4, 5, 6, 7, 8", expectImages: false },
      { msg: "Pathum Nissanka, 73 Main Street, Ratnapura, 0711100008", expectImages: false },
      { msg: "හරි confirm කරන්න", expectImages: false },
    ]
  },
  {
    id: 9,
    name: "Customer 9 - SingleJersey Cotton 20 inch (2 pcs custom)",
    phone: "94711100009",
    productInquiry: "SingleJersey Cotton උස අගල් 20",
    quantity: 2,
    expectedSubtotal: 1325, // 662.50 * 2
    expectedDelivery: 450,
    expectedTotal: 1775,
    colors: "1, 3",
    customerName: "Ishara Madushani",
    customerAddress: "28 Temple Road, Kalutara",
    turns: [
      { msg: "Hi", expectImages: false },
      { msg: "SingleJersey Cotton උස අගල් 20", expectImages: true },
      { msg: "කලිසම් 2ක් ගන්න පුළුවන්ද?", expectImages: false },
      { msg: "පාට 1 සහ 3", expectImages: false },
      { msg: "Ishara Madushani, 28 Temple Road, Kalutara, 0711100009", expectImages: false },
      { msg: "හරි ඇණවුම දාන්න", expectImages: false },
    ]
  },
  {
    id: 10,
    name: "Customer 10 - Rib Jacquard Shorts (10-Pack Package)",
    phone: "94711100010",
    productInquiry: "Rib Jacquard Shorts",
    quantity: 10,
    expectedSubtotal: 5100,
    expectedDelivery: 0, // 10 pack = Free delivery
    expectedTotal: 5100,
    colors: "1, 2, 3, 4, 5, 6, 7, 8, 9, 10",
    customerName: "Ramesh Mendis",
    customerAddress: "91 Station Road, Gampaha",
    turns: [
      { msg: "Hello", expectImages: false },
      { msg: "Rib Jacquard Shorts", expectImages: true },
      { msg: "10 pack එකක් ඕනේ", expectImages: false },
      { msg: "පාට අංක 1 සිට 10 දක්වා", expectImages: false },
      { msg: "Ramesh Mendis, 91 Station Road, Gampaha, 0711100010", expectImages: false },
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

async function runNewSimulation() {
  console.log("================================================================================");
  console.log("STARTING 10 NEW CUSTOMER SIMULATION & COMPREHENSIVE BUG AUDIT");
  console.log("================================================================================\n");

  const results = [];

  for (const scenario of newScenarios) {
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

runNewSimulation().then(async (res) => {
  fs.writeFileSync("scratch/new_simulation_results.json", JSON.stringify(res, null, 2));
  console.log("New simulation complete. Results written to scratch/new_simulation_results.json");
}).catch(err => {
  console.error("Simulation failed:", err);
  process.exit(1);
});

