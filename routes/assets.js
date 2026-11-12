const { Router } = require('express');
const { tempUpload } = require('../middlewares/storage');
const ctrl = require('../controllers/asset');

const router = Router();

// http://localhost:4000/api/assets
router.post('/create_asset', [tempUpload], ctrl.create_asset);
router.get('/read_assets', [], ctrl.read_assets);
router.get('/get_asset/:id', [], ctrl.get_asset);
router.put('/update_asset', [tempUpload], ctrl.update_asset);
router.delete('/delete_asset/:id', [], ctrl.delete_asset);
router.put('/update_assets_order', [], ctrl.update_assets_order);

module.exports = router;
