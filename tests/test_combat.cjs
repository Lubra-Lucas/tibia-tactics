// Real headless engine tests; run with node --test tests/test_combat.cjs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const ids = ['minotaur_guard','ice_witch','demon_skeleton','hunter','dark_monk','bonelord','wyvern','grim_reaper'];
function engine() {
  const context = vm.createContext({window:{}});
  for (const file of ['tibia-assets/sprites15.js','tibia-assets/combate15.js']) vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);
  const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
  vm.runInContext(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1],context);
  return code => vm.runInContext(code,context);
}
const scene = `const spec=(id,x,y,e=1,itens=[])=>({d:U[id],e,x,y,itens});`;

test('53 cards include all eight approved costs, origins and classes', () => {
  const run=engine();
  assert.equal(run('LISTA_U.length'),53);
  const expected=[2,3,3,2,3,4,3,5];
  ids.forEach((id,i)=>{
    assert.equal(run(`U['${id}']?.c`),expected[i],id);
    assert.ok(run(`TRACOS[U['${id}'].o] && CLASSES[U['${id}'].k]`),id);
  });
});

test('all new sprites and corpses are available with four directions', () => {
  const run=engine();
  for(const id of ids) {
    const f=JSON.parse(run(`JSON.stringify(SPR.criaturas['${id}'])`));
    const file=path.join(root,f.src);
    assert.ok(fs.existsSync(file),`Missing sprite for ${id}`);
    const png=fs.readFileSync(file);
    assert.equal(png.readUInt32BE(20),f.h*4);
    assert.ok(png.readUInt32BE(16)>=f.w*(f.parado+f.andar));
    const corpse=run(`SPR.cadaveres[${f.cad}].src`);
    assert.ok(fs.existsSync(path.join(root,corpse)),`Missing corpse for ${id}`);
  }
});

test('new cards participate in the real weighted shop and shared pool', () => {
  const run=engine();
  run(`semente(19);G=novoJogo({humano:true});const p=G.jog[0];p.nivel=9;const seen=new Set();for(let i=0;i<600;i++){rolarLoja(G,p);p.loja.forEach(id=>seen.add(id));}`);
  ids.forEach(id=>assert.ok(run(`seen.has('${id}')`),id));
  assert.ok(run('Object.values(G.pool).every(n=>n>=0)'));
});

test('Ferida reduces healing, keeps the strongest application and expires', () => {
  const run=engine();run(scene+`const C=criarCombate({un:[spec('knight',3,4)]},{un:[spec('orc',3,3)]},{seed:1,semSalto:true});const u=C.un[0];u.hp=100;`);
  run(`aplicarDeb(C,u,{ferida:.4,dur:5000});`);
  assert.equal(run('curar(C,u,100)'),60);
  run('C.t=1000;aplicarDeb(C,u,{ferida:.2,dur:1000});');
  assert.equal(run('curar(C,u,100)'),60);
  run('C.t=5000;');assert.equal(run('curar(C,u,100)'),100);
});

test('Ferida also reduces life steal through the common healing path', () => {
  const run=engine();run(scene+`const C=criarCombate({un:[spec('knight',3,4)]},{un:[spec('orc',3,3)]},{seed:1,semSalto:true});const u=C.un[0],v=C.un[1];u.hp=100;u.roubo=.5;aplicarDeb(C,u,{ferida:.4,dur:5000});const damage=causar(C,u,v,100,'phys',{basico:true});`);
  assert.equal(run('u.hp-100'),run('Math.round(damage*.5*.6)'));
});

test('silence prevents spells while allowing attacks and preserving full mana', () => {
  const run=engine();run(scene+`const C=criarCombate({un:[spec('sorcerer',3,4)]},{un:[spec('orc',3,3)]},{seed:1,semSalto:true});const u=C.un[0],v=C.un[1];u.alvo=v;u.mana=u.manaM;aplicarDeb(C,u,{silencio:1,dur:2000});`);
  assert.equal(run('podeLancar(C,u,v)'),false);
  run('agir(C,u);');assert.equal(run('u.mana'),run('u.manaM'));
  assert.ok(run('u.nAt>0'));
  run('C.t=2000;u.livreEm=0;agir(C,u);');assert.equal(run('u.mana'),0);
});

