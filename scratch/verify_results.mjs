import { execSync } from "child_process";
import fs from "fs";

const scenarios = [
  { id: 1, phone: "0770000011", name: "Customer 1 - Popcorn 16\" (1 pc)", product: "පොප්කොන් ශෝර්ට් (උස අඟල් 16)", qty: 1, expectedSubtotal: 520, expectedDelivery: 450, expectedTotal: 970, expectedColors: "3" },
  { id: 2, phone: "0770000012", name: "Customer 2 - Rib Jacquard (2 pcs)", product: "Rib Jacquard Shorts", qty: 2, expectedSubtotal: 1080, expectedDelivery: 450, expectedTotal: 1530, expectedColors: "1, 2" },
  { id: 3, phone: "0770000013", name: "Customer 3 - SingleJersey Cotton 20\" (3 pcs)", product: "SingleJersey Cotton උස අගල් 20", qty: 3, expectedSubtotal: 1987.5, expectedDelivery: 450, expectedTotal: 2437.5, expectedColors: "1, 3, 4" },
  { id: 4, phone: "0770000014", name: "Customer 4 - Popcorn 18\" (4-pack package)", product: "පොප්කෝන්  ශෝර්ට් උස අගල්  18", qty: 4, expectedSubtotal: 2600, expectedDelivery: 0, expectedTotal: 2600, expectedColors: "1, 4, 5, 8" },
  { id: 5, phone: "0770000015", name: "Customer 5 - SingleJersey Cotton 20\" (4-pack package)", product: "SingleJersey Cotton උස අගල් 20", qty: 4, expectedSubtotal: 2650, expectedDelivery: 0, expectedTotal: 2650, expectedColors: "2, 3, 5, 6" },
  { id: 6, phone: "0770000016", name: "Customer 6 - Rib Jacquard (5-pack package)", product: "Rib Jacquard Shorts", qty: 5, expectedSubtotal: 2700, expectedDelivery: 0, expectedTotal: 2700, expectedColors: "1, 2, 3, 4, 5" },
  { id: 7, phone: "0770000017", name: "Customer 7 - Kyela Single Jersey (5-pack package)", product: "Kyela Brand Single Jersey Cotton Shorts", qty: 5, expectedSubtotal: 2500, expectedDelivery: 0, expectedTotal: 2500, expectedColors: "1, 3, 5, 7, 9" },
  { id: 8, phone: "0770000018", name: "Customer 8 - Popcorn 16\" (7 pcs custom qty)", product: "පොප්කොන් ශෝර්ට් උස අගල් 16", qty: 7, expectedSubtotal: 3640, expectedDelivery: 0, expectedTotal: 3640, expectedColors: "1, 2, 3, 4, 5, 6, 7" },
  { id: 9, phone: "0770000019", name: "Customer 9 - Rib Jacquard (10-pack package)", product: "Rib Jacquard Shorts", qty: 10, expectedSubtotal: 5100, expectedDelivery: 0, expectedTotal: 5100, expectedColors: "1, 2, 3, 4, 5, 6, 7, 8, 9, 10" },
  { id: 10, phone: "0770000020", name: "Customer 10 - SingleJersey Cotton 20\" (10-pack package)", product: "SingleJersey Cotton Shorts (උස අඟල් 20)", qty: 10, expectedSubtotal: 6200, expectedDelivery: 0, expectedTotal: 6200, expectedColors: "1, 2, 3, 4, 5, 6, 7, 8, 9, 10" },
];

console.log("================================================================================");
console.log("VERIFYING 10 CUSTOMER ORDERS IN DATABASE & AUDITING CONVERSATIONS");
console.log("================================================================================\n");

const auditSummary = [];

for (const s of scenarios) {
  const sql = `SELECT json_build_object(
    'id', id,
    'customer_name', customer_name,
    'customer_phone', customer_phone,
    'total_amount', total_amount,
    'status', status,
    'order_items', order_items,
    'special_instructions', special_instructions
  ) FROM "Binara_fashion".orders WHERE customer_phone = '${s.phone}' ORDER BY created_at DESC LIMIT 1;`;

  let order = null;
  try {
    const raw = execSync(`docker exec -i supabase-db psql -U postgres -d postgres -t -A -c "${sql.replace(/"/g, '\\"')}"`, { encoding: "utf8" }).trim();
    if (raw) order = JSON.parse(raw);
  } catch (e) {
    console.error(`Error querying order for ${s.phone}:`, e.message);
  }

  const dbTotal = order ? Number(order.total_amount) : null;
  const isCalcMatch = dbTotal === s.expectedTotal;
  const items = order?.order_items || [];
  const itemColours = items.map(i => i.selected_colors || i.variations?.Color).filter(Boolean).join("; ");
  const specialInstructions = order?.special_instructions || "";
  const coloursFound = itemColours.length > 0 || specialInstructions.includes("Colours:");

  auditSummary.push({
    scenarioId: s.id,
    name: s.name,
    phone: s.phone,
    expectedQty: s.qty,
    expectedTotal: s.expectedTotal,
    dbTotal,
    isCalcMatch,
    itemColours,
    specialInstructions,
    coloursFound,
    orderId: order?.id
  });

  console.log(`Scenario ${s.id}: ${s.name}`);
  console.log(`  - Customer Phone: ${s.phone}`);
  console.log(`  - Expected Total: LKR ${s.expectedTotal} | DB Total: LKR ${dbTotal} -> ${isCalcMatch ? "✅ MATCH" : "❌ MISMATCH"}`);
  console.log(`  - Selected Colours in DB: "${itemColours}" | Instructions: "${specialInstructions}" -> ${coloursFound ? "✅ SAVED" : "❌ MISSING"}`);
  console.log(`  - Order ID: ${order?.id}\n`);
}

fs.writeFileSync("scratch/audit_summary.json", JSON.stringify(auditSummary, null, 2));
console.log("Audit summary saved to scratch/audit_summary.json");

