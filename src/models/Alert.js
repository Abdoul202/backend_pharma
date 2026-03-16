const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['stock_bas', 'expiration'],
        required: true,
    },
    medicineRef: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Medicine',
        required: true,
    },
    lotRef: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Lot',
    },
    valeur: {
        type: Number, // quantity for stock_bas, days remaining for expiration
    },
    message: String,
    lu: {
        type: Boolean,
        default: false,
    },
    emailEnvoye: {
        type: Boolean,
        default: false,
    },
}, { timestamps: true });

alertSchema.index({ lu: 1, createdAt: -1 });
alertSchema.index({ type: 1, medicineRef: 1 });

module.exports = mongoose.model('Alert', alertSchema);
