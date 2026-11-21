import urllib.request
import json
import time
import subprocess
import re

URL = "http://localhost:8000/functions/v1/ai-chat_Binara_Fashion"
USER_ID = "8ec761ff-b716-411b-85d2-1b56980d1e8a"
API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN1cGFiYXNlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTY4MDAwMDAwMCwiZXhwIjoxOTk1NTU2ODAwfQ.test"

def call_bot(phone, message, history):
    payload = {
        "userId": USER_ID,
        "phoneNumber": phone,
        "message": message,
        "conversationHistory": history,
        "sessionApiKey": "test_key",
        "senderName": "Real Customer"
    }
    req = urllib.request.Request(
        URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {API_KEY}"
        }
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))

def verify_db_order(phone, customer_phone):
    cmd = [
        "docker", "exec", "-i", "supabase-db", "psql", "-U", "postgres", "-d", "postgres", "-t", "-A", "-F", "|",
        "-c", f"SELECT id, customer_name, customer_phone, total_amount, payment_method, status FROM \"Binara_fashion\".orders WHERE whatsapp_phone = '{phone}' OR customer_phone LIKE '%{customer_phone[-7:]}%' ORDER BY created_at DESC LIMIT 1;"
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    out = res.stdout.strip()
    if not out:
        return None
    parts = out.split("|")
    return {
        "id": parts[0],
        "name": parts[1],
        "phone": parts[2],
        "total": float(parts[3]),
        "payment": parts[4],
        "status": parts[5]
    }

CUSTOMERS = [
    {
        "id": 1,
        "name": "Chalani Niwarthana",
        "phone": "94761000021",
        "t1_msg": "Can I learn more about your business?",
        "t2_msg": "අංක 3",
        "product_name": "පොප්කොන් ශෝර්ට් උස අගල් 16",
        "t3_msg": "5 pack ekak",
        "quantity": 5,
        "t4_msg": "1,2,3,9,13",
        "t5_msg": "චලනි නිවර්ථනා. බට අත ගෙදර හදුන්කටුව අගුණුකොළ පැලැස්ස. 0764936151",
        "customer_phone": "0764936151",
        "t6_msg": "විස්තර හරි",
        "expected_total": 2600,
        "expected_delivery": 0,
        "description": "Standard 5-pack Popcorn 16\" via Sinhala 'අංක 3' and dot-separated address"
    },
    {
        "id": 2,
        "name": "Shiwanthi Kaushalya",
        "phone": "94761000022",
        "t1_msg": "උස 18 විතර නැද්ද",
        "t2_msg": "4",
        "product_name": "පොප්කෝන්  ශෝර්ට් උස අගල්  18",
        "t3_msg": "මට 2ක් ගන්න පුළුවන්ද? මිල කීයද?",
        "quantity": 2,
        "t4_msg": "1, 2",
        "t5_msg": "ශිවන්ති කෞශල්‍යා අංක 231/A/1/1 මාඉබුල නිට්ටබුව 0716509779",
        "customer_phone": "0716509779",
        "t6_msg": "නිවැරදි",
        "expected_total": 1750,  # (2600 / 4) * 2 = 1300 + 450 delivery
        "expected_delivery": 450,
        "description": "Custom small quantity (2 items of Popcorn 18\") with delivery fee (under 5 items)"
    },
    {
        "id": 3,
        "name": "Dilini Wathsala",
        "phone": "94761000023",
        "t1_msg": "Kyele brand eken short thiyedq",
        "t2_msg": "2",
        "product_name": "Kyela Brand Single Jersey Cotton Shorts",
        "t3_msg": "mata 6k ona",
        "quantity": 6,
        "t4_msg": "4/8/10/11/12/1",
        "t5_msg": "දිලිනි වත්සලා\n145/4/ A දැලිවල හන්දෙස්ස\nමහනුවර\n0752001231",
        "customer_phone": "0752001231",
        "t6_msg": "හරි confirm කරන්න",
        "expected_total": 3000,  # 500 * 6 = 3000, free delivery (>= 5 items)
        "expected_delivery": 0,
        "description": "Custom quantity (6 items of Kyela), free delivery rule (>= 5 items)"
    },
    {
        "id": 4,
        "name": "Ganga Hansamali",
        "phone": "94761000024",
        "t1_msg": "රිබ් ශොට් වල විස්තර එවන්න",
        "t2_msg": "5",
        "product_name": "Rib Jacquard Shorts",
        "t3_msg": "10 pack eka ganna ona",
        "quantity": 10,
        "t4_msg": "1 2 3 4 5 6 7 8 9 10",
        "t5_msg": "Ganga hansamali champali mawata munhena maggona kalutara 0774782345",
        "customer_phone": "0774782345",
        "t6_msg": "ow okkoma hari",
        "expected_total": 5100,  # 10 pack offer price from description
        "expected_delivery": 0,
        "description": "10-pack package offer price for Rib Jacquard (5100 LKR)"
    },
    {
        "id": 5,
        "name": "Nuwan Pradeep",
        "phone": "94761000025",
        "t1_msg": "Can I learn more about your business?",
        "t2_msg": "1",
        "product_name": "SingleJersey Cotton උස අගල් 20",
        "t3_msg": "mata 3k one",
        "quantity": 3,
        "t4_msg": "1, 3, 4",
        "t5_msg": "Nuwan Pradeep, No 18, Lake Road, Kurunegala, 0718899001",
        "customer_phone": "0718899001",
        "t6_msg": "confirm",
        "expected_total": 2430,  # (2650 / 4 = ~660) * 3 = 1980 + 450 delivery
        "expected_delivery": 450,
        "description": "Custom quantity (3 items of SingleJersey 20\") with delivery fee (under 5 items)"
    }
]

def run_simulation():
    print("=" * 80)
    print("RUNNING 5 REALISTIC CUSTOMER TEST SUITE (CATCHING BUGS)")
    print("=" * 80)
    
    results = []
    
    for c in CUSTOMERS:
        print(f"\n[{c['id']}/5] Testing Customer: {c['name']} ({c['description']})")
        print("-" * 75)
        
        history = []
        c_passed = True
        bugs = []
        
        # Turn 1: Initial Inquiry
        t1_start = time.time()
        r1 = call_bot(c['phone'], c['t1_msg'], history)
        t1_time = round(time.time() - t1_start, 2)
        imgs1 = r1.get("imageUrls", [])
        
        if len(imgs1) > 0:
            print(f"  ❌ BUG Turn 1: Photos sent on initial inquiry! Count: {len(imgs1)}")
            bugs.append(f"Turn 1 photos sent: {len(imgs1)}")
            c_passed = False
        else:
            print(f"  ✅ PASS Turn 1 (Initial Inquiry) [{c['t1_msg']}] ({t1_time}s) -> 0 images")
        
        history.append({"direction": "inbound", "message": c['t1_msg']})
        history.append({
            "direction": "outbound",
            "message": r1.get("response"),
            "message_type": "text",
            "metadata": {"imageUrls": imgs1}
        })
        
        # Turn 2: Product Selection
        t2_start = time.time()
        r2 = call_bot(c['phone'], c['t2_msg'], history)
        t2_time = round(time.time() - t2_start, 2)
        imgs2 = r2.get("imageUrls", [])
        
        if len(imgs2) == 0:
            print(f"  ❌ BUG Turn 2: NO photos sent on product selection! Input: '{c['t2_msg']}'")
            bugs.append("Turn 2 missing photos on product selection")
            c_passed = False
        else:
            print(f"  ✅ PASS Turn 2 (Product Selection) [{c['t2_msg']}] ({t2_time}s) -> {len(imgs2)} images sent!")
        
        history.append({"direction": "inbound", "message": c['t2_msg']})
        history.append({
            "direction": "outbound",
            "message": r2.get("response"),
            "message_type": "image" if len(imgs2) > 0 else "text",
            "metadata": {"imageUrls": imgs2}
        })
        
        # Turn 3: Quantity Selection
        t3_start = time.time()
        r3 = call_bot(c['phone'], c['t3_msg'], history)
        t3_time = round(time.time() - t3_start, 2)
        imgs3 = r3.get("imageUrls", [])
        resp3 = r3.get("response", "")
        
        if len(imgs3) > 0:
            print(f"  ❌ BUG Turn 3: Image SPAM on quantity selection! Count: {len(imgs3)}")
            bugs.append("Turn 3 image spam on quantity")
            c_passed = False
        else:
            print(f"  ✅ PASS Turn 3 (Quantity Selection) [{c['t3_msg']}] ({t3_time}s) -> 0 images (no spam)")
            
        history.append({"direction": "inbound", "message": c['t3_msg']})
        history.append({
            "direction": "outbound",
            "message": resp3,
            "message_type": "text",
            "metadata": {"imageUrls": imgs3}
        })
        
        # Turn 4: Color Selection
        t4_start = time.time()
        r4 = call_bot(c['phone'], c['t4_msg'], history)
        t4_time = round(time.time() - t4_start, 2)
        imgs4 = r4.get("imageUrls", [])
        
        if len(imgs4) > 0:
            print(f"  ❌ BUG Turn 4: Image SPAM on color selection! Count: {len(imgs4)}")
            bugs.append("Turn 4 image spam on colors")
            c_passed = False
        else:
            print(f"  ✅ PASS Turn 4 (Color Selection) [{c['t4_msg']}] ({t4_time}s) -> 0 images (no spam)")
            
        history.append({"direction": "inbound", "message": c['t4_msg']})
        history.append({
            "direction": "outbound",
            "message": r4.get("response"),
            "message_type": "text",
            "metadata": {"imageUrls": imgs4}
        })
        
        # Turn 5: Address & Details
        t5_start = time.time()
        r5 = call_bot(c['phone'], c['t5_msg'], history)
        t5_time = round(time.time() - t5_start, 2)
        imgs5 = r5.get("imageUrls", [])
        resp5 = r5.get("response", "")
        
        if len(imgs5) > 0:
            print(f"  ❌ BUG Turn 5: Image SPAM on address turn! Count: {len(imgs5)}")
            bugs.append("Turn 5 image spam on address")
            c_passed = False
        else:
            print(f"  ✅ PASS Turn 5 (Address & Details) ({t5_time}s) -> 0 images")
            
        # Check pricing in summary
        print(f"       Summary Snippet: {resp5.replace(chr(10), ' ')[:120]}...")
        
        history.append({"direction": "inbound", "message": c['t5_msg']})
        history.append({
            "direction": "outbound",
            "message": resp5,
            "message_type": "text",
            "metadata": {"imageUrls": imgs5}
        })
        
        # Turn 6: Confirm
        t6_start = time.time()
        r6 = call_bot(c['phone'], c['t6_msg'], history)
        t6_time = round(time.time() - t6_start, 2)
        imgs6 = r6.get("imageUrls", [])
        
        if len(imgs6) > 0:
            print(f"  ❌ BUG Turn 6: Image SPAM on confirmation! Count: {len(imgs6)}")
            bugs.append("Turn 6 image spam on confirmation")
            c_passed = False
        else:
            print(f"  ✅ PASS Turn 6 (Confirmation) [{c['t6_msg']}] ({t6_time}s) -> 0 images")
            
        # Verify DB Order
        time.sleep(1)
        db_order = verify_db_order(c['phone'], c['customer_phone'])
        if not db_order:
            print(f"  ❌ BUG DB: Order was NOT saved in database!")
            bugs.append("DB order missing")
            c_passed = False
        else:
            actual_total = db_order['total']
            expected_total = float(c['expected_total'])
            # allow small rounding difference <= 50 LKR for custom unit price rounding
            diff = abs(actual_total - expected_total)
            if diff <= 50:
                print(f"  ✅ PASS DB Order Verified: Total LKR {actual_total} (Expected: ~{expected_total}), Payment: {db_order['payment']}, Status: {db_order['status']}")
            else:
                print(f"  ❌ BUG DB Order Total Mismatch: Got LKR {actual_total}, Expected LKR {expected_total} (Diff: {diff})")
                bugs.append(f"DB Total mismatch: got {actual_total}, expected {expected_total}")
                c_passed = False
                
        results.append({
            "customer_id": c['id'],
            "name": c['name'],
            "passed": c_passed,
            "bugs": bugs
        })
        
    print("\n" + "=" * 80)
    print("SIMULATION SUMMARY")
    print("=" * 80)
    all_ok = True
    for res in results:
        status_str = "✅ ALL PASSED" if res['passed'] else f"❌ BUGS: {', '.join(res['bugs'])}"
        print(f"Customer {res['customer_id']} ({res['name']}): {status_str}")
        if not res['passed']:
            all_ok = False
            
    if all_ok:
        print("\n🎉 ALL 5 CUSTOMERS PASSED WITH ZERO BUGS DETECTED!")
    else:
        print("\n⚠️ SOME BUGS WERE CAUGHT - INVESTIGATING...")

if __name__ == "__main__":
    run_simulation()
