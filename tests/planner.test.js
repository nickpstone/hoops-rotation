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
// "needs a break": minutes stay even; a break player plays at most one full quarter
function breakCheck(name, roster, settings, maxSpread) {
  const pl = roster.map(([id, pos, full]) => ({ id, pos, full }));
  const r = P.bestPlan(P.buildStints(settings), 0, pl);
  const fc = P.fullCounts(r.stints, r.stints.length, pl);
  const m = P.minutes(r.stints), v = pl.map(p => m[p.id] || 0);
  const moves = P.positionMoves(r.stints);
  console.log(`\n${name}: position moves ${moves}, full quarters ${JSON.stringify(fc)}, minutes ${JSON.stringify(m)}`);
  r.stints.forEach(s => console.log(`Q${s.period} ${s.start}-${s.end}: ` + P.POSITIONS.map(p => `${p}:${s.lineup[p]}`).join(' ')));
  Object.values(fc).forEach(c => assert(c <= 1, 'more than one full quarter'));
  assert(Math.max(...v) - Math.min(...v) <= maxSpread, 'uneven');
  return { m, fc, moves };
}
// 8 players, 3 need breaks: everyone 25
let { m: m2, moves: mv2 } = breakCheck('8 players, 3 need breaks', [['A',[1,2,3],false],['B',[1,2,3],true],['C',[1,2,3],false],['D',[1,2,3],true],['E',[4,5],true],['F',[4,5],false],['G',[1,2,3,4,5],true],['H',[3,4,5],true]], q, 0);
// 10 players, 4 need breaks: 20 each, nobody needs a full quarter
let { fc: f3 } = breakCheck('10 players, 4 need breaks', [['A',[1,2,3],false],['B',[1,2,3],false],['C',[1,2,3],true],['D',[1,2,3],true],['E',[1,2,3],true],['F',[4,5],false],['G',[4,5],false],['H',[3,4,5],true],['I',[1,2,3,4,5],true],['J',[4,5],true]], q, 0);
assert.strictEqual(Object.keys(f3).length, 0);
breakCheck('7 players, 2 need breaks', [['A',[1,2,3],false],['B',[1,2,3],true],['C',[1,2,3],true],['D',[1,2,3],true],['E',[4,5],false],['F',[4,5],true],['G',[1,2,3,4,5],true]], q, 5);
assert.strictEqual(mv2, 0, 'player changed position mid-quarter');
assert.strictEqual(P.positionMoves(P.bestPlan(P.buildStints(q), 0, players).stints), 0);
// starting 5: locked exactly, minutes still even
{
  const pl = [['A',[1,2,3]],['B',[1,2,3]],['C',[1,2,3]],['D',[1,2,3]],['E',[4,5]],['F',[4,5]],['G',[1,2,3,4,5]],['H',[3,4,5]]].map(([id,pos])=>({id,pos}));
  const starters = { 1: 'D', 2: 'C', 3: 'H', 4: 'F', 5: 'E' };
  const r = P.bestPlan(P.buildStints(q), 0, pl, { lockFirst: starters });
  assert.deepStrictEqual({ ...r.stints[0].lineup }, { 1: 'D', 2: 'C', 3: 'H', 4: 'F', 5: 'E' });
  const m = P.minutes(r.stints); const v = pl.map(p => m[p.id]);
  console.log('\nstarting 5 minutes', JSON.stringify(m));
  assert(Math.max(...v) - Math.min(...v) === 0);
  // partial: only the point guard chosen
  const r2 = P.bestPlan(P.buildStints(q), 0, pl, { lockFirst: { 1: 'G' } });
  assert.strictEqual(r2.stints[0].lineup[1], 'G');
}
console.log('\nALL OK');
