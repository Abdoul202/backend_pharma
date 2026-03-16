const Medicine = require('../models/Medicine');
const Lot = require('../models/Lot');
const { logActivity } = require('../middleware/activityLogger');
const xlsx = require('xlsx');

// GET /medicines
exports.getAll = async (req, res, next) => {
    try {
        const { search, categorie, forme, page = 1, limit = 20, withStock = false } = req.query;

        const filter = { deletedAt: null };
        if (categorie) filter.categorie = categorie;
        if (forme) filter.forme = forme;
        if (search) filter.$text = { $search: search };

        const skip = (parseInt(page) - 1) * parseInt(limit);

        let query = Medicine.find(filter).skip(skip).limit(parseInt(limit)).sort({ nom: 1 });
        if (withStock === 'true') query = query.populate('stockTotal');

        const [medicines, total] = await Promise.all([query, Medicine.countDocuments(filter)]);

        // Attach stock quantities per medicine
        let result = medicines;
        if (withStock === 'true') {
            const medicineIds = medicines.map(m => m._id);
            const stockData = await Lot.aggregate([
                { $match: { medicineId: { $in: medicineIds }, actif: true, dateExpiration: { $gt: new Date() } } },
                { $group: { _id: '$medicineId', quantiteTotale: { $sum: '$quantite' } } },
            ]);
            const stockMap = Object.fromEntries(stockData.map(s => [s._id.toString(), s.quantiteTotale]));
            result = medicines.map(m => {
                const obj = m.toObject();
                obj.quantiteTotale = stockMap[m._id.toString()] || 0;
                obj.stockBas = obj.quantiteTotale <= m.seuilAlerte;
                return obj;
            });
        }

        res.json({
            success: true,
            data: result,
            pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) },
        });
    } catch (err) { next(err); }
};

// GET /medicines/:id
exports.getOne = async (req, res, next) => {
    try {
        const medicine = await Medicine.findOne({ _id: req.params.id, deletedAt: null });
        if (!medicine) return res.status(404).json({ success: false, message: 'Médicament introuvable' });

        const lots = await Lot.find({ medicineId: medicine._id, actif: true }).sort({ dateExpiration: 1 });
        const quantiteTotale = lots.reduce((sum, l) => sum + (l.dateExpiration > new Date() ? l.quantite : 0), 0);

        res.json({ success: true, data: { ...medicine.toObject(), lots, quantiteTotale } });
    } catch (err) { next(err); }
};

// POST /medicines  (admin, pharmacien)
exports.create = async (req, res, next) => {
    try {
        const medicine = await Medicine.create({ ...req.body, createdBy: req.user._id });
        await logActivity(req, 'AJOUT_MEDICAMENT', 'Medicine', medicine._id, { nom: medicine.nom });
        res.status(201).json({ success: true, data: medicine });
    } catch (err) { next(err); }
};

// PUT /medicines/:id  (admin, pharmacien)
exports.update = async (req, res, next) => {
    try {
        const medicine = await Medicine.findOneAndUpdate(
            { _id: req.params.id, deletedAt: null },
            req.body,
            { new: true, runValidators: true }
        );
        if (!medicine) return res.status(404).json({ success: false, message: 'Médicament introuvable' });
        await logActivity(req, 'MODIF_MEDICAMENT', 'Medicine', medicine._id, { nom: medicine.nom });
        res.json({ success: true, data: medicine });
    } catch (err) { next(err); }
};

// DELETE /medicines/:id  (soft delete — admin, pharmacien)
exports.remove = async (req, res, next) => {
    try {
        const medicine = await Medicine.findOneAndUpdate(
            { _id: req.params.id, deletedAt: null },
            { deletedAt: new Date(), deletedBy: req.user._id },
            { new: true }
        );
        if (!medicine) return res.status(404).json({ success: false, message: 'Médicament introuvable' });
        await logActivity(req, 'SUPPRESSION_MEDICAMENT', 'Medicine', medicine._id, { nom: medicine.nom });
        res.json({ success: true, message: 'Médicament supprimé (soft delete)' });
    } catch (err) { next(err); }
};

// POST /medicines/import-csv  (admin only)
exports.importCSV = async (req, res, next) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'Fichier requis' });

        const wb = xlsx.read(req.file.buffer, { type: 'buffer' });
        const rows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);

        const created = [];
        const errors = [];

        for (const row of rows) {
            try {
                const med = await Medicine.create({
                    nom: row.nom || row.Nom,
                    dci: row.dci || row.DCI,
                    forme: (row.forme || row.Forme || 'autre').toLowerCase(),
                    dosage: row.dosage || row.Dosage,
                    prixVente: parseFloat(row.prixVente || row['Prix Vente'] || 0),
                    prixAchat: parseFloat(row.prixAchat || row['Prix Achat'] || 0),
                    seuilAlerte: parseInt(row.seuilAlerte || row['Seuil Alerte'] || 10),
                    categorie: row.categorie || row.Categorie,
                    createdBy: req.user._id,
                });
                created.push(med.nom);
            } catch (e) {
                errors.push({ ligne: row.nom || '?', erreur: e.message });
            }
        }

        await logActivity(req, 'IMPORT_CSV_MEDICAMENTS', 'Medicine', null, { imported: created.length, errors: errors.length });
        res.json({ success: true, data: { imported: created.length, errors } });
    } catch (err) { next(err); }
};

// GET /medicines/export  (admin, pharmacien)
exports.exportExcel = async (req, res, next) => {
    try {
        const medicines = await Medicine.find({ deletedAt: null }).lean();

        const stockData = await Lot.aggregate([
            { $match: { actif: true, dateExpiration: { $gt: new Date() } } },
            { $group: { _id: '$medicineId', quantiteTotale: { $sum: '$quantite' } } },
        ]);
        const stockMap = Object.fromEntries(stockData.map(s => [s._id.toString(), s.quantiteTotale]));

        const rows = medicines.map(m => ({
            Nom: m.nom,
            DCI: m.dci || '',
            Forme: m.forme,
            Dosage: m.dosage || '',
            Catégorie: m.categorie || '',
            'Prix Vente (FCFA)': m.prixVente,
            'Prix Achat (FCFA)': m.prixAchat || '',
            'Seuil Alerte': m.seuilAlerte,
            'Stock Disponible': stockMap[m._id.toString()] || 0,
            'Code Barres': m.codeBarres || '',
        }));

        const wb = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(rows), 'Médicaments');
        const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Disposition', 'attachment; filename="medicaments.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
    } catch (err) { next(err); }
};
