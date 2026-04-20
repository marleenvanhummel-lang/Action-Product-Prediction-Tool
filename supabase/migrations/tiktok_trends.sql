-- TikTok Creative Center trend hashtags (Netherlands only)
create table if not exists public.tiktok_trend_hashtags (
  id bigserial primary key,
  rank int,
  hashtag_id text,
  hashtag_name text not null,
  publish_cnt bigint,
  video_views bigint,
  country_code text default 'NL',
  period int default 7,
  raw jsonb not null,
  scraped_at timestamptz not null default now()
);

create index if not exists idx_tiktok_trend_hashtags_scraped_at
  on public.tiktok_trend_hashtags (scraped_at desc);

create index if not exists idx_tiktok_trend_hashtags_hashtag_name
  on public.tiktok_trend_hashtags (hashtag_name);

-- Details for a single hashtag (incl. enriched videos)
create table if not exists public.tiktok_hashtag_details (
  hashtag text primary key,
  country_code text default 'NL',
  period int default 7,
  info jsonb,
  related_hashtags jsonb,
  audience_ages jsonb,
  audience_interests jsonb,
  audience_countries jsonb,
  videos jsonb,
  scraped_at timestamptz not null default now(),
  enriched_at timestamptz
);
