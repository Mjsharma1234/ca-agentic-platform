"""The firm's own billing invoices to its clients (professional-fee invoices, GST + TDS 194J).

Not the GST invoice domain: app/models/invoices.py holds clients' purchase/sales documents for
return preparation. This table is the firm's receivables ledger, shown on the Billing screen.

Tenant-scoped like every other table (tenant_id = the firm's id, protected by PostgreSQL RLS in
migration 0011). Monetary totals are server-computed from the service lines, never client-supplied.
"""
import uuid
from datetime import datetime

from sqlalchemy import Column, Date, DateTime, Numeric, String, Text, UniqueConstraint

from ..core.database import Base
from .base import GUID, JSONB


class FirmBillingInvoice(Base):
    __tablename__ = "firm_billing_invoices"
    __table_args__ = (
        UniqueConstraint("tenant_id", "invoice_number", name="uq_firm_billing_invoices_tenant_number"),
    )

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    tenant_id = Column(GUID, nullable=False, index=True)

    invoice_number = Column(String(32), nullable=False)      # e.g. "NC/26-27/00142"
    client_id = Column(String(64), nullable=False, index=True)
    client_name = Column(String(200), nullable=False)
    client_gstin = Column(String(15), nullable=False, default="")
    client_pan = Column(String(10), nullable=False, default="")

    services = Column(JSONB, nullable=False, default=list)   # [{description, sac_code, quantity, rate, amount}]

    subtotal = Column(Numeric(15, 2), nullable=False, default=0)
    gst_rate = Column(Numeric(5, 2), nullable=False, default=18)
    gst_amount = Column(Numeric(15, 2), nullable=False, default=0)
    total_amount = Column(Numeric(15, 2), nullable=False, default=0)
    tds_194j_rate = Column(Numeric(5, 2), nullable=False, default=10)
    tds_194j_amount = Column(Numeric(15, 2), nullable=False, default=0)
    net_receivable = Column(Numeric(15, 2), nullable=False, default=0)

    status = Column(String(24), nullable=False, default="DRAFT", index=True)
    issue_date = Column(Date, nullable=False)
    due_date = Column(Date, nullable=False)
    period_of_service = Column(String(100), nullable=False, default="")

    payment_received = Column(Numeric(15, 2), nullable=False, default=0)
    payment_date = Column(Date, nullable=True)
    payment_reference = Column(String(100), nullable=True)   # UTR / cheque no

    notes = Column(Text, nullable=False, default="")
    created_by = Column(String(150), nullable=False, default="")
    template = Column(String(24), nullable=False, default="standard")  # standard | detailed | retainer
    sent_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


BILLING_TABLES = ["firm_billing_invoices"]
