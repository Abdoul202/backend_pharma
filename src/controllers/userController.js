const User = require('../models/User');
const { logActivity } = require('../middleware/activityLogger');

// GET /users  (admin only)
exports.getAll = async (req, res, next) => {
    try {
        const { role, actif, page = 1, limit = 20 } = req.query;
        const filter = {};
        if (role) filter.role = role;
        if (actif !== undefined) filter.actif = actif === 'true';

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [users, total] = await Promise.all([
            User.find(filter).skip(skip).limit(parseInt(limit)).sort({ createdAt: -1 }),
            User.countDocuments(filter),
        ]);

        res.json({
            success: true,
            data: users,
            pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) },
        });
    } catch (err) { next(err); }
};

// GET /users/:id
exports.getOne = async (req, res, next) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: 'Utilisateur introuvable' });
        res.json({ success: true, data: user });
    } catch (err) { next(err); }
};

// POST /users  (admin only)
exports.create = async (req, res, next) => {
    try {
        const { nom, email, password, role } = req.body;
        const user = await User.create({ nom, email, passwordHash: password, role });
        await logActivity(req, 'CREATION_UTILISATEUR', 'User', user._id, { email, role });
        res.status(201).json({ success: true, data: user });
    } catch (err) { next(err); }
};

// PUT /users/:id  (admin only)
exports.update = async (req, res, next) => {
    try {
        const { nom, role, actif } = req.body;
        const user = await User.findByIdAndUpdate(
            req.params.id,
            { nom, role, actif },
            { new: true, runValidators: true }
        );
        if (!user) return res.status(404).json({ success: false, message: 'Utilisateur introuvable' });
        await logActivity(req, 'MODIF_UTILISATEUR', 'User', user._id, { nom, role, actif });
        res.json({ success: true, data: user });
    } catch (err) { next(err); }
};

// PATCH /users/:id/toggle-actif  (admin only)
exports.toggleActif = async (req, res, next) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: 'Utilisateur introuvable' });
        if (user._id.equals(req.user._id)) {
            return res.status(400).json({ success: false, message: 'Vous ne pouvez pas désactiver votre propre compte' });
        }
        user.actif = !user.actif;
        await user.save({ validateBeforeSave: false });
        await logActivity(req, user.actif ? 'ACTIVATION_UTILISATEUR' : 'DESACTIVATION_UTILISATEUR', 'User', user._id);
        res.json({ success: true, data: user, message: `Utilisateur ${user.actif ? 'activé' : 'désactivé'}` });
    } catch (err) { next(err); }
};

// PATCH /users/:id/reset-password  (admin only)
exports.resetPassword = async (req, res, next) => {
    try {
        const { newPassword } = req.body;
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: 'Utilisateur introuvable' });
        user.passwordHash = newPassword;
        await user.save();
        await logActivity(req, 'RESET_MOT_DE_PASSE', 'User', user._id);
        res.json({ success: true, message: 'Mot de passe réinitialisé' });
    } catch (err) { next(err); }
};
