const cheerio = require('cheerio');
const Parser = require('rss-parser');
const ResponseCodes = require("../utils/response.code");

const parser = new Parser({ customFields: { item: ['content:encoded'] } });
let response_code = new ResponseCodes();
let server_status = response_code.serverError().status;
let success_status = response_code.success().status;

const getBlogs = async (req, res) => {
  try {
    const feed = await parser.parseURL("https://medium.com/feed/@grcsr");

    if (!feed.items || feed.items.length === 0) {
      response_code.message = "No blogs found.";
      return res.status(server_status).send(response_code.serverError());
    }

    const blogs = feed.items.map((blog) => {
      const $ = cheerio.load(blog['content:encoded'] || '');
      const image = $('img').first().attr('src') || null;
      const description = blog['content:encodedSnippet']?.split('\n').find(l => l.trim().length > 40) || null;

      return { title: blog.title, description, image, url: blog.link };
    });

    response_code.message = "Blogs fetched successfully";
    response_code.data = blogs;
    return res.status(success_status).send(response_code.success());
  } catch (error) {
    response_code.message = "Something went wrong - Please try again.";
    response_code.error = error;
    return res.status(server_status).send(response_code.serverError());
  }
};

module.exports = {
  getBlogs,
};
