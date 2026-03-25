const router = require('express').Router();
const { body } = require('express-validator');
const commandeController = require('../controllers/commandeController');
const { authenticate, authorize } = require('../middleware/authMiddleware');
const validate = require('../middleware/validate');

router.use(authenticate);

/**
 * @swagger
 * /commandes:
 *   get:
 *     tags: [Commandes]
 *     summary: Liste des commandes (filtrée par rôle)
 *     parameters:
 *       - in: query
 *         name: statut
 *         schema:
 *           type: string
 *           enum: [brouillon, envoye, encaisse, annule]
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Liste des commandes avec pagination
 *   post:
 *     tags: [Commandes]
 *     summary: Créer une commande (brouillon)
 *     responses:
 *       201:
 *         description: Commande créée
 * /commandes/{id}:
 *   get:
 *     tags: [Commandes]
 *     summary: Détail d'une commande
 *     responses:
 *       200:
 *         description: Détail complet
 *   patch:
 *     tags: [Commandes]
 *     summary: Modifier une commande (brouillon uniquement)
 *     responses:
 *       200:
 *         description: Commande mise à jour
 * /commandes/{id}/envoyer:
 *   patch:
 *     tags: [Commandes]
 *     summary: Envoyer la commande au caissier
 *     responses:
 *       200:
 *         description: Statut changé à "envoye"
 * /commandes/{id}/annuler:
 *   patch:
 *     tags: [Commandes]
 *     summary: Annuler une commande
 *     responses:
 *       200:
 *         description: Commande annulée
 * /commandes/{id}/encaisser:
 *   post:
 *     tags: [Commandes]
 *     summary: Encaisser une commande (crée une vente automatiquement)
 *     responses:
 *       201:
 *         description: Vente créée, stock décrémenté
 */

// List & Detail
router.get('/', commandeController.getAll);
router.get('/:id', commandeController.getOne);

// Create (pharmacien, admin)
router.post('/',
    authorize('pharmacien', 'admin'),
    [
        body('items').isArray({ min: 1 }).withMessage('Articles requis'),
        body('items.*.medicineId').notEmpty().withMessage('ID médicament requis'),
        body('items.*.quantite').isInt({ min: 1 }).withMessage('Quantité invalide'),
    ],
    validate,
    commandeController.create
);

// Update (pharmacien, admin — brouillon only)
router.patch('/:id',
    authorize('pharmacien', 'admin'),
    [
        body('patientNom').optional().isString().isLength({ max: 200 }).withMessage('Nom patient trop long (max 200)'),
        body('notes').optional().isString().isLength({ max: 2000 }).withMessage('Notes trop longues (max 2000)'),
        body('items').optional().isArray({ min: 1 }).withMessage('Articles requis'),
        body('items.*.medicineId').optional().notEmpty().withMessage('ID medicament requis'),
        body('items.*.quantite').optional().isInt({ min: 1 }).withMessage('Quantite invalide'),
    ],
    validate,
    commandeController.update
);

// Send to caissier (pharmacien, admin)
router.patch('/:id/envoyer',
    authorize('pharmacien', 'admin'),
    commandeController.send
);

// Cancel (pharmacien, admin)
router.patch('/:id/annuler',
    authorize('pharmacien', 'admin'),
    commandeController.cancel
);

// Encaisser (caissier, admin)
router.post('/:id/encaisser',
    authorize('caissier', 'admin'),
    commandeController.encaisser
);

module.exports = router;
