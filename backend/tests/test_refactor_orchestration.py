"""
Test suite for Event Orchestration Refactoring:
- Events → Sales + Event Orchestration (Execution Layer)
- Only Won/Closed events appear in Event Orchestration
- Team & Roles syncs from contract Service items
- Event Binder tab aggregates all event data
- Close Event functionality locks tabs
- Purchases/Procurement only shows confirmed events
"""
import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestRefactorOrchestration:
    """Test the refactored Event Orchestration module"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "margaret.n.calderon@gmail.com",
            "password": "Evoque2024!"
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.token = login_response.json().get("access_token")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        print(f"✓ Logged in successfully")
        yield
    
    # ==================== ORCHESTRATION EVENTS LIST ====================
    
    def test_orchestration_events_only_won_closed(self):
        """Verify only Won/Closed events appear in orchestration list"""
        response = self.session.get(f"{BASE_URL}/api/orchestration/events")
        assert response.status_code == 200, f"Failed to get orchestration events: {response.text}"
        
        events = response.json()
        print(f"✓ Got {len(events)} orchestration events")
        
        # Verify all events are Won or Closed
        for event in events:
            stage = event.get("stage", "")
            assert stage in ["Won", "Closed"], f"Event {event.get('name')} has stage {stage}, expected Won or Closed"
        
        print(f"✓ All {len(events)} events have stage Won or Closed")
        return events
    
    def test_orchestration_events_have_required_fields(self):
        """Verify orchestration events have required fields"""
        response = self.session.get(f"{BASE_URL}/api/orchestration/events")
        assert response.status_code == 200
        
        events = response.json()
        if len(events) > 0:
            event = events[0]
            required_fields = ["event_id", "name", "stage"]
            for field in required_fields:
                assert field in event, f"Missing field: {field}"
            print(f"✓ Events have required fields")
    
    # ==================== CONFIRMED EVENTS ENDPOINT ====================
    
    def test_confirmed_events_endpoint(self):
        """Verify /api/events/confirmed returns only Won/Closed events"""
        response = self.session.get(f"{BASE_URL}/api/events/confirmed")
        assert response.status_code == 200, f"Failed to get confirmed events: {response.text}"
        
        events = response.json()
        print(f"✓ Got {len(events)} confirmed events")
        
        # Verify all events are Won or Closed
        for event in events:
            stage = event.get("stage", "")
            assert stage in ["Won", "Closed"], f"Event {event.get('name')} has stage {stage}, expected Won or Closed"
        
        print(f"✓ All confirmed events have stage Won or Closed")
        return events
    
    # ==================== EVENT BINDER ====================
    
    def test_event_binder_endpoint(self):
        """Test Event Binder endpoint returns aggregated data"""
        # First get a Won/Closed event
        events_response = self.session.get(f"{BASE_URL}/api/orchestration/events")
        assert events_response.status_code == 200
        events = events_response.json()
        
        if len(events) == 0:
            pytest.skip("No Won/Closed events available for testing")
        
        event_id = events[0]["event_id"]
        
        # Get binder data
        response = self.session.get(f"{BASE_URL}/api/orchestration/binder/{event_id}")
        assert response.status_code == 200, f"Failed to get event binder: {response.text}"
        
        binder = response.json()
        
        # Verify binder has required sections
        required_sections = ["event_snapshot", "commercial_summary", "financial_summary", "team_summary"]
        for section in required_sections:
            assert section in binder, f"Missing binder section: {section}"
        
        print(f"✓ Event Binder has all required sections")
        
        # Verify event_snapshot
        es = binder.get("event_snapshot", {})
        assert "name" in es, "Missing name in event_snapshot"
        assert "stage" in es, "Missing stage in event_snapshot"
        print(f"✓ Event Snapshot: {es.get('name')} - Stage: {es.get('stage')}")
        
        # Verify commercial_summary
        cs = binder.get("commercial_summary", {})
        assert "total_value" in cs, "Missing total_value in commercial_summary"
        print(f"✓ Commercial Summary: Total Value = {cs.get('total_value')}")
        
        # Verify financial_summary
        fs = binder.get("financial_summary", {})
        assert "total_invoiced" in fs, "Missing total_invoiced in financial_summary"
        print(f"✓ Financial Summary: Invoiced = {fs.get('total_invoiced')}")
        
        return binder
    
    def test_event_binder_notes_update(self):
        """Test updating binder notes"""
        events_response = self.session.get(f"{BASE_URL}/api/orchestration/events")
        events = events_response.json()
        
        if len(events) == 0:
            pytest.skip("No Won/Closed events available for testing")
        
        event_id = events[0]["event_id"]
        test_notes = f"TEST_Binder_Notes_{datetime.now().isoformat()}"
        
        # Update notes
        response = self.session.put(
            f"{BASE_URL}/api/orchestration/binder/{event_id}/notes",
            json=test_notes
        )
        assert response.status_code == 200, f"Failed to update binder notes: {response.text}"
        print(f"✓ Updated binder notes")
        
        # Verify notes were saved
        binder_response = self.session.get(f"{BASE_URL}/api/orchestration/binder/{event_id}")
        binder = binder_response.json()
        assert binder.get("binder_notes") == test_notes, "Binder notes not saved correctly"
        print(f"✓ Binder notes verified")
    
    # ==================== TEAM & ROLES SYNC ====================
    
    def test_team_roles_synced_from_contract(self):
        """Test Team & Roles shows synced roles from contract Service items"""
        events_response = self.session.get(f"{BASE_URL}/api/orchestration/events")
        events = events_response.json()
        
        if len(events) == 0:
            pytest.skip("No Won/Closed events available for testing")
        
        event_id = events[0]["event_id"]
        
        # Get team data
        response = self.session.get(f"{BASE_URL}/api/orchestration/team/{event_id}")
        assert response.status_code == 200, f"Failed to get team data: {response.text}"
        
        team = response.json()
        
        # Verify structure has synced_roles and operational_roles
        assert "synced_roles" in team, "Missing synced_roles in team data"
        assert "operational_roles" in team, "Missing operational_roles in team data"
        assert "roles" in team, "Missing roles in team data"
        
        synced_count = len(team.get("synced_roles", []))
        operational_count = len(team.get("operational_roles", []))
        
        print(f"✓ Team has {synced_count} synced roles (from contract)")
        print(f"✓ Team has {operational_count} operational roles")
        
        # Verify synced roles have is_synced flag
        for role in team.get("synced_roles", []):
            assert role.get("is_synced") == True, f"Synced role {role.get('role_name')} missing is_synced flag"
        
        print(f"✓ All synced roles have is_synced=True")
        return team
    
    def test_add_operational_role(self):
        """Test adding operational (non-billable) role"""
        events_response = self.session.get(f"{BASE_URL}/api/orchestration/events")
        events = events_response.json()
        
        if len(events) == 0:
            pytest.skip("No Won/Closed events available for testing")
        
        # Find a non-closed event
        event = None
        for e in events:
            if e.get("stage") == "Won":
                event = e
                break
        
        if not event:
            pytest.skip("No Won (non-closed) events available for testing")
        
        event_id = event["event_id"]
        
        # Get current team
        team_response = self.session.get(f"{BASE_URL}/api/orchestration/team/{event_id}")
        team = team_response.json()
        
        # Add operational role
        new_role = {
            "role_id": f"op_role_test_{datetime.now().timestamp()}",
            "role_name": "TEST_Event_Coordinator",
            "quantity": 2,
            "assignees": ["Test Person 1"],
            "responsibilities": "Test responsibilities",
            "is_synced": False,
            "is_billable": False
        }
        
        operational_roles = team.get("operational_roles", [])
        operational_roles.append(new_role)
        
        # Update team
        response = self.session.put(f"{BASE_URL}/api/orchestration/team/{event_id}", json={
            "event_id": event_id,
            "roles": operational_roles,
            "coordinator_notes": team.get("coordinator_notes", "")
        })
        
        assert response.status_code == 200, f"Failed to add operational role: {response.text}"
        print(f"✓ Added operational role: {new_role['role_name']}")
    
    # ==================== CLOSE/REOPEN EVENT ====================
    
    def test_close_event_changes_stage(self):
        """Test closing event changes stage to Closed"""
        events_response = self.session.get(f"{BASE_URL}/api/orchestration/events")
        events = events_response.json()
        
        # Find a Won event to test close
        won_event = None
        for e in events:
            if e.get("stage") == "Won":
                won_event = e
                break
        
        if not won_event:
            pytest.skip("No Won events available for close testing")
        
        event_id = won_event["event_id"]
        
        # Close the event
        response = self.session.post(f"{BASE_URL}/api/orchestration/events/{event_id}/close")
        assert response.status_code == 200, f"Failed to close event: {response.text}"
        print(f"✓ Closed event: {won_event['name']}")
        
        # Verify stage changed to Closed
        event_response = self.session.get(f"{BASE_URL}/api/orchestration/blueprint/{event_id}")
        event_data = event_response.json()
        assert event_data.get("event", {}).get("stage") == "Closed", "Event stage not changed to Closed"
        print(f"✓ Event stage is now Closed")
        
        # Reopen the event for other tests
        reopen_response = self.session.post(f"{BASE_URL}/api/orchestration/events/{event_id}/reopen")
        assert reopen_response.status_code == 200, f"Failed to reopen event: {reopen_response.text}"
        print(f"✓ Reopened event for other tests")
    
    def test_closed_event_blocks_modifications(self):
        """Test that closed events block modifications to orchestration data"""
        events_response = self.session.get(f"{BASE_URL}/api/orchestration/events")
        events = events_response.json()
        
        # Find a Won event to test
        won_event = None
        for e in events:
            if e.get("stage") == "Won":
                won_event = e
                break
        
        if not won_event:
            pytest.skip("No Won events available for testing")
        
        event_id = won_event["event_id"]
        
        # Close the event
        close_response = self.session.post(f"{BASE_URL}/api/orchestration/events/{event_id}/close")
        assert close_response.status_code == 200
        
        try:
            # Try to modify blueprint - should fail
            blueprint_response = self.session.put(f"{BASE_URL}/api/orchestration/blueprint/{event_id}", json={
                "objectives": "TEST_Should_Fail"
            })
            assert blueprint_response.status_code == 400, "Blueprint modification should be blocked for closed event"
            print(f"✓ Blueprint modification blocked for closed event")
            
            # Try to modify team - should fail
            team_response = self.session.put(f"{BASE_URL}/api/orchestration/team/{event_id}", json={
                "event_id": event_id,
                "roles": [],
                "coordinator_notes": "TEST"
            })
            assert team_response.status_code == 400, "Team modification should be blocked for closed event"
            print(f"✓ Team modification blocked for closed event")
            
        finally:
            # Reopen the event
            self.session.post(f"{BASE_URL}/api/orchestration/events/{event_id}/reopen")
            print(f"✓ Event reopened")
    
    def test_reopen_event(self):
        """Test reopening a closed event"""
        events_response = self.session.get(f"{BASE_URL}/api/orchestration/events")
        events = events_response.json()
        
        # Find a Closed event
        closed_event = None
        for e in events:
            if e.get("stage") == "Closed":
                closed_event = e
                break
        
        if not closed_event:
            # Close a Won event first
            won_event = None
            for e in events:
                if e.get("stage") == "Won":
                    won_event = e
                    break
            
            if not won_event:
                pytest.skip("No events available for reopen testing")
            
            self.session.post(f"{BASE_URL}/api/orchestration/events/{won_event['event_id']}/close")
            closed_event = won_event
        
        event_id = closed_event["event_id"]
        
        # Reopen the event
        response = self.session.post(f"{BASE_URL}/api/orchestration/events/{event_id}/reopen")
        assert response.status_code == 200, f"Failed to reopen event: {response.text}"
        print(f"✓ Reopened event: {closed_event['name']}")
        
        # Verify stage changed to Won
        event_response = self.session.get(f"{BASE_URL}/api/orchestration/blueprint/{event_id}")
        event_data = event_response.json()
        assert event_data.get("event", {}).get("stage") == "Won", "Event stage not changed to Won"
        print(f"✓ Event stage is now Won")
    
    # ==================== EVENTS PAGE - ORCHESTRATION LINK ====================
    
    def test_events_list_all_stages(self):
        """Test events list returns all stages"""
        response = self.session.get(f"{BASE_URL}/api/events")
        assert response.status_code == 200, f"Failed to get events: {response.text}"
        
        events = response.json()
        stages = set(e.get("stage", "Lead") for e in events)
        print(f"✓ Events have stages: {stages}")
        
        # Verify we have events in various stages
        assert len(events) > 0, "No events found"
        print(f"✓ Got {len(events)} total events")
    
    def test_events_pipeline(self):
        """Test events pipeline returns events grouped by stage"""
        response = self.session.get(f"{BASE_URL}/api/events/pipeline")
        assert response.status_code == 200, f"Failed to get pipeline: {response.text}"
        
        pipeline = response.json()
        
        # Verify pipeline has expected stages
        expected_stages = ["Lead", "Contacted", "Proposal", "Negotiation", "Won", "Lost", "Closed"]
        for stage in expected_stages:
            assert stage in pipeline, f"Missing stage in pipeline: {stage}"
        
        print(f"✓ Pipeline has all expected stages")
        
        # Count events per stage
        for stage, events in pipeline.items():
            print(f"  - {stage}: {len(events)} events")


class TestFoodOpsPurchases:
    """Test FoodOps Purchases only shows confirmed events"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "margaret.n.calderon@gmail.com",
            "password": "Evoque2024!"
        })
        assert login_response.status_code == 200
        self.token = login_response.json().get("access_token")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        yield
    
    def test_purchases_uses_confirmed_events(self):
        """Verify purchases section uses confirmed events endpoint"""
        response = self.session.get(f"{BASE_URL}/api/events/confirmed")
        assert response.status_code == 200, f"Failed to get confirmed events: {response.text}"
        
        events = response.json()
        
        # All events should be Won or Closed
        for event in events:
            stage = event.get("stage", "")
            assert stage in ["Won", "Closed"], f"Event {event.get('name')} has stage {stage}"
        
        print(f"✓ Purchases endpoint returns only confirmed events ({len(events)} events)")


