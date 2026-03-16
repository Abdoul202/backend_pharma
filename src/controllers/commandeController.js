const Commande = require('../models/Commande');
const Medicine = require('../models/Medicine');
const Lot = require('../models/Lot');
const Sale = require('../models/Sale');
const { logActivity } = require('../middleware/activityLogger');
const { checkAndCreateAlerts } = require('../services/alertService');

// POST /commandes — Créer une commande (brouillon)
exports.create = async (req, res, next) => {
    try {
        const { patientNom, notes, items } = req.body;

        if (!items || items.length === 0) {
            return res.status(400).json({ success: false, message: 'La commande doit contenir au moins un article' });
        }

        const commandeItems = [];
        let total = 0;

        for (const item of items) {
            const medicine = await Medicine.findOne({ _id: item.medicineId, deletedAt: null });
            if (!medicine) {
                return res.status(404).json({ success: false, message: `Médicament introuvable: ${item.medicineId}` });
            }

            const prixUnitaire = medicine.prixVente;
            const quantite = parseInt(item.quantite);
            const sousTotal = prixUnitaire * quantite;
            total += sousTotal;

            commandeItems.push({
                medicineId: medicine._id,
                nomMedicament: medicine.nom,
                forme: medicine.forme,
                quantite,
                prixUnitaire,
            });
        }

        const commande = await Commande.create({
            pharmacienRef: req.user._id,
            patientNom,
            notes,
            items: commandeItems,
            total,
            statut: 'brouillon',
        });

        await logActivity(req, 'CREATION_COMMANDE', 'Commande', commande._id, { reference: commande.reference, total });

        const populated = await Commande.findById(commande._id)
            .populate('pharmacienRef', 'nom');

        res.status(201).json({ success: true, data: populated, message: 'Commande créée' });
    } catch (err) { next(err); }
};

// GET /commandes — Liste des commandes
exports.getAll = async (req, res, next) => {
    try {
        const { statut, page = 1, limit = 20 } = req.query;

        const filter = {};
        // Pharmacien sees only their own, caissier sees only 'envoye' and 'encaisse'
        if (req.user.role === 'pharmacien') {
            filter.pharmacienRef = req.user._id;
        } else if (req.user.role === 'caissier') {
            filter.statut = statut || { $in: ['envoye', 'encaisse'] };
        }
        // Admin sees everything
        if (statut && req.user.role !== 'caissier') {
            filter.statut = statut;
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [commandes, total] = await Promise.all([
            Commande.find(filter)
                .populate('pharmacienRef', 'nom')
                .populate('items.medicineId', 'nom forme dosage')
                .skip(skip)
                .limit(parseInt(limit))
                .sort({ createdAt: -1 }),
            Commande.countDocuments(filter),
        ]);

        res.json({
            success: true,
            data: commandes,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit)),
            },
        });
    } catch (err) { next(err); }
};

// GET /commandes/:id
exports.getOne = async (req, res, next) => {
    try {
        const commande = await Commande.findById(req.params.id)
            .populate('pharmacienRef', 'nom email')
            .populate('items.medicineId', 'nom forme dosage prixVente')
            .populate('encaissePar', 'nom')
            .populate('saleRef');
        if (!commande) return res.status(404).json({ success: false, message: 'Commande introuvable' });
        res.json({ success: true, data: commande });
    } catch (err) { next(err); }
};

// PATCH /commandes/:id — Modifier (brouillon uniquement)
exports.update = async (req, res, next) => {
    try {
        const commande = await Commande.findById(req.params.id);
        if (!commande) return res.status(404).json({ success: false, message: 'Commande introuvable' });
        if (commande.statut !== 'brouillon') {
            return res.status(400).json({ success: false, message: 'Seules les commandes en brouillon peuvent être modifiées' });
        }

        const { patientNom, notes, items } = req.body;
        if (patientNom !== undefined) commande.patientNom = patientNom;
        if (notes !== undefined) commande.notes = notes;

        if (items && items.length > 0) {
            const commandeItems = [];
            let total = 0;
            for (const item of items) {
                const medicine = await Medicine.findOne({ _id: item.medicineId, deletedAt: null });
                if (!medicine) {
                    return res.status(404).json({ success: false, message: `Médicament introuvable: ${item.medicineId}` });
                }
                const quantite = parseInt(item.quantite);
                const sousTotal = medicine.prixVente * quantite;
                total += sousTotal;
                commandeItems.push({
                    medicineId: medicine._id,
                    nomMedicament: medicine.nom,
                    forme: medicine.forme,
                    quantite,
                    prixUnitaire: medicine.prixVente,
                });
            }
            commande.items = commandeItems;
            commande.total = total;
        }

        await commande.save();
        res.json({ success: true, data: commande, message: 'Commande mise à jour' });
    } catch (err) { next(err); }
};

