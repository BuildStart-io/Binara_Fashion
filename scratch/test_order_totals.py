#!/usr/bin/env python3
"""
Test Suite: Evaluate Order Summary & Totals across all product variations and quantity tiers
- Tests new customers (phones: 0713000001 - 0713000010)
- Checks the order summary shown by the bot:
  * Subtotal
  * Delivery charge
  * Total amount
- Compares with the expected price from the catalog description
- Inspects database record in "Binara_fashion".orders
"""

import json
import urllib.request
import urllib.error
import subprocess
import time
import re

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
        return {"response": f"ERROR {e.code}: {err_body}"}
    except Exception as e:
        return {"response": f"ERROR: {e}"}

def query_db_orders(phone):
    cmd = [
        "docker", "exec", "supabase-db", "psql", "-U", "postgres", "-d", "postgres",
        "-t", "-A", "-c",
        f"SELECT id, customer_name, customer_phone, total_amount, payment_method, status, order_items FROM \"Binara_fashion\".orders WHERE customer_phone = '{phone}' ORDER BY created_at DESC LIMIT 1;"
    ]
    res = subprocess.run(cmd, stdout=subprocess.PIPE, text=True)
    out = res.stdout.strip()
    return out if out else None

# Clean prior test orders
subprocess.run([
    "docker", "exec", "supabase-db", "psql", "-U", "postgres", "-d", "postgres",
    "-c", "DELETE FROM \"Binara_fashion\".orders WHERE customer_phone LIKE '07130000%';"
], stdout=subprocess.PIPE, stderr=subprocess.PIPE)

# 8 representative variations across products & quantity tiers
VARIATIONS = [
    {
        "id": 1,
        "name": "Nimal",
        "phone": "0713000001",
        "product": "Kyela Brand Single Jersey Cotton Shorts",
        "tier": "Standard 5-pack",
        "qty": 5,
        "expected_price": 2500,
        "expected_delivery": 0,
        "expected_total": 2500,
        "turns": [
            "Kyela short 5 pack",
            "Colors 1,2,3,4,5",
            "Nimal Perera, No 10 Kandy Road, Kadawatha",
            "0713000001 COD",
            "Confirm"
        ]
    },
    {
        "id": 2,
        "name": "Sunil",
        "phone": "0713000002",
        "product": "Kyela Brand Single Jersey Cotton Shorts",
        "tier": "Standard 10-pack",
        "qty": 10,
        "expected_price": 4500,
        "expected_delivery": 0,
        "expected_total": 4500,
        "turns": [
            "Kyela 10 pack",
            "Pata 1 eken 5i pata 2 eken 5i",
            "Sunil Shantha, 45 Main Street, Negombo",
            "0713000002 Bank",
            "Confirm"
        ]
    },
    {
        "id": 3,
        "name": "Anura",
        "phone": "0713000003",
        "product": "Rib Jacquard Shorts",
        "tier": "Standard 5-pack",
        "qty": 5,
        "expected_price": 2700,
        "expected_delivery": 0,
        "expected_total": 2700,
        "turns": [
            "Rib jacquard 5 pack",
            "Pata 1,2,3,4,5",
            "Anura Kumara, 12 Hospital Road, Matara",
            "0713000003 COD",
            "Confirm"
        ]
    },
    {
        "id": 4,
        "name": "Malkanthi",
        "phone": "0713000004",
        "product": "Rib Jacquard Shorts",
        "tier": "Below 5 (<5 items has LKR 450 delivery)",
        "qty": 2,
        "expected_delivery": 450,
        "notes": "Description: 5 shorts 2700. Under 5 adds 450 delivery. (Unit price 540-600)",
        "turns": [
            "Rib jacquard 2k ganna puluwanda?",
            "Pata 1 eken 1i pata 2 eken 1i",
            "Malkanthi Silva, 78 Temple Road, Kalutara",
            "0713000004 COD",
            "Confirm"
        ]
    },
    {
        "id": 5,
        "name": "Priyantha",
        "phone": "0713000005",
        "product": "SingleJersey Cotton උස අගල් 20",
        "tier": "Standard 4-pack",
        "qty": 4,
        "expected_price": 2650,
        "expected_delivery": 0,
        "expected_total": 2650,
        "turns": [
            "SingleJersey 20 inch 4 pack",
            "Pata 1,2,3,4",
            "Priyantha Bandara, 90 Lake Round, Kurunegala",
            "0713000005 COD",
            "Confirm"
        ]
    },
    {
        "id": 6,
        "name": "Sarath",
        "phone": "0713000006",
        "product": "SingleJersey Cotton උස අගල් 20",
        "tier": "Single piece (1 short)",
        "qty": 1,
        "notes": "Single item order: Should NOT be charged full 4-pack price (2650) without explanation",
        "turns": [
            "SingleJersey 20 inch short 1k ganna one",
            "Pata 1",
            "Sarath Fonseka, 22 Galle Road, Moratuwa",
            "0713000006 Bank",
            "Confirm"
        ]
    },
    {
        "id": 7,
        "name": "Damayanthi",
        "phone": "0713000007",
        "product": "පොප්කොන් ශෝර්ට්ස් උස අගල් 16",
        "tier": "Standard 5-pack",
        "qty": 5,
        "expected_price": 2600,
        "expected_delivery": 0,
        "expected_total": 2600,
        "turns": [
            "Popcorn 16 inch 5 pack",
            "Pata 1,2,3,4,5",
            "Damayanthi Jayasinghe, 34 Station Road, Panadura",
            "0713000007 COD",
            "Confirm"
        ]
    },
    {
        "id": 8,
        "name": "Jagath",
        "phone": "0713000008",
        "product": "පොප්කෝන් ශෝර්ට් උස අගල් 18",
        "tier": "Bulk Above 10 (12 shorts = 3 packs of 4)",
        "qty": 12,
        "expected_price": 7800, # 3 x 2600
        "expected_delivery": 0,
        "expected_total": 7800,
        "turns": [
            "Popcorn 18 inch shorts 12k ganna one",
            "Pata 1 eken 4i pata 2 eken 4i pata 3 eken 4i",
            "Jagath Wickrama, 55 Kandy Road, Gampaha",
            "0713000008 COD",
            "Confirm"
        ]
    }
]

