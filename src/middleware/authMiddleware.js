const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Verify JWT access token
const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, message: 'Token d\'accès requis' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const user = await User.findById(decoded.userId).select('-passwordHash -refreshToken');
        if (!user) {
            return res.status(401).json({ success: false, message: 'Utilisateur introuvable' });
        }
        if (!user.actif) {
            return res.status(403).json({ success: false, message: 'Compte désactivé. Contactez l\'administrateur.' });
        }

        req.user = user;
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, message: 'Token expiré', code: 'TOKEN_EXPIRED' });
        }
        return res.status(401).json({ success: false, message: 'Token invalide' });
    }
};

// Role-based authorization
const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Non authentifié' });
        }
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: `Accès refusé. Rôles autorisés: ${roles.join(', ')}`,
            });
        }
        next();
    };
};

module.exports = { authenticate, authorize };
