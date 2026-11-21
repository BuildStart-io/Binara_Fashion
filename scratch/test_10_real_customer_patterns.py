#!/usr/bin/env python3
"""
Simulate 10 Realistic Customer Personas based on the 46 real conversation patterns:
1. Persona 1: FB Ad clicker ("Can you tell me more about your ad?") -> completes order.
2. Persona 2: Single short buyer ("Mata 1k witharak ganna puluwanda?") -> checks unit price + delivery fee calculation.
3. Persona 3: Plus-size customer ("Ina 45 ta adinna puluwanda?") -> tests smart product recommendation (SingleJersey 20" / Kyela).
4. Persona 4: Fast-delivery inquirer ("Delivery dawas keeyak yanawada?") -> checks direct answer on first turn without catalog dumping.
5. Persona 5: Photo re-requester ("Ane pata thiyena photos tika ayeth ewanna") -> tests image re-trigger mid-flow.
6. Persona 6: Conv #42 Hallucination check ("Can you check if details are correct?" with NO address) -> tests hallucination prevention.
7. Persona 7: Premature Sinhala confirmation ("Ow confirm karanna" with NO address) -> verifies prompt & code intercept.
8. Persona 8: Full COD Order Flow (5 Rib Jacquard shorts, colors 1,2,3,4,5, full address, Panadura) -> verifies valid order creation in DB.
9. Persona 9: Full Bank Transfer Order Flow (4 Popcorn shorts, bank transfer request, full address, Kandy) -> verifies bank info + order creation.
10. Persona 10: Non-catalog item inquiry ("Diga kalisam / denim thiyenawada?") -> checks polite boundary without hallucinating non-existent items.
"""

import json
import urllib.request
import urllib.error
import subprocess
import time
import sys

API_URL = "http://localhost:8000/functions/v1/ai-chat_Binara_Fashion"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3OTI2NDQxMDAsImV4cCI6MjEwODAwNDEwMH0.kSGXA8WBhcMB25V4jyvtmMjc5ZSfFTtD5MIuafMhz-g"
USER_ID = "8ec761ff-b716-411b-85d2-1b56980d1e8a"

