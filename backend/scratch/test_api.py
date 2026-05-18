import httpx
import asyncio

async def test_api():
    # Login as Mrunal
    async with httpx.AsyncClient() as client:
        # First get login token
        # Assuming we can login with Mrunal's email if we know it, or we can just bypass
        # Let's just create a mock token if we can't login, but it's better to login.
        # Wait, I don't know Mrunal's password. 
        pass

if __name__ == "__main__":
    asyncio.run(test_api())
