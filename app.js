(()=>{'use strict';
/* ============================================================
   الصوت — WebAudio (بدون ملفات خارجية)
   ============================================================ */
let actx = null;
function initAudio(){ if(actx) return; try{ actx = new (window.AudioContext||window.webkitAudioContext)(); }catch(e){} }
function resumeAudio(){ if(actx && actx.state==='suspended') actx.resume().catch(()=>{}); }

function tone(freq, dur, type, vol, slideTo, delay){
  if(!actx) return;
  const t = actx.currentTime + (delay||0);
  const o = actx.createOscillator();
  const g = actx.createGain();
  o.type = type||'sine';
  o.frequency.setValueAtTime(freq, t);
  if(slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1,slideTo), t+dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol||0.12, t+0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t+dur);
  o.connect(g); g.connect(actx.destination);
  o.start(t); o.stop(t+dur+0.02);
}
function noiseBurst(dur, vol, filterFreq){
  if(!actx) return;
  const t = actx.currentTime;
  const buf = actx.createBuffer(1, Math.floor(actx.sampleRate*dur), actx.sampleRate);
  const d = buf.getChannelData(0);
  for(let i=0;i<d.length;i++) d[i] = (Math.random()*2-1) * Math.pow(1-i/d.length, 2);
  const src = actx.createBufferSource(); src.buffer = buf;
  const g = actx.createGain(); g.gain.value = vol||0.2;
  const f = actx.createBiquadFilter(); f.type='lowpass'; f.frequency.value = filterFreq||900;
  src.connect(f); f.connect(g); g.connect(actx.destination);
  src.start(t);
}
const SFX = {
  // مبروك — نغمة احتفالية صاعدة
  correct(){
    tone(523, 0.12, 'sine', 0.15);
    tone(659, 0.12, 'sine', 0.15, null, 0.10);
    tone(784, 0.12, 'sine', 0.15, null, 0.20);
    tone(1047, 0.25, 'sine', 0.18, null, 0.30);
  },
  wrong(){
    tone(220, 0.18, 'sawtooth', 0.12, 110);
    tone(160, 0.30, 'sawtooth', 0.10, 70, 0.10);
    noiseBurst(0.20, 0.15, 500);
  },
  gameOver(){
    tone(330, 0.25, 'triangle', 0.14, 220);
    tone(220, 0.35, 'triangle', 0.12, 110, 0.20);
    tone(110, 0.50, 'triangle', 0.10, 55, 0.45);
  },
  click(){ tone(660, 0.06, 'sine', 0.08); },
  start(){ tone(440, 0.1, 'triangle', 0.12, 660); tone(660, 0.15, 'triangle', 0.12, 880, 0.10); },
  newRecord(){ 
    [523,659,784,1047,1319].forEach((f,i)=> tone(f, 0.15, 'sine', 0.13, null, i*0.08));
  }
};

/* ============================================================
   حالة اللعبة
   ============================================================ */
const $ = id => document.getElementById(id);
let state = {
  category: null,
  mode: 'classic',
  questions: [],
  current: 0,
  score: 0,
  lives: 3,
  combo: 0,
  timer: null,
  timeLeft: 20,
  answered: false,
  best: 0,
  used: {},
  usedGlobal: [],
  wrong: [],
  totalAnswered: 0,
  correctAnswered: 0
};
try { state.best = Number(localStorage.getItem('noorBest')) || 0; state.used = JSON.parse(localStorage.getItem('noorUsed') || '{}') || {}; state.usedGlobal = JSON.parse(localStorage.getItem('noorUsedGlobal') || '[]') || []; state.wrong = JSON.parse(localStorage.getItem('noorWrong') || '[]') || []; state.totalAnswered = Number(localStorage.getItem('noorTotal') || 0); state.correctAnswered = Number(localStorage.getItem('noorCorrect') || 0); } catch(e) {}

const startScreen = $('startScreen');
const categoryScreen = $('categoryScreen');
const gameScreen = $('gameScreen');
const resultScreen = $('resultScreen');
const statsScreen = $('statsScreen');
const statAnswered = $('statAnswered'), statAccuracy = $('statAccuracy'), statBest = $('statBest'), statMistakes = $('statMistakes'), statMessage = $('statMessage');
const scoreDisplay = $('scoreDisplay');
const comboDisplay = $('comboDisplay');
const comboChip = $('comboChip');
const heartsDisplay = $('heartsDisplay');
const qCounter = $('qCounter');
const questionText = $('questionText');
const optionsContainer = $('optionsContainer');
const timerBar = $('timerBar');
const finalScoreDisplay = $('finalScoreDisplay');
const bestLine = $('bestLine');
const newRecord = $('newRecord');
const resultTitle = $('resultTitle');
const correction = $('correction');
const correctionTitle = $('correctionTitle');
const correctionCorrect = $('correctionCorrect');
const correctionExplanation = $('correctionExplanation');
const correctionOthers = $('correctionOthers');
const correctionSource = $('correctionSource');
const sourcesScreen = $('sourcesScreen');
function renderStats(){ const total=state.totalAnswered||0, correct=state.correctAnswered||0; statAnswered.textContent=total.toLocaleString('en-US'); statAccuracy.textContent=(total?Math.round(correct/total*100):0)+'%'; statBest.textContent=state.best.toLocaleString('en-US'); statMistakes.textContent=state.wrong.length.toLocaleString('en-US'); statMessage.textContent=total?'استمر في المراجعة لتحسين دقتك.':'ابدأ اللعب لتظهر إحصائياتك.'; }
function sourceFor(category){
  if(category === 'prophets') return {name:'القرآن الكريم', url:'https://quran.com/', note:'المواضع القرآنية المتعلقة بقصص الأنبياء والرسل.'};
  if(category === 'seerah') return {name:'الموسوعة التاريخية + مصادر السيرة', url:'https://dorar.net/history', note:'للتسلسل الزمني وأحداث السيرة، مع الرجوع للأحاديث عند الحاجة.'};
  if(category === 'sahaba') return {name:'الموسوعة الحديثية والتاريخية', url:'https://dorar.net/hadith', note:'للألقاب والفضائل والأحداث المنقولة عن الصحابة.'};
  return {name:'الموسوعة التاريخية', url:'https://dorar.net/history', note:'للوقائع والتواريخ والمعارك والفتوحات.'};
}
const correctionNext = $('correctionNext');

const feedback = document.createElement('div');
feedback.className = 'feedback';
$('gameWrap').appendChild(feedback);

const confettiEl = document.createElement('div');
confettiEl.className = 'confetti';
$('gameWrap').appendChild(confettiEl);
if('serviceWorker' in navigator){ window.addEventListener('load', ()=>navigator.serviceWorker.register('sw.js').catch(()=>{})); }

/* ============================================================
   دوال مساعدة
   ============================================================ */
function shuffle(arr){ const a=[...arr]; for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function updateHUD(){
  scoreDisplay.textContent = state.score.toLocaleString('en-US');
  if(state.combo >= 2){ comboChip.style.display='flex'; comboDisplay.textContent = state.combo; }
  else { comboChip.style.display='none'; }
  const hearts = heartsDisplay.querySelectorAll('.heart');
  hearts.forEach((h,i)=> h.classList.toggle('lost', i >= state.lives));
}
function showFeedback(good, text){
  feedback.textContent = text;
  feedback.className = 'feedback show ' + (good ? 'good' : 'bad');
  setTimeout(()=> feedback.classList.remove('show'), 1100);
}
function launchConfetti(){
  const colors = ['#f5c842','#3dd6c4','#ff5a6e','#3dd68c','#a78bfa','#ff9a3d'];
  for(let i=0;i<40;i++){
    const p = document.createElement('div');
    p.className = 'confetti-piece';
    p.style.left = Math.random()*100 + '%';
    p.style.background = colors[Math.floor(Math.random()*colors.length)];
    p.style.animationDuration = (1.2 + Math.random()*1.2) + 's';
    p.style.animationDelay = (Math.random()*0.3) + 's';
    p.style.width = (5 + Math.random()*7) + 'px';
    p.style.height = p.style.width;
    confettiEl.appendChild(p);
    setTimeout(()=> p.remove(), 2800);
  }
}

/* ============================================================
   بدء الجولة
   ============================================================ */
function startGame(category){
  initAudio(); resumeAudio(); SFX.start();
  state.category = category;
  const all = QUESTIONS[category];
  const used = new Set(state.usedGlobal || []);
  let pool = state.mode === 'review' ? all.filter(q => state.wrong.includes(q.q)) : all.filter(q => !used.has(q.q));
  if(state.mode === 'review' && !pool.length){ alert('لا توجد أخطاء محفوظة في هذه الفئة بعد. العب جولة أولًا.'); return; }
  if(state.mode === 'daily'){ const seed=Number(new Date().toISOString().slice(0,10).replace(/-/g,'')); pool=all.slice().sort((a,b)=>((a.q.length*seed)%997)-((b.q.length*seed)%997)); }
  if(pool.length < 10 && state.mode !== 'review' && state.mode !== 'daily'){ used.clear(); pool = all.slice(); state.usedGlobal = []; }
  state.questions = (state.mode === 'daily' ? pool : shuffle(pool)).slice(0, state.mode === 'time' ? 15 : 10);
  state.questions.forEach(q => used.add(q.q));
  state.usedGlobal = Array.from(used);
  state.used[category] = state.usedGlobal;
  try { localStorage.setItem('noorUsed', JSON.stringify(state.used)); localStorage.setItem('noorUsedGlobal', JSON.stringify(state.usedGlobal)); } catch(e) {}
  state.current = 0;
  state.score = 0;
  state.lives = (state.mode === 'perfect' || state.mode === 'time') ? 1 : 3;
  state.combo = 0;
  state.answered = false;

  startScreen.classList.add('hidden');
  categoryScreen.classList.add('hidden');
  resultScreen.classList.add('hidden');
  gameScreen.classList.remove('hidden');
  correction.classList.remove('show');

  updateHUD();
  loadQuestion();
}

function loadQuestion(){
  if(state.current >= state.questions.length || state.lives <= 0){ endGame(); return; }
  state.answered = false;
  correction.classList.remove('show');
  const q = state.questions[state.current];
  qCounter.textContent = 'السؤال ' + (state.current+1) + ' من ' + state.questions.length;
  questionText.textContent = q.q;
  optionsContainer.innerHTML = '';
  q.opts.forEach((opt,i)=>{
    const btn = document.createElement('button');
    btn.className = 'opt-btn';
    btn.textContent = opt;
    btn.addEventListener('click', ()=> selectAnswer(i));
    optionsContainer.appendChild(btn);
  });
  state.timeLeft = state.mode === 'time' ? 10 : 20;
  timerBar.style.width = '100%';
  timerBar.classList.remove('warn');
  clearInterval(state.timer);
  state.timer = setInterval(()=>{
    state.timeLeft -= 0.1;
    const pct = Math.max(0, state.timeLeft/(state.mode === 'time' ? 10 : 20)*100);
    timerBar.style.width = pct + '%';
    if(pct < 35) timerBar.classList.add('warn');
    if(state.timeLeft <= 0){ clearInterval(state.timer); if(!state.answered) selectAnswer(-1); }
  }, 100);
}

function selectAnswer(idx){
  if(state.answered) return;
  state.answered = true;
  clearInterval(state.timer);

  const q = state.questions[state.current];
  const btns = optionsContainer.querySelectorAll('.opt-btn');
  btns.forEach(b=> b.classList.add('disabled'));
  const isCorrect = idx === q.ans;
  state.totalAnswered++;
  if(isCorrect){ state.correctAnswered++; state.wrong = state.wrong.filter(x => x !== q.q); } else { if(!state.wrong.includes(q.q)) state.wrong.push(q.q); }
  try { localStorage.setItem('noorWrong', JSON.stringify(state.wrong)); localStorage.setItem('noorTotal', String(state.totalAnswered)); localStorage.setItem('noorCorrect', String(state.correctAnswered)); } catch(e) {}

  if(isCorrect){
    btns[q.ans].classList.add('correct');
    const points = 100 * Math.max(1, state.combo);
    state.score += points;
    state.combo++;
    SFX.correct();
    launchConfetti();
    showFeedback(true, '🎉 مبروك! +' + points);
  } else {
    if(idx >= 0) btns[idx].classList.add('wrong');
    btns[q.ans].classList.add('correct');
    state.lives--;
    state.combo = 0;
    SFX.wrong();
    showFeedback(false, idx < 0 ? '⌛ انتهى الوقت!' : '✗ إجابة خاطئة');
  }
  updateHUD();

  // عرض مربع التصحيح
  const correctText = q.opts[q.ans];
  correctionTitle.textContent = isCorrect ? '✔ إجابة صحيحة' : '✗ إجابة خاطئة';
  correctionTitle.className = 'correction-title ' + (isCorrect ? 'ok' : 'bad');
  correctionCorrect.innerHTML = '<b>الإجابة الصحيحة:</b> ' + correctText;
  correctionExplanation.innerHTML = '<b>لماذا صحيحة؟</b> ' + (q.why || '—');
  correctionOthers.innerHTML = '<b>لماذا الباقي خطأ؟</b> ' + (q.wrong || '—');
  const src = sourceFor(state.category);
  correctionSource.innerHTML = '<b>المصدر:</b> <a href="' + src.url + '" target="_blank" rel="noopener">' + src.name + '</a><br>' + src.note;
  correction.classList.add('show');
}

correctionNext.addEventListener('click', ()=>{
  SFX.click();
  correction.classList.remove('show');
  if(state.lives <= 0){ endGame(); return; }
  state.current++;
  loadQuestion();
});

function endGame(){
  clearInterval(state.timer);
  gameScreen.classList.add('hidden');
  resultScreen.classList.remove('hidden');
  const isNew = state.score > state.best && state.score > 0;
  if(isNew){ state.best = state.score; try{ localStorage.setItem('noorBest', String(state.best)); }catch(e){} }
  finalScoreDisplay.textContent = state.score.toLocaleString('en-US');
  bestLine.textContent = 'أفضل نتيجة: ' + state.best.toLocaleString('en-US') + ' · الدقة: ' + (state.totalAnswered ? Math.round(state.correctAnswered/state.totalAnswered*100) : 0) + '%';
  newRecord.style.display = isNew ? 'block' : 'none';
  resultTitle.textContent = state.lives <= 0 ? 'نفدت القلوب!' : 'أكملت الجولة!';
  if(isNew){ SFX.newRecord(); launchConfetti(); } else { SFX.gameOver(); }
}

/* ============================================================
   ربط الأحداث
   ============================================================ */
$('startBtn').addEventListener('click', ()=>{ initAudio(); resumeAudio(); SFX.click(); startScreen.classList.add('hidden'); categoryScreen.classList.remove('hidden'); });
$('openStats').addEventListener('click', ()=>{ SFX.click(); renderStats(); startScreen.classList.add('hidden'); statsScreen.classList.remove('hidden'); });
$('backFromStats').addEventListener('click', ()=>{ SFX.click(); statsScreen.classList.add('hidden'); startScreen.classList.remove('hidden'); });
$('openSources').addEventListener('click', ()=>{ SFX.click(); startScreen.classList.add('hidden'); sourcesScreen.classList.remove('hidden'); });
$('backFromSources').addEventListener('click', ()=>{ SFX.click(); sourcesScreen.classList.add('hidden'); startScreen.classList.remove('hidden'); });
document.querySelectorAll('.mode-btn').forEach(btn=>{ btn.addEventListener('click', ()=>{ document.querySelectorAll('.mode-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); state.mode=btn.dataset.mode; }); });
document.querySelectorAll('.cat-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{ SFX.click(); startGame(btn.dataset.cat); });
});
$('backToStart').addEventListener('click', ()=>{ SFX.click(); categoryScreen.classList.add('hidden'); startScreen.classList.remove('hidden'); });
$('resetBank').addEventListener('click', ()=>{ try{ localStorage.removeItem('noorUsed'); localStorage.removeItem('noorUsedGlobal'); state.used={}; state.usedGlobal=[]; }catch(e){} SFX.click(); alert('تم تصفير سجل الأسئلة المستعملة.'); });
$('retryBtn').addEventListener('click', ()=>{ SFX.click(); startGame(state.category); });
$('backToCategory').addEventListener('click', ()=>{ SFX.click(); resultScreen.classList.add('hidden'); categoryScreen.classList.remove('hidden'); });

})();
