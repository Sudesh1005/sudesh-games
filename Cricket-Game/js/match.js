// Kaathu Cricket: match state. Both players apply the same ball outcomes in the same order,
// so the score is always the same on both screens.
export function newMatch(cfg, names, batFirst) {
  const inn = (bat) => ({ bat, bowl: 1 - bat, runs: 0, wkts: 0, balls: 0, extras: 0, fours: 0, sixes: 0, over: [], done: false });
  return { cfg: { overs: cfg.overs, wickets: cfg.wickets }, names, innings: [inn(batFirst), inn(1 - batFirst)], cur: 0, target: null, finished: false, result: null, ballNo: 0 };
}

export const curInn = (m) => m.innings[m.cur];
export const oversText = (balls) => `${Math.floor(balls / 6)}.${balls % 6}`;
export const ballsLeft = (m) => m.cfg.overs * 6 - curInn(m).balls;

// outcome: { runs, out, wide, boundary }. Returns 'ball' | 'over' | 'innings' | 'match'.
export function applyBall(m, o) {
  const I = curInn(m);
  m.ballNo++;
  if (I.balls % 6 === 0 && I.over.length && I.over.filter((x) => x !== 'Wd').length === 6) I.over = [];
  if (o.wide) {
    I.runs += 1; I.extras += 1; I.over.push('Wd');
  } else {
    I.balls++;
    I.runs += o.runs;
    if (o.boundary === 4) I.fours++;
    if (o.boundary === 6) I.sixes++;
    if (o.out) { I.wkts++; I.over.push('W'); } else I.over.push(o.runs ? String(o.runs) : '•');
  }
  const allOut = I.wkts >= m.cfg.wickets, oversDone = I.balls >= m.cfg.overs * 6;
  const chased = m.cur === 1 && I.runs >= m.target;
  if (allOut || oversDone || chased) {
    I.done = true;
    if (m.cur === 0) { m.target = I.runs + 1; m.cur = 1; return 'innings'; }
    m.finished = true; m.result = result(m);
    return 'match';
  }
  return !o.wide && I.balls % 6 === 0 ? 'over' : 'ball';
}

function result(m) {
  const [a, b] = m.innings;
  if (b.runs >= m.target) {
    const left = m.cfg.wickets - b.wkts;
    return { winner: b.bat, text: `${m.names[b.bat]} won by ${left} wicket${left === 1 ? '' : 's'}`, margin: `${m.cfg.overs * 6 - b.balls} balls to spare` };
  }
  if (b.runs === a.runs) return { winner: -1, text: 'Match tied!', margin: 'Both teams scored ' + a.runs };
  const by = a.runs - b.runs;
  return { winner: a.bat, text: `${m.names[a.bat]} won by ${by} run${by === 1 ? '' : 's'}`, margin: '' };
}
