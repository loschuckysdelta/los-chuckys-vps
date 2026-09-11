const mongoose=require("mongoose");
const schema=new mongoose.Schema({
  titulo:{type:String,required:true,trim:true},
  descripcion:{type:String,default:""},
  archivoOriginal:{type:String,required:true},
  originalUrl:{type:String,required:true},
  hlsUrl:{type:String,default:""},
  vistas:{type:Number,default:0,min:0},
  likes:{type:Number,default:0,min:0},
  estado:{type:String,enum:["activo","inactivo"],default:"activo"},
  fijado:{type:Boolean,default:false},
  posicion:{type:Number,default:null,min:1},
  hlsReady:{type:Boolean,default:false},
  conversionError:{type:String,default:""}
},{timestamps:true});
module.exports=mongoose.model("Video",schema);