// PATCH /commandes/:id/envoyer — Envoyer au caissier
exports.send = async (req, res, next) => {
    try {
        const commande = await Commande.findById(req.params.id);
        if (!commande) return res.status(404).json({ success: false, message: 'Commande introuvable' });
        if (commande.statut !== 'brouillon') {
            return res.status(400).json({ success: false, message: 'Seules les commandes en brouillon peuvent être envoyées' });
        }

        commande.statut = 'envoye';
        await commande.save();

        await logActivity(req, 'ENVOI_COMMANDE', 'Commande', commande._id, { reference: commande.reference });

        res.json({ success: true, data: commande, message: 'Commande envoyée au caissier' });
    } catch (err) { next(err); }
};

// PATCH /commandes/:id/annuler
exports.cancel = async (req, res, next) => {
    try {
        const commande = await Commande.findById(req.params.id);
        if (!commande) return res.status(404).json({ success: false, message: 'Commande introuvable' });
        if (['encaisse', 'annule'].includes(commande.statut)) {
            return res.status(400).json({ success: false, message: 'Cette commande ne peut plus être annulée' });
        }

        commande.statut = 'annule';
        commande.annulePar = req.user._id;
        commande.annuleAt = new Date();
        await commande.save();

        await logActivity(req, 'ANNULATION_COMMANDE', 'Commande', commande._id, { reference: commande.reference });

        res.json({ success: true, data: commande, message: 'Commande annulée' });
    } catch (err) { next(err); }
};

// POST /commandes/:id/encaisser — Encaisser (crée une vente)
exports.encaisser = async (req, res, next) => {
    try {
        const commande = await Commande.findById(req.params.id);
        if (!commande) return res.status(404).json({ success: false, message: 'Commande introuvable' });
        if (commande.statut !== 'envoye') {
            return res.status(400).json({ success: false, message: 'Seules les commandes envoyées peuvent être encaissées' });
        }

        const { modePaiement = 'especes', montantRecu } = req.body;

        // Create a sale using FEFO logic (same as saleController)
        const saleItems = [];
        let saleTotal = 0;

        for (const item of commande.items) {
            const medicine = await Medicine.findOne({ _id: item.medicineId, deletedAt: null });
            if (!medicine) {
                return res.status(404).json({ success: false, message: `Médicament introuvable: ${item.nomMedicament}` });
            }

            // FEFO: First Expired First Out
            let remaining = item.quantite;
            const usedLots = [];

            const lots = await Lot.find({
                medicineId: item.medicineId,
                actif: true,
                quantite: { $gt: 0 },
                dateExpiration: { $gt: new Date() },
            }).sort({ dateExpiration: 1 });

            for (const lot of lots) {
                if (remaining <= 0) break;
                const taken = Math.min(lot.quantite, remaining);
                lot.quantite -= taken;
                remaining -= taken;
                await lot.save();
                usedLots.push(lot._id);
            }

            if (remaining > 0) {
                return res.status(400).json({
                    success: false,
                    message: `Stock insuffisant pour ${item.nomMedicament}. Disponible: ${item.quantite - remaining}`,
                });
            }

            const sousTotal = item.prixUnitaire * item.quantite;
            saleTotal += sousTotal;

            saleItems.push({
                medicineId: item.medicineId,
                lotId: usedLots[0],
                nomMedicament: item.nomMedicament,
                quantite: item.quantite,
                prixUnitaire: item.prixUnitaire,
                sousTotal,
            });

            await checkAndCreateAlerts(item.medicineId);
        }

        const effectifMontantRecu = montantRecu || saleTotal;

        const sale = await Sale.create({
            items: saleItems,
            total: saleTotal,
            modePaiement,
            montantRecu: effectifMontantRecu,
            monnaie: effectifMontantRecu - saleTotal,
            caissierRef: req.user._id,
            pharmacienRef: commande.pharmacienRef,
            notes: commande.notes ? `Ordonnance: ${commande.patientNom || 'Anonyme'} — ${commande.notes}` : `Ordonnance: ${commande.patientNom || 'Anonyme'}`,
        });

        // Update commande status
        commande.statut = 'encaisse';
        commande.saleRef = sale._id;
        commande.encaissePar = req.user._id;
        commande.encaisseAt = new Date();
        await commande.save();

        await logActivity(req, 'ENCAISSEMENT_COMMANDE', 'Commande', commande._id, {
            reference: commande.reference,
            saleReference: sale.reference,
            total: saleTotal,
        });

        res.status(201).json({
            success: true,
            data: commande,
            sale,
            message: 'Commande encaissée — vente créée',
        });
    } catch (err) { next(err); }
};
