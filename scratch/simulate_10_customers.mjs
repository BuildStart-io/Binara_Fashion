// Simulation of 10 customer order conversations for Binara Fashion
// Tests for:
// 1. Total calculation errors (unit price calculation, free delivery vs 450 LKR, total matching)
// 2. Order pacing errors (premature order creation, hallucination, missing address check)
// 3. Image spamming errors (<PRODUCT_MEDIA> emitted when photos were already sent)

const AI_CHAT_URL = "http://localhost:8000/functions/v1/ai-chat_Binara_Fashion";
const USER_ID = "8ec761ff-b716-411b-85d2-1b56980d1e8a";

const scenarios = [
  {
    id: 1,
    name: "Customer 1 - Popcorn 16 inch (1 short)",
    phone: "94770000011",
    productNumber: "1", // Popcorn 16"
    productName: "පොප්කොන් ශෝර්ට් උස අගල් 16",
    quantity: 1,
    isPackage: false,
    expectedSubtotal: 520,
    expectedDelivery: 450,
    expectedTotal: 970,
    colors: "3",
    customerInfo: "Kasun Perera, No 12, Galle Road, Kalutara, 0770000011",
    customerName: "Kasun Perera",
    customerAddress: "No 12, Galle Road, Kalutara",
    turns: [
      { msg: "Hi", expectImages: false, expectOrder: false },
      { msg: "1", expectImages: true, expectOrder: false },
      { msg: "මට 1ක් ඕනෙ", expectImages: false, expectOrder: false },
      { msg: "පාට අංක 3", expectImages: false, expectOrder: false },
      { msg: "Kasun Perera, No 12, Galle Road, Kalutara, 0770000011", expectImages: false, expectOrder: false },
      { msg: "විස්තර හරි confirm කරන්න", expectImages: false, expectOrder: true },
    ]
  },
  {
    id: 2,
    name: "Customer 2 - Rib Jacquard (2 shorts)",
    phone: "94770000012",
    productNumber: "4", // Rib Jacquard
    productName: "Rib Jacquard Shorts",
    quantity: 2,
    isPackage: false,
    expectedSubtotal: 1080,
    expectedDelivery: 450,
    expectedTotal: 1530,
    colors: "1, 2",
    customerInfo: "Nimal Silva, 45 Temple Road, Kandy, 0770000012",
    customerName: "Nimal Silva",
    customerAddress: "45 Temple Road, Kandy",
    turns: [
      { msg: "Hello", expectImages: false, expectOrder: false },
      { msg: "4", expectImages: true, expectOrder: false },
      { msg: "කලිසම් 2ක් ගන්න පුළුවන්ද", expectImages: false, expectOrder: false },
      { msg: "පාට 1 සහ 2", expectImages: false, expectOrder: false },
      { msg: "නම Nimal Silva, ලිපිනය 45 Temple Road, Kandy, Phone 0770000012", expectImages: false, expectOrder: false },
      { msg: "හරි ඇණවුම දාන්න", expectImages: false, expectOrder: true },
    ]
  },
  {
    id: 3,
    name: "Customer 3 - SingleJersey Cotton 20 inch (3 shorts)",
    phone: "94770000013",
    productNumber: "2", // SingleJersey 20"
    productName: "SingleJersey Cotton උස අගල් 20",
    quantity: 3,
    isPackage: false,
    expectedSubtotal: 1987.5,
    expectedDelivery: 450,
    expectedTotal: 2437.5,
    colors: "1, 3, 4",
    customerInfo: "Dilani Fernando, 89 Main Street, Negombo, 0770000013",
    customerName: "Dilani Fernando",
    customerAddress: "89 Main Street, Negombo",
    turns: [
      { msg: "විස්තර එවන්න", expectImages: false, expectOrder: false },
      { msg: "2", expectImages: true, expectOrder: false },
      { msg: "මට කලිසම් 3ක් ඕන", expectImages: false, expectOrder: false },
      { msg: "පාට අංක 1, 3, 4", expectImages: false, expectOrder: false },
      { msg: "Dilani Fernando, 89 Main Street, Negombo, 0770000013", expectImages: false, expectOrder: false },
      { msg: "ඔව් විස්තර නිවැරදියි", expectImages: false, expectOrder: true },
    ]
  },
  {
    id: 4,
    name: "Customer 4 - Popcorn 18 inch (4 Pack Package)",
    phone: "94770000014",
    productNumber: "3", // Popcorn 18" is #3 or Popcorn 18" by name
    productName: "පොප්කෝන්  ශෝර්ට් උස අගල්  18",
    quantity: 4,
    isPackage: true,
    expectedSubtotal: 2600,
    expectedDelivery: 0, // 4-pack catalog package = FREE DELIVERY
    expectedTotal: 2600,
    colors: "1, 4, 5, 8",
    customerInfo: "Chamari Wickramasinghe, 22 Flower Road, Colombo 07, 0770000014",
    customerName: "Chamari Wickramasinghe",
    customerAddress: "22 Flower Road, Colombo 07",
    turns: [
      { msg: "Hi", expectImages: false, expectOrder: false },
      { msg: "පොප්කෝන්  ශෝර්ට් උස අගල්  18", expectImages: true, expectOrder: false },
      { msg: "4 Pack එක ඕනේ", expectImages: false, expectOrder: false },
      { msg: "පාට අංක 1, 4, 5, 8", expectImages: false, expectOrder: false },
      { msg: "Chamari Wickramasinghe, 22 Flower Road, Colombo 07, 0770000014", expectImages: false, expectOrder: false },
      { msg: "හරි confirm කරන්න", expectImages: false, expectOrder: true },
    ]
  },
  {
    id: 5,
    name: "Customer 5 - SingleJersey Cotton 20 inch (4 Pack Package)",
    phone: "94770000015",
    productNumber: "2",
    productName: "SingleJersey Cotton උස අගල් 20",
    quantity: 4,
    isPackage: true,
    expectedSubtotal: 2650,
    expectedDelivery: 0, // catalog package = FREE DELIVERY
    expectedTotal: 2650,
    colors: "2, 3, 5, 6",
    customerInfo: "Ruwan Jayawardena, 105 Hospital Road, Matara, 0770000015",
    customerName: "Ruwan Jayawardena",
    customerAddress: "105 Hospital Road, Matara",
    turns: [
      { msg: "Hello", expectImages: false, expectOrder: false },
      { msg: "SingleJersey Cotton උස අගල් 20", expectImages: true, expectOrder: false },
      { msg: "4 pack එක එවන්න", expectImages: false, expectOrder: false },
      { msg: "පාට අංක 2, 3, 5, 6", expectImages: false, expectOrder: false },
      { msg: "Ruwan Jayawardena, 105 Hospital Road, Matara, 0770000015", expectImages: false, expectOrder: false },
      { msg: "ඔව් විස්තර හරි", expectImages: false, expectOrder: true },
    ]
  },
  {
    id: 6,
    name: "Customer 6 - Rib Jacquard (5 Pack Package)",
    phone: "94770000016",
    productNumber: "4",
    productName: "Rib Jacquard Shorts",
    quantity: 5,
    isPackage: true,
    expectedSubtotal: 2700,
    expectedDelivery: 0, // 5 pack = FREE DELIVERY
    expectedTotal: 2700,
    colors: "1, 2, 3, 4, 5",
    customerInfo: "Thilina Bandara, 14 Lake Road, Kurunegala, 0770000016",
    customerName: "Thilina Bandara",
    customerAddress: "14 Lake Road, Kurunegala",
    turns: [
      { msg: "Hi", expectImages: false, expectOrder: false },
      { msg: "Rib Jacquard Shorts", expectImages: true, expectOrder: false },
      { msg: "5 pack එක ගන්නවා", expectImages: false, expectOrder: false },
      { msg: "පාට අංක 1, 2, 3, 4, 5", expectImages: false, expectOrder: false },
      { msg: "Thilina Bandara, 14 Lake Road, Kurunegala, 0770000016", expectImages: false, expectOrder: false },
      { msg: "විස්තර හරි confirm කරන්න", expectImages: false, expectOrder: true },
    ]
  },
  {
    id: 7,
    name: "Customer 7 - Kyela Single Jersey (5 Pack Package)",
    phone: "94770000017",
    productNumber: "5",
    productName: "Kyela Brand Single Jersey Cotton Shorts",
    quantity: 5,
    isPackage: true,
    expectedSubtotal: 2500,
    expectedDelivery: 0, // 5 pack = FREE DELIVERY
    expectedTotal: 2500,
    colors: "1, 3, 5, 7, 9",
    customerInfo: "Anura Kumara, 78 Station Road, Anuradhapura, 0770000017",
    customerName: "Anura Kumara",
    customerAddress: "78 Station Road, Anuradhapura",
    turns: [
      { msg: "Can I learn more about your products?", expectImages: false, expectOrder: false },
      { msg: "Kyela Brand Single Jersey Cotton Shorts", expectImages: true, expectOrder: false },
      { msg: "5 Pack එක ඕනේ", expectImages: false, expectOrder: false },
      { msg: "පාට 1, 3, 5, 7, 9", expectImages: false, expectOrder: false },
      { msg: "Anura Kumara, 78 Station Road, Anuradhapura, 0770000017", expectImages: false, expectOrder: false },
      { msg: "Confirm කරන්න", expectImages: false, expectOrder: true },
    ]
  },
  {
    id: 8,
    name: "Customer 8 - Popcorn 16 inch (7 shorts custom quantity)",
    phone: "94770000018",
    productNumber: "1",
    productName: "පොප්කොන් ශෝර්ට් උස අගල් 16",
    quantity: 7,
    isPackage: false,
    expectedSubtotal: 3640, // 7 * 520
    expectedDelivery: 0, // >= 5 items = FREE DELIVERY
    expectedTotal: 3640,
    colors: "1, 2, 3, 4, 5, 6, 7",
    customerInfo: "Mahesh Senanayake, 33 Hill Street, Nuwara Eliya, 0770000018",
    customerName: "Mahesh Senanayake",
    customerAddress: "33 Hill Street, Nuwara Eliya",
    turns: [
      { msg: "Hi", expectImages: false, expectOrder: false },
      { msg: "පොප්කොන් ශෝර්ට් උස අගල් 16", expectImages: true, expectOrder: false },
      { msg: "මට කලිසම් 7ක් ඕනෙ, ගාණ කීයද?", expectImages: false, expectOrder: false },
      { msg: "පාට අංක 1, 2, 3, 4, 5, 6, 7", expectImages: false, expectOrder: false },
      { msg: "Mahesh Senanayake, 33 Hill Street, Nuwara Eliya, 0770000018", expectImages: false, expectOrder: false },
      { msg: "ඔව් විස්තර හරි confirm කරන්න", expectImages: false, expectOrder: true },
    ]
  },
  {
    id: 9,
    name: "Customer 9 - Rib Jacquard (10 Pack Package)",
    phone: "94770000019",
    productNumber: "4",
    productName: "Rib Jacquard Shorts",
    quantity: 10,
    isPackage: true,
    expectedSubtotal: 5100,
    expectedDelivery: 0, // 10 pack = FREE DELIVERY
    expectedTotal: 5100,
    colors: "1, 2, 3, 4, 5, 6, 7, 8, 9, 10",
    customerInfo: "Priyantha Dissanayake, 56 Beach Road, Hikkaduwa, 0770000019",
    customerName: "Priyantha Dissanayake",
    customerAddress: "56 Beach Road, Hikkaduwa",
    turns: [
      { msg: "විස්තර එවන්න", expectImages: false, expectOrder: false },
      { msg: "Rib Jacquard Shorts", expectImages: true, expectOrder: false },
      { msg: "10 pack එකක් ගන්නවා", expectImages: false, expectOrder: false },
      { msg: "පාට 1 සිට 10 දක්වා සියලුම පාට වලින් 1 බැගින්", expectImages: false, expectOrder: false },
      { msg: "Priyantha Dissanayake, 56 Beach Road, Hikkaduwa, 0770000019", expectImages: false, expectOrder: false },
      { msg: "හරි confirm කරන්න", expectImages: false, expectOrder: true },
    ]
  },
  {
    id: 10,
    name: "Customer 10 - SingleJersey Cotton 20 inch (10 Pack Package)",
    phone: "94770000020",
    productNumber: "2",
    productName: "SingleJersey Cotton උස අගල් 20",
    quantity: 10,
    isPackage: true,
    expectedSubtotal: 6200,
    expectedDelivery: 0, // 10 pack = FREE DELIVERY
    expectedTotal: 6200,
    colors: "1, 2, 3, 4, 5, 6, 7, 8, 9, 10",
    customerInfo: "Sandun Rajapaksha, 12 Park Avenue, Gampaha, 0770000020",
    customerName: "Sandun Rajapaksha",
    customerAddress: "12 Park Avenue, Gampaha",
    turns: [
      { msg: "Hello", expectImages: false, expectOrder: false },
      { msg: "SingleJersey Cotton උස අගල් 20", expectImages: true, expectOrder: false },
      { msg: "10 pack එකක් ඕනේ", expectImages: false, expectOrder: false },
      { msg: "පාට අංක 1, 2, 3, 4, 5, 6, 7, 8, 9, 10", expectImages: false, expectOrder: false },
      { msg: "Sandun Rajapaksha, 12 Park Avenue, Gampaha, 0770000020", expectImages: false, expectOrder: false },
      { msg: "විස්තර නිවැරදියි, order එක දාන්න", expectImages: false, expectOrder: true },
    ]
  }
];

