const express=require("express");
const mongoose=require("mongoose");
const multer=require("multer");
const cors=require("cors");
const fs=require("fs");
const path=require("path");
const {spawn}=require("child_process");
require("dotenv").config();
const Video=require("./models/Video");

const app=express();
const PORT=Number(process.env.PORT||3000);
const BASE=(process.env.PUBLIC_BASE_URL||`http://localhost:${PORT}`).replace(/\/$/,"");
const FRONTEND=(process.env.FRONTEND_URL||"*").replace(/\/$/,"");
const UPLOADS=path.join(__dirname,"uploads");
const HLS=path.join(__dirname,"hls");
fs.mkdirSync(UPLOADS,{recursive:true}); fs.mkdirSync(HLS,{recursive:true});

app.use(cors({origin:FRONTEND==="*"?true:FRONTEND}));
app.use(express.json({limit:"2mb"}));

mongoose.connect(process.env.MONGODB_URI)
  .then(()=>console.log("✅ MongoDB conectado"))
  .catch(e=>console.error("❌ MongoDB:",e.message));

const storage=multer.diskStorage({
  destination:(_,__,cb)=>cb(null,UPLOADS),
  filename:(_,file,cb)=>{
    const ext=path.extname(file.originalname).toLowerCase();
    const base=path.basename(file.originalname,ext).normalize("NFD")
      .replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9_-]/g,"-")
      .replace(/-+/g,"-").slice(0,80)||"video";
    cb(null,`${Date.now()}-${base}${ext}`);
  }
});
const upload=multer({
  storage,
  limits:{fileSize:Number(process.env.MAX_UPLOAD_MB||5000)*1024*1024},
  fileFilter:(_,f,cb)=>f.mimetype.startsWith("video/")?cb(null,true):cb(new Error("Solo videos"))
});

const originalUrl=f=>`${BASE}/media/${encodeURIComponent(f)}`;
const hlsUrl=id=>`${BASE}/hls/${id}/master.m3u8`;

async function positionFree(pos,exclude=null){
  if(!pos)return true;
  const q={fijado:true,posicion:pos};
  if(exclude)q._id={$ne:exclude};
  return !(await Video.exists(q));
}

function makeHls(video,input){
  const out=path.join(HLS,String(video._id));
  fs.mkdirSync(out,{recursive:true});
  const playlist=path.join(out,"master.m3u8");
  const segment=path.join(out,"seg_%05d.ts");
  const args=["-y","-i",input,"-c:v","libx264","-preset","veryfast","-crf","23","-c:a","aac","-b:a","128k","-hls_time","6","-hls_playlist_type","vod","-hls_segment_filename",segment,playlist];
  const ff=spawn(process.env.FFMPEG_PATH||"ffmpeg",args,{stdio:["ignore","ignore","pipe"]});
  let err="";
  ff.stderr.on("data",d=>err+=d.toString().slice(-3000));
  ff.on("close",async code=>{
    if(code===0) await Video.findByIdAndUpdate(video._id,{hlsUrl:hlsUrl(video._id),hlsReady:true,conversionError:""});
    else await Video.findByIdAndUpdate(video._id,{hlsReady:false,conversionError:err.slice(-1200)||`FFmpeg code ${code}`});
  });
}

app.get("/health",(_,r)=>r.json({ok:true}));
app.get("/api/videos",async(_,r)=>r.json({success:true,videos:await Video.find().sort({fijado:-1,posicion:1,createdAt:-1}).lean()}));

app.post("/api/videos",upload.single("video"),async(req,res,next)=>{
  try{
    if(!req.file)return res.status(400).json({success:false,message:"Falta el video"});
    const fijado=String(req.body.fijado)==="true";
    const posicion=fijado&&req.body.posicion!==""?Number(req.body.posicion):null;
    if(fijado && !(await positionFree(posicion))){
      fs.unlinkSync(req.file.path);
      return res.status(409).json({success:false,message:"Esa posición ya está ocupada"});
    }
    const v=await Video.create({
      titulo:req.body.titulo,
      descripcion:req.body.descripcion||"",
      archivoOriginal:req.file.filename,
      originalUrl:originalUrl(req.file.filename),
      vistas:Number(req.body.vistas||0),
      likes:Number(req.body.likes||0),
      estado:req.body.estado==="inactivo"?"inactivo":"activo",
      fijado,posicion
    });
    makeHls(v,req.file.path);
    res.status(201).json({success:true,video:v,message:"Video guardado. HLS generándose."});
  }catch(e){next(e)}
});

app.put("/api/videos/:id",async(req,res,next)=>{
  try{
    const v=await Video.findById(req.params.id);
    if(!v)return res.status(404).json({success:false,message:"No existe"});
    const fijado=Boolean(req.body.fijado);
    const posicion=fijado&&req.body.posicion!==""&&req.body.posicion!=null?Number(req.body.posicion):null;
    if(fijado && !(await positionFree(posicion,v._id)))return res.status(409).json({success:false,message:"Esa posición ya está ocupada"});
    v.titulo=String(req.body.titulo||v.titulo).trim();
    v.descripcion=String(req.body.descripcion??v.descripcion);
    v.vistas=Math.max(0,Number(req.body.vistas??v.vistas));
    v.likes=Math.max(0,Number(req.body.likes??v.likes));
    v.estado=req.body.estado==="inactivo"?"inactivo":"activo";
    v.fijado=fijado; v.posicion=posicion;
    await v.save();
    res.json({success:true,video:v});
  }catch(e){next(e)}
});

app.delete("/api/videos/:id",async(req,res,next)=>{
  try{
    const v=await Video.findById(req.params.id);
    if(!v)return res.status(404).json({success:false,message:"No existe"});
    const f=path.join(UPLOADS,v.archivoOriginal);
    if(fs.existsSync(f))fs.unlinkSync(f);
    const h=path.join(HLS,String(v._id));
    if(fs.existsSync(h))fs.rmSync(h,{recursive:true,force:true});
    await v.deleteOne();
    res.json({success:true});
  }catch(e){next(e)}
});

app.use((e,req,res,next)=>{
  console.error(e);
  res.status(e.code==="LIMIT_FILE_SIZE"?413:400).json({success:false,message:e.message||"Error"});
});

app.listen(PORT,"0.0.0.0",()=>console.log("🚀 API lista en puerto",PORT));
