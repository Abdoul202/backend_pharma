const mongoose = require('mongoose');

const lotDeductionSchema = new mongoose.Schema({
    lotId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Lot',
        required: true,
    },
    quantite: {
        type: Number,
        required: true,
        min: 1,
    },
}, { _id: false });

const saleItemSchema = new mongoose.Schema({
    medicineId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Medicine',
        required: true,
    },
    lotsUtilises: [lotDeductionSchema],
    nomMedicament: {
        type: String,
        required: true,
    },
    quantite: {
        type: Number,
        required: true,
        min: 1,
    },
    prixUnitaire: {
        type: Number,
        required: true,
        min: 0,
    },
    sousTotal: {
        type: Number,
        required: true,
        min: 0,
    },
}, { _id: true });

const saleSchema = new mongoose.Schema({
    reference: {
        type: String,
        unique: true,
    },
    items: [saleItemSchema],
    total: {
        type: Number,
        required: true,
        min: 0,
    },
    modePaiement: {
        type: String,
        enum: ['especes', 'mobile_money', 'carte', 'autre'],
        default: 'especes',
    },
    montantRecu: {
        type: Number,
        min: 0,
    },
    monnaie: {
        type: Number,
        default: 0,
    },
    caissierRef: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    pharmacienRef: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    statut: {
        type: String,
        enum: ['valide', 'annule'],
        default: 'valide',
    },
    annulePar: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    annuleAt: Date,
    raisonAnnulation: String,
    notes: String,
}, { timestamps: true });

// Atomic reference generation using a counter
saleSchema.statics.generateReference = async function () {
    const date = new Date();
    const ymd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
    const prefix = `VTE-${ymd}-`;

    const last = await this.findOne({ reference: { $regex: `^${prefix}` } }).sort({ reference: -1 }).select('reference').lean();
    let seq = 1;
    if (last && last.reference) {
        const parts = last.reference.split('-');
        seq = parseInt(parts[parts.length - 1], 10) + 1;
    }
    return `${prefix}${String(seq).padStart(5, '0')}`;
};

// Index for reporting
saleSchema.index({ createdAt: -1 });
saleSchema.index({ caissierRef: 1, createdAt: -1 });
saleSchema.index({ statut: 1 });
saleSchema.index({ reference: 1 });

module.exports = mongoose.model('Sale', saleSchema);
