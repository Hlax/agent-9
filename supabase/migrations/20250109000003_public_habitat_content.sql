-- Store approved public habitat content for public-site to display.
CREATE TABLE IF NOT EXISTS public_habitat_content (
  slug TEXT PRIMARY KEY DEFAULT 'home',
  title TEXT,
  body TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public_habitat_content (slug, title, body, updated_at)
VALUES ('home', 'Hello Twin!', NULL, now())
ON CONFLICT (slug) DO NOTHING;
