const mongoose = require('mongoose');
const admin = require('express').Router();
const httpsUrl = value => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch { return false; }
};
const schema = new mongoose.Schema({
  badge: { type:String, trim:true, default:'', maxlength:60 },
  name: { type:String, trim:true, required:true, maxlength:100 },
  subtitle: { type:String, trim:true, default:'', maxlength:240 },
  image: { type:String, trim:true, required:true, validate:httpsUrl },
  url: { type:String, trim:true, required:true, validate:httpsUrl },
  buttonText: { type:String, trim:true, required:true, maxlength:60 },
  position: { type:Number, min:1, required:true, validate:Number.isSafeInteger },
  active: { type:Boolean, required:true }
}, {collection:'productos', versionKey:false});
schema.index({position:1}, {unique:true, partialFilterExpression:{active:true}});
const productFields = ['badge','name','subtitle','image','url','buttonText','position','active'];
const Product = mongoose.model('Product', schema);

function handle(fn) {
  return async (req,res) => {
    try { await fn(req,res); }
    catch (error) {
      if (error.code === 11000) return res.status(409).json({error:'Ya existe un producto activo en esa posición.'});
      if (['ValidationError','CastError'].includes(error.name)) {
        return res.status(400).json({error:'Revisa los campos obligatorios, la posición y las URL HTTPS.'});
      }
      res.status(500).json({error:'No se pudieron gestionar los productos.'});
    }
  };
}
const listPublic = handle(async (_,res) => {
  res.set('Cache-Control','no-store');
  res.json(await Product.find({active:true}).select(productFields).sort({position:1,_id:1}).lean());
});
admin.use((req,res,next) => {res.set('Cache-Control','private, no-store');next();});
admin.get('/', handle(async (_,res) => res.json(await Product.find().select(productFields).sort({position:1,name:1}).lean())));
async function save(req,res) {
  const row = req.params.id ? await Product.findById(req.params.id).select(productFields) : new Product();
  if (!row) return res.sendStatus(404);
  for (const field of productFields) {
    row[field] = req.body[field];
  }
  res.json(await row.save());
}
admin.post('/',handle(save));
admin.put('/:id',handle(save));
admin.delete('/:id',handle(async (req,res) => {
  res.sendStatus(await Product.findByIdAndDelete(req.params.id) ? 204 : 404);
}));
module.exports = {admin,listPublic};
