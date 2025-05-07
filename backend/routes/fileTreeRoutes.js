const express = require('express');
const { deleteVideo, getVideos } = require('../controllers/fileTreeController');
const router = express.Router();

const {ensureAuthenticated} = require('../middleware/authMiddleware');

// Update File Tree
router.post('/', ensureAuthenticated, deleteVideo);

// Get folder structure
router.get('/', ensureAuthenticated, getVideos);

module.exports = router;
