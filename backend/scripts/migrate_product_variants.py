# backend/scripts/migrate_product_variants.py
"""
Backfill `variants` on products that do not have them yet. Safe to rerun:
only documents without a `variants` field are touched.

    cd backend && python scripts/migrate_product_variants.py --dry-run
    cd backend && python scripts/migrate_product_variants.py
"""
import asyncio
import sys
from pathlib import Path

import certifi
from motor.motor_asyncio import AsyncIOMotorClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import settings
from app.services.variants import build_variant_fields, split_stock


def plan_variants(product: dict) -> dict:
    variants = split_stock(product["sizes"], product["colors"], product["stock"])
    return build_variant_fields(str(product["_id"]), variants)


async def migrate(dry_run: bool) -> None:
    # Same Atlas-only CA handling as app/core/database.py.
    tls_kwargs = {"tlsCAFile": certifi.where()} if settings.MONGODB_URL.startswith("mongodb+srv://") else {}
    client = AsyncIOMotorClient(settings.MONGODB_URL, **tls_kwargs)
    try:
        products = client[settings.DB_NAME]["products"]
        changed = 0
        async for product in products.find({"variants": {"$exists": False}}):
            fields = plan_variants(product)
            split = ", ".join(f"{v['size']}/{v['color']}={v['stock']}" for v in fields["variants"])
            print(f"{product['name']} ({product['_id']}): stock {product['stock']} -> {split}")
            if dry_run:
                continue
            result = await products.update_one(
                {"_id": product["_id"], "variants": {"$exists": False}},
                {"$set": {"variants": fields["variants"]}},
            )
            changed += result.modified_count
        print(f"{'Would update' if dry_run else 'Updated'}: {changed if not dry_run else 'see above'}")
    finally:
        client.close()


if __name__ == "__main__":
    asyncio.run(migrate(dry_run="--dry-run" in sys.argv))
