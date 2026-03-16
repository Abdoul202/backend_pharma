const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
    utilisateurRef: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    action: {
        type: String,
        required: true,
        // e.g. 'CONNEXION', 'VENTE', 'AJOUT_STOCK', 'MODIF_MEDICAMENT', 'ANNULATION_VENTE', etc.
    },
    entite: {
        type: String, // 'Sale', 'Medicine', 'Lot', 'User', ...
    },
    entiteId: {
        type: mongoose.Schema.Types.ObjectId,
    },
    details: {
        type: mongoose.Schema.Types.Mixed, // any extra context
    },
    ip: {
        type: String,
    },
}, { timestamps: true });

activityLogSchema.index({ utilisateurRef: 1, createdAt: -1 });
activityLogSchema.index({ action: 1 });
activityLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('ActivityLog', activityLogSchema);
