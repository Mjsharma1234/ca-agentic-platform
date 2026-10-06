from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
import uuid
from typing import List

from ...models.clients import Client
from ...models.invoices import Invoice
from ...models.returns import GSTReturn
from ...models.gates import ObligationState
from ..deps import get_db

router = APIRouter(prefix="/clients", tags=["clients"])

@router.get("/")
async def list_clients(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Client))
    return result.scalars().all()

@router.post("/")
async def create_client(client_data: dict, db: AsyncSession = Depends(get_db)):
    # Minimal implementation for demo
    client = Client(**client_data)
    db.add(client)
    await db.commit()
    await db.refresh(client)
    return client

@router.get("/{client_id}")
async def get_client(client_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    client = await db.get(Client, client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return client

@router.put("/{client_id}")
async def update_client(client_id: uuid.UUID, client_data: dict, db: AsyncSession = Depends(get_db)):
    client = await db.get(Client, client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    for key, value in client_data.items():
        setattr(client, key, value)
    await db.commit()
    await db.refresh(client)
    return client

@router.get("/{client_id}/invoices")
async def get_client_invoices(client_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Invoice).where(Invoice.client_id == client_id))
    return result.scalars().all()

@router.get("/{client_id}/returns")
async def get_client_returns(client_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(GSTReturn).where(GSTReturn.client_id == client_id))
    return result.scalars().all()

@router.get("/{client_id}/obligations")
async def get_client_obligations(client_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ObligationState).where(ObligationState.client_id == client_id))
    return result.scalars().all()
