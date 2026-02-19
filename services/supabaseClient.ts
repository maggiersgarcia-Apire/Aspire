import { createClient } from '@supabase/supabase-js';

// Credentials updated for project 'wlmyabncjxjvidfcepxc'
const SUPABASE_URL = 'https://wlmyabncjxjvidfcepxc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsbXlhYm5janhqdmlkZmNlcHhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0NzkwNTgsImV4cCI6MjA4NzA1NTA1OH0.flOz_OVWIaRvB0tE_gnICPm4sHk2GhgQwaP-V-cIKY4';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);