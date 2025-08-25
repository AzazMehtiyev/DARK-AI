import requests
import sys
import json
from datetime import datetime

class DarkAITester:
    def __init__(self, base_url="https://sleek-ai-interface.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []

    def run_test(self, name, method, endpoint, expected_status, data=None, params=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}" if endpoint else self.base_url
        headers = {'Content-Type': 'application/json'}

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, params=params, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, params=params, timeout=30)

            print(f"   Status: {response.status_code}")
            
            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - {name}")
                try:
                    response_data = response.json()
                    if 'message' in response_data:
                        print(f"   Response: {response_data['message'][:100]}...")
                    return True, response_data
                except:
                    return True, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    error_detail = response.json()
                    print(f"   Error: {error_detail}")
                except:
                    print(f"   Error: {response.text[:200]}")
                self.failed_tests.append(f"{name}: Expected {expected_status}, got {response.status_code}")
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            self.failed_tests.append(f"{name}: {str(e)}")
            return False, {}

    def test_health_endpoints(self):
        """Test basic health endpoints"""
        print("\n=== HEALTH CHECK TESTS ===")
        
        # Test root endpoint
        self.run_test("Root Endpoint", "GET", "", 200)
        
        # Test health endpoint
        self.run_test("Health Check", "GET", "health", 200)

    def test_chat_functionality(self):
        """Test chat endpoints and identity responses"""
        print("\n=== CHAT FUNCTIONALITY TESTS ===")
        
        # Test regular chat
        success, response = self.run_test(
            "Regular Chat",
            "POST",
            "chat",
            200,
            data={"message": "Merhaba, nasılsın?", "session_id": "test_session"}
        )
        
        # Test Turkish identity questions - NAME
        print("\n--- Testing Identity Responses ---")
        
        name_questions = [
            "İsmin ne?",
            "Adın ne?", 
            "Sen kimsin?",
            "Kim sin?"
        ]
        
        for question in name_questions:
            success, response = self.run_test(
                f"Name Identity: '{question}'",
                "POST", 
                "chat",
                200,
                data={"message": question, "session_id": "test_session"}
            )
            if success and response.get('message'):
                expected_response = "Ben DARK AI'yım."
                actual_response = response['message']
                if expected_response in actual_response:
                    print(f"   ✅ Correct identity response: {actual_response}")
                else:
                    print(f"   ❌ Wrong identity response. Expected: '{expected_response}', Got: '{actual_response}'")
                    self.failed_tests.append(f"Name identity for '{question}': Wrong response")
        
        # Test Turkish identity questions - CREATOR
        creator_questions = [
            "Seni kim yaptı?",
            "Kim tarafından yapıldın?",
            "Seni kim oluşturdu?"
        ]
        
        for question in creator_questions:
            success, response = self.run_test(
                f"Creator Identity: '{question}'",
                "POST",
                "chat", 
                200,
                data={"message": question, "session_id": "test_session"}
            )
            if success and response.get('message'):
                expected_response = "Azad Mehtiyev ve Emergent tarafından tasarlandım."
                actual_response = response['message']
                if expected_response in actual_response:
                    print(f"   ✅ Correct creator response: {actual_response}")
                else:
                    print(f"   ❌ Wrong creator response. Expected: '{expected_response}', Got: '{actual_response}'")
                    self.failed_tests.append(f"Creator identity for '{question}': Wrong response")

    def test_chat_history(self):
        """Test chat history endpoint"""
        print("\n=== CHAT HISTORY TEST ===")
        
        success, response = self.run_test(
            "Get Chat History",
            "GET",
            "chat/history",
            200,
            params={"session_id": "test_session"}
        )
        
        if success:
            print(f"   Retrieved {len(response)} messages from history")

    def test_tts_endpoints(self):
        """Test TTS functionality"""
        print("\n=== TTS FUNCTIONALITY TESTS ===")
        
        # Test TTS without configuration (should fail)
        success, response = self.run_test(
            "TTS Without Config",
            "POST",
            "tts",
            400,  # Should fail without API key
            data={"text": "Test mesajı"}
        )
        
        # Test ElevenLabs configuration with invalid key
        success, response = self.run_test(
            "Configure ElevenLabs (Invalid Key)",
            "POST",
            "config/elevenlabs",
            400,  # Should fail with invalid key
            params={"api_key": "invalid_key_test"}
        )

    def print_summary(self):
        """Print test summary"""
        print(f"\n{'='*50}")
        print(f"📊 TEST SUMMARY")
        print(f"{'='*50}")
        print(f"Total Tests: {self.tests_run}")
        print(f"Passed: {self.tests_passed}")
        print(f"Failed: {len(self.failed_tests)}")
        print(f"Success Rate: {(self.tests_passed/self.tests_run)*100:.1f}%")
        
        if self.failed_tests:
            print(f"\n❌ FAILED TESTS:")
            for i, failure in enumerate(self.failed_tests, 1):
                print(f"   {i}. {failure}")
        else:
            print(f"\n🎉 ALL TESTS PASSED!")
        
        return len(self.failed_tests) == 0

def main():
    print("🚀 Starting DARK AI Backend Tests")
    print("=" * 50)
    
    tester = DarkAITester()
    
    # Run all test suites
    tester.test_health_endpoints()
    tester.test_chat_functionality() 
    tester.test_chat_history()
    tester.test_tts_endpoints()
    
    # Print final summary
    all_passed = tester.print_summary()
    
    return 0 if all_passed else 1

if __name__ == "__main__":
    sys.exit(main())