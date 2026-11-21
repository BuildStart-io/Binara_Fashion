import urllib.request
import json
import time
import os
import subprocess

USER_ID = "8ec761ff-b716-411b-85d2-1b56980d1e8a"
URL = "http://localhost:8000/functions/v1/ai-chat_Binara_Fashion"
API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN1cGFiYXNlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTY4MDAwMDAwMCwiZXhwIjoxOTk1NTU2ODAwfQ.test"

# Define 10 realistic customer personas matching the user's exact last conversation pattern
# with different products and quantities
CUSTOMERS = [
    {
        "id": 1,
        "name": "Kajaram",
        "phone": "94771000001",
        "product_choice": "rib",
        "product_name": "Rib Jacquard Shorts",
        "quantity_msg": "want 6 shorts",
        "quantity": 6,
        "colors_msg": "1 2 3 4 5 6",
        "address_msg": "Kajaram, 45 XC Road, Batticaloa, 0781231231",
        "address": "45 XC Road, Batticaloa",
        "phone_stated": "0781231231",
        "confirm_msg": "conform",
        "expected_total": 3240,  # 540 * 6, free delivery
        "expected_delivery": 0,
    },
    {
        "id": 2,
        "name": "Nimal Shantha",
        "phone": "94771000002",
        "product_choice": "popcorn 18",
        "product_name": "පොප්කෝන්  ශෝර්ට් උස අගල්  18",
        "quantity_msg": "4 pack eka ona",
        "quantity": 4,
        "colors_msg": "1 2 3 4",
        "address_msg": "Nimal Shantha, No 24 Temple Road, Kalutara, 0772223344",
        "address": "No 24 Temple Road, Kalutara",
        "phone_stated": "0772223344",
        "confirm_msg": "hari confirm karanna",
        "expected_total": 2600,  # 4-pack price, free delivery
        "expected_delivery": 0,
    },
    {
        "id": 3,
        "name": "Dilini Wathsala",
        "phone": "94771000003",
        "product_choice": "kyela",
        "product_name": "Kyela Brand Single Jersey Cotton Shorts",
        "quantity_msg": "5 pack eka ganna ona",
        "quantity": 5,
        "colors_msg": "pata 1 2 3 4 5",
        "address_msg": "Dilini Wathsala, 145/4 A, Handessa, Kandy, 0752001233",
        "address": "145/4 A, Handessa, Kandy",
        "phone_stated": "0752001233",
        "confirm_msg": "confirm",
        "expected_total": 2500,  # 5-pack offer, free delivery
        "expected_delivery": 0,
    },
    {
        "id": 4,
        "name": "Saman Kumara",
        "phone": "94771000004",
        "product_choice": "single jersey 20",
        "product_name": "SingleJersey Cotton උස අගල් 20",
        "quantity_msg": "mata 4 pack ekak danna",
        "quantity": 4,
        "colors_msg": "1, 2, 3, 4",
        "address_msg": "Saman Kumara, 56/1 Galle Road, Matara, 0713344556",
        "address": "56/1 Galle Road, Matara",
        "phone_stated": "0713344556",
        "confirm_msg": "hari ok",
        "expected_total": 2650,  # 4-pack price, free delivery
        "expected_delivery": 0,
    },
    {
        "id": 5,
        "name": "Tharindu Bandara",
        "phone": "94771000005",
        "product_choice": "popcorn 16",
        "product_name": "පොප්කොන් ශෝර්ට් උස අගල් 16",
        "quantity_msg": "mata 2 shorts ganna puluwanda?",
        "quantity": 2,
        "colors_msg": "pata 1 eken 1i, pata 2 eken 1i",
        "address_msg": "Tharindu Bandara, No 12 Kandy Road, Kurunegala, 0765566778",
        "address": "No 12 Kandy Road, Kurunegala",
        "phone_stated": "0765566778",
        "confirm_msg": "conform",
        "expected_total": 1490,  # 520 * 2 = 1040 + 450 delivery
        "expected_delivery": 450,
    },
    {
        "id": 6,
        "name": "Praveen Jayawardena",
        "phone": "94771000006",
        "product_choice": "rib",
        "product_name": "Rib Jacquard Shorts",
        "quantity_msg": "10 shorts offer eka ona",
        "quantity": 10,
        "colors_msg": "1 2 3 4 5 6 7 8 9 10",
        "address_msg": "Praveen Jayawardena, 88 Flower Road, Colombo 07, 0774433221",
        "address": "88 Flower Road, Colombo 07",
        "phone_stated": "0774433221",
        "confirm_msg": "confirm karanna",
        "expected_total": 5100,  # 10-pack offer, free delivery
        "expected_delivery": 0,
    },
    {
        "id": 7,
        "name": "Chamari Senaviratne",
        "phone": "94771000007",
        "product_choice": "kyela",
        "product_name": "Kyela Brand Single Jersey Cotton Shorts",
        "quantity_msg": "10 pack eka keeyada? eka danna",
        "quantity": 10,
        "colors_msg": "1 2 3 4 5 6 7 8 9 10",
        "address_msg": "Chamari Senaviratne, 15 Main Street, Negombo, 0719988776",
        "address": "15 Main Street, Negombo",
        "phone_stated": "0719988776",
        "confirm_msg": "ow hari",
        "expected_total": 4500,  # 10-pack offer, free delivery
        "expected_delivery": 0,
    },
    {
        "id": 8,
        "name": "Roshan Fernando",
        "phone": "94771000008",
        "product_choice": "popcorn 16",
        "product_name": "පොප්කොන් ශෝර්ට් උස අගල් 16",
        "quantity_msg": "want 6 shorts",
        "quantity": 6,
        "colors_msg": "1 2 3 4 5 6",
        "address_msg": "Roshan Fernando, No 32 Sea Street, Galle, 0783322114",
        "address": "No 32 Sea Street, Galle",
        "phone_stated": "0783322114",
        "confirm_msg": "conform",
        "expected_total": 3120,  # 520 * 6 = 3120, free delivery (>=5)
        "expected_delivery": 0,
    },
    {
        "id": 9,
        "name": "Anura Dissanayake",
        "phone": "94771000009",
        "product_choice": "popcorn 18",
        "product_name": "පොප්කෝන්  ශෝර්ට් උස අගල්  18",
        "quantity_msg": "mata pack 2k ona shorts 8k",
        "quantity": 8,
        "colors_msg": "1 2 3 4 1 2 3 4",
        "address_msg": "Anura Dissanayake, No 9 Peradeniya Road, Kandy, 0777788990",
        "address": "No 9 Peradeniya Road, Kandy",
        "phone_stated": "0777788990",
        "confirm_msg": "confirm karanna",
        "expected_total": 5200,  # 2600 * 2 = 5200, free delivery
        "expected_delivery": 0,
    },
    {
        "id": 10,
        "name": "Hashini Maduwanthi",
        "phone": "94771000010",
        "product_choice": "single jersey 20",
        "product_name": "SingleJersey Cotton උස අගල් 20",
        "quantity_msg": "10 pack eka ganna ona",
        "quantity": 10,
        "colors_msg": "1 2 3 4 5 6 7 8 1 2",
        "address_msg": "Hashini Maduwanthi, 44 Station Road, Gampaha, 0701122334",
        "address": "44 Station Road, Gampaha",
        "phone_stated": "0701122334",
        "confirm_msg": "ow okkoma hari",
        "expected_total": 6200,  # 10-pack offer, free delivery
        "expected_delivery": 0,
    },
]

