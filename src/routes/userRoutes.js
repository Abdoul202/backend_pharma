const router = require('express').Router();
const { body } = require('express-validator');
const userController = require('../controllers/userController');
const { authenticate, authorize } = require('../middleware/authMiddleware');
const validate = require('../middleware/validate');

router.use(authenticate);

/**
 * @swagger
 * /users:
 *   get:
 *     tags: [Users]
 *     summary: Liste tous les utilisateurs
 *     responses:
 *       200:
 *         description: Liste des utilisateurs
 */
router.get('/', authorize('admin'), userController.getAll);

router.get('/:id', authorize('admin'), userController.getOne);

/**
 * @swagger
 * /users:
 *   post:
 *     tags: [Users]
 *     summary: Créer un utilisateur (admin uniquement)
 */
router.post('/',
    authorize('admin'),
    [
        body('nom').notEmpty().withMessage('Nom requis'),
        body('email').isEmail().withMessage('Email invalide'),
        body('password').isLength({ min: 8 }).withMessage('Min. 8 caractères'),
        body('role').isIn(['admin', 'pharmacien', 'caissier']).withMessage('Rôle invalide'),
    ],
    validate,
    userController.create
);

router.put('/:id', authorize('admin'), userController.update);
router.patch('/:id/toggle-actif', authorize('admin'), userController.toggleActif);

router.patch('/:id/reset-password',
    authorize('admin'),
    [body('newPassword').isLength({ min: 8 }).withMessage('Min. 8 caractères')],
    validate,
    userController.resetPassword
);

module.exports = router;
