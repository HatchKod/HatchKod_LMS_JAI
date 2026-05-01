from dotenv import load_dotenv
import os
from supabase import create_client

load_dotenv("backend/.env")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

try:
    # Create the bucket 'submissions'
    # We'll make it public for simplicity in this demo, but usually you'd want RLS
    res = supabase.storage.create_bucket('submissions', options={'public': True})
    print("Bucket 'submissions' created successfully:", res)
except Exception as e:
    print("Error creating bucket (it might already exist):", e)

# We also need to add a column 'file_url' to 'submissions' table if possible.
# Since we can't easily run SQL via the python client without a custom function,
# I will check if I can use submission_url for both.
# But adding a column is cleaner.
# I'll try to use submission_url and maybe add a 'submission_type' column if I could.
# For now, I'll just use submission_url and assume it can be a GitHub link OR a Supabase Storage link.
