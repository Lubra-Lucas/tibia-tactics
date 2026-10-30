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
  const run=engine();run(scene+`const C=criarCombate({un:[spec('grim_reaper',3,4)]},{un:[spec('hunter',2,3),spec('knight',3,3)]},{seed:1,semSalto:true,vis:true});const grim=C.un[0],healthy=C.un[1],weak=C.un[2];grim.alvo=healthy;weak.hpM=20000;weak.hp=5000;weak.rm=0;grim.mana=grim.manaM;agir(C,grim);`);
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

/* ---------- bênçãos (escolha 1 de 3) ---------- */
const bnBase = `semente(21);const G=novoJogo({humano:true,nome:'T',semVis:true});const p=G.jog[0];
  const ate=nome=>{let n=0;while(G.info.nome!==nome&&!G.fim&&n++<40){p.hp=100;rodadaAuto(G);}};`;

test('blessing is offered at 2-1 (Prata), 3-2 (Ouro) and 4-2 (Prismatica): 3 distinct options of the right tier, for every living player', () => {
  const run=engine();
  const r=JSON.parse(run(`JSON.stringify((()=>{${bnBase}const out=[];
    for(const nome of ['2-1','3-2','4-2']){p.hp=100;ate(nome);p.hp=100;
      out.push({nome,ob:p.ob&&{t:p.ob.t,op:p.ob.op.slice(),rr:p.ob.rr},tiers:p.ob?p.ob.op.map(id=>BEN[id].t):[],todos:G.jog.filter(q=>q.vivo).every(q=>q.humano?!!q.ob:!q.ob&&q.bn.length>=1)});
      comecarCombate(G);fecharRodada(G);if(!G.fim)iniciarRodada(G);}
    semente(5);const H=novoJogo({humano:true,nome:'T',semVis:true,semBencaos:true});let n=0;while(H.info.nome!=='2-2'&&n++<20)rodadaAuto(H);
    return {out,sem:!!H.jog[0].ob,bnSem:H.jog.map(q=>q.bn.length)};})())`));
  assert.equal(r.out.length,3);
  r.out.forEach((o,i)=>{assert.ok(o.ob,o.nome);assert.equal(o.ob.t,i);assert.equal(o.ob.op.length,3);assert.equal(new Set(o.ob.op).size,3);assert.ok(o.tiers.every(t=>t===i));assert.equal(o.ob.rr,1);assert.ok(o.todos);});
  assert.equal(r.sem,false);assert.ok(r.bnSem.every(n=>n===0),'control group has no blessings');
});

test('reroll is free once, replaces all 3 options, and cannot be used twice', () => {
  const run=engine();
  const r=JSON.parse(run(`JSON.stringify((()=>{${bnBase}ate('2-1');const a=p.ob.op.slice(),e1=execCmd(G,p,{t:'bencaoRr'}),b=p.ob.op.slice(),e2=execCmd(G,p,{t:'bencaoRr'}),c=p.ob.op.slice();
    return {a,b,c,e1,e2,rr:p.ob.rr};})())`));
  assert.equal(r.e1,null);assert.equal(r.e2,'Rerrolagem já usada');assert.equal(r.rr,0);
  assert.equal(new Set(r.b).size,3);assert.ok(r.b.every(id=>!r.a.includes(id)),'second set shares nothing with the first (pool of 6)');assert.deepEqual(r.b,r.c);
});

test('prep ending without a choice auto-picks option 0; a pick cannot be repeated and only works in prep', () => {
  const run=engine();
  const r=JSON.parse(run(`JSON.stringify((()=>{${bnBase}ate('2-1');const op0=p.ob.op[0];comecarCombate(G);const auto={ob:p.ob,bn:p.bn.slice(),op0};fecharRodada(G);
    semente(22);const G2=novoJogo({humano:true,nome:'T',semVis:true});const q=G2.jog[0];let n=0;while(G2.info.nome!=='2-1'&&n++<20)rodadaAuto(G2);
    const x=q.ob.op[1],e1=execCmd(G2,q,{t:'bencao',i:1}),bn1=q.bn.slice(),e2=execCmd(G2,q,{t:'bencao',i:0}),bn2=q.bn.slice();
    G2.fase='combate';q.ob={t:0,op:[1,2,3],rr:1};const e3=execCmd(G2,q,{t:'bencao',i:0});
    return {auto,x,e1,bn1,e2,bn2,e3};})())`));
  assert.equal(r.auto.ob,null);assert.deepEqual(r.auto.bn,[r.auto.op0]);
  assert.equal(r.e1,null);assert.deepEqual(r.bn1,[r.x]);assert.equal(r.e2,'Você não tem bênção para escolher');assert.deepEqual(r.bn2,[r.x]);
  assert.equal(r.e3,'Só na preparação');
});

test('economy, inventory and unit blessings apply on pick; units come from the shared pool and fall back to gold', () => {
  const run=engine();
  const r=JSON.parse(run(`JSON.stringify((()=>{${bnBase}ate('2-1');
    const dar=id=>{p.ob={t:BEN[id].t,op:[id,id===1?2:1,3],rr:1};return execCmd(G,p,{t:'bencao',i:0});};
    const poolTot=()=>LISTA_U.reduce((s,k)=>s+G.pool[k],0),cnt=()=>todos(p).length;
    p.ouro=10;const eco=[dar(1),p.ouro];
    p.itens=[];const inv=[dar(2),p.itens.length,p.itens.every(ehComp)];
    p.ouro=10;const t0=poolTot(),n0=cnt();const dr=[dar(4),poolTot()-t0,cnt()-n0,p.ouro,todos(p).filter(L=>L.onde==='banco').every(L=>U[L.inst.id].c===2)];
    LISTA_U.filter(k=>U[k].c===4).forEach(k=>{G.pool[k]=0;});p.ouro=0;const t1=poolTot(),n1=cnt();const vazio=[dar(12),poolTot()-t1,cnt()-n1,p.ouro];
    LISTA_U.filter(k=>U[k].c===5).forEach(k=>{G.pool[k]=Math.max(G.pool[k],2);});
    const um=LISTA_U.find(k=>U[k].c===1);for(let i=0;i<p.banco.length;i++)if(!p.banco[i])p.banco[i]=novoInst(G,LISTA_U.filter(k=>U[k].c===1)[i%3]);
    p.ouro=0;p.itens=[];const t3=poolTot();const cheio=[dar(13),poolTot()-t3,p.ouro,p.itens.length];
    p.itens=[];p.ouro=0;const ar=[dar(17),p.itens.length,p.itens.every(ehCompleto)];
    return {eco,inv,dr,vazio,cheio,ar,recr:BN.recr};})())`));
  assert.deepEqual(r.eco,[null,18]);
  assert.deepEqual(r.inv,[null,2,true]);
  assert.equal(r.dr[0],null);assert.equal(r.dr[1],-1);assert.equal(r.dr[2],1);assert.equal(r.dr[3],10+r.recr);assert.equal(r.dr[4],true);
  assert.deepEqual(r.vazio,[null,0,0,4]);
  assert.equal(r.cheio[0],null);assert.equal(r.cheio[1],0);assert.equal(r.cheio[2],5);assert.equal(r.cheio[3],1);
  assert.deepEqual(r.ar,[null,2,true]);
});