import { execSync } from "child_process";

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

async function runSimulation() {
  console.log("================================================================================");
  console.log("STARTING 10-CUSTOMER CHAT SIMULATION & COMPREHENSIVE BUG AUDIT");
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
        'items', items,
        'special_instructions', special_instructions
      ) FROM "Binara_fashion".orders WHERE customer_phone = '${scenario.phone}' OR customer_phone = '${scenario.phone.replace(/^94/, "0")}' ORDER BY created_at DESC LIMIT 1;`;
      const out = execSync(`docker exec -i supabase-db psql -U postgres -d postgres -t -A -c "${query}"`, { encoding: "utf8" }).trim();
      if (out) {
        dbOrder = JSON.parse(out);
      }
    } catch (e) {
      console.error(`    Database query error for ${scenario.phone}:`, e.message);
    }

    // Evaluation
    const calcCorrect = dbOrder ? (Number(dbOrder.total_amount) === scenario.expectedTotal) : false;
    const pacingCorrect = (prematureOrderTurn === -1) && (orderCreatedTurn === scenario.turns.length);
    const imageCorrect = (imageSpamTurns.length === 0) && (photosSentTurn === 2);
    const coloursRecorded = dbOrder && (
      (dbOrder.special_instructions && dbOrder.special_instructions.includes("Colours:")) ||
      (Array.isArray(dbOrder.items) && dbOrder.items.some(i => i.selected_colors || (i.variations && i.variations.Color)))
    );

    console.log(`    📊 Results:`);
    console.log(`       - Photos sent turn: ${photosSentTurn} (Target: 2) -> ${photosSentTurn === 2 ? "✅ PASS" : "❌ FAIL"}`);
    console.log(`       - Image spam turns: ${imageSpamTurns.length > 0 ? imageSpamTurns.join(", ") : "None"} -> ${imageCorrect ? "✅ PASS" : "❌ FAIL"}`);
    console.log(`       - Order pacing: ${pacingCorrect ? "✅ Confirmed at Turn 6 (no premature orders)" : `❌ Turn ${prematureOrderTurn || orderCreatedTurn}`}`);
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

// Write results to JSON file for analysis
runSimulation().then(async (res) => {
  const fs = await import("fs");
  fs.writeFileSync("scratch/simulation_results.json", JSON.stringify(res, null, 2));
  console.log("Simulation complete. Results written to scratch/simulation_results.json");
}).catch(err => {
  console.error("Simulation failed:", err);
  process.exit(1);
});

