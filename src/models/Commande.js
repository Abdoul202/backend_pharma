const mongoose = require('mongoose');

const commandeItemSchema = new mongoose.Schema({
    medicineId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Medicine',
        required: true,
    },
    nomMedicament: String,
    forme: String,
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
}, { _id: true });

const commandeSchema = new mongoose.Schema({
    reference: {
        type: String,
        unique: true,
    },
    pharmacienRef: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    patientNom: {
        type: String,
        trim: true,
    },
    notes: {
        type: String,
        maxlength: 2000,
    },
    items: [commandeItemSchema],
    total: {
        type: Number,
        required: true,
        min: 0,
    },
    statut: {
        type: String,
        enum: ['brouillon', 'envoye', 'encaisse', 'annule'],
        default: 'brouillon',
    },
    saleRef: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Sale',
    },
    encaissePar: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    encaisseAt: Date,
    annulePar: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    annuleAt: Date,
}, { timestamps: true });

// Auto-generate reference before save
commandeSchema.pre('save', async function (next) {
    if (!this.reference) {
        const count = await this.constructor.countDocuments();
        const date = new Date();
        const ymd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
        this.reference = `CMD-${ymd}-${String(count + 1).padStart(5, '0')}`;
    }
    next();
});

commandeSchema.index({ pharmacienRef: 1, createdAt: -1 });
commandeSchema.index({ statut: 1, createdAt: -1 });

module.exports = mongoose.model('Commande', commandeSchema);