test('Pele Grossa and Maos Rapidas change the combat through the team spec and survive serialization', () => {
  const run=engine();run(scene);
  const r=JSON.parse(run(`JSON.stringify((()=>{const mk=bn=>{const C=criarCombate({un:[spec('knight',3,5),spec('hunter',4,5)],bn},{un:[spec('wyvern',3,0)]},{seed:3,semSalto:true});return C.un.slice(0,2).map(u=>[u.hpM,u.hp,u.asB]);};
    const s0=mk([]),s5=mk([5]),s6=mk([6]);
    const m=metaSer({un:[],voc:null,sd:false,bn:[5,6]}),m2=metaSer({un:[],bn:[]}),d=eqDes([],{v:0,sd:0,bn:[5,'x',99,6,1.5]});
    const C2=criarCombate(eqDes([{id:'knight',e:1,x:3,y:5,it:[]}],m),{un:[]},{seed:1,semSalto:true});
    return {s0,s5,s6,mb:m.bn,m2:m2.bn,db:d.bn,h:C2.un[0].hpM,h0:s0[0][0],pele:BN.pele,mao:BN.mao};})())`));
  r.s0.forEach((u,i)=>{assert.equal(r.s5[i][0],Math.round(u[0]*(1+r.pele)));assert.equal(r.s5[i][1],r.s5[i][0]);assert.equal(r.s6[i][2],u[2]+r.mao);assert.equal(r.s6[i][0],u[0]);});
  assert.deepEqual(r.db,[5,6]);assert.equal(r.m2,0);assert.equal(r.h,Math.round(r.h0*(1+r.pele)),'bn travels in the fight spec');
});

test('Ascensao, Furia de Batalha and Sangue de Dragao act over time; Ultimo Suspiro explodes only the first death per side', () => {
  const run=engine();run(scene);
  const r=JSON.parse(run(`JSON.stringify((()=>{const C=criarCombate({un:[spec('knight',3,5)],bn:[15,10,18]},{un:[spec('wyvern',3,0)]},{seed:3,semSalto:true});const u=C.un[0];
    const d0=u.dmgB;
    const run1=t=>{while(C.ev.length&&C.ev[0].t<=t){C.t=C.ev[0].t;C.ev.shift().f();}};
    run1(2000);const d2=u.dmgB;run1(4000);const d4=u.dmgB;run1(BN.ascT-1);const d14=u.dmgB;run1(BN.ascT);const d15=u.dmgB;run1(60000);const dFim=u.dmgB;
    const D=criarCombate({un:[spec('knight',3,5),spec('hunter',4,5),spec('hunter',2,5)],bn:[11]},{un:[spec('minotaur_guard',4,4),spec('minotaur_guard',5,0)]},{seed:3,semSalto:true});   // (4,4) é vizinho hexagonal de (4,5)
    const [k,h1,h2]=D.un,inim=D.un.filter(x=>x.lado===1);inim.forEach(x=>{x.hp=x.hpM=100000;});const adj=inim[0],longe=inim[1];
    h1.hp=0;h1.hpM=2000;morrer(D,h1,null);const a1=[100000-adj.hp,100000-longe.hp];const dano1=h1.hpM*BN.sus;
    h2.hp=0;morrer(D,h2,null);const a2=[100000-adj.hp];
    return {d0,d2,d4,d14,d15,dFim,a1,a2,dano1,ascT:BN.ascT,furiaT:BN.furiaT,furia:BN.furia,asc:BN.asc,regen:BN.reg,regU:u.regen,sus:D.sus};})())`));
  assert.equal(r.regU,r.regen);assert.ok(Math.abs(r.d2-(r.d0+r.furia))<1e-9);assert.ok(Math.abs(r.d4-(r.d0+2*r.furia))<1e-9);
  assert.ok(Math.abs(r.d14-(r.d0+Math.floor((r.ascT-1)/r.furiaT)*r.furia))<1e-9,'no ascensao before its time');
  assert.ok(Math.abs(r.d15-(r.d0+Math.floor(r.ascT/r.furiaT)*r.furia+r.asc))<1e-9,'ascensao lands at its time');
  assert.ok(Math.abs(r.dFim-(r.d0+10*r.furia+r.asc))<1e-9,'furia capped at 10 stacks, ascensao once');
  assert.ok(r.a1[0]>0&&r.a1[1]===0,'adjacent enemy hurt, distant one not');assert.ok(r.a1[0]<=r.dano1);assert.equal(r.a2[0],r.a1[0],'second death does not explode');
});

test('Exercito Maior raises the board limit by one (move command, auto placement and bot placement)', () => {
  const run=engine();
  const r=JSON.parse(run(`JSON.stringify((()=>{${poderBase}p.nivel=3;
    for(let i=0;i<5;i++)p.banco[i]=novoInst(G,'hunter');
    const mv=i=>execCmd(G,p,{t:'mover',de:{onde:'banco',i},para:{onde:'tab',x:i,y:0}});
    const a=[mv(0),mv(1),mv(2),mv(3)],antes=[contarTab(p),limUn(p)];
    p.ob={t:2,op:[14,15,16],rr:1};const e=execCmd(G,p,{t:'bencao',i:0});
    const b=[mv(3),mv(4)],depois=[contarTab(p),limUn(p)];
    const q=G.jog[1];q.nivel=3;q.bn=[14];for(let i=0;i<6;i++)q.banco[i]=novoInst(G,'hunter');autoPosicionar(q);const auto=contarTab(q);posicionarBot(q);const bot=contarTab(q);
    return {a,antes,e,b,depois,auto,bot};})())`));
  assert.equal(r.a[3],'Limite de unidades do nível atingido');assert.deepEqual(r.antes,[3,3]);
  assert.equal(r.e,null);assert.equal(r.b[0],null);assert.equal(r.b[1],'Limite de unidades do nível atingido');assert.deepEqual(r.depois,[4,4]);
  assert.equal(r.auto,4);assert.equal(r.bot,4);
});

