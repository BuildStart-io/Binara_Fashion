#!/usr/bin/env python3
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

def query_db_orders(phone_number):
    cmd = [
        "docker", "exec", "-i", "supabase-db", "psql", "-U", "postgres", "-d", "postgres", "-t", "-A", "-c",
        f"SELECT id, customer_name, customer_phone, total_amount, payment_method, status, order_items FROM \"Binara_fashion\".orders WHERE customer_phone LIKE '%{phone_number[-9:]}%' ORDER BY created_at DESC LIMIT 1;"
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    return res.stdout.strip()

scenarios = [
    {
        "customer_id": 1,
        "name": "Nuwan Perera",
        "phone": "94711111111",
        "product_target": "Rib Jacquard Shorts",
        "steps": [
            ("ask_product", "Rib Jacquard shorts gawa thiyenawada? Photos and details ewanna puluwanda?"),
            ("random_q1", "Credit card installments thiyenawada? Galle walata deliver karanna puluwanda?"),
            ("random_q2", "Mata staff eke WhatsApp number eka denna puluwanda?"),
            ("ask_images_again", "Ane mata ayeth Rib Jacquard shorts wala photos tika ewanna puluwanda? Mata fabric eka bala ganna one."),
            ("place_order", "Mama 5 shorts pack eka gannawa, ina 34. Pata 01, 02, 03, 04, 05 eken eka gane."),
            ("send_details", "Nuwan Perera, No 12 Galle Road, Galle. Phone 0711111111. Cash on delivery danna."),
            ("confirm_order", "Ow details serama hari, order eka danna!")
        ]
    },
    {
        "customer_id": 2,
        "name": "Fathima Rizwan",
        "phone": "94772222222",
        "product_target": "පොප්කෝන් ශෝර්ට් උස අගල් 18",
        "steps": [
            ("ask_product", "අඟල් 18 පොප්කෝන් ශෝර්ට් තියෙනවද? පින්තූර එවන්න පුළුවන්ද?"),
            ("random_q1", "යාපනයට ඩිලිවරි කරනවද? සයිස් හරි ගියේ නැත්නම් මාරු කරන්න පුළුවන්ද?"),
            ("random_q2", "කඩේ අයිතිකාරයා කවුද? ඔයාලගේ ෂොප් එක තියෙන්නේ කොහෙද?"),
            ("ask_images_again", "පොඩ්ඩක් ඉන්න, මගේ වට්ස්ඇප් එකෙන් ෆොටෝ මැකුණා. අඟල් 18 පොප්කෝන් පින්තූර ටික ආයෙත් එවන්නකෝ!"),
            ("place_order", "හරි මට ශෝර්ට් 4 පැකේජ් එක දාන්න. ඉන 30. පාට 01, 02, 03, 04."),
            ("send_details", "නම ෆාතිමා රිස්වාන්, අංක 15, ප්‍රධාන වීදිය, යාපනය. දුරකථන 0772222222. COD."),
            ("confirm_order", "ඔව් විස්තර හරි, ඕඩර් එක තහවුරු කරන්න!")
        ]
    },
    {
        "customer_id": 3,
        "name": "Saman Kumara",
        "phone": "94783333333",
        "product_target": "SingleJersey Cotton උස අගල් 20",
        "steps": [
            ("ask_product", "SingleJersey Cotton උස අගල් 20 shorts ganna one. Photos ewanna."),
            ("random_q1", "Mata eka short ekak witharak ganna puluwanda? Delivery fee eka keeyada?"),
            ("random_q2", "Bank transfer walin gewanna puluwanda? Account details monawada?"),
            ("ask_images_again", "Gewanna kalin 20 inch SingleJersey shorts wala images serama ayeth ewanna."),
            ("place_order", "Hari mama 4 pack eka gannawa. Ina 36. Pata 01 eken 2k, pata 02 eken 2k."),
            ("send_details", "Saman Kumara, No 88 Lake Round, Kurunegala. Phone 0783333333. Bank transfer."),
            ("confirm_order", "Ow mama bank transfer karannam, order eka confirm karanna.")
        ]
    },
    {
        "customer_id": 4,
        "name": "Ashan Bandara",
        "phone": "94754444444",
        "product_target": "Kyela Brand Single Jersey Cotton Shorts",
        "steps": [
            ("ask_product", "Kyela Brand Single Jersey Cotton Shorts wala photos balanna ona."),
            ("random_q1", "Oyala gawa ladies frock hari podi lamainta adum hari thiyenawada?"),
            ("random_q2", "Mata staff kenekta urgent call ekak ganna puluwanda? Number eka denna."),
            ("ask_images_again", "Kyela brand eke pictures ayeth ewanna puluwanda? Ina 44 thiyenawada?"),
            ("place_order", "Ina 38 ta 10 pack eka danna. Pata 01 eken 5k, pata 02 eken 5k."),
            ("send_details", "Ashan Bandara, 45/2 Peradeniya Road, Kandy. 0754444444. Cash on delivery."),
            ("confirm_order", "Ow harima hari, order eka submit karanna!")
        ]
    },
    {
        "customer_id": 5,
        "name": "Dilani Jayawardena",
        "phone": "94705555555",
        "product_target": "පොප්කොන් ශෝර්ට් උස අගල් 16",
        "steps": [
            ("ask_product", "පොප්කොන් ශෝර්ට් උස අගල් 16 පින්තූර සහ විස්තර එවන්න."),
            ("random_q1", "රෙදි හෝදනකොට පාට යනවද? හෝදලා ඇකිලෙනවද?"),
            ("random_q2", "ඕඩර් එක දැම්මට පස්සේ ඇඩ්‍රස් එක වෙනස් කරන්න පුළුවන්ද?"),
            ("ask_images_again", "කරුණාකරලා අඟල් 16 ශෝර්ට් වල පින්තූර ආයෙත් එවන්න."),
            ("place_order", "මට ශෝර්ට් 05 පැකේජ් එක දාන්න. ඉන 28. පාට 01, 02, 03, 04, 05."),
            ("send_details", "දිලානි ජයවර්ධන, 77 මීගමුව පාර, මීගමුව. 0705555555. Cash on delivery."),
            ("confirm_order", "ඔව් සියලු විස්තර නිවැරදියි, ඕඩර් එක දාන්න.")
        ]
    }
]

all_results = []

for sc in scenarios:
    print(f"\n=======================================================")
    print(f"STARTING SIMULATION FOR CUSTOMER {sc['customer_id']}: {sc['name']} ({sc['phone']})")
    print(f"Target Product: {sc['product_target']}")
    print(f"=======================================================")
    
    history = []
    cust_report = {
        "customer_id": sc["customer_id"],
        "name": sc["name"],
        "phone": sc["phone"],
        "product": sc["product_target"],
        "turns": [],
        "bugs_detected": [],
        "order_created_in_db": False,
        "db_record": None
    }
    
    for step_label, msg in sc["steps"]:
        print(f"\n[Turn: {step_label}] Customer: {msg}")
        t0 = time.time()
        resp = send_chat(sc["phone"], sc["name"], msg, history)
        elapsed = round(time.time() - t0, 2)
        
        if "error" in resp:
            print(f"  ❌ ERROR: {resp['error']}")
            cust_report["bugs_detected"].append(f"API Error at turn '{step_label}': {resp['error']}")
            turn_info = {
                "step": step_label,
                "customer": msg,
                "error": resp["error"],
                "elapsed": elapsed
            }
            cust_report["turns"].append(turn_info)
            continue
            
        clean_text = resp.get("response", "")
        img_urls = resp.get("imageUrls", [])
        img_url = resp.get("imageUrl")
        
        print(f"  🤖 Bot ({elapsed}s, {len(img_urls)} images): {clean_text[:120]}...")
        if img_urls:
            print(f"     Image count: {len(img_urls)} | First image: {img_urls[0][:80]}...")
            
        # BUG CHECK 1: Leaked tags in clean_text
        leaked_tags = []
        for tag in ["<IMAGE_URL>", "</IMAGE_URL>", "<ORDER_JSON>", "</ORDER_JSON>", "<VIDEO_URL>", "<USED_FAQS>", "[FAQ_ID:"]:
            if tag in clean_text:
                leaked_tags.append(tag)
        if leaked_tags:
            bug_msg = f"Turn '{step_label}': Raw system tags leaked in visible response: {leaked_tags}"
            print(f"  ⚠️ BUG DETECTED: {bug_msg}")
            cust_report["bugs_detected"].append(bug_msg)
            
        # BUG CHECK 2: Raw JSON leaking in clean_text
        if "{" in clean_text and '"customer_name"' in clean_text:
            bug_msg = f"Turn '{step_label}': Raw Order JSON leaked in visible response"
            print(f"  ⚠️ BUG DETECTED: {bug_msg}")
            cust_report["bugs_detected"].append(bug_msg)
            
        # BUG CHECK 3: Images requested but empty
        if step_label in ["ask_product", "ask_images_again"]:
            if len(img_urls) == 0:
                bug_msg = f"Turn '{step_label}': Customer requested images but bot returned 0 images!"
                print(f"  ⚠️ BUG DETECTED: {bug_msg}")
                cust_report["bugs_detected"].append(bug_msg)
            else:
                print(f"  ✅ Images successfully returned: {len(img_urls)} URLs")
                
        # BUG CHECK 4: Hallucinated staff phone number
        if "07" in clean_text or "94" in clean_text:
            # Check if phone numbers other than 0761122620, 94761122620, or the customer's own phone number appear
            words = clean_text.replace("\n", " ").split()
            for w in words:
                cleaned_w = "".join([c for c in w if c.isdigit()])
                if len(cleaned_w) >= 9:
                    if cleaned_w not in ["0761122620", "94761122620", sc["phone"], sc["phone"][2:], "0" + sc["phone"][2:]]:
                        bug_msg = f"Turn '{step_label}': Potential hallucinated or unauthorized phone number in text: {cleaned_w}"
                        print(f"  ⚠️ WARNING / POTENTIAL BUG: {bug_msg}")
                        cust_report["bugs_detected"].append(bug_msg)
                        
        turn_info = {
            "step": step_label,
            "customer": msg,
            "bot_text": clean_text,
            "image_count": len(img_urls),
            "image_urls": img_urls,
            "elapsed": elapsed
        }
        cust_report["turns"].append(turn_info)
        
        # Append to conversation history
        history.append({"direction": "inbound", "message": msg, "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ")})
        history.append({"direction": "outbound", "message": clean_text, "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ")})
        
        # Brief pause between turns
        time.sleep(1)
        
    # Check database for order
    db_rec = query_db_orders(sc["phone"])
    if db_rec:
        cust_report["order_created_in_db"] = True
        cust_report["db_record"] = db_rec
        print(f"\n  ✅ ORDER VERIFIED IN DB for {sc['name']}: {db_rec[:100]}...")
    else:
        print(f"\n  ❌ NO ORDER FOUND IN DB for {sc['name']} ({sc['phone']})!")
        cust_report["bugs_detected"].append("Order was confirmed by customer, but NO order record was created in 'Binara_fashion.orders' database!")
        
    all_results.append(cust_report)

# Save full results as JSON
with open("/home/kajaram/.gemini/antigravity/brain/319d7ce8-f0e1-442e-8505-1664ea3c5ae2/scratch/simulation_results.json", "w", encoding="utf-8") as f:
    json.dump(all_results, f, ensure_ascii=False, indent=2)

print("\n\nAll 5 simulations completed. Results saved to simulation_results.json.")

