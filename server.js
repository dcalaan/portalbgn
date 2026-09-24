import express from "express";
import cors from "cors";
import multer from "multer";
import OpenAI from "openai";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

const __filename=fileURLToPath(import.meta.url);
const __dirname=path.dirname(__filename);
const PORT=Number(process.env.PORT||3000);
const BASE=(process.env.PUBLIC_BASE_URL||`http://localhost:${PORT}`).replace(/\/$/,"");
const uploads=path.join(__dirname,"uploads");
await fsp.mkdir(uploads,{recursive:true});

const app=express();
app.use(cors());
app.use(express.json({limit:"2mb"}));

const upload=multer({
  storage:multer.diskStorage({
    destination:(_r,_f,cb)=>cb(null,uploads),
    filename:(_r,f,cb)=>cb(null,`${randomUUID()}${path.extname(f.originalname||".mp4")}`)
  }),
  limits:{fileSize:250*1024*1024}
});

function html(){
  return fs.readFileSync(path.join(__dirname,"index.html"),"utf8").replaceAll("__BGN_PUBLIC_BASE_URL__",BASE);
}

app.get("/",(_req,res)=>res.type("html").send(html()));
app.get("/health",(_req,res)=>res.json({ok:true,app:"BGN Reels Studio",version:"1.0.0"}));

app.post("/api/generate-content",upload.single("video"),async(req,res)=>{
  const temp=req.file?.path;
  try{
    if(!req.file) return res.status(400).json({error:"Envie um vídeo primeiro."});
    if(!process.env.OPENAI_API_KEY) return res.status(503).json({error:"A IA precisa da variável OPENAI_API_KEY no servidor."});
    const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
    const tr=await client.audio.transcriptions.create({
      file:fs.createReadStream(temp),
      model:process.env.OPENAI_TRANSCRIBE_MODEL||"gpt-4o-mini-transcribe",
      prompt:"Transcreva fielmente em português do Brasil. Não invente trechos inaudíveis."
    });
    const transcript=String(tr.text||"").trim();
    const prompt=`Você é editor do Portal BGN. Com base SOMENTE na transcrição e contexto abaixo, gere conteúdo AUTORAL para um Reels do Instagram.
Não invente fatos. Título factual de até 90 caracteres. Subtítulo de até 160 caracteres. Categoria entre NOTÍCIAS, BRASÍLIA, POLÍTICA, BRASIL, MUNDO, GOSPEL, ESPORTES, ECONOMIA, ENTRETENIMENTO. Legenda com 2 a 4 parágrafos curtos e no máximo 5 hashtags. Em política, mantenha neutralidade factual.

TRANSCRIÇÃO:
${transcript||"[sem fala inteligível]"}

CONTEXTO DO EDITOR:
${String(req.body.context||"")||"[nenhum]"}

TÍTULO ATUAL:
${String(req.body.currentTitle||"")||"[nenhum]"}

SUBTÍTULO ATUAL:
${String(req.body.currentSubtitle||"")||"[nenhum]"}

Responda SOMENTE JSON válido:
{"title":"...","subtitle":"...","category":"...","caption":"..."}`;
    const out=await client.responses.create({model:process.env.OPENAI_TEXT_MODEL||"gpt-5.6-luna",input:prompt});
    const raw=String(out.output_text||"").replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"").trim();
    const data=JSON.parse(raw);
    res.json({
      title:String(data.title||"").slice(0,90),
      subtitle:String(data.subtitle||"").slice(0,160),
      category:String(data.category||"NOTÍCIAS").toUpperCase(),
      caption:String(data.caption||""),
      transcript
    });
  }catch(e){
    console.error(e);
    res.status(500).json({error:e?.message||"Falha ao gerar conteúdo."});
  }finally{
    if(temp) fsp.unlink(temp).catch(()=>{});
  }
});

const TEMPLATE_URI="ui://bgn-reels-studio/v1.html";
function mcp(){
  const s=new McpServer({name:"bgn-reels-studio",version:"1.0.0"});
  s.registerResource("bgn-reels-studio-ui",TEMPLATE_URI,{},async()=>({
    contents:[{
      uri:TEMPLATE_URI,
      mimeType:"text/html;profile=mcp-app",
      text:html(),
      _meta:{
        "openai/widgetDescription":"Editor do Portal BGN para preparar Reels, capas 9:16 e legendas.",
        ui:{prefersBorder:false,domain:BASE,csp:{connectDomains:[BASE],resourceDomains:[BASE]}}
      }
    }]
  }));
  s.registerTool("open_bgn_reels_studio",{
    title:"Abrir BGN Reels Studio",
    description:"Abre o editor BGN para vídeo, capa e legenda de Reels.",
    inputSchema:{},
    annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},
    _meta:{
      "openai/outputTemplate":TEMPLATE_URI,
      "openai/toolInvocation/invoking":"Abrindo BGN Reels Studio…",
      "openai/toolInvocation/invoked":"BGN Reels Studio aberto.",
      ui:{resourceUri:TEMPLATE_URI}
    }
  },async()=>({
    structuredContent:{ready:true},
    content:[{type:"text",text:"BGN Reels Studio pronto."}]
  }));
  return s;
}

app.all("/mcp",async(req,res)=>{
  const s=mcp();
  const t=new StreamableHTTPServerTransport({sessionIdGenerator:undefined});
  try{
    await s.connect(t);
    await t.handleRequest(req,res,req.body);
  }catch(e){
    console.error(e);
    if(!res.headersSent) res.status(500).json({jsonrpc:"2.0",error:{code:-32603,message:"Internal server error"},id:null});
  }
});

app.use((e,_req,res,_next)=>{
  if(e?.code==="LIMIT_FILE_SIZE") return res.status(413).json({error:"O vídeo excede 250 MB."});
  res.status(400).json({error:e?.message||"Falha na solicitação."});
});

app.listen(PORT,"0.0.0.0",()=>console.log(`BGN Reels Studio: ${BASE}`));