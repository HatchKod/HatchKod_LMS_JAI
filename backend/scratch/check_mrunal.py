import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

url = "https://ebrhbalrkskrxododiqo.supabase.co"
key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVicmhiYWxya3NrcnhvZG9kaXFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczODY4MDQsImV4cCI6MjA5Mjk2MjgwNH0.oAuj91Mb5NLwk7-Ju8TBDriDEVeEWA_EuZk689gZESQ"
supabase = create_client(url, key)

print("--- MRUNAL INFO ---")
mrunal = supabase.table("users").select("id, name, role").ilike("name", "%Mrunal%").execute().data
if mrunal:
    mid = mrunal[0]["id"]
    print(f"Mrunal ID: {mid}")
    
    # Check batches
    batches = supabase.table("batches").select("id, name").eq("mentor_id", mid).execute().data
    print(f"Batches: {batches}")
    
    # Check assigned students
    assigned = supabase.table("users").select("id, name").eq("assigned_mentor_id", mid).execute().data
    print(f"Directly Assigned Students: {assigned}")
    
    # Check ALL pending subs
    print("\n--- ALL PENDING SUBS ---")
    subs = supabase.table("submissions").select("id, student_id, status, mentor_id").in_("status", ["pending", "rework"]).execute().data
    for s in subs:
        print(f"Sub ID: {s['id']} | Student ID: {s['student_id']} | Current Sub Mentor: {s['mentor_id']}")
else:
    print("Mrunal not found")
