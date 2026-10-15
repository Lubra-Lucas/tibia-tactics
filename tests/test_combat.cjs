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

/* ---------- poderes das vocações (Fase 5) ---------- */
const poderBase = `semente(7);const G=novoJogo({humano:true,nome:'T',semVis:true});const p=G.jog[0];G.info=infoRodada(0);G.fase='prep';
  const colocar=(id,x,y)=>{const i=novoInst(G,id);p.tab[y][x]=i;return i;};`;

test('Knight Utamo Tempo shields only the targeted unit, only in the next combat', () => {
  const run=engine();
  const r=JSON.parse(run(`JSON.stringify((()=>{${poderBase}p.voc='knight';p.ouro=10;const a=colocar('minotaur_guard',3,1),b=colocar('hunter',4,1);
    const e=execCmd(G,p,{t:'poder',alvo:{onde:'tab',x:3,y:1}});
    const mk=()=>{const C=criarCombate(espDeJog(p,0),{un:[{d:U.wyvern,e:1,x:3,y:0,itens:[]}]},{seed:3,semSalto:true});const ua=C.un.find(u=>u.inst===a),ub=C.un.find(u=>u.inst===b);
      return {ua:ua.b.escudo?ua.b.escudo.v:0,hpa:ua.hpM,ub:ub.b.escudo?ub.b.escudo.v:0};};
    const antes=mk(),ouro=p.ouro;comecarCombate(G);const depois=mk();
    return {e,ouro,antes,depois,podEsc:p.podEsc,pct:PODN.escudo,custo:PODER.knight.custo};})())`));
  assert.equal(r.e,null);assert.equal(r.ouro,10-r.custo);
  assert.equal(r.antes.ua,Math.round(r.antes.hpa*r.pct));assert.equal(r.antes.ub,0);
  assert.equal(r.depois.ua,0);assert.equal(r.podEsc,0);          // a carga some depois da luta
});

test('Knight passive Linha de Frente gives armor and magic resistance only to the front row', () => {
  const run=engine();run(scene);
  const r=JSON.parse(run(`JSON.stringify((()=>{const mk=voc=>{const C=criarCombate({un:[spec('minotaur_guard',3,4),spec('minotaur_guard',3,5)],voc},{un:[spec('wyvern',3,0)]},{seed:3,semSalto:true});return C.un.slice(0,2).map(u=>[u.arm,u.rm]);};
    return {sem:mk(null),com:mk('knight'),n:PODN.frente};})())`));
  assert.deepEqual(r.com[0],[r.sem[0][0]+r.n,r.sem[0][1]+r.n]);assert.deepEqual(r.com[1],r.sem[1]);
});

test('Paladin passive Olho de Aguia adds damage only to range 3+ units', () => {
  const run=engine();run(scene);
  const r=JSON.parse(run(`JSON.stringify((()=>{const melee=Object.keys(U).find(k=>U[k].al<=1),rng=Object.keys(U).find(k=>U[k].al>=3);
    const C=criarCombate({un:[spec(melee,3,5),spec(rng,4,5)],voc:'paladin'},{un:[spec('wyvern',3,0)]},{seed:3,semSalto:true});return [C.un[0].dmgB,C.un[1].dmgB,PODN.olho];})())`));
  assert.equal(r[0],0);assert.equal(r[1],r[2]);
});

test('Sorcerer Runa SD hits the highest-HP enemy at 1.5 s for the tuned percent of max HP', () => {
  const run=engine();run(scene);
  const r=JSON.parse(run(`JSON.stringify((()=>{const C=criarCombate({un:[spec('hunter',3,7)],voc:'sorcerer',sd:true},{un:[spec('minotaur_guard',1,0),spec('minotaur_guard',2,0),spec('hunter',5,0)]},{seed:3,semSalto:true});
    const ev=C.ev.filter(e=>e.t===PODN.sdT).length,en=C.un.filter(u=>u.lado===1);en[2].hp=en[2].hpM;en[0].hp=en[0].hpM-10;en[1].hp=en[1].hpM-10;   // en[2] (Hunter) tem menos hp absoluto: escolho o de maior hp atual
    en[0].hp=1000000;en[0].hpM=1000000;en[1].hp=999999;en[1].hpM=999999;const h0=en.map(u=>u.hp);const e=C.ev.find(e=>e.t===PODN.sdT);C.t=PODN.sdT;e.f();
    return {ev,t:PODN.sdT,d:h0.map((h,i)=>h-en[i].hp),esp:Math.round(en[0].hpM*PODN.sd*fatorEl(en[0],'death',0)),pct:PODN.sd};})())`));
  assert.equal(r.ev,1);assert.equal(r.t,1500);assert.equal(r.d[0],r.esp);assert.equal(r.d[1],0);assert.equal(r.d[2],0);
  // sem a runa não há evento
  assert.equal(run(`criarCombate({un:[spec('hunter',3,7)],voc:'sorcerer',sd:false},{un:[spec('hunter',5,0)]},{seed:3}).ev.length`),0);
});

