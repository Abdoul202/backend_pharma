const mongoose = require('mongoose');

const medicineSchema = new mongoose.Schema({
    nom: {
        type: String,
        required: [true, 'Le nom du médicament est requis'],
        trim: true,
        maxlength: 200,
    },
    dci: {
        type: String, // Dénomination Commune Internationale
        trim: true,
    },
    forme: {
        type: String,
        enum: ['comprimé', 'gélule', 'sirop', 'injectable', 'pommade', 'suppositoire', 'sachet', 'gouttes', 'autre'],
        required: true,
    },
    dosage: {
        type: String, // ex: "500mg", "5mg/ml"
        trim: true,
    },
    categorie: {
        type: String,
        trim: true,
    },
    prixVente: {
        type: Number,
        required: [true, 'Le prix de vente est requis'],
        min: 0,
    },
    prixAchat: {
        type: Number,
        min: 0,
    },
    seuilAlerte: {
        type: Number,
        default: 10,
        min: 0,
    },
    unite: {
        type: String,
        default: 'boîte',
    },
    codeBarres: {
        type: String,
        trim: true,
        sparse: true,
        unique: true,
    },
    description: {
        type: String,
        maxlength: 1000,
    },
    fabricant: {
        type: String,
        trim: true,
    },
    // Soft delete
    deletedAt: {
        type: Date,
        default: null,
    },
    deletedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
}, { timestamps: true });

// Virtual: stock total (somme des lots actifs non expirés)
medicineSchema.virtual('stockTotal', {
    ref: 'Lot',
    localField: '_id',
    foreignField: 'medicineId',
});

// Scope: only non-deleted
medicineSchema.index({ deletedAt: 1 });
medicineSchema.index({ nom: 'text', dci: 'text', categorie: 'text' });

module.exports = mongoose.model('Medicine', medicineSchema);