test('Minotaur Guard forces nearby targets and releases them on death or expiry', () => {
  const run=engine();run(scene+`const C=criarCombate({un:[spec('minotaur_guard',3,4),spec('hunter',4,4)]},{un:[spec('hunter',4,3),spec('sorcerer',7,0)]},{seed:1,semSalto:true});const guard=C.un[0],carry=C.un[1],enemy=C.un[2],far=C.un[3];enemy.alvo=carry;acaoHab(C,guard,guard.hab,enemy);`);
  assert.equal(run('escolherAlvo(C,enemy).uid'),run('guard.uid'));
  run('agir(C,enemy);');assert.equal(run('enemy.alvo.uid'),run('guard.uid'));
  assert.equal(run("bv(far,'provocado')"),0);
  run('guard.vivo=false;');assert.notEqual(run('escolherAlvo(C,enemy).uid'),run('guard.uid'));
  run('guard.vivo=true;C.t=2500;');assert.equal(run("bv(enemy,'provocado')"),0);
});

test('Demon Skeleton specializes in magic defense rather than copying physical tank stats', () => {
  const run=engine();run(scene+`const C=criarCombate({un:[spec('demon_skeleton',3,4)]},{un:[spec('minotaur_guard',3,3)]},{seed:1,semSalto:true});const magic=C.un[0],physical=C.un[1];`);
  assert.ok(run('magic.rm>physical.rm'));
  assert.ok(run('magic.arm<physical.arm'));
  assert.ok(run("fatorEl(magic,'energy')<fatorEl(physical,'energy')"));
});

test('Grim Reaper prioritizes wounded targets and boosts damage without instant kill', () => {
  const run=engine();run(scene+`const C=criarCombate({un:[spec('grim_reaper',3,4)]},{un:[spec('hunter',2,3),spec('knight',4,3)]},{seed:1,semSalto:true,vis:true});const grim=C.un[0],healthy=C.un[1],weak=C.un[2];grim.alvo=healthy;weak.hpM=20000;weak.hp=5000;weak.rm=0;grim.mana=grim.manaM;agir(C,grim);`);
  assert.equal(run('grim.alvo.uid'),run('weak.uid'));
  run('C.t=200;while(C.ev.length&&C.ev[0].t<=C.t)C.ev.shift().f();');
  assert.equal(run('5000-weak.hp'),run('Math.round(grim.sk*grim.hab.m*grim.hab.finaliza.mult)'));
  assert.equal(run('weak.vivo'),true);
  assert.ok(run('C.fx.some(f=>f.id===E("fatal"))'));
});

test('Ice Witch, Dark Monk, Bonelord and Wyvern execute their actual control/poison abilities', () => {
  const run=engine();run(scene);
  for (const [id,effect] of [['ice_witch','lento'],['dark_monk','ferida'],['bonelord','silencio'],['wyvern','dot']]) {
    assert.ok(run(`(() => {const C=criarCombate({un:[spec('${id}',3,4)]},{un:[spec('knight',3,3)]},{seed:3,semSalto:true});const u=C.un[0],v=C.un[1];u.alvo=v;lancar(C,u,u.hab);for(let i=0;i<5;i++){C.t+=100;while(C.ev.length&&C.ev[0].t<=C.t)C.ev.shift().f();}return ${effect==='dot'?'v.dots.some(d=>d.el===\'earth\'&&d.n>0)':`bv(v,'${effect}')>0`};})()`),id);
  }
});

test('new roster survives star scaling and seeded host/guest serialization', () => {
  const run=engine();run(scene+`const ids=${JSON.stringify(ids)};`);
  for (const stars of [1,2,3]) {
    run(`const a${stars}={un:ids.map((id,i)=>spec(id,i,4,${stars}))},b${stars}={un:ids.slice().reverse().map((id,i)=>spec(id,i,3,${stars}))};const host${stars}=criarCombate(a${stars},b${stars},{seed:92}),guest${stars}=criarCombate(eqDes(eqSer(a${stars})),eqDes(eqSer(b${stars})),{seed:92});simular(host${stars});simular(guest${stars});`);
    const summarize=c=>`${c}.un.map(u=>[u.d.id,u.hp,u.mana,u.vivo,u.st.d,u.st.c])`;
    assert.equal(run(`JSON.stringify(${summarize('host'+stars)})`),run(`JSON.stringify(${summarize('guest'+stars)})`));
    assert.ok(run(`host${stars}.fim && host${stars}.un.every(u=>Number.isFinite(u.hp)&&Number.isFinite(u.st.d))`));
  }
});