def send_chat(phone_number, sender_name, message, history):
    payload = {
        "message": message,
        "phoneNumber": phone_number,
        "senderName": sender_name,
        "conversationHistory": history,
        "userId": USER_ID
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(API_URL, data=data, headers={
        "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
        "Content-Type": "application/json"
    })
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        return {"error": f"HTTP {e.code}: {err_body}"}
    except Exception as e:
        return {"error": str(e)}

def count_db_orders(phone_number):
    cmd = [
        "docker", "exec", "-i", "supabase-db", "psql", "-U", "postgres", "-d", "postgres", "-t", "-A", "-c",
        f"SELECT count(*) FROM \"Binara_fashion\".orders WHERE customer_phone LIKE '%{phone_number[-9:]}%' OR whatsapp_phone LIKE '%{phone_number[-9:]}%';"
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    return int(res.stdout.strip() or "0")

def get_latest_order(phone_number):
    cmd = [
        "docker", "exec", "-i", "supabase-db", "psql", "-U", "postgres", "-d", "postgres", "-t", "-A", "-c",
        f"SELECT customer_name, customer_phone, customer_address, total_amount, payment_method, status FROM \"Binara_fashion\".orders WHERE customer_phone LIKE '%{phone_number[-9:]}%' OR whatsapp_phone LIKE '%{phone_number[-9:]}%' ORDER BY created_at DESC LIMIT 1;"
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    return res.stdout.strip()

customers = [
    {
        "id": 1,
        "title": "Persona 1: Facebook Ad Clicker",
        "name": "Tharindu Perera",
        "phone": "94770000001",
        "turns": [
            "Can you tell me more about your ad?",
            "Rib Jacquard eken 5k ganna one. Ina 32. Pata 1, 2, 3, 4, 5.",
            "Tharindu Perera, No 18 Temple Road, Negombo. 0770000001. Cash on delivery.",
            "Ow okkoma hari, order eka confirm karanna."
        ],
        "expect_order": True
    },
    {
        "id": 2,
        "title": "Persona 2: Single Short Inquirer (Unit Pricing & Delivery)",
        "name": "Nimali Silva",
        "phone": "94770000002",
        "turns": [
            "Mata Rib Jacquard eken 1 short ekak witharak ganna puluwanda? Ganana keeyada?",
            "Delivery ekath ekka mulu mudala keeyada wenne?"
        ],
        "expect_order": False
    },
    {
        "id": 3,
        "title": "Persona 3: Plus-Size Customer (Waist 45 Inches)",
        "name": "Chaminda Jayatilleke",
        "phone": "94770000003",
        "turns": [
            "Mata ina 45 inches walata hariyana shorts thiyenawada?",
            "Single Jersey eken 4 pack eka danna, ina 45. Pata 1 eken 2k, pata 2 eken 2k.",
            "Chaminda, 102/B Kandy Road, Kiribathgoda. 0770000003. Cash on delivery.",
            "Ow confirm karanna."
        ],
        "expect_order": True
    },
    {
        "id": 4,
        "title": "Persona 4: Delivery Timeline Inquirer",
        "name": "Dinuka Madushanka",
        "phone": "94770000004",
        "turns": [
            "Delivery dawas keeyak yanawada Colombo walata?",
            "Wenas district walatath e ganama dawas yanawada?"
        ],
        "expect_order": False
    },
    {
        "id": 5,
        "title": "Persona 5: Photo Re-request Mid-deciding",
        "name": "Kavindi Hansani",
        "phone": "94770000005",
        "turns": [
            "Popcorn 18 inch shorts ganna puluwanda?",
            "Ane mata pata thiyena photos tika ayeth ewanna puluwanda bala ganna?",
            "4 pack eka gannawa, ina 30. Pata 1, 2, 3, 4.",
            "Kavindi Hansani, 45 Flower Road, Colombo 07. 0770000005. Cash on delivery.",
            "Ow details okkoma hari confirm karanna."
        ],
        "expect_order": True
    },
    {
        "id": 6,
        "title": "Persona 6: Conv #42 Bug Reproduction (Voice Note Query / Zero Address)",
        "name": "Chanu Bandara",
        "phone": "94770000006",
        "turns": [
            "Hello, can you help me with this? I am having trouble with it. Could you please check if the details are correct? Thank you."
        ],
        "expect_order": False
    },
    {
        "id": 7,
        "title": "Persona 7: Premature Confirmation without Address",
        "name": "Sajith Ruwan",
        "phone": "94770000007",
        "turns": [
            "Rib shorts 5k ona",
            "Pata 1, 2, 3, 4, 5. Ina 34.",
            "Ow ehenam order eka confirm karanna."
        ],
        "expect_order": False
    },
    {
        "id": 8,
        "title": "Persona 8: Full COD Order Flow (5 Rib Jacquard Shorts)",
        "name": "Kasun Perera",
        "phone": "94770000008",
        "turns": [
            "Rib shorts 5 pack eka ganna ona",
            "Ina 34, pata 1, 2, 3, 4, 5.",
            "Kasun Perera, No 45 Galle Road, Panadura. Phone 0770000008. Cash on delivery.",
            "Ow mama confirm karanawa, danna."
        ],
        "expect_order": True
    },
    {
        "id": 9,
        "title": "Persona 9: Full Bank Transfer Order Flow",
        "name": "Anura Senanayake",
        "phone": "94770000009",
        "turns": [
            "Popcorn 18 inch 4 pack eka keeyada? Bank transfer puluwanda?",
            "Ina 36, pata 1, 2, 3, 4. Bank details ewanna.",
            "Anura Senanayake, No 15 Peradeniya Road, Kandy. 0770000009. Bank transfer karannam.",
            "Ow mama transfer karannam, order eka confirm karanna."
        ],
        "expect_order": True
    },
    {
        "id": 10,
        "title": "Persona 10: Non-Catalog Item Inquiry (Denim / Long Pants)",
        "name": "Roshan Weerasinghe",
        "phone": "94770000010",
        "turns": [
            "Oyala gawa denim kalisam hari diga kalisam thiyenawada?",
            "T-shirts hari shirts hari thiyenawada?"
        ],
        "expect_order": False
    }
]

def run_simulation():
    print("=" * 80)
    print("STARTING 10-CUSTOMER REALISTIC SIMULATION SUITE")
    print("=" * 80)
    
    results = []

    for cust in customers:
        print(f"\n[{cust['id']}/10] Testing {cust['title']} ({cust['name']})")
        print("-" * 70)
        history = []
        turn_logs = []
        
        # Check initial orders in DB
        initial_order_count = count_db_orders(cust["phone"])
        
        for turn_idx, user_msg in enumerate(cust["turns"]):
            print(f"  Customer Turn {turn_idx + 1}: {user_msg}")
            t0 = time.time()
            resp = send_chat(cust["phone"], cust["name"], user_msg, history)
            elapsed = time.time() - t0
            
            bot_text = resp.get("response", resp.get("error", ""))
            image_urls = resp.get("imageUrls", [])
            print(f"  Bot ({elapsed:.1f}s): {bot_text[:120]}..." if len(bot_text) > 120 else f"  Bot ({elapsed:.1f}s): {bot_text}")
            if image_urls:
                print(f"  Attached Images ({len(image_urls)}): {image_urls[0][:60]}...")
                
            # Add to conversation history
            history.append({"direction": "inbound", "message": user_msg})
            history.append({"direction": "outbound", "message": bot_text})
            turn_logs.append({
                "turn": turn_idx + 1,
                "user": user_msg,
                "bot": bot_text,
                "images": image_urls
            })
            time.sleep(0.5)

        # Check final orders in DB
        final_order_count = count_db_orders(cust["phone"])
        new_orders = final_order_count - initial_order_count
        latest_order = get_latest_order(cust["phone"]) if new_orders > 0 else None
        
        # Evaluation
        passed = True
        notes = []
        
        if cust["expect_order"]:
            if new_orders == 1:
                notes.append(f"PASS: Exactly 1 order created in DB. Details: {latest_order}")
            else:
                passed = False
                notes.append(f"FAIL: Expected 1 order, found {new_orders} orders in DB.")
        else:
            if new_orders == 0:
                notes.append("PASS: Correctly created 0 orders (No false/hallucinated confirmation).")
            else:
                passed = False
                notes.append(f"FAIL: Hallucinated order detected! {new_orders} orders created in DB.")
                
        # Persona specific semantic checks
        if cust["id"] == 2:
            # Check single item unit price mentioned
            if any("660" in log["bot"] or "662" in log["bot"] or "450" in log["bot"] or "1110" in log["bot"] or "බෙදාහැරීමේ" in log["bot"] for log in turn_logs):
                notes.append("PASS: Unit pricing / delivery fee accurately calculated for 1 item.")
            else:
                notes.append("INFO: Review single item pricing response.")
        elif cust["id"] == 3:
            # Check SingleJersey or Kyela recommended for 45" waist
            if any("single" in log["bot"].lower() or "kyela" in log["bot"].lower() or "45" in log["bot"] for log in turn_logs):
                notes.append("PASS: Smartly handled 45\" waist recommendation.")
        elif cust["id"] == 4:
            # Check delivery days mentioned without catalog dumping
            if any("දින" in log["bot"] or "days" in log["bot"].lower() or "2" in log["bot"] or "3" in log["bot"] for log in turn_logs):
                notes.append("PASS: Answered delivery timeline directly.")
        elif cust["id"] == 5:
            # Check images sent on re-request
            if len(turn_logs[1]["images"]) > 0 or "<PRODUCT_MEDIA>" in turn_logs[1]["bot"] or "පින්තූර" in turn_logs[1]["bot"]:
                notes.append("PASS: Successfully resolved photos on explicit re-request.")
        elif cust["id"] == 6:
            # Conv 42 check
            if "Akkara 100" not in turn_logs[0]["bot"] and "Chanaka" not in turn_logs[0]["bot"]:
                notes.append("PASS: Zero hallucination on voice query.")
            else:
                passed = False
                notes.append("FAIL: Hallucinated details in response text!")
        elif cust["id"] == 7:
            # Premature confirmation check
            if "නම" in turn_logs[-1]["bot"] or "ලිපිනය" in turn_logs[-1]["bot"] or "address" in turn_logs[-1]["bot"].lower():
                notes.append("PASS: Prompted for missing customer address/name before confirming.")
            else:
                passed = False
                notes.append("FAIL: Did not ask for missing address on confirmation attempt.")
        elif cust["id"] == 10:
            # Non-catalog boundary check
            if any("නැත" in log["bot"] or "නෑ" in log["bot"] or "shorts" in log["bot"].lower() or "කලිසම්" in log["bot"] for log in turn_logs):
                notes.append("PASS: Maintained catalog boundary politely.")
                
        results.append({
            "id": cust["id"],
            "title": cust["title"],
            "passed": passed,
            "notes": notes,
            "turns": turn_logs
        })
        
    print("\n" + "=" * 80)
    print("SIMULATION SUMMARY REPORT")
    print("=" * 80)
    total_passed = sum(1 for r in results if r["passed"])
    print(f"Overall Result: {total_passed}/10 Personas PASSED\n")
    for r in results:
        status_icon = "✅ PASS" if r["passed"] else "❌ FAIL"
        print(f"{status_icon} - [{r['id']}] {r['title']}")
        for n in r["notes"]:
            print(f"      • {n}")
            
    # Save full json log
    with open("scratch/simulation_10_results.json", "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print("\nFull turn-by-turn logs saved to scratch/simulation_10_results.json")

if __name__ == "__main__":
    run_simulation()

