// One-shot helper: wraps audit-reported Arabic literals in tr()/getters. Skips comparisons, types, request bodies and templates.
const ts = require('../../../node_modules/typescript');
const fs = require('fs'); const path = require('path');
const AR = /[\u0600-\u06FF]/; const root = path.join(__dirname, '../src');
const targets = {};
for (const l of fs.readFileSync(process.argv[2], 'utf8').split('\n')) { const m = l.match(/^LEAK (\S+?):(\d+)\s/); if (m) (targets[m[1]] ??= new Set()).add(+m[2]); }
const skipped = [];
for (const [rel, lines] of Object.entries(targets)) {
  const file = path.join(root, rel); const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, rel.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const edits = [];
  const line = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const inFn = (n) => { for (let p = n.parent; p; p = p.parent) if (ts.isFunctionLike(p)) return true; return false; };
  const bad = (n) => { for (let p = n.parent, c = n; p; c = p, p = p.parent) {
      if (ts.isTypeNode(p) || ts.isLiteralTypeNode?.(p)) return 'type';
      if (ts.isBinaryExpression(p) && /^(===|!==|==|!=)$/.test(p.operatorToken.getText())) return 'cmp';
      if (ts.isCaseClause(p)) return 'case';
      if (ts.isCallExpression(p)) { const e = p.expression; const nm = ts.isIdentifier(e) ? e.text : ts.isPropertyAccessExpression(e) ? e.name.text : ''; if (/^(mutate|mutateAsync|fetch|stringify|replace|split|includes|startsWith|endsWith|test|match|has|get|set|indexOf|normalizeArabic|tr|pick|fmt)$/.test(nm)) return 'call:' + nm; }
      if (ts.isRegularExpressionLiteral(p)) return 'regex';
      if (ts.isFunctionLike(p) || ts.isSourceFile(p)) return null; }
    return null; };
  const visit = (n) => {
    const isLit = ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n);
    if ((isLit || ts.isJsxText(n) || ts.isTemplateExpression(n)) && lines.has(line(n))) {
      const t = ts.isTemplateExpression(n) ? n.getText() : n.text;
      if (AR.test(t)) {
        if (ts.isTemplateExpression(n)) skipped.push(`${rel}:${line(n)} TEMPLATE ${t.slice(0, 100)}`);
        else if (ts.isJsxText(n)) { const s = t.replace(/\s+/g, ' ').trim(); if (s) edits.push([n.getStart(sf), n.end, `{tr(${JSON.stringify(s)})}`]); }
        else { const why = bad(n); const p = n.parent;
          if (why) skipped.push(`${rel}:${line(n)} ${why} ${t.slice(0, 60)}`);
          else if (ts.isJsxAttribute(p)) edits.push([n.getStart(sf), n.end, `{tr(${JSON.stringify(t)})}`]);
          else if (!inFn(n) && ts.isPropertyAssignment(p) && p.initializer === n) edits.push([p.getStart(sf), p.end, `get ${p.name.getText()}() { return tr(${JSON.stringify(t)}); }`]);
          else if (!inFn(n)) skipped.push(`${rel}:${line(n)} module ${t.slice(0, 60)}`);
          else edits.push([n.getStart(sf), n.end, `tr(${JSON.stringify(t)})`]); }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (edits.length) { let out = src; edits.sort((a, b) => b[0] - a[0]); for (const [s, e, r] of edits) out = out.slice(0, s) + r + out.slice(e);
    if (!/import \{[^}]*\btr\b[^}]*\} from '@\/lib\/i18n'|from '\.\/i18n'/.test(out)) out = (rel.startsWith('lib/') ? `import { tr } from './i18n';\n` : `import { tr } from '@/lib/i18n';\n`) + out;
    fs.writeFileSync(file, out); }
}
fs.writeFileSync('/tmp/skipped.txt', skipped.join('\n')); console.log('skipped', skipped.length);
