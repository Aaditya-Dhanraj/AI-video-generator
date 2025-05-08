const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const authRoutes = require('./routes/authRoutes');
const fileRoutes = require('./routes/fileRoutes');
const fileTreeRoutes = require('./routes/fileTreeRoutes');
const videoRoutes = require('./routes/videoRoutes');
const bodyParser = require('body-parser');

dotenv.config();
const app = express();

// Create HTTP server
const server = require('http').createServer(app);

// Set timeout to 5 minutes (300000 ms)
server.timeout = 300000;

const corsOptions = {
    origin: ['*'], // Allow all origins - for development only! For production, specify your frontend URL
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: false, // Allow cookies to be sent with requests
    preflightContinue: false,
    optionsSuccessStatus: 204
  };

app.use(bodyParser.json());
app.use(cors(corsOptions));
app.use(express.json());

app.options('*', cors(corsOptions));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/update', fileTreeRoutes);
app.use('/api/videos', videoRoutes);

mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.log(err));

// Use the server we created instead of app.listen
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});