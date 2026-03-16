const router = require('express').Router();
const { body } = require('express-validator');
const saleController = require('../controllers/saleController');
const { authenticate, authorize } = require('../middleware/authMiddleware');
const validate = require('../middleware/validate');

router.use(authenticate);

/**
 * @swagger
 * /sales:
 *   post:
 *     tags: [Sales]
 *     summary: Enregistrer une vente
 *     responses:
 *       201:
 *         description: Vente enregistrée, stock décrémenté automatiquement
 *   get:
 *     tags: [Sales]
 *     summary: Liste des ventes
 *     responses:
 *       200:
 *         description: Liste des ventes avec CA total
 * /sales/{id}/recu:
 *   get:
 *     tags: [Sales]
 *     summary: Générer le reçu PDF d'une vente
 *     responses:
 *       200:
 *         description: PDF du reçu
 * /sales/{id}/annuler:
 *   post:
 *     tags: [Sales]
 *     summary: Annuler une vente (sous 24h, stock restauré)
 *     responses:
 *       200:
 *         description: Vente annulée et stock restauré
 */
router.get('/', saleController.getSales);
router.get('/:id', saleController.getOne);
router.get('/:id/recu', saleController.generateRecu);

router.post('/',
    [
        body('items').isArray({ min: 1 }).withMessage('Articles requis'),
        body('items.*.medicineId').notEmpty(),
        body('items.*.quantite').isInt({ min: 1 }),
    ],
    validate,
    saleController.createSale
);

router.post('/:id/annuler',
    authorize('admin', 'caissier'),
    saleController.cancelSale
);

module.exports = router;
