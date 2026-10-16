const mongoose = require('mongoose');
const Blog = require('../models/Blog.model');
const ResponseCodes = require('../utils/response.code');
const { getMediumPosts } = require('../services/medium');

const rc = () => new ResponseCodes();

// ─── Auth middleware ──────────────────────────────────────────────────────────
// Write operations require X-Api-Key header matching BLOG_WRITE_KEY env var.

const requireKey = (req, res, next) => {
  const key = process.env.BLOG_WRITE_KEY;
  if (!key) return next(); // no key configured → open (dev mode)
  if (req.headers['x-api-key'] !== key) {
    const r = rc();
    r.message = 'Unauthorized';
    return res.status(401).send(r.unauthorized());
  }
  next();
};

// ─── GET /api/blogs ───────────────────────────────────────────────────────────
// Medium posts (from RSS), plus any posts stored in MongoDB when a database is
// configured. Either source failing doesn't take the other down.

const toSitePost = (b) => ({
  title: b.title,
  url: process.env.SITE_BLOG_BASE_URL ? `${process.env.SITE_BLOG_BASE_URL.replace(/\/$/, '')}/${b.slug}` : null,
  slug: b.slug,
  image: b.image || null,
  description: b.description || null,
  // `date` is the post's own publish date; createdAt is just when it was stored.
  publishedAt: !Number.isNaN(Date.parse(b.date)) ? new Date(b.date).toISOString() : b.createdAt ? new Date(b.createdAt).toISOString() : null,
  readTime: b.readTime,
  tags: b.tags || [],
  source: 'site',
});

const getBlogs = async (req, res, { connectDB } = {}) => {
  const [medium, site] = await Promise.allSettled([
    getMediumPosts(),
    (async () => {
      if (!process.env.MONGODB_URI) return [];
      if (connectDB) await connectDB();
      if (mongoose.connection.readyState !== 1) return [];
      return (await Blog.find().select('-content').lean()).map(toSitePost);
    })(),
  ]);

  const posts = [
    ...(medium.status === 'fulfilled' ? medium.value : []),
    ...(site.status === 'fulfilled' ? site.value : []),
  ].sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));

  if (medium.status === 'rejected') console.error(medium.reason?.message);
  if (site.status === 'rejected') console.error('MongoDB blogs:', site.reason?.message);

  if (posts.length === 0 && medium.status === 'rejected') {
    const r = rc();
    r.message = 'Could not load blogs right now';
    r.error = { medium: medium.reason?.message };
    return res.status(502).send(r.serverError());
  }

  // Let Vercel's edge cache the list; Medium only changes when a post is published.
  res.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  const r = rc();
  r.message = 'Blogs fetched successfully';
  r.data = posts;
  return res.status(200).send(r.success());
};

// ─── GET /api/blogs/:slug ─────────────────────────────────────────────────────

const getBlogBySlug = async (req, res) => {

  try {
    const blog = await Blog.findOne({ slug: req.params.slug }).lean();
    if (!blog) {
      const r = rc();
      r.message = 'Blog not found';
      return res.status(404).send(r.dataNotFound());
    }
    const r = rc();
    r.message = 'Blog fetched successfully';
    r.data = blog;
    return res.status(200).send(r.success());
  } catch (error) {
    const r = rc();
    r.message = 'Something went wrong';
    r.error = error;
    return res.status(500).send(r.serverError());
  }
};

// ─── POST /api/blogs ──────────────────────────────────────────────────────────

const createBlog = async (req, res) => {

  try {
    const { slug, title, date, readTime, image, content, description, tags } = req.body;
    if (!slug || !title || !content || !date) {
      const r = rc();
      r.message = 'slug, title, date and content are required';
      return res.status(400).send(r.badRequest());
    }

    const existing = await Blog.findOne({ slug });
    if (existing) {
      const r = rc();
      r.message = `A blog with slug "${slug}" already exists`;
      return res.status(400).send(r.badRequest());
    }

    const blog = await Blog.create({ slug, title, date, readTime, image: image || null, content, description, tags });
    const r = rc();
    r.message = 'Blog created successfully';
    r.data = blog;
    return res.status(201).send(r.success());
  } catch (error) {
    const r = rc();
    r.message = 'Something went wrong';
    r.error = error;
    return res.status(500).send(r.serverError());
  }
};

// ─── PUT /api/blogs/:slug ─────────────────────────────────────────────────────

const updateBlog = async (req, res) => {

  try {
    const { title, date, readTime, image, content, description, tags } = req.body;
    const blog = await Blog.findOneAndUpdate(
      { slug: req.params.slug },
      { title, date, readTime, image: image || null, content, description, tags },
      { new: true, runValidators: true }
    ).lean();

    if (!blog) {
      const r = rc();
      r.message = 'Blog not found';
      return res.status(404).send(r.dataNotFound());
    }

    const r = rc();
    r.message = 'Blog updated successfully';
    r.data = blog;
    return res.status(200).send(r.success());
  } catch (error) {
    const r = rc();
    r.message = 'Something went wrong';
    r.error = error;
    return res.status(500).send(r.serverError());
  }
};

// ─── DELETE /api/blogs/:slug ──────────────────────────────────────────────────

const deleteBlog = async (req, res) => {

  try {
    const blog = await Blog.findOneAndDelete({ slug: req.params.slug });
    if (!blog) {
      const r = rc();
      r.message = 'Blog not found';
      return res.status(404).send(r.dataNotFound());
    }
    const r = rc();
    r.message = 'Blog deleted successfully';
    r.data = {};
    return res.status(200).send(r.success());
  } catch (error) {
    const r = rc();
    r.message = 'Something went wrong';
    r.error = error;
    return res.status(500).send(r.serverError());
  }
};

module.exports = { getBlogs, getBlogBySlug, createBlog, updateBlog, deleteBlog, requireKey };
