-- =====================================================================
-- Culture Radar — Seed sources
-- =====================================================================
-- 35 curated trend sources, ported from the Lovable trend-ai project.
-- Categories: food, beauty, fashion, home, lifestyle, tech, meme, platform,
-- sound, culture.
-- Source types: platform (official), blog, reddit, youtube,
-- instagram_proxy (via picuki), hashtag_page, aggregator.
-- Reliability: 1-5 stars. Detection lag: typical days from real emergence
-- to appearance on this source.
-- =====================================================================

INSERT INTO culture_sources
  (name, url, category, source_type, reliability, detection_lag_days, notes)
VALUES
  -- ─── Real-time platforms (0-3 days lag) ───────────────────────────
  ('TikTok Creative Center', 'https://ads.tiktok.com/business/creativecenter/inspiration/popular/hashtag/pc/en', 'platform', 'platform', 5, 1, 'Official TikTok hashtag rankings'),
  ('TikTok Discover',        'https://www.tiktok.com/discover',                                                     'platform', 'platform', 5, 1, 'Official discover feed'),
  ('TikTok Popular Hashtags','https://www.tiktok.com/explore',                                                      'platform', 'platform', 5, 1, 'Official explore'),
  ('Google Trends Daily NL', 'https://trends.google.com/trending/rss?geo=NL',                                      'platform', 'google_trends_api', 5, 1, 'NL daily trending searches via Google JSON+RSS endpoints (no Firecrawl)'),
  ('Google Trends Daily BE', 'https://trends.google.com/trending/rss?geo=BE',                                      'platform', 'google_trends_api', 5, 1, 'BE daily trending searches'),
  ('YouTube Trending NL',    'https://www.youtube.com/feed/trending?gl=NL',                                          'platform', 'platform', 4, 2, 'Video trends NL'),
  ('Instagram Reels Explore','https://www.instagram.com/explore/reels/',                                             'platform', 'platform', 4, 2, 'Reels trends'),

  -- ─── Reddit (real-time signals, 1-3 days lag) ─────────────────────
  ('r/TikTokCringe',         'https://www.reddit.com/r/TikTokCringe/.json',                                          'meme',     'reddit',   3, 2, 'Viral TikToks reposted'),
  ('r/BeautyGuruChatter',    'https://www.reddit.com/r/BeautyGuruChatter/.json',                                     'beauty',   'reddit',   3, 3, 'Beauty community chatter'),
  ('r/OutOfTheLoop',         'https://www.reddit.com/r/OutOfTheLoop/.json',                                          'culture',  'reddit',   4, 1, 'Viral phenomena explained'),
  ('r/RandomActsOfMakeup',   'https://www.reddit.com/r/RandomActsOfMakeup/.json',                                    'beauty',   'reddit',   2, 4, 'Beauty product discovery'),
  ('r/FoodPorn',             'https://www.reddit.com/r/FoodPorn/.json',                                              'food',     'reddit',   3, 3, 'Visual food trends'),
  ('r/HomeImprovement',      'https://www.reddit.com/r/HomeImprovement/.json',                                       'home',     'reddit',   3, 4, 'DIY discussions'),

  -- ─── Aggregators / early-detection ────────────────────────────────
  ('Exploding Topics',       'https://explodingtopics.com/blog',                                                     'culture',  'aggregator', 4, 7, 'Early-stage trend detection'),
  ('Know Your Meme',         'https://knowyourmeme.com/memes/recent',                                                'meme',     'aggregator', 4, 3, 'Meme tracking'),
  ('GenZ.ai Food',           'https://genz.ai/trends/food/',                                                          'food',     'aggregator', 4, 2, 'Gen Z food trends'),
  ('GenZ.ai Beauty',         'https://genz.ai/trends/beauty/',                                                        'beauty',   'aggregator', 4, 2, 'Gen Z beauty trends'),
  ('GenZ.ai Lifestyle',      'https://genz.ai/trends/lifestyle/',                                                     'lifestyle','aggregator', 4, 2, 'Gen Z lifestyle'),
  ('GenZ.ai Gadgets',        'https://genz.ai/trends/gadgets/',                                                       'tech',     'aggregator', 4, 2, 'Tech / gadget trends'),

  -- ─── Niche blogs ──────────────────────────────────────────────────
  -- Food
  ('Okonomi Kitchen',        'https://okonomikitchen.com',                                                            'food',     'blog',     4, 5, 'Viral food hacks'),
  ('Allrecipes Trending',    'https://www.allrecipes.com/news',                                                       'food',     'blog',     4, 5, 'Recipe trends'),
  ('Food & Wine Trends',     'https://www.foodandwine.com/news',                                                      'food',     'blog',     4, 7, 'Culinary trends'),
  ('Tasty Blog',             'https://tasty.co',                                                                       'food',     'blog',     4, 5, 'Viral recipes'),
  ('Today Food Trends',      'https://www.today.com/food/trends',                                                      'food',     'blog',     4, 5, 'Food news'),
  -- Beauty
  ('Who What Wear Beauty',   'https://www.whowhatwear.com/beauty',                                                    'beauty',   'blog',     4, 5, 'Beauty trends'),
  ('Refinery29 Beauty',      'https://www.refinery29.com/en-us/beauty',                                               'beauty',   'blog',     4, 7, 'Lifestyle beauty'),
  ('Allure Beauty Trends',   'https://www.allure.com/topic/beauty-trends',                                            'beauty',   'blog',     4, 5, 'Beauty trend reporting'),
  ('Byrdie Beauty',          'https://www.byrdie.com/beauty-trends-4844658',                                          'beauty',   'blog',     4, 5, 'Product reviews + trends'),
  -- Home & DIY
  ('Apartment Therapy',      'https://www.apartmenttherapy.com',                                                      'home',     'blog',     4, 7, 'Home decor'),
  ('The Spruce Trending',    'https://www.thespruce.com/trending-5118644',                                            'home',     'blog',     4, 7, 'DIY + home tips'),
  -- Social-media industry
  ('Social Media Today',     'https://www.socialmediatoday.com',                                                      'culture',  'blog',     4, 10, 'Industry news'),
  ('Later Blog',             'https://later.com/blog/',                                                                'culture',  'blog',     3, 10, 'Social media trends'),

  -- ─── Sound specialists ────────────────────────────────────────────
  ('Epidemic Sound Blog',    'https://www.epidemicsound.com/blog/',                                                   'sound',    'blog',     4, 7, 'Audio + sound trends'),

  -- ─── Instagram proxy (via Picuki) ─────────────────────────────────
  ('Picuki: holler.academy', 'https://www.picuki.com/profile/holler.academy',                                         'culture',  'instagram_proxy', 3, 3, 'Creator trends'),
  ('Picuki: tiktokroom',     'https://www.picuki.com/profile/tiktokroom',                                             'meme',     'instagram_proxy', 3, 2, 'Viral content'),
  ('Picuki: trendmood',      'https://www.picuki.com/profile/trendmood',                                              'beauty',   'instagram_proxy', 3, 3, 'Beauty trends')
ON CONFLICT (url) DO UPDATE SET
  name              = EXCLUDED.name,
  category          = EXCLUDED.category,
  source_type       = EXCLUDED.source_type,
  reliability       = EXCLUDED.reliability,
  detection_lag_days = EXCLUDED.detection_lag_days,
  notes             = EXCLUDED.notes;

-- Quick sanity check: SELECT category, COUNT(*) FROM culture_sources GROUP BY category ORDER BY 2 DESC;
