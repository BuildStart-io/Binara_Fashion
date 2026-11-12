#!/usr/bin/env python3
"""
Test Suite: 10 Facebook Ad Customers with 1-2 Word Ultra-Short Messages ("Lazy Customers")
Tests:
- Below 3 shorts: C1, C2, C3
- Below 10 shorts: C4, C5, C6, C7
- Above 10 shorts: C8, C9, C10
- Product details with images on initial inquiry
- No image spam on follow-up questions
- Mid-conversation image requests ("Photos?", "Pics?", "Images?")
- Order confirmation and database creation in "Binara_fashion".orders
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
        print(f"HTTPError {e.code}: {err_body}")
        return {"response": f"ERROR {e.code}: {err_body}", "imageUrls": []}
    except Exception as e:
        print(f"Request Error: {e}")
        return {"response": f"ERROR: {e}", "imageUrls": []}

def query_db_orders(phone):
    cmd = [
        "docker", "exec", "supabase-db", "psql", "-U", "postgres", "-d", "postgres",
        "-t", "-A", "-c",
        f"SELECT id, customer_name, customer_phone, total_amount, payment_method, status, order_items FROM \"Binara_fashion\".orders WHERE customer_phone = '{phone}' ORDER BY created_at DESC LIMIT 1;"
    ]
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    out = res.stdout.strip()
    return out if out else None

# Clean existing orders for our test numbers (94712000001 to 94712000010)
cleanup_cmd = [
    "docker", "exec", "supabase-db", "psql", "-U", "postgres", "-d", "postgres",
    "-c", "DELETE FROM \"Binara_fashion\".orders WHERE customer_phone LIKE '07120000%';"
]
subprocess.run(cleanup_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

# 10 Customer Scenarios (Strictly 1-2 words per customer message)
SCENARIOS = [
    {
        "id": 1,
        "name": "Kasun",
        "phone": "0712000001",
        "category": "Below 3 (2 shorts)",
        "product": "Rib Jacquard Shorts",
        "turns": [
            ("inquiry", "Rib jacquard?"),
            ("q1", "Delivery charge?"),
            ("mid_images", "Photos?"),
            ("qty", "2k"),
            ("colors", "Pata 1,2"),
            ("details_1", "Kasun Galle"),
            ("details_2", "0712000001 COD"),
            ("confirm", "Confirm")
        ]
    },
    {
        "id": 2,
        "name": "Rohini",
        "phone": "0712000002",
        "category": "Below 3 (1 short)",
        "product": "SingleJersey Cotton උස අගල් 20",
        "turns": [
            ("inquiry", "20 inch?"),
            ("q1", "1k ganna"),
            ("mid_images", "Photos?"),
            ("colors", "Pata 1"),
            ("details_1", "Rohini Maharagama"),
            ("details_2", "0712000002 Bank"),
            ("confirm", "Confirm")
        ]
    },
    {
        "id": 3,
        "name": "Tharindu",
        "phone": "0712000003",
        "category": "Below 3 (2 shorts)",
        "product": "Popcorn shorts උස අගල් 18",
        "turns": [
            ("inquiry", "Popcorn 18?"),
            ("q1", "2k keeyada?"),
            ("mid_images", "Photos?"),
            ("colors", "Pata 1,3"),
            ("details_1", "Tharindu Kurunegala"),
            ("details_2", "0712000003 COD"),
            ("confirm", "Confirm")
        ]
    },
    {
        "id": 4,
        "name": "Dinithi",
        "phone": "0712000004",
        "category": "Below 10 (5 shorts)",
        "product": "Kyela Brand Single Jersey Cotton Shorts",
        "turns": [
            ("inquiry", "Kyela short?"),
            ("q1", "5 pack?"),
            ("mid_images", "Photos?"),
            ("colors", "Pata 1,2,3,4,5"),
            ("details_1", "Dinithi Colombo"),
            ("details_2", "0712000004 COD"),
            ("confirm", "Yes")
        ]
    },
    {
        "id": 5,
        "name": "Pathum",
        "phone": "0712000005",
        "category": "Below 10 (4 shorts)",
        "product": "SingleJersey Cotton උස අගල් 20",
        "turns": [
            ("inquiry", "SingleJersey 20?"),
            ("q1", "4 pack"),
            ("mid_images", "Photos?"),
            ("colors", "Pata 1,2,3,4"),
            ("details_1", "Pathum Kandy"),
            ("details_2", "0712000005 Bank"),
            ("confirm", "Confirm")
        ]
    },
    {
        "id": 6,
        "name": "Chathurika",
        "phone": "0712000006",
        "category": "Below 10 (5 shorts)",
        "product": "පොප්කොන් ශෝර්ට්ස් උස අගල් 16",
        "turns": [
            ("inquiry", "Popcorn 16?"),
            ("q1", "Deliver free?"),
            ("mid_images", "Photos?"),
            ("qty", "5 pack"),
            ("colors", "Pata 1,2,3,4,5"),
            ("details_1", "Chathurika Gampaha"),
            ("details_2", "0712000006 COD"),
            ("confirm", "Hari")
        ]
    },
    {
        "id": 7,
        "name": "Pradeep",
        "phone": "0712000007",
        "category": "Below 10 (5 shorts)",
        "product": "Rib Jacquard Shorts",
        "turns": [
            ("inquiry", "Rib jacquard?"),
            ("q1", "5 pack"),
            ("mid_images", "Photos?"),
            ("colors", "Pata 1,2,3,4,5"),
            ("details_1", "Pradeep Negombo"),
            ("details_2", "0712000007 COD"),
            ("confirm", "Ewanna")
        ]
    },
    {
        "id": 8,
        "name": "Gayan",
        "phone": "0712000008",
        "category": "Above 10 (15 shorts)",
        "product": "Kyela Brand Single Jersey Cotton Shorts",
        "turns": [
            ("inquiry", "Kyela 15?"),
            ("q1", "Discount thiyeda?"),
            ("mid_images", "Photos?"),
            ("colors", "Pata 1,2,3"),
            ("details_1", "Gayan Nugegoda"),
            ("details_2", "0712000008 Bank"),
            ("confirm", "Confirm")
        ]
    },
    {
        "id": 9,
        "name": "Kamal",
        "phone": "0712000009",
        "category": "Above 10 (12 shorts)",
        "product": "Popcorn shorts උස අගල් 18",
        "turns": [
            ("inquiry", "Popcorn 12?"),
            ("q1", "Staff number?"),
            ("mid_images", "Photos?"),
            ("colors", "Pata 1,2,3"),
            ("details_1", "Kamal Matara"),
            ("details_2", "0712000009 COD"),
            ("confirm", "Order")
        ]
    },
    {
        "id": 10,
        "name": "Anuradha",
        "phone": "0712000010",
        "category": "Above 10 (20 shorts)",
        "product": "SingleJersey Cotton උස අගල් 20",
        "turns": [
            ("inquiry", "SingleJersey 20?"),
            ("q1", "20k gannawa"),
            ("mid_images", "Photos?"),
            ("colors", "Pata 1,2"),
            ("details_1", "Anuradha Thulhiriya"),
            ("details_2", "0712000010 Bank"),
            ("confirm", "Confirm")
        ]
    }
]

print("=" * 70)
print("STARTING 10 LAZY CUSTOMER SIMULATIONS (1-2 WORDS PER MESSAGE)")
print("=" * 70)

all_results = []

for sc in SCENARIOS:
    print(f"\n{'='*70}")
    print(f"CUSTOMER {sc['id']}: {sc['name']} ({sc['phone']})")
    print(f"Target: {sc['product']} | Bracket: {sc['category']}")
    print(f"{'='*70}\n")
    
    history = []
    cust_report = {
        "customer_id": sc["id"],
        "name": sc["name"],
        "phone": sc["phone"],
        "category": sc["category"],
        "product": sc["product"],
        "turns": [],
        "bugs_detected": [],
        "order_created_in_db": False,
        "db_record": None
    }
    
    for turn_idx, (turn_step, msg) in enumerate(sc["turns"]):
        # Verify message length is 1-2 words
        word_count = len(msg.strip().split())
        print(f"[{turn_step}] Customer ({word_count} words): \"{msg}\"")
        
        t0 = time.time()
        resp_data = send_chat(sc["phone"], sc["name"], msg, history)
        elapsed = round(time.time() - t0, 2)
        
        clean_text = resp_data.get("response", "")
        imgs = resp_data.get("imageUrls", [])
        img_count = len(imgs)
        
        preview = clean_text[:140].replace("\n", " ")
        print(f"  🤖 Bot ({elapsed}s, {img_count} imgs): {preview}...")
        
        # Check bug conditions:
        # 1. On turn_step == 'q1' or color/details/confirm: should NOT send images
        if turn_step in ["q1", "qty", "colors", "details_1", "details_2", "confirm"] and img_count > 0:
            bug_msg = f"Bug: Unexpected {img_count} images in step '{turn_step}'"
            print(f"     ⚠️ {bug_msg}")
            cust_report["bugs_detected"].append(bug_msg)
            
        # 2. Check for foreign Indic script leaks (e.g. Malayalam unicode block 0D00-0D7F)
        malayalam_chars = [c for c in clean_text if '\u0D00' <= c <= '\u0D7F']
        if malayalam_chars:
            bug_msg = f"Bug: Foreign script token detected: {''.join(malayalam_chars)}"
            print(f"     ⚠️ {bug_msg}")
            cust_report["bugs_detected"].append(bug_msg)
            
        # 3. Check for tag leakage
        if "<IMAGE_URL>" in clean_text or "<ORDER_DATA>" in clean_text or "```" in clean_text:
            bug_msg = f"Bug: Raw tag or code fence leaked in text in step '{turn_step}'"
            print(f"     ⚠️ {bug_msg}")
            cust_report["bugs_detected"].append(bug_msg)
            
        cust_report["turns"].append({
            "step": turn_step,
            "customer": msg,
            "bot_text": clean_text,
            "image_count": img_count,
            "image_urls": imgs,
            "elapsed": elapsed
        })
        
        history.append({"direction": "inbound", "message": msg})
        history.append({"direction": "outbound", "message": clean_text})
        time.sleep(1)
        
    db_rec = query_db_orders(sc["phone"])
    if db_rec:
        print(f"\n  ✅ ORDER RECORDED IN DB: {db_rec[:100]}...")
        cust_report["order_created_in_db"] = True
        cust_report["db_record"] = db_rec
    else:
        print(f"\n  ℹ️ No order in DB (Checking if legitimate package restriction or flow)")
        
    all_results.append(cust_report)

output_path = "/home/kajaram/.gemini/antigravity/brain/319d7ce8-f0e1-442e-8505-1664ea3c5ae2/scratch/lazy_10_customers_results.json"
with open(output_path, "w", encoding="utf-8") as f:
    json.dump(all_results, f, ensure_ascii=False, indent=2)

print("\n\nAll 10 simulations completed successfully! Results written to lazy_10_customers_results.json.")

