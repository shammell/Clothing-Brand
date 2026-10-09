from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.database import get_database
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
        "created_at": user["created_at"],
    }


def parse_user_id(user_id: str) -> ObjectId:
    try:
        return ObjectId(user_id)
    except InvalidId as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid user id") from error


@router.get("/", response_model=list[UserSummary])
async def list_users(_: CurrentUser = Depends(require_admin)):
    db = get_database()
    users = await db["users"].find({}).sort("created_at", -1).to_list(length=500)
    return [serialize_user(user) for user in users]


@router.patch("/{user_id}/role", response_model=UserSummary)
async def update_user_role(
    user_id: str,
    update: UserRoleUpdate,
    current_user: CurrentUser = Depends(require_admin),
):
    if user_id == current_user["user_id"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot change your own role")
    object_id = parse_user_id(user_id)
    db = get_database()
    result = await db["users"].find_one_and_update(
        {"_id": object_id}, {"$set": {"role": update.role}}
    )
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    updated = await db["users"].find_one({"_id": object_id})
    return serialize_user(updated)


@router.patch("/{user_id}/block", response_model=UserSummary)
async def update_user_block(
    user_id: str,
    update: UserBlockUpdate,
    current_user: CurrentUser = Depends(require_admin),
):
    if user_id == current_user["user_id"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot block your own account")
    object_id = parse_user_id(user_id)
    db = get_database()
    result = await db["users"].find_one_and_update(
        {"_id": object_id}, {"$set": {"is_blocked": update.is_blocked}}
    )
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    updated = await db["users"].find_one({"_id": object_id})
    return serialize_user(updated)
