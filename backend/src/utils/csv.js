export function parseCsv(text){
  const lines=String(text).replace(/^\uFEFF/,'').split(/\r?\n/).filter(l=>l.trim()!=='');
  if(!lines.length)return[];
  const parseLine=(line)=>{const out=[];let cur='',q=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(q&&line[i+1]==='"'){cur+='"';i++;}else q=!q;}else if(ch===','&&!q){out.push(cur);cur='';}else cur+=ch;}out.push(cur);return out;};
  const headers=parseLine(lines[0]); return lines.slice(1).map(line=>{const vals=parseLine(line);return Object.fromEntries(headers.map((h,i)=>[h.trim(),(vals[i]??'').trim()]));});
}
