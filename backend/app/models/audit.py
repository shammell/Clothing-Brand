from datetime import datetime
from typing import Any

from pydantic import BaseModel


class AuditLogEntry(BaseModel):
    id: str
    actor_id: str
    action: str
    target_user_id: str
    details: dict[str, Any]
    created_at: datetime
