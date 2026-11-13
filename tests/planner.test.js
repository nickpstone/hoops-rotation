const P = require('../planner.js');
const assert = require('assert');
function run(name, roster, settings) {
  const players = roster.map(([id, pos]) => ({ id, pos }));
  const r = P.bestPlan(P.buildStints(settings), 0, players);
  assert(!r.error, r.error);
  const m = P.minutes(r.stints);
  let off = 0;
  r.stints.forEach(s => {
    const ids = Object.values(s.lineup); assert.strictEqual(new Set(ids).size, 5);
    for (const pos of P.POSITIONS) if (!players.find(p => p.id === s.lineup[pos]).pos.includes(pos)) off++;
  });
  console.log(`\n${name}  (off-position slots: ${off})`);
  r.stints.forEach(s => console.log(`Q${s.period} ${s.start}-${s.end}: ` + P.POSITIONS.map(p => `${p}:${s.lineup[p]}`).join(' ')));
  console.log('minutes', JSON.stringify(m));
  return { m, off };
}
const q = { periods: 4, periodMin: 10, subMin: 5 };
// 10 players, mixed restrictions
let r = run('10 players', [['A',[1,2,3]],['B',[1,2,3]],['C',[1,2,3]],['D',[1,2,3]],['E',[1,2,3]],['F',[1,2,3]],['G',[4,5]],['H',[4,5]],['I',[4,5]],['J',[3,4,5]]], q);
assert.strictEqual(r.off, 0);
let v = Object.values(r.m); assert(Math.max(...v) - Math.min(...v) <= 5);
// 7 players
r = run('7 players', [['A',[1,2,3]],['B',[1,2,3]],['C',[1,2,3]],['D',[1,2,3]],['E',[4,5]],['F',[4,5]],['G',[1,2,3,4,5]]], q);
assert.strictEqual(r.off, 0); v = Object.values(r.m); assert(Math.max(...v) - Math.min(...v) <= 5);
// 8 players, 2 halves of 20
r = run('8 players halves', [['A',[1,2]],['B',[1,2,3]],['C',[2,3]],['D',[1,2,3]],['E',[3,4]],['F',[4,5]],['G',[4,5]],['H',[5]]], { periods: 2, periodMin: 20, subMin: 5 });
assert.strictEqual(r.off, 0); v = Object.values(r.m); assert(Math.max(...v) - Math.min(...v) <= 5);
// replan mid-game: drop player A from stint 4, keep earlier stints
const players = [['A',[1,2,3]],['B',[1,2,3]],['C',[1,2,3]],['D',[1,2,3]],['E',[4,5]],['F',[4,5]],['G',[1,2,3,4,5]],['H',[1,2,3]]].map(([id,pos])=>({id,pos}));
const first = P.plan(P.buildStints(q), 0, players);
const second = P.plan(first.stints, 4, players.filter(p => p.id !== 'A'));
for (let s = 0; s < 4; s++) assert.deepStrictEqual(second.stints[s].lineup, first.stints[s].lineup);
for (let s = 4; s < 8; s++) assert(!Object.values(second.stints[s].lineup).includes('A'));
console.log('\nreplan minutes', JSON.stringify(P.minutes(second.stints)));
// too few
assert(P.plan(P.buildStints(q), 0, players.slice(0, 4)).error);
console.log('\nALL OK');
