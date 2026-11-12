const { Router } = require('express');
const { tempUpload } = require('../middlewares/storage');
const ctrl = require('../controllers/collection');

const router = Router();

// http://localhost:4000/api/collections
router.post('/create_collection', [tempUpload], ctrl.create_collection);
router.get('/read_collections', [], ctrl.read_collections);
router.get('/get_collection/:id', [], ctrl.get_collection);
router.put('/update_collection', [tempUpload], ctrl.update_collection);
router.delete('/delete_collection/:id', [], ctrl.delete_collection);
router.put('/update_collections_order', [], ctrl.update_collections_order);

module.exports = router;
