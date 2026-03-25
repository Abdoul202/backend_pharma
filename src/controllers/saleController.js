const Sale = require('../models/Sale');
const { logActivity } = require('../middleware/activityLogger');
const { processSale, cancelSale } = require('../services/saleService');
const PDFDocument = require('pdfkit');

// POST /sales  — Creer une vente (caissier, pharmacien, admin)
exports.createSale = async (req, res, next) => {
    try {
        const { items, modePaiement, montantRecu, pharmacienRef, notes } = req.body;

        const sale = await processSale({
            items,
            modePaiement,
            montantRecu,
            caissierRef: req.user._id,
            pharmacienRef,
            notes,
        });

        await logActivity(req, 'VENTE', 'Sale', sale._id, { reference: sale.reference, total: sale.total });

        res.status(201).json({ success: true, data: sale, message: 'Vente enregistree avec succes' });
    } catch (err) {
        if (err.status) {
            return res.status(err.status).json({ success: false, message: err.message });
        }
        next(err);
    }
};

// GET /sales  — Liste des ventes
exports.getSales = async (req, res, next) => {
    try {
        const { startDate, endDate, caissier, statut, page = 1, limit = 20 } = req.query;
        const parsedLimit = Math.min(parseInt(limit) || 20, 100);
        const parsedPage = parseInt(page) || 1;

        const filter = {};
        if (req.user.role === 'caissier') filter.caissierRef = req.user._id;
        if (caissier && req.user.role === 'admin') filter.caissierRef = caissier;
        if (statut) filter.statut = statut;
        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) filter.createdAt.$gte = new Date(startDate);
            if (endDate) filter.createdAt.$lte = new Date(endDate + 'T23:59:59');
        }

        const skip = (parsedPage - 1) * parsedLimit;
        const [sales, total] = await Promise.all([
            Sale.find(filter)
                .populate('caissierRef', 'nom')
                .populate('pharmacienRef', 'nom')
                .skip(skip).limit(parsedLimit).sort({ createdAt: -1 }),
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
            pagination: { page: parsedPage, limit: parsedLimit, total, pages: Math.ceil(total / parsedLimit) },
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

        const diffH = (new Date() - sale.createdAt) / 1000 / 3600;
        if (diffH > 24 && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Annulation impossible apres 24 heures' });
        }

        const cancelled = await cancelSale(sale._id, req.user._id, req.body.raison);

        await logActivity(req, 'ANNULATION_VENTE', 'Sale', cancelled._id, {
            reference: cancelled.reference,
            raison: cancelled.raisonAnnulation,
        });

        res.json({ success: true, data: cancelled, message: 'Vente annulee et stock restaure' });
    } catch (err) {
        if (err.status) {
            return res.status(err.status).json({ success: false, message: err.message });
        }
        next(err);
    }
};

// GET /sales/:id/recu  — Generer recu PDF
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
        doc.fontSize(10).font('Helvetica').text('Recu de vente', { align: 'center' });
        doc.moveDown();
        doc.text(`Reference: ${sale.reference}`);
        doc.text(`Date: ${sale.createdAt.toLocaleDateString('fr-FR')} ${sale.createdAt.toLocaleTimeString('fr-FR')}`);
        doc.text(`Caissier: ${sale.caissierRef?.nom || 'N/A'}`);
        doc.text(`Mode de paiement: ${sale.modePaiement}`);
        doc.moveDown();

        doc.font('Helvetica-Bold').text('Articles:', { underline: true });
        doc.font('Helvetica');
        for (const item of sale.items) {
            doc.text(`${item.nomMedicament} x${item.quantite} - ${item.prixUnitaire.toLocaleString()} FCFA/unite = ${item.sousTotal.toLocaleString()} FCFA`);
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
