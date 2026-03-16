const Lot = require('../models/Lot');
const Medicine = require('../models/Medicine');
const Alert = require('../models/Alert');
const { logActivity } = require('../middleware/activityLogger');
const { checkAndCreateAlerts } = require('../services/alertService');

// GET /lots?medicineId=xxx
exports.getLots = async (req, res, next) => {
    try {
        const { medicineId, actif, page = 1, limit = 20 } = req.query;
        const filter = {};
        if (medicineId) filter.medicineId = medicineId;
        if (actif !== undefined) filter.actif = actif === 'true';

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [lots, total] = await Promise.all([
            Lot.find(filter).populate('medicineId', 'nom dci forme dosage').skip(skip).limit(parseInt(limit)).sort({ dateExpiration: 1 }),
            Lot.countDocuments(filter),
        ]);

        res.json({
            success: true,
            data: lots,
            pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) },
        });
    } catch (err) { next(err); }
};

// POST /stock/entry  — Ajouter un lot (admin, pharmacien)
exports.addLot = async (req, res, next) => {
    try {
        const { medicineId, numeroLot, quantite, dateExpiration, fournisseur, prixAchatLot } = req.body;

        const medicine = await Medicine.findOne({ _id: medicineId, deletedAt: null });
        if (!medicine) return res.status(404).json({ success: false, message: 'Médicament introuvable' });

        const lot = await Lot.create({
            medicineId,
            numeroLot,
            quantite: parseInt(quantite),
            dateExpiration: new Date(dateExpiration),
            fournisseur,
            prixAchatLot,
            createdBy: req.user._id,
        });

        await logActivity(req, 'ENTREE_STOCK', 'Lot', lot._id, {
            medicament: medicine.nom,
            quantite,
            numeroLot,
        });

        // Check if low-stock alert can be resolved
        await checkAndCreateAlerts(medicineId);

        res.status(201).json({ success: true, data: lot, message: 'Entrée de stock enregistrée' });
    } catch (err) { next(err); }
};

// PATCH /lots/:id  — Corriger quantité (admin, pharmacien — within 1h)
exports.updateLot = async (req, res, next) => {
    try {
        const lot = await Lot.findById(req.params.id);
        if (!lot) return res.status(404).json({ success: false, message: 'Lot introuvable' });

        const now = new Date();
        const diff = (now - lot.createdAt) / 1000 / 60; // minutes
        if (diff > 60 && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Correction possible uniquement dans l\'heure suivant la saisie' });
        }

        const { quantite, fournisseur, prixAchatLot } = req.body;
        if (quantite !== undefined) lot.quantite = parseInt(quantite);
        if (fournisseur !== undefined) lot.fournisseur = fournisseur;
        if (prixAchatLot !== undefined) lot.prixAchatLot = prixAchatLot;
        await lot.save();

        await logActivity(req, 'CORRECTION_LOT', 'Lot', lot._id, { quantite });
        res.json({ success: true, data: lot });
    } catch (err) { next(err); }
};

// GET /stock/summary  — Vue d'ensemble du stock
exports.stockSummary = async (req, res, next) => {
    try {
        const now = new Date();
        const in30 = new Date(now); in30.setDate(in30.getDate() + 30);
        const in90 = new Date(now); in90.setDate(in90.getDate() + 90);

        const medicines = await Medicine.find({ deletedAt: null }).lean();
        const medicineIds = medicines.map(m => m._id);

        const [stockAgg, expiringLots] = await Promise.all([
            Lot.aggregate([
                { $match: { medicineId: { $in: medicineIds }, actif: true, dateExpiration: { $gt: now } } },
                { $group: { _id: '$medicineId', quantiteTotale: { $sum: '$quantite' } } },
            ]),
            Lot.find({ medicineId: { $in: medicineIds }, actif: true, dateExpiration: { $lte: in90 } })
                .populate('medicineId', 'nom').sort({ dateExpiration: 1 }),
        ]);

        const stockMap = Object.fromEntries(stockAgg.map(s => [s._id.toString(), s.quantiteTotale]));

        const summary = medicines.map(m => ({
            _id: m._id,
            nom: m.nom,
            forme: m.forme,
            seuilAlerte: m.seuilAlerte,
            quantiteTotale: stockMap[m._id.toString()] || 0,
            stockBas: (stockMap[m._id.toString()] || 0) <= m.seuilAlerte,
        }));

        const stockBas = summary.filter(m => m.stockBas).length;

        res.json({
            success: true,
            data: {
                medicines: summary,
                stats: { total: medicines.length, stockBas, expirantDans30j: expiringLots.filter(l => l.dateExpiration <= in30).length },
                lotsExpirants: expiringLots,
            },
        });
    } catch (err) { next(err); }
};
