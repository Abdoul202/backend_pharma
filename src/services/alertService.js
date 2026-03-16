const Alert = require('../models/Alert');
const Medicine = require('../models/Medicine');
const Lot = require('../models/Lot');
const { sendAlertEmail } = require('./emailService');
const logger = require('../config/logger');

/**
 * Check and create alerts for a given medicine (stock bas + expiration).
 * Called after any stock change (sale, entry).
 */
const checkAndCreateAlerts = async (medicineId) => {
    try {
        const medicine = await Medicine.findById(medicineId);
        if (!medicine || medicine.deletedAt) return;

        const now = new Date();

        // Stock total (non-expired lots)
        const agg = await Lot.aggregate([
            { $match: { medicineId: medicine._id, actif: true, dateExpiration: { $gt: now } } },
            { $group: { _id: null, total: { $sum: '$quantite' } } },
        ]);
        const quantite = agg[0]?.total || 0;

        if (quantite <= medicine.seuilAlerte) {
            // Avoid duplicate alerts within 24h
            const existing = await Alert.findOne({
                type: 'stock_bas',
                medicineRef: medicine._id,
                createdAt: { $gte: new Date(now - 24 * 3600 * 1000) },
            });
            if (!existing) {
                const alert = await Alert.create({
                    type: 'stock_bas',
                    medicineRef: medicine._id,
                    valeur: quantite,
                    message: `Stock bas pour ${medicine.nom}: ${quantite} unité(s) restante(s) (seuil: ${medicine.seuilAlerte})`,
                });
                await sendAlertEmail(alert, medicine);
            }
        }
    } catch (err) {
        logger.error('checkAndCreateAlerts error:', err.message);
    }
};

/**
 * Check all medicines for expiring lots.
 * Called by cron job daily.
 */
const checkExpirationAlerts = async () => {
    try {
        const now = new Date();
        const in30 = new Date(now); in30.setDate(in30.getDate() + 30);

        const expiringLots = await Lot.find({
            actif: true,
            quantite: { $gt: 0 },
            dateExpiration: { $lte: in30 },
        }).populate('medicineId');

        for (const lot of expiringLots) {
            if (!lot.medicineId || lot.medicineId.deletedAt) continue;

            const daysLeft = Math.ceil((lot.dateExpiration - now) / (1000 * 3600 * 24));
            const existing = await Alert.findOne({
                type: 'expiration',
                lotRef: lot._id,
                createdAt: { $gte: new Date(now - 24 * 3600 * 1000) },
            });

            if (!existing) {
                await Alert.create({
                    type: 'expiration',
                    medicineRef: lot.medicineId._id,
                    lotRef: lot._id,
                    valeur: daysLeft,
                    message: `Lot ${lot.numeroLot} de ${lot.medicineId.nom} expire ${daysLeft <= 0 ? 'aujourd\'hui ou est périmé' : `dans ${daysLeft} jour(s)`}`,
                });
            }

            // Retrait automatique des lots expirés
            if (lot.dateExpiration <= now) {
                lot.actif = false;
                lot.retraitAutomatique = true;
                await lot.save();
                logger.info(`Lot ${lot.numeroLot} (${lot.medicineId.nom}) retiré automatiquement (périmé)`);
            }
        }
    } catch (err) {
        logger.error('checkExpirationAlerts error:', err.message);
    }
};

module.exports = { checkAndCreateAlerts, checkExpirationAlerts };
