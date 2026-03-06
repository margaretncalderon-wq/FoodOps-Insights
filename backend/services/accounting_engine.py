# services/accounting_engine.py - Centralized Accounting/Posting Engine
"""
Motor de Contabilización Centralizado

Este servicio es el punto único de registro para todas las transacciones financieras.
Cada actividad financiera (nómina, compras, gastos, ventas) debe pasar por este motor
para asegurar consistencia en el tracking por Centro de Costo.

Tipos de transacciones:
- payroll: Costos de nómina (salario + cargas patronales)
- expense: Gastos operativos y costos fijos
- purchase: Compras y cuentas por pagar
- inventory: Movimientos de inventario con impacto financiero
- revenue: Ingresos y ventas

Principio: Cada transacción debe tener un cost_center_id asignado.
Si no tiene, se marca como "unassigned" para posterior asignación.
"""

from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from enum import Enum
from pydantic import BaseModel, Field
import uuid


class TransactionType(str, Enum):
    PAYROLL = "payroll"
    EXPENSE = "expense"
    PURCHASE = "purchase"
    INVENTORY = "inventory"
    REVENUE = "revenue"
    ADJUSTMENT = "adjustment"


class TransactionSubtype(str, Enum):
    # Payroll subtypes
    SALARY = "salary"
    BONUS = "bonus"
    COMMISSION = "commission"
    EMPLOYER_CONTRIBUTION = "employer_contribution"
    
    # Expense subtypes
    FIXED_COST = "fixed_cost"
    VARIABLE_COST = "variable_cost"
    OPERATIONAL = "operational"
    
    # Purchase subtypes
    SUPPLIER_PAYABLE = "supplier_payable"
    DIRECT_PURCHASE = "direct_purchase"
    
    # Inventory subtypes
    INVENTORY_IN = "inventory_in"
    INVENTORY_OUT = "inventory_out"
    INVENTORY_ADJUSTMENT = "inventory_adjustment"
    
    # Revenue subtypes
    SALE = "sale"
    SERVICE = "service"
    OTHER_INCOME = "other_income"


class AccountingEntryCreate(BaseModel):
    """Input model for creating an accounting entry"""
    transaction_type: TransactionType
    subtype: Optional[TransactionSubtype] = None
    
    # Amount (positive = cost/expense, negative = income/credit)
    amount: float
    
    # Cost Center assignment
    cost_center_id: Optional[str] = None
    cost_center_name: Optional[str] = None
    
    # Source reference (links back to original document)
    source_type: str  # payroll_entry, supplier_payable, fixed_cost, inventory_movement, invoice
    source_id: str    # The ID of the source document
    source_ref: Optional[str] = None  # Human-readable reference (invoice #, period name, etc.)
    
    # Transaction date (when the transaction occurred, not created)
    transaction_date: str  # ISO format date
    
    # Description
    description: str
    
    # Additional metadata
    metadata: Optional[Dict[str, Any]] = None


class AccountingEntry(BaseModel):
    """Full accounting entry model"""
    entry_id: str
    company_id: str
    
    transaction_type: TransactionType
    subtype: Optional[TransactionSubtype] = None
    
    amount: float
    
    cost_center_id: Optional[str] = None
    cost_center_name: Optional[str] = None
    is_cost_center_assigned: bool = False
    
    source_type: str
    source_id: str
    source_ref: Optional[str] = None
    
    transaction_date: str
    description: str
    
    metadata: Optional[Dict[str, Any]] = None
    
    # Audit fields
    created_at: datetime
    created_by: Optional[str] = None
    updated_at: datetime
    is_reversed: bool = False
    reversed_by_entry_id: Optional[str] = None