test('online-shape validation: bad indexes are rejected; Juros Compostos and Banco de Thais change the income; bots pick by themselves', () => {
  const run=engine();
  const r=JSON.parse(run(`JSON.stringify((()=>{${bnBase}ate('2-1');const bad=[3,-1,'0',1.5,null,undefined,{}].map(i=>execCmd(G,p,{t:'bencao',i})),still=!!p.ob;
    const bots=G.jog.filter(q=>!q.humano).every(q=>q.ob===null&&q.bn.length===1);
    const r1=execCmd(G,p,{t:'bencao',i:0});
    p.bn=[7,8];p.ouro=100;G.rodada++;const ouroAntes=p.ouro;iniciarRodada(G);
    return {bad,still,r1,renda:p.renda,ganho:p.ouro-ouroAntes,jm:jurosMax(p),bots};})())`));
  assert.ok(r.bad.every(x=>x==='x'));assert.ok(r.still);assert.equal(r.r1,null);assert.ok(r.bots);
  assert.equal(r.renda.juros,7);assert.equal(r.renda.ben,2);assert.equal(r.renda.total,5+7+r.renda.seq+2);assert.equal(r.jm,7);assert.equal(r.ganho,r.renda.total+0);
});

/* ---------- runas (consumíveis da loja) ---------- */
const runaBase = `semente(31);const G=novoJogo({humano:true,nome:'T',semVis:true});const p=G.jog[0];G.info=infoRodada(3);G.fase='prep';
  const poolTot=()=>LISTA_U.reduce((s,k)=>s+G.pool[k],0),conta=()=>poolTot()+G.jog.reduce((s,q)=>s+q.loja.filter(Boolean).length+todos(q).reduce((a,L)=>a+Math.pow(3,L.inst.e-1),0),0);
  const colocar=(id,x,y)=>{const i=novoInst(G,id);p.tab[y][x]=i;return i;};`;
const passos = `const run1=(C,t)=>{while(C.ev.length&&C.ev[0].t<=t){C.t=C.ev[0].t;C.ev.shift().f();}};`;

test('rune slot never shows in stage 1, shows at ~25% from stage 2, at most one per shop, outside the pool, deterministic with the seed', () => {
  const run=engine();
  const r=JSON.parse(run(`JSON.stringify((()=>{${runaBase}const base=conta();
    G.info=infoRodada(0);let e1=0;for(let i=0;i<300;i++){rolarLoja(G,p);if(p.rl)e1++;}
    G.info=infoRodada(3);let n=0,ruim=0,ks=new Set();
    for(let i=0;i<2000;i++){rolarLoja(G,p);const nc=p.loja.filter(Boolean).length;if(p.rl){n++;ks.add(p.rl.k);if(p.loja[p.rl.i]!==null||nc!==4)ruim++;}else if(nc!==5)ruim++;}
    const inv=conta()-base;
    const seq=sd=>{semente(sd);const X=novoJogo({humano:true,semVis:true});X.info=infoRodada(5);const o=[];for(let i=0;i<30;i++){rolarLoja(X,X.jog[0]);o.push(JSON.stringify([X.jog[0].loja,X.jog[0].rl]));}return o.join('|');};
    const off=novoJogo({humano:true,semVis:true,semRunas:true});off.info=infoRodada(5);let eo=0;for(let i=0;i<200;i++){rolarLoja(off,off.jog[0]);if(off.jog[0].rl)eo++;}
    return {e1,n,ruim,nk:ks.size,inv,igual:seq(77)===seq(77),difere:seq(77)!==seq(78),eo};})())`));
  assert.equal(r.e1,0,'no runes in stage 1');
  assert.ok(r.n/2000>.21&&r.n/2000<.29,'about 25% of shops: '+r.n);
  assert.equal(r.ruim,0,'exactly one slot is the rune (empty in loja), the other four are units');
  assert.equal(r.nk,8,'all eight runes show up');
  assert.equal(r.inv,0,'pool + shops + boards stay constant: runes are not in the pool and nothing leaks');
  assert.ok(r.igual,'same seed, same shops');assert.ok(r.difere);assert.equal(r.eo,0,'semRunas turns them off');
});

test('Paladin frozen card is never replaced by a rune and a rune slot cannot be frozen', () => {
  const run=engine();
  const r=JSON.parse(run(`JSON.stringify((()=>{${runaBase}p.voc='paladin';rolarLoja(G,p);let t=0;while(!p.loja[2]&&t++<20)rolarLoja(G,p);const id=p.loja[2];
    const e=execCmd(G,p,{t:'poder',alvo:2});let ok=0,mesmo=0,rn=0;
    for(let i=0;i<400;i++){rolarLoja(G,p);if(p.loja[2]===id)mesmo++;if(p.rl){rn++;if(p.rl.i!==2)ok++;}}
    p.podU=false;p.ouro=10;let e2=null;for(let i=0;i<100&&!p.rl;i++)rolarLoja(G,p);if(p.rl)e2=execCmd(G,p,{t:'poder',alvo:p.rl.i});
    return {e,mesmo,rn,ok,e2,cong:p.cong};})())`));
  assert.equal(r.e,null);assert.equal(r.mesmo,400,'frozen card survives rolls');assert.ok(r.rn>40&&r.rn===r.ok,'rune only in the other four slots');
  assert.equal(r.e2,'Runas não podem ser congeladas');
});

test('buying a rune costs gold and fills the bag (max 3 counting armed); bad inputs are rejected', () => {
  const run=engine();
  const r=JSON.parse(run(`JSON.stringify((()=>{${runaBase}const dar=(i,k)=>{p.rl={i,k};};
    p.ouro=10;dar(1,2);const a=[execCmd(G,p,{t:'comprarRuna',i:1}),p.ouro,p.mr.slice(),p.rl,RUNA[2].custo];
    const b=execCmd(G,p,{t:'comprarRuna',i:1});
    dar(0,7);const c=[execCmd(G,p,{t:'comprarRuna',i:0}),p.ouro];dar(3,1);const d=[execCmd(G,p,{t:'comprarRuna',i:3}),p.ouro,p.mr.slice()];
    const ouroAntes=p.ouro;dar(2,3);const cheia=[execCmd(G,p,{t:'comprarRuna',i:2}),p.ouro===ouroAntes,p.mr.length,!!p.rl];
    p.mr=[7];p.ra=[{k:1,u:0},{k:2,u:0}];dar(2,3);const comArm=[execCmd(G,p,{t:'comprarRuna',i:2}),p.mr.length+p.ra.length];
    p.mr=[];p.ra=[];p.ouro=0;dar(0,3);const pobre=[execCmd(G,p,{t:'comprarRuna',i:0}),p.ouro,p.mr.length];
    p.ouro=10;dar(0,3);const ruins=[-1,5,'0',1.5,null,undefined,{},[],2].map(i=>execCmd(G,p,{t:'comprarRuna',i}));
    return {a,b,c,d,cheia,comArm,pobre,ruins,ouro:p.ouro,mr:p.mr.length,custos:RUNA.slice(1).map(R=>R.custo)};})())`));
  const [c1,c2,c3,c7]=[r.custos[0],r.custos[1],r.custos[2],r.custos[6]];
  assert.deepEqual(r.a,[null,10-c2,[2],null,c2]);assert.equal(r.b,'x');
  assert.deepEqual(r.c,[null,10-c2-c7]);assert.deepEqual(r.d,[null,10-c2-c7-c1,[2,7,1]]);
  assert.deepEqual(r.cheia,['Mochila de runas cheia',true,3,true],'refused when the bag is full, gold untouched, rune stays in the shop');
  assert.deepEqual(r.comArm,['Mochila de runas cheia',3],'armed runes occupy bag slots');
  assert.deepEqual(r.pobre,['Ouro insuficiente',0,0]);
  assert.ok(r.ruins.every(x=>x==='x'));assert.equal(r.ouro,10);assert.equal(r.mr,0);
});

