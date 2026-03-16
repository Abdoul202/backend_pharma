const Sale = require('../models/Sale');
const Lot = require('../models/Lot');
const Medicine = require('../models/Medicine');
const PDFDocument = require('pdfkit');
const xlsx = require('xlsx');

// GET /reports/monthly?year=2024&month=3
exports.monthlyReport = async (req, res, next) => {
    try {
        const year = parseInt(req.query.year) || new Date().getFullYear();
        const month = parseInt(req.query.month) || new Date().getMonth() + 1;
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0, 23, 59, 59);

        const [sales, topProducts, salesByDay] = await Promise.all([
            Sale.find({ statut: 'valide', createdAt: { $gte: startDate, $lte: endDate } })
                .populate('caissierRef', 'nom').populate('items.medicineId', 'nom'),
            Sale.aggregate([
                { $match: { statut: 'valide', createdAt: { $gte: startDate, $lte: endDate } } },
                { $unwind: '$items' },
                { $group: { _id: '$items.medicineId', nom: { $first: '$items.nomMedicament' }, qte: { $sum: '$items.quantite' }, ca: { $sum: '$items.sousTotal' } } },
                { $sort: { ca: -1 } }, { $limit: 10 },
            ]),
            Sale.aggregate([
                { $match: { statut: 'valide', createdAt: { $gte: startDate, $lte: endDate } } },
                { $group: { _id: { $dayOfMonth: '$createdAt' }, ventes: { $sum: 1 }, ca: { $sum: '$total' } } },
                { $sort: { '_id': 1 } },
            ]),
        ]);

        const totalCA = sales.reduce((sum, s) => sum + s.total, 0);
        const totalVentes = sales.length;

        // Expired lots value (pertes)
        const expiredLots = await Lot.find({
            dateExpiration: { $gte: startDate, $lte: endDate },
            quantite: { $gt: 0 },
        }).populate('medicineId', 'prixAchat');
        const valeurPerdue = expiredLots.reduce((sum, l) => sum + (l.quantite * (l.medicineId?.prixAchat || 0)), 0);

        const format = req.query.format || 'json';

        if (format === 'pdf') {
            const doc = new PDFDocument({ margin: 50 });
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="rapport-${year}-${month}.pdf"`);
            doc.pipe(res);

            doc.fontSize(20).font('Helvetica-Bold').text('PharmacyManager BF', { align: 'center' });
            doc.fontSize(14).text(`Rapport mensuel — ${month}/${year}`, { align: 'center' });
            doc.moveDown();
            doc.fontSize(12).font('Helvetica').text(`Chiffre d'affaires: ${totalCA.toLocaleString()} FCFA`);
            doc.text(`Nombre de ventes: ${totalVentes}`);
            doc.text(`Valeur périmés: ${valeurPerdue.toLocaleString()} FCFA`);
            doc.moveDown();

            doc.font('Helvetica-Bold').text('Top produits:');
            doc.font('Helvetica');
            topProducts.forEach((p, i) => {
                doc.text(`${i + 1}. ${p.nom} — ${p.qte} unités — ${p.ca.toLocaleString()} FCFA`);
            });
            doc.end();
        } else {
            res.json({
                success: true,
                data: { year, month, totalCA, totalVentes, valeurPerdue, topProducts, salesByDay },
            });
        }
    } catch (err) { next(err); }
};

// GET /reports/stock
exports.stockReport = async (req, res, next) => {
    try {
        const format = req.query.format || 'json';
        const medicines = await Medicine.find({ deletedAt: null }).lean();
        const medicineIds = medicines.map(m => m._id);

        const [stockAgg, expiringLots] = await Promise.all([
            Lot.aggregate([
                { $match: { medicineId: { $in: medicineIds }, actif: true } },
                { $group: { _id: '$medicineId', quantiteDisponible: { $sum: { $cond: [{ $gt: ['$dateExpiration', new Date()] }, '$quantite', 0] } }, quantiteExpiree: { $sum: { $cond: [{ $lte: ['$dateExpiration', new Date()] }, '$quantite', 0] } } } },
            ]),
            Lot.find({ actif: true, dateExpiration: { $lte: new Date(new Date().setDate(new Date().getDate() + 30)) } })
                .populate('medicineId', 'nom').sort({ dateExpiration: 1 }),
        ]);

        const stockMap = Object.fromEntries(stockAgg.map(s => [s._id.toString(), s]));
        const report = medicines.map(m => ({
            nom: m.nom, forme: m.forme, dosage: m.dosage,
            seuilAlerte: m.seuilAlerte,
            disponible: stockMap[m._id.toString()]?.quantiteDisponible || 0,
            expire: stockMap[m._id.toString()]?.quantiteExpiree || 0,
            stockBas: (stockMap[m._id.toString()]?.quantiteDisponible || 0) <= m.seuilAlerte,
        }));

        if (format === 'xlsx') {
            const wb = xlsx.utils.book_new();
            xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(report.map(r => ({
                Médicament: r.nom, Forme: r.forme, Disponible: r.disponible,
                Expiré: r.expire, 'Seuil Alerte': r.seuilAlerte, 'Stock Bas': r.stockBas ? 'OUI' : 'NON',
            }))), 'Stock');
            const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
            res.setHeader('Content-Disposition', 'attachment; filename="rapport-stock.xlsx"');
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            return res.send(buffer);
        }

        res.json({ success: true, data: { medicines: report, expiringIn30Days: expiringLots } });
    } catch (err) { next(err); }
};
