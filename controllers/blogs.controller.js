const axios = require("axios");
const cheerio = require('cheerio');
const ResponseCodes = require("../utils/response.code");

let response_code = new ResponseCodes();
let server_status = response_code.serverError().status;
let success_status = response_code.success().status;

const getBlogs = async (req, res) => {
  let response = await axios.get(
    "https://api.rss2json.com/v1/api.json?rss_url=https://medium.com/feed/@grcsr"
  );
  if (!response.data.items && response.data.items.length === 0) {
    response_code.message = "Something went wrong - Please try again.";
    response_code.error = error;
    return res.status(server_status).send(response_code.serverError());
  }
  let blogItems = response?.data?.items;
  let scrappedBlogs = await Promise.all(
    blogItems.map(async (blog) => {
      const response = await axios.get(blog.link);
      const htmlContent = response.data;

      // Parse HTML content using cheerio
      const $ = cheerio.load(htmlContent);

      // Extract title, description, and image
      const title = $("title").text();
      const description = $('meta[name="description"]').attr("content");
      const image = $('meta[property="og:image"]').attr("content");

      // Return the extracted metadata
      return { title, description, image,url:blog.link };
    })
  );
  response_code.message = "Blogs fetched sucessfully";
  response_code.data = scrappedBlogs;
  return res.status(success_status).send(response_code.success());
};

module.exports = {
  getBlogs,
};