test('arming: prep only, max 2 per combat, targets validated, disarm works, disarm keeps the bag size', () => {
  const run=engine();
  const r=JSON.parse(run(`JSON.stringify((()=>{${runaBase}const k1=colocar('knight',3,0),h1=novoInst(G,'hunter');p.banco[0]=h1;
    p.mr=[1,2,6];
    const semAlvo=execCmd(G,p,{t:'armar',i:0});
    const alvoVazio=execCmd(G,p,{t:'armar',i:0,un:{onde:'tab',x:7,y:3}});
    const lixo=[{t:'armar'},{t:'armar',i:'0'},{t:'armar',i:-1},{t:'armar',i:3},{t:'armar',i:1.5},{t:'armar',i:0,un:{onde:'xx'}},{t:'armar',i:0,un:null}].map(c=>execCmd(G,p,c));
    const ok1=execCmd(G,p,{t:'armar',i:0,un:{onde:'tab',x:3,y:0}});
    const ok2=execCmd(G,p,{t:'armar',i:0});
    const terceira=execCmd(G,p,{t:'armar',i:0,un:{onde:'banco',i:0}});
    const estado1={ra:p.ra.map(a=>[a.k,a.u===k1.uid?'knight':a.u]),mr:p.mr.slice()};
    const d0=execCmd(G,p,{t:'desarmar',i:5}),d1=execCmd(G,p,{t:'desarmar',i:0});
    const estado2={ra:p.ra.length,mr:p.mr.slice()};
    const ok3=execCmd(G,p,{t:'armar',i:p.mr.indexOf(6),un:{onde:'banco',i:0}});
    const total=p.mr.length+p.ra.length;
    G.fase='combate';const e1=execCmd(G,p,{t:'armar',i:0}),e2=execCmd(G,p,{t:'desarmar',i:0});
    return {semAlvo,alvoVazio,lixo,ok1,ok2,terceira,estado1,d0,d1,estado2,ok3,e1,e2,total};})())`));
  assert.equal(r.semAlvo,'x');assert.equal(r.alvoVazio,'x');assert.ok(r.lixo.every(x=>x==='x'),JSON.stringify(r.lixo));
  assert.equal(r.ok1,null);assert.equal(r.ok2,null);assert.equal(r.terceira,'No máximo 2 runas armadas por luta');
  assert.deepEqual(r.estado1,{ra:[[1,'knight'],[2,0]],mr:[6]});
  assert.equal(r.d0,'x');assert.equal(r.d1,null);assert.deepEqual(r.estado2,{ra:1,mr:[6,1]});
  assert.equal(r.ok3,null);assert.equal(r.e1,'Só na preparação');assert.equal(r.e2,'Só na preparação');assert.equal(r.total,3);
});

test('UH: when the unit drops below 40% it heals 40% of max HP, once', () => {
  const run=engine();run(scene+passos);
  const r=JSON.parse(run(`JSON.stringify((()=>{const C=criarCombate({un:[Object.assign(spec('knight',3,5),{ru:[1]}),spec('hunter',4,5)]},{un:[spec('wyvern',3,0)]},{seed:3,semSalto:true});const u=C.un[0],o=C.un[1];
    const hm=u.hpM;u.hp=Math.ceil(hm*RN.uh.lim);const a=u.hp;causar(C,null,u,1,'death',{magia:true,sem:true});const b=u.hp;
    const curou=b-(a-1);
    u.hp=Math.ceil(hm*.3);const c=u.hp;causar(C,null,u,1,'death',{magia:true,sem:true});const d=u.hp;
    o.hp=Math.ceil(o.hpM*.3);const e=o.hp;causar(C,null,o,1,'death',{magia:true,sem:true});
    return {a,b,curou,esperado:Math.round(hm*RN.uh.cura),d,c,semRuna:o.hp===e-1,flag:u.uh,passou:a-1<hm*RN.uh.lim};})())`));
  assert.ok(r.passou);assert.equal(r.curou,r.esperado);assert.equal(r.d,r.c-1,'one use only');assert.ok(r.semRuna,'units without the rune do not heal');assert.equal(r.flag,false);
});

test('SD rune picks the highest current HP enemy at 2 s for 12% of its max HP; nothing before', () => {
  const run=engine();run(scene+passos);
  const r=JSON.parse(run(`JSON.stringify((()=>{const C=criarCombate({un:[spec('knight',3,5)],ru:[2],re:3},{un:[spec('wyvern',3,0),spec('minotaur_guard',4,0),spec('hunter',2,0)]},{seed:3,semSalto:true});
    const [k,w,m,h]=C.un;m.hp=m.hpM*3;const hp0=C.un.map(u=>u.hp);run1(C,RN.sd.t-100);const antes=C.un.map(u=>u.hp);run1(C,RN.sd.t);
    const dm=m.hp-hp0[2],esperado=-Math.max(1,Math.round(m.hpM*RN.sd.p*fatorEl(m,'death',0)));
    return {antes:antes.every((v,i)=>v===hp0[i]),dm,esperado,outros:[w.hp===hp0[1],h.hp===hp0[3],k.hp===hp0[0]]};})())`));
  assert.ok(r.antes,'no damage before the cast time');assert.equal(r.dm,r.esperado);assert.ok(r.outros.every(Boolean));
});

