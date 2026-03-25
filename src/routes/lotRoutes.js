const router = require('express').Router();
const { body } = require('express-validator');
const stockController = require('../controllers/stockController');
const { authenticate, authorize } = require('../middleware/authMiddleware');
const validate = require('../middleware/validate');

router.use(authenticate);

router.get('/', stockController.getLots);
router.patch('/:id',
    authorize('admin', 'pharmacien'),
    [
        body('quantite').optional().isInt({ min: 0 }).withMessage('Quantite invalide'),
        body('fournisseur').optional().isString().isLength({ max: 200 }).withMessage('Fournisseur trop long'),
        body('prixAchatLot').optional().isNumeric().withMessage('Prix achat invalide'),
    ],
    validate,
    stockController.updateLot
);

module.exports = router;
