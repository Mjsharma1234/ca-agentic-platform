from fastapi import APIRouter
from typing import Dict, Any
import uuid

router = APIRouter(prefix="/clients", tags=["clients"])

IN_MEMORY_CLIENTS = [
    {"id": "c1", "name": "Rajesh Textiles Pvt Ltd", "pan": "AAACR1234F", "gstin": "27AAACR1234F1Z5", "type": "Private Limited", "risk_tier": "Medium", "assigned_partner": "Amit Sharma", "emergency_bypass_active": False},
    {"id": "c2", "name": "Mumbai Steel Corporation", "pan": "BBBCM5678G", "gstin": "27BBBCM5678G1Z2", "type": "Public Limited", "risk_tier": "High", "assigned_partner": "Priya Patel", "emergency_bypass_active": False},
    {"id": "c3", "name": "Global Tech Solutions LLP", "pan": "CCCGT9012H", "gstin": "29CCCGT9012H1Z8", "type": "LLP", "risk_tier": "Low", "assigned_partner": "Amit Sharma", "emergency_bypass_active": False},
    {"id": "c4", "name": "Sharma & Sons Logistics", "pan": "DDDSA3456J", "gstin": "07DDDSA3456J1Z1", "type": "Partnership", "risk_tier": "Low", "assigned_partner": "Vikram Singh", "emergency_bypass_active": False},
    {"id": "c5", "name": "Kerala Spices Export Pvt Ltd", "pan": "EEEKS7890K", "gstin": "32EEEKS7890K1Z4", "type": "Private Limited", "risk_tier": "Medium", "assigned_partner": "Priya Patel", "emergency_bypass_active": False},
]

@router.get("/")
async def list_clients():
    return IN_MEMORY_CLIENTS

@router.post("/")
async def create_client(client_data: Dict[str, Any]):
    new_client = {
        "id": f"c{len(IN_MEMORY_CLIENTS) + 1}",
        "name": client_data.get("name", "New Corporate Client"),
        "pan": client_data.get("pan", "AAACN9999K"),
        "gstin": client_data.get("gstin", "27AAACN9999K1Z5"),
        "type": client_data.get("type", "Private Limited"),
        "risk_tier": "Low",
        "assigned_partner": client_data.get("assigned_partner", "Amit Sharma"),
        "emergency_bypass_active": False
    }
    IN_MEMORY_CLIENTS.insert(0, new_client)
    return new_client

@router.get("/{client_id}")
async def get_client(client_id: str):
    for c in IN_MEMORY_CLIENTS:
        if c["id"] == client_id:
            return c
    return IN_MEMORY_CLIENTS[0]

@router.put("/{client_id}")
async def update_client(client_id: str, client_data: Dict[str, Any]):
    for c in IN_MEMORY_CLIENTS:
        if c["id"] == client_id:
            c.update(client_data)
            return c
    return client_data

@router.get("/{client_id}/invoices")
async def get_client_invoices(client_id: str):
    return [{"id": "INV-101", "client_id": client_id, "invoice_number": "RPL/26-27/08821", "total_value": 531000.00}]

@router.get("/{client_id}/returns")
async def get_client_returns(client_id: str):
    return [{"id": "RET-201", "client_id": client_id, "return_type": "GSTR-3B", "period": "2026-10", "status": "REVIEW_PENDING"}]

@router.get("/{client_id}/obligations")
async def get_client_obligations(client_id: str):
    return [{"id": "OBL-301", "client_id": client_id, "obligation_type": "GSTR-3B", "state": "REVIEW_PENDING"}]
