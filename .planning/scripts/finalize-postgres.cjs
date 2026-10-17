const fs = require('node:fs');
const path = require('node:path');
const ts = require('../../node_modules/typescript/lib/typescript.js');
function walk(dir) { return fs.readdirSync(dir, {withFileTypes:true}).flatMap(e => e.isDirectory() ? walk(path.join(dir,e.name)) : e.name.endsWith('.ts') ? [path.join(dir,e.name)] : []); }
for (const file of ['backend/src', 'backend/tests', 'backend/scripts'].flatMap(walk)) {
  if (file.includes('node_modules') || file.includes('dist')) continue;
  let text = fs.readFileSync(file,'utf8');
  const sf = ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);
  const edits = [];
  function visit(n) {
    if(ts.isPropertyAccessExpression(n) && ['catch','then','finally'].includes(n.name.text) && ts.isParenthesizedExpression(n.expression) && ts.isAwaitExpression(n.expression.expression)) {
      edits.push([n.expression.getStart(sf), n.expression.end, n.expression.expression.expression.getText(sf)]);
    }
    ts.forEachChild(n,visit);
  }
  visit(sf);
  for(const [start,end,replacement] of edits.sort((a,b)=>b[0]-a[0])) text=text.slice(0,start)+replacement+text.slice(end);
  text=text.replaceAll(' COLLATE NOCASE','').replaceAll('INSERT OR REPLACE INTO refresh_tokens','INSERT INTO refresh_tokens').replaceAll('? IS NULL','?::text IS NULL');
  text=text.replaceAll('base.walletAddress.toLowerCase() !== walletAddress.toLowerCase()', 'base.walletAddress !== walletAddress').replaceAll('pos.walletAddress.toLowerCase() !== walletAddress.toLowerCase()', 'pos.walletAddress !== walletAddress');
  fs.writeFileSync(file,text);
}
