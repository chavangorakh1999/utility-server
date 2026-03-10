require('dotenv').config();
const express = require('express');
const path = require('path');
const ResponseCodes = require("./utils/response.code");
var bodyParser = require('body-parser');
var cors = require('cors')

const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
  : null;

var corsOptions = {
  origin: allowedOrigins
    ? (origin, cb) => {
        if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
        cb(new Error(`CORS: origin ${origin} not allowed`));
      }
    : '*',
  methods: ['GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
}

const app = express();
app.use(express.static(path.join(__dirname, './public')))

let response_code = new ResponseCodes();
let server_status = response_code.serverError().status;

app.use(cors(corsOptions));
app.use(bodyParser.json());

app.use('/api/blogs', require('./routes/blogs.routes'));

app.use((err, req, res, next) => {
  if (err) {
    response_code.message = 'Something went wrong - Please try again.';
    response_code.error = err;
    return res.status(server_status).send(response_code.serverError());
  }
  next();
});

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => console.log(`Listening on port ${PORT}...`));
