-- vNext migration 004 · Managed subculture vocabulary

CREATE TABLE IF NOT EXISTS culture_subcultures (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  parent_slug TEXT REFERENCES culture_subcultures(slug),
  emoji TEXT,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed from dropdown vocabulary used in app/culture-radar/page.tsx today.
INSERT INTO culture_subcultures (slug, label, emoji, description) VALUES
  ('cottagecore',          'Cottagecore',          '🌾', 'Pastoral, romantic, anti-urban aesthetic'),
  ('dark_academia',        'Dark Academia',        '📚', 'Tweed, libraries, candlelight, classics'),
  ('coquette',             'Coquette',             '🎀', 'Soft, bowy, hyper-feminine micro-aesthetic'),
  ('y2k',                  'Y2K',                  '💿', '1999-2003 internet/fashion revival'),
  ('mob_wife',             'Mob Wife',             '💎', 'Fur, gold, big sunglasses, glamour'),
  ('clean_girl',           'Clean Girl',           '✨', 'Glowy skin, slicked hair, gold hoops'),
  ('eclectic_grandpa',     'Eclectic Grandpa',     '🧓', 'Vintage menswear, layered tweed'),
  ('gen_alpha_brainrot',   'Gen Alpha Brainrot',   '🧠', 'Skibidi, ohio, gyatt, fanum tax'),
  ('italian_brainrot',     'Italian Brainrot',     '🇮🇹', 'Tralalero, capybara, AI surreal'),
  ('weirdcore',            'Weirdcore',            '👁️', 'Liminal, uncanny, surreal internet'),
  ('internetfuneral',      'Internet Funeral',     '🪦', 'Terminally-online microculture'),
  ('booktok',              'BookTok',              '📖', 'Reading TikTok community'),
  ('foodtok',              'FoodTok',              '🍴', 'Food TikTok community'),
  ('beautytok',            'BeautyTok',            '💄', 'Beauty TikTok community'),
  ('fittok',               'FitTok',               '💪', 'Fitness TikTok community'),
  ('hometok',              'HomeTok',              '🏠', 'Home decor TikTok community'),
  ('traveltok',            'TravelTok',            '✈️', 'Travel TikTok community'),
  ('cleantok',             'CleanTok',             '🧼', 'Cleaning hacks TikTok community'),
  ('fashion_reps',         'Fashion Reps',         '👟', 'Replica streetwear, sneakerheads'),
  ('mob_wife_summer',      'Mob Wife Summer',      '🌞', 'Seasonal variant of mob wife'),
  ('tradwife',             'Tradwife',             '👗', 'Traditional wife aesthetic'),
  ('that_girl',            'That Girl',            '💧', 'Wellness, journals, green juice'),
  ('sleepmaxxing',         'Sleepmaxxing',         '😴', 'Optimised sleep stack'),
  ('lookmaxxing',          'Lookmaxxing',          '🪞', 'Aesthetic self-optimisation'),
  ('dimes_square',         'Dimes Square',         '🥃', 'NYC post-irony scene'),
  ('hyperpop',             'Hyperpop',             '🎶', 'Maximalist hyper-produced music scene'),
  ('indie_sleaze_revival', 'Indie Sleaze Revival', '📸', '2008-2014 NYC indie revival'),
  ('sad_girl_pop',         'Sad Girl Pop',         '🥀', 'Melancholic pop with diaristic lyrics'),
  ('gaming_fandom',        'Gaming Fandom',        '🎮', 'Cross-game community culture'),
  ('kpop_fandom',          'K-Pop Fandom',         '💖', 'K-Pop stan culture'),
  ('anime_otaku',          'Anime / Otaku',        '⛩️', 'Anime + manga fan culture'),
  ('stan_culture',         'Stan Culture',         '💞', 'General fan-stan dynamics')
ON CONFLICT (slug) DO NOTHING;

-- Add FK column to culture_trends
ALTER TABLE culture_trends
  ADD COLUMN IF NOT EXISTS subculture_id INTEGER REFERENCES culture_subcultures(id);

-- Backfill: map existing TEXT subculture (lowercase, underscore) to a slug.
UPDATE culture_trends t SET subculture_id = s.id
  FROM culture_subcultures s
  WHERE lower(regexp_replace(coalesce(t.subculture, ''), '[^a-z0-9]+', '_', 'g')) = s.slug
    AND t.subculture_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_trends_subculture_id
  ON culture_trends (subculture_id) WHERE subculture_id IS NOT NULL;

INSERT INTO culture_migrations (name) VALUES ('2026-06-08-004-subcultures-table')
ON CONFLICT (name) DO NOTHING;