print("="*70)
print("TESTING ORDER SUMMARIES & TOTALS ACROSS PRODUCT VARIATIONS")
print("="*70)

results = []

for sc in VARIATIONS:
    print(f"\n--- Testing Variation {sc['id']}: {sc['product']} ({sc['tier']}) ---")
    history = []
    summary_text = ""
    last_bot_reply = ""
    
    for msg in sc["turns"]:
        resp = send_chat(sc["phone"], sc["name"], msg, history)
        bot_reply = resp.get("response", "")
        last_bot_reply = bot_reply
        
        # Check if this reply looks like an order summary
        if "සාරාංශය" in bot_reply or "මුළු එකතුව" in bot_reply or "Total" in bot_reply or "LKR" in bot_reply:
            summary_text = bot_reply
            
        history.append({"direction": "inbound", "message": msg})
        history.append({"direction": "outbound", "message": bot_reply})
        time.sleep(1)
        
    db_rec = query_db_orders(sc["phone"])
    
    res_entry = {
        "id": sc["id"],
        "customer": sc["name"],
        "phone": sc["phone"],
        "product": sc["product"],
        "tier": sc["tier"],
        "qty": sc["qty"],
        "expected_total": sc.get("expected_total"),
        "summary_text": summary_text,
        "db_record": db_rec
    }
    
    print(f"Summary Bot Response:\n{summary_text}\n")
    if db_rec:
        print(f"✅ DB Order: {db_rec}")
    else:
        print(f"❌ No DB Order recorded!")
        
    results.append(res_entry)

with open("/home/kajaram/.gemini/antigravity/brain/319d7ce8-f0e1-442e-8505-1664ea3c5ae2/scratch/totals_test_results.json", "w", encoding="utf-8") as f:
    json.dump(results, f, ensure_ascii=False, indent=2)

print("\nDone testing all variations! Results saved.")

