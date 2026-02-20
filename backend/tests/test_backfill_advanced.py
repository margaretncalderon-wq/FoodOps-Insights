"""
Advanced tests for P0 production bug fix: Back-filling missing data on login.

These tests directly interact with MongoDB to create test scenarios:
1. User with NO organization_config - should get one created on login
2. User with org_config but NO industry_type - should get it populated on login
3. User with NO active subscription - should get trial subscription created on login

Requires pymongo to interact with MongoDB directly.
"""

import pytest
import requests
import os
import uuid
import bcrypt
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient

# Get BASE_URL from environment variable
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    raise ValueError("REACT_APP_BACKEND_URL environment variable must be set")

# MongoDB connection
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'test_database')


def hash_password(password: str) -> str:
    """Hash password using bcrypt"""
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


class TestBackfillMissingOrgConfig:
    """Test back-fill for users missing organization_config"""
    
    @pytest.fixture(autouse=True)
    def setup_db(self):
        """Setup MongoDB connection and test data"""
        self.client = MongoClient(MONGO_URL)
        self.db = self.client[DB_NAME]
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.test_prefix = f"TEST_BACKFILL_{uuid.uuid4().hex[:6]}"
        
        # Track created test data for cleanup
        self.created_users = []
        self.created_companies = []
        self.created_configs = []
        self.created_subscriptions = []
        
        yield
        
        # Cleanup
        for user_id in self.created_users:
            self.db.users.delete_one({"user_id": user_id})
        for company_id in self.created_companies:
            self.db.companies.delete_one({"company_id": company_id})
            self.db.organization_configs.delete_one({"company_id": company_id})
            self.db.subscriptions.delete_many({"company_id": company_id})
        
        self.client.close()
    
    def test_login_creates_org_config_if_missing(self):
        """
        Test that logging in a user WITHOUT organization_config creates one.
        This simulates the P0 bug scenario.
        """
        # Create user and company directly in DB WITHOUT org_config
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        company_id = f"company_{uuid.uuid4().hex[:12]}"
        email = f"{self.test_prefix}_no_config@example.com"
        password = "TestPass123!"
        now = datetime.now(timezone.utc)
        
        # Create company
        company_doc = {
            "company_id": company_id,
            "name": f"Test Company {self.test_prefix}",
            "industry_template": "events_hospitality",
            "created_at": now.isoformat()
        }
        self.db.companies.insert_one(company_doc)
        self.created_companies.append(company_id)
        
        # Create user (WITHOUT organization_config and subscription)
        user_doc = {
            "user_id": user_id,
            "email": email,
            "name": "Test No Config User",
            "password_hash": hash_password(password),
            "company_id": company_id,
            "role": "admin",
            "created_at": now.isoformat()
        }
        self.db.users.insert_one(user_doc)
        self.created_users.append(user_id)
        
        # Verify NO organization_config exists before login
        org_config_before = self.db.organization_configs.find_one({"company_id": company_id})
        assert org_config_before is None, "Test setup failed: org_config should not exist"
        
        # Verify NO subscription exists before login
        sub_before = self.db.subscriptions.find_one({
            "company_id": company_id,
            "status": {"$in": ["active", "trialing"]}
        })
        assert sub_before is None, "Test setup failed: subscription should not exist"
        
        # LOGIN - This should trigger ensure_user_data_complete()
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": email,
            "password": password
        })
        
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        token = login_response.json()["access_token"]
        
        # Verify organization_config was CREATED
        org_config_after = self.db.organization_configs.find_one({"company_id": company_id})
        assert org_config_after is not None, "FAIL: organization_config was NOT created on login!"
        
        # Verify industry_type is set
        assert "industry_type" in org_config_after, "FAIL: industry_type not set in org_config"
        assert org_config_after["industry_type"] in ["events", "agency", "generic"], \
            f"FAIL: Invalid industry_type: {org_config_after.get('industry_type')}"
        
        # Verify subscription was CREATED
        sub_after = self.db.subscriptions.find_one({
            "company_id": company_id,
            "status": {"$in": ["active", "trialing"]}
        })
        assert sub_after is not None, "FAIL: subscription was NOT created on login!"
        assert sub_after.get("plan_id") == "plan_professional", \
            f"FAIL: Expected plan_professional, got {sub_after.get('plan_id')}"
        
        # Verify user can access modules
        modules_response = self.session.get(
            f"{BASE_URL}/api/addons/enabled-modules",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert modules_response.status_code == 200, f"Get modules failed: {modules_response.text}"
        modules_data = modules_response.json()
        
        # Should have ALL core modules
        module_keys = [m["key"] for m in modules_data.get("modules", [])]
        core_modules = ["system_pulse", "client_engagement", "execution_hub", "business_clarity", "settings"]
        
        for core in core_modules:
            assert core in module_keys, f"FAIL: Core module '{core}' missing after backfill!"
        
        print(f"SUCCESS: User with no org_config got data back-filled on login")
        print(f"  - org_config created with industry_type: {org_config_after.get('industry_type')}")
        print(f"  - subscription created with status: {sub_after.get('status')}")
        print(f"  - All {len(core_modules)} core modules present: {module_keys}")
    
    def test_login_adds_industry_type_if_missing(self):
        """
        Test that logging in a user WITH org_config but WITHOUT industry_type populates it.
        """
        # Create user, company, and org_config WITHOUT industry_type
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        company_id = f"company_{uuid.uuid4().hex[:12]}"
        email = f"{self.test_prefix}_no_industry@example.com"
        password = "TestPass123!"
        now = datetime.now(timezone.utc)
        
        # Create company
        company_doc = {
            "company_id": company_id,
            "name": f"Test Company {self.test_prefix}",
            "industry_template": "professional_services",  # agency template
            "created_at": now.isoformat()
        }
        self.db.companies.insert_one(company_doc)
        self.created_companies.append(company_id)
        
        # Create org_config WITHOUT industry_type (old data scenario)
        org_config_doc = {
            "config_id": f"config_{uuid.uuid4().hex[:12]}",
            "company_id": company_id,
            "industry_template": "professional_services",
            # NOTE: NO industry_type field!
            "enabled_engagement_types": ["project"],
            "default_engagement_type": "project",
            "created_at": now.isoformat()
        }
        self.db.organization_configs.insert_one(org_config_doc)
        self.created_configs.append(company_id)
        
        # Create active subscription
        sub_doc = {
            "subscription_id": f"sub_{uuid.uuid4().hex[:12]}",
            "company_id": company_id,
            "plan_id": "plan_professional",
            "status": "active",
            "created_at": now.isoformat()
        }
        self.db.subscriptions.insert_one(sub_doc)
        self.created_subscriptions.append(company_id)
        
        # Create user
        user_doc = {
            "user_id": user_id,
            "email": email,
            "name": "Test No Industry User",
            "password_hash": hash_password(password),
            "company_id": company_id,
            "role": "admin",
            "created_at": now.isoformat()
        }
        self.db.users.insert_one(user_doc)
        self.created_users.append(user_id)
        
        # Verify NO industry_type before login
        config_before = self.db.organization_configs.find_one({"company_id": company_id})
        assert "industry_type" not in config_before or config_before.get("industry_type") is None, \
            "Test setup failed: industry_type should not exist"
        
        # LOGIN
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": email,
            "password": password
        })
        
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        
        # Verify industry_type was ADDED
        config_after = self.db.organization_configs.find_one({"company_id": company_id})
        assert "industry_type" in config_after, "FAIL: industry_type was NOT added!"
        assert config_after["industry_type"] == "agency", \
            f"FAIL: Expected 'agency' industry_type for professional_services template, got: {config_after.get('industry_type')}"
        
        print(f"SUCCESS: industry_type was populated on login")
        print(f"  - industry_type now: {config_after['industry_type']}")
    
    def test_login_creates_subscription_if_missing_or_expired(self):
        """
        Test that logging in a user WITHOUT active/trialing subscription creates one.
        """
        # Create user, company, org_config but WITHOUT subscription
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        company_id = f"company_{uuid.uuid4().hex[:12]}"
        email = f"{self.test_prefix}_no_sub@example.com"
        password = "TestPass123!"
        now = datetime.now(timezone.utc)
        
        # Create company
        company_doc = {
            "company_id": company_id,
            "name": f"Test Company {self.test_prefix}",
            "industry_template": "events_hospitality",
            "created_at": now.isoformat()
        }
        self.db.companies.insert_one(company_doc)
        self.created_companies.append(company_id)
        
        # Create org_config with industry_type
        org_config_doc = {
            "config_id": f"config_{uuid.uuid4().hex[:12]}",
            "company_id": company_id,
            "industry_template": "events_hospitality",
            "industry_type": "events",
            "created_at": now.isoformat()
        }
        self.db.organization_configs.insert_one(org_config_doc)
        self.created_configs.append(company_id)
        
        # NO subscription created - simulating cancelled/expired
        
        # Create user
        user_doc = {
            "user_id": user_id,
            "email": email,
            "name": "Test No Sub User",
            "password_hash": hash_password(password),
            "company_id": company_id,
            "role": "admin",
            "created_at": now.isoformat()
        }
        self.db.users.insert_one(user_doc)
        self.created_users.append(user_id)
        
        # Verify NO active subscription before login
        sub_before = self.db.subscriptions.find_one({
            "company_id": company_id,
            "status": {"$in": ["active", "trialing"]}
        })
        assert sub_before is None, "Test setup failed: subscription should not exist"
        
        # LOGIN
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": email,
            "password": password
        })
        
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        
        # Verify subscription was CREATED
        sub_after = self.db.subscriptions.find_one({
            "company_id": company_id,
            "status": {"$in": ["active", "trialing"]}
        })
        assert sub_after is not None, "FAIL: subscription was NOT created on login!"
        assert sub_after.get("status") == "trialing", \
            f"FAIL: Expected 'trialing' status, got: {sub_after.get('status')}"
        assert sub_after.get("plan_id") == "plan_professional", \
            f"FAIL: Expected 'plan_professional', got: {sub_after.get('plan_id')}"
        
        print(f"SUCCESS: Subscription was created on login")
        print(f"  - status: {sub_after.get('status')}")
        print(f"  - plan_id: {sub_after.get('plan_id')}")


