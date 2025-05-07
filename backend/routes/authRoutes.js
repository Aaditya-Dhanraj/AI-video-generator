const express = require('express');
const { signup, login } = require('../controllers/authController');
const router = express.Router();

const {signupAndLoginValidation} = require('../middleware/authMiddleware');

router.post('/signup', signupAndLoginValidation, signup);
router.post('/login', signupAndLoginValidation, login);

module.exports = router;
