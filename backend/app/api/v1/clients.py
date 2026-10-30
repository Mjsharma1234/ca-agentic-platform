import uuid
from typing import Dict, Any, List, Optional
from dataclasses import asdict
from fastapi import APIRouter, UploadFile, File, Response, HTTPException
from ...deterministic_core.bulk_import import BulkClientImporter
from ...deterministic_core.task_generator import ProfileTaskGenerator

router = APIRouter(prefix="/clients", tags=["clients"])

IN_MEMORY_CLIENTS = [
    {
        "id": "c1",
        "name": "Rajesh Textiles Pvt Ltd",
        "pan": "AAACR1234F",
        "gstin": "27AAACR1234F1Z5",
        "type": "Private Limited",
        "risk_tier": "Medium",
        "turnover": 145000000,
        "is_composition": False,
        "assigned_partner": "Amit Sharma",
        "email": "tax@rajeshtextiles.in",
        "emergency_bypass_active": False
    },
    {
        "id": "c2",
        "name": "Mumbai Steel Corporation",
        "pan": "BBBCM5678G",
        "gstin": "27BBBCM5678G1Z2",
        "type": "Public Limited",
        "risk_tier": "High",
        "turnover": 520000000,
        "is_composition": False,
        "assigned_partner": "Priya Patel",
        "email": "finance@mumbaisteel.com",
        "emergency_bypass_active": False
    },
    {
        "id": "c3",
        "name": "Global Tech Solutions LLP",
        "pan": "CCCGT9012H",
        "gstin": "29CCCGT9012H1Z8",
        "type": "LLP",
        "risk_tier": "Low",
        "turnover": 89000000,
        "is_composition": False,
        "assigned_partner": "Amit Sharma",
        "email": "compliance@globaltech.io",
        "emergency_bypass_active": False
    },
    {
        "id": "c4",
        "name": "Sharma & Sons Logistics",
        "pan": "DDDSA3456J",
        "gstin": "07DDDSA3456J1Z1",
        "type": "Partnership",
        "risk_tier": "Low",
        "turnover": 42000000,
        "is_composition": False,
        "assigned_partner": "Vikram Singh",
        "email": "accounts@sharmalogistics.com",
        "emergency_bypass_active": False
    },
    {
        "id": "c5",
        "name": "Kerala Spices Export Pvt Ltd",
        "pan": "EEEKS7890K",
        "gstin": "32EEEKS7890K1Z4",
        "type": "Private Limited",
        "risk_tier": "Medium",
        "turnover": 210000000,
        "is_composition": False,
        "assigned_partner": "Priya Patel",
        "email": "export@keralaspices.co.in",
        "emergency_bypass_active": False
    },
]

# Client tasks store: client_id -> list of tasks
IN_MEMORY_TASKS: Dict[str, List[Dict[str, Any]]] = {}

# Pre-populate tasks for seed clients
def _init_seed_tasks():
    for c in IN_MEMORY_CLIENTS:
        tasks = ProfileTaskGenerator.generate_tasks_for_client(c)
        IN_MEMORY_TASKS[c["id"]] = [asdict(t) for t in tasks]

_init_seed_tasks()

@router.get("/")
async def list_clients():
    # Enrich clients with task counts
    enriched = []
    for c in IN_MEMORY_CLIENTS:
        client_copy = dict(c)
        tasks = IN_MEMORY_TASKS.get(c["id"], [])
        client_copy["tasks_count"] = len(tasks)
        enriched.append(client_copy)
    return enriched

@router.get("/import/template")
async def download_import_template():
    """Generates and downloads the official CA Firm OS client import Excel spreadsheet template."""
    content = BulkClientImporter.generate_excel_template()
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=CA_Firm_OS_Client_Import_Template.xlsx"}
    )

