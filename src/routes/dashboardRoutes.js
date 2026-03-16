const router = require('express').Router();
const dashboardController = require('../controllers/dashboardController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

router.use(authenticate);

/**
 * @swagger
 * /dashboard/stats:
 *   get:
 *     tags: [Dashboard]
 *     summary: KPIs en temps réel (CA, ventes, stock bas, alertes)
 *     responses:
 *       200:
 *         description: Statistiques du tableau de bord
 */
router.get('/stats', authorize('admin', 'pharmacien', 'caissier'), dashboardController.getStats);

module.exports = router;
