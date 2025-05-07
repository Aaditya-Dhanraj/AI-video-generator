const express = require('express');
const multer = require('multer');
const { uploadFile, deleteFile, getFileUrl } = require('../controllers/fileController');
const router = express.Router();

const {ensureAuthenticated} = require('../middleware/authMiddleware');

const storage = multer.memoryStorage();
const upload = multer({ storage });

// Upload file
router.post('/upload', ensureAuthenticated, upload.single('file'), uploadFile);

// Get Download Url
router.get('/:key', ensureAuthenticated, getFileUrl);

// Delete file
router.delete('/:key', ensureAuthenticated, deleteFile);

module.exports = router;
