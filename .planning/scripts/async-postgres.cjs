// One-time AST migration; retained as a reviewable record of the mechanical edit.
const ts = require('../../node_modules/typescript/lib/typescript.js');
const fs = require('node:fs');
const path = require('node:path');
const root = process.cwd();
function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? files(path.join(dir, e.name)) : e.name.endsWith('.ts') ? [path.join(dir, e.name)] : []);
}
const roots = ['backend/src', 'backend/tests', 'backend/scripts'].flatMap(files);
const program = ts.createProgram(roots, { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, skipLibCheck: true, esModuleInterop: true });
const checker = program.getTypeChecker();
const sourceFiles = program.getSourceFiles().filter(s => roots.some(f => path.resolve(f) === path.resolve(s.fileName)) && !s.fileName.endsWith('postgres.ts'));
const callable = n => (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n)) && n.body;
const owner = n => { for (let p = n.parent; p; p = p.parent) if (callable(p)) return p; };
const changed = new Set();
const calls = [];
for (const sf of sourceFiles) {
  function visit(n) {
    if (ts.isCallExpression(n)) calls.push(n);
    ts.forEachChild(n, visit);
  }
  visit(sf);
}
const targets = new Map(calls.map(c => [c, checker.getResolvedSignature(c)?.declaration]));
const isDb = c => targets.get(c)?.getSourceFile().fileName.endsWith('/db/postgres.ts') ||
  targets.get(c)?.getSourceFile().fileName.endsWith('\\db\\postgres.ts');
function asyncArrayCall(c) {
  return ts.isPropertyAccessExpression(c.expression) && ['map','forEach','flatMap'].includes(c.expression.name.text) && c.arguments.some(a => changed.has(a));
}
let progress;
do {
  progress = false;
  for (const c of calls) {
    if (isDb(c) || changed.has(targets.get(c)) || asyncArrayCall(c)) {
      const fn = owner(c);
      if (fn && !changed.has(fn)) { changed.add(fn); progress = true; }
    }
  }
} while(progress);
let count = 0;
for (const sf of sourceFiles) {
  const edits = [];
  const add = (start, end, text) => edits.push({ start, end, text });
  for (const fn of changed) {
    if (fn.getSourceFile() !== sf) continue;
    if (!fn.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword)) {
      const pos = fn.modifiers?.length ? fn.modifiers[fn.modifiers.length - 1].end : fn.getStart(sf);
      add(pos, pos, fn.modifiers?.length ? ' async' : 'async ');
    }
    if (fn.type && !fn.type.getText(sf).startsWith('Promise<')) {
      add(fn.type.getStart(sf), fn.type.end, `Promise<${fn.type.getText(sf)}>`);
    }
  }
  for (const c of calls) {
    if (c.getSourceFile() !== sf) continue;
    if (asyncArrayCall(c)) {
      add(c.getStart(sf), c.getStart(sf), '(await Promise.all(');
      add(c.end, c.end, '))' + (c.expression.name.text === 'flatMap' ? '.flat()' : ''));
      if (c.expression.name.text !== 'map') add(c.expression.name.getStart(sf), c.expression.name.end, 'map');
    } else if ((isDb(c) || changed.has(targets.get(c))) && !ts.isAwaitExpression(c.parent)) {
      add(c.getStart(sf), c.getStart(sf), '(await ');
      add(c.end, c.end, ')');
    }
  }
  if (!edits.length) continue;
  let output = sf.text;
  for (const edit of edits.sort((a,b) => b.start - a.start || b.end - a.end)) output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  fs.writeFileSync(sf.fileName, output);
  count++;
}
console.log(`Migrated ${changed.size} database-dependent functions in ${count} files to await PostgreSQL.`);
