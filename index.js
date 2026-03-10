require('dotenv').config();
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const ResponseCodes = require("./utils/response.code");
var bodyParser = require('body-parser');
var cors = require('cors')

// Allowed origins: comma-separated list in CORS_ORIGINS env var.
// Falls back to '*' if not set (useful in local dev).
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
  : null;

var corsOptions = {
  origin: allowedOrigins
    ? (origin, cb) => {
        // Allow server-to-server requests (no Origin header) and listed origins
        if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
        cb(new Error(`CORS: origin ${origin} not allowed`));
      }
    : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-Api-Key'],
}

const app = express();
app.use(express.static(path.join(__dirname, './public')))

let response_code = new ResponseCodes();
let server_status = response_code.serverError().status;

/* The code snippet `app.use(cors(corsOptions)); app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ limit: "50mb", extended: true, parameterLimit: 50000 }));` in your
Express application is setting up middleware functions to handle CORS (Cross-Origin Resource
Sharing) and parse incoming request bodies. */
app.use(cors(corsOptions));
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ limit: "50mb", extended: true, parameterLimit: 50000 }));

// MongoDB — cached connection promise so warm Vercel invocations reuse the socket
let _dbPromise = null;
const connectDB = () => {
  if (mongoose.connection.readyState === 1) return Promise.resolve();
  if (_dbPromise) return _dbPromise;
  if (!process.env.MONGODB_URI) return Promise.reject(new Error('MONGODB_URI not set'));
  _dbPromise = mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 })
    .then(() => { console.log('MongoDB connected'); })
    .catch((err) => { _dbPromise = null; throw err; });
  return _dbPromise;
};

// Middleware: ensure DB is ready before blog routes; fail fast on error
const ensureDB = async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    const r = new ResponseCodes();
    r.message = 'Database unavailable — ' + err.message;
    return res.status(503).send(r.serverUnavailable());
  }
};

app.use('/api/blogs', ensureDB, require('./routes/blogs.routes'));


/* This piece of code is a middleware function in Express that handles errors. When an error occurs in
any of the previous middleware functions or route handlers, it will be passed to this error handling
middleware. */
app.use((err, req, res, next) => {
  if (err) {
    response_code.message = 'Something went wrong - Please try again.';
    response_code.error = err;
    return res.status(server_status).send(response_code.serverError());
  }
  next();
});

/* This piece of code is setting up the port for the Express server to listen on. */
const PORT = process.env.PORT ?? 3000;
app.listen(process.env.PORT ?? 3000, () => console.log(`Listening on port ${PORT}...`));