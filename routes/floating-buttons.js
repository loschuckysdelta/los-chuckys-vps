const mongoose = require('mongoose');
const admin = require('express').Router();
const httpsUrl = value => {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; }
  catch { return false; }
};
const schema = new mongoose.Schema({
  key: { type:String, trim:true, lowercase:true, default:'', maxlength:60, match:/^[a-z0-9_-]*$/ },
  name: { type:String, required:true, trim:true, maxlength:100 },
  image: { type:String, required:true, validate:httpsUrl },
  url: { type:String, required:true, validate:httpsUrl },
  views: { type:[String], enum:['catalog','detail'], validate:v => v.length > 0 },
  position: { type:Number, min:1, required:true, validate:Number.isSafeInteger },
  active: { type:Boolean, required:true }
}, { collection:'floating_buttons', versionKey:false });
schema.index({views:1,position:1},{unique:true,partialFilterExpression:{active:true}});
const Button = mongoose.model('FloatingButton', schema);
function handle(fn) {
  return async (req,res) => {
    try { await fn(req,res); }
    catch (err) {
      if (err.code === 11000) return res.status(409).json({error:'Ya existe un botón activo en esa vista y posición.'});
      if (['ValidationError','CastError'].includes(err.name)) return res.status(400).json({error:'Revisa los campos, la posición y las URL HTTPS.'});
      res.status(500).json({error:'No se pudieron gestionar los botones.'});
    }
  };
}
const listPublic = handle(async (_,res) => res.json(await Button.find({active:true}).sort({position:1}).lean()));
admin.get('/', handle(async (_,res) => res.json(await Button.find().sort({position:1,name:1}).lean())));
async function save(req,res) {
  const row = req.params.id ? await Button.findById(req.params.id) : new Button();
  if (!row) return res.sendStatus(404);
  for (const key of ['key','name','image','url','views','position','active']) row[key] = req.body[key];
  res.json(await row.save());
}
admin.post('/',handle(save));
admin.put('/:id',handle(save));
admin.delete('/:id',handle(async (req,res) => res.sendStatus(await Button.findByIdAndDelete(req.params.id) ? 204 : 404)));
module.exports = {admin,listPublic};
