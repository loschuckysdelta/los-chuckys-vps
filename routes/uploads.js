const { Router } = require('express');
const { tempUpload, uploadAsset } = require('../middlewares/storage');
const router = Router();

router.post('/', tempUpload, async (req, res) => {
  try {
    const result = await uploadAsset(req.files?.file, req.body?.folder || 'resources', req.body?.type);
    res.status(201).json(result);
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.message });
  }
});

module.exports = router;