@router.post("/import-excel")
async def import_clients_excel(file: UploadFile = File(...)):
    """
    Parses and bulk onboards clients from an Excel (.xlsx) or CSV file.
    Validates PAN and GSTIN syntax, checks for duplicates, and automatically
    generates all statutory compliance tasks for each client.
    """
    contents = await file.read()
    filename = file.filename or "clients.xlsx"

    result = BulkClientImporter.parse_file(contents, filename)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Failed to parse file."))

    imported_clients = result.get("clients", [])
    for c in imported_clients:
        # Check if already present by PAN
        existing = next((x for x in IN_MEMORY_CLIENTS if x["pan"] == c["pan"]), None)
        if existing:
            existing.update(c)
            cid = existing["id"]
        else:
            IN_MEMORY_CLIENTS.insert(0, c)
            cid = c["id"]

        # Store generated tasks
        if "generated_tasks" in c:
            IN_MEMORY_TASKS[cid] = c["generated_tasks"]

    return {
        "status": "SUCCESS",
        "filename": filename,
        "total_rows_scanned": result.get("total_rows_scanned", 0),
        "imported_count": len(imported_clients),
        "failed_count": result.get("failed_count", 0),
        "tasks_instantiated": result.get("tasks_instantiated", 0),
        "errors": result.get("errors", []),
        "clients": imported_clients
    }

@router.post("/generate-tasks-all")
async def generate_tasks_all_clients():
    """Scans all client profiles and automatically regenerates their statutory compliance tasks."""
    total_tasks = 0
    for c in IN_MEMORY_CLIENTS:
        tasks = ProfileTaskGenerator.generate_tasks_for_client(c)
        IN_MEMORY_TASKS[c["id"]] = [asdict(t) for t in tasks]
        total_tasks += len(tasks)
    return {
        "status": "TASKS_GENERATED_SUCCESSFULLY",
        "clients_processed": len(IN_MEMORY_CLIENTS),
        "total_tasks_instantiated": total_tasks
    }

@router.post("/{client_id}/generate-tasks")
async def generate_client_tasks(client_id: str):
    """Automatically creates compliance tasks based on a specific client's profile."""
    client = await get_client(client_id)
    tasks = ProfileTaskGenerator.generate_tasks_for_client(client)
    task_dicts = [asdict(t) for t in tasks]
    IN_MEMORY_TASKS[client_id] = task_dicts
    return {
        "status": "TASKS_GENERATED",
        "client_id": client_id,
        "client_name": client.get("name"),
        "tasks_count": len(tasks),
        "tasks": task_dicts
    }

@router.get("/tasks/all")
async def get_all_practice_tasks():
    """Returns all statutory compliance tasks across all clients on The Line."""
    all_tasks = []
    for cid, tasks in IN_MEMORY_TASKS.items():
        all_tasks.extend(tasks)
    return {
        "total_tasks": len(all_tasks),
        "tasks": all_tasks
    }

@router.get("/{client_id}/tasks")
async def get_client_tasks(client_id: str):
    """Lists all active and scheduled compliance tasks for a specific client."""
    tasks = IN_MEMORY_TASKS.get(client_id, [])
    if not tasks:
        # If not instantiated yet, generate on the fly
        client = await get_client(client_id)
        generated = ProfileTaskGenerator.generate_tasks_for_client(client)
        tasks = [asdict(t) for t in generated]
        IN_MEMORY_TASKS[client_id] = tasks
    return {
        "client_id": client_id,
        "tasks_count": len(tasks),
        "tasks": tasks
    }

@router.post("/")
async def create_client(client_data: Dict[str, Any]):
    new_id = f"c{len(IN_MEMORY_CLIENTS) + 1}"
    new_client = {
        "id": new_id,
        "name": client_data.get("name", "New Corporate Client"),
        "pan": client_data.get("pan", "AAACN9999K"),
        "gstin": client_data.get("gstin", "27AAACN9999K1Z5"),
        "type": client_data.get("type", "Private Limited"),
        "turnover": float(client_data.get("turnover", 50000000)),
        "is_composition": bool(client_data.get("is_composition", False)),
        "risk_tier": "Low",
        "assigned_partner": client_data.get("assigned_partner", "Amit Sharma"),
        "emergency_bypass_active": False
    }
    IN_MEMORY_CLIENTS.insert(0, new_client)

    # Automatically generate statutory tasks for the new client
    tasks = ProfileTaskGenerator.generate_tasks_for_client(new_client)
    IN_MEMORY_TASKS[new_id] = [asdict(t) for t in tasks]

    new_client["tasks_count"] = len(tasks)
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
            # Re-sync tasks if profile changed
            tasks = ProfileTaskGenerator.generate_tasks_for_client(c)
            IN_MEMORY_TASKS[client_id] = [asdict(t) for t in tasks]
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
    tasks = IN_MEMORY_TASKS.get(client_id, [])
    return tasks
