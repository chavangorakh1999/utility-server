const test = require('node:test');
const assert = require('node:assert');
const Blog = require('../models/Blog.model');
const { getBlogs } = require('../controllers/blogs.controller');

const fakeRes = () => {
  const res = { headers: {}, statusCode: 0, body: null };
  res.set = (k, v) => ((res.headers[k] = v), res);
  res.status = (c) => ((res.statusCode = c), res);
  res.send = (b) => ((res.body = b), res);
  return res;
};

test('lists MongoDB posts newest first by their own date', async (t) => {
  t.mock.method(Blog, 'find', () => ({
    select: () => ({
      lean: async () => [
        { slug: 'old', title: 'Old', date: '2022-06-18', tags: ['jwt'], readTime: '3 min read' },
        { slug: 'new', title: 'New', date: '2026-10-14', tags: [], description: 'd' },
      ],
    }),
  }));
  process.env.SITE_BLOG_BASE_URL = 'https://grcsr.in/blogs/';
  const res = fakeRes();
  await getBlogs({}, res);
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(res.body.data.map((p) => p.slug), ['new', 'old']);
  assert.strictEqual(res.body.data[0].url, 'https://grcsr.in/blogs/new');
  assert.strictEqual(res.body.data[1].publishedAt, '2022-06-18T00:00:00.000Z');
  assert.ok(res.body.data.every((p) => p.source === 'site' && !('content' in p)));
});

test('returns 500 when the query fails', async (t) => {
  t.mock.method(Blog, 'find', () => ({ select: () => ({ lean: async () => { throw new Error('down'); } }) }));
  const res = fakeRes();
  await getBlogs({}, res);
  assert.strictEqual(res.statusCode, 500);
});
