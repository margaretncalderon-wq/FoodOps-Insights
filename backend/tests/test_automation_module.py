# test_automation_module.py - Tests for Automation Module
# Testing: GET /api/automation/rules, POST /api/automation/rules, GET /api/automation/templates,
# POST /api/automation/templates/{id}/create, GET /api/automation/stats, POST /api/automation/rules/{id}/toggle,
# DELETE /api/automation/rules/{id}

import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "margaret.n.calderon@gmail.com"
TEST_PASSWORD = "Evoque2024!"

class TestAutomationModule:
    """Tests for Automation module endpoints"""
    
    @pytest.fixture(autouse=True, scope="class")
    def setup(self, request):
        """Authenticate and store session for all tests"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_res = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        
        if login_res.status_code != 200:
            pytest.skip(f"Authentication failed: {login_res.text}")
        
        # Store on class
        request.cls.session = session
        request.cls.created_rule_id = None
        request.cls.rule_from_template_id = None
        
        yield
        
        # Cleanup: Delete test-created rules
        if hasattr(request.cls, 'created_rule_id') and request.cls.created_rule_id:
            session.delete(f"{BASE_URL}/api/automation/rules/{request.cls.created_rule_id}")
        if hasattr(request.cls, 'rule_from_template_id') and request.cls.rule_from_template_id:
            session.delete(f"{BASE_URL}/api/automation/rules/{request.cls.rule_from_template_id}")

    # ============ GET /api/automation/stats ============
    def test_01_get_automation_stats(self):
        """GET /api/automation/stats - Get automation statistics"""
        res = self.session.get(f"{BASE_URL}/api/automation/stats")
        
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        
        data = res.json()
        assert "rules" in data, "Response should contain 'rules'"
        assert "executions" in data, "Response should contain 'executions'"
        assert "active" in data["rules"], "rules should contain 'active' count"
        assert "paused" in data["rules"], "rules should contain 'paused' count"
        assert "draft" in data["rules"], "rules should contain 'draft' count"
        assert "today" in data["executions"], "executions should contain 'today' count"
        print(f"Stats: Active={data['rules']['active']}, Paused={data['rules']['paused']}, Draft={data['rules']['draft']}")

    # ============ GET /api/automation/templates ============
    def test_02_get_automation_templates(self):
        """GET /api/automation/templates - Get predefined templates"""
        res = self.session.get(f"{BASE_URL}/api/automation/templates")
        
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        
        data = res.json()
        assert "templates" in data, "Response should contain 'templates'"
        templates = data["templates"]
        
        # Verify 5 predefined templates
        assert len(templates) >= 5, f"Expected at least 5 templates, got {len(templates)}"
        
        # Check template IDs
        template_ids = [t["template_id"] for t in templates]
        expected_ids = ["lead_welcome", "lead_qualification", "inactive_client", "event_reminder", "follow_up_overdue"]
        for expected_id in expected_ids:
            assert expected_id in template_ids, f"Template '{expected_id}' not found"
        
        # Validate template structure
        for template in templates:
            assert "template_id" in template
            assert "name" in template
            assert "description" in template
            assert "trigger" in template
            assert "actions" in template
        
        print(f"Found {len(templates)} templates: {template_ids}")

    # ============ GET /api/automation/rules ============
    def test_03_list_automation_rules(self):
        """GET /api/automation/rules - List all automation rules"""
        res = self.session.get(f"{BASE_URL}/api/automation/rules")
        
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        
        data = res.json()
        assert "rules" in data, "Response should contain 'rules'"
        assert "count" in data, "Response should contain 'count'"
        
        rules = data["rules"]
        print(f"Found {len(rules)} existing rules")
        
        # Validate rule structure if any exist
        if rules:
            rule = rules[0]
            assert "rule_id" in rule
            assert "name" in rule
            assert "status" in rule
            assert "trigger" in rule

    # ============ POST /api/automation/rules ============
    def test_04_create_automation_rule(self):
        """POST /api/automation/rules - Create a new automation rule"""
        payload = {
            "name": "TEST_New Lead Notification",
            "description": "Notify when a new lead is created",
            "trigger": {
                "type": "lead_created",
                "conditions": []
            },
            "actions": [
                {
                    "type": "send_notification",
                    "config": {
                        "message": "New lead created",
                        "recipients": ["owner"]
                    }
                }
            ],
            "status": "draft"
        }
        
        res = self.session.post(f"{BASE_URL}/api/automation/rules", json=payload)
        
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        
        data = res.json()
        assert "rule_id" in data, "Response should contain 'rule_id'"
        assert data["name"] == payload["name"], "Name should match"
        assert data["status"] == "draft", "Status should be 'draft'"
        assert "trigger" in data, "Response should contain 'trigger'"
        assert "actions" in data, "Response should contain 'actions'"
        
        # Store for later tests
        self.__class__.created_rule_id = data["rule_id"]
        print(f"Created rule: {data['rule_id']}")

    # ============ GET /api/automation/rules/{rule_id} ============
    def test_05_get_automation_rule_by_id(self):
        """GET /api/automation/rules/{rule_id} - Get specific rule"""
        if not self.created_rule_id:
            pytest.skip("No rule created in previous test")
        
        res = self.session.get(f"{BASE_URL}/api/automation/rules/{self.created_rule_id}")
        
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        
        data = res.json()
        assert data["rule_id"] == self.created_rule_id
        assert data["name"] == "TEST_New Lead Notification"
        print(f"Retrieved rule: {data['name']}")

    # ============ POST /api/automation/rules/{rule_id}/toggle ============
    def test_06_toggle_automation_rule_to_active(self):
        """POST /api/automation/rules/{rule_id}/toggle - Toggle rule to active"""
        if not self.created_rule_id:
            pytest.skip("No rule created in previous test")
        
        res = self.session.post(f"{BASE_URL}/api/automation/rules/{self.created_rule_id}/toggle")
        
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        
        data = res.json()
        assert "success" in data
        assert data["success"] == True
        assert "status" in data
        assert data["status"] == "active", f"Expected 'active', got '{data['status']}'"
        print(f"Toggled rule to: {data['status']}")

    def test_07_toggle_automation_rule_to_paused(self):
        """POST /api/automation/rules/{rule_id}/toggle - Toggle rule to paused"""
        if not self.created_rule_id:
            pytest.skip("No rule created in previous test")
        
        res = self.session.post(f"{BASE_URL}/api/automation/rules/{self.created_rule_id}/toggle")
        
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        
        data = res.json()
        assert data["status"] == "paused", f"Expected 'paused', got '{data['status']}'"
        print(f"Toggled rule to: {data['status']}")

    # ============ POST /api/automation/templates/{template_id}/create ============
    def test_08_create_rule_from_template(self):
        """POST /api/automation/templates/{template_id}/create - Create rule from template"""
        # Use lead_welcome template
        template_id = "lead_welcome"
        customization = {
            "name": "TEST_Lead Welcome (From Template)"
        }
        
        res = self.session.post(
            f"{BASE_URL}/api/automation/templates/{template_id}/create",
            json=customization
        )
        
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        
        data = res.json()
        assert "rule_id" in data
        assert data["name"] == "TEST_Lead Welcome (From Template)"
        assert data["status"] == "draft", "New rule from template should be in 'draft' status"
        assert data.get("from_template") == template_id, "Should indicate template origin"
        
        # Store for cleanup
        self.__class__.rule_from_template_id = data["rule_id"]
        print(f"Created rule from template: {data['rule_id']}")

    # ============ PUT /api/automation/rules/{rule_id} ============
    def test_09_update_automation_rule(self):
        """PUT /api/automation/rules/{rule_id} - Update rule"""
        if not self.created_rule_id:
            pytest.skip("No rule created in previous test")
        
        update_payload = {
            "name": "TEST_Updated Rule Name",
            "description": "Updated description"
        }
        
        res = self.session.put(
            f"{BASE_URL}/api/automation/rules/{self.created_rule_id}",
            json=update_payload
        )
        
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        
        data = res.json()
        assert data["name"] == "TEST_Updated Rule Name"
        assert data["description"] == "Updated description"
        print(f"Updated rule: {data['name']}")

    # ============ GET /api/automation/logs ============
    def test_10_list_automation_logs(self):
        """GET /api/automation/logs - List execution logs"""
        res = self.session.get(f"{BASE_URL}/api/automation/logs")
        
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        
        data = res.json()
        assert "logs" in data
        assert "count" in data
        print(f"Found {len(data['logs'])} execution logs")

    # ============ DELETE /api/automation/rules/{rule_id} ============
    def test_11_delete_automation_rule(self):
        """DELETE /api/automation/rules/{rule_id} - Delete rule"""
        if not self.created_rule_id:
            pytest.skip("No rule created in previous test")
        
        res = self.session.delete(f"{BASE_URL}/api/automation/rules/{self.created_rule_id}")
        
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        
        data = res.json()
        assert data["success"] == True
        
        # Verify deletion
        get_res = self.session.get(f"{BASE_URL}/api/automation/rules/{self.created_rule_id}")
        assert get_res.status_code == 404, "Deleted rule should return 404"
        
        # Clear reference since it's deleted
        self.__class__.created_rule_id = None
        print("Rule deleted successfully")

    def test_12_delete_template_rule_cleanup(self):
        """Cleanup: Delete rule created from template"""
        if not self.rule_from_template_id:
            pytest.skip("No template rule to clean up")
        
        res = self.session.delete(f"{BASE_URL}/api/automation/rules/{self.rule_from_template_id}")
        assert res.status_code == 200
        self.__class__.rule_from_template_id = None
        print("Template rule cleaned up")

    # ============ Filter tests ============
    def test_13_list_rules_filtered_by_status(self):
        """GET /api/automation/rules?status=active - Filter rules by status"""
        res = self.session.get(f"{BASE_URL}/api/automation/rules?status=active")
        
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        
        data = res.json()
        # All returned rules should be active (if any)
        for rule in data.get("rules", []):
            assert rule["status"] == "active", f"Expected active status, got {rule['status']}"
        print(f"Filter by active: {len(data['rules'])} rules")

    def test_14_get_nonexistent_rule_returns_404(self):
        """GET /api/automation/rules/nonexistent - Should return 404"""
        res = self.session.get(f"{BASE_URL}/api/automation/rules/nonexistent_rule_id")
        assert res.status_code == 404, f"Expected 404 for nonexistent rule, got {res.status_code}"
        print("404 returned for nonexistent rule - correct behavior")

    def test_15_create_invalid_template_returns_404(self):
        """POST /api/automation/templates/invalid/create - Should return 404"""
        res = self.session.post(f"{BASE_URL}/api/automation/templates/invalid_template/create", json={})
        assert res.status_code == 404, f"Expected 404 for invalid template, got {res.status_code}"
        print("404 returned for invalid template - correct behavior")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
