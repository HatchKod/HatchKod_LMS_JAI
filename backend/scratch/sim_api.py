import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

url = "https://ebrhbalrkskrxododiqo.supabase.co"
key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVicmhiYWxya3NrcnhvZG9kaXFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczODY4MDQsImV4cCI6MjA5Mjk2MjgwNH0.oAuj91Mb5NLwk7-Ju8TBDriDEVeEWA_EuZk689gZESQ"
supabase = create_client(url, key)

# Simulation for Mrunal
user = {"id": "7a20ae8c-d48e-465c-9d4d-1852a2f318c6", "name": "Mrunal", "role": "mentor"}

print(f"--- SIMULATING API FOR {user['name']} ---")

# Step 1: Batches
batches = supabase.table("batches").select("id").eq("mentor_id", user["id"]).execute().data or []
b_ids = [b["id"] for b in batches]
print(f"Batches found: {b_ids}")

student_ids = []
if b_ids:
    bs = supabase.table("batch_students").select("student_id").in_("batch_id", b_ids).execute().data or []
    student_ids.extend([item["student_id"] for item in bs])
    print(f"Students from batches: {len(bs)}")

# Step 2: Assigned
assigned = supabase.table("users").select("id").eq("assigned_mentor_id", user["id"]).execute().data or []
student_ids.extend([u["id"] for u in assigned])
print(f"Students assigned: {len(assigned)}")

student_ids = list(set(student_ids))
print(f"Total unique students: {student_ids}")

# Step 3: Query
query = supabase.table("submissions").select("*").in_("status", ["pending", "rework"])
if student_ids:
    filter_str = f"student_id.in.({','.join(student_ids)}),mentor_id.eq.{user['id']}"
    print(f"Applying OR filter: {filter_str}")
    query = query.or_(filter_str)
else:
    print("No students found, filtering by mentor_id only")
    query = query.eq("mentor_id", user["id"])

res = query.order("submitted_at", desc=True).execute()
subs = res.data or []
print(f"Final Count: {len(subs)}")
if subs:
    print(f"First Sub ID: {subs[0]['id']}")
