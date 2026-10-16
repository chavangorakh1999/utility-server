const express = require('express');
const router = express.Router();
const {
  getBlogs,
  getBlogBySlug,
  createBlog,
  updateBlog,
  deleteBlog,
  requireKey,
} = require('../controllers/blogs.controller');

router.get('/',         getBlogs);
router.get('/:slug',    getBlogBySlug);
router.post('/',        requireKey, createBlog);
router.put('/:slug',    requireKey, updateBlog);
router.delete('/:slug', requireKey, deleteBlog);

module.exports = router;
