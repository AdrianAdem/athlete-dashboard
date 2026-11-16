-- Defense in depth for the signup trigger function: no search_path lookups and
-- not callable through the API (it only ever runs as a trigger).
ALTER FUNCTION public.handle_new_user() SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
