import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

url = "https://ebrhbalrkskrxododiqo.supabase.co"
key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVicmhiYWxya3NrcnhvZG9kaXFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczODY4MDQsImV4cCI6MjA5Mjk2MjgwNH0.oAuj91Mb5NLwk7-Ju8TBDriDEVeEWA_EuZk689gZESQ"
supabase = create_client(url, key)

mid = "7a20ae8c-d48e-465c-9d4d-1852a2f318c6"
sid = "354e180b-97d7-4555-8d6b-3065e4e1fce1"

print("--- TESTING OR FILTER ---")
# Try with simple in
try:
    res = supabase.table("submissions").select("*").or_(f"student_id.eq.{sid},mentor_id.eq.{mid}").execute()
    print(f"Result with .eq: {len(res.data)} items found")
except Exception as e:
    print(f"Error with .eq: {e}")

try:
    res = supabase.table("submissions").select("*").or_(f"student_id.in.({sid}),mentor_id.eq.{mid}").execute()
    print(f"Result with .in: {len(res.data)} items found")
except Exception as e:
    print(f"Error with .in: {e}")