test('Magic Wall makes the unit immune at the start only; Haste speeds attack and movement for a while only', () => {
  const run=engine();run(scene);
  const r=JSON.parse(run(`JSON.stringify((()=>{const C=criarCombate({un:[Object.assign(spec('knight',3,5),{ru:[6,7]}),spec('hunter',4,5)]},{un:[spec('wyvern',3,0)]},{seed:3,semSalto:true});const u=C.un[0];
    const asH=asEff(u),mvH=movEff(u);
    const hit=t=>{C.t=t;const h=u.hp;causar(C,null,u,500,'death',{magia:true,sem:true});return h-u.hp;};
    const out=[hit(0),hit(RN.mw.dur-100),hit(RN.mw.dur)>0];
    C.t=RN.hs.dur-100;const asA=asEff(u),mvA=movEff(u);C.t=RN.hs.dur;const asD=asEff(u),mvD=movEff(u);
    return {out,ratioAs:asH/(u.as*(1+u.asB)),ratioMv:mvH/u.mov,asA:asA>asH-1e-9,mvA:mvA>mvH-1e-9,asD:asD/(u.as*(1+u.asB)),mvD:mvD/u.mov,ace:RN.hs.ace};})())`));
  assert.deepEqual(r.out,[0,0,true]);
  assert.ok(Math.abs(r.ratioAs-(1+r.ace))<1e-9);assert.ok(Math.abs(r.ratioMv-(1+r.ace))<1e-9);assert.ok(r.asA&&r.mvA);
  assert.ok(Math.abs(r.asD-1)<1e-9&&Math.abs(r.mvD-1)<1e-9,'haste is over');
});

test('Paralyze stuns the highest-attack enemy; Avalanche slows; the fire and energy runes hurt the densest cluster and scale with the stage', () => {
  const run=engine();run(scene+passos);
  const r=JSON.parse(run(`JSON.stringify((()=>{
    const mk=(ru,est)=>criarCombate({un:[spec('knight',3,5)],ru:[ru],re:est},{un:[spec('wyvern',0,0),spec('minotaur_guard',4,1),spec('hunter',5,1),spec('orc',4,2),spec('orc',5,2)]},{seed:3,semSalto:true});
    const P=mk(5,2);const maior=P.un.filter(u=>u.lado===1).sort((a,b)=>b.atk-a.atk)[0];run1(P,RN.par.t-100);const s0=maior.stunAte;run1(P,RN.par.t);const s1=maior.stunAte;
    const dano=(k,est,t)=>{const C=mk(k,est);const ini=C.un.filter(u=>u.lado===1),hp0=ini.map(u=>u.hp);run1(C,t);return {C,ini,d:ini.map((u,i)=>hp0[i]-u.hp)};};
    const f2=dano(3,2,RN.gfb.t),f5=dano(3,5,RN.gfb.t),fa=dano(3,2,RN.gfb.t-100);
    const av=dano(4,2,RN.ava.t);const lento=av.ini.map(u=>bv(u,'lento'));av.C.t=RN.ava.t+RN.ava.dur-100;const l1=av.ini.map(u=>bv(u,'lento'));av.C.t=RN.ava.t+RN.ava.dur+100;const l2=av.ini.map(u=>bv(u,'lento'));
    const eb=mk(8,2);const ini=eb.un.filter(u=>u.lado===1),hp0=ini.map(u=>u.hp),T=RN.eb.t,marca=[];[T-100,T,T+1000,T+2000,T+3000,T+4000,T+6000].forEach(t=>{run1(eb,t);marca.push(ini.reduce((s,u,i)=>s+(hp0[i]-u.hp),0));});
    return {parAlvo:RN.par.t+RN.par.stun,lentoV:RN.ava.lento,atk:[s0,s1],f2d:f2.d,f5d:f5.d,fa:fa.d,lento,l1,l2,marca,ticks:RN.eb.n};})())`));
  assert.equal(r.atk[0],0);assert.equal(r.atk[1],r.parAlvo);
  const s2=r.f2d.reduce((a,b)=>a+b,0),s5=r.f5d.reduce((a,b)=>a+b,0);
  assert.ok(s2>0,'fireball hurt someone');assert.equal(r.fa.reduce((a,b)=>a+b,0),0,'nothing before the cast time');
  assert.ok(r.f2d.some(x=>x===0),'it does not hit everyone (radius 1)');assert.ok(s5>s2*1.5,'stage scaling: stage 5 hits harder than stage 2 ('+s5+' vs '+s2+')');
  assert.ok(r.lento.some(v=>v===r.lentoV),'avalanche slows the enemies it hits');assert.ok(r.l1.some(v=>v===r.lentoV)&&r.l2.every(v=>v===0),'the slow lasts its duration from the cast');
  assert.deepEqual([r.marca[0],r.marca[1]>0],[0,true],'energy bomb starts at its time');
  assert.ok(r.marca[2]>r.marca[1]&&r.marca[3]>r.marca[2]&&r.marca[4]>r.marca[3],'one tick per second');assert.equal(r.ticks,4);assert.equal(r.marca[5],r.marca[4],'only 4 ticks');assert.equal(r.marca[6],r.marca[5]);
});

test('runes are spent in exactly one combat; a targeted rune whose unit is not on the board comes back to the bag; the spec carries them', () => {
  const run=engine();
  const r=JSON.parse(run(`JSON.stringify((()=>{${runaBase}const a=colocar('knight',3,0),b=colocar('hunter',4,0),c=novoInst(G,'orc');p.banco[0]=c;p.nivel=3;
    p.mr=[1,6,2];execCmd(G,p,{t:'armar',i:0,un:{onde:'tab',x:3,y:0}});execCmd(G,p,{t:'armar',i:0,un:{onde:'banco',i:0}});
    const antes={ra:p.ra.length,mr:p.mr.slice()};
    const sp=espDeJog(p,0,3),sp0=espDeJog(p,0),ser=eqSer(sp),meta=metaSer(sp);
    const des=eqDes(ser,meta);
    G.info=infoRodada(3);G.fase='prep';comecarCombate(G);
    const dep={ra:p.ra.length,mr:p.mr.slice()};fecharRodada(G);
    return {antes,knight:sp.un.filter(s=>s.ru).map(s=>[s.d.id,s.ru]),pre:sp0.un.filter(s=>s.ru).length+sp0.ru.length,serRu:ser.filter(s=>s.ru).map(s=>s.id+':'+s.ru),desRu:des.un.filter(s=>s.ru.length).map(s=>s.d.id+':'+s.ru),dep};})())`));
  assert.deepEqual(r.antes,{ra:2,mr:[2]});
  assert.deepEqual(r.knight,[['knight',[1]]],'only the rune whose unit is on the board enters the spec');
  assert.equal(r.pre,0,'previews carry no runes');assert.deepEqual(r.serRu,['knight:1']);assert.deepEqual(r.desRu,['knight:1']);
  assert.deepEqual(r.dep,{ra:0,mr:[2,6]},'armed runes are consumed; the one whose unit sat on the bench returns to the bag');
});

