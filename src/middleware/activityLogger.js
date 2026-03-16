const ActivityLog = require('../models/ActivityLog');
const logger = require('../config/logger');

/**
 * Log an activity.
 * Usage: await logActivity(req, 'VENTE', 'Sale', saleId, { total: 3500 });
 */
const logActivity = async (req, action, entite = null, entiteId = null, details = null) => {
    try {
        await ActivityLog.create({
            utilisateurRef: req.user._id,
            action,
            entite,
            entiteId,
            details,
            ip: req.ip,
        });
    } catch (err) {
        logger.error('Failed to log activity:', err.message);
    }
};

module.exports = { logActivity };
