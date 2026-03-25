const Commande = require('../models/Commande');
const Medicine = require('../models/Medicine');
const { logActivity } = require('../middleware/activityLogger');
const { processSale } = require('../services/saleService');

// POST /commandes — Creer une commande (brouillon)
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
                return res.status(404).json({ success: false, message: `Medicament introuvable: ${item.medicineId}` });
            }

            const prixUnitaire = Math.round(medicine.prixVente);
            const quantite = Math.round(parseInt(item.quantite));
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

        const reference = await Commande.generateReference();

        const commande = await Commande.create({
            reference,
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

        res.status(201).json({ success: true, data: populated, message: 'Commande creee' });
    } catch (err) { next(err); }
};

// GET /commandes — Liste des commandes
exports.getAll = async (req, res, next) => {
    try {
        const { statut, page = 1, limit = 20 } = req.query;
        const parsedLimit = Math.min(parseInt(limit) || 20, 100);
        const parsedPage = parseInt(page) || 1;

        const filter = {};
        if (req.user.role === 'pharmacien') {
            filter.pharmacienRef = req.user._id;
        } else if (req.user.role === 'caissier') {
            filter.statut = statut || { $in: ['envoye', 'encaisse'] };
        }
        if (statut && req.user.role !== 'caissier') {
            filter.statut = statut;
        }

        const skip = (parsedPage - 1) * parsedLimit;
        const [commandes, total] = await Promise.all([
            Commande.find(filter)
                .populate('pharmacienRef', 'nom')
                .populate('items.medicineId', 'nom forme dosage')
                .skip(skip)
                .limit(parsedLimit)
                .sort({ createdAt: -1 }),
            Commande.countDocuments(filter),
        ]);

        res.json({
            success: true,
            data: commandes,
            pagination: {
                page: parsedPage,
                limit: parsedLimit,
                total,
                pages: Math.ceil(total / parsedLimit),
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
            return res.status(400).json({ success: false, message: 'Seules les commandes en brouillon peuvent etre modifiees' });
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
                    return res.status(404).json({ success: false, message: `Medicament introuvable: ${item.medicineId}` });
                }
                const quantite = Math.round(parseInt(item.quantite));
                const prixUnitaire = Math.round(medicine.prixVente);
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
            commande.items = commandeItems;
            commande.total = total;
        }

        await commande.save();
        res.json({ success: true, data: commande, message: 'Commande mise a jour' });
    } catch (err) { next(err); }
};

// PATCH /commandes/:id/envoyer — Envoyer au caissier
exports.send = async (req, res, next) => {
    try {
        const commande = await Commande.findById(req.params.id);
        if (!commande) return res.status(404).json({ success: false, message: 'Commande introuvable' });
        if (commande.statut !== 'brouillon') {
            return res.status(400).json({ success: false, message: 'Seules les commandes en brouillon peuvent etre envoyees' });
        }

        commande.statut = 'envoye';
        await commande.save();

        await logActivity(req, 'ENVOI_COMMANDE', 'Commande', commande._id, { reference: commande.reference });

        res.json({ success: true, data: commande, message: 'Commande envoyee au caissier' });
    } catch (err) { next(err); }
};

// PATCH /commandes/:id/annuler
exports.cancel = async (req, res, next) => {
    try {
        const commande = await Commande.findById(req.params.id);
        if (!commande) return res.status(404).json({ success: false, message: 'Commande introuvable' });
        if (['encaisse', 'annule'].includes(commande.statut)) {
            return res.status(400).json({ success: false, message: 'Cette commande ne peut plus etre annulee' });
        }

        commande.statut = 'annule';
        commande.annulePar = req.user._id;
        commande.annuleAt = new Date();
        await commande.save();

        await logActivity(req, 'ANNULATION_COMMANDE', 'Commande', commande._id, { reference: commande.reference });

        res.json({ success: true, data: commande, message: 'Commande annulee' });
    } catch (err) { next(err); }
};

// POST /commandes/:id/encaisser — Encaisser (cree une vente via le service partage)
exports.encaisser = async (req, res, next) => {
    try {
        const commande = await Commande.findById(req.params.id);
        if (!commande) return res.status(404).json({ success: false, message: 'Commande introuvable' });
        if (commande.statut !== 'envoye') {
            return res.status(400).json({ success: false, message: 'Seules les commandes envoyees peuvent etre encaissees' });
        }

        const { modePaiement = 'especes', montantRecu } = req.body;

        // Use shared sale service (with transaction + FEFO)
        const sale = await processSale({
            items: commande.items.map(item => ({
                medicineId: item.medicineId,
                quantite: item.quantite,
            })),
            modePaiement,
            montantRecu,
            caissierRef: req.user._id,
            pharmacienRef: commande.pharmacienRef,
            notes: commande.notes
                ? `Ordonnance: ${commande.patientNom || 'Anonyme'} - ${commande.notes}`
                : `Ordonnance: ${commande.patientNom || 'Anonyme'}`,
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
            total: sale.total,
        });

        res.status(201).json({
            success: true,
            data: commande,
            sale,
            message: 'Commande encaissee - vente creee',
        });
    } catch (err) {
        if (err.status) {
            return res.status(err.status).json({ success: false, message: err.message });
        }
        next(err);
    }
};
