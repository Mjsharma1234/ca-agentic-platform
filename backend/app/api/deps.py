from typing import AsyncGenerator, Annotated
from fastapi import Depends, HTTPException, status, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
import uuid

from ..core.database import AsyncSessionLocal

# Dummy User model for demo
class User:
    def __init__(self, id: str, tenant_id: str, role: str):
        self.id = uuid.UUID(id)
        self.tenant_id = uuid.UUID(tenant_id)
        self.role = role

async def get_db(x_tenant_id: str = Header("00000000-0000-0000-0000-000000000001")) -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        # Simulate RLS
        # await session.execute(text(f"SET LOCAL app.tenant_id = '{x_tenant_id}'"))
        yield session

async def get_current_user(
    x_user_id: str = Header("00000000-0000-0000-0000-000000000002"),
    x_tenant_id: str = Header("00000000-0000-0000-0000-000000000001"),
    x_user_role: str = Header("PARTNER")
) -> User:
    return User(id=x_user_id, tenant_id=x_tenant_id, role=x_user_role)

async def get_current_tenant(current_user: Annotated[User, Depends(get_current_user)]) -> uuid.UUID:
    return current_user.tenant_id

def require_role(required_role: str):
    def role_checker(current_user: Annotated[User, Depends(get_current_user)]):
        roles = ["STAFF", "REVIEWER", "MANAGER", "PARTNER"]
        if roles.index(current_user.role) < roles.index(required_role):
            raise HTTPException(status_code=403, detail=f"Operation requires {required_role} role")
        return current_user
    return role_checker
