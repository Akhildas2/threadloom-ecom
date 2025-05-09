const Offer = require('../models/offerModel')



//for add offer page loading
const addOffer = async (req, res, next) => {
    try {
        res.render('addOffer')

    } catch (error) {
        next(error);
    }
}



// for insert offer
const insertOffer = async (req, res, next) => {
    try {
        const { startingDate, endingDate, discount } = req.body;
        let { offerName } = req.body;
        offerName = offerName.trim();

        // Check if starting date is greater than or equal to today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (new Date(startingDate) < today) {
            return res.status(400).json({ success: false, message: 'Starting date must be greater than or equal to today' });
        }
        // Check if ending date is greater than or equal to today
        if (new Date(endingDate) < today) {
            return res.status(400).json({ success: false, message: 'Ending date must be greater than or equal to today' });
        }
        // Check if starting date is less than or equal to ending date
        if (new Date(startingDate) > new Date(endingDate)) {
            return res.status(400).json({ success: false, message: 'Starting date must be less than or equal to ending date' });
        }

        // ending date to midnight (23:59:59)
        var dateMidnight = new Date(endingDate);
        dateMidnight.setUTCHours(23, 59, 59);
        // Check if offer name already exists
        const existingOffer = await Offer.findOne({ offerName: { $regex: new RegExp(offerName, 'i') } });
        if (existingOffer) {
            return res.status(400).json({ success: false, message: 'Offer name already exists' });
        }

        // Create new offer
        const newOffer = new Offer({
            offerName,
            startingDate,
            endingDate: dateMidnight,
            discount
        });
        // Save the offer
        await newOffer.save();

        return res.status(200).json({ success: true, url: '/admin/offer/listOffer' });

    } catch (error) {
        next(error);
    }
};



//for listing offers
const listOffer = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 5;
        const skip = (page - 1) * limit;
        let { sort = 'createdAt', order = 'desc' } = req.query;
        const sortOrder = order === 'asc' ? 1 : -1;

        let query = {};
        const orderStatus = req.query.status || '';
        const search = req.query.search ? req.query.search.trim() : "";

        // Search across multiple fields
        if (search) {
            query.$or = [
                { offerName: { $regex: search, $options: "i" } },
            ];
        }

        // Filter by expiry date
        const currentDate = new Date();

        if (orderStatus === 'true') {
            query.endingDate = { $gte: currentDate };
        } else if (orderStatus === 'false') {
            query.endingDate = { $lt: currentDate };
        }

        // Sort options
        const sortOptions = {
            'offerName': { offerName: sortOrder },
            'startingDate': { startingDate: sortOrder },
            'endingDate': { endingDate: sortOrder },
            'discount': { discount: sortOrder },
            'createdAt': { createdAt: -1 }
        };


        const offersCount = await Offer.countDocuments(query);
        const totalPages = Math.ceil(offersCount / limit);
        const offers = await Offer.find(query).sort(sortOptions[sort] || sortOptions['createdAt']).skip(skip).limit(limit);

        res.render("listOffer", { offers, currentPage: page, totalPages, selectedLimit: limit, sortField: sort, sortOrder: order, search, orderStatus, offersCount })

    } catch (error) {
        next(error);
    }
}



//for delete offer 
const deleteOffer = async (req, res, next) => {
    try {
        const { offerId } = req.params;
        const result = await Offer.deleteOne({ _id: offerId })
        if (result.deletedCount === 1) {
            return res.status(200).json({ success: true });
        } else {
            return res.status(404).json({ success: false, message: 'Offer not found.' });
        }

    } catch (error) {
        next(error);
    }
}



//for edit offer
const editOffer = async (req, res, next) => {
    try {
        const { offerId } = req.params;
        const { startingDate, endingDate, discount } = req.body;
        let { offerName } = req.body
        offerName = offerName.trim();

        // Check if an offer with the same name already exists, excluding the current offer
        const existingOffer = await Offer.findOne({
            $and: [
                { _id: { $ne: offerId } },
                { offerName: { $regex: new RegExp('^' + offerName + '$', 'i') } }
            ]
        });
        if (existingOffer) {
            return res.status(400).json({ success: false, message: 'An offer with the same name already exists.' });
        }

        // Check if starting date is greater than or equal to today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (new Date(startingDate) < today) {
            return res.status(400).json({ success: false, message: 'Starting date must be greater than or equal to today.' });
        }
        // Check if ending date is greater than or equal to starting date
        if (new Date(endingDate) < new Date(startingDate)) {
            return res.status(400).json({ success: false, message: 'Ending date must be greater than or equal to starting date.' });
        }

        // ending date to midnight (23:59:59)
        var dateMidnight = new Date(endingDate);
        dateMidnight.setUTCHours(23, 59, 59);
        const offer = await Offer.findById(offerId);
        if (!offer) {
            return res.status(404).json({ success: false, message: 'Offer not found.' });
        }

        // Update offer details
        offer.offerName = offerName;
        offer.startingDate = startingDate;
        offer.endingDate = dateMidnight;
        offer.discount = discount;

        // Save updated offer
        await offer.save();
        return res.status(200).json({ success: true, message: 'Offer updated successfully.' });

    } catch (error) {
        next(error);
    }
};



module.exports = {
    addOffer,
    insertOffer,
    listOffer,
    deleteOffer,
    editOffer
}