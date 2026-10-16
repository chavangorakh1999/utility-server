const cheerio = require('cheerio');
const Parser = require('rss-parser');

// Fetches posts from a Medium profile's RSS feed.
//
// Medium sits behind Cloudflare and often rejects requests that don't look like a
// browser (rss-parser's own fetch sends "rss-parser" as the User-Agent), so the feed
// is fetched with browser-like headers and parsed from text. If Medium still refuses
// (403/429 from datacenter IPs happens), it falls back to the rss2json.com mirror.
// Results are cached in memory so a warm instance doesn't hit Medium on every request.

const MEDIUM_USER = process.env.MEDIUM_USER || '@grcsr';
const FEED_URL = `https://medium.com/feed/${MEDIUM_USER}`;
const CACHE_MS = 30 * 60 * 1000;
const WORDS_PER_MINUTE = 230;

const parser = new Parser({ customFields: { item: ['content:encoded'] } });

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  Accept: 'application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5',
  'Accept-Language': 'en-US,en;q=0.9',
};

let cache = { at: 0, posts: null };

// Medium appends tracking params (?source=rss-...) to links.
const cleanUrl = (url) => (url ? url.split('?')[0] : null);

const toPost = ({ title, link, pubDate, categories, html, author }) => {
  const $ = cheerio.load(html || '');
  // Medium adds a 1x1 tracking pixel at the end of each post; skip it.
  const image =
    $('img')
      .map((_, el) => $(el).attr('src'))
      .get()
      .find((src) => src && !src.includes('/_/stat')) || null;
  const text = $.root().text().replace(/\s+/g, ' ').trim();
  const firstParagraph =
    $('p')
      .map((_, el) => $(el).text().trim())
      .get()
      .find((p) => p.length > 60) || text.slice(0, 220);
  const words = text ? text.split(' ').length : 0;

  return {
    title: title?.trim() || 'Untitled',
    url: cleanUrl(link),
    image,
    description: firstParagraph.length > 220 ? `${firstParagraph.slice(0, 217).trimEnd()}…` : firstParagraph,
    publishedAt: pubDate ? new Date(pubDate).toISOString() : null,
    readTime: `${Math.max(1, Math.round(words / WORDS_PER_MINUTE))} min read`,
    tags: (categories || []).slice(0, 4),
    author: author || null,
    source: 'medium',
  };
};

async function fromRss(fetchImpl) {
  const res = await fetchImpl(FEED_URL, { headers: BROWSER_HEADERS });
  if (!res.ok) throw new Error(`Medium RSS responded ${res.status}`);
  const feed = await parser.parseString(await res.text());
  return (feed.items || []).map((item) =>
    toPost({
      title: item.title,
      link: item.link,
      pubDate: item.isoDate || item.pubDate,
      categories: item.categories,
      html: item['content:encoded'] || item.content,
      author: item.creator,
    })
  );
}

async function fromRss2Json(fetchImpl) {
  const res = await fetchImpl(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(FEED_URL)}`);
  if (!res.ok) throw new Error(`rss2json responded ${res.status}`);
  const body = await res.json();
  if (body.status !== 'ok') throw new Error(`rss2json: ${body.message || 'error'}`);
  return (body.items || []).map((item) =>
    toPost({
      title: item.title,
      link: item.link,
      pubDate: item.pubDate,
      categories: item.categories,
      html: item.content || item.description,
      author: item.author,
    })
  );
}

async function getMediumPosts({ fetchImpl = fetch, now = Date.now(), force = false } = {}) {
  if (!force && cache.posts && now - cache.at < CACHE_MS) return cache.posts;
  const errors = [];
  for (const source of [fromRss, fromRss2Json]) {
    try {
      const posts = await source(fetchImpl);
      cache = { at: now, posts };
      return posts;
    } catch (err) {
      errors.push(err.message);
    }
  }
  // Serve the last good result rather than nothing if Medium is temporarily down.
  if (cache.posts) return cache.posts;
  throw new Error(`Could not load Medium posts: ${errors.join('; ')}`);
}

const resetCache = () => {
  cache = { at: 0, posts: null };
};

module.exports = { getMediumPosts, toPost, resetCache, FEED_URL };
