import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import { AppError } from '../utils/http.js';
import { env } from '../config/env.js';

function normalizeText(text){return String(text||'').replace(/\u0000/g,'').replace(/\r/g,'\n');}
function normalizeDate(v){return String(v||'').replace(/年/g,'-').replace(/月/g,'-').replace(/日/g,'').replace(/[.\/]/g,'-');}
function cleanValue(v){ return String(v||'').replace(/[\r\n]+/g,' ').replace(/\s{2,}/g,' ').trim(); }
function parseMoney(v){ const n=Number(String(v||'').replace(/[￥¥,\s]/g,'')); return Number.isFinite(n)?n:0; }
function normalizeName(v){
  const value=cleanValue(v).replace(/[：:]+$/,'').trim();
  if(!value || /统一社会信用代码|纳税人识别号|校验码|发票代码|发票号码|价税合计|金额|税额/.test(value)) return '';
  return value;
}
function extract(text){
  const t=normalizeText(text);
  const invoiceNo=(t.match(/(?:发票号码|票据号码)\s*[:：]?\s*([0-9A-Za-z-]{6,32})/i)||[])[1]||'';
  const invoiceDate=normalizeDate((t.match(/(?:开票日期)\s*[:：]?\s*(\d{4}[-年/.]\d{1,2}[-月/.]\d{1,2})/)||[])[1]||'');
  let payerName='';
  // 交款人/付款方：姓名取非空字符，遇到“开票日期/票据号码/校验码”等后续字段或换行即停，
  // 避免电子票据文本提取把同行后续字段（如“开票日期：2023-04-30”）一并解析进姓名
  const payerPatterns=[/(?:购买方|购方)[^\n]{0,80}?(?:名称)\s*[:：]\s*([^\n]{1,100})/i,/(?:购买方名称|购方名称)\s*[:：]?\s*([^\n]{1,100})/i,/(?:交款人|付款方)\s*[:：]\s*([^\s:：]{1,40}?)(?=\s*(?:开票日期|票据号码|发票号码|校验码|金额合计|收款单位|[\r\n]|$))/i];
  for(const re of payerPatterns){ const m=t.match(re); const v=normalizeName(m?.[1]); if(v){payerName=v;break;} }
  if(!payerName){
    const lines=t.split('\n').map(cleanValue).filter(Boolean);
    for(let i=0;i<lines.length;i++){
      if(/购买方|购方/.test(lines[i])){
        const block=lines.slice(i,i+4).join(' ');
        const m=block.match(/名称\s*[:：]?\s*([^\s]{1,50}(?:\s+[^\s]{1,50})?)/);
        const v=normalizeName(m?.[1]); if(v){payerName=v;break;}
      }
    }
  }
  // 金额：兼容“价税合计/合计金额/总金额/实收金额/金额合计”，以及电子票据常见的“(小写)￥X”独立行
  const totalPatterns=[/(?:价税合计|合计金额|总金额|实收金额|金额合计)\s*[（(]?\s*(?:小写)?\s*[)）]?\s*[:：]?\s*[￥¥]?\s*([0-9,]+(?:\.\d{1,2})?)/i,/(?:价税合计|合计)\s*[（(]?小写[)）]?\s*[^\d￥¥]{0,10}[￥¥]?\s*([0-9,]+(?:\.\d{1,2})?)/i,/[（(]\s*小写\s*[)）]\s*[￥¥]?\s*([0-9,]+(?:\.\d{1,2})?)/i];
  let totalAmount=0; for(const re of totalPatterns){const m=t.match(re); if(m){totalAmount=parseMoney(m[1]);if(totalAmount)break;}}
  let selfPaid=0;
  const selfPatterns=[/(?:个人自付|个人现金支付|个人自费|自负金额|自费金额|自付金额|自付)\s*[:：]?\s*[￥¥]?\s*([0-9,]+(?:\.\d{1,2})?)/i,/(?:个人负担|个人承担)\s*[:：]?\s*[￥¥]?\s*([0-9,]+(?:\.\d{1,2})?)/i];
  for(const re of selfPatterns){const m=t.match(re);if(m){selfPaid=parseMoney(m[1]);if(selfPaid)break;}}
  return {invoiceNo,invoiceDate,payerName,totalAmount,selfPaid,rawText:t};
}