class TestExistingUserScenarios:
    """
    Test the specific users mentioned in the bug report:
    - admin@staffdo.com
    - margaret.n.calderon@gmail.com
    
    These are existing Google OAuth users who only saw System Pulse and Settings.
    """
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.client = MongoClient(MONGO_URL)
        self.db = self.client[DB_NAME]
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        yield
        self.client.close()
    
    def test_check_demo_agency_user_has_complete_data(self):
        """Verify demo.agency@kora.com has complete org_config and subscription"""
        # Login
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo.agency@kora.com",
            "password": "Evoque2024!"
        })
        
        assert login_response.status_code == 200
        user = login_response.json()["user"]
        company_id = user["company_id"]
        
        # Check org_config
        org_config = self.db.organization_configs.find_one({"company_id": company_id})
        assert org_config is not None, "FAIL: org_config missing for demo user"
        assert "industry_type" in org_config, "FAIL: industry_type missing"
        
        # Check subscription
        subscription = self.db.subscriptions.find_one({
            "company_id": company_id,
            "status": {"$in": ["active", "trialing"]}
        })
        assert subscription is not None, "FAIL: active subscription missing for demo user"
        
        print(f"SUCCESS: demo.agency@kora.com has complete data")
        print(f"  - org_config.industry_type: {org_config.get('industry_type')}")
        print(f"  - subscription.status: {subscription.get('status')}")
        print(f"  - subscription.plan_id: {subscription.get('plan_id')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
