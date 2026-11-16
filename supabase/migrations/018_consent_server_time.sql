-- The consent timestamp must come from the database, not from the client:
-- every insert or update stamps accepted_at with the server's now().
CREATE OR REPLACE FUNCTION public.stamp_consent_time()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.accepted_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stamp_consent_time ON public.user_consents;
CREATE TRIGGER stamp_consent_time
  BEFORE INSERT OR UPDATE ON public.user_consents
  FOR EACH ROW EXECUTE FUNCTION public.stamp_consent_time();
