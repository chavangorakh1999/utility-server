const Blog = require('../models/Blog.model');
const ResponseCodes = require('../utils/response.code');

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
// Posts stored in MongoDB, newest first, without the Markdown body (fetch one post
// by slug for that).

const toListItem = (b) => ({
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

const getBlogs = async (req, res) => {
  try {
    const posts = (await Blog.find().select('-content').lean())
      .map(toListItem)
      .sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));
    // Short edge cache: new posts show up within a few minutes.
    res.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
    const r = rc();
    r.message = 'Blogs fetched successfully';
    r.data = posts;
    return res.status(200).send(r.success());
  } catch (error) {
    const r = rc();
    r.message = 'Something went wrong';
    r.error = error;
    return res.status(500).send(r.serverError());
  }
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