async function parsePdf(buffer){
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await getDocument({ data: new Uint8Array(buffer), disableFontFace: true }).promise;
  let text='';
  for(let i=1;i<=pdf.numPages;i++){
    const page=await pdf.getPage(i); const content=await page.getTextContent();
    text += content.items.map(x=>x.str||'').join(' ')+'\n';
  }
  return text;
}

async function parseOfd(buffer){
  const { unzipSync, strFromU8 } = await import('fflate');
  const files=unzipSync(new Uint8Array(buffer));
  const chunks=[];
  for(const [name,data] of Object.entries(files)){
    if(/\.xml$/i.test(name)){const text=strFromU8(data); if(/TextCode|ofd:TextObject|ofd:PageBlock/i.test(text)) chunks.push(text.replace(/<[^>]+>/g,' '));}
  }
  return chunks.join('\n');
}

async function parseConfiguredOcr(file){
  if(!env.OCR_ENDPOINT) return '';
  const form=new FormData();
  form.append('file', new Blob([file.buffer]), file.originalname);
  const res=await fetch(env.OCR_ENDPOINT,{method:'POST',body:form});
  if(!res.ok) throw new AppError('OCR_REQUEST_FAILED',`OCR服务返回HTTP ${res.status}`,502);
  const data=await res.json();
  return data.text || data.rawText || '';
}

export async function parseInvoice({text,originalName}){
  const result=extract(text);
  if(!result.invoiceNo&&!result.invoiceDate&&!result.payerName&&!result.totalAmount) throw new AppError('INVOICE_PARSE_FAILED','无法从输入中识别有效发票信息',422,{rawText:result.rawText});
  return {...result,sourceType:'TEXT_REGEX'};
}

