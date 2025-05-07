const express = require('express');
const { createVideo } = require('../controllers/videoController');
const router = express.Router();

const {ensureAuthenticated} = require('../middleware/authMiddleware');

// Get folder structure
router.post('/', ensureAuthenticated, createVideo);

module.exports = router;
