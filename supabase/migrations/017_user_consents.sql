-- Proof of consent (GDPR Art. 7(1)): which user accepted which text version, when.
-- Written by the app's consent screen after login; one row per user and kind.
CREATE TABLE IF NOT EXISTS public.user_consents (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind)
);
ALTER TABLE public.user_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS own_rows ON public.user_consents;
CREATE POLICY own_rows ON public.user_consents FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

REVOKE ALL ON public.user_consents FROM anon;