def query_db(query):
    cmd = f'docker exec supabase-db psql -U postgres -d postgres -t -A -c "{query}"'
    res = subprocess.run(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    return res.stdout.strip()

def send_chat(phone, sender_name, message, history, max_retries=2):
    payload = {
        "message": message,
        "phoneNumber": phone,
        "senderName": sender_name,
        "conversationHistory": history,
        "userId": USER_ID,
    }
    for attempt in range(max_retries):
        try:
            req = urllib.request.Request(
                URL,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json", "Authorization": f"Bearer {API_KEY}"}
            )
            t0 = time.time()
            with urllib.request.urlopen(req, timeout=60) as resp:
                duration = round(time.time() - t0, 2)
                data = json.loads(resp.read().decode("utf-8"))
                imgs = data.get("imageUrls", [])
                img_count = len(imgs) if isinstance(imgs, list) else 0
                return {
                    "response": data.get("response", ""),
                    "images": imgs,
                    "img_count": img_count,
                    "duration": duration,
                }
        except Exception as e:
            print(f"       ⚠️ Request retry {attempt+1}/{max_retries} due to: {e}")
            if attempt == max_retries - 1:
                raise
            time.sleep(2)

print("=" * 80)
print("STARTING 10 CUSTOMER SIMULATION (FOLLOWING USER'S LIVE PATTERN)")
print("=" * 80)

# Pre-clean test conversations
for c in CUSTOMERS:
    query_db(f"DELETE FROM \\\"Binara_fashion\\\".conversations WHERE phone_number = '{c['phone']}';")
    query_db(f"DELETE FROM \\\"Binara_fashion\\\".orders WHERE customer_phone = '{c['phone_stated']}';")

results = []

for cust in CUSTOMERS:
    print(f"\n[{cust['id']}/10] Testing Customer {cust['id']}: {cust['name']} ({cust['product_name']}, Qty: {cust['quantity']})")
    print("-" * 75)
    
    history = []
    cust_result = {
        "id": cust["id"],
        "name": cust["name"],
        "phone": cust["phone"],
        "product": cust["product_name"],
        "quantity": cust["quantity"],
        "expected_total": cust["expected_total"],
        "turns": [],
        "passed": True,
        "issues": [],
    }
    
    turns_data = [
        ("Turn 1 (Greeting)", "hi", 0, "No photos on greeting"),
        ("Turn 2 (Product Selection)", cust["product_choice"], -1, "Photos sent ONCE on product select"),
        ("Turn 3 (Quantity Selection)", cust["quantity_msg"], 0, "NO PHOTOS on quantity selection"),
        ("Turn 4 (Color Selection)", cust["colors_msg"], 0, "NO PHOTOS on color numbers"),
        ("Turn 5 (Address & Details)", cust["address_msg"], 0, "NO PHOTOS on address details"),
        ("Turn 6 (Confirm)", cust["confirm_msg"], 0, "NO PHOTOS on confirmation"),
    ]
    
    for turn_idx, (turn_label, msg, expected_imgs, rule_desc) in enumerate(turns_data, 1):
        res = send_chat(cust["phone"], cust["name"], msg, history)
        img_count = res["img_count"]
        
        # Check image count condition
        img_ok = False
        if expected_imgs == 0:
            img_ok = (img_count == 0)
        elif expected_imgs == -1: # Must be > 0
            img_ok = (img_count > 0)
        else:
            img_ok = (img_count == expected_imgs)
            
        status_sym = "✅ PASS" if img_ok else "❌ FAIL"
        if not img_ok:
            cust_result["passed"] = False
            cust_result["issues"].append(f"{turn_label}: expected {expected_imgs} images, got {img_count}")
            
        print(f"  {status_sym} {turn_label} [\"{msg}\"] ({res['duration']}s)")
        print(f"       Images Sent: {img_count} | Rule: {rule_desc}")
        resp_snippet = res["response"].replace("\n", " ")[:95]
        print(f"       Bot: {resp_snippet}...")
        
        cust_result["turns"].append({
            "turn": turn_idx,
            "label": turn_label,
            "message": msg,
            "response": res["response"],
            "img_count": img_count,
            "duration": res["duration"],
            "img_ok": img_ok,
        })
        
        # Append to conversation history for next turn
        now_ts = "2026-11-21T18:15:00Z"
        history.append({"message": msg, "direction": "inbound", "created_at": now_ts})
        history.append({
            "message": res["response"],
            "direction": "outbound",
            "created_at": now_ts,
            "message_type": "image" if img_count > 0 else "text",
        })
        time.sleep(0.5)

    # Verify Order in Database
    db_order = query_db(
        f"SELECT total_amount, payment_method, status FROM \\\"Binara_fashion\\\".orders WHERE customer_phone = '{cust['phone_stated']}' ORDER BY created_at DESC LIMIT 1;"
    )
    
    if db_order:
        parts = db_order.split("|")
        actual_total = float(parts[0]) if len(parts) > 0 else 0
        payment_method = parts[1] if len(parts) > 1 else ""
        order_status = parts[2] if len(parts) > 2 else ""
        cust_result["db_order"] = {
            "found": True,
            "total_amount": actual_total,
            "payment_method": payment_method,
            "status": order_status,
        }
        
        # Price check
        if abs(actual_total - cust["expected_total"]) < 1.0:
            print(f"  ✅ DB ORDER VERIFIED: Total LKR {actual_total} (Exact Match: {cust['expected_total']}), Payment: {payment_method}, Status: {order_status}")
        else:
            cust_result["passed"] = False
            cust_result["issues"].append(f"DB Order price mismatch: expected {cust['expected_total']}, got {actual_total}")
            print(f"  ❌ DB ORDER PRICE MISMATCH: expected {cust['expected_total']}, got {actual_total}")
    else:
        cust_result["passed"] = False
        cust_result["db_order"] = {"found": False}
        cust_result["issues"].append("Order not found in database!")
        print(f"  ❌ DB ORDER NOT FOUND for phone {cust['phone_stated']}")

    results.append(cust_result)

# Save results to json
with open("scratch/simulation_10_live_pattern_results.json", "w") as f:
    json.dump(results, f, indent=2)

passed_count = sum(1 for r in results if r["passed"])
print("\n" + "=" * 80)
print(f"SIMULATION COMPLETE: {passed_count}/10 CUSTOMERS PASSED PERFECTLY")
print("=" * 80)
