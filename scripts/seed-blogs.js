// Loads the Markdown posts in content/blogs/ into MongoDB (upsert by slug), so the
// site's own posts show up in GET /api/blogs alongside Medium.
//
//   MONGODB_URI="mongodb+srv://..." npm run seed:blogs           # write
//   npm run seed:blogs -- --dry-run                              # just parse and list

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'content', 'blogs');
// Code takes longer to read than prose, so count it in at a slower average pace.
const WORDS_PER_MINUTE = 200;

// Minimal front matter: "key: value" lines between --- fences; tags are comma-separated.
function parsePost(source, file) {
  const m = source.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`${file}: missing front matter`);
  const meta = Object.fromEntries(
    m[1].split('\n').filter(Boolean).map((line) => {
      const i = line.indexOf(':');
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
    })
  );
  for (const key of ['slug', 'title', 'date']) if (!meta[key]) throw new Error(`${file}: "${key}" is required`);
  if (Number.isNaN(Date.parse(meta.date))) throw new Error(`${file}: bad date "${meta.date}"`);
  const content = m[2].trim();
  const words = content.split(/\s+/).filter(Boolean).length;
  return {
    slug: meta.slug,
    title: meta.title,
    date: meta.date,
    description: meta.description || null,
    tags: meta.tags ? meta.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
    image: meta.image || null,
    readTime: `${Math.max(1, Math.round(words / WORDS_PER_MINUTE))} min read`,
    content,
  };
}

const loadPosts = (dir = DIR) =>
  fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort()
    .map((f) => parsePost(fs.readFileSync(path.join(dir, f), 'utf8'), f));

async function main() {
  const posts = loadPosts();
  for (const p of posts) console.log(`${p.date}  ${p.readTime.padEnd(11)}  ${p.slug}`);
  if (process.argv.includes('--dry-run')) return;
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');

  const mongoose = require('mongoose');
  const Blog = require('../models/Blog.model');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  for (const p of posts) {
    await Blog.updateOne({ slug: p.slug }, { $set: p }, { upsert: true, runValidators: true });
  }
  console.log(`Upserted ${posts.length} posts.`);
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = { parsePost, loadPosts };
