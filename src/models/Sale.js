const mongoose = require('mongoose');

const saleItemSchema = new mongoose.Schema({
    medicineId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Medicine',
        required: true,
    },
    lotId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Lot',
    },
    nomMedicament: String, // snapshot at time of sale
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

// Auto-generate reference before save
saleSchema.pre('save', async function (next) {
    if (!this.reference) {
        const count = await this.constructor.countDocuments();
        const date = new Date();
        const ymd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
        this.reference = `VTE-${ymd}-${String(count + 1).padStart(5, '0')}`;
    }
    next();
});

// Index for reporting
saleSchema.index({ createdAt: -1 });
saleSchema.index({ caissierRef: 1, createdAt: -1 });
saleSchema.index({ statut: 1 });

module.exports = mongoose.model('Sale', saleSchema);
