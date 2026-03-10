const express = require('express');
const router = express.Router();
const { getBlogs } = require('../controllers/blogs.controller');

router.get('/', getBlogs);

module.exports = router;