test('team spec: untargeted runes ride in meta (ru/re), garbage is filtered, and host and guest simulate the same fight', () => {
  const run=engine();run(scene);
  const r=JSON.parse(run(`JSON.stringify((()=>{
    const eq={un:[Object.assign(spec('knight',3,5),{ru:[1,6]}),spec('hunter',4,5)],ru:[2,3],re:4,voc:null,bn:[]};
    const ser=JSON.parse(JSON.stringify(eqSer(eq))),meta=JSON.parse(JSON.stringify(metaSer(eq)));
    const sujo=eqDes([{id:'knight',e:1,x:3,y:5,it:[],es:0,ru:[1,2,99,'x',6,6,1,1.5]}],{v:0,sd:0,bn:0,ru:[2,1,3,99,'z',null,2,2],re:'x'});
    const E2=[spec('wyvern',3,0),spec('minotaur_guard',4,0)];
    const A=criarCombate(eq,{un:E2},{seed:5,semSalto:true}),B=criarCombate(eqDes(ser,meta),{un:E2},{seed:5,semSalto:true});simular(A);simular(B);
    const C0=criarCombate({un:[spec('knight',3,5),spec('hunter',4,5)]},{un:E2},{seed:5,semSalto:true});simular(C0);
    return {ser:ser.filter(s=>s.ru).map(s=>s.ru),meta,sujo:{u:sujo.un[0].ru,t:sujo.ru,re:sujo.re},igual:[A.t,A.venc,A.un.map(u=>u.hp).join()].join()===[B.t,B.venc,B.un.map(u=>u.hp).join()].join(),difere:A.un.map(u=>u.hp).join()!==C0.un.map(u=>u.hp).join()};})())`));
  assert.deepEqual(r.ser,[[1,6]]);assert.deepEqual(r.meta.ru,[2,3]);assert.equal(r.meta.re,4);
  assert.deepEqual(r.sujo.u,[1,6],'only valid unit runes, at most the armed limit');
  assert.deepEqual(r.sujo.t,[2,3],'only untargeted runes in the team list');assert.equal(r.sujo.re,0);
  assert.ok(r.igual,'deserialised spec reproduces the same fight');assert.ok(r.difere,'runes change the fight');
});

test('bots buy and arm runes within the rules, whole games finish, and the control group (semRunas) has none', () => {
  const run=engine();
  const r=JSON.parse(run(`JSON.stringify((()=>{semente(12);const G=novoJogo({semVis:true});let comp=0,viol=0;const cr=comprarRuna;comprarRuna=function(p,i){const x=cr(p,i);if(x===null)comp++;return x;};
    let n=0;while(!G.fim&&n++<150){comecarCombate(G);fecharRodada(G);if(!G.fim)iniciarRodada(G);G.jog.forEach(p=>{if(p.vivo&&(p.ra.length>RN.armMax||p.mr.length+p.ra.length>RN.mochila))viol++;if(p.vivo)p.ra.forEach(a=>{if(RUNA[a.k].alvo&&!todos(p).some(L=>L.onde==='tab'&&L.inst.uid===a.u))viol++;});});}
    semente(12);const H=novoJogo({semVis:true,semRunas:true});let m=0,c2=0;comprarRuna=function(p,i){c2++;return cr(p,i);};while(!H.fim&&m++<150){comecarCombate(H);fecharRodada(H);if(!H.fim)iniciarRodada(H);}
    return {fim:G.fim,comp,viol,semRunas:c2};})())`));
  assert.ok(r.fim);assert.ok(r.comp>10,'bots do buy runes: '+r.comp);assert.equal(r.viol,0);assert.equal(r.semRunas,0);
});

test('two runes of the same type cannot be armed for the same combat; bots pick a different one', () => {
  const run=engine();
  const r=JSON.parse(run(`JSON.stringify((()=>{${runaBase}colocar('knight',3,0);colocar('hunter',4,0);p.mr=[2,2,5];
    const a=execCmd(G,p,{t:'armar',i:0}),b=execCmd(G,p,{t:'armar',i:0}),c=execCmd(G,p,{t:'armar',i:1}),st=[p.ra.map(x=>x.k),p.mr.slice()];
    const d=execCmd(G,p,{t:'desarmar',i:0}),e=execCmd(G,p,{t:'armar',i:0});
    const q=G.jog[1];q.mr=[2,2,5];q.ra=[];q.tab[0][0]=novoInst(G,'knight');armarBot(G,q);
    return {a,b,c,st,d,e,bot:q.ra.map(x=>x.k),botMr:q.mr.slice()};})())`));
  assert.equal(r.a,null);assert.equal(r.b,'Já há uma runa igual armada');assert.equal(r.c,null);assert.deepEqual(r.st,[[2,5],[2]]);
  assert.equal(r.d,null);assert.equal(r.e,null);assert.deepEqual(r.bot,[2,5]);assert.deepEqual(r.botMr,[2]);
});

test('wave spells pick the direction that hits the most enemies and face it', () => {
  const run=engine();
  run(scene+`const C=criarCombate({un:[spec('dragon_hatchling',3,4)]},{un:[spec('orc',4,3),spec('orc',2,3),spec('orc',2,2),spec('orc',1,3)]},{seed:1,semSalto:true});const u=C.un[0],t=C.un[1];u.alvo=t;const h=u.hab;
    const cnt=d=>tilesArea(h.area,u.x,u.y,d).filter(([x,y])=>dentro(x,y)&&C.occ[y*NC+x]&&C.map[C.occ[y*NC+x]].lado===1).length;
    const velho=dirHexPara(u,t),novo=melhorDirOnda(C,u,h,t,velho);const antes=C.un.filter(q=>q.lado===1).map(q=>q.hp);acaoHab(C,u,h,t);`);
  assert.ok(run('cnt(novo)')>=run('cnt(velho)'));
  assert.ok(run('cnt(novo)')>run('cnt(velho)'),'scene with the pack off the target line must improve over the old rule');
  assert.equal(run('u.dir'),run('dirSpr(novo)'));
  assert.ok(run('C.un.filter(q=>q.lado===1).some((q,i)=>q.hp<antes[i])'));
  assert.equal(run('melhorDirOnda(C,u,h,null,velho)'),run('melhorDirOnda(C,u,h,null,velho)'));
});

test('Dark Monk art and corpse differ from Monk, with the same sheet size', () => {
  const run=engine(),rd=f=>fs.readFileSync(path.join(root,f));
  const m=JSON.parse(run(`JSON.stringify(SPR.criaturas.monk)`)),d=JSON.parse(run(`JSON.stringify(SPR.criaturas.dark_monk)`));
  assert.notDeepEqual(rd(m.src),rd(d.src));
  assert.equal(rd(m.src).readUInt32BE(16),rd(d.src).readUInt32BE(16));
  assert.equal(rd(m.src).readUInt32BE(20),rd(d.src).readUInt32BE(20));
  assert.notDeepEqual(rd(run(`SPR.cadaveres[${m.cad}].src`)),rd(run(`SPR.cadaveres[${d.cad}].src`)));
});

