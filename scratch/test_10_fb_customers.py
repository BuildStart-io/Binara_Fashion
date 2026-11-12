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

def query_db_orders(phone):
    clean_phone = phone
    if phone.startswith("94"):
        clean_phone = "0" + phone[2:]
    sql = f"""SELECT id, customer_name, customer_phone, total_amount, payment_method, status, order_items FROM "Binara_fashion".orders WHERE customer_phone IN ('{phone}', '{clean_phone}') ORDER BY created_at DESC LIMIT 1;"""
    cmd = ["docker", "exec", "supabase-db", "psql", "-U", "postgres", "-d", "postgres", "-t", "-A", "-c", sql]
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    return res.stdout.strip()

scenarios = [
    {
        "customer_id": 1,
        "name": "Kasun Dissanayake",
        "phone": "94711000001",
        "style": "Casual Singlish ('machan', 'elama')",
        "category": "Below 3 (2 shorts)",
        "product_target": "Rib Jacquard Shorts",
        "intended_qty": 2,
        "steps": [
            ("fb_ad_inquiry", "Meka dakka FB ad eke. Rib Jacquard shorts 2k witharak ganna puluwanda machan? Price keeyada?"),
            ("random_q1", "Galle walata deliver wenna kochchara kal yanawada? Awulak unoth staff ekata katha karanna puluwan number ekak thiyeda?"),
            ("mid_images_request", "Elama, mata ganna kalin meke photos and colors tika ewanna puluwanda machan?"),
            ("place_order", "Hari machan, mata pata 01 eken ekai pata 02 eken ekai danna. Size 34."),
            ("send_details", "Kasun Dissanayake, No 45, Wakwella Road, Galle. Phone 0711000001. Cash on delivery danna."),
            ("confirm_order", "Ow machan wisthara hari, order eka danna.")
        ]
    },
    {
        "customer_id": 2,
        "name": "Rohini Senanayake",
        "phone": "94711000002",
        "style": "Formal & Respectful Sinhala ('සුබ දවසක්', 'කරුණාකර')",
        "category": "Below 3 (1 short)",
        "product_target": "SingleJersey Cotton උස අගල් 20",
        "intended_qty": 1,
        "steps": [
            ("fb_ad_inquiry", "සුබ දවසක්. මම ඔබගේ ෆේස්බුක් දැන්වීම දුටුවා. මගේ පුතාට අඟල් 20 SingleJersey Cotton ශෝර්ට්ස් එකක් පමණක් මිලදී ගත හැකිද? මිල කීයද?"),
            ("random_q1", "මේ රෙදි හෝදන විට සායම් යනවාද නැතිනම් ඇකිලෙනවාද? ඒ වගේම ප්‍රමාණය හරි ගියේ නැතිනම් මාරු කළ හැකිද?"),
            ("mid_images_request", "කරුණාකර එම කලිසම්වල පැහැදිලි ඡායාරූප කිහිපයක් මෙහි එවිය හැකිද?"),
            ("place_order", "හොඳයි, මට ඉණ ප්‍රමාණය 32 සඳහා නිල් පාටින් (පාට 01) එක් කලිසමක් ඇණවුම් කිරීමට අවශ්‍යයි."),
            ("send_details", "රෝහිණී සේනානායක, අංක 12/A, පන්සල පාර, මහරගම. දුරකථන අංකය 0711000002. බැංකු මාරුවක් මගින් ගෙවන්නම්."),
            ("confirm_order", "ඔව් සියලු විස්තර නිවැරදියි, කරුණාකර ඇණවුම භාරගන්න.")
        ]
    },
    {
        "customer_id": 3,
        "name": "Tharindu Madushanka",
        "phone": "94711000003",
        "style": "Short & Quick Colloquial Sinhala",
        "category": "Below 3 (2 shorts)",
        "product_target": "පොප්කෝන්  ශෝර්ට් උස අගල්  18",
        "intended_qty": 2,
        "steps": [
            ("fb_ad_inquiry", "FB ad eke thibba 18 popcorn shorts 2k ganna puluwanda? Ganana keeyada?"),
            ("random_q1", "Kurunegala ta delivery charges keeyada? Dawas keeyenda enne?"),
            ("mid_images_request", "Poddak inna, ganna kalin photos tikak ewanna balanna."),
            ("place_order", "Hari ehenam pata 01 eken 1i pata 03 eken 1i danna. Ina 32."),
            ("send_details", "Tharindu Madushanka, 88 Colombo Road, Kurunegala. 0711000003. Cash on delivery."),
            ("confirm_order", "Ow hari order eka danna.")
        ]
    },
    {
        "customer_id": 4,
        "name": "Dinithi Wickramasinghe",
        "phone": "94711000004",
        "style": "Fluent & Professional English",
        "category": "Below 10 (5 shorts)",
        "product_target": "Kyela Brand Single Jersey Cotton Shorts",
        "intended_qty": 5,
        "steps": [
            ("fb_ad_inquiry", "Hi, I just saw your Facebook sponsored ad for Kyela Brand cotton shorts. Are the 5-pack sets currently in stock?"),
            ("random_q1", "Is the fabric 100% single jersey cotton? And can you deliver to Colombo 07 within 2 days?"),
            ("mid_images_request", "Could you please send me pictures of the available colors for Kyela shorts?"),
            ("place_order", "Great, I will take the 5 shorts package. Waist size 28. Colors: 01, 02, 03, 04, and 05 (one each)."),
            ("send_details", "Dinithi Wickramasinghe, Apt 4B, Ward Place, Colombo 07. Phone 0711000004. Cash on delivery please."),
            ("confirm_order", "Yes, all details are correct. Please proceed with the order.")
        ]
    },
    {
        "customer_id": 5,
        "name": "Pathum Fernando",
        "phone": "94711000005",
        "style": "Transliterated Sinhala with abbreviations ('bro', 'khmda', 'pls')",
        "category": "Below 10 (4 shorts)",
        "product_target": "SingleJersey Cotton උස අගල් 20",
        "intended_qty": 4,
        "steps": [
            ("fb_ad_inquiry", "Bro fb ad eka dakka 20 inch single jersey shorts pack eka. 4 pack eka free delivery da?"),
            ("random_q1", "Sizes fit une natnam exchange karanna puluwanda bro? Staff contact number ekath ewanna pls."),
            ("mid_images_request", "Matath ewannako eke images tika balaganna."),
            ("place_order", "Elakiri bro, 4 pack eka danna. Ina 36. Pata 01 eken 2k, pata 02 eken 2k."),
            ("send_details", "Pathum Fernando, 24 Beach Road, Negombo. 0711000005. Bank transfer karannam."),
            ("confirm_order", "Ow bro okkoma hari, order eka conform karanna.")
        ]
    },
    {
        "customer_id": 6,
        "name": "Chathurika Priyadarshani",
        "phone": "94711000006",
        "style": "Warm & Conversational Sinhala",
        "category": "Below 10 (5 shorts)",
        "product_target": "පොප්කොන් ශෝර්ට් උස අගල් 16",
        "intended_qty": 5,
        "steps": [
            ("fb_ad_inquiry", "හායි, මම මේ දැන්වීම ෆේස්බුක් එකෙන් දැක්කේ. අඟල් 16 පොප්කොන් ශෝර්ට්ස් 5ක් ගන්න පුළුවන්ද? ගාන කීයද?"),
            ("random_q1", "මේවට ඩිලිවරි ගාස්තු අය වෙනවද? හෝදනකොට පාට බහිනවද?"),
            ("mid_images_request", "අනේ මට බලන්න මේ ශෝර්ට්ස් වල පින්තූර ටිකක් එවන්නකෝ."),
            ("place_order", "හරි මම ශෝර්ට්ස් 5 පැකේජය ගන්නවා. ඉන 30. පාට 01, 02, 03, 04, 05 එක ගානේ."),
            ("send_details", "චතුරිකා ප්‍රියදර්ශනී, නො. 74, ස්ටේෂන් පාර, කඩවත. 0711000006. කෑෂ් ඔන් ඩිලිවරි එවන්න."),
            ("confirm_order", "ඔව් සියලු විස්තර හරි, ඕඩර් එක දාන්නකෝ.")
        ]
    },
    {
        "customer_id": 7,
        "name": "Pradeep Jayasuriya",
        "phone": "94711000007",
        "style": "Hurried & Direct / Telegraphic",
        "category": "Below 10 (5 shorts)",
        "product_target": "Rib Jacquard Shorts",
        "intended_qty": 5,
        "steps": [
            ("fb_ad_inquiry", "FB ad Rib Jacquard shorts 5 pack thiyeda? Delivery free da?"),
            ("random_q1", "Kandy walata dawas keeyada? Urgent unoth call karanna number eka denna."),
            ("mid_images_request", "Photos ewanna ikmanata."),
            ("place_order", "5 pack. Size 38. Colors: 01-1, 02-1, 03-1, 04-1, 05-1."),
            ("send_details", "Pradeep Jayasuriya, 15/2 Peradeniya Road, Kandy. 0711000007. COD."),
            ("confirm_order", "Ow submit karanna.")
        ]
    },
    {
        "customer_id": 8,
        "name": "Gayan Alwis",
        "phone": "94711000008",
        "style": "Gym Owner / Bulk Order Singlish",
        "category": "Above 10 (15 shorts)",
        "product_target": "Kyela Brand Single Jersey Cotton Shorts",
        "intended_qty": 15,
        "steps": [
            ("fb_ad_inquiry", "Hi, ape gym eke boys lata FB ad eka dakala 15 pack ekak ganna baluwe. Kyela shorts 15k ganna puluwanda? Price kohomada wenne?"),
            ("random_q1", "15k gannakota bulk discount ekak thiyenawada? Delivery free da?"),
            ("mid_images_request", "Ape group ekata danna photos tika ewanna puluwanda?"),
            ("place_order", "Hari ehenam 15 pack eka gannawa. Waist 34. Pata 01 eken 5k, pata 02 eken 5k, pata 03 eken 5k."),
            ("send_details", "Gayan Alwis (Power Gym), No 110 High Level Road, Nugegoda. 0711000008. Bank transfer karannam."),
            ("confirm_order", "Ow details serama hari, order eka confirm karanna.")
        ]
    },
    {
        "customer_id": 9,
        "name": "Kamal Senarath",
        "phone": "94711000009",
        "style": "Skeptical & Inquisitive Customer",
        "category": "Above 10 (12 shorts)",
        "product_target": "පොප්කෝන්  ශෝර්ට් උස අගල්  18",
        "intended_qty": 12,
        "steps": [
            ("fb_ad_inquiry", "FB ad eke thiyena 18 inch popcorn shorts 12k ganna puluwanda? 12 ta price eka keeyada?"),
            ("random_q1", "Mewa heduwama aeladawenawada? Quality eka sure da? Balamu staff contact eka kaageda kiyala?"),
            ("mid_images_request", "Mata hodata balanna images tika ewanna me dan."),
            ("place_order", "Hari mata 12 pack eka danna. Ina 38. Pata 01 eken 4i, pata 02 eken 4i, pata 03 eken 4i."),
            ("send_details", "Kamal Senarath, 99 Main Street, Matara. 0711000009. Cash on delivery witharai mama ganne."),
            ("confirm_order", "Ow mage details okkoma hari, ewanna.")
        ]
    },
    {
        "customer_id": 10,
        "name": "Anuradha Wijesinghe",
        "phone": "94711000010",
        "style": "Factory Team Buyer / Cheerful & Polite",
        "category": "Above 10 (20 shorts)",
        "product_target": "SingleJersey Cotton උස අගල් 20",
        "intended_qty": 20,
        "steps": [
            ("fb_ad_inquiry", "Good evening! Ape factory eke team ekata FB ad eka dakala SingleJersey Cotton 20 inch shorts 20k order karanna one. 20k ganna puluwanda? Total eka keeyada?"),
            ("random_q1", "Credit card or bank transfer puluwanda? Delivery charge ekak thiyenawada 20 shorts walata?"),
            ("mid_images_request", "Team ekata pennanna photos tika ewanna puluwanda karunakara?"),
            ("place_order", "Niyamai, api 20 gannawa. Ina 32-34 free size neda. Pata 01 eken 10i, pata 02 eken 10i."),
            ("send_details", "Anuradha Wijesinghe, MAS Fabric Park, Thulhiriya. Phone 0711000010. Bank transfer karannam."),
            ("confirm_order", "Ow okkoma wisthara hari, please confirm order.")
        ]
    }
]