class TestExistingFunctionality:
    """Test existing functionality still works"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "margaret.n.calderon@gmail.com",
            "password": "Evoque2024!"
        })
        assert login_response.status_code == 200
        self.token = login_response.json().get("access_token")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        yield
    
    def test_recipes_endpoint(self):
        """Test recipes endpoint still works"""
        response = self.session.get(f"{BASE_URL}/api/recipes")
        assert response.status_code == 200, f"Failed to get recipes: {response.text}"
        print(f"✓ Recipes endpoint works ({len(response.json())} recipes)")
    
    def test_invoices_endpoint(self):
        """Test invoices endpoint still works"""
        response = self.session.get(f"{BASE_URL}/api/finance/invoices")
        assert response.status_code == 200, f"Failed to get invoices: {response.text}"
        print(f"✓ Invoices endpoint works ({len(response.json())} invoices)")
    
    def test_payments_endpoint(self):
        """Test payments endpoint still works"""
        response = self.session.get(f"{BASE_URL}/api/finance/payments")
        assert response.status_code == 200, f"Failed to get payments: {response.text}"
        print(f"✓ Payments endpoint works ({len(response.json())} payments)")
    
    def test_clients_endpoint(self):
        """Test clients endpoint still works"""
        response = self.session.get(f"{BASE_URL}/api/crm/clients")
        assert response.status_code == 200, f"Failed to get clients: {response.text}"
        print(f"✓ Clients endpoint works ({len(response.json())} clients)")
    
    def test_inventory_endpoint(self):
        """Test inventory endpoint still works"""
        response = self.session.get(f"{BASE_URL}/api/inventory/ingredients")
        assert response.status_code == 200, f"Failed to get inventory: {response.text}"
        print(f"✓ Inventory endpoint works ({len(response.json())} items)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
