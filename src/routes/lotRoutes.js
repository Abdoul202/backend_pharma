const router = require('express').Router();
const stockController = require('../controllers/stockController');
const { authenticate, authorize } = require('../middleware/authMiddleware');
const validate = require('../middleware/validate');

router.use(authenticate);

router.get('/', stockController.getLots);
router.patch('/:id', authorize('admin', 'pharmacien'), stockController.updateLot);

module.exports = router;
