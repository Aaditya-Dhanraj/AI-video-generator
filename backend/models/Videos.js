const mongoose = require('mongoose');

const videoSchema = new mongoose.Schema({
    videoArr: { type: String, required: true },
    userid: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

module.exports = mongoose.model('Videos', videoSchema);
