const mongoose = require('mongoose');

const BlogSchema = new mongoose.Schema(
  {
    slug:     { type: String, required: true, unique: true, trim: true },
    title:    { type: String, required: true, trim: true },
    date:     { type: String, required: true },
    readTime: { type: String, default: '5 min read' },
    image:    { type: String, default: null },
    content:  { type: String, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Blog', BlogSchema);