export async function parseFile(file){
  if(!file) throw new AppError('FILE_REQUIRED','必须上传文件',422);
  let text=''; let sourceType='TEXT_REGEX'; const ext=path.extname(file.originalname).toLowerCase();
  if(ext==='.pdf' || file.mimetype==='application/pdf'){ try{text=await parsePdf(file.buffer);sourceType='PDF_TEXT';}catch(e){text='';} }
  else if(ext==='.ofd'){ try{text=await parseOfd(file.buffer);sourceType='OFD_TEXT';}catch(e){text='';} }
  else if(/text|csv/.test(file.mimetype||'') || /\.(txt|csv)$/i.test(file.originalname)){text=file.buffer.toString('utf8');sourceType='TEXT_REGEX';}
  if(!text && /^image\//.test(file.mimetype||'')){text=await parseConfiguredOcr(file);sourceType='OCR';}
  if(!text && ext!=='.pdf' && ext!=='.ofd' && !/^image\//.test(file.mimetype||'')) text=file.buffer.toString('utf8');
  if(!text) throw new AppError('INVOICE_PARSE_FAILED','文件已接收，但未能提取文字；请配置OCR服务或手工录入',422);
  const data=extract(text);
  return {...data,sourceType,rawText:text};
}

// 下载远程票据文件并解析，供扫描枪二维码（URL）场景使用
export async function resolveRemoteInvoice(url) {
  const { buffer, contentType } = await downloadRemote(url);
  const originalName = url.split('/').pop() || 'remote.invoice';
  const file = { buffer, originalname: originalName, mimetype: contentType, size: buffer.length };
  const saved = await saveUploadedFile(file);
  let parsed = null;
  try { parsed = await parseFile(file); } catch { parsed = null; }
  return { file: saved, parsed };
}

export async function saveUploadedFile(file){
  if(!file)throw new AppError('FILE_REQUIRED','必须上传文件',422);
  const allowed=['application/pdf','image/jpeg','image/png','image/webp','application/octet-stream'];
  if(!allowed.includes(file.mimetype)&&!/[.]ofd$/i.test(file.originalname))throw new AppError('FILE_TYPE_NOT_ALLOWED','只允许PDF、OFD、JPG、PNG、WEBP文件',422);
  if(file.size>env.MAX_UPLOAD_MB*1024*1024)throw new AppError('FILE_TOO_LARGE','文件超过大小限制',422);
  const ext=path.extname(file.originalname).toLowerCase().replace('.','')||'bin'; const hash=crypto.createHash('sha256').update(file.buffer).digest('hex');
  const day=new Date().toISOString().slice(0,10).replaceAll('-',''); const relative=path.join(day,`${hash}.${ext}`); const full=path.resolve(env.FILE_STORAGE_ROOT,relative);
  await fs.mkdir(path.dirname(full),{recursive:true}); await fs.writeFile(full,file.buffer,{flag:'wx'}).catch(async e=>{if(e.code!=='EEXIST')throw e;});
  return {relativePath:relative,storageName:`${hash}.${ext}`,sha256:hash,size:file.size,type:ext.toUpperCase(),originalName:file.originalname};
}

function ipv4ToInt(ip) {
  const parts = String(ip).split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => !Number.isInteger(p) || p < 0 || p > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

// 判定是否为回环/私网/保留地址（IPv4 含 CIDR 覆盖，IPv6 含映射与链路本地/ULA）
export function isPrivateHost(host) {
  const h = String(host || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost') return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return isPrivateIpv4(h);
  if (h.includes(':')) {
    // IPv4-mapped IPv6：::ffff:x.x.x.x 仍按 IPv4 判定
    if (h.startsWith('::ffff:')) return isPrivateIpv4(h.slice(7));
    const lower = h.toLowerCase();
    if (lower === '::' || lower === '::1') return true;
    if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true; // link-local fe80::/10
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // ULA fc00::/7
    return false;
  }
  return false;
}

function isPrivateIpv4(ip) {
  const n = ipv4ToInt(ip);
  if (n === null) return false;
  // 覆盖：0.0.0.0/8、10/8、100.64/10、127/8、169.254/16、172.16/12、
  // 192.0.0.0/24、192.0.2/24、192.168/16、198.18/15、198.51.100/24、
  // 203.0.113/24、224/4 组播、240/4 保留
  const blocks = [
    [0x00000000, 8], [0x0a000000, 8], [0x64400000, 10], [0x7f000000, 8],
    [0xa9fe0000, 16], [0xac100000, 12], [0xc0000000, 24], [0xc0000200, 24],
    [0xc0a80000, 16], [0xc6120000, 15], [0xc6336400, 24], [0xcb007100, 24],
    [0xe0000000, 4], [0xf0000000, 4]
  ];
  return blocks.some(([base, bits]) => (n >>> (32 - bits)) === (base >>> (32 - bits)));
}

export async function downloadRemote(url) {
  let u;
  try { u = new URL(url); } catch { throw new AppError('INVALID_URL', '票据URL无效', 422); }
  if (!['http:', 'https:'].includes(u.protocol)) throw new AppError('URL_SCHEME_NOT_ALLOWED', '只允许HTTP/HTTPS', 422);
  const hostname = u.hostname.replace(/^\[|\]$/g, '');
  if (isPrivateHost(hostname)) throw new AppError('SSRF_BLOCKED', '禁止访问内网或本机地址', 403);
  // 域名必须解析后再次校验，防止 DNS 解析到内网地址（DNS rebinding）
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    let records;
    try { records = await dns.lookup(hostname, { all: true }); }
    catch { throw new AppError('REMOTE_DOWNLOAD_FAILED', '无法解析票据域名', 422); }
    if (!records.length || records.some(r => isPrivateHost(r.address))) {
      throw new AppError('SSRF_BLOCKED', '目标域名解析到内网或本机地址，已拦截', 403);
    }
  }
  const maxBytes = env.MAX_UPLOAD_MB * 1024 * 1024;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  let res;
  try { res = await fetch(u, { redirect: 'manual', signal: controller.signal }); }
  catch (e) {
    if (e?.name === 'AbortError') throw new AppError('REMOTE_DOWNLOAD_TIMEOUT', '票据下载超时', 408);
    throw new AppError('REMOTE_DOWNLOAD_FAILED', '票据下载失败', 422);
  } finally { clearTimeout(timer); }
  if (!res.ok) throw new AppError('REMOTE_DOWNLOAD_FAILED', `票据下载失败：HTTP ${res.status}`, 422);
  const contentType = res.headers.get('content-type') || 'application/octet-stream';
  const contentLength = Number(res.headers.get('content-length') || 0);
  if (contentLength > maxBytes) throw new AppError('REMOTE_DOWNLOAD_TOO_LARGE', '远程文件超过大小限制', 422);
  const chunks = [];
  let received = 0;
  if (res.body) {
    for await (const value of res.body) {
      received += value.length;
      if (received > maxBytes) throw new AppError('REMOTE_DOWNLOAD_TOO_LARGE', '远程文件超过大小限制', 422);
      chunks.push(value);
    }
  }
  return { buffer: Buffer.concat(chunks), contentType };
}