test('Healer nerf: Curandeiro trait heals 1%/3% every 2 s and Dark Monk keeps Ferida 40% for 5 s', () => {
  const run=engine();
  run(scene+`const C=criarCombate({un:[spec('druid',1,5),spec('monk',2,5)]},{un:[spec('orc',3,0)]},{seed:1,semSalto:true});`);
  assert.equal(run('C.curaTime[0]'),.01);
  assert.deepEqual(JSON.parse(run(`JSON.stringify(U.dark_monk.hab.seq[0].deb)`)),{ferida:.4,dur:5000});
});

/* ---------- tabuleiro hexagonal (7x8, odd-r) ---------- */
test('hex board: 7x8, six neighbours at distance 1, distance is symmetric and invariant under the 180° side rotation', () => {
  const run=engine();
  const r=JSON.parse(run(`JSON.stringify((()=>{const rot=c=>({x:NC-1-c.x,y:NR-1-c.y});let bad=0;const cels=[];for(let y=0;y<NR;y++)for(let x=0;x<NC;x++)cels.push({x,y});
    cels.forEach(a=>{for(let d=0;d<6;d++){const [x,y]=vizH(a.x,a.y,d);if(distH(a,{x,y})!==1)bad++;const [bx,by]=vizH(x,y,(d+3)%6);if(bx!==a.x||by!==a.y)bad++;}
      cels.forEach(b=>{if(distH(a,b)!==distH(b,a)||distH(a,b)!==distH(rot(a),rot(b)))bad++;});});
    return {NC,NR,bad,interior:[0,1,2,3,4,5].map(d=>vizH(3,4,d).join()).sort(),far:distH({x:0,y:0},{x:NC-1,y:NR-1}),d2:dist2({x:3,y:4},{x:4,y:4})};})())`));
  assert.equal(r.NC,7);assert.equal(r.NR,8);assert.equal(r.bad,0);
  assert.deepEqual(r.interior,['2,3','2,4','2,5','3,3','3,5','4,4']);   // linha par (4): os vizinhos de cima/baixo ficam em x-1 e x
  assert.equal(r.far,10);assert.equal(r.d2,4);                             // dist2 = 4 x distância euclidiana²
});

test('hex areas keep the tile counts of the square spells and rotate with the side', () => {
  const run=engine();
  const r=JSON.parse(run(`JSON.stringify((()=>{const n=m=>tilesArea(m,3,4,1).length;const rot=([x,y])=>[NC-1-x,NR-1-y].join();let bad=0;
    [A_ONDA4,A_ONDA5,A_ONDA7,A_CURTA3,A_QUAD1].forEach(m=>{for(let d=0;d<6;d++){const a=tilesArea(m,3,4,d).map(rot).sort().join('|'),b=tilesArea(m,NC-1-3,NR-1-4,(d+3)%6).map(c=>c.join()).sort().join('|');if(a!==b)bad++;
      if(new Set(tilesArea(m,3,4,d).map(c=>c.join())).size!==tilesArea(m,3,4,d).length)bad++;}});
    return {o4:n(A_ONDA4),o5:n(A_ONDA5),o7:n(A_ONDA7),c3:n(A_CURTA3),q1:n(A_QUAD1),r1:areaTiles({raio:1},3,4,0).length,r2:areaTiles({raio:2},3,4,0).length,bad,
      frente:tilesArea(A_ONDA4,3,4,1).every(([x,y])=>y<=4)};})())`));
  // contando a casa de quem lança: onda 4 = 11+1, onda 5 = 10+1, onda 7 = 16+1, curta 3 = 6+1 (as mesmas casas das matrizes do Tibia); o quadrado 3x3 vira o disco de raio 1 (7)
  assert.deepEqual([r.o4,r.o5,r.o7,r.c3,r.q1],[12,11,17,7,7]);
  assert.equal(r.r1,7);assert.equal(r.r2,19);assert.equal(r.bad,0);assert.ok(r.frente,'a wave cast to the north-east stays in front of the caster');
});

test('hex pathing: melee units walk hex by hex until adjacent and then attack', () => {
  const run=engine();run(scene);
  const r=JSON.parse(run(`JSON.stringify((()=>{const C=criarCombate({un:[spec('knight',3,7)]},{un:[spec('orc',3,0)]},{seed:4,semSalto:true});const a=C.un[0],b=C.un[1];b.prox=1e9;b.livreEm=1e9;
    let ok=true,last={x:a.x,y:a.y},passos=0;for(let i=0;i<200&&!a.nAt;i++){passo(C);if(a.x!==last.x||a.y!==last.y){if(distH(last,a)!==1)ok=false;passos++;last={x:a.x,y:a.y};}}
    return {ok,passos,dist:distH(a,b),atacou:a.nAt>0,inicio:distH({x:3,y:7},{x:3,y:0})};})())`));
  assert.ok(r.ok,'every step goes to a neighbouring hex');assert.ok(r.atacou);assert.equal(r.dist,1);assert.equal(r.passos,r.inicio-1);
});

test('TFT walking pace: one hex takes about 0.4 s at base speed', () => {
  const run=engine();run(scene);
  const r=JSON.parse(run(`JSON.stringify((()=>{const C=criarCombate({un:[spec('knight',3,7)]},{un:[spec('orc',3,0)]},{seed:4,semSalto:true});const a=C.un[0];C.t=100;agir(C,a);return {dur:a.dur,livre:a.livreEm-C.t};})())`));
  assert.equal(r.dur,400);assert.equal(r.livre,400);
});

test('TFT targeting: a unit sticks to its target in range even when a closer enemy shows up, and retargets the nearest when it dies', () => {
  const run=engine();run(scene);
  const r=JSON.parse(run(`JSON.stringify((()=>{const C=criarCombate({un:[spec('hunter',3,7)]},{un:[spec('orc',3,3),spec('orc',2,6)]},{seed:2,semSalto:true});const u=C.un[0],far=C.un[1],near=C.un[2];
    u.alvo=far;agir(C,u);const fica=u.alvo===far&&u.nAt===1;
    far.vivo=false;C.t=5000;agir(C,u);return {fica,troca:u.alvo===near,dLonge:distH(u,far),dPerto:distH(u,near)};})())`));
  assert.ok(r.dPerto<r.dLonge&&r.dLonge<=4);
  assert.ok(r.fica,'keeps shooting the target it already had');
  assert.ok(r.troca,'picks the closest enemy after the target dies');
});

