const router = require('express').Router();
const { body } = require('express-validator');
const stockController = require('../controllers/stockController');
const { authenticate, authorize } = require('../middleware/authMiddleware');
const validate = require('../middleware/validate');

router.use(authenticate);

/**
 * @swagger
 * /stock/summary:
 *   get:
 *     tags: [Stock]
 *     summary: Vue d'ensemble du stock (tous les médicaments avec quantités)
 *     responses:
 *       200:
 *         description: Résumé du stock
 * /stock/entry:
 *   post:
 *     tags: [Stock]
 *     summary: Ajouter un lot de stock (admin, pharmacien)
 *     responses:
 *       201:
 *         description: Lot ajouté, stock mis à jour
 */
router.get('/summary', stockController.stockSummary);

router.post('/entry',
    authorize('admin', 'pharmacien'),
    [
        body('medicineId').notEmpty().withMessage('Médicament requis'),
        body('numeroLot').notEmpty().withMessage('Numéro de lot requis'),
        body('quantite').isInt({ min: 1 }).withMessage('Quantité invalide'),
        body('dateExpiration').isISO8601().withMessage('Date d\'expiration invalide'),
    ],
    validate,
    stockController.addLot
);

module.exports = router;