test('Sorcerer passive Fluxo Arcano adds starting mana up to the cap', () => {
  const run=engine();run(scene);
  const r=JSON.parse(run(`JSON.stringify((()=>{const id=Object.keys(U).find(k=>U[k].hab&&U[k].mana>40);const mk=voc=>{const C=criarCombate({un:[spec(id,3,5)],voc},{un:[spec('wyvern',3,0)]},{seed:3,semSalto:true});return [C.un[0].mana,C.un[0].manaM];};
    return {sem:mk(null),com:mk('sorcerer'),n:PODN.mana};})())`));
  assert.equal(r.com[0],Math.min(r.com[1],r.sem[0]+r.n));assert.ok(r.com[0]>r.sem[0]);
});

test('Druid passive Seiva scales healing received and the active gives XP', () => {
  const run=engine();run(scene);
  const r=JSON.parse(run(`JSON.stringify((()=>{const C=criarCombate({un:[spec('knight',3,5)],voc:'druid'},{un:[spec('knight',3,0)]},{seed:3,semSalto:true});const a=C.un[0],b=C.un[1];a.hp=1;b.hp=1;a.hpM=b.hpM=5000;
    const ca=curar(C,a,100,true),cb=curar(C,b,100,true);
    ${poderBase.replace('const p=G.jog[0]','const p=G.jog[0];')}p.voc='druid';p.ouro=5;p.nivel=3;p.xp=0;const e=execCmd(G,p,{t:'poder'});const xp=p.xp,ouro=p.ouro;
    p.podU=false;p.nivel=9;const e2=execCmd(G,p,{t:'poder'});
    return {ca,cb,e,xp,ouro,e2,mul:PODN.cura,gx:PODN.xp,custo:PODER.druid.custo};})())`));
  assert.equal(r.ca,Math.round(100*(1+r.mul)));assert.equal(r.cb,100);
  assert.equal(r.e,null);assert.equal(r.xp,r.gx);assert.equal(r.ouro,5-r.custo);assert.equal(r.e2,'Nível máximo');
});

test('Paladin Cacada freezes a shop card across rolls, discounts it and keeps the pool consistent', () => {
  const run=engine();
  const r=JSON.parse(run(`JSON.stringify((()=>{${poderBase}p.voc='paladin';p.ouro=20;p.nivel=5;rolarLoja(G,p);
    const tot=()=>LISTA_U.reduce((s,k)=>s+G.pool[k],0)+p.loja.filter(Boolean).length;const id=p.loja[2],c=U[id].c,t0=tot();const e=execCmd(G,p,{t:'poder',alvo:2});const ouroPoder=p.ouro;
    const preco=precoLoja(p,2);rolarLoja(G,p);const manteve=p.loja[2]===id,poolMesmo=tot()===t0;
    iniciarRodada(G);const manteveRodada=p.loja[2]===id;
    const o0=p.ouro;const ok=comprar(G,p,2);
    return {e,ouroPoder,c,preco,manteve,poolMesmo,manteveRodada,pago:o0-p.ouro,ok,cong:p.cong,vazio:p.loja[2]!==id};})())`));
  assert.equal(r.e,null);assert.equal(r.ouroPoder,19);assert.equal(r.preco,Math.max(1,r.c-1));
  assert.ok(r.manteve&&r.poolMesmo&&r.manteveRodada);assert.equal(r.pago,Math.max(1,r.c-1));assert.equal(r.cong,-1);
});

test('hero power: once per round, prep only, needs gold, reset on the next round', () => {
  const run=engine();
  const r=JSON.parse(run(`JSON.stringify((()=>{${poderBase}p.voc='sorcerer';p.ouro=3;
    const fora=(G.fase='combate',execCmd(G,p,{t:'poder'}));G.fase='prep';
    const a=execCmd(G,p,{t:'poder'}),b=execCmd(G,p,{t:'poder'});p.ouro=0;p.podU=false;const c=execCmd(G,p,{t:'poder'});
    p.ouro=9;p.podU=true;iniciarRodada(G);const reset=p.podU;
    return {fora,a,b,c,reset,runa:p.podRuna};})())`));
  assert.equal(r.fora,'Só na preparação');assert.equal(r.a,null);assert.equal(r.b,'Poder já usado nesta rodada');assert.equal(r.c,'Ouro insuficiente');
  assert.equal(r.reset,false);assert.equal(r.runa,true);
});

test('hero powers can be disabled (control group) and bots use them without errors', () => {
  const run=engine();
  const r=JSON.parse(run(`JSON.stringify((()=>{semente(11);const G=novoJogo({semVis:true,semPoderes:true});const p=G.jog[0];G.info=infoRodada(0);p.ouro=9;const e=execCmd(G,p,{t:'poder'});
    const esp=espDeJog(p,0).voc;
    semente(12);const G2=novoJogo({semVis:true});let n=0,usos=0;while(!G2.fim&&n++<12){comecarCombate(G2);fecharRodada(G2);if(!G2.fim)iniciarRodada(G2);G2.jog.forEach(q=>{if(q.podU)usos++;});}
    return {e,esp,usos};})())`));
  assert.equal(r.e,'Poderes desligados');assert.equal(r.esp,null);assert.ok(r.usos>0);
});
