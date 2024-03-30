const axios = require('axios');
const ResponseCodes = require("../utils/response.code");

let response_code = new ResponseCodes();
let server_status = response_code.serverError().status;
let success_status = response_code.success().status;

const getBlogs = async (req,res) => {
    let response = await axios.get('https://api.rss2json.com/v1/api.json?rss_url=https://medium.com/feed/@grcsr');
    if (!response.data.items && response.data.items.length === 0){
        response_code.message = 'Something went wrong - Please try again.';
        response_code.error = error;
        return res.status(server_status).send(response_code.serverError());
    }
    response_code.message = 'messages';
    response_code.data = response.data.items;
    return res.status(success_status).send(response_code.success());
};

module.exports = {
  getBlogs,
};
