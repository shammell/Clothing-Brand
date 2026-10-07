import asyncio
import os

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient


load_dotenv()

MONGODB_URL = os.getenv("MONGODB_URL")
DB_NAME = os.getenv("DB_NAME", "clothing_store")


PRODUCTS = [
    {
        "name": "Classic Cotton T-Shirt",
        "description": "Soft cotton t-shirt for everyday wear.",
        "price": 19.99,
        "category": "T-Shirts",
        "brand": "Urban Basics",
        "sizes": ["S", "M", "L", "XL"],
        "colors": ["Black", "White", "Navy"],
        "image_url": "/products/cotton-tshirt.jpg",
        "stock": 50,
        "rating": 4.5,
    },
    {
        "name": "Slim Fit Denim Jeans",
        "description": "Comfortable slim-fit jeans with stretch denim.",
        "price": 49.99,
        "category": "Jeans",
        "brand": "Denim Co.",
        "sizes": ["30", "32", "34", "36"],
        "colors": ["Blue", "Black"],
        "image_url": "/products/denim-jeans.svg",
        "stock": 35,
        "rating": 4.3,
    },
    {
        "name": "Lightweight Summer Dress",
        "description": "Breathable dress with a relaxed summer fit.",
        "price": 39.99,
        "category": "Dresses",
        "brand": "Mira Fashion",
        "sizes": ["XS", "S", "M", "L"],
        "colors": ["Red", "White", "Floral"],
        "image_url": "/products/summer-dress.jpg",
        "stock": 25,
        "rating": 4.7,
    },
    {
        "name": "Classic Zip Hoodie",
        "description": "Warm fleece hoodie with a full front zip.",
        "price": 44.99,
        "category": "Hoodies",
        "brand": "North Street",
        "sizes": ["S", "M", "L", "XL", "XXL"],
        "colors": ["Grey", "Black", "Green"],
        "image_url": "/products/blue-hoodie.jpg",
        "stock": 40,
        "rating": 4.6,
    },
    {
        "name": "Leather Casual Sneakers",
        "description": "Everyday sneakers with a cushioned sole.",
        "price": 59.99,
        "category": "Shoes",
        "brand": "Step Up",
        "sizes": ["7", "8", "9", "10", "11"],
        "colors": ["White", "Black"],
        "image_url": "/products/casual-sneakers.svg",
        "stock": 30,
        "rating": 4.4,
    },
    {
        "name": "Relaxed Linen Shirt",
        "description": "A relaxed floral shirt with a soft, lightweight feel.",
        "price": 34.99,
        "category": "Shirts",
        "brand": "Thread&Co",
        "sizes": ["S", "M", "L", "XL"],
        "colors": ["Beige", "Brown", "Cream"],
        "image_url": "/products/linen-shirt.jpg",
        "stock": 20,
        "rating": 4.8,
    },
]


async def seed_products() -> None:
    if not MONGODB_URL:
        raise RuntimeError("MONGODB_URL is missing from the .env file.")

    client = AsyncIOMotorClient(MONGODB_URL)
    try:
        database = client[DB_NAME]
        products = database["products"]

        await products.delete_many({})
        result = await products.insert_many(PRODUCTS)
        print(f"Inserted {len(result.inserted_ids)} products into MongoDB.")
    finally:
        client.close()


if __name__ == "__main__":
    asyncio.run(seed_products())