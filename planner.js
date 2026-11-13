/* Rotation planner — pure functions, no DOM. Shared by the app and the tests. */
(function (root) {
  'use strict';

  const POSITIONS = [1, 2, 3, 4, 5];
  const OFF_POSITION_COST = 1e6;
  const NO_BREAK_COST = 1e5;

  /**
   * Ids that must sit stint `s`: players marked "needs a break" (full === false)
   * who were on in the previous stint of the same period.
   */
  function mustRest(stints, s, players) {
    const out = new Set();
    if (s === 0 || stints[s - 1].period !== stints[s].period || !stints[s - 1].lineup) return out;
    const prevOn = new Set(Object.values(stints[s - 1].lineup));
    players.forEach((p) => { if (p.full === false && prevOn.has(p.id)) out.add(p.id); });
    return out;
  }

  /** Build the list of rotation stints from the game settings. */
  function buildStints(settings) {
    const { periods, periodMin, subMin } = settings;
    const stints = [];
    for (let p = 1; p <= periods; p++) {
      for (let start = 0; start < periodMin; start += subMin) {
        const end = Math.min(periodMin, start + subMin);
        stints.push({ period: p, start, end, len: end - start, lineup: null });
      }
    }
    return stints;
  }

  /** Minutes played, current on/off streaks and last position, from stints [0, upto). */
  function history(stints, upto, ids) {
    const st = { played: {}, run: {}, rest: {}, lastPos: {} };
    ids.forEach((id) => { st.played[id] = 0; st.run[id] = 0; st.rest[id] = 0; st.lastPos[id] = 0; });
    for (let s = 0; s < upto; s++) {
      const lineup = stints[s].lineup || {};
      const onAt = {};
      POSITIONS.forEach((pos) => { if (lineup[pos]) onAt[lineup[pos]] = pos; });
      ids.forEach((id) => {
        if (onAt[id]) {
          st.played[id] += stints[s].len;
          st.run[id] += 1; st.rest[id] = 0; st.lastPos[id] = onAt[id];
        } else {
          st.rest[id] += 1; st.run[id] = 0; st.lastPos[id] = 0;
        }
      });
    }
    return st;
  }

  /**
   * Choose the best five for one stint.
   * players: [{id, pos:[...]}]   lock: {pos: id} positions that must stay as they are.
   */
  function solveStint(players, st, len, lock, jitter, rest) {
    lock = lock || {};
    rest = rest || new Set();
    const lockedIds = new Set(Object.values(lock));
    const free = players.filter((p) => !lockedIds.has(p.id));
    const openPos = POSITIONS.filter((pos) => !lock[pos]);

    const cost = {};
    free.forEach((p) => {
      const m = st.played[p.id] || 0;
      // Convex in minutes played: giving time to whoever has least is always cheapest.
      let base = (m + len) * (m + len) - m * m;
      base += 12 * (st.run[p.id] || 0);   // been on a while -> give them a rest
      base -= 6 * (st.rest[p.id] || 0);   // been sitting a while -> get them on
      base += jitter ? Math.random() * 30 : 0;
      cost[p.id] = {};
      POSITIONS.forEach((pos) => {
        let c = base;
        if (!p.pos.includes(pos)) c += OFF_POSITION_COST;
        if (rest.has(p.id)) c += NO_BREAK_COST;
        const last = st.lastPos[p.id];
        if (last && last !== pos) c += 4;   // staying on: prefer the same spot
        cost[p.id][pos] = c;
      });
    });

    // Fill the most constrained positions first: better pruning.
    const order = openPos.slice().sort((a, b) =>
      free.filter((p) => p.pos.includes(a)).length - free.filter((p) => p.pos.includes(b)).length);

    let best = null, bestC = Infinity;
    const used = new Set();
    const cur = {};
    (function dfs(i, c) {
      if (c >= bestC) return;
      if (i === order.length) { best = Object.assign({}, cur); bestC = c; return; }
      const pos = order[i];
      const cands = free.filter((p) => !used.has(p.id)).sort((a, b) => cost[a.id][pos] - cost[b.id][pos]);
      for (const p of cands) {
        const nc = c + cost[p.id][pos];
        if (nc >= bestC) break;
        used.add(p.id); cur[pos] = p.id;
        dfs(i + 1, nc);
        used.delete(p.id); delete cur[pos];
      }
    })(0, 0);

    if (!best) return null;
    return Object.assign({}, lock, best);
  }

  /**
   * (Re)plan stints [from, end) for the given available players, keeping earlier stints.
   * lockFirst: positions in stint `from` to keep fixed.
   */
  function plan(stints, from, players, opts) {
    opts = opts || {};
    const out = stints.map((s) => Object.assign({}, s, { lineup: s.lineup ? Object.assign({}, s.lineup) : null }));
    if (players.length < 5) return { stints: out, error: 'Need at least 5 available players.' };
    const allIds = Array.from(new Set(players.map((p) => p.id).concat(
      out.flatMap((s) => (s.lineup ? Object.values(s.lineup) : [])))));
    for (let s = from; s < out.length; s++) {
      const st = history(out, s, allIds);
      const lock = s === from ? opts.lockFirst : null;
      out[s].lineup = solveStint(players, st, out[s].len, lock, opts.jitter, mustRest(out, s, players));
    }
    return { stints: out, error: null };
  }

  /** Lower is better: uneven minutes, long stints on court, long stints on the bench. */
  function score(stints, from, players) {
    const ids = players.map((p) => p.id);
    const m = minutes(stints);
    const posOf = {}; players.forEach((p) => { posOf[p.id] = p.pos; });
    let sc = 0;
    ids.forEach((id) => { sc += (m[id] || 0) * (m[id] || 0); });
    const run = {}, rest = {};
    for (let s = 0; s < stints.length; s++) {
      const on = new Set(Object.values(stints[s].lineup || {}));
      ids.forEach((id) => {
        if (on.has(id)) { run[id] = (run[id] || 0) + 1; rest[id] = 0; if (s >= from && run[id] >= 3) sc += 3 * run[id]; }
        else { rest[id] = (rest[id] || 0) + 1; run[id] = 0; if (s >= from && rest[id] >= 3) sc += 3 * rest[id]; }
      });
      if (s >= from && stints[s].lineup) {
        const rest = mustRest(stints, s, players);
        on.forEach((id) => { if (rest.has(id)) sc += NO_BREAK_COST; });
        POSITIONS.forEach((pos) => {
          const id = stints[s].lineup[pos];
          if (posOf[id] && !posOf[id].includes(pos)) sc += OFF_POSITION_COST;
        });
      }
    }
    return sc;
  }

  /** Run the planner many times with a little randomness and keep the fairest result. */
  function bestPlan(stints, from, players, opts) {
    opts = opts || {};
    const tries = opts.tries || 60;
    let best = null, bestScore = Infinity;
    for (let t = 0; t < tries; t++) {
      const r = plan(stints, from, players, { lockFirst: opts.lockFirst, jitter: opts.shuffle || t > 0 });
      if (r.error) return r;
      const sc = score(r.stints, from, players);
      if (sc < bestScore) { best = r; bestScore = sc; }
    }
    return best;
  }

  /** Total planned minutes per player id. */
  function minutes(stints) {
    const m = {};
    stints.forEach((s) => {
      if (!s.lineup) return;
      POSITIONS.forEach((pos) => { const id = s.lineup[pos]; if (id) m[id] = (m[id] || 0) + s.len; });
    });
    return m;
  }

  const api = { POSITIONS, mustRest, buildStints, history, solveStint, plan, bestPlan, score, minutes };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Planner = api;
})(this);