all_results = []
print("=" * 70)
print("STARTING 10 CUSTOMER SIMULATIONS (FACEBOOK ADS INQUIRIES)")
print("=" * 70)

for sc in scenarios:
    cid = sc["customer_id"]
    print(f"\n======================================================================")
    print(f"CUSTOMER {cid}: {sc['name']} ({sc['phone']})")
    print(f"Target: {sc['product_target']} | Category: {sc['category']} | Style: {sc['style']}")
    print(f"======================================================================")
    
    history = []
    cust_report = {
        "customer_id": cid,
        "name": sc["name"],
        "phone": sc["phone"],
        "category": sc["category"],
        "product": sc["product_target"],
        "intended_qty": sc["intended_qty"],
        "style": sc["style"],
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
            print(f"  ❌ API ERROR: {resp['error']}")
            cust_report["bugs_detected"].append(f"Turn '{step_label}': API error: {resp['error']}")
            cust_report["turns"].append({"step": step_label, "customer": msg, "error": resp["error"], "elapsed": elapsed})
            continue
            
        clean_text = resp.get("response", "")
        img_urls = resp.get("imageUrls", [])
        
        print(f"  🤖 Bot ({elapsed}s, {len(img_urls)} images): {clean_text[:120]}...")
        if img_urls:
            print(f"     Image count: {len(img_urls)} | First image: {img_urls[0][:80]}...")
            
        # BUG CHECK 1: Leaked markup tags
        leaked_tags = []
        for tag in ["<IMAGE_URL>", "</IMAGE_URL>", "<ORDER_JSON>", "</ORDER_JSON>", "<VIDEO_URL>", "<USED_FAQS>", "[FAQ_ID:"]:
            if tag in clean_text:
                leaked_tags.append(tag)
        if leaked_tags:
            bug = f"Turn '{step_label}': Leaked internal tags: {leaked_tags}"
            print(f"  ⚠️ BUG: {bug}")
            cust_report["bugs_detected"].append(bug)
            
        # BUG CHECK 2: Raw JSON leaking in user text
        if "{" in clean_text and '"customer_name"' in clean_text:
            bug = f"Turn '{step_label}': Raw Order JSON leaked in visible response"
            print(f"  ⚠️ BUG: {bug}")
            cust_report["bugs_detected"].append(bug)
            
        # BUG CHECK 3: Images attached when NOT requested
        if step_label in ["place_order", "send_details", "confirm_order"] and len(img_urls) > 0:
            bug = f"Turn '{step_label}': Redundant {len(img_urls)} images attached during order placement"
            print(f"  ⚠️ BUG: {bug}")
            cust_report["bugs_detected"].append(bug)
            
        # BUG CHECK 4: Customer asked for images, but 0 returned
        if step_label == "mid_images_request" and len(img_urls) == 0:
            bug = f"Turn '{step_label}': Customer asked for images mid-chat, but bot returned 0 images"
            print(f"  ⚠️ BUG: {bug}")
            cust_report["bugs_detected"].append(bug)
        elif step_label == "mid_images_request" and len(img_urls) > 0:
            print(f"  ✅ Mid-conversation images returned successfully: {len(img_urls)} images")
            
        # BUG CHECK 5: Raw URL in conversational text
        if "http" in clean_text and any(ext in clean_text.lower() for ext in [".jpg", ".jpeg", ".png"]):
            bug = f"Turn '{step_label}': Raw image URL printed directly in message text instead of invisible tags"
            print(f"  ⚠️ BUG: {bug}")
            cust_report["bugs_detected"].append(bug)

        turn_info = {
            "step": step_label,
            "customer": msg,
            "bot_text": clean_text,
            "image_count": len(img_urls),
            "image_urls": img_urls,
            "elapsed": elapsed
        }
        cust_report["turns"].append(turn_info)
        
        # Append to history
        history.append({"direction": "inbound", "message": msg})
        history.append({"direction": "outbound", "message": clean_text})
        time.sleep(1)
        
    # Verify DB order record
    db_rec = query_db_orders(sc["phone"])
    if db_rec:
        cust_report["order_created_in_db"] = True
        cust_report["db_record"] = db_rec
        print(f"\n  ✅ ORDER RECORDED IN DB for {sc['name']}: {db_rec[:100]}...")
    else:
        print(f"\n  ❌ NO ORDER FOUND IN DB for {sc['name']} ({sc['phone']})!")
        cust_report["bugs_detected"].append("Order was confirmed by customer, but NO record was created in 'Binara_fashion'.orders!")
        
    all_results.append(cust_report)

with open("/home/kajaram/.gemini/antigravity/brain/319d7ce8-f0e1-442e-8505-1664ea3c5ae2/scratch/fb_ad_10_customers_results.json", "w", encoding="utf-8") as f:
    json.dump(all_results, f, ensure_ascii=False, indent=2)

print("\n\nAll 10 simulations completed successfully! Results written to fb_ad_10_customers_results.json.")
