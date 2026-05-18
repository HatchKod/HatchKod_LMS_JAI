import asyncio
import sys
import os

# Add backend to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)) + "/..")

from server import pending_submissions

async def run_test():
    user = {"id": "7a20ae8c-d48e-465c-9d4d-1852a2f318c6", "name": "Mrunal", "role": "mentor"}
    try:
        print("Calling pending_submissions...")
        res = await pending_submissions(user)
        print(f"Result length: {len(res)}")
        if len(res) > 0:
            print(f"First item: {res[0]}")
        else:
            print("Empty list returned!")
    except Exception as e:
        print(f"Exception: {e}")

if __name__ == "__main__":
    asyncio.run(run_test())
