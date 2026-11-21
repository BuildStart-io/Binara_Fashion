import urllib.request
import json
import time

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
        "senderName": "Test Customer"
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

def test_all_5_numbers():
    # Test index 1, 2, 3, 4, 5
    expected_keywords = {
        "1": ["single jersey", "singlejersey", "20", "කොට්න්"],
        "2": ["18", "පොප්කෝන්"],
        "3": ["16", "පොප්කෝන්", "පොප්කොන්"],
        "4": ["kyela", "කයිලා"],
        "5": ["rib", "රිබ්", "jacquard"]
    }
    
    for idx_str in ["1", "2", "3", "4", "5"]:
        phone = f"9477999881{idx_str}"
        print(f"\n==========================================")
        print(f"TESTING INDEX SELECTION: '{idx_str}'")
        print(f"==========================================")
        
        # Turn 1: Greeting
        r1 = call_bot(phone, "hi", [])
        imgs1 = r1.get("imageUrls", [])
        print(f"Turn 1 ('hi') images: {len(imgs1)} (Expected: 0)")
        assert len(imgs1) == 0, f"Turn 1 should have 0 images, got {len(imgs1)}"
        
        history = [
            {"direction": "inbound", "message": "hi"},
            {"direction": "outbound", "message": r1.get("response"), "metadata": {"imageUrls": []}}
        ]
        
        # Turn 2: Number selection
        r2 = call_bot(phone, idx_str, history)
        imgs2 = r2.get("imageUrls", [])
        resp2 = r2.get("response", "").lower()
        print(f"Turn 2 ('{idx_str}') images: {len(imgs2)} (Expected: > 0)")
        print(f"Turn 2 response snippet: {r2.get('response')[:150]}...")
        assert len(imgs2) > 0, f"Turn 2 for index {idx_str} MUST send images! Got {len(imgs2)}"
        
        # Turn 3: Quantity turn (should NOT spam images)
        history.append({"direction": "inbound", "message": idx_str})
        history.append({"direction": "outbound", "message": r2.get("response"), "message_type": "image", "metadata": {"imageUrls": imgs2}})
        
        r3 = call_bot(phone, "mata 5k ona", history)
        imgs3 = r3.get("imageUrls", [])
        print(f"Turn 3 ('mata 5k ona') images: {len(imgs3)} (Expected: 0)")
        assert len(imgs3) == 0, f"Turn 3 should NOT send images (got {len(imgs3)})"
        print(f"Index {idx_str} PASSED ALL CHECKS!")

if __name__ == "__main__":
    test_all_5_numbers()
