const test = require('node:test');
const assert = require('node:assert');
const { getMediumPosts, toPost, resetCache } = require('../services/medium');

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/" version="2.0">
<channel><title>Stories by Gorakh on Medium</title>
<item>
  <title><![CDATA[Building a hash-chained event log]]></title>
  <link>https://medium.com/@grcsr/hash-chained-log-123abc?source=rss-abc------2</link>
  <category><![CDATA[nodejs]]></category><category><![CDATA[postgres]]></category>
  <dc:creator><![CDATA[Gorakh Chavan]]></dc:creator>
  <pubDate>Mon, 12 Oct 2026 08:00:00 GMT</pubDate>
  <content:encoded><![CDATA[<figure><img alt="" src="https://cdn-images-1.medium.com/max/1024/cover.png" /></figure><p>Every worker action becomes an append-only event that carries the hash of the one before it, per farm.</p><p>More text here.</p><img src="https://medium.com/_/stat?event=post.clientViewed" width="1" height="1" />]]></content:encoded>
</item>
</channel></rss>`;

const res = (body, status = 200) => ({ ok: status < 400, status, text: async () => body, json: async () => JSON.parse(body) });

test('parses Medium RSS into clean posts', async () => {
  resetCache();
  const calls = [];
  const posts = await getMediumPosts({
    fetchImpl: async (url, init) => {
      calls.push({ url, ua: init?.headers?.['User-Agent'] });
      return res(RSS);
    },
  });
  assert.match(calls[0].ua, /Mozilla/);
  assert.deepStrictEqual(posts[0], {
    title: 'Building a hash-chained event log',
    url: 'https://medium.com/@grcsr/hash-chained-log-123abc',
    image: 'https://cdn-images-1.medium.com/max/1024/cover.png',
    description: 'Every worker action becomes an append-only event that carries the hash of the one before it, per farm.',
    publishedAt: '2026-10-12T08:00:00.000Z',
    readTime: '1 min read',
    tags: ['nodejs', 'postgres'],
    author: 'Gorakh Chavan',
    source: 'medium',
  });
});

test('falls back to rss2json when Medium blocks the request', async () => {
  resetCache();
  const posts = await getMediumPosts({
    fetchImpl: async (url) =>
      url.startsWith('https://medium.com')
        ? res('Forbidden', 403)
        : res(JSON.stringify({ status: 'ok', items: [{ title: 'Via mirror', link: 'https://medium.com/@grcsr/x?source=rss', pubDate: '2026-10-01 10:00:00', categories: [], content: '<p>' + 'word '.repeat(500) + '</p>' }] })),
  });
  assert.strictEqual(posts[0].title, 'Via mirror');
  assert.strictEqual(posts[0].url, 'https://medium.com/@grcsr/x');
  assert.strictEqual(posts[0].readTime, '2 min read');
});

test('serves cached posts when both sources fail later', async () => {
  resetCache();
  await getMediumPosts({ fetchImpl: async () => res(RSS), now: 0 });
  const posts = await getMediumPosts({ fetchImpl: async () => res('down', 503), now: 60 * 60 * 1000 });
  assert.strictEqual(posts.length, 1);
});

test('throws a clear error when nothing is available', async () => {
  resetCache();
  await assert.rejects(getMediumPosts({ fetchImpl: async () => res('down', 503) }), /Medium RSS responded 503; rss2json responded 503/);
});

test('skips the tracking pixel when no real image exists', () => {
  const post = toPost({ title: 't', link: 'https://m/x', html: '<p>short</p><img src="https://medium.com/_/stat?event=x" />' });
  assert.strictEqual(post.image, null);
});
