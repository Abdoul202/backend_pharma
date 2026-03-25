const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const { logActivity } = require('../middleware/activityLogger');
const logger = require('../config/logger');

// Hash refresh token before storing in DB
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const generateTokens = (userId) => {
    const accessToken = jwt.sign({ userId }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_ACCESS_EXPIRES || '15m',
    });
    const refreshToken = jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET, {
        expiresIn: process.env.JWT_REFRESH_EXPIRES || '7d',
    });
    return { accessToken, refreshToken };
};

// POST /auth/login
exports.login = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
        if (!user || !(await user.comparePassword(password))) {
            return res.status(401).json({ success: false, message: 'Email ou mot de passe incorrect' });
        }

        if (!user.actif) {
            return res.status(403).json({ success: false, message: 'Compte désactivé. Contactez l\'administrateur.' });
        }

        const { accessToken, refreshToken } = generateTokens(user._id);

        // Save hashed refresh token
        user.refreshToken = hashToken(refreshToken);
        user.lastLogin = new Date();
        await user.save({ validateBeforeSave: false });

        await logActivity({ user, ip: req.ip }, 'CONNEXION', 'User', user._id);

        res.json({
            success: true,
            data: {
                user: user.toJSON(),
                accessToken,
                refreshToken,
            },
        });
    } catch (err) {
        next(err);
    }
};

// POST /auth/refresh
exports.refresh = async (req, res, next) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) {
            return res.status(400).json({ success: false, message: 'Refresh token requis' });
        }

        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
        const user = await User.findById(decoded.userId).select('+refreshToken');

        if (!user || user.refreshToken !== hashToken(refreshToken)) {
            return res.status(401).json({ success: false, message: 'Refresh token invalide ou expiré' });
        }

        const { accessToken, refreshToken: newRefreshToken } = generateTokens(user._id);
        user.refreshToken = hashToken(newRefreshToken);
        await user.save({ validateBeforeSave: false });

        res.json({ success: true, data: { accessToken, refreshToken: newRefreshToken } });
    } catch (err) {
        if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
            return res.status(401).json({ success: false, message: 'Refresh token invalide ou expiré' });
        }
        next(err);
    }
};

// POST /auth/logout
exports.logout = async (req, res, next) => {
    try {
        const user = await User.findById(req.user._id);
        if (user) {
            user.refreshToken = null;
            await user.save({ validateBeforeSave: false });
            await logActivity(req, 'DECONNEXION', 'User', user._id);
        }
        res.json({ success: true, message: 'Déconnexion réussie' });
    } catch (err) {
        next(err);
    }
};

// GET /auth/me
exports.me = async (req, res) => {
    res.json({ success: true, data: req.user });
};

// PATCH /auth/change-password
exports.changePassword = async (req, res, next) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const user = await User.findById(req.user._id).select('+passwordHash');

        if (!(await user.comparePassword(currentPassword))) {
            return res.status(400).json({ success: false, message: 'Mot de passe actuel incorrect' });
        }

        user.passwordHash = newPassword;
        await user.save();

        await logActivity(req, 'CHANGEMENT_MOT_DE_PASSE', 'User', user._id);
        res.json({ success: true, message: 'Mot de passe modifié avec succès' });
    } catch (err) {
        next(err);
    }
};
