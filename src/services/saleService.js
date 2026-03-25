const mongoose = require('mongoose');
const Sale = require('../models/Sale');
const Lot = require('../models/Lot');
const Medicine = require('../models/Medicine');
const { checkAndCreateAlerts } = require('./alertService');
const logger = require('../config/logger');

/**
 * Process a sale using FEFO (First Expired First Out) logic within a MongoDB transaction.
 * Shared between direct sales and commande encaissement.
 *
 * @param {Object} params
 * @param {Array} params.items - Array of { medicineId, quantite }
 * @param {string} params.modePaiement
 * @param {number} [params.montantRecu]
 * @param {ObjectId} params.caissierRef
 * @param {ObjectId} [params.pharmacienRef]
 * @param {string} [params.notes]
 * @returns {Object} The created sale document (populated)
 */
const processSale = async ({ items, modePaiement, montantRecu, caissierRef, pharmacienRef, notes }) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const saleItems = [];
        let total = 0;

        for (const item of items) {
            const medicine = await Medicine.findOne({ _id: item.medicineId, deletedAt: null }).session(session);
            if (!medicine) {
                throw Object.assign(new Error(`Medicament introuvable: ${item.medicineId}`), { status: 404 });
            }

            let remaining = Math.round(item.quantite);
            const lotsUtilises = [];

            // FEFO: deduct from earliest-expiring lots using atomic $inc
            const lots = await Lot.find({
                medicineId: item.medicineId,
                actif: true,
                quantite: { $gt: 0 },
                dateExpiration: { $gt: new Date() },
            }).sort({ dateExpiration: 1 }).session(session);

            for (const lot of lots) {
                if (remaining <= 0) break;
                const taken = Math.min(lot.quantite, remaining);

                // Atomic decrement with guard
                const updated = await Lot.findOneAndUpdate(
                    { _id: lot._id, quantite: { $gte: taken } },
                    { $inc: { quantite: -taken } },
                    { new: true, session }
                );

                if (!updated) {
                    throw Object.assign(
                        new Error(`Conflit de stock pour le lot ${lot.numeroLot}. Veuillez réessayer.`),
                        { status: 409 }
                    );
                }

                remaining -= taken;
                lotsUtilises.push({ lotId: lot._id, quantite: taken });
            }

            if (remaining > 0) {
                throw Object.assign(
                    new Error(`Stock insuffisant pour ${medicine.nom}. Disponible: ${item.quantite - remaining}`),
                    { status: 400 }
                );
            }

            const prixUnitaire = Math.round(medicine.prixVente);
            const sousTotal = prixUnitaire * Math.round(item.quantite);
            total += sousTotal;

            saleItems.push({
                medicineId: medicine._id,
                lotsUtilises,
                nomMedicament: medicine.nom,
                quantite: Math.round(item.quantite),
                prixUnitaire,
                sousTotal,
            });
        }

        const reference = await Sale.generateReference();

        const effectifMontantRecu = montantRecu || total;

        const [sale] = await Sale.create([{
            reference,
            items: saleItems,
            total,
            modePaiement,
            montantRecu: effectifMontantRecu,
            monnaie: effectifMontantRecu - total,
            caissierRef,
            pharmacienRef,
            notes,
        }], { session });

        await session.commitTransaction();

        // Fire-and-forget alert checks (outside transaction)
        for (const item of saleItems) {
            checkAndCreateAlerts(item.medicineId).catch(err =>
                logger.error('Alert check failed:', err.message)
            );
        }

        const populated = await Sale.findById(sale._id)
            .populate('caissierRef', 'nom')
            .populate('items.medicineId', 'nom forme dosage');

        return populated;
    } catch (err) {
        await session.abortTransaction();
        throw err;
    } finally {
        session.endSession();
    }
};

/**
 * Cancel a sale and restore stock within a transaction.
 * Restores ALL lots that were deducted (not just the first one).
 */
const cancelSale = async (saleId, userId, raison) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const sale = await Sale.findById(saleId).session(session);
        if (!sale) {
            throw Object.assign(new Error('Vente introuvable'), { status: 404 });
        }
        if (sale.statut === 'annule') {
            throw Object.assign(new Error('Cette vente est deja annulee'), { status: 400 });
        }

        // Restore stock for ALL lots used
        for (const item of sale.items) {
            if (item.lotsUtilises && item.lotsUtilises.length > 0) {
                for (const lotUsed of item.lotsUtilises) {
                    await Lot.findByIdAndUpdate(
                        lotUsed.lotId,
                        { $inc: { quantite: lotUsed.quantite } },
                        { session }
                    );
                }
            }
        }

        sale.statut = 'annule';
        sale.annulePar = userId;
        sale.annuleAt = new Date();
        sale.raisonAnnulation = raison || 'Non precise';
        await sale.save({ session });

        await session.commitTransaction();
        return sale;
    } catch (err) {
        await session.abortTransaction();
        throw err;
    } finally {
        session.endSession();
    }
};

module.exports = { processSale, cancelSale };
