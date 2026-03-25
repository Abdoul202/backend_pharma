const mongoose = require('mongoose');

const commandeItemSchema = new mongoose.Schema({
    medicineId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Medicine',
        required: true,
    },
    nomMedicament: {
        type: String,
        required: true,
    },
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
        maxlength: 200,
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

// Atomic reference generation using a counter
commandeSchema.statics.generateReference = async function () {
    const date = new Date();
    const ymd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
    const prefix = `CMD-${ymd}-`;

    const last = await this.findOne({ reference: { $regex: `^${prefix}` } }).sort({ reference: -1 }).select('reference').lean();
    let seq = 1;
    if (last && last.reference) {
        const parts = last.reference.split('-');
        seq = parseInt(parts[parts.length - 1], 10) + 1;
    }
    return `${prefix}${String(seq).padStart(5, '0')}`;
};

commandeSchema.index({ pharmacienRef: 1, createdAt: -1 });
commandeSchema.index({ statut: 1, createdAt: -1 });
commandeSchema.index({ reference: 1 });

module.exports = mongoose.model('Commande', commandeSchema);
