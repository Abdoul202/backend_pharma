const router = require('express').Router();
const reportController = require('../controllers/reportController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

router.use(authenticate, authorize('admin', 'pharmacien'));

/**
 * @swagger
 * /reports/monthly:
 *   get:
 *     tags: [Reports]
 *     summary: Rapport mensuel (JSON ou PDF)
 *     parameters:
 *       - in: query
 *         name: format
 *         schema: { type: string, enum: [json, pdf], default: json }
 *     responses:
 *       200:
 *         description: Rapport mensuel avec CA, ventes, top produits
 * /reports/stock:
 *   get:
 *     tags: [Reports]
 *     summary: Rapport de stock (JSON ou Excel)
 *     parameters:
 *       - in: query
 *         name: format
 *         schema: { type: string, enum: [json, xlsx], default: json }
 *     responses:
 *       200:
 *         description: État complet du stock
 */
router.get('/monthly', reportController.monthlyReport);
router.get('/stock', reportController.stockReport);

module.exports = router;
