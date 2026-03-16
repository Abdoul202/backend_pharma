const router = require('express').Router();
const { body } = require('express-validator');
const medicineController = require('../controllers/medicineController');
const { authenticate, authorize } = require('../middleware/authMiddleware');
const validate = require('../middleware/validate');
const multer = require('multer');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.use(authenticate);

/**
 * @swagger
 * /medicines:
 *   get:
 *     tags: [Medicines]
 *     summary: Liste des médicaments
 *     responses:
 *       200:
 *         description: Liste des médicaments
 *   post:
 *     tags: [Medicines]
 *     summary: Ajouter un médicament (admin, pharmacien)
 *     responses:
 *       201:
 *         description: Médicament créé
 */
router.get('/', medicineController.getAll);
router.get('/export', authorize('admin', 'pharmacien'), medicineController.exportExcel);
router.get('/:id', medicineController.getOne);

router.post('/',
    authorize('admin', 'pharmacien'),
    [
        body('nom').notEmpty().withMessage('Nom requis'),
        body('forme').notEmpty().withMessage('Forme requise'),
        body('prixVente').isNumeric().withMessage('Prix de vente invalide'),
    ],
    validate,
    medicineController.create
);

router.put('/:id',
    authorize('admin', 'pharmacien'),
    [body('prixVente').optional().isNumeric()],
    validate,
    medicineController.update
);

router.delete('/:id', authorize('admin', 'pharmacien'), medicineController.remove);

router.post('/import-csv',
    authorize('admin'),
    upload.single('file'),
    medicineController.importCSV
);

module.exports = router;
