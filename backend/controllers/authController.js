const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Videos = require('../models/Videos');

exports.signup = async (req, res) => {
    const { username, password } = req.body;

    try {
        const existingUser = await User.findOne({ username }) || null;
        if (existingUser) {
            return res.status(409).json({ message: "User already exists", success: false });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ username, password: hashedPassword });

        // const defaultObj = { id: Date.now(), name: 'Root', isFolder: true, items: [] };
        const defaultObj = [];

        const newTree = new Videos({ videoArr: JSON.stringify(defaultObj), userid: newUser._id });
        await newTree.save();

        await newUser.save();
        res.status(201).json({ message: "Signup Successful", success: true });
    } catch (error) {
        res.status(500).json({ message: error.message, success: false });
    }
};

exports.login = async (req, res) => {
    const { username, password } = req.body;
    const errMsg = 'Username or Password is wrong!';
    try {
        const user = await User.findOne({ username });
        if (!user) return res.status(403).json({ message: errMsg, success: false });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: errMsg, success: false });

        const token = jwt.sign({ id: user._id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '24h' });

        res.json({ token, username, success: true, message: 'Login Successful' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
