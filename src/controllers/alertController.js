const Alert = require('../models/Alert');
const Lot = require('../models/Lot');
const Medicine = require('../models/Medicine');

// GET /alerts/low-stock
exports.getLowStock = async (req, res, next) => {
    try {
        const medicines = await Medicine.find({ deletedAt: null }).lean();
        const medicineIds = medicines.map(m => m._id);

        const stockAgg = await Lot.aggregate([
            { $match: { medicineId: { $in: medicineIds }, actif: true, dateExpiration: { $gt: new Date() } } },
            { $group: { _id: '$medicineId', quantiteTotale: { $sum: '$quantite' } } },
        ]);
        const stockMap = Object.fromEntries(stockAgg.map(s => [s._id.toString(), s.quantiteTotale]));

        const lowStock = medicines
            .map(m => ({ ...m, quantiteTotale: stockMap[m._id.toString()] || 0 }))
            .filter(m => m.quantiteTotale <= m.seuilAlerte);

        res.json({ success: true, data: lowStock, count: lowStock.length });
    } catch (err) { next(err); }
};

// GET /alerts/expiring?days=30
exports.getExpiring = async (req, res, next) => {
    try {
        const days = Math.min(parseInt(req.query.days) || 30, 365);
        const now = new Date();
        const limitDate = new Date(now);
        limitDate.setDate(limitDate.getDate() + days);

        const lots = await Lot.find({
            actif: true,
            quantite: { $gt: 0 },
            dateExpiration: { $lte: limitDate },
        }).populate('medicineId', 'nom forme dosage').sort({ dateExpiration: 1 });

        const in30 = new Date(now);
        in30.setDate(in30.getDate() + 30);
        const in60 = new Date(now);
        in60.setDate(in60.getDate() + 60);
        const in90 = new Date(now);
        in90.setDate(in90.getDate() + 90);

        const groups = {
            expires: lots.filter(l => l.dateExpiration <= now),
            dans30j: lots.filter(l => l.dateExpiration > now && l.dateExpiration <= in30),
            dans60j: lots.filter(l => l.dateExpiration > in30 && l.dateExpiration <= in60),
            dans90j: lots.filter(l => l.dateExpiration > in60 && l.dateExpiration <= in90),
        };

        res.json({ success: true, data: lots, count: lots.length, groups });
    } catch (err) { next(err); }
};

// GET /alerts  — Toutes les alertes
exports.getAlerts = async (req, res, next) => {
    try {
        const { lu, type, page = 1, limit = 20 } = req.query;
        const parsedLimit = Math.min(parseInt(limit) || 20, 100);
        const parsedPage = parseInt(page) || 1;

        const filter = {};
        if (lu !== undefined) filter.lu = lu === 'true';
        if (type) filter.type = type;

        const skip = (parsedPage - 1) * parsedLimit;
        const [alerts, total, unreadCount] = await Promise.all([
            Alert.find(filter).populate('medicineRef', 'nom').populate('lotRef', 'numeroLot dateExpiration')
                .skip(skip).limit(parsedLimit).sort({ createdAt: -1 }),
            Alert.countDocuments(filter),
            Alert.countDocuments({ lu: false }),
        ]);

        res.json({ success: true, data: alerts, unreadCount, pagination: { page: parsedPage, limit: parsedLimit, total } });
    } catch (err) { next(err); }
};

// PATCH /alerts/:id/lu
exports.markAsRead = async (req, res, next) => {
    try {
        const alert = await Alert.findByIdAndUpdate(req.params.id, { lu: true }, { new: true });
        if (!alert) return res.status(404).json({ success: false, message: 'Alerte introuvable' });
        res.json({ success: true, data: alert });
    } catch (err) { next(err); }
};

// PATCH /alerts/mark-all-read
exports.markAllRead = async (req, res, next) => {
    try {
        await Alert.updateMany({ lu: false }, { lu: true });
        res.json({ success: true, message: 'Toutes les alertes marquees comme lues' });
    } catch (err) { next(err); }
};
