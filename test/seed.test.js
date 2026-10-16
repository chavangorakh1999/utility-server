const test = require('node:test');
const assert = require('node:assert');
const { loadPosts, parsePost } = require('../scripts/seed-blogs');

test('every post in content/blogs parses with required fields', () => {
  const posts = loadPosts();
  assert.ok(posts.length >= 7);
  const slugs = new Set();
  for (const p of posts) {
    assert.ok(p.title && p.description && p.tags.length, p.slug);
    assert.ok(!slugs.has(p.slug), `duplicate slug ${p.slug}`);
    slugs.add(p.slug);
    assert.match(p.readTime, /^\d+ min read$/);
    assert.ok(Date.parse(p.date) <= Date.parse('2026-10-16'), `${p.slug} is dated in the future`);
  }
});

test('posts never name an employer', () => {
  for (const p of loadPosts()) {
    assert.doesNotMatch(`${p.title} ${p.description} ${p.content}`, /aigen|digialpha|bmw|conversion pro/i, p.slug);
  }
});

test('rejects a post without front matter', () => {
  assert.throws(() => parsePost('# no meta', 'x.md'), /missing front matter/);
});