test('TFT targeting: a melee unit whose target is walled off walks to the nearest reachable enemy instead of idling', () => {
  const run=engine();run(scene);
  const r=JSON.parse(run(`JSON.stringify((()=>{const muro=[0,1,2,3,4,5].map(d=>vizH(3,2,d)).map(([x,y])=>spec('hunter',x,y));
    const C=criarCombate({un:[spec('knight',3,6)].concat(muro)},{un:[spec('orc',3,2),spec('orc',6,0)]},{seed:3,semSalto:true});const u=C.un[0],t=C.un[C.un.length-2],alt=C.un[C.un.length-1];
    u.alvo=t;C.t=100;agir(C,u);return {cercado:passoBFS(C,u,t),alvo:u.alvo===alt,andou:u.dur>0,maisLonge:distH({x:3,y:6},alt)>distH({x:3,y:6},t)};})())`));
  assert.equal(r.cercado,-1);assert.ok(r.maisLonge);
  assert.ok(r.alvo,'switches to the reachable enemy');assert.ok(r.andou,'and starts walking right away');
});

test('assassins leap next to the backline carry (ranged, high value) instead of the tank on the same row', () => {
  const run=engine();run(scene);
  for(const seed of [1,2,3,4,5]){
    const r=JSON.parse(run(`JSON.stringify((()=>{const C=criarCombate({un:[spec('amazon',0,6),spec('elf',6,6),spec('knight',3,4)]},{un:[spec('behemoth',3,0,1),spec('hunter',5,0),spec('orc',3,3)]},{seed:${seed}});
      const a=C.un.filter(u=>u.lado===0&&u.salta),h=C.un[4];return {n:a.length,ok:a.every(u=>u.alvo===h&&distH(u,h)===1&&u.salto),orig:a.map(u=>[u.salto.x,u.salto.y].join()).sort()};})())`));
    assert.equal(r.n,2);assert.ok(r.ok,`seed ${seed}`);assert.deepEqual(r.orig,['0,6','6,6']);
  }
  // carry no canto com as casas vizinhas ocupadas: os assassinos escolhem outro alvo, e nunca duas unidades na mesma casa
  const r=JSON.parse(run(`JSON.stringify((()=>{const C=criarCombate({un:[spec('amazon',0,6),spec('elf',6,6)]},{un:[spec('hunter',6,0),spec('knight',5,0),spec('sorcerer',5,1),spec('druid',6,1),spec('orc',2,2)]},{seed:9});
    const a=C.un.filter(u=>u.lado===0),occ=new Set(C.un.map(u=>u.x+','+u.y));return {ok:a.every(u=>u.alvo!==C.un[2]),unicos:occ.size===C.un.length};})())`));
  assert.ok(r.ok);assert.ok(r.unicos);
});

test('bot formation: tanks in the front centre, main carry in the back corner, healer behind the tanks, guards when the last rival had assassins', () => {
  const run=engine();
  const place=opoAss=>JSON.parse(run(`JSON.stringify((()=>{semente(5);const G=novoJogo({semVis:true});const p=G.jog[1];p.nivel=7;p.banco.fill(null);p.tab.forEach(l=>l.fill(null));
    ['knight','dwarf_guard','orc_warrior','hunter','paladin','druid','bonebeast'].forEach((id,i)=>{p.banco[i]=novoInst(G,id);});p.banco[3].e=2;p.opoAss=${opoAss};posicionarBot(p);
    const o={};p.tab.forEach((l,y)=>l.forEach((inst,x)=>{if(inst)o[inst.id]=[x,y];}));return o;})())`));
  const a=place(0);
  assert.equal(Object.keys(a).length,7);
  assert.equal(a.knight[1],0);assert.equal(a.dwarf_guard[1],0);
  assert.ok([2,3,4].includes(a.knight[0])&&[2,3,4].includes(a.dwarf_guard[0]),'tanks in the centre of the front row');
  assert.deepEqual(a.hunter,[6,3],'the 2-star carry goes to the back corner');
  assert.equal(a.paladin[1],3);assert.equal(a.druid[1],2);
  assert.equal(a.orc_warrior[1],0);assert.equal(a.bonebeast[1],0);
  const b=place(2);
  assert.deepEqual(b.hunter,[6,3]);
  const viz=Object.entries(b).filter(([,c])=>(c[0]===5&&c[1]===3)||(c[0]===6&&c[1]===2)).map(([id])=>id);
  assert.equal(viz.length,2,'both neighbours of the corner carry are taken');
  assert.ok(viz.some(id=>['knight','dwarf_guard','orc_warrior','bonebeast'].includes(id)),'one of them is a melee bodyguard');
});

test('the combat-start entrance is visual only: same seed gives the same fight with or without rendering and entrance poses', () => {
  const run=engine();run(scene);
  run(`globalThis.performance={now:()=>globalThis.__agora||0};`);
  const sum=`C=>JSON.stringify({t:C.t,v:C.venc,u:C.un.map(u=>[u.d.id,u.x,u.y,u.hp,u.mana,u.st.d,u.st.c])})`;
  const A=`{un:[spec('amazon',0,6),spec('elf',6,6),spec('knight',3,4),spec('hunter',6,7),spec('druid',2,7)]}`,B=`{un:[spec('behemoth',3,3,1),spec('hunter',5,0),spec('orc',2,3),spec('sorcerer',1,0)]}`;
  const r=JSON.parse(run(`JSON.stringify((()=>{const S=${sum};const silent=simular(criarCombate(${A},${B},{seed:42}));
    const C=criarCombate(${A},${B},{seed:42,vis:true});UI.C=C;UI.demo=false;iniciarEntrada();const poses=[];
    for(const e of [-1,0,100,300,600,850]){UI.ent.ini=e<0?null:0;globalThis.__agora=Math.max(0,e);UI.ent.cache=null;const p=poseEntrada(C);
      poses.push({e,oculto:C.un.filter(u=>u.lado===1).filter(u=>p.un.get(u).a===0).length,salto:C.un.filter(u=>u.salto).map(u=>Math.round(p.un.get(u).oy))});}
    const antes=S(C);simular(C);return {igual:S(C)===S(silent),antes0:JSON.parse(antes).t===0,poses};})())`));
  assert.ok(r.antes0,'entrance poses never advance the simulation');
  assert.ok(r.igual,'rendered fight equals the silent one');
  assert.equal(r.poses[0].oculto,4,'before the entrance starts the enemy army is hidden');
  assert.equal(r.poses[r.poses.length-1].oculto,0,'every enemy has appeared before the fight starts');
  assert.ok(r.poses.some(p=>p.salto.some(oy=>oy<-5)),'the assassins are airborne at some point of the leap');
});
