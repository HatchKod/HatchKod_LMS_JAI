import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") # Use service role to see everything
supabase = create_client(url, key)

print("--- PENDING SUBMISSIONS ---")
subs = supabase.table("submissions").select("*, users(name, assigned_mentor_id)").in_("status", ["pending", "rework"]).execute().data
for s in subs:
    user = s.get("users", {})
    print(f"ID: {s['id']} | Student: {user.get('name')} ({s['student_id']}) | Status: {s['status']} | Mentor Assigned: {user.get('assigned_mentor_id')} | Submission Mentor: {s.get('mentor_id')}")

print("\n--- BATCH MEMBERSHIPS ---")
members = supabase.table("batch_students").select("*, batches(name, mentor_id)").execute().data
for m in members:
    batch = m.get("batches", {})
    print(f"Student: {m['student_id']} | Batch: {batch.get('name')} | Mentor: {batch.get('mentor_id')}")
