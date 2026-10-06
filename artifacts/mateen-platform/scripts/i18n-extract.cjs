// Maintenance tool: finds UI Arabic literals in JSX and (with --write) wraps them in tr().
// Religious passages are excluded by marking elements with lang="ar" or className hadith-text.
const ts = require('../../../node_modules/typescript');
const fs = require('fs');
const path = require('path');
const AR = /[\u0600-\u06FF]/;
const ATTRS = new Set(['aria-label', 'title', 'placeholder', 'alt', 'message', 'label', 'eyebrow', 'description', 'emptyText', 'hint', 'aria-description', 'subtitle', 'heading', 'text', 'cta', 'body']);
const PROPS = new Set(['label','title','copy','text','q','a','description','eyebrow','hint','desc','body','cta','subtitle','heading','note','message','short','summary','caption','help','empty','action','tip','detail','lead','name_ar']);
const done = new Set();
const write = process.argv.includes('--write');
const root = path.join(__dirname, '../src');
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) { if (!p.includes('components/ui')) walk(p); } else if (/\.tsx$/.test(f)) files.push(p); } })(root);
const all = new Set();
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits = [];
  const protectedEl = (n) => { for (let p = n; p; p = p.parent) { if (ts.isJsxElement(p)) { const a = p.openingElement.attributes.getText(); if (/lang=["']ar["']|hadith-text|data-canonical/.test(a)) return true; } } return false; };
  const inJsxExprOK = (n) => {
    // walk up through conditional / parenthesized / logical-and to a JsxExpression or attribute
    let p = n.parent, c = n;
    while (p) {
      if (ts.isJsxExpression(p)) return true;
      if (ts.isConditionalExpression(p) && (p.whenTrue === c || p.whenFalse === c)) { c = p; p = p.parent; continue; }
      if (ts.isParenthesizedExpression(p)) { c = p; p = p.parent; continue; }
      if (ts.isBinaryExpression(p) && (p.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken || p.operatorToken.kind === ts.SyntaxKind.BarBarToken || p.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) && p.right === c) { c = p; p = p.parent; continue; }
      return false;
    }
    return false;
  };
  const visit = (n) => {
    if (ts.isJsxText(n) && AR.test(n.text)) {
      if (!protectedEl(n)) {
        const raw = n.text; const t = raw.replace(/\s+/g, ' ').trim();
        const lead = raw.match(/^\s*/)[0], trail = raw.match(/\s*$/)[0];
        const ls = /\n/.test(lead) ? '' : lead ? ' ' : '';
        const tsp = /\n/.test(trail) ? '' : trail ? ' ' : '';
        all.add(t);
        edits.push([n.getStart(sf) - (n.getStart(sf) - n.pos) , n.end, `${ls ? "{' '}" : ''}{tr(${JSON.stringify(t)})}${tsp ? "{' '}" : ''}`]);
      }
    } else if (ts.isJsxAttribute(n) && n.initializer && ts.isStringLiteral(n.initializer) && AR.test(n.initializer.text) && ATTRS.has(n.name.getText())) {
      if (!protectedEl(n)) { all.add(n.initializer.text); edits.push([n.initializer.getStart(sf), n.initializer.end, `{tr(${JSON.stringify(n.initializer.text)})}`]); }
    } else if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && AR.test(n.text) && inJsxExprOK(n) && !(n.parent && ts.isJsxAttribute(n.parent))) {
      if (!protectedEl(n)) { all.add(n.text); edits.push([n.getStart(sf), n.end, `tr(${JSON.stringify(n.text)})`]); }
    }
    else if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && AR.test(n.text) && !protectedEl(n) && !done.has(n)) {
      const p = n.parent;
      const callName = (c) => { const e = c.expression; return ts.isIdentifier(e) ? e.text : ts.isPropertyAccessExpression(e) ? e.name.text : ''; };
      let ok = false, getter = false;
      if (ts.isPropertyAssignment(p) && p.initializer === n && PROPS.has(p.name.getText())) {
        let bad = false, topLevel = true;
        for (let a = p; a; a = a.parent) { if (ts.isCallExpression(a) && /mutate|mutateAsync|JSON|fetch|post/i.test(callName(a))) bad = true; if (ts.isFunctionLike(a)) topLevel = false; }
        if (!bad) { ok = true; getter = topLevel; }
      } else if (ts.isCallExpression(p) && /^(usePageMeta|setError|setMsg|setMessage|setNotice|setStatus|setFeedback|setInfo|setHint|setErr|fail)$/.test(callName(p))) ok = true;
      else if (ts.isNewExpression(p) && p.expression.getText() === 'Error') ok = true;
      else if (ts.isParameter(p) && p.initializer === n) ok = true;
      else if (ts.isBindingElement(p) && p.initializer === n) ok = true;
      if (ok) { all.add(n.text); if (getter) edits.push([p.getStart(sf), p.end, `get ${p.name.getText()}() { return tr(${JSON.stringify(n.text)}); }`]); else edits.push([n.getStart(sf), n.end, `tr(${JSON.stringify(n.text)})`]); }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (write && edits.length) {
    let out = src;
    edits.sort((a, b) => b[0] - a[0]);
    for (const [s, e, r] of edits) out = out.slice(0, s) + r + out.slice(e);
    if (!/import \{[^}]*\btr\b[^}]*\} from '@\/lib\/i18n'/.test(out)) out = `import { tr } from '@/lib/i18n';\n` + out;
    fs.writeFileSync(file, out);
  }
}
if (!write) fs.writeFileSync(path.join(__dirname, 'jsx-strings.json'), JSON.stringify([...all], null, 0));
console.log(all.size, 'strings');
