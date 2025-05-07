const jwt = require('jsonwebtoken');
const User = require('../models/User');
const joi = require('joi');

const signupAndLoginValidation = (req, res, next) => {
    const schema = joi.object({
        username: joi.string().min(4).max(30).required(),
        password: joi.string().min(4).max(100).required(),
    });

    const {error} = schema.validate(req.body);

    if (error) {
        return res.status(400).json({
            success: false,
            message: 'Bad request',
            error
        });
    }

    next();
};

const ensureAuthenticated = async (req, res, next) => {
    const token = req.header('Authorization');

    if (!token) {
        return res.status(403).json({ success: false, message: 'No token provided' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        res.status(403).json({ success: false, message: 'Invalid or expired token' });
    }
};

module.exports = { ensureAuthenticated, signupAndLoginValidation };
