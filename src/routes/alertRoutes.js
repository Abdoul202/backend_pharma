const router = require('express').Router();
const alertController = require('../controllers/alertController');
const { authenticate } = require('../middleware/authMiddleware');

router.use(authenticate);

/**
 * @swagger
 * /alerts/low-stock:
 *   get:
 *     tags: [Alerts]
 *     summary: Médicaments en dessous du seuil d'alerte
 *     responses:
 *       200:
 *         description: Liste des médicaments en stock bas
 * /alerts/expiring:
 *   get:
 *     tags: [Alerts]
 *     summary: Lots expirant bientôt
 *     parameters:
 *       - in: query
 *         name: days
 *         schema: { type: integer, default: 30 }
 *     responses:
 *       200:
 *         description: Lots proches de l'expiration
 * /alerts:
 *   get:
 *     tags: [Alerts]
 *     summary: Toutes les alertes système
 *     responses:
 *       200:
 *         description: Alertes avec compteur non lues
 */
router.get('/low-stock', alertController.getLowStock);
router.get('/expiring', alertController.getExpiring);
router.get('/', alertController.getAlerts);
router.patch('/mark-all-read', alertController.markAllRead);
router.patch('/:id/lu', alertController.markAsRead);

module.exports = router;
