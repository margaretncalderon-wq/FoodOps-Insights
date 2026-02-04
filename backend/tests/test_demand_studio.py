"""
Demand Studio Module Tests
Tests for marketing campaigns, channels, spend tracking, activations, email marketing, and insights
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "margaret.n.calderon@gmail.com"
TEST_PASSWORD = "Evoque2024!"

# Test data prefix for cleanup
TEST_PREFIX = "TEST_DS_"


class TestDemandStudioAuth:
    """Authentication for Demand Studio tests"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, "No access_token in response"
        return data["access_token"]
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Get headers with auth token"""
        return {
            "Authorization": f"Bearer {auth_token}",
            "Content-Type": "application/json"
        }


class TestDemandStudioStats(TestDemandStudioAuth):
    """Test Demand Studio stats endpoint"""
    
    def test_get_stats(self, auth_headers):
        """GET /api/demand-studio/stats - Get dashboard statistics"""
        response = requests.get(f"{BASE_URL}/api/demand-studio/stats", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get stats: {response.text}"
        
        data = response.json()
        # Verify all expected fields are present
        assert "activeCampaigns" in data
        assert "spendMTD" in data
        assert "spendQTD" in data
        assert "leadsLinked" in data
        assert "opportunitiesLinked" in data
        assert "onlineSpend" in data
        assert "offlineSpend" in data
        
        # Verify data types
        assert isinstance(data["activeCampaigns"], int)
        assert isinstance(data["spendMTD"], (int, float))
        assert isinstance(data["spendQTD"], (int, float))
        print(f"Stats: {data}")


class TestCampaignsCRUD(TestDemandStudioAuth):
    """Test Campaigns CRUD operations"""
    
    @pytest.fixture(scope="class")
    def test_campaign_id(self, auth_headers):
        """Create a test campaign and return its ID"""
        campaign_data = {
            "name": f"{TEST_PREFIX}Campaign_{uuid.uuid4().hex[:8]}",
            "campaign_type": "acquisition",
            "objective": "Test campaign objective",
            "start_date": "2025-01-01",
            "end_date": "2025-12-31",
            "budget": 5000.0,
            "status": "draft",
            "tags": ["test", "automation"],
            "notes": "Created by automated test"
        }
        response = requests.post(f"{BASE_URL}/api/demand-studio/campaigns", 
                                json=campaign_data, headers=auth_headers)
        assert response.status_code == 200, f"Failed to create campaign: {response.text}"
        data = response.json()
        assert "campaign_id" in data
        yield data["campaign_id"]
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/demand-studio/campaigns/{data['campaign_id']}", 
                       headers=auth_headers)
    
    def test_create_campaign(self, auth_headers):
        """POST /api/demand-studio/campaigns - Create a new campaign"""
        campaign_data = {
            "name": f"{TEST_PREFIX}Create_Test_{uuid.uuid4().hex[:8]}",
            "campaign_type": "brand",
            "objective": "Brand awareness campaign",
            "budget": 10000.0,
            "status": "draft"
        }
        response = requests.post(f"{BASE_URL}/api/demand-studio/campaigns", 
                                json=campaign_data, headers=auth_headers)
        assert response.status_code == 200, f"Failed to create campaign: {response.text}"
        
        data = response.json()
        assert data["name"] == campaign_data["name"]
        assert data["campaign_type"] == "brand"
        assert data["budget"] == 10000.0
        assert "campaign_id" in data
        assert "created_at" in data
        print(f"Created campaign: {data['campaign_id']}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/demand-studio/campaigns/{data['campaign_id']}", 
                       headers=auth_headers)
    
    def test_get_campaigns_list(self, auth_headers):
        """GET /api/demand-studio/campaigns - Get all campaigns"""
        response = requests.get(f"{BASE_URL}/api/demand-studio/campaigns", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get campaigns: {response.text}"
        
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} campaigns")
    
    def test_get_campaigns_with_filter(self, auth_headers):
        """GET /api/demand-studio/campaigns?status=active - Filter campaigns"""
        response = requests.get(f"{BASE_URL}/api/demand-studio/campaigns?status=active", 
                               headers=auth_headers)
        assert response.status_code == 200, f"Failed to filter campaigns: {response.text}"
        
        data = response.json()
        assert isinstance(data, list)
        # All returned campaigns should be active
        for campaign in data:
            assert campaign.get("status") == "active"
        print(f"Found {len(data)} active campaigns")
    
    def test_get_single_campaign(self, auth_headers, test_campaign_id):
        """GET /api/demand-studio/campaigns/{id} - Get single campaign"""
        response = requests.get(f"{BASE_URL}/api/demand-studio/campaigns/{test_campaign_id}", 
                               headers=auth_headers)
        assert response.status_code == 200, f"Failed to get campaign: {response.text}"
        
        data = response.json()
        assert data["campaign_id"] == test_campaign_id
        assert "name" in data
        assert "budget" in data
        print(f"Got campaign: {data['name']}")
    
    def test_update_campaign(self, auth_headers, test_campaign_id):
        """PUT /api/demand-studio/campaigns/{id} - Update campaign"""
        update_data = {
            "name": f"{TEST_PREFIX}Updated_Campaign",
            "campaign_type": "retention",
            "objective": "Updated objective",
            "budget": 7500.0,
            "status": "active"
        }
        response = requests.put(f"{BASE_URL}/api/demand-studio/campaigns/{test_campaign_id}", 
                               json=update_data, headers=auth_headers)
        assert response.status_code == 200, f"Failed to update campaign: {response.text}"
        
        data = response.json()
        assert data["name"] == update_data["name"]
        assert data["status"] == "active"
        assert data["budget"] == 7500.0
        print(f"Updated campaign: {data['campaign_id']}")
        
        # Verify persistence with GET
        get_response = requests.get(f"{BASE_URL}/api/demand-studio/campaigns/{test_campaign_id}", 
                                   headers=auth_headers)
        assert get_response.status_code == 200
        get_data = get_response.json()
        assert get_data["status"] == "active"
    
    def test_delete_campaign(self, auth_headers):
        """DELETE /api/demand-studio/campaigns/{id} - Delete campaign"""
        # Create a campaign to delete
        campaign_data = {
            "name": f"{TEST_PREFIX}Delete_Test_{uuid.uuid4().hex[:8]}",
            "campaign_type": "acquisition",
            "budget": 1000.0
        }
        create_response = requests.post(f"{BASE_URL}/api/demand-studio/campaigns", 
                                       json=campaign_data, headers=auth_headers)
        assert create_response.status_code == 200
        campaign_id = create_response.json()["campaign_id"]
        
        # Delete the campaign
        delete_response = requests.delete(f"{BASE_URL}/api/demand-studio/campaigns/{campaign_id}", 
                                         headers=auth_headers)
        assert delete_response.status_code == 200, f"Failed to delete campaign: {delete_response.text}"
        
        # Verify deletion with GET
        get_response = requests.get(f"{BASE_URL}/api/demand-studio/campaigns/{campaign_id}", 
                                   headers=auth_headers)
        assert get_response.status_code == 404
        print(f"Deleted campaign: {campaign_id}")


class TestCampaignChannels(TestDemandStudioAuth):
    """Test Campaign Channels CRUD"""
    
    @pytest.fixture(scope="class")
    def test_campaign_for_channels(self, auth_headers):
        """Create a campaign for channel tests"""
        campaign_data = {
            "name": f"{TEST_PREFIX}Channel_Test_Campaign",
            "campaign_type": "acquisition",
            "budget": 5000.0
        }
        response = requests.post(f"{BASE_URL}/api/demand-studio/campaigns", 
                                json=campaign_data, headers=auth_headers)
        assert response.status_code == 200
        campaign_id = response.json()["campaign_id"]
        yield campaign_id
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/demand-studio/campaigns/{campaign_id}", 
                       headers=auth_headers)
    
    def test_create_channel(self, auth_headers, test_campaign_for_channels):
        """POST /api/demand-studio/channels - Create a channel"""
        channel_data = {
            "campaign_id": test_campaign_for_channels,
            "channel_type": "facebook",
            "channel_name": f"{TEST_PREFIX}Facebook Ads",
            "budget_allocated": 2000.0,
            "status": "active",
            "notes": "Test channel"
        }
        response = requests.post(f"{BASE_URL}/api/demand-studio/channels", 
                                json=channel_data, headers=auth_headers)
        assert response.status_code == 200, f"Failed to create channel: {response.text}"
        
        data = response.json()
        assert "channel_id" in data
        assert data["channel_type"] == "facebook"
        assert data["budget_allocated"] == 2000.0
        print(f"Created channel: {data['channel_id']}")
    
    def test_get_channels(self, auth_headers):
        """GET /api/demand-studio/channels - Get all channels"""
        response = requests.get(f"{BASE_URL}/api/demand-studio/channels", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get channels: {response.text}"
        
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} channels")
    
    def test_get_channels_by_campaign(self, auth_headers, test_campaign_for_channels):
        """GET /api/demand-studio/channels?campaign_id=X - Filter by campaign"""
        response = requests.get(
            f"{BASE_URL}/api/demand-studio/channels?campaign_id={test_campaign_for_channels}", 
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        for channel in data:
            assert channel["campaign_id"] == test_campaign_for_channels


class TestSpendLedger(TestDemandStudioAuth):
    """Test Spend Ledger CRUD"""
    
    @pytest.fixture(scope="class")
    def test_campaign_for_spend(self, auth_headers):
        """Create a campaign for spend tests"""
        campaign_data = {
            "name": f"{TEST_PREFIX}Spend_Test_Campaign",
            "campaign_type": "acquisition",
            "budget": 10000.0
        }
        response = requests.post(f"{BASE_URL}/api/demand-studio/campaigns", 
                                json=campaign_data, headers=auth_headers)
        assert response.status_code == 200
        campaign_id = response.json()["campaign_id"]
        yield campaign_id
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/demand-studio/campaigns/{campaign_id}", 
                       headers=auth_headers)
    
    def test_record_spend(self, auth_headers, test_campaign_for_spend):
        """POST /api/demand-studio/spend - Record spend"""
        spend_data = {
            "campaign_id": test_campaign_for_spend,
            "spend_type": "media",
            "category": "online",
            "amount": 500.0,
            "spend_date": "2025-01-15",
            "description": "Facebook ads spend",
            "vendor": "Meta",
            "invoice_ref": "INV-001"
        }
        response = requests.post(f"{BASE_URL}/api/demand-studio/spend", 
                                json=spend_data, headers=auth_headers)
        assert response.status_code == 200, f"Failed to record spend: {response.text}"
        
        data = response.json()
        assert "spend_id" in data
        assert data["amount"] == 500.0
        assert data["category"] == "online"
        print(f"Recorded spend: {data['spend_id']}")
        
        # Verify campaign actual_spend was updated
        campaign_response = requests.get(
            f"{BASE_URL}/api/demand-studio/campaigns/{test_campaign_for_spend}", 
            headers=auth_headers
        )
        campaign_data = campaign_response.json()
        assert campaign_data["actual_spend"] >= 500.0
    
    def test_get_spend_records(self, auth_headers):
        """GET /api/demand-studio/spend - Get all spend records"""
        response = requests.get(f"{BASE_URL}/api/demand-studio/spend", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get spend: {response.text}"
        
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} spend records")
    
    def test_get_spend_by_category(self, auth_headers):
        """GET /api/demand-studio/spend?category=online - Filter by category"""
        response = requests.get(f"{BASE_URL}/api/demand-studio/spend?category=online", 
                               headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        for record in data:
            assert record["category"] == "online"
    
    def test_delete_spend(self, auth_headers, test_campaign_for_spend):
        """DELETE /api/demand-studio/spend/{id} - Delete spend record"""
        # Create spend to delete
        spend_data = {
            "campaign_id": test_campaign_for_spend,
            "spend_type": "creative",
            "category": "offline",
            "amount": 100.0
        }
        create_response = requests.post(f"{BASE_URL}/api/demand-studio/spend", 
                                       json=spend_data, headers=auth_headers)
        assert create_response.status_code == 200
        spend_id = create_response.json()["spend_id"]
        
        # Delete
        delete_response = requests.delete(f"{BASE_URL}/api/demand-studio/spend/{spend_id}", 
                                         headers=auth_headers)
        assert delete_response.status_code == 200
        print(f"Deleted spend: {spend_id}")


class TestActivations(TestDemandStudioAuth):
    """Test Marketing Activations CRUD"""
    
    def test_create_activation(self, auth_headers):
        """POST /api/demand-studio/activations - Create activation"""
        activation_data = {
            "name": f"{TEST_PREFIX}Test_Activation_{uuid.uuid4().hex[:8]}",
            "activation_type": "event",
            "start_date": "2025-02-01",
            "end_date": "2025-02-03",
            "location": "Miami Convention Center",
            "budget": 3000.0,
            "status": "planned",
            "notes": "Test activation"
        }
        response = requests.post(f"{BASE_URL}/api/demand-studio/activations", 
                                json=activation_data, headers=auth_headers)
        assert response.status_code == 200, f"Failed to create activation: {response.text}"
        
        data = response.json()
        assert "activation_id" in data
        assert data["name"] == activation_data["name"]
        assert data["activation_type"] == "event"
        print(f"Created activation: {data['activation_id']}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/demand-studio/activations/{data['activation_id']}", 
                       headers=auth_headers)
    
    def test_get_activations(self, auth_headers):
        """GET /api/demand-studio/activations - Get all activations"""
        response = requests.get(f"{BASE_URL}/api/demand-studio/activations", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get activations: {response.text}"
        
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} activations")
    
    def test_update_activation(self, auth_headers):
        """PUT /api/demand-studio/activations/{id} - Update activation"""
        # Create activation
        activation_data = {
            "name": f"{TEST_PREFIX}Update_Test",
            "activation_type": "promo",
            "budget": 1000.0,
            "status": "planned"
        }
        create_response = requests.post(f"{BASE_URL}/api/demand-studio/activations", 
                                       json=activation_data, headers=auth_headers)
        assert create_response.status_code == 200
        activation_id = create_response.json()["activation_id"]
        
        # Update
        update_data = {
            "name": f"{TEST_PREFIX}Updated_Activation",
            "activation_type": "promo",
            "budget": 2000.0,
            "status": "active"
        }
        update_response = requests.put(
            f"{BASE_URL}/api/demand-studio/activations/{activation_id}", 
            json=update_data, headers=auth_headers
        )
        assert update_response.status_code == 200
        
        updated = update_response.json()
        assert updated["status"] == "active"
        assert updated["budget"] == 2000.0
        print(f"Updated activation: {activation_id}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/demand-studio/activations/{activation_id}", 
                       headers=auth_headers)


class TestEmailMarketing(TestDemandStudioAuth):
    """Test Email Marketing CRUD"""
    
    def test_create_email_campaign(self, auth_headers):
        """POST /api/demand-studio/emails - Create email campaign"""
        email_data = {
            "name": f"{TEST_PREFIX}Newsletter_{uuid.uuid4().hex[:8]}",
            "segment": "All Subscribers",
            "list_size": 5000,
            "send_date": "2025-02-15",
            "status": "draft",
            "cost": 50.0,
            "notes": "Monthly newsletter"
        }
        response = requests.post(f"{BASE_URL}/api/demand-studio/emails", 
                                json=email_data, headers=auth_headers)
        assert response.status_code == 200, f"Failed to create email: {response.text}"
        
        data = response.json()
        assert "email_id" in data
        assert data["name"] == email_data["name"]
        assert data["list_size"] == 5000
        assert data["sent_count"] == 0  # Initial value
        assert data["open_count"] == 0
        assert data["click_count"] == 0
        print(f"Created email campaign: {data['email_id']}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/demand-studio/emails/{data['email_id']}", 
                       headers=auth_headers)
    
    def test_get_emails(self, auth_headers):
        """GET /api/demand-studio/emails - Get all email campaigns"""
        response = requests.get(f"{BASE_URL}/api/demand-studio/emails", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get emails: {response.text}"
        
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} email campaigns")
    
    def test_update_email_stats(self, auth_headers):
        """PUT /api/demand-studio/emails/{id} - Update email stats"""
        # Create email
        email_data = {
            "name": f"{TEST_PREFIX}Stats_Test",
            "list_size": 1000,
            "status": "sent"
        }
        create_response = requests.post(f"{BASE_URL}/api/demand-studio/emails", 
                                       json=email_data, headers=auth_headers)
        assert create_response.status_code == 200
        email_id = create_response.json()["email_id"]
        
        # Update stats
        update_data = {
            "sent_count": 950,
            "open_count": 380,
            "click_count": 95,
            "status": "completed"
        }
        update_response = requests.put(f"{BASE_URL}/api/demand-studio/emails/{email_id}", 
                                      json=update_data, headers=auth_headers)
        assert update_response.status_code == 200
        
        updated = update_response.json()
        assert updated["sent_count"] == 950
        assert updated["open_count"] == 380
        assert updated["click_count"] == 95
        print(f"Updated email stats: {email_id}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/demand-studio/emails/{email_id}", 
                       headers=auth_headers)


class TestInsights(TestDemandStudioAuth):
    """Test Insights endpoint"""
    
    def test_get_insights(self, auth_headers):
        """GET /api/demand-studio/insights - Get campaign insights"""
        response = requests.get(f"{BASE_URL}/api/demand-studio/insights", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get insights: {response.text}"
        
        data = response.json()
        assert "campaigns" in data
        assert "summary" in data
        
        summary = data["summary"]
        assert "total_campaigns" in summary
        assert "active_campaigns" in summary
        assert "total_budget" in summary
        assert "total_spend" in summary
        assert "budget_utilization" in summary
        assert "total_leads_linked" in summary
        assert "total_opportunities_linked" in summary
        assert "cost_per_lead" in summary
        assert "cost_per_opportunity" in summary
        
        print(f"Insights summary: {summary}")


# Run tests
if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
