const mongoose = require('mongoose');

const lotSchema = new mongoose.Schema({
    medicineId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Medicine',
        required: true,
    },
    numeroLot: {
        type: String,
        required: [true, 'Le numéro de lot est requis'],
        trim: true,
    },
    quantite: {
        type: Number,
        required: true,
        min: 0,
    },
    dateExpiration: {
        type: Date,
        required: [true, 'La date d\'expiration est requise'],
    },
    dateEntree: {
        type: Date,
        default: Date.now,
    },
    fournisseur: {
        type: String,
        trim: true,
    },
    prixAchatLot: {
        type: Number,
        min: 0,
    },
    actif: {
        type: Boolean,
        default: true,
    },
    retraitAutomatique: {
        type: Boolean,
        default: false, // true if removed because expired
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
}, { timestamps: true });

// Index for quick expiration queries
lotSchema.index({ dateExpiration: 1 });
lotSchema.index({ medicineId: 1, actif: 1 });

module.exports = mongoose.model('Lot', lotSchema);
