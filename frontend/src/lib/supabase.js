import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'https://ebrhbalrkskrxododiqo.supabase.co';
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVicmhiYWxya3NrcnhvZG9kaXFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczODY4MDQsImV4cCI6MjA5Mjk2MjgwNH0.oAuj91Mb5NLwk7-Ju8TBDriDEVeEWA_EuZk689gZESQ';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
