-- Fix help article create/update failing with:
--   record "new" has no field "article_id"
-- Shared search-refresh trigger referenced NEW.article_id while attached to
-- help_articles (which uses id). Use one trigger function per table.

CREATE OR REPLACE FUNCTION public.trg_refresh_help_article_search_from_article()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.refresh_help_article_search(COALESCE(NEW.id, OLD.id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_refresh_help_article_search_from_step()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.refresh_help_article_search(
    COALESCE(NEW.article_id, OLD.article_id)
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS help_articles_search_refresh ON public.help_articles;
CREATE TRIGGER help_articles_search_refresh
  AFTER INSERT OR UPDATE OF title, summary, body_content, search_keywords, category_id
  ON public.help_articles
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_refresh_help_article_search_from_article();

DROP TRIGGER IF EXISTS help_article_steps_search_refresh ON public.help_article_steps;
CREATE TRIGGER help_article_steps_search_refresh
  AFTER INSERT OR UPDATE OF title, instruction, step_number OR DELETE
  ON public.help_article_steps
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_refresh_help_article_search_from_step();

DROP FUNCTION IF EXISTS public.trg_refresh_help_article_search();
