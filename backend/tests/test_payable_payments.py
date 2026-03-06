"""
Test suite for Payment Registration functionality in Accounts Payable
Tests:
- POST /api/business-clarity/payables/{id}/payments - Register partial payment
- POST /api/business-clarity/payables/{id}/mark-paid - Mark as fully paid
- GET /api/business-clarity/payables/{id}/payments - Get payment history
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestPayablePayments:
    """Test payment registration for accounts payable"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test - authenticate and create test payable"""
        self.session = requests.Session()
        
        # Login
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "demo.agency@kora.com", "password": "Evoque2024!"}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        
        # Create a test payable for payment tests
        self.test_payable_id = f"test_pay_{uuid.uuid4().hex[:8]}"
        
    def _create_test_payable(self, amount=500.0):
        """Helper to create a test supplier payable"""
        payload = {
            "supplier_name": f"TEST_PaymentSupplier_{uuid.uuid4().hex[:6]}",
            "description": f"TEST_PaymentTest_{uuid.uuid4().hex[:6]}",
            "amount": amount,
            "invoice_number": f"TEST-INV-{uuid.uuid4().hex[:6]}",
            "due_date": "2026-02-15"
        }
        response = self.session.post(
            f"{BASE_URL}/api/business-clarity/supplier-payables",
            json=payload
        )
        assert response.status_code == 200 or response.status_code == 201, f"Failed to create test payable: {response.text}"
        return response.json().get("payable", response.json())
    
    # ============== POST /api/business-clarity/payables/{id}/payments ==============
    
    def test_register_partial_payment(self):
        """Test registering a partial payment for a payable"""
        # Create test payable
        payable = self._create_test_payable(amount=1000.0)
        payable_id = payable.get("payable_id")
        
        # Register partial payment
        payment_data = {
            "amount": 300.0,
            "payment_date": "2026-01-20",
            "payment_method": "transfer",
            "reference": "TRF-12345",
            "notes": "First partial payment"
        }
        response = self.session.post(
            f"{BASE_URL}/api/business-clarity/payables/{payable_id}/payments",
            json=payment_data
        )
        
        assert response.status_code == 200, f"Register payment failed: {response.text}"
        data = response.json()
        
        # Validate response structure
        assert data.get("success") == True
        assert "payment" in data
        assert "payable" in data
        
        # Validate payment record
        payment = data["payment"]
        assert payment["amount"] == 300.0
        assert payment["payment_method"] == "transfer"
        assert payment["reference"] == "TRF-12345"
        assert "payment_id" in payment
        
        # Validate updated payable
        updated_payable = data["payable"]
        assert updated_payable["paid_amount"] == 300.0
        assert updated_payable["balance_due"] == 700.0
        assert updated_payable["status"] == "partial"
        
    def test_register_full_payment(self):
        """Test registering a full payment that pays off the entire balance"""
        payable = self._create_test_payable(amount=500.0)
        payable_id = payable.get("payable_id")
        
        # Pay full amount
        payment_data = {
            "amount": 500.0,
            "payment_date": "2026-01-20",
            "payment_method": "cash",
            "reference": "CASH-001"
        }
        response = self.session.post(
            f"{BASE_URL}/api/business-clarity/payables/{payable_id}/payments",
            json=payment_data
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Should be marked as paid
        assert data["payable"]["status"] == "paid"
        assert data["payable"]["balance_due"] == 0
        assert data["payable"]["paid_amount"] == 500.0
        
    def test_payment_exceeds_balance_error(self):
        """Test that payment exceeding balance returns error"""
        payable = self._create_test_payable(amount=200.0)
        payable_id = payable.get("payable_id")
        
        # Try to pay more than balance
        payment_data = {
            "amount": 500.0,
            "payment_method": "transfer"
        }
        response = self.session.post(
            f"{BASE_URL}/api/business-clarity/payables/{payable_id}/payments",
            json=payment_data
        )
        
        assert response.status_code == 400
        assert "exceeds balance" in response.json().get("detail", "").lower()
        
    def test_payment_invalid_amount_zero(self):
        """Test that zero amount payment returns error"""
        payable = self._create_test_payable(amount=500.0)
        payable_id = payable.get("payable_id")
        
        payment_data = {
            "amount": 0,
            "payment_method": "transfer"
        }
        response = self.session.post(
            f"{BASE_URL}/api/business-clarity/payables/{payable_id}/payments",
            json=payment_data
        )
        
        assert response.status_code == 400
        
    def test_payment_invalid_amount_negative(self):
        """Test that negative amount payment returns error"""
        payable = self._create_test_payable(amount=500.0)
        payable_id = payable.get("payable_id")
        
        payment_data = {
            "amount": -100.0,
            "payment_method": "transfer"
        }
        response = self.session.post(
            f"{BASE_URL}/api/business-clarity/payables/{payable_id}/payments",
            json=payment_data
        )
        
        assert response.status_code == 400
        
    def test_payment_all_methods(self):
        """Test payment with all available payment methods"""
        methods = ["transfer", "cash", "check", "card", "other"]
        
        for method in methods:
            payable = self._create_test_payable(amount=100.0)
            payable_id = payable.get("payable_id")
            
            payment_data = {
                "amount": 50.0,
                "payment_method": method
            }
            response = self.session.post(
                f"{BASE_URL}/api/business-clarity/payables/{payable_id}/payments",
                json=payment_data
            )
            
            assert response.status_code == 200, f"Payment method '{method}' failed: {response.text}"
            assert response.json()["payment"]["payment_method"] == method
            
    def test_payment_not_found_payable(self):
        """Test payment for non-existent payable returns 404"""
        payment_data = {
            "amount": 100.0,
            "payment_method": "transfer"
        }
        response = self.session.post(
            f"{BASE_URL}/api/business-clarity/payables/nonexistent_id_123/payments",
            json=payment_data
        )
        
        assert response.status_code == 404
        
    def test_multiple_partial_payments(self):
        """Test registering multiple partial payments"""
        payable = self._create_test_payable(amount=1000.0)
        payable_id = payable.get("payable_id")
        
        # First payment
        response1 = self.session.post(
            f"{BASE_URL}/api/business-clarity/payables/{payable_id}/payments",
            json={"amount": 300.0, "payment_method": "transfer"}
        )
        assert response1.status_code == 200
        assert response1.json()["payable"]["balance_due"] == 700.0
        
        # Second payment
        response2 = self.session.post(
            f"{BASE_URL}/api/business-clarity/payables/{payable_id}/payments",
            json={"amount": 400.0, "payment_method": "check"}
        )
        assert response2.status_code == 200
        assert response2.json()["payable"]["balance_due"] == 300.0
        assert response2.json()["payable"]["status"] == "partial"
        
        # Final payment
        response3 = self.session.post(
            f"{BASE_URL}/api/business-clarity/payables/{payable_id}/payments",
            json={"amount": 300.0, "payment_method": "cash"}
        )
        assert response3.status_code == 200
        assert response3.json()["payable"]["balance_due"] == 0
        assert response3.json()["payable"]["status"] == "paid"
        
    # ============== POST /api/business-clarity/payables/{id}/mark-paid ==============
    
    def test_mark_as_paid_pending(self):
        """Test marking a pending payable as fully paid"""
        payable = self._create_test_payable(amount=750.0)
        payable_id = payable.get("payable_id")
        
        response = self.session.post(
            f"{BASE_URL}/api/business-clarity/payables/{payable_id}/mark-paid"
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["success"] == True
        assert data["total_paid"] == 750.0
        assert data["payable_id"] == payable_id
        
    def test_mark_as_paid_partial(self):
        """Test marking a partially paid payable as fully paid"""
        payable = self._create_test_payable(amount=500.0)
        payable_id = payable.get("payable_id")
        
        # Make partial payment first
        self.session.post(
            f"{BASE_URL}/api/business-clarity/payables/{payable_id}/payments",
            json={"amount": 200.0, "payment_method": "transfer"}
        )
        
        # Mark as paid (should pay remaining 300)
        response = self.session.post(
            f"{BASE_URL}/api/business-clarity/payables/{payable_id}/mark-paid"
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["total_paid"] == 500.0  # Full amount now paid
        
    def test_mark_paid_not_found(self):
        """Test mark-paid for non-existent payable returns 404"""
        response = self.session.post(
            f"{BASE_URL}/api/business-clarity/payables/nonexistent_xyz/mark-paid"
        )
        
        assert response.status_code == 404
        
    # ============== GET /api/business-clarity/payables/{id}/payments ==============
    
    def test_get_payment_history_empty(self):
        """Test getting payment history for payable with no payments"""
        payable = self._create_test_payable(amount=500.0)
        payable_id = payable.get("payable_id")
        
        response = self.session.get(
            f"{BASE_URL}/api/business-clarity/payables/{payable_id}/payments"
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert "payments" in data
        assert "summary" in data
        assert data["payments"] == []
        assert data["summary"]["total_amount"] == 500.0
        assert data["summary"]["paid_amount"] == 0
        assert data["summary"]["balance_due"] == 500.0
        assert data["summary"]["payment_count"] == 0
        
    def test_get_payment_history_with_payments(self):
        """Test getting payment history after registering payments"""
        payable = self._create_test_payable(amount=1000.0)
        payable_id = payable.get("payable_id")
        
        # Register multiple payments
        self.session.post(
            f"{BASE_URL}/api/business-clarity/payables/{payable_id}/payments",
            json={"amount": 200.0, "payment_method": "transfer", "reference": "REF-001"}
        )
        self.session.post(
            f"{BASE_URL}/api/business-clarity/payables/{payable_id}/payments",
            json={"amount": 300.0, "payment_method": "check", "reference": "CHK-002"}
        )
        
        response = self.session.get(
            f"{BASE_URL}/api/business-clarity/payables/{payable_id}/payments"
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert len(data["payments"]) == 2
        assert data["summary"]["paid_amount"] == 500.0
        assert data["summary"]["balance_due"] == 500.0
        assert data["summary"]["payment_count"] == 2
        
        # Verify payment details
        payment_amounts = [p["amount"] for p in data["payments"]]
        assert 200.0 in payment_amounts
        assert 300.0 in payment_amounts
        
    def test_get_payment_history_not_found(self):
        """Test getting payment history for non-existent payable"""
        response = self.session.get(
            f"{BASE_URL}/api/business-clarity/payables/invalid_id_abc/payments"
        )
        
        assert response.status_code == 404
        
    # ============== Integration tests with expenses collection ==============
        
    def test_payment_for_expense_type(self):
        """Test that payment works for expense type payables (not just supplier_payables)"""
        # First get accounts payable to find an expense type record
        ap_response = self.session.get(f"{BASE_URL}/api/business-clarity/accounts-payable")
        assert ap_response.status_code == 200
        
        records = ap_response.json().get("records", [])
        expense_records = [r for r in records if r.get("type") == "expense" and r.get("status") != "paid"]
        
        if expense_records:
            expense = expense_records[0]
            expense_id = expense.get("payable_id")
            balance = expense.get("balance_due", expense.get("amount", 0))
            
            if balance > 0:
                # Try to register payment
                payment_data = {
                    "amount": min(50.0, balance),  # Pay small amount
                    "payment_method": "transfer"
                }
                response = self.session.post(
                    f"{BASE_URL}/api/business-clarity/payables/{expense_id}/payments",
                    json=payment_data
                )
                
                # Should work for expenses too
                assert response.status_code == 200, f"Payment for expense failed: {response.text}"
        else:
            pytest.skip("No expense records found to test")
            
    # ============== Verify AP list reflects payment status ==============
            
    def test_ap_list_status_after_payment(self):
        """Test that AP list shows correct status after payments"""
        payable = self._create_test_payable(amount=400.0)
        payable_id = payable.get("payable_id")
        
        # Check initial status in AP list
        ap_response = self.session.get(f"{BASE_URL}/api/business-clarity/accounts-payable")
        assert ap_response.status_code == 200
        records = ap_response.json().get("records", [])
        payable_record = next((r for r in records if r.get("payable_id") == payable_id), None)
        
        assert payable_record is not None
        assert payable_record["status"] == "pending"
        
        # Make partial payment
        self.session.post(
            f"{BASE_URL}/api/business-clarity/payables/{payable_id}/payments",
            json={"amount": 200.0, "payment_method": "transfer"}
        )
        
        # Check status changed to partial
        ap_response2 = self.session.get(f"{BASE_URL}/api/business-clarity/accounts-payable")
        records2 = ap_response2.json().get("records", [])
        payable_record2 = next((r for r in records2 if r.get("payable_id") == payable_id), None)
        
        assert payable_record2["status"] == "partial"
        assert payable_record2["balance_due"] == 200.0
        
        # Pay remaining
        self.session.post(
            f"{BASE_URL}/api/business-clarity/payables/{payable_id}/payments",
            json={"amount": 200.0, "payment_method": "cash"}
        )
        
        # Check status is now paid
        ap_response3 = self.session.get(f"{BASE_URL}/api/business-clarity/accounts-payable")
        records3 = ap_response3.json().get("records", [])
        payable_record3 = next((r for r in records3 if r.get("payable_id") == payable_id), None)
        
        assert payable_record3["status"] == "paid"
        assert payable_record3["balance_due"] == 0


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
