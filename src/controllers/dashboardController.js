const Sale = require('../models/Sale');
const Medicine = require('../models/Medicine');
const Lot = require('../models/Lot');
const Alert = require('../models/Alert');
const User = require('../models/User');

// GET /dashboard/stats
exports.getStats = async (req, res, next) => {
    try {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfWeek = new Date(startOfDay);
        startOfWeek.setDate(startOfWeek.getDate() - 7);
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const oneYearAgo = new Date(now);
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

        const [
            caJour, caSemaine, caMois,
            ventesJour, totalMedicaments,
            stockBas, alertesNonLues,
            caParMois, topMedicaments,
            ventesRecentes, alertesRecentes
        ] = await Promise.all([
            Sale.aggregate([{ $match: { statut: 'valide', createdAt: { $gte: startOfDay } } }, { $group: { _id: null, total: { $sum: '$total' } } }]),
            Sale.aggregate([{ $match: { statut: 'valide', createdAt: { $gte: startOfWeek } } }, { $group: { _id: null, total: { $sum: '$total' } } }]),
            Sale.aggregate([{ $match: { statut: 'valide', createdAt: { $gte: startOfMonth } } }, { $group: { _id: null, total: { $sum: '$total' } } }]),
            Sale.countDocuments({ createdAt: { $gte: startOfDay } }),
            Medicine.countDocuments({ deletedAt: null }),

            // Low stock count
            (async () => {
                const medicines = await Medicine.find({ deletedAt: null }).lean();
                const stockAgg = await Lot.aggregate([
                    { $match: { actif: true, dateExpiration: { $gt: new Date() } } },
                    { $group: { _id: '$medicineId', q: { $sum: '$quantite' } } },
                ]);
                const stockMap = Object.fromEntries(stockAgg.map(s => [s._id.toString(), s.q]));
                return medicines.filter(m => (stockMap[m._id.toString()] || 0) <= m.seuilAlerte).length;
            })(),

            Alert.countDocuments({ lu: false }),

            // CA sur 12 mois
            Sale.aggregate([
                { $match: { statut: 'valide', createdAt: { $gte: oneYearAgo } } },
                { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, ca: { $sum: '$total' } } },
                { $sort: { '_id.year': 1, '_id.month': 1 } },
            ]),

            // Top 5 médicaments vendus ce mois
            Sale.aggregate([
                { $match: { statut: 'valide', createdAt: { $gte: startOfMonth } } },
                { $unwind: '$items' },
                { $group: { _id: '$items.medicineId', nom: { $first: '$items.nomMedicament' }, total: { $sum: '$items.quantite' }, ca: { $sum: '$items.sousTotal' } } },
                { $sort: { total: -1 } },
                { $limit: 5 },
            ]),
            
            // Ventes récentes
            Sale.find({}).sort({ createdAt: -1 }).limit(5).populate('items.medicineId').lean(),
            
            // Alertes récentes
            Alert.find({}).sort({ createdAt: -1 }).limit(5).lean()
        ]);

        res.json({
            success: true,
            data: {
                totalVentesAujourdhui: caJour[0]?.total || 0,
                nombreVentesAujourdhui: ventesJour,
                stockBas,
                alertesNonLues,
                ventesRecentes,
                alertesRecentes,
                // Include other stats for potential future use or web frontend
                ca: {
                    jour: caJour[0]?.total || 0,
                    semaine: caSemaine[0]?.total || 0,
                    mois: caMois[0]?.total || 0,
                },
                totalMedicaments,
                caParMois,
                topMedicaments,
            },
        });
    } catch (err) { next(err); }
};
