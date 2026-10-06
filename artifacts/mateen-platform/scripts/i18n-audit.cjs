// i18n audit: (1) every tr("…") key has an English entry; (2) no Arabic UI literal escapes tr/pick/fmt.
// Intentional canonical Arabic (religious text, normalisation tables, internal IDs, request bodies) is exempt when:
//  - inside a JSX element with lang="ar", className hadith-text or data-canonical, or
//  - on/after a line carrying an `i18n-canonical` comment (same line or line above), or
//  - in a file listed in CANONICAL_FILES.
// Usage: node scripts/i18n-audit.cjs [--list]   exits 1 on any finding.
const ts = require('../../../node_modules/typescript');
const fs = require('fs');
const path = require('path');
const AR = /[\u0600-\u06FF]/;
const root = path.join(__dirname, '../src');
const CANONICAL_FILES = ['lib/i18n-en.ts', 'lib/i18n.ts', 'lib/scholar-search.test.ts'];
const enSrc = fs.readFileSync(path.join(root, 'lib/i18n-en.ts'), 'utf8');
const enObj = JSON.parse(enSrc.slice(enSrc.indexOf('= {') + 2, enSrc.lastIndexOf('}') + 1));
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) { if (!p.includes('components/ui')) walk(p); } else if (/\.tsx?$/.test(f) && !/\.d\.ts$/.test(f)) files.push(p); } })(root);
const missing = [], leaks = [];
for (const file of files) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  if (CANONICAL_FILES.includes(rel)) continue;
  const src = fs.readFileSync(file, 'utf8');
  const lines = src.split('\n');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const lineOf = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line;
  const canonicalLine = (n) => { const l = lineOf(n); return /i18n-(canonical|keys)/.test(lines[l] || '') || /i18n-(canonical|keys)/.test(lines[l - 1] || ''); };
  const protectedEl = (n) => { for (let p = n.parent; p && !ts.isJsxElement(p); p = p.parent) if (ts.isJsxAttribute(p) && p.name.getText() === 'unit') return true; /* unit is a semantic ID */ if (n.parent && ts.isJsxAttribute(n.parent) && /^(aria-|title|alt|placeholder)/.test(n.parent.name.getText())) return canonicalLine(n); for (let p = n; p; p = p.parent) { if (ts.isJsxElement(p) || ts.isJsxSelfClosingElement(p)) { const at = (ts.isJsxElement(p) ? p.openingElement : p).attributes.getText(); if (/lang=["']ar["']|hadith-text|data-canonical/.test(at)) return true; } if (canonicalBlock(p)) return true; } return false; };
  const canonicalBlock = (p) => { const full = sf.getFullText().slice(p.getFullStart(), p.getStart(sf)); return /i18n-(canonical|keys)/.test(full); };
  const wrapped = (n) => { for (let p = n.parent, c = n; p; c = p, p = p.parent) { if (ts.isCallExpression(p)) { const e = p.expression; const name = ts.isIdentifier(e) ? e.text : ''; if (/^(tr|pick|fmt)$/.test(name)) return true; } if (ts.isTemplateExpression(p) || ts.isTemplateSpan(p) || ts.isParenthesizedExpression(p) || ts.isConditionalExpression(p) || ts.isBinaryExpression(p)) continue; return false; } return false; };
  const visit = (n) => {
    // Label tables are translated at render time, but still need dictionary coverage.
    if (ts.isVariableStatement(n) && /i18n-keys/.test(src.slice(n.getFullStart(), n.getStart(sf)))) {
      const checkKeys = (key) => {
        if (ts.isStringLiteral(key) && AR.test(key.text) && !(key.text in enObj)) {
          missing.push(`${rel}:${lineOf(key) + 1}  ${key.text}`);
        }
        ts.forEachChild(key, checkKeys);
      };
      checkKeys(n);
    }
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'tr' && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) {
      const k = n.arguments[0].text; if (!(k in enObj) && !(k.replace(/\s+/g, ' ').trim() in enObj)) missing.push(`${rel}:${lineOf(n) + 1}  ${k}`);
    }
    let text = null;
    if (ts.isJsxText(n)) text = n.text;
    else if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) text = n.text;
    else if (ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) text = n.text;
    if (text && AR.test(text)) {
      const node = ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n) ? n.parent.parent ?? n.parent : n;
      if (!ts.isJsxText(n) && wrapped(ts.isTemplateHead(n) ? n.parent : ts.isTemplateMiddle(n) || ts.isTemplateTail(n) ? n.parent.parent : n)) {}
      else if (protectedEl(n) || canonicalLine(n)) {}
      else if (ts.isImportDeclaration(n.parent) || ts.isLiteralTypeNode(n.parent)) {}
      else leaks.push(`${rel}:${lineOf(n) + 1}  ${text.replace(/\s+/g, ' ').trim().slice(0, 90)}`);
      void node;
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}
const list = process.argv.includes('--list');
console.log(`missing tr keys: ${missing.length}\nunwrapped Arabic UI literals: ${leaks.length}`);
if (list) { missing.forEach((m) => console.log('MISSING ' + m)); leaks.forEach((m) => console.log('LEAK ' + m)); }
process.exit(missing.length || leaks.length ? 1 : 0);
