const router = require('express').Router();
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/authMiddleware');
const validate = require('../middleware/validate');

/**
 * @swagger
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Connexion utilisateur
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, example: "admin@pharmacy.bf" }
 *               password: { type: string, example: "Admin@1234" }
 *     responses:
 *       200:
 *         description: Connexion réussie
 *       401:
 *         description: Email ou mot de passe incorrect
 */
router.post('/login',
    [
        body('email').isEmail().withMessage('Email invalide'),
        body('password').notEmpty().withMessage('Mot de passe requis'),
    ],
    validate,
    authController.login
);

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Renouveler l'access token
 *     security: []
 */
router.post('/refresh',
    [body('refreshToken').notEmpty().withMessage('Refresh token requis')],
    validate,
    authController.refresh
);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Déconnexion
 */
router.post('/logout', authenticate, authController.logout);

/**
 * @swagger
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Profil de l'utilisateur connecté
 */
router.get('/me', authenticate, authController.me);

/**
 * @swagger
 * /auth/change-password:
 *   patch:
 *     tags: [Auth]
 *     summary: Changer son mot de passe
 */
router.patch('/change-password',
    authenticate,
    [
        body('currentPassword').notEmpty(),
        body('newPassword').isLength({ min: 8 }).withMessage('Min. 8 caractères'),
    ],
    validate,
    authController.changePassword
);

module.exports = router;
