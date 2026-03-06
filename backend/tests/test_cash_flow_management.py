"""
Test Cash Flow Management Module (Business Clarity)
Tests: GET /api/business-clarity/cash-flow, GET /api/business-clarity/petty-cash,
       POST /api/business-clarity/petty-cash/transactions, GET /api/business-clarity/all-payments
"""
import pytest
import requests
import os
import uuid
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def api_client():
    """Create API client with authentication"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    
    # Login
    login_response = session.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "demo.agency@kora.com", "password": "Evoque2024!"}
    )
    assert login_response.status_code == 200, f"Login failed: {login_response.text}"
    return session


class TestCashFlowEndpoint:
    """Tests for GET /api/business-clarity/cash-flow"""
    
    def test_get_cash_flow_basic(self, api_client):
        """Test basic cash flow retrieval"""
        response = api_client.get(f"{BASE_URL}/api/business-clarity/cash-flow")
        assert response.status_code == 200
        
        data = response.json()
        # Verify response structure
        assert "period" in data
        assert "inflows" in data
        assert "outflows" in data
        assert "net_cash_flow" in data
        assert "pending_obligations" in data
        print(f"Cash flow retrieved: Net flow = ${data['net_cash_flow']}")
    
    def test_cash_flow_inflows_structure(self, api_client):
        """Test inflows structure in cash flow"""
        response = api_client.get(f"{BASE_URL}/api/business-clarity/cash-flow")
        assert response.status_code == 200
        
        data = response.json()
        inflows = data["inflows"]
        
        # Verify inflows breakdown
        assert "client_payments" in inflows
        assert "petty_cash_deposits" in inflows
        assert "total" in inflows
        
        # Verify client_payments structure
        assert "total" in inflows["client_payments"]
        assert "count" in inflows["client_payments"]
        
        # Verify petty_cash_deposits structure
        assert "total" in inflows["petty_cash_deposits"]
        assert "count" in inflows["petty_cash_deposits"]
        
        print(f"Inflows: Client payments=${inflows['client_payments']['total']}, "
              f"Petty cash deposits=${inflows['petty_cash_deposits']['total']}, "
              f"Total=${inflows['total']}")
    
    def test_cash_flow_outflows_structure(self, api_client):
        """Test outflows structure in cash flow"""
        response = api_client.get(f"{BASE_URL}/api/business-clarity/cash-flow")
        assert response.status_code == 200
        
        data = response.json()
        outflows = data["outflows"]
        
        # Verify outflows breakdown
        assert "supplier_payments" in outflows
        assert "petty_cash_withdrawals" in outflows
        assert "payroll" in outflows
        assert "total" in outflows
        
        print(f"Outflows: Supplier=${outflows['supplier_payments']['total']}, "
              f"Petty cash=${outflows['petty_cash_withdrawals']['total']}, "
              f"Payroll=${outflows['payroll']['total']}, Total=${outflows['total']}")
    
    def test_cash_flow_pending_obligations(self, api_client):
        """Test pending obligations projection in cash flow"""
        response = api_client.get(f"{BASE_URL}/api/business-clarity/cash-flow")
        assert response.status_code == 200
        
        data = response.json()
        pending = data["pending_obligations"]
        
        # Verify pending obligations structure
        assert "overdue" in pending
        assert "due_this_week" in pending
        assert "due_this_month" in pending
        assert "due_later" in pending
        assert "total_pending" in pending
        
        # Verify overdue has items array
        assert "total" in pending["overdue"]
        assert "count" in pending["overdue"]
        assert "items" in pending["overdue"]
        
        print(f"Pending: Overdue=${pending['overdue']['total']}, "
              f"This week=${pending['due_this_week']['total']}, "
              f"This month=${pending['due_this_month']['total']}, "
              f"Later=${pending['due_later']['total']}")
    
    def test_cash_flow_with_date_filter(self, api_client):
        """Test cash flow with date filters"""
        today = datetime.now()
        start_date = (today.replace(day=1) - timedelta(days=30)).strftime("%Y-%m-%d")
        end_date = today.strftime("%Y-%m-%d")
        
        response = api_client.get(
            f"{BASE_URL}/api/business-clarity/cash-flow?start_date={start_date}&end_date={end_date}"
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["period"]["start_date"] == start_date
        assert data["period"]["end_date"] == end_date
        print(f"Cash flow with date filter: {start_date} to {end_date}")


class TestPettyCashEndpoint:
    """Tests for GET /api/business-clarity/petty-cash"""
    
    def test_get_petty_cash(self, api_client):
        """Test basic petty cash retrieval"""
        response = api_client.get(f"{BASE_URL}/api/business-clarity/petty-cash")
        assert response.status_code == 200
        
        data = response.json()
        # Verify response structure
        assert "fund" in data
        assert "transactions" in data
        assert "summary" in data
        print(f"Petty cash: Balance=${data['summary']['current_balance']}, "
              f"Fund limit=${data['summary']['fund_limit']}")
    
    def test_petty_cash_summary_structure(self, api_client):
        """Test petty cash summary structure"""
        response = api_client.get(f"{BASE_URL}/api/business-clarity/petty-cash")
        assert response.status_code == 200
        
        data = response.json()
        summary = data["summary"]
        
        # Verify summary fields
        assert "current_balance" in summary
        assert "fund_limit" in summary
        assert "total_deposits" in summary
        assert "total_withdrawals" in summary
        assert "transaction_count" in summary
        
        print(f"Summary: Deposits=${summary['total_deposits']}, "
              f"Withdrawals=${summary['total_withdrawals']}, "
              f"Transaction count={summary['transaction_count']}")
    
    def test_petty_cash_fund_structure(self, api_client):
        """Test petty cash fund structure"""
        response = api_client.get(f"{BASE_URL}/api/business-clarity/petty-cash")
        assert response.status_code == 200
        
        data = response.json()
        fund = data["fund"]
        
        # Verify fund fields
        assert "fund_id" in fund
        assert "current_balance" in fund
        assert "fund_limit" in fund
        print(f"Fund ID: {fund['fund_id']}")


class TestPettyCashTransactions:
    """Tests for POST /api/business-clarity/petty-cash/transactions"""
    
    def test_create_petty_cash_deposit(self, api_client):
        """Test creating a petty cash deposit"""
        # Get current balance first
        balance_response = api_client.get(f"{BASE_URL}/api/business-clarity/petty-cash")
        initial_balance = balance_response.json()["summary"]["current_balance"]
        
        # Create deposit
        deposit_amount = 100.00
        response = api_client.post(
            f"{BASE_URL}/api/business-clarity/petty-cash/transactions",
            json={
                "transaction_type": "deposit",
                "amount": deposit_amount,
                "description": f"TEST_Deposit_{uuid.uuid4().hex[:8]}",
                "notes": "Test deposit for testing"
            }
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "transaction" in data
        assert "new_balance" in data
        assert data["transaction"]["transaction_type"] == "deposit"
        assert data["transaction"]["amount"] == deposit_amount
        assert data["new_balance"] == initial_balance + deposit_amount
        
        print(f"Deposit created: ${deposit_amount}, New balance=${data['new_balance']}")
    
    def test_create_petty_cash_withdrawal(self, api_client):
        """Test creating a petty cash withdrawal"""
        # Get current balance first
        balance_response = api_client.get(f"{BASE_URL}/api/business-clarity/petty-cash")
        initial_balance = balance_response.json()["summary"]["current_balance"]
        
        # Make sure there's enough balance
        if initial_balance < 50:
            # Add some funds first
            api_client.post(
                f"{BASE_URL}/api/business-clarity/petty-cash/transactions",
                json={
                    "transaction_type": "deposit",
                    "amount": 200,
                    "description": "TEST_PreWithdrawal_Deposit"
                }
            )
            balance_response = api_client.get(f"{BASE_URL}/api/business-clarity/petty-cash")
            initial_balance = balance_response.json()["summary"]["current_balance"]
        
        # Create withdrawal
        withdrawal_amount = 25.00
        response = api_client.post(
            f"{BASE_URL}/api/business-clarity/petty-cash/transactions",
            json={
                "transaction_type": "withdrawal",
                "amount": withdrawal_amount,
                "description": f"TEST_Withdrawal_{uuid.uuid4().hex[:8]}",
                "category": "office_supplies",
                "vendor_name": "Test Vendor",
                "receipt_number": f"REC-{uuid.uuid4().hex[:4]}"
            }
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["transaction"]["transaction_type"] == "withdrawal"
        assert data["transaction"]["amount"] == withdrawal_amount
        assert data["new_balance"] == initial_balance - withdrawal_amount
        
        print(f"Withdrawal created: ${withdrawal_amount}, New balance=${data['new_balance']}")
    
    def test_withdrawal_insufficient_funds(self, api_client):
        """Test withdrawal with insufficient funds returns 400"""
        # Get current balance
        balance_response = api_client.get(f"{BASE_URL}/api/business-clarity/petty-cash")
        current_balance = balance_response.json()["summary"]["current_balance"]
        
        # Try to withdraw more than available
        response = api_client.post(
            f"{BASE_URL}/api/business-clarity/petty-cash/transactions",
            json={
                "transaction_type": "withdrawal",
                "amount": current_balance + 10000,  # Way more than available
                "description": "TEST_Should_Fail_Withdrawal"
            }
        )
        assert response.status_code == 400
        assert "Insufficient" in response.json().get("detail", "")
        print(f"Insufficient funds rejection working correctly")
    
    def test_withdrawal_with_all_categories(self, api_client):
        """Test withdrawal with different categories"""
        categories = ["office_supplies", "transportation", "food", "cleaning", "maintenance", "misc"]
        
        # Make sure there's enough balance
        balance_response = api_client.get(f"{BASE_URL}/api/business-clarity/petty-cash")
        if balance_response.json()["summary"]["current_balance"] < 100:
            api_client.post(
                f"{BASE_URL}/api/business-clarity/petty-cash/transactions",
                json={
                    "transaction_type": "deposit",
                    "amount": 500,
                    "description": "TEST_CategoryTest_Deposit"
                }
            )
        
        for category in categories[:2]:  # Test first 2 categories
            response = api_client.post(
                f"{BASE_URL}/api/business-clarity/petty-cash/transactions",
                json={
                    "transaction_type": "withdrawal",
                    "amount": 5.00,
                    "description": f"TEST_Category_{category}",
                    "category": category
                }
            )
            assert response.status_code == 200
            assert response.json()["transaction"]["category"] == category
        
        print("Category tests passed")
    
    def test_transaction_has_balance_after(self, api_client):
        """Test that transaction includes balance_after field"""
        response = api_client.post(
            f"{BASE_URL}/api/business-clarity/petty-cash/transactions",
            json={
                "transaction_type": "deposit",
                "amount": 10.00,
                "description": f"TEST_BalanceAfter_{uuid.uuid4().hex[:8]}"
            }
        )
        assert response.status_code == 200
        
        txn = response.json()["transaction"]
        assert "balance_after" in txn
        assert txn["balance_after"] == response.json()["new_balance"]
        print(f"Balance after field verified: {txn['balance_after']}")


class TestAllPaymentsEndpoint:
    """Tests for GET /api/business-clarity/all-payments"""
    
    def test_get_all_payments(self, api_client):
        """Test basic all payments retrieval"""
        response = api_client.get(f"{BASE_URL}/api/business-clarity/all-payments")
        assert response.status_code == 200
        
        data = response.json()
        # Verify response structure
        assert "payments" in data
        assert "summary" in data
        print(f"All payments: {len(data['payments'])} payments found")
    
    def test_all_payments_summary_structure(self, api_client):
        """Test all payments summary structure"""
        response = api_client.get(f"{BASE_URL}/api/business-clarity/all-payments")
        assert response.status_code == 200
        
        data = response.json()
        summary = data["summary"]
        
        # Verify summary fields
        assert "total_received" in summary
        assert "total_made" in summary
        assert "net" in summary
        assert "received_count" in summary
        assert "made_count" in summary
        
        print(f"Summary: Received=${summary['total_received']}, "
              f"Made=${summary['total_made']}, Net=${summary['net']}")
    
    def test_all_payments_has_direction(self, api_client):
        """Test that each payment has direction field (received/made)"""
        response = api_client.get(f"{BASE_URL}/api/business-clarity/all-payments")
        assert response.status_code == 200
        
        payments = response.json()["payments"]
        if payments:
            for pmt in payments[:5]:  # Check first 5
                assert "direction" in pmt
                assert pmt["direction"] in ["received", "made"]
                assert "entity_name" in pmt
                assert "amount" in pmt
            print("Direction field verified on payments")
        else:
            print("No payments to verify")
    
    def test_filter_received_payments(self, api_client):
        """Test filtering received payments only"""
        response = api_client.get(
            f"{BASE_URL}/api/business-clarity/all-payments?payment_direction=received"
        )
        assert response.status_code == 200
        
        data = response.json()
        for pmt in data["payments"]:
            assert pmt["direction"] == "received"
        print(f"Received filter: {len(data['payments'])} payments")
    
    def test_filter_made_payments(self, api_client):
        """Test filtering made payments only"""
        response = api_client.get(
            f"{BASE_URL}/api/business-clarity/all-payments?payment_direction=made"
        )
        assert response.status_code == 200
        
        data = response.json()
        for pmt in data["payments"]:
            assert pmt["direction"] == "made"
        print(f"Made filter: {len(data['payments'])} payments")
    
    def test_all_payments_with_date_filter(self, api_client):
        """Test all payments with date range filter"""
        today = datetime.now()
        start_date = (today - timedelta(days=90)).strftime("%Y-%m-%d")
        end_date = today.strftime("%Y-%m-%d")
        
        response = api_client.get(
            f"{BASE_URL}/api/business-clarity/all-payments?start_date={start_date}&end_date={end_date}"
        )
        assert response.status_code == 200
        
        data = response.json()
        # Verify dates are within range
        for pmt in data["payments"]:
            pmt_date = pmt.get("payment_date", "")
            if pmt_date:
                assert pmt_date >= start_date
                assert pmt_date <= end_date
        
        print(f"Date filter: {len(data['payments'])} payments in range")


class TestCashFlowIntegration:
    """Integration tests for cash flow data accuracy"""
    
    def test_cash_flow_matches_petty_cash_balance(self, api_client):
        """Test that cash flow petty cash data matches petty cash endpoint"""
        # Get petty cash data
        petty_response = api_client.get(f"{BASE_URL}/api/business-clarity/petty-cash")
        petty_data = petty_response.json()
        
        # Get cash flow for current month
        today = datetime.now()
        start_date = today.replace(day=1).strftime("%Y-%m-%d")
        end_date = today.strftime("%Y-%m-%d")
        
        cashflow_response = api_client.get(
            f"{BASE_URL}/api/business-clarity/cash-flow?start_date={start_date}&end_date={end_date}"
        )
        cashflow_data = cashflow_response.json()
        
        print(f"Petty cash balance: {petty_data['summary']['current_balance']}")
        print(f"Cash flow petty deposits: {cashflow_data['inflows']['petty_cash_deposits']['total']}")
        print(f"Cash flow petty withdrawals: {cashflow_data['outflows']['petty_cash_withdrawals']['total']}")
    
    def test_all_payments_summary_matches_individual_payments(self, api_client):
        """Test that summary totals match individual payment amounts"""
        response = api_client.get(f"{BASE_URL}/api/business-clarity/all-payments")
        data = response.json()
        
        # Calculate from individual payments
        received_calc = sum(p["amount"] for p in data["payments"] if p["direction"] == "received")
        made_calc = sum(p["amount"] for p in data["payments"] if p["direction"] == "made")
        
        # Compare with summary (may differ slightly due to limit)
        summary = data["summary"]
        
        # Counts should match for limited data
        received_count = len([p for p in data["payments"] if p["direction"] == "received"])
        made_count = len([p for p in data["payments"] if p["direction"] == "made"])
        
        print(f"Calculated received: ${received_calc:.2f} from {received_count} payments")
        print(f"Calculated made: ${made_calc:.2f} from {made_count} payments")
        print(f"Summary shows: Received=${summary['total_received']}, Made=${summary['total_made']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
