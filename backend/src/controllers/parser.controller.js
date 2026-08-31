import {ok} from '../utils/http.js';import * as svc from '../services/parser.service.js';
export const text=async(req,res)=>ok(res,await svc.parseInvoice({text:req.body?.text,originalName:req.body?.originalName}));
export const upload=async(req,res)=>{const saved=await svc.saveUploadedFile(req.file);let parsed=null;try{parsed=await svc.parseFile(req.file);}catch{parsed=null;}return ok(res,{file:saved,parsed},'文件上传成功');};
export const proxy=async(req,res)=>{const r=await svc.downloadRemote(req.body?.url);res.setHeader('Content-Type',r.contentType);res.setHeader('Content-Disposition','attachment; filename="invoice.bin"');res.send(r.buffer);};
export const resolveRemote=async(req,res)=>ok(res,await svc.resolveRemoteInvoice(req.body?.url),'远程票据下载并解析完成');
