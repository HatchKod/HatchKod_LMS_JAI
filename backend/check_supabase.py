from dotenv import load_dotenv
import os
from supabase import create_client

load_dotenv("backend/.env")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# Try to fetch one row to see the columns
res = supabase.table("submissions").select("*").limit(1).execute()
if res.data:
    print("Columns:", res.data[0].keys())
else:
    print("No data in submissions table to infer columns.")

# Also check buckets
try:
    buckets = supabase.storage.list_buckets()
    print("Buckets:", [b.name for b in buckets])
except Exception as e:
    print("Error listing buckets:", e)
