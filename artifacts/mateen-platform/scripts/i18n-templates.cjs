// Lists (no arg) or converts (--write map.json) Arabic template literals into fmt(ar, en, vars) calls.
const ts = require('../../../node_modules/typescript'); const fs = require('fs'); const path = require('path');
const AR = /[\u0600-\u06FF]/; const root = path.join(__dirname, '../src'); const L = 'abcdefgh';
const map = process.argv[2] === '--write' ? JSON.parse(fs.readFileSync(process.argv[3], 'utf8')) : null;
const out = new Set(); const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) { if (!p.includes('components/ui')) walk(p); } else if (/\.tsx?$/.test(f) && !f.startsWith('i18n')) files.push(p); } })(root);
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8'); const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const edits = [];
  const visit = (n) => {
    if (ts.isTemplateExpression(n)) {
      let skel = n.head.text; n.templateSpans.forEach((s, i) => { skel += `{${L[i]}}` + s.literal.text; });
      if (AR.test(skel) && !(/i18n-canonical/.test(src.slice(Math.max(0, src.lastIndexOf('\n', n.getStart(sf) - 1) - 200), n.getStart(sf))))) {
        if (!map) out.add(skel);
        else if (map[skel]) { const vars = n.templateSpans.map((s, i) => `${L[i]}: ${s.expression.getText(sf)}`).join(', ');
          let rep = `fmt(${JSON.stringify(skel)}, ${JSON.stringify(map[skel])}, { ${vars} })`;
          if (ts.isJsxExpression(n.parent) || !ts.isJsxAttribute(n.parent)) {} else rep = `{${rep}}`;
          edits.push([n.getStart(sf), n.end, rep]); return; }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (edits.length) { let s = src; edits.sort((a, b) => b[0] - a[0]); for (const [a, b, r] of edits) s = s.slice(0, a) + r + s.slice(b);
    if (!/\bfmt\b[^;]*from '(@\/lib\/i18n|\.\/i18n)'/.test(s)) s = (file.includes('/lib/') ? `import { fmt } from './i18n';\n` : `import { fmt } from '@/lib/i18n';\n`) + s;
    fs.writeFileSync(file, s); }
}
if (!map) console.log(JSON.stringify([...out], null, 0));
