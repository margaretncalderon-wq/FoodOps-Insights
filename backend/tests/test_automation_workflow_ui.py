"""
Test suite for P2: Org-Level Workflow Configuration UI
Tests automation/workflow APIs that power the Settings > Automations tab
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAutomationAPIs:
    """Test automation API endpoints used by Automations Settings UI"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "demo.agency@kora.com", "password": "Evoque2024!"}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        token = login_response.json().get("access_token")
        self.headers = {"Authorization": f"Bearer {token}"}
        yield
    
    def test_automation_rules_list(self):
        """Test GET /api/automation/rules returns workflows list"""
        response = requests.get(
            f"{BASE_URL}/api/automation/rules",
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert "rules" in data, "Response should have 'rules' key"
        assert "count" in data, "Response should have 'count' key"
        assert isinstance(data["rules"], list), "Rules should be a list"
        
        # Verify rule structure if rules exist
        if len(data["rules"]) > 0:
            rule = data["rules"][0]
            assert "rule_id" in rule, "Rule should have rule_id"
            assert "name" in rule, "Rule should have name"
            assert "trigger" in rule, "Rule should have trigger"
            assert "actions" in rule, "Rule should have actions"
            assert "status" in rule, "Rule should have status"
        
        print(f"✓ Found {data['count']} workflow rules")
    
    def test_automation_templates_list(self):
        """Test GET /api/automation/templates returns 12 templates"""
        response = requests.get(
            f"{BASE_URL}/api/automation/templates",
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert "templates" in data, "Response should have 'templates' key"
        
        templates = data["templates"]
        assert len(templates) == 12, f"Expected 12 templates, got {len(templates)}"
        
        # Verify template structure
        for template in templates:
            assert "template_id" in template, "Template should have template_id"
            assert "name" in template, "Template should have name"
            assert "name_es" in template, "Template should have name_es (Spanish)"
            assert "description" in template, "Template should have description"
            assert "category" in template, "Template should have category"
            assert "trigger" in template, "Template should have trigger"
            assert "actions" in template, "Template should have actions"
        
        # Verify expected template IDs
        template_ids = [t["template_id"] for t in templates]
        expected_ids = [
            "lead_welcome",
            "lead_qualification",
            "inactive_client",
            "event_reminder",
            "follow_up_overdue",
            "deal_won_execution",
            "project_kickoff",
            "integration_company_lead",
            "integration_candidate_lead",
            "integration_contractor_lead",
            "integration_invoice_created",
            "integration_high_value_lead"
        ]
        
        for expected_id in expected_ids:
            assert expected_id in template_ids, f"Missing template: {expected_id}"
        
        print(f"✓ All 12 templates present with correct structure")
    
    def test_automation_templates_categories(self):
        """Test templates have correct categories"""
        response = requests.get(
            f"{BASE_URL}/api/automation/templates",
            headers=self.headers
        )
        data = response.json()
        templates = data["templates"]
        
        # Group by category
        categories = {}
        for t in templates:
            cat = t["category"]
            if cat not in categories:
                categories[cat] = []
            categories[cat].append(t["template_id"])
        
        # Verify categories exist
        assert "leads" in categories, "Should have 'leads' category"
        assert "clients" in categories, "Should have 'clients' category"
        assert "events" in categories, "Should have 'events' category"
        assert "execution" in categories, "Should have 'execution' category"
        assert "integrations" in categories, "Should have 'integrations' category"
        
        # Verify integrations category has 5 templates
        assert len(categories["integrations"]) == 5, f"Expected 5 integration templates, got {len(categories['integrations'])}"
        
        print(f"✓ Templates correctly categorized: {list(categories.keys())}")
    
    def test_create_workflow_from_template(self):
        """Test POST /api/automation/templates/{template_id}/create"""
        # Use lead_welcome template as test
        response = requests.post(
            f"{BASE_URL}/api/automation/templates/lead_welcome/create",
            headers=self.headers,
            json={}
        )
        assert response.status_code == 200, f"Failed to create from template: {response.text}"
        
        rule = response.json()
        assert "rule_id" in rule, "Created rule should have rule_id"
        assert rule["name"] == "Lead Welcome", "Name should match template"
        assert rule["status"] == "draft", "New rules should be in draft status"
        assert rule["from_template"] == "lead_welcome", "Should track template origin"
        
        # Cleanup - delete the test rule
        rule_id = rule["rule_id"]
        delete_response = requests.delete(
            f"{BASE_URL}/api/automation/rules/{rule_id}",
            headers=self.headers
        )
        assert delete_response.status_code == 200, "Cleanup failed"
        
        print(f"✓ Can create workflow from template and delete it")
    
    def test_automation_stats(self):
        """Test GET /api/automation/stats endpoint"""
        response = requests.get(
            f"{BASE_URL}/api/automation/stats",
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert "rules" in data, "Should have 'rules' stats"
        assert "executions" in data, "Should have 'executions' stats"
        
        rules_stats = data["rules"]
        assert "active" in rules_stats, "Should track active rules"
        assert "paused" in rules_stats, "Should track paused rules"
        assert "draft" in rules_stats, "Should track draft rules"
        assert "total" in rules_stats, "Should track total rules"
        
        print(f"✓ Stats: {rules_stats['active']} active, {rules_stats['total']} total rules")


class TestSettingsPageTabs:
    """Test Settings page tab configuration (P1 verification)"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "demo.agency@kora.com", "password": "Evoque2024!"}
        )
        assert login_response.status_code == 200
        token = login_response.json().get("access_token")
        self.headers = {"Authorization": f"Bearer {token}"}
        yield
    
    def test_settings_company_endpoint(self):
        """Test GET /api/settings/company works (Settings page loads)"""
        response = requests.get(
            f"{BASE_URL}/api/settings/company",
            headers=self.headers
        )
        assert response.status_code == 200, f"Settings company endpoint failed: {response.text}"
        
        data = response.json()
        assert "name" in data, "Company settings should have name"
        
        print(f"✓ Settings page API works - Company: {data.get('name')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
