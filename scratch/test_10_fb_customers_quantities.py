#!/usr/bin/env python3
"""
Simulate 10 Facebook Ad Customers with varying quantities (1 to 10):
- Checks Facebook Ad first-turn entry point
- Checks image sending (bot attaches photos)
- Checks total calculation logic (packages vs single items + delivery fee)
- Checks order insertion in database and visibility for the dashboard
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

def fetch_order_from_db(order_phone):
    cmd = [
        "docker", "exec", "-i", "supabase-db", "psql", "-U", "postgres", "-d", "postgres", "-t", "-A", "-c",
        f"SELECT id, customer_name, customer_phone, customer_address, total_amount, payment_method, status FROM \"Binara_fashion\".orders WHERE user_id = '{USER_ID}' AND (customer_phone LIKE '%{order_phone[-9:]}%' OR whatsapp_phone LIKE '%{order_phone[-9:]}%') ORDER BY created_at DESC LIMIT 1;"
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    out = res.stdout.strip()
    if not out:
        return None
    parts = out.split("|")
    return {
        "id": parts[0],
        "customer_name": parts[1],
        "customer_phone": parts[2],
        "customer_address": parts[3],
        "total_amount": float(parts[4]),
        "payment_method": parts[5],
        "status": parts[6]
    }

customers = [
    {
        "id": 1,
        "qty": 1,
        "product": "Rib Jacquard Shorts (1 item)",
        "expected_total": 990.0, # 540 + 450 delivery
        "name": "Dilshan Jayasuriya",
        "phone": "94771000001",
        "turns": [
            "Can you tell me more about your ad?",
            "Mata Rib Jacquard eken 1 short ekak ganna puluwanda? Ina 32, pata 01.",
            "Dilshan Jayasuriya, 14/B Temple Road, Kalutara. 0771000001. Cash on delivery.",
            "Ow hari, order eka confirm karanna."
        ]
    },
    {
        "id": 2,
        "qty": 2,
        "product": "Kyela Brand Shorts (2 items)",
        "expected_total": 1450.0, # (2500/5)*2 = 1000 + 450 delivery
        "name": "Sanduni Fernando",
        "phone": "94771000002",
        "turns": [
            "Hi, I saw your Facebook ad for shorts",
            "Kyela shorts 2k ganna puluwanda? Ina 30. Pata 1 eken 1k, pata 2 eken 1k.",
            "Sanduni Fernando, No 25 Galle Road, Moratuwa. 0771000002. Cash on delivery.",
            "Ow mama confirm karanawa, danna."
        ]
    },
    {
        "id": 3,
        "qty": 3,
        "product": "SingleJersey Cotton 20\" (3 items)",
        "expected_total": 2437.5, # (2650/4)*3 = 1987.5 + 450 = 2437.5 (tolerance +-20)
        "name": "Malith Perera",
        "phone": "94771000003",
        "turns": [
            "Facebook ad eke thiyena shorts gana wisthara ewanna puluwanda?",
            "SingleJersey 20 inch eken 3k ganna ona. Ina 36. Pata 1, 2, 3.",
            "Malith Perera, 88 Lake Road, Kurunegala. 0771000003. Cash on delivery.",
            "Ow okkoma hari confirm karanna."
        ]
    },
    {
        "id": 4,
        "qty": 4,
        "product": "Popcorn 18\" Shorts (Pack of 4)",
        "expected_total": 2600.0, # 4-pack price, free delivery
        "name": "Nuwan Pradeep",
        "phone": "94771000004",
        "turns": [
            "Can you tell me more about your ad? Popcorn shorts ganna puluwanda?",
            "Popcorn 18 inch 4 pack eka danna. Ina 34. Pata 1, 2, 3, 4.",
            "Nuwan Pradeep, 101 Kandy Road, Gampaha. 0771000004. Bank transfer.",
            "Ow mama transfer karannam, order eka confirm karanna."
        ]
    },
    {
        "id": 5,
        "qty": 5,
        "product": "Rib Jacquard Shorts (Pack of 5)",
        "expected_total": 2700.0, # 5-pack price, free delivery
        "name": "Ishara Madushan",
        "phone": "94771000005",
        "turns": [
            "Can you tell me more about your ad?",
            "Rib Jacquard 5 pack eka gannawa. Ina 32. Pata 1, 2, 3, 4, 5.",
            "Ishara Madushan, 45 Hospital Road, Panadura. 0771000005. Cash on delivery.",
            "Ow details okkoma hari, confirm karanna."
        ]
    },
    {
        "id": 6,
        "qty": 6,
        "product": "Popcorn 16\" Shorts (6 items)",
        "expected_total": 3120.0, # (2600/5)*6 = 3120, free delivery
        "name": "Harsha Kumara",
        "phone": "94771000006",
        "turns": [
            "Ad eke thiyena popcorn 16 inch shorts eken 6k ganna puluwanda?",
            "Ina 32. Pata 1 eken 2k, pata 2, 3, 4, 5 eken 1 gane. Mulu ganana 6k.",
            "Harsha Kumara, 12 Station Road, Matara. 0771000006. Cash on delivery.",
            "Ow ehenam order eka confirm karanna."
        ]
    },
    {
        "id": 7,
        "qty": 7,
        "product": "Rib Jacquard Shorts (7 items)",
        "expected_total": 3780.0, # (2700/5)*7 = 3780, free delivery
        "name": "Danushka Senaviratne",
        "phone": "94771000007",
        "turns": [
            "Can you tell me more about your ad? Rib jacquard shorts ona",
            "Mata 7k ona. Ina 34. Pata 1 eken 3k, pata 2 eken 4k.",
            "Danushka Senaviratne, 55 Cross Street, Negombo. 0771000007. Cash on delivery.",
            "Ow mama confirm karanawa, danna."
        ]
    },
    {
        "id": 8,
        "qty": 8,
        "product": "Popcorn 18\" Shorts (8 items - Two 4-packs)",
        "expected_total": 5200.0, # 2600 * 2 = 5200, free delivery
        "name": "Ruwan Chamara",
        "phone": "94771000008",
        "turns": [
            "Ad eka dakka. Popcorn 18 inch shorts 8k ganna puluwanda?",
            "4 pack eken 2k, mulu ganana 8k. Ina 36. Pata 1, 2, 3, 4 eken 2 gane.",
            "Ruwan Chamara, 72 Peradeniya Road, Kandy. 0771000008. Bank transfer.",
            "Ow transfer karannam, order eka confirm karanna."
        ]
    },
    {
        "id": 9,
        "qty": 9,
        "product": "Kyela Brand Shorts (9 items)",
        "expected_total": 4500.0, # (2500/5)*9 = 4500, free delivery
        "name": "Chathura Jayawardena",
        "phone": "94771000009",
        "turns": [
            "Can you tell me more about your ad? Kyela shorts",
            "Kyela shorts 9k ganna puluwanda? Ina 38. Pata 1, 2, 3, 4, 5, 1, 2, 3, 4.",
            "Chathura Jayawardena, 33 High Level Road, Maharagama. 0771000009. Cash on delivery.",
            "Ow okkoma hari confirm karanna."
        ]
    },
    {
        "id": 10,
        "qty": 10,
        "product": "Rib Jacquard Shorts (10-pack Catalog Offer)",
        "expected_total": 5100.0, # 10 for 5100 catalog price, free delivery
        "name": "Samantha Wickramasinghe",
        "phone": "94771000010",
        "turns": [
            "Facebook ad eke thiyena 10 pack offer eka ganna ona",
            "Rib Jacquard 10 pack eka danna. Ina 34. Pata 1, 2, 3, 4, 5 eken 2 gane.",
            "Samantha Wickramasinghe, 22 Colombo Road, Kurunegala. 0771000010. Cash on delivery.",
            "Ow mama confirm karanawa, danna."
        ]
    }
]

def main():
    print("=" * 80)
    print("RUNNING 10 FACEBOOK AD CUSTOMERS SIMULATION (QUANTITIES 1 - 10)")
    print("=" * 80)

    results = []

    for cust in customers:
        print(f"\n[Customer {cust['id']}/10] {cust['name']} - Qty: {cust['qty']} | {cust['product']}")
        print("-" * 70)
        history = []
        all_sent_images = []
        turn_logs = []

        for turn_idx, user_msg in enumerate(cust["turns"]):
            print(f"  Customer [T{turn_idx+1}]: {user_msg}")
            t0 = time.time()
            resp = send_chat(cust["phone"], cust["name"], user_msg, history)
            elapsed = time.time() - t0

            bot_text = resp.get("response", resp.get("error", ""))
            image_urls = resp.get("imageUrls", [])
            if image_urls:
                all_sent_images.extend(image_urls)
                print(f"  Bot [T{turn_idx+1}] ({elapsed:.1f}s): Attached {len(image_urls)} images (First: {image_urls[0][:50]}...)")
            else:
                print(f"  Bot [T{turn_idx+1}] ({elapsed:.1f}s): {bot_text[:110]}...")

            history.append({"direction": "inbound", "message": user_msg})
            history.append({"direction": "outbound", "message": bot_text})
            turn_logs.append({
                "turn": turn_idx + 1,
                "user": user_msg,
                "bot": bot_text,
                "images": image_urls
            })
            time.sleep(0.5)

        # Check DB
        db_order = fetch_order_from_db(cust["phone"])
        
        # Evaluations
        has_images = len(all_sent_images) > 0
        order_in_db = db_order is not None
        
        total_ok = False
        calc_note = ""
        if order_in_db:
            actual_total = db_order["total_amount"]
            diff = abs(actual_total - cust["expected_total"])
            # Tolerance of 50 LKR for fractional unit price rounding
            if diff <= 50.0:
                total_ok = True
                calc_note = f"MATCH: LKR {actual_total:.2f} (Expected: ~{cust['expected_total']:.2f})"
            else:
                calc_note = f"MISMATCH: LKR {actual_total:.2f} vs Expected: ~{cust['expected_total']:.2f} (diff {diff:.2f})"
        else:
            calc_note = "NO ORDER SAVED IN DB"

        passed = has_images and order_in_db and total_ok

        print(f"\n  >> Results for Qty {cust['qty']}:")
        print(f"     • Images Sent: {'✅ YES (' + str(len(all_sent_images)) + ' images)' if has_images else '❌ NO'}")
        print(f"     • Visible in DB/Dashboard: {'✅ YES (Order ID: ' + db_order['id'][:8] + '...)' if order_in_db else '❌ NO'}")
        print(f"     • Total Calculation: {'✅ ' + calc_note if total_ok else '❌ ' + calc_note}")
        if order_in_db:
            print(f"     • DB Details: Name: {db_order['customer_name']} | Phone: {db_order['customer_phone']} | PM: {db_order['payment_method']} | Status: {db_order['status']}")

        results.append({
            "id": cust["id"],
            "qty": cust["qty"],
            "product": cust["product"],
            "customer_name": cust["name"],
            "phone": cust["phone"],
            "has_images": has_images,
            "images_count": len(all_sent_images),
            "order_in_db": order_in_db,
            "db_order": db_order,
            "expected_total": cust["expected_total"],
            "total_ok": total_ok,
            "calc_note": calc_note,
            "passed": passed,
            "turns": turn_logs
        })

    print("\n" + "=" * 80)
    print("10 FB CUSTOMER SIMULATION SUMMARY")
    print("=" * 80)
    passed_count = sum(1 for r in results if r["passed"])
    print(f"Total Passed: {passed_count}/10\n")

    for r in results:
        status_icon = "✅ PASS" if r["passed"] else "❌ FAIL"
        print(f"{status_icon} [Qty {r['qty']:2d}] {r['customer_name']} - {r['product']}")
        print(f"     Images: {r['images_count']} | Order Saved: {r['order_in_db']} | Total: {r['calc_note']}")

    with open("scratch/simulation_10_fb_results.json", "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print("\nFull turn-by-turn logs saved to scratch/simulation_10_fb_results.json")

if __name__ == "__main__":
    main()

