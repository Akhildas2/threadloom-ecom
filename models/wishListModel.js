const mongoose = require('mongoose');



const wishListSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'User'
    },
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});



const WishList = mongoose.model('WishList', wishListSchema);
module.exports = WishList;