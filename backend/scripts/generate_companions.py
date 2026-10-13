# backend/scripts/generate_companions.py
"""
Fill each product's `companions` (what it pairs with) from category and colour rules.

    cd backend && python scripts/generate_companions.py --dry-run
    cd backend && python scripts/generate_companions.py
    python scripts/generate_companions.py --overwrite        # also redo hand-edited lists
    python scripts/generate_companions.py --rank-with-llm    # let the model reorder (offline, slow on purpose)

Products whose list was set by hand (companions_source == "manual") are skipped
unless --overwrite is passed. Safe to rerun.
"""
import asyncio
import json
import sys
import time
from pathlib import Path

import certifi
import httpx
from motor.motor_asyncio import AsyncIOMotorClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import settings
from app.services.chat_services import GROQ_URL
from app.services.companions import rank_companions

# Groq's free tier allows 30 requests a minute; stay well under it.
LLM_PAUSE_SECONDS = 2.5


def rank_with_llm(product: dict, candidates: list[dict]) -> list[dict]:
    """Ask the model to order the rule-picked candidates. Falls back to the rule order on any problem."""
    listing = [{"id": str(c["_id"]), "name": c["name"], "colors": c["colors"]} for c in candidates]
    prompt = (
        f"Best outfit pairings for {product['name']} ({', '.join(product['colors'])}). "
        f"Order these candidates from best to worst match. Reply with a JSON array of ids only: {json.dumps(listing)}"
    )
    try:
        response = httpx.post(
            GROQ_URL,
            headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}"},
            json={"model": settings.GROQ_MODEL, "messages": [{"role": "user", "content": prompt}], "temperature": 0},
            timeout=settings.GROQ_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        order = json.loads(response.json()["choices"][0]["message"]["content"])
        by_id = {str(c["_id"]): c for c in candidates}
        ordered = [by_id[i] for i in order if i in by_id]
        return ordered + [c for c in candidates if c not in ordered]
    except Exception as error:  # a bad model answer must not stop the run
        print(f"  (model ranking skipped: {error})")
        return candidates
    finally:
        time.sleep(LLM_PAUSE_SECONDS)


async def generate(dry_run: bool, overwrite: bool, use_llm: bool) -> None:
    tls_kwargs = {"tlsCAFile": certifi.where()} if settings.MONGODB_URL.startswith("mongodb+srv://") else {}
    client = AsyncIOMotorClient(settings.MONGODB_URL, **tls_kwargs)
    try:
        products = client[settings.DB_NAME]["products"]
        everything = await products.find({}).to_list(length=1000)
        in_stock = [p for p in everything if p.get("stock", 0) > 0]
        updated = skipped = 0
        for product in everything:
            if product.get("companions_source") == "manual" and not overwrite:
                skipped += 1
                continue
            ranked = rank_companions(product, in_stock)
            if use_llm and len(ranked) > 1:
                ranked = rank_with_llm(product, ranked)
            ids = [str(p["_id"]) for p in ranked]
            if ids == product.get("companions", []) and product.get("companions_source") == "generated":
                continue
            print(f"{product['name']}: {', '.join(p['name'] for p in ranked) or '(no eligible companions)'}")
            if not dry_run:
                await products.update_one(
                    {"_id": product["_id"]}, {"$set": {"companions": ids, "companions_source": "generated"}}
                )
            updated += 1
        print(f"{'Would update' if dry_run else 'Updated'}: {updated}, skipped (hand-edited): {skipped}")
    finally:
        client.close()


if __name__ == "__main__":
    asyncio.run(
        generate(
            dry_run="--dry-run" in sys.argv,
            overwrite="--overwrite" in sys.argv,
            use_llm="--rank-with-llm" in sys.argv,
        )
    )
