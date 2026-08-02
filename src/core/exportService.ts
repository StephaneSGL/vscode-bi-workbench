import type { ReportPage, VisualData } from '../shared/project.js';

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function serializeCsv(rows: readonly Record<string, unknown>[], columns?: readonly string[]): string {
  const headers = columns ? [...columns] : rows.length > 0 ? Object.keys(rows[0] ?? {}) : [];
  const escapeCell = (value: unknown): string => {
    let text = value === null || value === undefined
      ? ''
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value);
    if (FORMULA_PREFIX.test(text)) {
      text = `'${text}`;
    }
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return [
    headers.map(escapeCell).join(','),
    ...rows.map((row) => headers.map((header) => escapeCell(row[header])).join(','))
  ].join('\r\n');
}

export function serializeJson(rows: readonly Record<string, unknown>[]): string {
  return `${JSON.stringify(rows, null, 2)}\n`;
}

export function createStandaloneReportHtml(page: ReportPage, data: readonly VisualData[], projectName: string): string {
  const payload = JSON.stringify({ page, data }).replaceAll('<', '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'">
  <meta name="generator" content="BI Workbench 0.3.0">
  <title>${escapeHtml(projectName)} — ${escapeHtml(page.name)}</title>
  <style>
    :root{font-family:Inter,Segoe UI,sans-serif;color:#172033;background:#f3f6fb}body{margin:0;padding:32px}header{margin-bottom:24px}h1{margin:0;font-size:28px}header p{margin:6px 0;color:#5d6778}.grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:16px}.card{grid-column:span 6;background:#fff;border:1px solid #d9e0ea;border-radius:12px;padding:16px;min-height:240px;box-shadow:0 5px 20px #20304a12}.card h2{font-size:16px;margin:0 0 14px}.kpi{font-size:44px;font-weight:700;margin-top:52px}.bars{display:flex;flex-direction:column;gap:8px}.bar-row{display:grid;grid-template-columns:minmax(80px,1fr) 3fr 70px;gap:8px;align-items:center;font-size:12px}.bar{height:14px;background:#5b7cfa;border-radius:4px}.chart{width:100%;height:190px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{text-align:left;border-bottom:1px solid #e7ebf1;padding:7px;max-width:240px;overflow:hidden;text-overflow:ellipsis}th{background:#f8fafc}.error{color:#a32626;background:#fff1f1;padding:10px;border-radius:6px}@media(max-width:800px){body{padding:16px}.card{grid-column:span 12}}@media print{body{background:#fff;padding:0}.card{break-inside:avoid;box-shadow:none}}
  </style>
</head>
<body>
  <header><h1>${escapeHtml(projectName)}</h1><p>${escapeHtml(page.name)} · exported ${escapeHtml(new Date().toISOString())}</p></header>
  <main class="grid" id="grid"></main>
  <script type="application/json" id="payload">${payload}</script>
  <script>
  (()=>{const p=JSON.parse(document.getElementById('payload').textContent);const grid=document.getElementById('grid');const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const byId=new Map(p.data.map(d=>[d.visualId,d]));
  for(const v of p.page.visuals){const d=byId.get(v.id)||{rows:[],columns:[],error:'No exported data'};const card=document.createElement('section');card.className='card';card.style.gridColumn='span '+Math.min(12,Math.max(1,v.width||6));card.innerHTML='<h2>'+esc(v.title)+'</h2>';if(d.error){card.innerHTML+='<div class="error">'+esc(d.error)+'</div>';grid.append(card);continue}const rows=d.rows||[];
  if(v.type==='kpi'){card.innerHTML+='<div class="kpi">'+esc(rows[0]?.value??'—')+'</div>'}
  else if(v.type==='table'||v.type==='slicer'){const cols=(d.columns||[]).map(c=>c.name);card.innerHTML+='<table><thead><tr>'+cols.map(c=>'<th>'+esc(c)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+cols.map(c=>'<td>'+esc(typeof r[c]==='object'?JSON.stringify(r[c]):r[c])+'</td>').join('')+'</tr>').join('')+'</tbody></table>'}
  else if(['bar','horizontalBar','pie','donut'].includes(v.type)){const max=Math.max(1,...rows.map(r=>Math.abs(Number(r.value)||0)));card.innerHTML+='<div class="bars">'+rows.map(r=>'<div class="bar-row"><span>'+esc(r.category)+'</span><span class="bar" style="width:'+Math.max(1,Math.abs(Number(r.value)||0)/max*100)+'%"></span><strong>'+esc(r.value)+'</strong></div>').join('')+'</div>'}
  else{const w=640,h=180,pad=24,values=rows.map(r=>Number(r.value)||0),min=Math.min(0,...values),max=Math.max(1,...values),x=i=>pad+(rows.length<2?0:i/(rows.length-1))*(w-pad*2),y=n=>h-pad-((n-min)/(max-min||1))*(h-pad*2),points=values.map((n,i)=>x(i)+','+y(n)).join(' ');card.innerHTML+='<svg class="chart" viewBox="0 0 '+w+' '+h+'" role="img" aria-label="'+esc(v.title)+'"><line x1="24" y1="156" x2="616" y2="156" stroke="#bcc5d2"/><polyline fill="none" stroke="#5b7cfa" stroke-width="3" points="'+points+'"/>'+values.map((n,i)=>'<circle cx="'+x(i)+'" cy="'+y(n)+'" r="4" fill="#5b7cfa"><title>'+esc(rows[i]?.category)+': '+esc(n)+'</title></circle>').join('')+'</svg>'}grid.append(card)}}})();
  </script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character] ?? character);
}
