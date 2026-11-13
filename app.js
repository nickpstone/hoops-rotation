(function () {
  'use strict';
  const P = window.Planner;
  const POS = P.POSITIONS;
  const POS_NAME = { 1: 'PG', 2: 'SG', 3: 'SF', 4: 'PF', 5: 'C' };
  const KEY = 'hoops-rotation-v1';
  const $view = document.getElementById('view');
  const uid = () => Math.random().toString(36).slice(2, 9);

  const STARTING_ROSTER = ['Archie', 'Christian', 'Harry', 'Hudson',
    'Leo', 'Mason', 'Oliver', 'River'];

  // ---------- state ----------
  function fresh() {
    return {
      players: STARTING_ROSTER.map((name) => ({ id: uid(), name, num: '', pos: [1, 2, 3, 4, 5] })),
      settings: { periods: 4, periodMin: 10, subMin: 5 },
      avail: {},
      game: null,
      tab: 'team',
    };
  }
  let S;
  try { S = JSON.parse(localStorage.getItem(KEY)) || fresh(); } catch (e) { S = fresh(); }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage blocked */ } };

  const player = (id) => S.players.find((p) => p.id === id);
  const nameOf = (id) => (player(id) ? player(id).name : '—');
  const short = (id) => {
    const p = player(id); if (!p) return '—';
    const parts = p.name.trim().split(/\s+/);
    return parts[0];
  };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isAvail = (id) => S.avail[id] !== false;
  const sortedPlayers = () => S.players.slice().sort((a, b) => a.name.localeCompare(b.name));
  const mmss = (sec) => { sec = Math.max(0, Math.ceil(sec)); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); };
  const periodLabel = (n, total) => (total === 2 ? 'H' : total === 4 ? 'Q' : 'P') + n;
  const offPos = (id, pos) => { const p = player(id); return p && !p.pos.includes(pos); };
  const periodWord = () => ({ 2: 'half', 4: 'quarter' }[S.settings.periods] || 'period');
  const canFull = (p) => p.full !== false;
  const noBreak = (s, id) => P.mustRest(S.game.stints, s, S.players).has(id);

  // ---------- tabs ----------
  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => { S.tab = b.dataset.tab; save(); render(); }));

  function render() {
    document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === S.tab));
    if (S.tab === 'team') renderTeam();
    else if (S.tab === 'setup') renderSetup();
    else renderLive();
    window.scrollTo(0, 0);
  }

  // ---------- Team ----------
  function renderTeam() {
    const list = sortedPlayers().map((p) => `
      <div class="card">
        <div class="row">
          <div class="grow" data-act="rename" data-id="${p.id}">
            <div class="name">${p.num ? '#' + esc(p.num) + ' ' : ''}${esc(p.name)}</div>
            <div class="sub">Tap name to edit</div>
          </div>
          <button class="iconbtn" data-act="del" data-id="${p.id}" aria-label="Remove ${esc(p.name)}">✕</button>
        </div>
        <div class="chips">${POS.map((n) => `
          <button class="chip ${p.pos.includes(n) ? 'on' : ''}" data-p="${n}" data-act="pos" data-id="${p.id}">
            <b>${n}</b><small>${POS_NAME[n]}</small></button>`).join('')}
        </div>
        <div class="check fulltick ${canFull(p) ? '' : 'off'}" data-act="full" data-id="${p.id}">
          <div class="box">${canFull(p) ? '✓' : ''}</div>
          <div class="grow">Can play a full ${periodWord()}${canFull(p) ? '' : '<div class="sub">Needs a break — sits half of each ' + periodWord() + '. May play one full ' + periodWord() + ' a game only if needed to keep minutes even.</div>'}</div>
        </div>
      </div>`).join('');
    $view.innerHTML = `
      <h2>Players &amp; positions</h2>
      <p class="hint">Light up the positions each player is allowed to play. Untick “Can play a full ${periodWord()}” for players who need a break.</p>
      ${list || '<div class="empty">No players yet.</div>'}
      <h2>Add player</h2>
      <form class="addform" id="add">
        <input name="name" placeholder="Name" autocomplete="off" required>
        <input name="num" placeholder="#" inputmode="numeric" autocomplete="off">
        <button class="btn primary">Add</button>
      </form>`;
    document.getElementById('add').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.target;
      const name = f.name.value.trim(); if (!name) return;
      S.players.push({ id: uid(), name, num: f.num.value.trim(), pos: [1, 2, 3, 4, 5] });
      save(); render();
    });
  }

  // ---------- Game day ----------
  function renderSetup() {
    const s = S.settings;
    const opt = (vals, cur, fmt) => vals.map((v) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${fmt ? fmt(v) : v}</option>`).join('');
    const playing = S.players.filter((p) => isAvail(p.id));
    const gaps = POS.filter((n) => !playing.some((p) => p.pos.includes(n)));
    const stints = P.buildStints(s);
    const total = s.periods * s.periodMin;
    const each = playing.length ? Math.round((total * 5 / playing.length) * 10) / 10 : 0;

    $view.innerHTML = `
      <h2>Game format</h2>
      <div class="settings">
        <label>Periods<select data-set="periods">${opt([1, 2, 3, 4], s.periods)}</select></label>
        <label>Mins each<select data-set="periodMin">${opt([5, 6, 7, 8, 9, 10, 12, 14, 15, 16, 18, 20, 24, 25], s.periodMin)}</select></label>
        <label>Sub every<select data-set="subMin">${opt([2, 3, 4, 5, 6, 7, 8, 10], s.subMin, (v) => v + ' min')}</select></label>
      </div>
      <p class="hint">${stints.length} rotations · ${total} min game</p>

      <h2>Who's playing? <span style="float:right">${playing.length} ticked</span></h2>
      ${sortedPlayers().map((p) => `
        <div class="check ${isAvail(p.id) ? '' : 'off'}" data-act="avail" data-id="${p.id}">
          <div class="box">${isAvail(p.id) ? '✓' : ''}</div>
          <div class="grow"><div class="name">${esc(p.name)}</div></div>
          ${miniPos(p)}
        </div>`).join('')}
      ${playing.length < 5 ? '<div class="warn">Tick at least 5 players.</div>' : ''}
      ${playing.length >= 5 && gaps.length ? `<div class="warn">Nobody ticked can play ${gaps.map((n) => n + ' (' + POS_NAME[n] + ')').join(', ')} — someone will be put there out of position.</div>` : ''}
      ${playing.length >= 5 ? `<p class="hint">About ${each} min each if it splits evenly.</p>` : ''}

      <h2>Starting 5 ${Object.keys(starters()).length ? '<button class="btn small ghost" data-act="clear-starters" style="float:right;margin-top:-6px">Clear</button>' : ''}</h2>
      <p class="hint">Optional. Tap a position to pick the starter — leave on Auto and the app picks.</p>
      <div class="card lineup">
        ${POS.map((n) => { const id = starters()[n]; return `<div class="slot" data-act="starter" data-p="${n}"><span class="pos" data-p="${n}">${n}</span>
          <div class="grow name">${id ? esc(nameOf(id)) : '<span class="sub" style="font-size:16px">Auto</span>'}</div>
          ${id && offPos(id, n) ? '<span class="tag offpos">OUT OF POS</span>' : ''}<span class="arrow">›</span></div>`; }).join('')}
      </div>
      <button class="btn primary block" data-act="make" ${playing.length < 5 ? 'disabled' : ''}>Make rotation</button>`;

    $view.querySelectorAll('select[data-set]').forEach((sel) => sel.addEventListener('change', () => {
      S.settings[sel.dataset.set] = Number(sel.value); save(); render();
    }));
  }
  const miniPos = (p) => (canFull(p) ? '' : '<span class="tag brk" title="Needs a break">☕</span> ') + `<span class="mini">${p.pos.slice().sort().map((n) => `<span class="pos" data-p="${n}" style="width:18px;height:18px;border-radius:5px;font-size:11px">${n}</span>`).join('')}</span>`;

  /** Chosen starters {pos: id}, ignoring anyone not ticked for today. */
  function starters() {
    const out = {};
    Object.entries(S.starters || {}).forEach(([pos, id]) => { if (player(id) && isAvail(id)) out[pos] = id; });
    return out;
  }

  /** Simple chooser using the shared dialog; calls done(value) with '' for cancel. */
  function choose(html, done) {
    const dlg = document.getElementById('picker');
    const body = document.getElementById('pickerBody');
    body.innerHTML = html;
    body.onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      e.preventDefault();
      body.onclick = null;
      dlg.close();
      done(b.value);
    };
    dlg.showModal();
  }

  function pickStarter(pos) {
    const st = starters();
    const onAt = {}; Object.entries(st).forEach(([n, id]) => { onAt[id] = Number(n); });
    const opts = S.players.filter((p) => isAvail(p.id)).sort((a, b) =>
      (b.pos.includes(pos) - a.pos.includes(pos)) || a.name.localeCompare(b.name));
    choose(`
      <h3><span class="pos" data-p="${pos}">${pos}</span> ${POS_NAME[pos]} · starter</h3>
      <button class="pick ${st[pos] ? '' : 'cur'}" value="auto"><div class="grow"><div class="name">Auto</div><div class="sub">Let the app choose</div></div></button>
      ${opts.map((p) => `<button class="pick ${st[pos] === p.id ? 'cur' : ''}" value="${p.id}">
        <div class="grow"><div class="name">${esc(p.name)}</div>
        <div class="sub">${onAt[p.id] && onAt[p.id] !== pos ? 'starting at ' + onAt[p.id] + (st[pos] ? ' (will swap)' : ' (will move)') : ''}${p.pos.includes(pos) ? '' : (onAt[p.id] && onAt[p.id] !== pos ? ' · ' : '') + '<span style="color:var(--warn)">not a ' + pos + '</span>'}</div></div>
        ${miniPos(p)}</button>`).join('')}
      <button class="btn ghost block" value="">Cancel</button>`, (v) => {
      if (!v) return;
      S.starters = starters();
      if (v === 'auto') delete S.starters[pos];
      else {
        const other = onAt[v];
        if (other && other !== pos) { if (S.starters[pos]) S.starters[other] = S.starters[pos]; else delete S.starters[other]; }
        S.starters[pos] = v;
      }
      save(); const y = window.scrollY; render(); window.scrollTo(0, y);
    });
  }

  function makeGame() {
    if (S.game && S.game.cur > 0 && !confirm('Replace the game in progress with a new rotation?')) return;
    const playing = S.players.filter((p) => isAvail(p.id));
    const settings = Object.assign({}, S.settings);
    const r = P.bestPlan(P.buildStints(settings), 0, playing, { lockFirst: starters() });
    if (r.error) { alert(r.error); return; }
    const avail = {}; playing.forEach((p) => { avail[p.id] = true; });
    S.game = { settings, stints: r.stints, cur: 0, avail, timer: { left: r.stints[0].len * 60, endAt: null, alarmed: false } };
    S.tab = 'live'; save(); render();
  }

  // ---------- Live rotation ----------
  function gamePlayers() {
    return S.players.filter((p) => S.game.avail[p.id]);
  }
  function timeLeft() {
    const t = S.game.timer;
    return t.endAt ? (t.endAt - Date.now()) / 1000 : t.left;
  }

  function renderLive() {
    const g = S.game;
    if (!g) {
      $view.innerHTML = `<div class="empty">No rotation yet.<br><br><button class="btn primary" data-act="goto-setup">Pick players for today</button></div>`;
      return;
    }
    const st = g.stints[g.cur];
    const next = g.stints[g.cur + 1];
    const nP = g.settings.periods;
    const line = st.lineup || {};
    const nowOn = new Set(Object.values(line));
    const running = !!g.timer.endAt;

    // what changes at the next sub
    let changes = '';
    if (next && next.lineup) {
      const nextOn = new Set(Object.values(next.lineup));
      // Pair each player going off with the player coming on: same position first, then the rest in order.
      let outPos = POS.filter((n) => !nextOn.has(line[n]));
      let inPos = POS.filter((n) => !nowOn.has(next.lineup[n]));
      const pairs = [];
      outPos.filter((n) => inPos.includes(n)).forEach((n) => pairs.push([n, n]));
      outPos = outPos.filter((n) => !pairs.some((pr) => pr[0] === n));
      inPos = inPos.filter((n) => !pairs.some((pr) => pr[1] === n));
      outPos.forEach((n, i) => pairs.push([n, inPos[i]]));
      const swaps = pairs.map(([o, i]) => `
        <div class="swap">
          <span class="tag out">OFF</span><span class="nm">${esc(nameOf(line[o]))}</span>
          <span class="arrow">⇄</span>
          <span class="tag in">ON</span><span class="nm">${esc(nameOf(next.lineup[i]))} <span class="arrow">${i} ${POS_NAME[i]}</span></span>
        </div>`);
      const moves = POS.filter((n) => nowOn.has(next.lineup[n]) && line[n] !== next.lineup[n])
        .map((n) => `<div><span class="arrow">↔</span> ${esc(nameOf(next.lineup[n]))} <span class="arrow">moves to ${n} ${POS_NAME[n]}</span></div>`);
      const label = next.period !== st.period ? `Start of ${periodLabel(next.period, nP)}` : `At ${next.start}:00`;
      changes = `<div class="card changes"><h2 style="margin-top:0">Next sub · ${label}</h2>${swaps.join('') + moves.join('') || '<div class="sub">No changes</div>'}</div>`;
    } else {
      changes = `<div class="card changes"><div class="sub">Last rotation of the game.</div></div>`;
    }

    // plan table
    const rows = g.stints.map((s, i) => `
      <tr class="${i === g.cur ? 'cur' : i < g.cur ? 'past' : ''} ${i > 0 && s.period !== g.stints[i - 1].period ? 'newq' : ''}">
        <td>${periodLabel(s.period, nP)} ${s.start}′</td>
        ${POS.map((n) => { const id = s.lineup && s.lineup[n]; return `<td class="cell ${offPos(id, n) ? 'offpos' : noBreak(i, id) ? 'fullq' : ''}" data-act="cell" data-s="${i}" data-p="${n}">${esc(short(id))}</td>`; }).join('')}
      </tr>`).join('');

    // minutes
    const planned = P.minutes(g.stints);
    const sofar = P.minutes(g.stints.slice(0, g.cur));
    const ids = Array.from(new Set(gamePlayers().map((p) => p.id).concat(Object.keys(planned))));
    const max = Math.max(1, ...ids.map((id) => planned[id] || 0));
    const mins = ids.sort((a, b) => (planned[b] || 0) - (planned[a] || 0) || nameOf(a).localeCompare(nameOf(b))).map((id) => `
      <div class="card" style="padding:10px 12px">
        <div class="row"><div class="grow name">${esc(nameOf(id))}${g.avail[id] ? '' : ' <span class="sub">(out)</span>'}</div>
        <div><b>${planned[id] || 0}</b> <span class="sub">min · ${sofar[id] || 0} played</span></div></div>
        <div class="bar"><i style="width:${((planned[id] || 0) / max) * 100}%"></i></div>
      </div>`).join('');

    const left = timeLeft();
    $view.innerHTML = `
      <div class="card clock ${left <= 0 ? 'due' : ''}" id="clock">
        <div class="when">${periodLabel(st.period, nP)} · ${st.start}:00–${st.end}:00 · rotation ${g.cur + 1}/${g.stints.length}</div>
        <div class="time" id="time">${left <= 0 ? 'SUB!' : mmss(left)}</div>
        <div class="ctrls">
          <button class="btn" data-act="prev" ${g.cur === 0 ? 'disabled' : ''}>◀</button>
          <button class="btn ${running ? '' : 'primary'}" data-act="toggle" style="flex:2">${running ? 'Pause' : 'Start'}</button>
          <button class="btn ${left <= 0 ? 'primary' : ''}" data-act="next" ${next ? '' : 'disabled'} style="flex:2">Sub done ▶</button>
        </div>
      </div>

      <div class="card lineup">
        <h2 style="margin-top:0">On court now</h2>
        ${POS.map((n) => `<div class="slot" data-act="cell" data-s="${g.cur}" data-p="${n}"><span class="pos" data-p="${n}">${n}</span>
          <div class="grow name">${esc(nameOf(line[n]))}</div>${offPos(line[n], n) ? '<span class="tag offpos">OUT OF POS</span>' : ''}${noBreak(g.cur, line[n]) ? '<span class="tag brk">FULL ' + (nP === 2 ? 'HALF' : nP === 4 ? 'QTR' : 'PERIOD') + '</span>' : ''}</div>`).join('')}
      </div>
      ${changes}

      <h2>Full game plan</h2>
      <p class="hint">Tap any spot to swap someone in — the rest of the game re-balances. <span style="text-decoration:underline dotted var(--warn);text-underline-offset:3px">Dotted</span> = a break player's one full ${periodWord()}.</p>
      <div class="card" style="padding:4px 8px">
        <table class="grid"><thead><tr><th></th>${POS.map((n) => `<th><span class="pos" data-p="${n}" style="width:24px;height:24px;font-size:13px">${n}</span></th>`).join('')}</tr></thead>
        <tbody>${rows}</tbody></table>
      </div>
      <div class="row" style="gap:8px">
        <button class="btn ghost grow" data-act="shuffle">🔀 Shuffle rest</button>
        <button class="btn ghost grow" data-act="share">📤 Share plan</button>
      </div>

      <h2>Minutes</h2>
      ${mins}

      <h2>Injured / left / arrived late?</h2>
      <p class="hint">Untick a player to take them out from now on (or tick to add them). The rest of the game re-plans.</p>
      ${sortedPlayers().map((p) => `
        <div class="check ${g.avail[p.id] ? '' : 'off'}" data-act="live-avail" data-id="${p.id}">
          <div class="box">${g.avail[p.id] ? '✓' : ''}</div>
          <div class="grow"><div class="name">${esc(p.name)}</div></div>${miniPos(p)}
        </div>`).join('')}
      <button class="btn ghost block" data-act="end" style="margin-top:14px">End game</button>`;
  }

  function replan(from, opts) {
    const g = S.game;
    if (from >= g.stints.length) return true;
    const r = P.bestPlan(g.stints, from, gamePlayers(), opts);
    if (r.error) { alert(r.error); return false; }
    g.stints = r.stints;
    return true;
  }

  function setAvailLive(id) {
    const g = S.game;
    const was = !!g.avail[id];
    g.avail[id] = !was;
    if (gamePlayers().length < 5) { g.avail[id] = was; alert('Need at least 5 players.'); return; }
    // Keep everyone still on court where they are; fill any gap, then re-plan the rest.
    const lock = {};
    const line = g.stints[g.cur].lineup || {};
    POS.forEach((n) => { if (line[n] && g.avail[line[n]]) lock[n] = line[n]; });
    replan(g.cur, { lockFirst: lock });
  }

  function openPicker(s, pos) {
    const g = S.game;
    const st = g.stints[s];
    const curId = st.lineup[pos];
    const onAt = {}; POS.forEach((n) => { onAt[st.lineup[n]] = n; });
    const planned = P.minutes(g.stints);
    const opts = gamePlayers().slice().sort((a, b) =>
      (b.pos.includes(pos) - a.pos.includes(pos)) || ((planned[a.id] || 0) - (planned[b.id] || 0)));
    choose(`
      <h3><span class="pos" data-p="${pos}">${pos}</span> ${POS_NAME[pos]} · ${periodLabel(st.period, g.settings.periods)} ${st.start}:00</h3>
      ${opts.map((p) => `<button class="pick ${p.id === curId ? 'cur' : ''}" value="${p.id}">
        <div class="grow"><div class="name">${esc(p.name)}</div>
        <div class="sub">${planned[p.id] || 0} min planned${onAt[p.id] && p.id !== curId ? ' · on at ' + onAt[p.id] + ' (will swap)' : ''}${p.pos.includes(pos) ? '' : ' · <span style="color:var(--warn)">not a ' + pos + '</span>'}${P.mustRest(g.stints, s, S.players).has(p.id) ? ' · <span style="color:var(--warn)">would play full ' + periodWord() + '</span>' : ''}</div></div>
        ${miniPos(p)}</button>`).join('')}
      <button class="btn ghost block" value="">Cancel</button>`, (id) => {
      if (!id || id === curId) return;
      const other = onAt[id];
      st.lineup[pos] = id;
      if (other) st.lineup[other] = curId;
      replan(Math.max(s, g.cur) + 1);
      save(); const y = window.scrollY; render(); window.scrollTo(0, y);
    });
  }

  function shareText() {
    const g = S.game;
    const lines = g.stints.map((s) => `${periodLabel(s.period, g.settings.periods)} ${s.start}-${s.end}: ` +
      POS.map((n) => `${n} ${nameOf(s.lineup[n])}`).join(', '));
    const m = P.minutes(g.stints);
    const mins = Object.keys(m).sort((a, b) => m[b] - m[a]).map((id) => `${nameOf(id)} ${m[id]}m`);
    return 'Rotation\n' + lines.join('\n') + '\n\nMinutes: ' + mins.join(', ');
  }

  // ---------- timer ----------
  let audio = null, wakeLock = null;
  function beep() {
    try {
      if (!audio) return;
      [0, 0.35, 0.7].forEach((t) => {
        const o = audio.createOscillator(), gn = audio.createGain();
        o.frequency.value = 880; o.connect(gn); gn.connect(audio.destination);
        gn.gain.setValueAtTime(0.4, audio.currentTime + t); gn.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + t + 0.3);
        o.start(audio.currentTime + t); o.stop(audio.currentTime + t + 0.3);
      });
    } catch (e) { /* no audio */ }
  }
  async function keepAwake(on) {
    try {
      if (on && 'wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); }
      if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
    } catch (e) { /* not allowed */ }
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && S.game && S.game.timer.endAt) keepAwake(true); });

  function startStop() {
    const t = S.game.timer;
    if (!audio) { try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* none */ } }
    if (audio && audio.state === 'suspended') audio.resume();
    if (t.endAt) { t.left = Math.max(0, (t.endAt - Date.now()) / 1000); t.endAt = null; keepAwake(false); }
    else { t.endAt = Date.now() + t.left * 1000; keepAwake(true); }
    save(); render();
  }
  function goTo(i) {
    const g = S.game;
    const wasRunning = !!g.timer.endAt;
    const samePeriod = g.stints[i] && g.stints[i].period === g.stints[g.cur].period && i > g.cur;
    g.cur = i;
    const len = g.stints[i].len * 60;
    g.timer = { left: len, endAt: wasRunning && samePeriod ? Date.now() + len * 1000 : null, alarmed: false };
    if (!g.timer.endAt) keepAwake(false);
    save(); render();
  }

  setInterval(() => {
    if (!S.game || S.tab !== 'live') return;
    const t = S.game.timer;
    if (!t.endAt) return;
    const left = timeLeft();
    const el = document.getElementById('time');
    if (el) el.textContent = left <= 0 ? 'SUB!' : mmss(left);
    const clock = document.getElementById('clock');
    if (clock) clock.classList.toggle('due', left <= 0);
    if (left <= 0 && !t.alarmed) {
      t.alarmed = true; save();
      beep();
      if (navigator.vibrate) navigator.vibrate([400, 150, 400, 150, 400]);
      render();
    }
  }, 250);

  // ---------- actions ----------
  $view.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-act]'); if (!el) return;
    const id = el.dataset.id;
    switch (el.dataset.act) {
      case 'pos': {
        const p = player(id); const n = Number(el.dataset.p);
        p.pos = p.pos.includes(n) ? p.pos.filter((x) => x !== n) : p.pos.concat(n).sort();
        if (!p.pos.length) { p.pos = [n]; return; }
        break;
      }
      case 'rename': {
        const p = player(id);
        const name = prompt('Player name', p.name); if (name === null) return;
        if (name.trim()) p.name = name.trim();
        const num = prompt('Jersey number (optional)', p.num || ''); if (num !== null) p.num = num.trim();
        break;
      }
      case 'del':
        if (!confirm('Remove ' + player(id).name + ' from the team?')) return;
        S.players = S.players.filter((p) => p.id !== id); delete S.avail[id];
        break;
      case 'avail': S.avail[id] = !isAvail(id); break;
      case 'full': {
        const p = player(id); p.full = !canFull(p);
        if (S.game && S.game.avail[id]) replan(S.game.cur + 1);
        break;
      }
      case 'make': makeGame(); return;
      case 'starter': pickStarter(Number(el.dataset.p)); return;
      case 'clear-starters': S.starters = {}; break;
      case 'goto-setup': S.tab = 'setup'; break;
      case 'toggle': startStop(); return;
      case 'next': goTo(S.game.cur + 1); return;
      case 'prev': goTo(S.game.cur - 1); return;
      case 'cell': openPicker(Number(el.dataset.s), Number(el.dataset.p)); return;
      case 'live-avail': setAvailLive(id); break;
      case 'shuffle': replan(S.game.cur + 1, { shuffle: true }); break;
      case 'share': {
        const text = shareText();
        try {
          if (navigator.share) await navigator.share({ text });
          else { await navigator.clipboard.writeText(text); alert('Plan copied.'); }
        } catch (err) { /* cancelled */ }
        return;
      }
      case 'end':
        if (!confirm('End this game and clear the rotation?')) return;
        keepAwake(false); S.game = null; S.tab = 'setup';
        break;
      default: return;
    }
    save();
    const y = window.scrollY; render(); if (S.tab !== 'setup' || el.dataset.act !== 'goto-setup') window.scrollTo(0, y);
  });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  render();
})();
