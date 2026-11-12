#!/usr/bin/env python3
"""
Test Suite: 10 Comprehensive Human Ordering Scenarios
Tests every situation:
- Products: Rib Jacquard, SingleJersey 20", Popcorn 16", Popcorn 18", Kyela Brand
- Quantities: Below 3 (1, 2 shorts), Below 10 (4, 5 shorts), Above 10 (10, 12, 20 shorts)
- Single item order acceptance (No refusal)
- All images sent on initial inquiry & photo requests
- Zero image spam on questions, color selection, details, confirmation
- Total calculation accuracy (Proportional unit price + 450 delivery for <5; Free delivery for packages)
- Complete database order verification in "Binara_fashion".orders
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
        return {"response": f"ERROR {e.code}: {err_body}", "imageUrls": []}
    except Exception as e:
        return {"response": f"ERROR: {e}", "imageUrls": []}

def query_db_orders(phone):
    cmd = [
        "docker", "exec", "supabase-db", "psql", "-U", "postgres", "-d", "postgres",
        "-t", "-A", "-c",
        f"SELECT id, customer_name, customer_phone, total_amount, payment_method, status, order_items FROM \"Binara_fashion\".orders WHERE customer_phone = '{phone}' ORDER BY created_at DESC LIMIT 1;"
    ]
    res = subprocess.run(cmd, stdout=subprocess.PIPE, text=True)
    out = res.stdout.strip()
    return out if out else None

# Clean prior test numbers
subprocess.run([
    "docker", "exec", "supabase-db", "psql", "-U", "postgres", "-d", "postgres",
    "-c", "DELETE FROM \"Binara_fashion\".orders WHERE customer_phone LIKE '07150000%';"
], stdout=subprocess.PIPE, stderr=subprocess.PIPE)

SCENARIOS = [
    {
        "id": 1,
        "name": "Nuwan Perera",
        "phone": "0715000001",
        "product": "Rib Jacquard Shorts",
        "bracket": "Below 3 (2 shorts)",
        "expected_subtotal": 1080.0,
        "expected_delivery": 450.0,
        "expected_total": 1530.0,
        "expected_images_count": 10,
        "turns": [
            ("inquiry", "Meka dakka FB ad eke. Rib jacquard shorts 2k witharak ganna puluwanda? Price keeyada?"),
            ("q1", "Galle walata delivery charge kochcharada? Awulak unoth staff contact ekak thiyeda?"),
            ("mid_images", "Elama, mata ganna kalin meke photos and colors tika ewanna puluwanda?"),
            ("colors", "Hari mata pata 01 eken 1i pata 02 eken 1i danna. Ina 32."),
            ("details", "Nuwan Perera, No 45, Wakwella Road, Galle. Phone 0715000001. Cash on delivery danna."),
            ("confirm", "Ow wisthara hari, order eka danna.")
        ]
    },
    {
        "id": 2,
        "name": "Shanika Silva",
        "phone": "0715000002",
        "product": "SingleJersey Cotton උස අගල් 20",
        "bracket": "Below 3 (1 short - Single Piece)",
        "expected_subtotal": 662.5,
        "expected_delivery": 450.0,
        "expected_total": 1112.5,
        "expected_images_count": 8,
        "turns": [
            ("inquiry", "සුබ දවසක්. මම FB ad එක දැක්කා. මගේ මහත්තයට SingleJersey 20 inch short 1ක් ගන්න පුළුවන්ද?"),
            ("q1", "හෝදනකොට පාට බහිනවද? ප්‍රමාණය හරි ගියේ නැතිනම් මාරු කරන්න පුළුවන්ද?"),
            ("mid_images", "කරුණාකර තියෙන පාට වල photos ටිකක් එවන්න පුළුවන්ද?"),
            ("colors", "හොඳයි, මට ඉණ 34 සඳහා නිල් පාටින් (පාට 01) එක කලිසමක් ඇණවුම් කරන්න."),
            ("details", "ශානිකා සිල්වා, අංක 12, පන්සල පාර, මහරගම. දුරකථනය 0715000002. බැංකු මාරුවක් මගින් ගෙවන්නම්."),
            ("confirm", "ඔව් සියලු විස්තර නිවැරදියි, කරුණාකර ඇණවුම භාරගන්න.")
        ]
    },
    {
        "id": 3,
        "name": "Duminda Rathnayake",
        "phone": "0715000003",
        "product": "පොප්කෝන්  ශෝර්ට් උස අගල්  18",
        "bracket": "Below 3 (2 shorts)",
        "expected_subtotal": 1300.0,
        "expected_delivery": 450.0,
        "expected_total": 1750.0,
        "expected_images_count": 9,
        "turns": [
            ("inquiry", "FB ad eke thibba 18 popcorn shorts 2k ganna puluwanda? Ganana keeyada?"),
            ("q1", "Kurunegala ta dawas keeyenda enne? Quality eka hodada?"),
            ("mid_images", "Poddak inna, ganna kalin photos tikak ewanna balanna."),
            ("colors", "Hari ehenam pata 01 eken 1i pata 03 eken 1i danna. Ina 32."),
            ("details", "Duminda Rathnayake, 88 Colombo Road, Kurunegala. 0715000003. Cash on delivery."),
            ("confirm", "Ow hari details okkoma hari order eka confirm karanna.")
        ]
    },
    {
        "id": 4,
        "name": "Malsha Fernando",
        "phone": "0715000004",
        "product": "Kyela Brand Single Jersey Cotton Shorts",
        "bracket": "Below 10 (5 shorts - Standard 5-pack)",
        "expected_subtotal": 2500.0,
        "expected_delivery": 0.0,
        "expected_total": 2500.0,
        "expected_images_count": 12,
        "turns": [
            ("inquiry", "Hello, I saw your ad on Facebook for Kyela brand shorts. Can I order the 5 pack? What is the total?"),
            ("q1", "Is delivery free to Colombo? Can I get your staff contact number in case of any issue?"),
            ("mid_images", "Could you please send me photos of the available colours?"),
            ("colors", "Great, I will take waist 30. Colours 01, 02, 03, 04, and 05 (one of each)."),
            ("details", "Malsha Fernando, 14/2 Alfred House Gardens, Colombo 03. Phone 0715000004. Cash on delivery please."),
            ("confirm", "Yes all details are correct. Please place my order.")
        ]
    },
    {
        "id": 5,
        "name": "Chamara Weerasinghe",
        "phone": "0715000005",
        "product": "SingleJersey Cotton උස අගල් 20",
        "bracket": "Below 10 (4 shorts - Standard 4-pack)",
        "expected_subtotal": 2650.0,
        "expected_delivery": 0.0,
        "expected_total": 2650.0,
        "expected_images_count": 8,
        "turns": [
            ("inquiry", "Bro ad eka dakka FB eke. 20 inch single jersey short 4 pack eka thiyeda? Keeyada wenne?"),
            ("q1", "Kandy walata deliver charges thiyenawada? Bank transfer puluwanda?"),
            ("mid_images", "Elakiri, pata tika balanna photos ewanna puluwanda?"),
            ("colors", "Size 32 free size neda. Pata 1, 2, 3, 4 eken 1 gaane danna."),
            ("details", "Chamara Weerasinghe, No 25 Peradeniya Road, Kandy. Phone 0715000005. Bank transfer karannam."),
            ("confirm", "Ow okkoma hari machan order eka danna.")
        ]
    },
    {
        "id": 6,
        "name": "Dilrukshi Alahakoon",
        "phone": "0715000006",
        "product": "පොප්කොන් ශෝර්ට්ස් උස අගල් 16",
        "bracket": "Below 10 (5 shorts - Standard 5-pack)",
        "expected_subtotal": 2600.0,
        "expected_delivery": 0.0,
        "expected_total": 2600.0,
        "expected_images_count": 12,
        "turns": [
            ("inquiry", "හායි, මම මේ දැන්වීම ෆේස්බුක් එකෙන් දැක්කේ. අඟල් 16 පොප්කොන් ශෝර්ට්ස් 5ක් ගන්න පුළුවන්ද? ගාන කීයද?"),
            ("q1", "මේවට ඩිලිවරි ගාස්තු අය වෙනවද? ඉන රබර් පටිය හොඳට ඇදෙනවද?"),
            ("mid_images", "අනේ මට බලන්න මේ ශෝර්ට්ස් වල පින්තූර ටිකක් එවන්නකෝ."),
            ("colors", "පාට අංක 01, 02, 03, 04, 05 එක බැගින් දාන්න. ඉන 30."),
            ("details", "දිල්රුක්ෂි අලහකෝන්, අංක 45, නුවර පාර, ගම්පහ. 0715000006. Cash on delivery."),
            ("confirm", "ඔව් සියලු විස්තර හරි, කරුණාකර ඇණවුම එවන්න.")
        ]
    },
    {
        "id": 7,
        "name": "Rohan Jayawardena",
        "phone": "0715000007",
        "product": "Rib Jacquard Shorts",
        "bracket": "Below 10 (5 shorts - Standard 5-pack)",
        "expected_subtotal": 2700.0,
        "expected_delivery": 0.0,
        "expected_total": 2700.0,
        "expected_images_count": 10,
        "turns": [
            ("inquiry", "Rib jacquard 5 pack price keeyada? FB ad eka dakala awe."),
            ("q1", "Negombo walata delivery fee thiyeda? Dawas keeyen deliver wenawada?"),
            ("mid_images", "Photos tika ewanna balanna."),
            ("colors", "Pata 1, 2, 3, 4, 5. Size 34."),
            ("details", "Rohan Jayawardena, 55 Beach Road, Negombo. 0715000007. COD danna."),
            ("confirm", "Hari order eka confirm karanna.")
        ]
    },
    {
        "id": 8,
        "name": "Asanka Bandara",
        "phone": "0715000008",
        "product": "Kyela Brand Single Jersey Cotton Shorts",
        "bracket": "Above 10 (10 shorts - Standard 10-pack)",
        "expected_subtotal": 4500.0,
        "expected_delivery": 0.0,
        "expected_total": 4500.0,
        "expected_images_count": 12,
        "turns": [
            ("inquiry", "Kyela brand short 10k ganna one team ekata. FB offer eka thiyeda? Price keeyada?"),
            ("q1", "Bank transfer karanna puluwanda? 10 shorts walata delivery free neda?"),
            ("mid_images", "Pata tika thora ganna photos tika ewanna puluwanda?"),
            ("colors", "Pata 01 eken 5i, pata 02 eken 5i. Ina 32-34 free size neda."),
            ("details", "Asanka Bandara, MAS Fabric Park, Thulhiriya. Phone 0715000008. Bank transfer karannam."),
            ("confirm", "Ow okkoma details hari, please confirm order.")
        ]
    },
    {
        "id": 9,
        "name": "Samantha Karunaratne",
        "phone": "0715000009",
        "product": "පොප්කෝන්  ශෝර්ට් උස අගල්  18",
        "bracket": "Above 10 (12 shorts - 3 x 4-pack)",
        "expected_subtotal": 7800.0,
        "expected_delivery": 0.0,
        "expected_total": 7800.0,
        "expected_images_count": 9,
        "turns": [
            ("inquiry", "FB ad eke thiyena 18 inch popcorn shorts 12k ganna puluwanda? 12 ta price eka keeyada?"),
            ("q1", "Matara ta delivery free da? Awulak unoth staff contact eka kaageda?"),
            ("mid_images", "Mata hodata balanna images tika ewanna me dan."),
            ("colors", "Hari mata 12 pack eka danna. Ina 38. Pata 01 eken 4i, pata 02 eken 4i, pata 03 eken 4i."),
            ("details", "Samantha Karunaratne, 99 Main Street, Matara. 0715000009. Cash on delivery."),
            ("confirm", "Ow mage details okkoma hari, ewanna.")
        ]
    },
    {
        "id": 10,
        "name": "Priyantha Jayasundara",
        "phone": "0715000010",
        "product": "SingleJersey Cotton උස අගල් 20",
        "bracket": "Above 10 (20 shorts - 2 x 10-pack)",
        "expected_subtotal": 12400.0,
        "expected_delivery": 0.0,
        "expected_total": 12400.0,
        "expected_images_count": 8,
        "turns": [
            ("inquiry", "Good evening! Ape boys hostel ekata FB ad eka dakala 20 inch SingleJersey shorts 20k ganna one. 20k ganna puluwanda? Total eka keeyada?"),
            ("q1", "Bank transfer puluwanda? Delivery charge ekak thiyenawada 20 shorts walata?"),
            ("mid_images", "Hostel eke ayata pennanna photos tika ewanna puluwanda karunakara?"),
            ("colors", "Niyamai, api 20 gannawa. Ina 32-34 free size neda. Pata 01 eken 10i, pata 02 eken 10i."),
            ("details", "Priyantha Jayasundara, Royal Hostel, Rajagiriya. Phone 0715000010. Bank transfer karannam."),
            ("confirm", "Ow okkoma wisthara hari, please confirm order.")
        ]
    }
]

print("=" * 70)
print("STARTING 10 REALISTIC HUMAN ORDERING SCENARIOS")
print("=" * 70)

all_results = []

for sc in SCENARIOS:
    print(f"\n{'='*70}")
    print(f"CUSTOMER {sc['id']}: {sc['name']} ({sc['phone']})")
    print(f"Product: {sc['product']} | Bracket: {sc['bracket']}")
    print(f"Expected: Total LKR {sc['expected_total']} | Images: {sc['expected_images_count']}")
    print(f"{'='*70}\n")
    
    history = []
    cust_report = {
        "id": sc["id"],
        "name": sc["name"],
        "phone": sc["phone"],
        "product": sc["product"],
        "bracket": sc["bracket"],
        "expected_total": sc["expected_total"],
        "expected_images": sc["expected_images_count"],
        "turns": [],
        "order_created": False,
        "db_record": None,
        "summary_total": None,
        "bugs": []
    }
    
    for step_name, msg in sc["turns"]:
        print(f"[{step_name}] Customer: \"{msg}\"")
        t0 = time.time()
        resp_data = send_chat(sc["phone"], sc["name"], msg, history)
        elapsed = round(time.time() - t0, 2)
        
        reply = resp_data.get("response", "")
        imgs = resp_data.get("imageUrls", [])
        img_count = len(imgs)
        
        preview = reply[:140].replace("\n", " ")
        print(f"  🤖 Bot ({elapsed}s, {img_count} imgs): {preview}...")
        
        # Turn checks:
        if step_name == "inquiry":
            if img_count != sc["expected_images_count"]:
                b = f"Turn inquiry: Expected {sc['expected_images_count']} images, got {img_count}"
                print(f"     ⚠️ {b}")
                cust_report["bugs"].append(b)
        elif step_name == "q1":
            if img_count > 0:
                b = f"Turn q1: Expected 0 images on follow-up question, got {img_count}"
                print(f"     ⚠️ {b}")
                cust_report["bugs"].append(b)
        elif step_name == "mid_images":
            if img_count != sc["expected_images_count"]:
                b = f"Turn mid_images: Expected {sc['expected_images_count']} images, got {img_count}"
                print(f"     ⚠️ {b}")
                cust_report["bugs"].append(b)
        elif step_name in ["colors", "details", "confirm"]:
            if img_count > 0:
                b = f"Turn {step_name}: Unexpected {img_count} images during order checkout"
                print(f"     ⚠️ {b}")
                cust_report["bugs"].append(b)
                
        # Check if this turn contains an order summary
        if "සාරාංශය" in reply or "මුළු" in reply or "Total" in reply:
            cust_report["summary_turn"] = reply
            
        history.append({"direction": "inbound", "message": msg})
        history.append({"direction": "outbound", "message": reply})
        cust_report["turns"].append({
            "step": step_name,
            "customer": msg,
            "bot_reply": reply,
            "image_count": img_count,
            "elapsed": elapsed
        })
        time.sleep(1)
        
    db_rec = query_db_orders(sc["phone"])
    if db_rec:
        cust_report["order_created"] = True
        cust_report["db_record"] = db_rec
        parts = db_rec.split("|")
        db_total = float(parts[3]) if len(parts) > 3 else 0.0
        cust_report["db_total"] = db_total
        print(f"\n  ✅ ORDER SAVED IN DB: LKR {db_total} (Expected: LKR {sc['expected_total']})")
        if abs(db_total - sc["expected_total"]) > 2.0:
            b = f"Total Mismatch: Expected LKR {sc['expected_total']}, but DB saved LKR {db_total}"
            print(f"     ❌ {b}")
            cust_report["bugs"].append(b)
        else:
            print(f"     🎯 TOTAL AMOUNT MATCHES 100%!")
    else:
        b = "Order was NOT created in DB!"
        print(f"\n  ❌ {b}")
        cust_report["bugs"].append(b)
        
    all_results.append(cust_report)

output_file = "/home/kajaram/.gemini/antigravity/brain/319d7ce8-f0e1-442e-8505-1664ea3c5ae2/scratch/human_10_tests_results.json"
with open(output_file, "w", encoding="utf-8") as f:
    json.dump(all_results, f, ensure_ascii=False, indent=2)

print("\n" + "=" * 70)
print(f"All 10 Human Ordering Tests Complete! Results written to {output_file}")
print("=" * 70)

