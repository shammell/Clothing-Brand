from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.database import get_database
from app.models.audit import AuditLogEntry
from app.models.user import UserBlockUpdate, UserRoleUpdate, UserSummary
from app.services.auth_service import CurrentUser, require_admin

router = APIRouter(prefix="/users", tags=["Users"])


def serialize_user(user: dict) -> dict:
    return {
        "id": str(user["_id"]),
        "username": user.get("name", ""),
        "email": user["email"],
        "role": user.get("role", "customer"),
        "is_blocked": user.get("is_blocked", False),
        "created_at": user.get("created_at"),
    }


def parse_user_id(user_id: str) -> ObjectId:
    try:
        return ObjectId(user_id)
    except InvalidId as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid user id") from error


def serialize_audit_entry(entry: dict) -> dict:
    return {
        "id": str(entry["_id"]),
        "actor_id": entry["actor_id"],
        "action": entry["action"],
        "target_user_id": entry["target_user_id"],
        "details": entry.get("details", {}),
        "created_at": entry["created_at"],
    }


async def record_audit(db, actor_id: str, action: str, target_user_id: str, details: dict) -> None:
    await db["audit_log"].insert_one(
        {
            "actor_id": actor_id,
            "action": action,
            "target_user_id": target_user_id,
            "details": details,
            "created_at": datetime.now(timezone.utc),
        }
    )


@router.get("/", response_model=list[UserSummary])
async def list_users(_: CurrentUser = Depends(require_admin)):
    db = get_database()
    users = await db["users"].find({}).sort("created_at", -1).to_list(length=500)
    return [serialize_user(user) for user in users]


@router.get("/audit-log", response_model=list[AuditLogEntry])
async def list_audit_log(_: CurrentUser = Depends(require_admin)):
    db = get_database()
    entries = await db["audit_log"].find({}).sort("created_at", -1).to_list(length=200)
    return [serialize_audit_entry(entry) for entry in entries]


@router.patch("/{user_id}/role", response_model=UserSummary)
async def update_user_role(
    user_id: str,
    update: UserRoleUpdate,
    current_user: CurrentUser = Depends(require_admin),
):
    object_id = parse_user_id(user_id)
    if object_id == ObjectId(current_user["user_id"]):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot change your own role")
    db = get_database()
    target = await db["users"].find_one({"_id": object_id})
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    # Audited before the change is applied, not after - a role change is a
    # permission grant, and failing to record who made it must block the
    # grant rather than let it through unaudited. Reversed order (change
    # first, audit best-effort after) would let a transient audit-write
    # failure leave the change applied with no record of who made it.
    await record_audit(db, current_user["user_id"], "role_change", user_id, {"new_role": update.role})
    await db["users"].update_one({"_id": object_id}, {"$set": {"role": update.role}})
    updated = await db["users"].find_one({"_id": object_id})
    return serialize_user(updated)


@router.patch("/{user_id}/block", response_model=UserSummary)
async def update_user_block(
    user_id: str,
    update: UserBlockUpdate,
    current_user: CurrentUser = Depends(require_admin),
):
    object_id = parse_user_id(user_id)
    if object_id == ObjectId(current_user["user_id"]):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot block your own account")
    db = get_database()
    target = await db["users"].find_one({"_id": object_id})
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    # Same audited-before-applied ordering as update_user_role, and for the
    # same reason - see that function's comment.
    await record_audit(db, current_user["user_id"], "block_change", user_id, {"is_blocked": update.is_blocked})
    await db["users"].update_one({"_id": object_id}, {"$set": {"is_blocked": update.is_blocked}})
    updated = await db["users"].find_one({"_id": object_id})
    return serialize_user(updated)