class AccountingEngine:
    """
    Motor de Contabilización Centralizado
    
    Uso:
        engine = AccountingEngine(db, company_id, user_id)
        await engine.record_payroll_cost(payroll_entry)
        await engine.record_expense(expense_data)
    """
    
    def __init__(self, db, company_id: str, user_id: Optional[str] = None):
        self.db = db
        self.company_id = company_id
        self.user_id = user_id
    
    async def record_entry(self, data: AccountingEntryCreate) -> Dict[str, Any]:
        """
        Record a single accounting entry.
        This is the core method - all other methods should use this.
        """
        now = datetime.now(timezone.utc)
        entry_id = f"acc_{uuid.uuid4().hex[:12]}"
        
        entry_doc = {
            "entry_id": entry_id,
            "company_id": self.company_id,
            "transaction_type": data.transaction_type.value,
            "subtype": data.subtype.value if data.subtype else None,
            "amount": round(data.amount, 2),
            "cost_center_id": data.cost_center_id,
            "cost_center_name": data.cost_center_name,
            "is_cost_center_assigned": data.cost_center_id is not None,
            "source_type": data.source_type,
            "source_id": data.source_id,
            "source_ref": data.source_ref,
            "transaction_date": data.transaction_date,
            "description": data.description,
            "metadata": data.metadata or {},
            "created_at": now.isoformat(),
            "created_by": self.user_id,
            "updated_at": now.isoformat(),
            "is_reversed": False,
            "reversed_by_entry_id": None
        }
        
        await self.db.accounting_entries.insert_one(entry_doc)
        
        # Remove MongoDB _id before returning
        entry_doc.pop("_id", None)
        return entry_doc
    
    async def record_payroll_entry(
        self,
        payroll_entry: Dict[str, Any],
        period_name: str
    ) -> List[Dict[str, Any]]:
        """
        Record accounting entries for a single payroll entry.
        Creates entries for:
        - Gross salary (to employee's cost center)
        - Employer contributions (to employee's cost center)
        
        This follows the DISTRIBUTED model: costs go to the employee's
        department cost center, NOT to a central HR cost center.
        """
        entries = []
        employee_name = payroll_entry.get("employee_name", "Unknown")
        cost_center_id = payroll_entry.get("cost_center_id")
        cost_center_name = payroll_entry.get("cost_center_name")
        transaction_date = payroll_entry.get("created_at", datetime.now(timezone.utc).isoformat())[:10]
        
        # 1. Gross Salary
        gross_salary = payroll_entry.get("gross_salary", 0)
        if gross_salary > 0:
            entry = await self.record_entry(AccountingEntryCreate(
                transaction_type=TransactionType.PAYROLL,
                subtype=TransactionSubtype.SALARY,
                amount=gross_salary,
                cost_center_id=cost_center_id,
                cost_center_name=cost_center_name,
                source_type="payroll_entry",
                source_id=payroll_entry.get("entry_id"),
                source_ref=period_name,
                transaction_date=transaction_date,
                description=f"Salario bruto - {employee_name}",
                metadata={
                    "employee_id": payroll_entry.get("employee_id"),
                    "employee_name": employee_name,
                    "period_id": payroll_entry.get("period_id")
                }
            ))
            entries.append(entry)
        
        # 2. Employer Contributions (AFP, ARS, SRL, INFOTEP)
        employer_contributions = (
            payroll_entry.get("afp_employer", 0) +
            payroll_entry.get("ars_employer", 0) +
            payroll_entry.get("srl_employer", 0) +
            payroll_entry.get("infotep_employer", 0)
        )
        if employer_contributions > 0:
            entry = await self.record_entry(AccountingEntryCreate(
                transaction_type=TransactionType.PAYROLL,
                subtype=TransactionSubtype.EMPLOYER_CONTRIBUTION,
                amount=employer_contributions,
                cost_center_id=cost_center_id,
                cost_center_name=cost_center_name,
                source_type="payroll_entry",
                source_id=payroll_entry.get("entry_id"),
                source_ref=period_name,
                transaction_date=transaction_date,
                description=f"Cargas patronales - {employee_name}",
                metadata={
                    "employee_id": payroll_entry.get("employee_id"),
                    "employee_name": employee_name,
                    "period_id": payroll_entry.get("period_id"),
                    "breakdown": {
                        "afp_employer": payroll_entry.get("afp_employer", 0),
                        "ars_employer": payroll_entry.get("ars_employer", 0),
                        "srl_employer": payroll_entry.get("srl_employer", 0),
                        "infotep_employer": payroll_entry.get("infotep_employer", 0)
                    }
                }
            ))
            entries.append(entry)
        
        return entries
    
    async def record_payroll_period(
        self,
        period_id: str,
        period_name: str
    ) -> Dict[str, Any]:
        """
        Record all accounting entries for a completed payroll period.
        Call this when a payroll period is marked as 'completed'.
        """
        # Get all entries for this period
        entries = await self.db.payroll_entries.find(
            {"company_id": self.company_id, "period_id": period_id},
            {"_id": 0}
        ).to_list(1000)
        
        recorded_entries = []
        total_amount = 0
        
        for pe in entries:
            acc_entries = await self.record_payroll_entry(pe, period_name)
            recorded_entries.extend(acc_entries)
            total_amount += sum(e["amount"] for e in acc_entries)
        
        return {
            "period_id": period_id,
            "entries_recorded": len(recorded_entries),
            "total_amount": round(total_amount, 2),
            "accounting_entries": recorded_entries
        }
    
    async def record_expense(
        self,
        expense: Dict[str, Any],
        cost_center_id: Optional[str] = None,
        cost_center_name: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Record an expense/cost as an accounting entry.
        Used for fixed costs, overhead expenses, etc.
        """
        transaction_date = expense.get("date") or expense.get("created_at", datetime.now(timezone.utc).isoformat())[:10]
        
        # Use provided cost_center or try to get from expense
        cc_id = cost_center_id or expense.get("cost_center_id")
        cc_name = cost_center_name or expense.get("cost_center_name")
        
        entry = await self.record_entry(AccountingEntryCreate(
            transaction_type=TransactionType.EXPENSE,
            subtype=TransactionSubtype.FIXED_COST if expense.get("fixed_cost_category_id") else TransactionSubtype.OPERATIONAL,
            amount=expense.get("amount", 0),
            cost_center_id=cc_id,
            cost_center_name=cc_name,
            source_type="expense",
            source_id=expense.get("expense_id") or expense.get("payable_id"),
            source_ref=expense.get("description"),
            transaction_date=transaction_date,
            description=expense.get("description", "Expense"),
            metadata={
                "category_id": expense.get("fixed_cost_category_id"),
                "supplier_id": expense.get("supplier_id"),
                "supplier_name": expense.get("supplier_name")
            }
        ))
        
        return entry
    
    async def record_supplier_payable(
        self,
        payable: Dict[str, Any],
        cost_center_id: Optional[str] = None,
        cost_center_name: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Record a supplier payable as an accounting entry.
        """
        transaction_date = payable.get("created_at", datetime.now(timezone.utc).isoformat())[:10]
        
        cc_id = cost_center_id or payable.get("cost_center_id")
        cc_name = cost_center_name or payable.get("cost_center_name")
        
        entry = await self.record_entry(AccountingEntryCreate(
            transaction_type=TransactionType.PURCHASE,
            subtype=TransactionSubtype.SUPPLIER_PAYABLE,
            amount=payable.get("amount", 0),
            cost_center_id=cc_id,
            cost_center_name=cc_name,
            source_type="supplier_payable",
            source_id=payable.get("payable_id"),
            source_ref=payable.get("description"),
            transaction_date=transaction_date,
            description=f"Cuenta por pagar - {payable.get('supplier_name', 'Proveedor')}",
            metadata={
                "supplier_id": payable.get("supplier_id"),
                "supplier_name": payable.get("supplier_name"),
                "fixed_cost_category_id": payable.get("fixed_cost_category_id"),
                "due_date": payable.get("due_date"),
                "status": payable.get("status")
            }
        ))
        
        return entry
    
    async def get_entries_by_cost_center(
        self,
        cost_center_id: str,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        transaction_type: Optional[TransactionType] = None
    ) -> List[Dict[str, Any]]:
        """Get all accounting entries for a specific cost center"""
        query = {
            "company_id": self.company_id,
            "cost_center_id": cost_center_id,
            "is_reversed": False
        }
        
        if start_date:
            query["transaction_date"] = {"$gte": start_date}
        if end_date:
            if "transaction_date" in query:
                query["transaction_date"]["$lt"] = end_date
            else:
                query["transaction_date"] = {"$lt": end_date}
        
        if transaction_type:
            query["transaction_type"] = transaction_type.value
        
        entries = await self.db.accounting_entries.find(
            query,
            {"_id": 0}
        ).sort("transaction_date", -1).to_list(1000)
        
        return entries
    
    async def get_unassigned_entries(self) -> List[Dict[str, Any]]:
        """Get all entries without a cost center assigned"""
        entries = await self.db.accounting_entries.find(
            {
                "company_id": self.company_id,
                "is_cost_center_assigned": False,
                "is_reversed": False
            },
            {"_id": 0}
        ).sort("transaction_date", -1).to_list(500)
        
        return entries
    
    async def assign_cost_center(
        self,
        entry_id: str,
        cost_center_id: str,
        cost_center_name: str
    ) -> Dict[str, Any]:
        """Assign a cost center to an existing entry"""
        now = datetime.now(timezone.utc)
        
        result = await self.db.accounting_entries.update_one(
            {"entry_id": entry_id, "company_id": self.company_id},
            {"$set": {
                "cost_center_id": cost_center_id,
                "cost_center_name": cost_center_name,
                "is_cost_center_assigned": True,
                "updated_at": now.isoformat()
            }}
        )
        
        if result.modified_count == 0:
            return {"success": False, "error": "Entry not found"}
        
        return {"success": True, "entry_id": entry_id, "cost_center_id": cost_center_id}
    
    async def get_cost_center_summary(
        self,
        year: int,
        month: int
    ) -> List[Dict[str, Any]]:
        """
        Get summary of actual spending by cost center for a specific period.
        This aggregates all accounting entries.
        """
        start_date = f"{year}-{str(month).zfill(2)}-01"
        if month == 12:
            end_date = f"{year + 1}-01-01"
        else:
            end_date = f"{year}-{str(month + 1).zfill(2)}-01"
        
        pipeline = [
            {"$match": {
                "company_id": self.company_id,
                "is_reversed": False,
                "transaction_date": {"$gte": start_date, "$lt": end_date}
            }},
            {"$group": {
                "_id": {
                    "cost_center_id": "$cost_center_id",
                    "cost_center_name": "$cost_center_name",
                    "transaction_type": "$transaction_type"
                },
                "total": {"$sum": "$amount"},
                "count": {"$sum": 1}
            }},
            {"$group": {
                "_id": {
                    "cost_center_id": "$_id.cost_center_id",
                    "cost_center_name": "$_id.cost_center_name"
                },
                "by_type": {"$push": {
                    "type": "$_id.transaction_type",
                    "total": "$total",
                    "count": "$count"
                }},
                "total_amount": {"$sum": "$total"},
                "total_transactions": {"$sum": "$count"}
            }},
            {"$sort": {"total_amount": -1}}
        ]
        
        results = await self.db.accounting_entries.aggregate(pipeline).to_list(100)
        
        summary = []
        for r in results:
            item = {
                "cost_center_id": r["_id"]["cost_center_id"],
                "cost_center_name": r["_id"]["cost_center_name"] or "Sin asignar",
                "total_amount": round(r["total_amount"], 2),
                "total_transactions": r["total_transactions"],
                "breakdown": {}
            }
            for bt in r["by_type"]:
                item["breakdown"][bt["type"]] = {
                    "amount": round(bt["total"], 2),
                    "count": bt["count"]
                }
            summary.append(item)
        
        return summary
    
    async def reverse_entry(self, entry_id: str, reason: str) -> Dict[str, Any]:
        """
        Reverse an accounting entry (create a counter-entry).
        Used for corrections without deleting history.
        """
        # Get original entry
        original = await self.db.accounting_entries.find_one(
            {"entry_id": entry_id, "company_id": self.company_id},
            {"_id": 0}
        )
        
        if not original:
            return {"success": False, "error": "Entry not found"}
        
        if original.get("is_reversed"):
            return {"success": False, "error": "Entry already reversed"}
        
        # Create reversal entry
        now = datetime.now(timezone.utc)
        reversal_id = f"acc_{uuid.uuid4().hex[:12]}"
        
        reversal_doc = {
            **original,
            "entry_id": reversal_id,
            "amount": -original["amount"],  # Negative of original
            "description": f"[REVERSO] {original['description']} - {reason}",
            "metadata": {
                **original.get("metadata", {}),
                "reversal_of": entry_id,
                "reversal_reason": reason
            },
            "created_at": now.isoformat(),
            "created_by": self.user_id,
            "updated_at": now.isoformat()
        }
        
        await self.db.accounting_entries.insert_one(reversal_doc)
        
        # Mark original as reversed
        await self.db.accounting_entries.update_one(
            {"entry_id": entry_id},
            {"$set": {
                "is_reversed": True,
                "reversed_by_entry_id": reversal_id,
                "updated_at": now.isoformat()
            }}
        )
        
        reversal_doc.pop("_id", None)
        return {"success": True, "reversal_entry": reversal_doc}
    
    # ================== INVENTORY METHODS ==================
    
    async def record_inventory_movement(
        self,
        movement: Dict[str, Any],
        movement_type: str = "in",  # "in" or "out"
        cost_center_id: Optional[str] = None,
        cost_center_name: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Record an inventory movement as an accounting entry.
        
        - INVENTORY_IN: Increases inventory value (positive amount)
        - INVENTORY_OUT: Decreases inventory value (negative for cost tracking)
        
        For outgoing inventory (consumption), the cost is tracked as expense.
        """
        transaction_date = movement.get("date") or movement.get("created_at", datetime.now(timezone.utc).isoformat())[:10]
        
        # Calculate the monetary value of the movement
        quantity = movement.get("quantity", 0)
        unit_cost = movement.get("unit_cost") or movement.get("cost_per_unit", 0)
        amount = abs(quantity * unit_cost)
        
        # For inventory out (consumption), record as positive cost (expense)
        # For inventory in (purchase), record as inventory asset increase
        if movement_type == "out":
            subtype = TransactionSubtype.INVENTORY_OUT
            amount = amount  # Positive = cost/expense
            description = f"Consumo inventario - {movement.get('item_name', 'Item')}"
        else:
            subtype = TransactionSubtype.INVENTORY_IN
            amount = amount  # Could be negative for asset tracking, but we use positive
            description = f"Entrada inventario - {movement.get('item_name', 'Item')}"
        
        entry = await self.record_entry(AccountingEntryCreate(
            transaction_type=TransactionType.INVENTORY,
            subtype=subtype,
            amount=amount,
            cost_center_id=cost_center_id or movement.get("cost_center_id"),
            cost_center_name=cost_center_name or movement.get("cost_center_name"),
            source_type="inventory_movement",
            source_id=movement.get("movement_id") or movement.get("ingredient_id"),
            source_ref=movement.get("item_name") or movement.get("name"),
            transaction_date=transaction_date,
            description=description,
            metadata={
                "item_id": movement.get("ingredient_id") or movement.get("item_id"),
                "item_name": movement.get("item_name") or movement.get("name"),
                "quantity": quantity,
                "unit_cost": unit_cost,
                "unit": movement.get("unit"),
                "movement_type": movement_type,
                "reason": movement.get("reason") or movement.get("notes")
            }
        ))
        
        return entry
    
    async def record_inventory_adjustment(
        self,
        adjustment: Dict[str, Any],
        cost_center_id: Optional[str] = None,
        cost_center_name: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Record an inventory adjustment (e.g., from physical count).
        Can be positive (surplus found) or negative (shortage/loss).
        """
        transaction_date = adjustment.get("date", datetime.now(timezone.utc).isoformat()[:10])
        
        quantity_diff = adjustment.get("quantity_difference", 0)
        unit_cost = adjustment.get("unit_cost", 0)
        amount = quantity_diff * unit_cost  # Negative if shortage
        
        entry = await self.record_entry(AccountingEntryCreate(
            transaction_type=TransactionType.INVENTORY,
            subtype=TransactionSubtype.INVENTORY_ADJUSTMENT,
            amount=abs(amount),  # Always positive, metadata has direction
            cost_center_id=cost_center_id,
            cost_center_name=cost_center_name,
            source_type="inventory_adjustment",
            source_id=adjustment.get("adjustment_id") or f"adj_{uuid.uuid4().hex[:8]}",
            source_ref=adjustment.get("item_name"),
            transaction_date=transaction_date,
            description=f"Ajuste inventario - {adjustment.get('item_name', 'Item')} ({'+' if quantity_diff > 0 else ''}{quantity_diff})",
            metadata={
                "item_id": adjustment.get("item_id"),
                "item_name": adjustment.get("item_name"),
                "quantity_before": adjustment.get("quantity_before"),
                "quantity_after": adjustment.get("quantity_after"),
                "quantity_difference": quantity_diff,
                "unit_cost": unit_cost,
                "reason": adjustment.get("reason", "Physical count adjustment"),
                "is_loss": amount < 0
            }
        ))
        
        return entry
    
    # ================== REVENUE/SALES METHODS ==================
    
    async def record_invoice(
        self,
        invoice: Dict[str, Any],
        cost_center_id: Optional[str] = None,
        cost_center_name: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Record an invoice as a revenue entry.
        Revenue is recorded as negative (credit) in accounting terms,
        but we store as positive for easy aggregation and mark type as REVENUE.
        """
        transaction_date = invoice.get("issue_date", invoice.get("created_at", datetime.now(timezone.utc).isoformat()))[:10]
        
        amount = invoice.get("total", 0)
        
        entry = await self.record_entry(AccountingEntryCreate(
            transaction_type=TransactionType.REVENUE,
            subtype=TransactionSubtype.SALE,
            amount=amount,
            cost_center_id=cost_center_id or invoice.get("cost_center_id"),
            cost_center_name=cost_center_name or invoice.get("cost_center_name"),
            source_type="invoice",
            source_id=invoice.get("invoice_id"),
            source_ref=invoice.get("invoice_number"),
            transaction_date=transaction_date,
            description=f"Factura {invoice.get('invoice_number', '')} - {invoice.get('client_name', 'Cliente')}",
            metadata={
                "invoice_number": invoice.get("invoice_number"),
                "client_id": invoice.get("client_id"),
                "client_name": invoice.get("client_name"),
                "event_id": invoice.get("event_id"),
                "subtotal": invoice.get("subtotal"),
                "tax_amount": invoice.get("tax_amount") or (invoice.get("total", 0) - invoice.get("subtotal", 0)),
                "discount_percent": invoice.get("discount_percent", 0),
                "lines_count": len(invoice.get("lines", []))
            }
        ))
        
        return entry
    
    async def record_service_revenue(
        self,
        service: Dict[str, Any],
        cost_center_id: Optional[str] = None,
        cost_center_name: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Record service revenue (for non-invoice based income).
        """
        transaction_date = service.get("date", datetime.now(timezone.utc).isoformat()[:10])
        
        entry = await self.record_entry(AccountingEntryCreate(
            transaction_type=TransactionType.REVENUE,
            subtype=TransactionSubtype.SERVICE,
            amount=service.get("amount", 0),
            cost_center_id=cost_center_id,
            cost_center_name=cost_center_name,
            source_type="service_revenue",
            source_id=service.get("service_id") or f"srv_{uuid.uuid4().hex[:8]}",
            source_ref=service.get("description"),
            transaction_date=transaction_date,
            description=service.get("description", "Service revenue"),
            metadata=service.get("metadata", {})
        ))
        
        return entry
    
    # ================== REPORTING METHODS ==================
    
    async def get_profit_loss_summary(
        self,
        year: int,
        month: int
    ) -> Dict[str, Any]:
        """
        Get a profit/loss summary for a period.
        Returns revenue, costs, and gross profit.
        """
        start_date = f"{year}-{str(month).zfill(2)}-01"
        if month == 12:
            end_date = f"{year + 1}-01-01"
        else:
            end_date = f"{year}-{str(month + 1).zfill(2)}-01"
        
        # Aggregate by transaction type
        pipeline = [
            {"$match": {
                "company_id": self.company_id,
                "is_reversed": False,
                "transaction_date": {"$gte": start_date, "$lt": end_date}
            }},
            {"$group": {
                "_id": "$transaction_type",
                "total": {"$sum": "$amount"},
                "count": {"$sum": 1}
            }}
        ]
        
        results = await self.db.accounting_entries.aggregate(pipeline).to_list(10)
        
        summary = {
            "period": f"{year}-{str(month).zfill(2)}",
            "revenue": 0,
            "payroll": 0,
            "expenses": 0,
            "purchases": 0,
            "inventory_cost": 0,
            "total_costs": 0,
            "gross_profit": 0,
            "transactions_count": 0
        }
        
        for r in results:
            tx_type = r["_id"]
            amount = round(r["total"], 2)
            count = r["count"]
            
            if tx_type == "revenue":
                summary["revenue"] = amount
            elif tx_type == "payroll":
                summary["payroll"] = amount
            elif tx_type == "expense":
                summary["expenses"] = amount
            elif tx_type == "purchase":
                summary["purchases"] = amount
            elif tx_type == "inventory":
                summary["inventory_cost"] = amount
            
            summary["transactions_count"] += count
        
        summary["total_costs"] = round(
            summary["payroll"] + summary["expenses"] + 
            summary["purchases"] + summary["inventory_cost"], 2
        )
        summary["gross_profit"] = round(summary["revenue"] - summary["total_costs"], 2)
        
        return summary
