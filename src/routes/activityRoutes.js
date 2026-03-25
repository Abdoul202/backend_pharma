const router = require('express').Router();
const ActivityLog = require('../models/ActivityLog');
const { authenticate, authorize } = require('../middleware/authMiddleware');

router.use(authenticate);

router.get('/', authorize('admin'), async (req, res, next) => {
    try {
        const { userId, action, page = 1, limit = 50 } = req.query;
        const parsedLimit = Math.min(parseInt(limit) || 50, 100);
        const parsedPage = parseInt(page) || 1;

        const filter = {};
        if (userId) filter.utilisateurRef = userId;
        if (action) filter.action = action;

        const skip = (parsedPage - 1) * parsedLimit;
        const [logs, total] = await Promise.all([
            ActivityLog.find(filter)
                .populate('utilisateurRef', 'nom email role')
                .skip(skip).limit(parsedLimit).sort({ createdAt: -1 }),
            ActivityLog.countDocuments(filter),
        ]);

        res.json({ success: true, data: logs, pagination: { page: parsedPage, limit: parsedLimit, total } });
    } catch (err) { next(err); }
});

module.exports = router;
