const Sale = require('../models/Sale');
const Lot = require('../models/Lot');
const Medicine = require('../models/Medicine');
const { logActivity } = require('../middleware/activityLogger');
const { checkAndCreateAlerts } = require('../services/alertService');
const PDFDocument = require('pdfkit');

// POST /sales  — Créer une vente (caissier, pharmacien, admin)
exports.createSale = async (req, res, next) => {
    try {
        const { items, modePaiement, montantRecu, pharmacienRef, notes } = req.body;

        if (!items || items.length === 0) {
            return res.status(400).json({ success: false, message: 'La vente doit contenir au moins un article' });
        }

        const saleItems = [];
        let total = 0;

        for (const item of items) {
            const medicine = await Medicine.findOne({ _id: item.medicineId, deletedAt: null });
            if (!medicine) {
                return res.status(404).json({ success: false, message: `Médicament introuvable: ${item.medicineId}` });
            }

            // Deduct stock from earliest non-expired lots (FEFO: First Expired First Out)
            let remaining = parseInt(item.quantite);
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
                    message: `Stock insuffisant pour ${medicine.nom}. Disponible: ${item.quantite - remaining}`,
                });
            }

            const sousTotal = medicine.prixVente * parseInt(item.quantite);
            total += sousTotal;

            saleItems.push({
                medicineId: medicine._id,
                lotId: usedLots[0],
                nomMedicament: medicine.nom,
                quantite: parseInt(item.quantite),
                prixUnitaire: medicine.prixVente,
                sousTotal,
            });

            // Check alerts after stock change
            await checkAndCreateAlerts(medicine._id);
        }

        const sale = await Sale.create({
            items: saleItems,
            total,
            modePaiement,
            montantRecu: montantRecu || total,
            monnaie: montantRecu ? montantRecu - total : 0,
            caissierRef: req.user._id,
            pharmacienRef,
            notes,
        });

        await logActivity(req, 'VENTE', 'Sale', sale._id, { reference: sale.reference, total });

        const populated = await Sale.findById(sale._id)
            .populate('caissierRef', 'nom')
            .populate('items.medicineId', 'nom forme dosage');

        res.status(201).json({ success: true, data: populated, message: 'Vente enregistrée avec succès' });
    } catch (err) { next(err); }
};

// GET /sales  — Liste des ventes
exports.getSales = async (req, res, next) => {
    try {
        const { startDate, endDate, caissier, statut, page = 1, limit = 20 } = req.query;

        const filter = {};
        if (req.user.role === 'caissier') filter.caissierRef = req.user._id;
        if (caissier && req.user.role === 'admin') filter.caissierRef = caissier;
        if (statut) filter.statut = statut;
        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) filter.createdAt.$gte = new Date(startDate);
            if (endDate) filter.createdAt.$lte = new Date(endDate + 'T23:59:59');
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [sales, total] = await Promise.all([
            Sale.find(filter)
                .populate('caissierRef', 'nom')
                .populate('pharmacienRef', 'nom')
                .skip(skip).limit(parseInt(limit)).sort({ createdAt: -1 }),
            Sale.countDocuments(filter),
        ]);

        const totalCA = await Sale.aggregate([
            { $match: { ...filter, statut: 'valide' } },
            { $group: { _id: null, ca: { $sum: '$total' } } },
        ]);

        res.json({
            success: true,
            data: sales,
            ca: totalCA[0]?.ca || 0,
            pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) },
        });
    } catch (err) { next(err); }
};

// GET /sales/:id
exports.getOne = async (req, res, next) => {
    try {
        const sale = await Sale.findById(req.params.id)
            .populate('caissierRef', 'nom email')
            .populate('pharmacienRef', 'nom')
            .populate('items.medicineId', 'nom forme dosage');
        if (!sale) return res.status(404).json({ success: false, message: 'Vente introuvable' });
        res.json({ success: true, data: sale });
    } catch (err) { next(err); }
};

// POST /sales/:id/annuler  — Annuler une vente
exports.cancelSale = async (req, res, next) => {
    try {
        const sale = await Sale.findById(req.params.id);
        if (!sale) return res.status(404).json({ success: false, message: 'Vente introuvable' });
        if (sale.statut === 'annule') {
            return res.status(400).json({ success: false, message: 'Cette vente est déjà annulée' });
        }

        const diffH = (new Date() - sale.createdAt) / 1000 / 3600;
        if (diffH > 24 && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Annulation impossible après 24 heures' });
        }

        // Restore stock
        for (const item of sale.items) {
            if (item.lotId) {
                await Lot.findByIdAndUpdate(item.lotId, { $inc: { quantite: item.quantite } });
            }
        }

        sale.statut = 'annule';
        sale.annulePar = req.user._id;
        sale.annuleAt = new Date();
        sale.raisonAnnulation = req.body.raison || 'Non précisé';
        await sale.save();

        await logActivity(req, 'ANNULATION_VENTE', 'Sale', sale._id, { reference: sale.reference, raison: sale.raisonAnnulation });

        res.json({ success: true, data: sale, message: 'Vente annulée et stock restauré' });
    } catch (err) { next(err); }
};

// GET /sales/:id/recu  — Générer reçu PDF
exports.generateRecu = async (req, res, next) => {
    try {
        const sale = await Sale.findById(req.params.id)
            .populate('caissierRef', 'nom')
            .populate('items.medicineId', 'nom');
        if (!sale) return res.status(404).json({ success: false, message: 'Vente introuvable' });

        const doc = new PDFDocument({ margin: 40, size: 'A5' });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="recu-${sale.reference}.pdf"`);
        doc.pipe(res);

        doc.fontSize(16).font('Helvetica-Bold').text('PharmacyManager BF', { align: 'center' });
        doc.fontSize(10).font('Helvetica').text('Reçu de vente', { align: 'center' });
        doc.moveDown();
        doc.text(`Référence: ${sale.reference}`);
        doc.text(`Date: ${sale.createdAt.toLocaleDateString('fr-FR')} ${sale.createdAt.toLocaleTimeString('fr-FR')}`);
        doc.text(`Caissier: ${sale.caissierRef?.nom || 'N/A'}`);
        doc.text(`Mode de paiement: ${sale.modePaiement}`);
        doc.moveDown();

        doc.font('Helvetica-Bold').text('Articles:', { underline: true });
        doc.font('Helvetica');
        for (const item of sale.items) {
            doc.text(`${item.nomMedicament} x${item.quantite} — ${item.prixUnitaire.toLocaleString()} FCFA/unité = ${item.sousTotal.toLocaleString()} FCFA`);
        }

        doc.moveDown();
        doc.font('Helvetica-Bold').fontSize(12).text(`TOTAL: ${sale.total.toLocaleString()} FCFA`, { align: 'right' });
        if (sale.monnaie > 0) {
            doc.font('Helvetica').fontSize(10).text(`Rendu: ${sale.monnaie.toLocaleString()} FCFA`, { align: 'right' });
        }

        doc.moveDown(2);
        doc.fontSize(9).text('Merci pour votre confiance!', { align: 'center' });
        doc.end();
    } catch (err) { next(err); }
};
