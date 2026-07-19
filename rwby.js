// ============================================================
// RWBY DnD — rwby.js
// Full auto-calculations: proficiency, skills, saves, initiative,
// passive perception, attack bonuses, Uncanny Dodge
// Firebase Firestore sync — no import/export needed
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getFirestore, doc, collection, getDoc, getDocs, onSnapshot, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

const FB_CONFIG = {
  apiKey:"AIzaSyCfEtfiU5swXvVkqt4shp8i6h4JYI8ES7U",authDomain:"dand-3c76a.firebaseapp.com",
  projectId:"dand-3c76a",storageBucket:"dand-3c76a.firebasestorage.app",
  messagingSenderId:"27455098509",appId:"1:27455098509:web:432929f697da9a947d5cc4",measurementId:"G-D1TQM5WJT8"
};
const fbApp = initializeApp(FB_CONFIG, 'rwby');
const db    = getFirestore(fbApp);
const DOC   = 'rwby-campaign';

// ================================================================
// CONSTANTS
// ================================================================
const DM_PASS   = '1122334455';
const LOC_KEY   = 'rwby-v4-local';

const STATS = ['STR','DEX','CON','INT','WIS','CHA'];

// Each skill: which stat it uses
const SKILL_DEFS = [
  // STR
  {name:'STR Save',     stat:'STR', isSave:true},
  {name:'Athletics',    stat:'STR'},
  // DEX
  {name:'DEX Save',     stat:'DEX', isSave:true},
  {name:'Acrobatics',   stat:'DEX'},
  {name:'Sleight of Hand',stat:'DEX'},
  {name:'Stealth',      stat:'DEX'},
  // CON
  {name:'CON Save',     stat:'CON', isSave:true},
  {name:'Endurance',    stat:'CON'},
  // INT
  {name:'INT Save',     stat:'INT', isSave:true},
  {name:'Aura Mastery', stat:'INT'},
  {name:'History',      stat:'INT'},
  {name:'Investigation',stat:'INT'},
  {name:'Nature',       stat:'INT'},
  {name:'Religion',     stat:'INT'},
  // WIS
  {name:'WIS Save',     stat:'WIS', isSave:true},
  {name:'Animal Handling',stat:'WIS'},
  {name:'Insight',      stat:'WIS'},
  {name:'Medicine',     stat:'WIS'},
  {name:'Perception',   stat:'WIS'},
  {name:'Survival',     stat:'WIS'},
  // CHA
  {name:'CHA Save',     stat:'CHA', isSave:true},
  {name:'Deception',    stat:'CHA'},
  {name:'Intimidation', stat:'CHA'},
  {name:'Performance',  stat:'CHA'},
  {name:'Persuasion',   stat:'CHA'},
];

const DUST_TYPES = ['Fire Dust','Ice Dust','Electricity Dust','Wind Dust','Earth Dust','Gravity Dust','Hard Light Dust'];
const DUST_CLASS = {'Fire Dust':'dust-fire','Ice Dust':'dust-ice','Electricity Dust':'dust-electricity','Wind Dust':'dust-wind','Earth Dust':'dust-earth','Gravity Dust':'dust-gravity','Hard Light Dust':'dust-hardlight'};
const SEM_KEYS   = ['base','first','second','third','ascended'];
const SEM_LABELS = {base:'Base',first:'1st Evolution',second:'2nd Evolution',third:'3rd Evolution',ascended:'Ascended'};
const DEF_THEME  = {bg:'#020106',panel:'#080510',accent:'#c0000a',accentTwo:'#3a0008',aura:'#00d4ff',text:'#c4d8f4'};

// ================================================================
// CALCULATION ENGINE
// ================================================================
function mod(score) { return Math.floor((Number(score) - 10) / 2); }
function fmtMod(m) { return m >= 0 ? `+${m}` : `${m}`; }

// ── RACE SYSTEM ──────────────────────────────────────────────
const FAUNUS_STAT_BONUS = 5;       // Faunus heritage: +5 to one DM-chosen ability score
// Shop pricing is location-based (see SHOP_LOCATIONS); Faunus do not always get a discount.
// The character's effective ability score, including the Faunus heritage bonus.
function effectiveStat(c, stat){
  let s = Number(c?.stats?.[stat]) || 0;
  if (c && c.race==='faunus' && c.faunusBonusStat===stat) s += FAUNUS_STAT_BONUS;
  try { s += featStatBonus(c, stat); } catch(e) {}   // feats grant flat ability bonuses
  return s;
}
function isFaunus(c){ return c && c.race==='faunus'; }
function raceLabel(c){
  if(!c||!c.race) return '';
  if(c.race==='human') return 'Human';
  if(c.race==='faunus') return c.faunusAnimal ? `Faunus (${c.faunusAnimal})` : 'Faunus';
  return c.race;
}

// Proficiency bonus from level (standard D&D scale)
function profBonus(level) {
  const l = Number(level) || 1;
  return Math.ceil(l / 4) + 1; // Lv1-4→+2, 5-8→+3, 9-12→+4, 13-16→+5, 17-20→+6
}

const HUNTSMAN_RANKS = [
  { id:'initiate', label:'Initiate',           color:'#8a96a2', minLevel:1,  minCommend:0,  desc:'Aura newly unlocked. Not yet enrolled.' },
  { id:'student',  label:'Academy Student',    color:'#00d4ff', minLevel:3,  minCommend:2,  desc:'Training at a combat school. Provisional field work only.' },
  { id:'licensed', label:'Licensed Huntsman',  color:'#5ad17a', minLevel:7,  minCommend:6,  desc:'Holds a Huntsman license. Cleared for paid missions.' },
  { id:'veteran',  label:'Veteran Huntsman',   color:'#c2a23a', minLevel:12, minCommend:14, desc:'A seasoned protector with a proven record against the Grimm.' },
  { id:'legend',   label:'Legendary Huntsman', color:'#c0000a', minLevel:17, minCommend:24, desc:'A name spoken across the kingdoms. The stuff of fairy tales.' }
];
function distinctionCount(c){
  const feats = Array.isArray(c.feats) ? c.feats.length : 0;
  const commend = Array.isArray(c.commendations) ? c.commendations.length : 0;
  return feats + commend;
}
function autoHuntsmanRank(c){
  const lvl = Number(c.level)||1;
  const cm = distinctionCount(c);
  let rank = HUNTSMAN_RANKS[0];
  for(const r of HUNTSMAN_RANKS){ if(lvl>=r.minLevel && cm>=r.minCommend) rank=r; }
  return rank;
}
function huntsmanRank(c){
  if(c.rankOverride){
    const o = HUNTSMAN_RANKS.find(r=>r.id===c.rankOverride);
    if(o) return o;
  }
  return autoHuntsmanRank(c);
}
function nextRankProgress(c){
  const cur = autoHuntsmanRank(c);
  const idx = HUNTSMAN_RANKS.findIndex(r=>r.id===cur.id);
  if(idx>=HUNTSMAN_RANKS.length-1) return null;
  const next = HUNTSMAN_RANKS[idx+1];
  const lvl = Number(c.level)||1;
  const cm = distinctionCount(c);
  return { next, needLevel:Math.max(0,next.minLevel-lvl), needCommend:Math.max(0,next.minCommend-cm) };
}
function renderHuntsmanLicense(){
  const c = getChar();
  const host = el('huntsmanLicense'); if(!host) return;
  const rank = huntsmanRank(c);
  const prog = nextRankProgress(c);
  const lvl = Number(c.level)||1;
  const cm = distinctionCount(c);
  const overridden = !!c.rankOverride;
  let progLine = '';
  if(prog){
    const bits=[];
    if(prog.needLevel>0) bits.push(`${prog.needLevel} more level${prog.needLevel>1?'s':''}`);
    if(prog.needCommend>0) bits.push(`${prog.needCommend} more feat${prog.needCommend>1?'s':''}`);
    progLine = bits.length ? `<div class="lic-next">To <strong>${esc(prog.next.label)}</strong>: ${bits.join(' · ')}</div>` : `<div class="lic-next ready">Eligible for promotion to <strong>${esc(prog.next.label)}</strong></div>`;
  } else {
    progLine = `<div class="lic-next">Highest rank attained.</div>`;
  }
  host.innerHTML = `
    <div class="lic-card" style="--lic:${rank.color}">
      <div class="lic-head">
        <span class="lic-seal">⬢</span>
        <div class="lic-headtext">
          <div class="lic-org">VALE COUNCIL · HUNTSMAN REGISTRY</div>
          <div class="lic-rank">${esc(rank.label)}${overridden?'<span class="lic-manual">manual</span>':''}</div>
        </div>
      </div>
      <div class="lic-name">${esc(c.name||'Unregistered')}</div>
      <div class="lic-desc">${esc(rank.desc)}</div>
      <div class="lic-stats"><span>Lv ${lvl}</span><span>${cm} feat${cm===1?'':'s'}</span></div>
      ${progLine}
      ${dmUnlocked?`<div class="lic-dm">
        <label>DM override rank</label>
        <select id="rankOverrideSelect" class="lic-select">
          <option value="">Auto (by level + feats)</option>
          ${HUNTSMAN_RANKS.map(r=>`<option value="${r.id}" ${c.rankOverride===r.id?'selected':''}>${esc(r.label)}</option>`).join('')}
        </select>
      </div>`:''}
    </div>`;
  if(dmUnlocked){
    el('rankOverrideSelect')?.addEventListener('change', e=>{
      c.rankOverride = e.target.value || null;
      pushState(true); renderHuntsmanLicense(); renderPortrait(c);
    });
  }
}

// Skill total = stat mod + (proficiency if proficient) + extra bonus + feat bonuses
function skillTotal(c, skillName) {
  const def  = SKILL_DEFS.find(s => s.name === skillName);
  if (!def) return 0;
  const statM = mod(effectiveStat(c, def.stat));
  const sk    = c.skills[skillName] || {prof:false, expertise:false, bonus:0};
  const pb    = profBonus(c.level);
  let total   = statM + Number(sk.bonus || 0);
  if (sk.expertise) total += pb * 2;
  else if (sk.prof)  total += pb;
  try { total += featSkillBonus(c, skillName); } catch(e) {}
  return total;
}

// Passive Perception = 10 + your Perception modifier. Any enhancement
// beyond that comes strictly from feats (via effects.passive).
// skillTotal already folds in: WIS mod + proficiency (if proficient) +
// expertise + manual skill bonus + featSkillBonus(Perception).
function passivePerception(c) {
  let total = 10;
  try { total += skillTotal(c, 'Perception'); } catch(e) {}
  try { total += featBonus(c, 'passive'); } catch(e) {}
  return total;
}

// Initiative = DEX mod + manual bonus + feat bonuses
function calcInitiative(c) {
  let t = mod(effectiveStat(c,'DEX')) + Number(c.initiativeBonus || 0);
  try { t += featBonus(c,'initiative'); } catch(e) {}
  return t;
}

// Attack bonus = chosen stat mod + proficiency + feat bonuses
function attackBonus(c) {
  let t = mod(effectiveStat(c, c.attackStat || 'STR')) + profBonus(c.level);
  try { t += featBonus(c,'attack'); } catch(e) {}
  return t;
}

// Spell DC = 8 + proficiency + INT mod + feat bonuses
function spellDC(c) {
  let t = 8 + profBonus(c.level) + mod(effectiveStat(c,'INT'));
  try { t += featBonus(c,'spellDC'); } catch(e) {}
  return t;
}

// ================================================================
// UNCANNY DODGE
// < 20 dmg → 1 AP.   ≥ 20 dmg → floor(dmg/10) AP.
// Damage taken = ceil(dmg / 2)
// ================================================================
function calcUD(dmg) {
  if (!dmg || dmg <= 0) return null;
  const apCost = dmg < 20 ? 1 : Math.floor(dmg / 10);
  const halved = Math.ceil(dmg / 2);
  return { apCost, halved };
}
window.calcUncanny = () => {
  const dmg = parseInt(document.getElementById('uncannyDmg')?.value);
  const res = document.getElementById('uncannyResult');
  if (!res) return;
  if (!dmg || dmg <= 0) { res.innerHTML = '<div class="result-cost">— AP</div><div class="result-half">halved: —</div>'; return; }
  const r = calcUD(dmg);
  const total = r.apCost + r.halved;
  res.innerHTML = `<div class="result-cost">${total} AP</div><div class="result-half">${r.apCost} cost + ${r.halved} dmg</div>`;
};
window.useUncanny = () => {
  const dmg = parseInt(document.getElementById('uncannyDmg')?.value);
  if (!dmg || dmg <= 0) { alert('Enter incoming damage first.'); return; }
  const r = calcUD(dmg);
  const c = getChar();
  const totalAuraCost = r.apCost + r.halved;
  if (c.aura.current < totalAuraCost) { alert(`Not enough Aura! Need ${totalAuraCost} AP (${r.apCost} cost + ${r.halved} halved damage), have ${c.aura.current}.`); return; }
  c.aura.current -= totalAuraCost;
  ensureClamp(c); pushState(true); render();
  document.getElementById('uncannyDmg').value = '';
  window.calcUncanny();
};

// ── DAMAGE TAKEN ──
// Damage hits Temp HP first, then HP
window.previewDamage = () => {
  const inp = document.getElementById('damageTaken');
  const prev = document.getElementById('damagePreview');
  if (!inp || !prev) return;
  const dmg = parseInt(inp.value);
  if (!dmg || dmg <= 0) { prev.textContent = ''; prev.className = 'damage-preview'; return; }
  const c = getChar();
  const tmp = Number(c.tempHp) || 0;
  const absorbed = Math.min(tmp, dmg);
  const hpHit = dmg - absorbed;
  const newHp = Math.max(0, c.hp.current - hpHit);
  let msg = '';
  if (absorbed > 0) msg += `Temp HP absorbs ${absorbed}. `;
  msg += `HP: ${c.hp.current} → ${newHp}`;
  prev.textContent = msg;
  prev.className = 'damage-preview hit';
};
function evalMathInput(raw){
  const s = String(raw||'').trim();
  if(!s) return null;
  if(/^-?\d+(\.\d+)?$/.test(s)) return Math.round(Number(s));
  if(!/^[\d+\-*/().\s]+$/.test(s)) return null;
  try {
    const v = Function('"use strict";return ('+s+')')();
    if(typeof v==='number' && isFinite(v)) return Math.round(v);
  } catch(e){}
  return null;
}
window.applyDamage = () => {
  const inp = document.getElementById('damageTaken');
  const dmg = evalMathInput(inp?.value);
  if (!dmg || dmg <= 0) { alert('Enter a damage amount (you can use math like 12+8).'); return; }
  const c = getChar();
  const tmp = Number(c.tempHp) || 0;
  const absorbed = Math.min(tmp, dmg);
  c.tempHp = tmp - absorbed;
  c.hp.current = Math.max(0, c.hp.current - (dmg - absorbed));
  ensureClamp(c); pushState(true); render();
  inp.value = '';
  const prev = document.getElementById('damagePreview');
  if (prev) { prev.textContent = ''; prev.className = 'damage-preview'; }
};

// ================================================================
// DATA STRUCTURES
// ================================================================
function blankStage() { return {active:'',activeDescription:'',passiveName:'',passiveDescription:'',auraCost:0}; }

function makeBlankSkills() {
  const s = {};
  SKILL_DEFS.forEach(def => { s[def.name] = {prof:false, expertise:false, bonus:0}; });
  return s;
}

function blankChar(i) {
  const dust = {};
  DUST_TYPES.forEach(t => dust[t] = 0);
  return {
    id: `char-${Date.now()}-${i}-${Math.random().toString(16).slice(2)}`,
    name:'', race:'', faunusAnimal:'', faunusBonusStat:'', className:'', age:'', level:1, background:'',
    semblanceName:'', weaponName:'',
    portrait: '',
    accentColor: '',   // #21/#23 — per-character color
    profBonusOverride: null,
    rankOverride: null,
    attackStat: 'STR', initiativeBonus: 0,
    state: i < 4 ? 'active' : 'reserve',
    money: 0,            // Lien — DM-controlled currency
    stats: {STR:10,DEX:10,CON:10,INT:10,WIS:10,CHA:10},
    skills: makeBlankSkills(),
    hp:{current:0,max:0}, aura:{current:0,max:0},
    armor:0, speed:'30 ft', tempHp:0,
    deathSaves: {successes:0, failures:0, stable:false},
    concentration: {active:false, source:''},
    inspiration: 0,
    dmNotes: '',
    resistances:   [],   // damage type strings — half damage from these
    vulnerabilities:[],  // double damage
    immunities:    [],   // zero damage
    weaponsText:'', abilitiesText:'', inventoryText:'', notesText:'',
    weapons: [],         // [{name, damage, dmgType, range, prof, notes}]
    inventory: [],       // [{name, qty, notes}]
    relationships: [],   // #21 — [{name, type, notes}]
    curses: [],          // [{id, name, severity, duration, text, rolledAt}]
    commendations: [],   // earned commendation ids (DM-granted, cosmetic)
    compass: [],         // Holy Armaments / Cursed Tools bound to this character (DM-managed)
    feats: [],           // mechanical feat ids (DM-granted, change real numbers)
    feats: [],           // custom DM-created feats [{id, name, desc, ts}]
    dustInventory: dust, dustSpells:[], techniques:[], conditions:[],
    semblance:{
      base:blankStage(),first:blankStage(),second:blankStage(),third:blankStage(),ascended:blankStage(),
      unlocked:{first:false,second:false,third:false,ascended:false}
    }
  };
}

const DEF_STATE = {
  selectedCharacter:0, activeTab:'skills',
  showReserve:false, showDead:false,
  theme:{...DEF_THEME},
  shop:[],
  bestiary:[],          // LEGACY — a single shared list. Migrated into bestiaries[] on load.
  bestiaries:[],        // NEW — [{id, name, entries:[], viewers:[charId], color}]
  customFeats:[],
  weather:'none', sceneTime:'auto',
  sessionLog:[],
  rollLog:[],           // last N rolls: [{id, ts, who, formula, result, crit, kind}]
  initiative:{active:false, round:1, turnIdx:0, entries:[]}, // combat tracker
  shopLocation:'vale',
  cctOnline:true,
  characters:[blankChar(0),blankChar(1),blankChar(2),blankChar(3)]
};

let state  = structuredClone(DEF_STATE);
let _unsub = null;
let _welcomeShown = false; // shows once per page load after data arrives
let dmUnlocked = sessionStorage.getItem('rwby-dm') === '1';
let spectator = sessionStorage.getItem('rwby-spectator') === '1';
// Per-viewer character selection. This is LOCAL to this browser and never shared —
// so a Watcher or DM browsing characters (and players selecting their own) never
// forces anyone else's view to change. Falls back to the shared value only as a seed.
let _viewIdx = (() => {
  const v = parseInt(localStorage.getItem('rwby-view-idx'));
  return Number.isFinite(v) && v >= 0 ? v : 0;
})();
// Fingerprint of everything the current browser can actually SEE.
// Used to skip repaints when a remote change is irrelevant to this player.
let _lastVisibleFp = '';
// Ensures the stale-claim cleanup for watcher/DM runs once per session.
let _claimReconciled = false;
function getViewIdx() {
  const n = (state.characters || []).length;
  if (n === 0) return 0;
  // Players are always pinned to their own claimed character.
  if (!dmUnlocked && !spectator) {
    const mineIdx = state.characters.findIndex(c => c.claimedBy === MY_PRESENCE_ID);
    if (mineIdx >= 0) return mineIdx;
  }
  if (_viewIdx >= n) _viewIdx = n - 1;
  if (_viewIdx < 0) _viewIdx = 0;
  return _viewIdx;
}
function setViewIdx(i) {
  const n = (state.characters || []).length;
  _viewIdx = Math.max(0, Math.min(i, Math.max(0, n - 1)));
  localStorage.setItem('rwby-view-idx', _viewIdx);
}
let _lastAppliedRaw = null; // flicker guard: last raw payload we rendered


// ── PRESENCE ── each browser gets a random color + tab ID
const MY_PRESENCE_ID = localStorage.getItem('rwby-pid') || (() => { const id = Math.random().toString(36).slice(2); localStorage.setItem('rwby-pid', id); return id; })();
const PRESENCE_COLORS = ['#ff6b6b','#4ecdc4','#ffe66d','#a29bfe','#fd79a8','#55efc4','#fdcb6e','#74b9ff'];
const MY_COLOR = PRESENCE_COLORS[Math.floor(Math.random()*PRESENCE_COLORS.length)];
let _presenceUnsub = null;

async function pushPresence() {
  try {
    const mine = getMyCharacter();
    const name = mine?.name || 'Unknown';
    const color = mine?.accentColor || MY_COLOR;
    await setDoc(doc(db, 'rwby-presence', MY_PRESENCE_ID), {
      id: MY_PRESENCE_ID, name, color,
      tab: getViewIdx(), ts: Date.now()
    });
  } catch(e) {}
}
let _livePresenceIds = new Set([MY_PRESENCE_ID]); // who is actually here right now
function startPresenceListener() {
  if (_presenceUnsub) _presenceUnsub();
  _presenceUnsub = onSnapshot(collection(db, 'rwby-presence'), snap => {
    const now = Date.now();
    const active = [];
    const liveIds = new Set();
    snap.forEach(d => {
      const p = d.data();
      if (now - p.ts < 35000) {
        active.push(p);
        liveIds.add(p.id);
      } else {
        // Auto-purge stale presence docs (older than 35s with no heartbeat)
        deleteDoc(doc(db, 'rwby-presence', d.id)).catch(()=>{});
      }
    });
    liveIds.add(MY_PRESENCE_ID); // always count myself
    _livePresenceIds = liveIds;
    renderPresence(active);
    // A claim only counts as "taken" if the claimer is still present
    try { refreshWelcomeTaken(); } catch(e) {}
    try { renderCharacterTabs(); } catch(e) {}
  }, ()=>{});
}
// True only if someone OTHER than me currently holds this character AND is live
function isTakenByLiveOther(c) {
  return !!c.claimedBy && c.claimedBy !== MY_PRESENCE_ID && _livePresenceIds.has(c.claimedBy);
}
function refreshWelcomeTaken() {
  const list = document.getElementById('welcomeCharList'); if (!list) return;
  state.characters.forEach((c, realIdx) => {
    if (c.state !== 'active') return;
    const btn = list.querySelector(`[data-welcome-idx="${realIdx}"]`); if (!btn) return;
    const taken = isTakenByLiveOther(c);
    btn.disabled = taken;
    btn.classList.toggle('taken', taken);
    const lbl = btn.querySelector('.taken-label');
    if (taken && !lbl) { const s = document.createElement('span'); s.className = 'taken-label'; s.textContent = 'Taken'; btn.appendChild(s); }
    else if (!taken && lbl) { lbl.remove(); }
  });
}
function renderPresence(players) {
  const el2 = document.getElementById('presenceBar'); if (!el2) return;
  if (!players.length) { el2.innerHTML = ''; return; }
  el2.innerHTML = players.map(p =>
    `<div class="presence-dot" style="border-color:${p.color};box-shadow:0 0 8px ${p.color}55" title="${esc(p.name)}">
      <span style="background:${p.color}"></span>${esc(p.name.split(' ')[0]||'?')}
    </div>`
  ).join('');
}
// Heartbeat every 20s (well within 35s window)
setInterval(pushPresence, 20000);

let _threatLevel = 0;
let _threatUnsub = null;
const THREAT_BANDS = [
  { min:0,  max:19,  id:'calm',     label:'Calm',          color:'#5ad17a', desc:'Grimm activity is minimal. The region breathes easy.' },
  { min:20, max:39,  id:'unsettled',label:'Unsettled',     color:'#c2a23a', desc:'Negativity is drawing them closer. Scouts report movement.' },
  { min:40, max:59,  id:'active',   label:'Active',        color:'#e0802a', desc:'Grimm are hunting. Travel between settlements is dangerous.' },
  { min:60, max:79,  id:'swarming', label:'Swarming',      color:'#c0000a', desc:'A horde is gathering. The kingdom raises its defenses.' },
  { min:80, max:100, id:'incursion',label:'Incursion',     color:'#a020c0', desc:'Full breach. The Grimm are at the walls. This is a battle for survival.' }
];
function threatBand(v){
  const n = Math.max(0, Math.min(100, Number(v)||0));
  return THREAT_BANDS.find(b=>n>=b.min && n<=b.max) || THREAT_BANDS[0];
}
async function setThreatLevel(v){
  if(!dmUnlocked) return;
  const n = Math.max(0, Math.min(100, Math.round(Number(v)||0)));
  _threatLevel = n;
  try{ await setDoc(doc(db,'rwby-meta','threat'),{ level:n, ts:Date.now() }); }catch(e){}
  renderThreatMeter();
}
function startThreatListener(){
  if(_threatUnsub) _threatUnsub();
  _threatUnsub = onSnapshot(doc(db,'rwby-meta','threat'), snap=>{
    if(!snap.exists()) return;
    const d = snap.data();
    if(typeof d.level==='number'){
      const prevBand = threatBand(_threatLevel).id;
      _threatLevel = Math.max(0, Math.min(100, d.level));
      renderThreatMeter();
      applyThreatAtmosphere();
      const newBand = threatBand(_threatLevel).id;
      if(newBand!==prevBand && newBand==='incursion') flashIncursion();
    }
  }, ()=>{});
}
function applyThreatAtmosphere(){
  const band = threatBand(_threatLevel);
  document.body.classList.remove('threat-calm','threat-unsettled','threat-active','threat-swarming','threat-incursion');
  document.body.classList.add('threat-'+band.id);
}
function flashIncursion(){
  if(document.getElementById('incursionFlash')) return;
  const f=document.createElement('div');
  f.id='incursionFlash'; f.className='incursion-flash';
  f.innerHTML=`<div class="incursion-inner"><div class="incursion-title">⚠ GRIMM INCURSION ⚠</div><div class="incursion-sub">The walls are breached. All Huntsmen to arms.</div></div>`;
  document.body.appendChild(f);
  setTimeout(()=>{ f.classList.add('out'); setTimeout(()=>f.remove(),600); }, 3500);
}
function renderThreatMeter(){
  const host = el('threatMeter'); if(!host) return;
  const band = threatBand(_threatLevel);
  const v = _threatLevel;
  host.innerHTML = `
    <div class="threat-card" style="--threat:${band.color}">
      <div class="threat-head">
        <span class="threat-glyph">☢</span>
        <div class="threat-headtext">
          <div class="threat-org">GRIMM ACTIVITY · REGIONAL ALERT</div>
          <div class="threat-band">${esc(band.label)} <span class="threat-num">${v}</span></div>
        </div>
      </div>
      <div class="threat-bar"><div class="threat-fill" style="width:${v}%"></div>
        ${[20,40,60,80].map(t=>`<span class="threat-tick" style="left:${t}%"></span>`).join('')}
      </div>
      <div class="threat-desc">${esc(band.desc)}</div>
      ${dmUnlocked?`<div class="threat-dm">
        <input id="threatSlider" type="range" min="0" max="100" value="${v}" class="threat-slider">
        <div class="threat-dm-btns">
          <button class="threat-adj" data-d="-10">−10</button>
          <button class="threat-adj" data-d="-5">−5</button>
          <button class="threat-adj" data-d="5">+5</button>
          <button class="threat-adj" data-d="10">+10</button>
        </div>
      </div>`:''}
    </div>`;
  if(dmUnlocked){
    el('threatSlider')?.addEventListener('input', e=>{ _threatLevel=Number(e.target.value); const b=threatBand(_threatLevel); host.querySelector('.threat-fill').style.width=_threatLevel+'%'; host.querySelector('.threat-num').textContent=_threatLevel; host.querySelector('.threat-card').style.setProperty('--threat',b.color); host.querySelector('.threat-band').childNodes[0].textContent=b.label+' '; host.querySelector('.threat-desc').textContent=b.desc; });
    el('threatSlider')?.addEventListener('change', e=>setThreatLevel(Number(e.target.value)));
    host.querySelectorAll('.threat-adj').forEach(b=>b.addEventListener('click',()=>setThreatLevel(_threatLevel+Number(b.dataset.d))));
  }
}

let _scrollTab = 'team';
function toggleScroll(){
  const p = el('scrollPanel'); if(!p) return;
  p.classList.toggle('open');
  if(p.classList.contains('open')) renderScroll();
}
function setScrollTab(t){ _scrollTab = t; renderScroll(); }
function renderScroll(){
  const body = el('scrollBody'); if(!body) return;
  const online = state.cctOnline !== false;
  const statusEl = el('scrollStatus');
  if(statusEl){
    statusEl.className = 'scroll-status ' + (online?'online':'offline');
    statusEl.textContent = online ? '● CCT ONLINE' : '✕ CCT OFFLINE';
  }
  document.querySelectorAll('.scroll-tab').forEach(b=>b.classList.toggle('active', b.dataset.stab===_scrollTab));

  if(_scrollTab==='team'){
    const team = state.characters.filter(c=>c.state==='active' && (c.name||'').trim());
    if(!team.length){ body.innerHTML=`<div class="scroll-empty">No active Huntsmen registered.</div>`; return; }
    body.innerHTML = `<div class="scroll-list">`+team.map(c=>{
      const hpPct = c.hp.max>0 ? Math.round(c.hp.current/c.hp.max*100) : 0;
      const auPct = c.aura.max>0 ? Math.round(c.aura.current/c.aura.max*100) : 0;
      const hpColor = hpPct<=25?'#c0000a':hpPct<=50?'#e0802a':'#5ad17a';
      const down = c.hp.max>0 && c.hp.current<=0;
      const col = c.accentColor||'#00d4ff';
      return `<div class="scroll-member${down?' down':''}">
        <div class="scroll-member-top">
          <span class="scroll-dot" style="background:${col}"></span>
          <span class="scroll-member-name">${esc(c.name)}</span>
          ${down?'<span class="scroll-down-tag">DOWN</span>':''}
        </div>
        <div class="scroll-vital"><span>Aura</span><div class="scroll-vbar"><div style="width:${auPct}%;background:#00d4ff"></div></div><span>${auPct}%</span></div>
        <div class="scroll-vital"><span>HP</span><div class="scroll-vbar"><div style="width:${hpPct}%;background:${hpColor}"></div></div><span>${hpPct}%</span></div>
      </div>`;
    }).join('')+`</div>`;
  } else if(_scrollTab==='contacts'){
    if(!online){ body.innerHTML=`<div class="scroll-offline-msg">📡 The CCT is down. Contacts are unavailable until the network is restored.</div>`; return; }
    const c = getChar();
    const rels = Array.isArray(c.relationships)?c.relationships:[];
    if(!rels.length){ body.innerHTML=`<div class="scroll-empty">No contacts saved.</div>`; return; }
    body.innerHTML = `<div class="scroll-list">`+rels.map(r=>{
      const color = (typeof RELATION_COLORS!=='undefined' && RELATION_COLORS[r.type])||'#8090a0';
      const icon = (typeof RELATION_ICONS!=='undefined' && RELATION_ICONS[r.type])||'•';
      return `<div class="scroll-contact" style="--cc:${color}">
        <span class="scroll-contact-icon">${icon}</span>
        <div class="scroll-contact-main">
          <span class="scroll-contact-name">${esc(r.name||'Unknown')}</span>
          <span class="scroll-contact-role">${esc(r.role||r.type||'')}</span>
        </div>
      </div>`;
    }).join('')+`</div>`;
  } else if(_scrollTab==='alerts'){
    if(!online){ body.innerHTML=`<div class="scroll-offline-msg">📡 The CCT is down. No alerts can be received.</div>`; return; }
    if(!_scrollLastAlert){ body.innerHTML=`<div class="scroll-empty">No active mission alerts.</div>`; return; }
    body.innerHTML = `<div class="scroll-alert"><div class="scroll-alert-head">⚠ PRIORITY TRANSMISSION</div><div class="scroll-alert-body">${esc(_scrollLastAlert)}</div></div>`;
  }
}

// ── BROADCAST (DM message to all) ──
async function sendBroadcast(msg) {
  if (!msg.trim()) return;
  await setDoc(doc(db,'rwby-meta','broadcast'),{msg, ts:Date.now(), from:'DM', cleared:false});
}
async function clearBroadcast() {
  // DM clears the active broadcast for everyone
  await setDoc(doc(db,'rwby-meta','broadcast'),{msg:'', ts:Date.now(), from:'DM', cleared:true});
}
let _broadcastUnsub = null;
let _lastBroadcastTs = 0;
let _scrollLastAlert = '';
function startBroadcastListener() {
  if (_broadcastUnsub) _broadcastUnsub();
  _broadcastUnsub = onSnapshot(doc(db,'rwby-meta','broadcast'), snap => {
    if (!snap.exists()) return;
    const d = snap.data();
    if (d.ts > _lastBroadcastTs) {
      _lastBroadcastTs = d.ts;
      if (d.cleared || !d.msg) {
        document.getElementById('broadcastBanner')?.remove();
        _scrollLastAlert = '';
      } else {
        _scrollLastAlert = d.msg;
        showBroadcast(d.msg);
      }
      if(document.getElementById('scrollPanel')?.classList.contains('open')) renderScroll();
    }
  },()=>{});
}
function showBroadcast(msg) {
  let banner = document.getElementById('broadcastBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'broadcastBanner';
    banner.className = 'broadcast-banner';
    document.body.appendChild(banner);
  }
  const dmControls = dmUnlocked
    ? `<button class="bc-clear" title="Clear for everyone">Clear for all</button>`
    : '';
  banner.innerHTML = `<span class="broadcast-from">📡 DM:</span> <span class="bc-msg">${esc(msg)}</span> ${dmControls}<button class="bc-dismiss" title="Dismiss">×</button>`;
  banner.classList.add('show');
  // Dismiss locally
  banner.querySelector('.bc-dismiss')?.addEventListener('click', () => banner.remove());
  // DM: clear for everyone
  banner.querySelector('.bc-clear')?.addEventListener('click', () => { clearBroadcast(); banner.remove(); });
  // Banner persists until dismissed or cleared (no auto-hide)
}

// ================================================================
// CURSE WHEEL
// DM sends the wheel to a target player (by their presence id).
// Only that player's screen shows it. They spin, result → their Notes.
// ================================================================
let _curseUnsub = null;
let _lastCurseTs = 0;

async function sendCurseWheel(targetPresenceId) {
  await setDoc(doc(db, 'rwby-meta', 'cursewheel'), {
    target: targetPresenceId,
    ts: Date.now(),
    by: 'DM'
  });
}

function startCurseListener() {
  if (_curseUnsub) _curseUnsub();
  let _firstSnap = true;
  _curseUnsub = onSnapshot(doc(db, 'rwby-meta', 'cursewheel'), snap => {
    if (!snap.exists()) return;
    const d = snap.data();
    // On the very first snapshot (page load), just record the current ts and do NOT
    // fire the wheel — otherwise an old trigger from a previous session pops up on join.
    if (_firstSnap) {
      _firstSnap = false;
      _lastCurseTs = d.ts || 0;
      return;
    }
    if (d.ts <= _lastCurseTs) return;
    _lastCurseTs = d.ts;
    // Only show the wheel if I'm the target the DM chose
    if (d.target === MY_PRESENCE_ID) {
      showCurseWheel();
    }
  }, ()=>{});
}

function showCurseWheel() {
  if (!window.CURSES || !window.CURSES.length) { alert('Curses not loaded.'); return; }
  document.getElementById('curseOverlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'curseOverlay';
  overlay.className = 'curse-overlay';
  overlay.innerHTML = `
    <div class="curse-fog"></div>
    <div class="curse-modal">
      <div class="curse-runes"></div>
      <div class="curse-header">
        <div class="curse-title">Wheel of Misfortune</div>
        <div class="curse-sub">The DM has chosen you. Spin, and accept what the dark decides.</div>
      </div>
      <div class="curse-wheel-wrap">
        <div class="curse-pointer"></div>
        <div class="curse-wheel-ring"></div>
        <div class="curse-wheel" id="curseWheel"></div>
        <div class="curse-wheel-center"></div>
      </div>
      <div class="curse-legend">
        <span><i class="leg mild"></i>Mild</span>
        <span><i class="leg moderate"></i>Moderate</span>
        <span><i class="leg severe"></i>Severe</span>
        <span><i class="leg extreme"></i>Extreme</span>
      </div>
      <button class="curse-spin-btn" id="curseSpinBtn">SPIN</button>
      <div class="curse-result" id="curseResult"></div>
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));

  buildWheelGraphic();

  const btn = document.getElementById('curseSpinBtn');
  btn.addEventListener('click', () => spinCurseWheel(btn));
}

// Visible wheel: 24 segments colored purely by severity, no numbers
let _wheelSample = [];
function buildWheelGraphic() {
  const wheel = document.getElementById('curseWheel'); if (!wheel) return;
  const N = 24;
  const pool = [...window.CURSES];
  _wheelSample = [];
  for (let i = 0; i < N && pool.length; i++) {
    _wheelSample.push(pool.splice(Math.floor(Math.random()*pool.length), 1)[0]);
  }
  const seg = 360 / _wheelSample.length;
  // Evil severity palette — deep, ominous
  const colors = {
    mild:     '#1c4a3a',
    moderate: '#5a3a0a',
    severe:   '#6a1505',
    extreme:  '#3a0010'
  };
  const glows = {
    mild:     '#2a7a5a',
    moderate: '#8a5a10',
    severe:   '#a02508',
    extreme:  '#7a0020'
  };
  // alternate slightly darker shade per segment for depth
  let stops = [];
  _wheelSample.forEach((c, i) => {
    const base = colors[c.severity] || '#222';
    const lit  = glows[c.severity]  || '#444';
    const col = i % 2 === 0 ? base : lit;
    stops.push(`${col} ${(i*seg).toFixed(2)}deg ${((i+1)*seg).toFixed(2)}deg`);
  });
  wheel.style.background = `conic-gradient(from 0deg, ${stops.join(',')})`;
  wheel.innerHTML = ''; // no numbers — colors only
}

let _spinning = false;
function spinCurseWheel(btn) {
  if (_spinning) return;
  _spinning = true;
  btn.disabled = true;
  btn.textContent = 'SPINNING...';

  // The ACTUAL curse is drawn from the full pool (weighted toward less extreme)
  const roll = Math.random();
  let pool;
  if (roll < 0.40)      pool = window.CURSES.filter(c => c.severity === 'mild');
  else if (roll < 0.72) pool = window.CURSES.filter(c => c.severity === 'moderate');
  else if (roll < 0.92) pool = window.CURSES.filter(c => c.severity === 'severe');
  else                  pool = window.CURSES.filter(c => c.severity === 'extreme');
  if (!pool.length) pool = window.CURSES;
  const result = pool[Math.floor(Math.random() * pool.length)];

  // Spin animation: land on a random visible segment (cosmetic)
  const wheel = document.getElementById('curseWheel');
  const seg = 360 / _wheelSample.length;
  const targetSeg = Math.floor(Math.random() * _wheelSample.length);
  const spins = 6 + Math.floor(Math.random()*3);
  const finalDeg = spins*360 + (360 - targetSeg*seg - seg/2);
  wheel.style.transition = 'transform 5s cubic-bezier(.15,.85,.25,1)';
  wheel.style.transform = `rotate(${finalDeg}deg)`;

  setTimeout(() => {
    revealCurse(result);
    _spinning = false;
  }, 5200);
}

function revealCurse(curse) {
  const resultEl = document.getElementById('curseResult');
  const sevLabel = { mild:'Mild', moderate:'Moderate', severe:'Severe', extreme:'EXTREME' }[curse.severity];
  const dur = curse.duration || '1 session';
  const durLabel = dur === 'permanent' ? '☠ PERMANENT' : '⏳ ' + dur;
  resultEl.innerHTML = `
    <div class="curse-card curse-${curse.severity}">
      <div class="curse-card-top">
        <span class="curse-num">Curse #${curse.id}</span>
        <span class="curse-sev curse-sev-${curse.severity}">${sevLabel}</span>
      </div>
      <div class="curse-name">${esc(curse.name)}</div>
      <div class="curse-duration ${dur === 'permanent' ? 'perm' : ''}">${durLabel}</div>
      <div class="curse-text">${esc(curse.text)}</div>
      <button class="neo-btn curse-accept-btn" id="curseAcceptBtn">Accept Your Fate</button>
    </div>`;
  resultEl.classList.add('show');

  document.getElementById('curseAcceptBtn')?.addEventListener('click', () => {
    applyCurse(curse);
    document.getElementById('curseOverlay')?.classList.remove('open');
    setTimeout(() => document.getElementById('curseOverlay')?.remove(), 400);
    showToast(`Curse "${curse.name}" now afflicts you`, 'danger', 5000);
  });
}

function applyCurse(curse) {
  const c = getMyCharacter() || getChar();
  if (!c) return;
  if (!Array.isArray(c.curses)) c.curses = [];
  c.curses.push({
    id: curse.id,
    name: curse.name,
    severity: curse.severity,
    duration: curse.duration || '1 session',
    text: curse.text,
    rolledAt: Date.now()
  });
  // Jump to the Curses tab so they see it land
  state.activeTab = 'curses';
  pushState(true);
  render();
}

let _pushDebounce = null;
async function pushState(immediate = false) {
  if (spectator) return; // spectators never write
  const hasData = state.characters.some(c => c.name && c.name.trim());
  if (!hasData) return;
  if (immediate) {
    setSyncDot('syncing');
    try {
      await setDoc(doc(db, 'campaigns', 'rwby-campaign'), { data: JSON.stringify(state) });
      setSyncDot('synced');
    } catch(e) { console.error(e); setSyncDot('error'); }
    return;
  }
  // Debounce text input pushes by 600ms to avoid spamming Firebase
  setSyncDot('syncing');
  clearTimeout(_pushDebounce);
  _pushDebounce = setTimeout(async () => {
    try {
      await setDoc(doc(db, 'campaigns', 'rwby-campaign'), { data: JSON.stringify(state) });
      setSyncDot('synced');
    } catch(e) { console.error(e); setSyncDot('error'); }
  }, 600);
}
// Force any pending debounced write to flush immediately (on blur / before leaving).
function flushPendingPush(){ if(_pushDebounce){ clearTimeout(_pushDebounce); _pushDebounce=null; pushState(true); } }

function startListener() {
  if (_unsub) _unsub();
  _unsub = onSnapshot(doc(db, 'campaigns', 'rwby-campaign'), snap => {
    if (!snap.exists()) return;
    try {
      const raw = snap.data().data;
      // ── FLICKER GUARD ──
      // If the incoming payload is byte-identical to what we last applied,
      // there is nothing visible to change — skip the whole re-render. This
      // stops the "characters refreshing" flash caused by our own write echoes.
      if (raw === _lastAppliedRaw) { setSyncDot('synced'); return; }
      _lastAppliedRaw = raw;

      const remote = normalize(JSON.parse(raw));
      checkStateChanges(remote);  // #31 toasts

      // ── Stale-claim reconciliation ────────────────────────
      // A watcher or DM must never hold a character. Because MY_PRESENCE_ID
      // lives in localStorage and claimedBy lives in Firebase, a claim from an
      // EARLIER session survives a reload and would silently pin them to that
      // sheet. Drop it as soon as we see real data.
      if ((spectator || dmUnlocked) && !_claimReconciled) {
        _claimReconciled = true;
        const held = state.characters.some(c => c.claimedBy === MY_PRESENCE_ID);
        if (held) {
          releaseMyClaim(true);
          console.log('[rwby] released a stale character claim (watcher/DM mode)');
        }
      }

      const ae = document.activeElement;
      const isTyping = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT');
      const myIdx = state.characters.findIndex(c => c.claimedBy === MY_PRESENCE_ID);

      remote.characters.forEach((rc, i) => {
        if (isTyping && i === (myIdx >= 0 ? myIdx : getViewIdx())) return;
        state.characters[i] = rc;
      });
      while (state.characters.length < remote.characters.length)
        state.characters.push(remote.characters[state.characters.length]);
      if (state.characters.length > remote.characters.length)
        state.characters.length = remote.characters.length;
      if (state.selectedCharacter >= state.characters.length)
        state.selectedCharacter = Math.max(0, state.characters.length - 1);
      state.theme = remote.theme;
      state.weather = remote.weather;
      state.sceneTime = remote.sceneTime;
      state.sessionLog = remote.sessionLog;
      if(typeof remote.shopLocation==='string') state.shopLocation = remote.shopLocation;
      state.cctOnline = remote.cctOnline;
      if (Array.isArray(remote.bestiary)) state.bestiary = remote.bestiary;
      if (Array.isArray(remote.bestiaries)) state.bestiaries = remote.bestiaries;
      if (Array.isArray(remote.customFeats)) state.customFeats = remote.customFeats;
      if (Array.isArray(remote.rollLog))    state.rollLog    = remote.rollLog;
      if (remote.initiative && typeof remote.initiative==='object') state.initiative = remote.initiative;
      try { applyWeather(); applyTimeSkin(); } catch(e){}
      state.shop = remote.shop;
      if ((!Array.isArray(state.shop) || !state.shop.length)) {
        if (seedShopIfEmpty() && dmUnlocked) pushState(true);
      }
      setSyncDot('synced');

      if (isTyping) {
        try { renderCharacterTabs(); } catch(e) {}
        try { applyTheme(); }          catch(e) {}
        try { applyCharacterAccents(); } catch(e) {}
        recheckWelcomeIfNeeded();
        if (!document.getElementById('welcomeOverlay') && !_welcomeShown) {
          _welcomeShown = true; checkWelcome();
        }
        return;
      }

      // ── Quiet background sync ──────────────────────────────
      // A player who only sees their own sheet shouldn't get a visible
      // re-render every time someone ELSE changes something. Fingerprint
      // just the slice this browser can actually see; if it's unchanged,
      // update silently and skip the repaint entirely.
      const myIdx2 = state.characters.findIndex(c => c.claimedBy === MY_PRESENCE_ID);
      const soloView2 = !dmUnlocked && !spectator && myIdx2 >= 0;
      if (soloView2) {
        let fp = '';
        try { fp = JSON.stringify(state.characters[myIdx2]) + '|' + JSON.stringify(state.theme)
                 + '|' + state.weather + '|' + state.sceneTime + '|' + JSON.stringify(state.shop)
                 + '|' + state.shopLocation + '|' + state.cctOnline
                 + '|' + JSON.stringify(state.bestiary)
                 + '|' + JSON.stringify(state.bestiaries)
                 + '|' + JSON.stringify(state.customFeats); } catch(e) {}
        if (fp && fp === _lastVisibleFp) {
          // nothing visible to this player changed — stay silent
          recheckWelcomeIfNeeded();
          if (!document.getElementById('welcomeOverlay') && !_welcomeShown) {
            _welcomeShown = true; checkWelcome();
          }
          return;
        }
        _lastVisibleFp = fp;
      }

      try { renderCharacterTabs(); } catch(e) {}
      try { renderHeader();        } catch(e) {}
      try { applyTheme();          } catch(e) {}
      try { renderMainFields();    } catch(e) {}
      try { renderCalcPanel();     } catch(e) {}
      try { renderStats();         } catch(e) {}
      try { renderRacePanel();     } catch(e) {}
      try { renderSkillsMatrix();  } catch(e) {}
      try { renderSemblance();     } catch(e) {}
      try { renderTechniques();    } catch(e) {}
      try { renderDust();          } catch(e) {}
      try { renderRelationships(); } catch(e) {}
      try { renderCurses();        } catch(e) {}
      try { renderWeapons();       } catch(e) {}
      try { renderInventory();     } catch(e) {}
      try { applyCharacterAccents(); } catch(e) {}
      try { checkLowHp(getChar()); }   catch(e) {}
      try { if (spectator) disableAllInputs(); } catch(e) {}
      recheckWelcomeIfNeeded();
      // Show welcome on every page load once we have real data
      if (!document.getElementById('welcomeOverlay') && !_welcomeShown) {
        _welcomeShown = true;
        checkWelcome();
      }
    } catch(e) { console.error('Snapshot error:', e); }
  }, e => { console.error(e); setSyncDot('error'); });
}

function setSyncDot(s) {
  const d = document.getElementById('syncDot'); if (!d) return;
  d.className = 'sync-dot ' + s;
  d.title = {synced:'Synced', syncing:'Syncing…', error:'Offline — changes may not save'}[s]||s;
}



function normalize(raw) {
  const m = structuredClone(DEF_STATE);
  Object.assign(m, raw || {});
  // Always merge theme with defaults — old Firebase data may have rgba() strings not hex
  m.theme = {...DEF_THEME, ...(raw?.theme || {})};
  if(!['none','rain','snow','ash'].includes(m.weather)) m.weather='none';
  if(!['auto','dawn','day','dusk','night','bloodmoon'].includes(m.sceneTime)) m.sceneTime='auto';
  if(!Array.isArray(m.sessionLog)) m.sessionLog=[];
  if(!Array.isArray(m.rollLog))    m.rollLog=[];
  if(!m.initiative || typeof m.initiative!=='object'){ m.initiative = {active:false, round:1, turnIdx:0, entries:[]}; }
  else {
    m.initiative.active  = !!m.initiative.active;
    m.initiative.round   = Math.max(1, Number(m.initiative.round)||1);
    m.initiative.turnIdx = Math.max(0, Number(m.initiative.turnIdx)||0);
    m.initiative.entries = Array.isArray(m.initiative.entries)
      ? m.initiative.entries.map((e,ix)=>({
          id:    String(e?.id ?? ('init-' + Date.now() + '-' + ix)),
          name:  String(e?.name ?? ''),
          init:  Number(e?.init) || 0,
          hp:    Number(e?.hp)   || 0,
          maxHp: Number(e?.maxHp)|| 0,
          ac:    Number(e?.ac)   || 0,
          kind:  (e?.kind === 'enemy' || e?.kind === 'ally' || e?.kind === 'player') ? e.kind : 'enemy',
          charId: String(e?.charId || ''),   // links to characters[] if kind==='player'
          note:  String(e?.note || '')
        }))
      : [];
  }
  if(typeof m.shopLocation!=='string' || !SHOP_LOCATIONS[m.shopLocation]) m.shopLocation='vale';
  if(typeof m.cctOnline!=='boolean') m.cctOnline=true;
  // Ensure all theme values are hex strings
  Object.keys(DEF_THEME).forEach(k => {
    if (!m.theme[k] || typeof m.theme[k] !== 'string' || !m.theme[k].startsWith('#')) {
      m.theme[k] = DEF_THEME[k];
    }
  });
  // Normalize custom feats BEFORE characters, so the feat filter below can
  // validate character feat ids against them. Kept self-contained (reads m,
  // not the global state) so a fresh normalize doesn't depend on load order.
  m.customFeats = Array.isArray(m.customFeats) ? m.customFeats.map(f => {
    const effects = {};
    if (f && typeof f.effects === 'object' && f.effects) {
      if (f.effects.stat && typeof f.effects.stat === 'object') {
        const st = {};
        STATS.forEach(s => { if (Number.isFinite(Number(f.effects.stat[s])) && Number(f.effects.stat[s]) !== 0) st[s] = Number(f.effects.stat[s]); });
        if (Object.keys(st).length) effects.stat = st;
      }
      ['attack','initiative','ac','spellDC','passive','hpMax','hpPerLevel','auraMax','speed'].forEach(k => {
        if (Number.isFinite(Number(f.effects[k])) && Number(f.effects[k]) !== 0) effects[k] = Number(f.effects[k]);
      });
      if (f.effects.skill && typeof f.effects.skill === 'object') {
        const sk = {};
        Object.entries(f.effects.skill).forEach(([k,v]) => { if (Number(v)) sk[k] = Number(v); });
        if (Object.keys(sk).length) effects.skill = sk;
      }
    }
    return {
      id:     String(f?.id || ('custom-' + Math.random().toString(36).slice(2))),
      icon:   String(f?.icon || '✦').slice(0, 3),
      name:   String(f?.name || 'Custom Feat'),
      desc:   String(f?.desc || ''),
      custom: true,
      effects
    };
  }) : [];
  const _validFeatIds = new Set([...FEATS.map(f=>f.id), ...m.customFeats.map(f=>f.id)]);

  m.characters = (raw?.characters?.length ? raw.characters : DEF_STATE.characters).map((c,i) => {
    const b = blankChar(i);
    const mc = {...b, ...c};
    mc.stats    = {...b.stats,    ...(c.stats    || {})};
    mc.hp       = {...b.hp,       ...(c.hp       || {})};
    mc.aura     = {...b.aura,     ...(c.aura     || {})};
    mc.dustInventory = {...b.dustInventory, ...(c.dustInventory || {})};
    mc.dustSpells    = Array.isArray(c.dustSpells)  ? c.dustSpells  : [];
    mc.techniques    = Array.isArray(c.techniques)  ? c.techniques  : [];
    mc.curses        = Array.isArray(c.curses)      ? c.curses      : [];
    mc.commendations = Array.isArray(c.commendations)? c.commendations : [];
    mc.compass = Array.isArray(c.compass) ? c.compass.map((a,ix) => ({
      id:            String(a?.id ?? ('art-' + Date.now() + '-' + ix + '-' + Math.random().toString(16).slice(2,6))),
      name:          String(a?.name ?? ''),
      type:          (a?.type === 'cursed' ? 'cursed' : 'holy'),
      image:         String(a?.image ?? ''),
      effect:        String(a?.effect ?? ''),
      originalOwner: String(a?.originalOwner ?? ''),
      currentOwner:  String(a?.currentOwner ?? ''),
      entityKind:    (a?.entityKind === 'angel' ? 'angel' : 'demon'),
      entityName:    String(a?.entityName ?? ''),
      entityTitle:   String(a?.entityTitle ?? '')
    })) : [];
    mc.feats         = Array.isArray(c.feats) ? c.feats.filter(id=>_validFeatIds.has(id)) : [];
    mc.rankOverride  = (typeof c.rankOverride==='string' && c.rankOverride) ? c.rankOverride : null;
    mc.weapons       = Array.isArray(c.weapons)     ? c.weapons     : [];
    mc.conditions    = Array.isArray(c.conditions)  ? c.conditions  : [];
    // New combat/session fields — added July 2026
    mc.concentration = (c.concentration && typeof c.concentration==='object')
      ? { active: !!c.concentration.active, source: String(c.concentration.source||'') }
      : { active:false, source:'' };
    mc.inspiration   = Math.max(0, Number(c.inspiration) || 0);
    mc.dmNotes       = String(c.dmNotes || '');
    mc.resistances     = Array.isArray(c.resistances)     ? c.resistances.map(String)     : [];
    mc.vulnerabilities = Array.isArray(c.vulnerabilities) ? c.vulnerabilities.map(String) : [];
    mc.immunities      = Array.isArray(c.immunities)      ? c.immunities.map(String)      : [];
    mc.inventory     = Array.isArray(c.inventory)   ? c.inventory   : [];
    mc.money         = Number(c.money) || 0;
    // Race system: 'human' | 'faunus' | '' (unset). Migrate legacy free-text race strings.
    {
      const r = (c.race||'').toString().trim().toLowerCase();
      if (r==='human' || r==='faunus') mc.race = r;
      else if (r==='') mc.race = '';
      else { mc.race = 'faunus'; if(!c.faunusAnimal) mc.faunusAnimal = c.race; } // legacy text like "Cat Faunus" -> faunus + animal
      mc.faunusAnimal = (typeof c.faunusAnimal==='string') ? c.faunusAnimal : (mc.faunusAnimal||'');
      mc.faunusBonusStat = STATS.includes(c.faunusBonusStat) ? c.faunusBonusStat : '';
    }
    mc.relationships = Array.isArray(c.relationships)? c.relationships : [];
    // Merge skills carefully — keep any existing prof/expertise/bonus, fill gaps with blanks
    const blankSk = makeBlankSkills();
    mc.skills = {};
    Object.keys(blankSk).forEach(name => {
      mc.skills[name] = {...blankSk[name], ...(c.skills?.[name] || {})};
    });
    mc.semblance = {
      ...b.semblance, ...(c.semblance || {}),
      base:     {...b.semblance.base,     ...(c.semblance?.base     || {})},
      first:    {...b.semblance.first,    ...(c.semblance?.first    || {})},
      second:   {...b.semblance.second,   ...(c.semblance?.second   || {})},
      third:    {...b.semblance.third,    ...(c.semblance?.third    || {})},
      ascended: {...b.semblance.ascended, ...(c.semblance?.ascended || {})},
      unlocked: {...b.semblance.unlocked, ...(c.semblance?.unlocked || {})}
    };
    return mc;
  });
  if (m.selectedCharacter >= m.characters.length) m.selectedCharacter = Math.max(0, m.characters.length - 1);
  if (!Array.isArray(m.shop)) m.shop = [];

  // ── BESTIARY MIGRATION ────────────────────────────────────────────
  // Old model: single shared `state.bestiary` array. Everyone saw it.
  // New model: `state.bestiaries` — an array of named collections, each
  // with its own entries and its own list of viewer character-ids. The
  // DM chooses who sees which. Legacy entries migrate into a default
  // "Field Codex" that stays visible to all characters so nothing is
  // lost in transition.
  const normalizeBeast = b => {
    const stats = {}; const bonuses = {};
    STATS.forEach(s => {
      stats[s]   = Number(b?.stats?.[s]) || 10;
      bonuses[s] = Number(b?.bonuses?.[s]) || 0;
    });
    return {
      id:      String(b?.id ?? ('beast-' + Math.random().toString(36).slice(2))),
      name:    String(b?.name ?? ''),
      image:   String(b?.image ?? ''),
      stats, bonuses,
      special: String(b?.special ?? ''),
      tamer:   String(b?.tamer ?? ''),
      notes:   String(b?.notes ?? '')
    };
  };
  if (!Array.isArray(m.bestiary))   m.bestiary   = [];
  if (!Array.isArray(m.bestiaries)) m.bestiaries = [];
  m.bestiary   = m.bestiary.map(normalizeBeast);
  m.bestiaries = m.bestiaries.map(bx => ({
    id:      String(bx?.id      ?? ('bx-' + Math.random().toString(36).slice(2))),
    name:    String(bx?.name    ?? 'Untitled Codex'),
    color:   String(bx?.color   ?? '#00d4ff'),
    viewers: Array.isArray(bx?.viewers) ? bx.viewers.map(String) : [],
    entries: Array.isArray(bx?.entries) ? bx.entries.map(normalizeBeast) : []
  }));
  // If the DM has legacy entries but no new-style collections, spin up a
  // default "Field Codex" from them, visible to every character.
  if (m.bestiaries.length === 0) {
    const allViewers = m.characters.map(c => c.id).filter(Boolean);
    m.bestiaries.push({
      id: 'bx-field-codex',
      name: 'Field Codex',
      color: '#00d4ff',
      viewers: allViewers,
      entries: m.bestiary.slice()
    });
  }
  // Legacy field kept only for one migration cycle so old clients don't
  // wipe data mid-rollout. New clients read strictly from bestiaries[].
  m.bestiary = [];
  m.shop = m.shop.map(it => ({
    name: it.name||'', category: it.category||'General',
    price: Number(it.price)||0,
    stock: (it.stock===undefined?null:it.stock),
    desc: it.desc||''
  }));
  return m;
}

// ================================================================
// HELPERS
// ================================================================
// Who you are VIEWING
function getChar() {
  // DM and spectators can view whoever THEY have selected (local, not shared)
  if (dmUnlocked || spectator) return state.characters[getViewIdx()] || state.characters[0];
  // Players are locked to their OWN claimed character — can't edit anyone else
  const mine = state.characters.find(c => c.claimedBy === MY_PRESENCE_ID);
  if (mine) return mine;
  // Not claimed yet (observer/pre-welcome) — show local selection but it'll be read-only
  return state.characters[getViewIdx()] || state.characters[0];
}
function isViewingOwnCharacter() {
  if (dmUnlocked) return true;
  const mine = state.characters.find(c => c.claimedBy === MY_PRESENCE_ID);
  return !!mine;
}

// Spectator ("I'm just watching") — can browse all characters but never edit
function applySpectatorMode() {
  if (!spectator) return;
  document.body.classList.add('spectator-mode');
  // Show a persistent read-only banner once
  if (!document.getElementById('spectatorBanner')) {
    const b = document.createElement('div');
    b.id = 'spectatorBanner';
    b.className = 'spectator-banner';
    b.innerHTML = `<span>👁 Spectating — read only</span><button id="spectatorDmBtn" title="Log in as the DM">⚔ Join as DM</button><button id="spectatorExit" title="Pick a character to play">Join as player</button>`;
    document.body.appendChild(b);
    document.getElementById('spectatorDmBtn')?.addEventListener('click', () => {
      openDmOverlay(); // DM password prompt; unlockDm() will clear spectator on success
    });
    document.getElementById('spectatorExit')?.addEventListener('click', () => {
      spectator = false;
      sessionStorage.removeItem('rwby-spectator');
      document.body.classList.remove('spectator-mode');
      reenableAllInputs();
      b.remove();
      checkWelcome();
    });
  }
  disableAllInputs();
}
// Disable every editable control so a spectator can't change anything
// Disable every editable control so a spectator can't change anything.
// The ONLY things left interactive are the character tabs (to cycle chars)
// and the sidebar toggle. Everything else — names, titles, stats, the DM
// overlay, theme, notes — is locked.
function disableAllInputs() {
  if (!spectator) return;
  document.querySelectorAll('input, textarea, select, button, [contenteditable]').forEach(elx => {
    // Keep character cycling + sidebar toggle + the spectator banner usable
    if (elx.closest('#characterTabs') ||
        elx.closest('.character-tabs') ||
        elx.classList.contains('sidebar-toggle') ||
        elx.id === 'sidebarToggle' ||
        elx.closest('.spectator-banner') ||
        elx.closest('#dmOverlay') ||           // DM login prompt must stay usable so a spectator can become DM
        elx.closest('.tab-bar')) {        // content tab nav (Skills/Loadout/etc.) still browsable
      return;
    }
    if (elx.tagName === 'INPUT' || elx.tagName === 'TEXTAREA' || elx.tagName === 'SELECT') {
      elx.setAttribute('readonly', 'readonly');
      elx.setAttribute('disabled', 'disabled');
    } else {
      elx.setAttribute('disabled', 'disabled');
    }
    if (elx.hasAttribute('contenteditable')) elx.setAttribute('contenteditable', 'false');
    elx.classList.add('spectator-disabled');
  });
  // Also block portrait upload click + any drag handles
  document.querySelectorAll('.portrait-slot, .portrait-upload-label, label[for]').forEach(l => {
    if (l.closest('#characterTabs')) return;
    l.classList.add('spectator-disabled');
    l.style.pointerEvents = 'none';
  });
}
// Reverse disableAllInputs — restore the sheet to fully interactive (used when a spectator becomes DM).
function reenableAllInputs() {
  document.querySelectorAll('.spectator-disabled').forEach(elx => {
    elx.removeAttribute('disabled');
    elx.removeAttribute('readonly');
    if (elx.getAttribute('contenteditable') === 'false') elx.removeAttribute('contenteditable');
    elx.style.pointerEvents = '';
    elx.classList.remove('spectator-disabled');
  });
}
function clamp(v,a,b)  { return Math.max(a, Math.min(b, v)); }
function rollD10()     { return Math.floor(Math.random() * 10) + 1; }
function esc(s)        { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// Effective maximums — base value plus any feat bonuses.
// The BASE stays untouched in c.hp.max so removing a feat cleanly reverts it.
function effectiveHpMax(c){
  let m = Math.max(0, Number(c?.hp?.max)||0);
  try { m += featHpMaxBonus(c); } catch(e) {}
  return Math.max(0, m);
}
function effectiveAuraMax(c){
  let m = Math.max(0, Number(c?.aura?.max)||0);
  try { m += featAuraMaxBonus(c); } catch(e) {}
  return Math.max(0, m);
}
function ensureClamp(c) {
  if (!c) return;                              // nothing to clamp — never throw
  if (!c.hp   || typeof c.hp   !== 'object') c.hp   = { current: 0, max: 0 };
  if (!c.aura || typeof c.aura !== 'object') c.aura = { current: 0, max: 0 };
  c.hp.max    = Math.max(0, Number(c.hp.max)    || 0);
  c.aura.max  = Math.max(0, Number(c.aura.max)  || 0);
  // clamp current against the EFFECTIVE max so feat-granted headroom is usable
  c.hp.current   = clamp(Number(c.hp.current)   || 0, 0, effectiveHpMax(c));
  c.aura.current = clamp(Number(c.aura.current) || 0, 0, effectiveAuraMax(c));
}

function hexRgba(hex, a=1) {
  if (!hex || typeof hex !== 'string') return `rgba(0,0,0,${a})`;
  const cl = hex.replace('#','');
  if (cl.length < 6) return `rgba(0,0,0,${a})`;
  const r=parseInt(cl.slice(0,2),16), g=parseInt(cl.slice(2,4),16), b=parseInt(cl.slice(4,6),16);
  if (isNaN(r)||isNaN(g)||isNaN(b)) return `rgba(0,0,0,${a})`;
  return `rgba(${r},${g},${b},${a})`;
}
function stageLocked(k,c) { return k !== 'base' && !c.semblance.unlocked[k]; }
const el = id => document.getElementById(id);

function getEffectivePB(c) {
  return c.profBonusOverride != null ? Number(c.profBonusOverride) : profBonus(c.level);
}

// ================================================================
// THEME
// ================================================================
function applyTheme() {
  try {
    const t = {...DEF_THEME, ...(state.theme || {})};
    const r = document.documentElement;
    r.style.setProperty('--accent',   t.accent   || DEF_THEME.accent);
    r.style.setProperty('--accent2',  t.accentTwo|| DEF_THEME.accentTwo);
    r.style.setProperty('--aura',     t.aura     || DEF_THEME.aura);
    r.style.setProperty('--text',     t.text     || DEF_THEME.text);
    r.style.setProperty('--panel',    hexRgba(t.panel || DEF_THEME.panel, .97));
    r.style.setProperty('--line-hi',  hexRgba(t.accent|| DEF_THEME.accent, .5));
    const bg       = (t.bg       && t.bg.startsWith('#'))       ? t.bg       : DEF_THEME.bg;
    const accentTwo= (t.accentTwo&& t.accentTwo.startsWith('#')) ? t.accentTwo: DEF_THEME.accentTwo;
    document.body.style.background = `
      radial-gradient(ellipse at 0% 0%,   ${hexRgba(t.accent,.18)} 0%, transparent 40%),
      radial-gradient(ellipse at 100% 100%,${hexRgba(accentTwo,.15)} 0%, transparent 40%),
      linear-gradient(180deg, #000 0%, ${bg} 50%, ${accentTwo} 100%)`;
  } catch(e) { console.warn('applyTheme error:', e); }
}
function renderThemeFields() {
  const t = state.theme || DEF_THEME;
  [['themeBgColor',t.bg],['themePanelColor',t.panel],['themeAccentColor',t.accent],
   ['themeAccentTwoColor',t.accentTwo],['themeAuraColor',t.aura],['themeTextColor',t.text]]
  .forEach(([id,v]) => { const e = el(id); if(e) e.value = v; });
}

// ================================================================
// RENDER — CALCULATED STATS PANEL
// ================================================================
function renderCalcPanel() {
  const c   = getChar();
  const pb  = getEffectivePB(c);
  const ini = calcInitiative(c);
  const atk = attackBonus(c);
  const dc  = spellDC(c);
  const pp  = passivePerception(c);
  const con = mod(effectiveStat(c,'CON'));

  const panel = el('calcPanel'); if (!panel) return;
  panel.innerHTML = `
    <div class="calc-row">
      <div class="calc-item">
        <div class="calc-label">Prof Bonus</div>
        <div class="calc-value accent">${fmtMod(pb)}</div>
        <div class="calc-sub">Lv ${c.level}</div>
      </div>
      <div class="calc-item">
        <div class="calc-label">Initiative</div>
        <div class="calc-value">${fmtMod(ini)}</div>
        <div class="calc-sub">DEX${c.initiativeBonus?` +${c.initiativeBonus}`:''}</div>
      </div>
      <div class="calc-item">
        <div class="calc-label">Attack Bonus</div>
        <div class="calc-value">${fmtMod(atk)}</div>
        <div class="calc-sub">${c.attackStat||'STR'} + Prof</div>
      </div>
      <div class="calc-item">
        <div class="calc-label">Passive Perc.</div>
        <div class="calc-value">${pp}</div>
        <div class="calc-sub">10+Perception</div>
      </div>
      <div class="calc-item">
        <div class="calc-label">HP Die Mod</div>
        <div class="calc-value">${fmtMod(con)}</div>
        <div class="calc-sub">CON mod</div>
      </div>
    </div>
    <div class="calc-settings">
      <div class="field">
        <label>Attack Stat</label>
        <select id="attackStatSel">
          ${STATS.map(s=>`<option value="${s}"${(c.attackStat||'STR')===s?' selected':''}>${s}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>Initiative Bonus</label>
        <input type="number" id="initBonusInp" value="${c.initiativeBonus||0}" placeholder="0">
      </div>
      <div class="field">
        <label>Prof Override <span style="color:var(--muted);font-size:.7rem">(blank = auto)</span></label>
        <input type="number" id="pbOverrideInp" value="${c.profBonusOverride??''}" placeholder="auto">
      </div>
    </div>`;

  el('attackStatSel')?.addEventListener('change', e => { c.attackStat = e.target.value; pushState(); renderCalcPanel(); });
  el('initBonusInp')?.addEventListener('input',   e => { c.initiativeBonus = Number(e.target.value)||0; pushState(); renderCalcPanel(); });
  el('pbOverrideInp')?.addEventListener('input',  e => {
    const v = e.target.value.trim();
    c.profBonusOverride = v === '' ? null : Number(v) || null;
    pushState(); renderCalcPanel(); renderSkillsMatrix();
  });
}

// ================================================================
// RENDER — CHARACTER TABS
// ================================================================
function renderCharacterTabs() {
  const tabs = el('characterTabs'); if (!tabs) return; tabs.innerHTML = '';
  // A player who has claimed a character sees ONLY their own tab.
  // DMs and watchers browse the whole party freely.
  const myIdx = state.characters.findIndex(c => c.claimedBy === MY_PRESENCE_ID);
  const soloView = !dmUnlocked && !spectator && myIdx >= 0;
  tabs.classList.toggle('solo', soloView);
  state.characters.forEach((c,i) => {
    if (soloView && i !== myIdx) return;          // hide everyone else's sheet
    if (c.state==='dead'    && !state.showDead)    return;
    if (c.state==='reserve' && !state.showReserve) return;
    const pct    = c.hp.max > 0 ? Math.round((c.hp.current/c.hp.max)*100) : 0;
    const isOwn  = c.claimedBy === MY_PRESENCE_ID;
    const isSel  = i === getViewIdx();
    const takenByOther = isTakenByLiveOther(c);
    const hpColor= pct > 50 ? 'var(--safe)' : pct > 25 ? 'var(--warn)' : 'var(--danger)';
    const color  = c.accentColor || (isOwn ? 'var(--aura)' : 'rgba(255,255,255,.15)');
    const btn = document.createElement('button'); btn.type='button';
    btn.className = `character-tab${c.state==='reserve'?' reserve':''}${c.state==='dead'?' dead':''}${isSel?' active':''}${isOwn?' owned':''}`;
    btn.style.setProperty('--char-color', color);
    btn.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:.4rem">
        <strong>${esc(c.name||`Player ${i+1}`)}</strong>
        ${isOwn ? '<span class="tab-badge you">YOU</span>' : takenByOther ? '<span class="tab-badge taken">●</span>' : ''}
      </div>
      <span>${esc(c.className||'—')} · Lv${c.level}${c.race?' · '+raceLabel(c):''}</span>
      ${conditionBadges(c)}
      <div class="tab-hp-bar"><div class="tab-hp-fill" style="width:${pct}%;background:${hpColor};box-shadow:0 0 6px ${hpColor}60"></div></div>`;
    // The DM and spectators can switch which character is displayed.
    // Players are locked to their own claimed character.
    if (dmUnlocked || spectator) {
      btn.addEventListener('click', ()=>{ setViewIdx(i); render(); });
    } else {
      btn.style.cursor = 'default';
      if (!isOwn) btn.classList.add('locked-tab');
    }
    tabs.appendChild(btn);
  });
}

// ================================================================
// RENDER — TOPBAR
// ================================================================
function renderHeader() {
  const c    = getChar(); const name = c.name || '—';
  const s = (id,v) => { const e=el(id); if(e)e.textContent=v; };
  s('topCharacterName', name);
  s('selectedNameSmall', name);
  s('selectedState', (c.state||'active').charAt(0).toUpperCase()+(c.state||'active').slice(1));
  s('selectedAscendedStatus', c.semblance?.unlocked?.ascended ? 'Unlocked' : 'Locked');
  s('selectedTechniqueCount', (c.techniques||[]).length);
  s('topHpMini',   `${c.hp?.current ?? 0} / ${c.hp?.max ?? 0}`);
  s('topAuraMini', `${c.aura?.current ?? 0} / ${c.aura?.max ?? 0}`);
  s('topArmorMini', c.armor);
  s('dmSelectedCharacterName', name);
  const hpPct  = c.hp.max   > 0 ? (c.hp.current/c.hp.max)*100     : 0;
  const aPct   = c.aura.max > 0 ? (c.aura.current/c.aura.max)*100 : 0;
  const hb=el('topHpBar');   if(hb) hb.style.width = hpPct+'%';
  const ab=el('topAuraBar'); if(ab) ab.style.width = aPct+'%';
}

// ================================================================
// RENDER — MAIN FIELDS
// ================================================================
function renderMainFields() {
  const c = getChar();
  const ae = document.activeElement;
  const sv = (id,v) => { const e=el(id); if(e && e!==ae) e.value=v??''; };
  sv('charName',c.name);sv('charLevel',c.level);sv('charRace',c.race);sv('charClass',c.className);
  sv('charAge',c.age);sv('charBackground',c.background);sv('charSemblanceName',c.semblanceName);
  sv('charWeaponName',c.weaponName||'');
  sv('currentHp',c.hp.current);sv('maxHp',c.hp.max);
  sv('currentAura',c.aura.current);sv('maxAura',c.aura.max);
  sv('armor',c.armor);sv('speed',c.speed);sv('tempHp',c.tempHp||0);
  sv('abilitiesText',c.abilitiesText);sv('notesText',c.notesText);
  { const ta=el('notesText'), cn=el('notesCount'); if(ta&&cn){ const t=(ta.value||'').trim(); const w=t?t.split(/\s+/).length:0; cn.textContent=`${w} word${w===1?'':'s'} · ${(ta.value||'').length} chars`; } }
  try { renderWeapons(); }   catch(e) {}
  try { renderInventory(); } catch(e) {}
  const moneyDisp = el('moneyDisplay'); if (moneyDisp) moneyDisp.textContent = `${fmtMoney(c.money)} ${CURRENCY.short}`;
  const hd=el('hpDisplay');   if(hd) hd.textContent = `${c.hp.current} / ${c.hp.max}`;
  const ad=el('auraDisplay'); if(ad) ad.textContent = `${c.aura.current} / ${c.aura.max}`;
  const hpPct = c.hp.max   > 0 ? (c.hp.current/c.hp.max)*100     : 0;
  const aPct  = c.aura.max > 0 ? (c.aura.current/c.aura.max)*100 : 0;
  const hb=el('hpBar');   if(hb) hb.style.width = hpPct+'%';
  const ab=el('auraBar'); if(ab) ab.style.width = aPct+'%';
  const st=el('stateActive');
  if(st){ el('stateActive').checked=c.state==='active'; el('stateReserve').checked=c.state==='reserve'; el('stateDead').checked=c.state==='dead'; }
  // Auto-calculated initiative display
  const id2=el('initiativeDisplay'); if(id2) id2.value = fmtMod(calcInitiative(c));
}

// ================================================================
// RENDER — RACE / FAUNUS PANEL
// ================================================================
function renderRacePanel(){
  const c = getChar(); const host = el('faunusPanel'); if(!host) return;
  if (c.race !== 'faunus'){ host.style.display='none'; host.innerHTML=''; return; }
  host.style.display='block';
  const bonusStat = c.faunusBonusStat || '';
  const statOpts = ['<option value="">— DM assigns —</option>']
    .concat(STATS.map(s=>`<option value="${s}" ${bonusStat===s?'selected':''}>${s} (+${FAUNUS_STAT_BONUS})</option>`)).join('');
  const effLine = bonusStat
    ? `<span class="faunus-eff">${bonusStat}: ${c.stats[bonusStat]||0} <b>+${FAUNUS_STAT_BONUS}</b> = <b>${effectiveStat(c,bonusStat)}</b> (${fmtMod(mod(effectiveStat(c,bonusStat)))})</span>`
    : `<span class="faunus-eff muted">No heritage bonus assigned yet — the DM picks the boosted ability.</span>`;
  host.innerHTML = `
    <div class="faunus-head"><span class="faunus-glyph">⊚</span><span class="faunus-title">FAUNUS HERITAGE</span><span class="faunus-perk">Shop prices vary by location</span></div>
    <div class="faunus-grid">
      <div class="field"><label>Faunus Trait / Animal</label><input id="faunusAnimalInput" type="text" placeholder="e.g. Cat ears, Wolf tail, Scales…" value="${esc(c.faunusAnimal||'')}"></div>
      <div class="field">
        <label>Heritage Bonus Ability ${dmUnlocked?'':'<span class="dm-lock">DM</span>'}</label>
        <select id="faunusBonusSelect" ${dmUnlocked?'':'disabled'}>${statOpts}</select>
      </div>
    </div>
    <div class="faunus-summary">${effLine}</div>`;
  el('faunusAnimalInput')?.addEventListener('input', e=>{ c.faunusAnimal=e.target.value; pushState(); });
  const bsel = el('faunusBonusSelect');
  if (bsel && dmUnlocked){
    bsel.addEventListener('change', e=>{
      c.faunusBonusStat = e.target.value || '';
      pushState(true);
      renderRacePanel(); renderStats(); renderSkillsMatrix(); renderCalcPanel(); renderHpAura?.();
    });
  }
}

// ================================================================
// RENDER — ABILITY SCORES
// ================================================================
function renderStats() {
  const c = getChar(); const g = el('statsGrid'); if(!g) return; g.innerHTML='';
  const locked = !canEditStats();
  STATS.forEach(stat => {
    const score = c.stats[stat];
    const boosted = c.race==='faunus' && c.faunusBonusStat===stat;
    const eff = effectiveStat(c, stat);
    const m = mod(eff);
    const card = document.createElement('div'); card.className='stat-card'+(boosted?' faunus-boosted':'')+(locked?' stat-locked':'');
    card.innerHTML = `
      <div class="stat-key">${stat}${boosted?`<span class="stat-faunus-badge" title="Faunus heritage: +${FAUNUS_STAT_BONUS}">+${FAUNUS_STAT_BONUS}</span>`:''}</div>
      <input class="stat-score-input" data-stat="${stat}" type="number" value="${score}" ${locked?'readonly tabindex="-1"':''}>
      ${boosted?`<div class="stat-eff" title="Base ${score} + Faunus ${FAUNUS_STAT_BONUS} = ${eff}">▸ ${eff}</div>`:''}
      <div class="stat-mod">${fmtMod(m)}</div>
      ${locked?'':`<div class="stat-controls">
        <button type="button" data-stat="${stat}" data-action="minus">−</button>
        <button type="button" data-stat="${stat}" data-action="plus">+</button>
      </div>`}`;
    g.appendChild(card);
  });
  if(locked) return;   // no write handlers when locked
  g.querySelectorAll('.stat-score-input').forEach(inp => {
    inp.addEventListener('input', e => {
      c.stats[e.target.dataset.stat] = Number(e.target.value) || 0;
      pushState(); renderStats(); renderSkillsMatrix(); renderCalcPanel();
    });
  });
}

// ================================================================
// RENDER — SKILLS MATRIX (full auto-calculation)
// ================================================================
function renderSkillsMatrix() {
  const c  = getChar();
  const pb = getEffectivePB(c);
  const m  = el('skillsMatrix'); if(!m) return; m.innerHTML='';

  // Group by stat
  const groups = {};
  SKILL_DEFS.forEach(def => {
    if (!groups[def.stat]) groups[def.stat] = [];
    groups[def.stat].push(def);
  });

  Object.entries(groups).forEach(([stat, defs]) => {
    const statM = mod(effectiveStat(c, stat));
    const grp   = document.createElement('div'); grp.className = 'skill-group';
    grp.innerHTML = `
      <div class="skill-group-header">
        <strong>${stat}</strong>
        <span>Mod ${fmtMod(statM)} &nbsp;·&nbsp; Prof ${fmtMod(pb)}</span>
      </div>
      <div class="skill-list"></div>`;
    const list = grp.querySelector('.skill-list');

    defs.forEach(def => {
      const sk    = c.skills[def.name] || {prof:false,expertise:false,bonus:0};
      const total = skillTotal(c, def.name);
      const row   = document.createElement('div'); row.className='skill-row';

      row.innerHTML = `
        <div class="skill-prof-toggles">
          <button type="button" class="prof-btn${sk.prof?' active':''}" data-skill="${esc(def.name)}" data-toggle="prof"    title="Proficient">${sk.prof?'●':'○'}</button>
          <button type="button" class="prof-btn exp${sk.expertise?' active':''}" data-skill="${esc(def.name)}" data-toggle="expertise" title="Expertise">${sk.expertise?'★':'☆'}</button>
        </div>
        <div class="skill-row-label">
          <strong>${esc(def.name)}</strong>
          <span>${def.stat} ${sk.prof?(sk.expertise?'· Expertise':'· Prof'):''}</span>
        </div>
        <div class="skill-total ${total >= 0 ? 'pos' : 'neg'}">${fmtMod(total)}</div>
        <input type="number" data-skill="${esc(def.name)}" data-field="bonus" value="${sk.bonus||0}" placeholder="+0" title="Extra bonus">`;

      list.appendChild(row);
    });
    m.appendChild(grp);
  });

  // Toggle prof/expertise
  m.querySelectorAll('.prof-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const sk   = c.skills[btn.dataset.skill];
      const type = btn.dataset.toggle;
      if (type === 'prof')      { sk.prof      = !sk.prof;      if(!sk.prof) sk.expertise=false; }
      if (type === 'expertise') { sk.expertise = !sk.expertise; if(sk.expertise) sk.prof=true;   }
      pushState(); renderSkillsMatrix(); renderCalcPanel();
    });
  });
  // Extra bonus input
  m.querySelectorAll('input[data-skill]').forEach(inp => {
    inp.addEventListener('input', e => {
      c.skills[e.target.dataset.skill].bonus = Number(e.target.value) || 0;
      pushState(); renderSkillsMatrix();
    });
  });
}

// ================================================================
// RENDER — SEMBLANCE
// ================================================================
function renderSemblance() {
  const c = getChar();
  const t = el('semblanceTitleDisplay'); if(t) t.textContent = c.semblanceName ? `Semblance — ${c.semblanceName}` : 'Semblance';
  const cont = el('semblanceStages'); if(!cont) return; cont.innerHTML='';
  SEM_KEYS.forEach(key => {
    const stage  = c.semblance[key]; const locked = stageLocked(key,c);
    const card   = document.createElement('div'); card.className=`sem-stage${locked?' locked':''}`;
    card.innerHTML = `
      <details class="collapse-block"${locked?'':' open'}>
        <summary class="collapse-summary">
          <div class="sem-stage-header">
            <div class="stage-name">${SEM_LABELS[key]}</div>
            <span class="stage-badge${locked?'':' unlocked'}">${locked?'Locked':'Unlocked'}</span>
          </div>
        </summary>
        <div class="collapse-body">
          <div class="stage-lines">
            <div class="stage-line">
              <strong>${esc(stage.active||'Active — Unnamed')}</strong>
              <div>${esc(stage.activeDescription||'No description. Ask your DM.')}</div>
              <div class="cost-note">Aura Cost: ${stage.auraCost}</div>
            </div>
            <div class="stage-line">
              <strong>${esc(stage.passiveName||'Passive — Unnamed')} [Passive]</strong>
              <div>${esc(stage.passiveDescription||'No passive description.')}</div>
            </div>
          </div>
          <div class="technique-actions">
            <button type="button" class="neo-btn small use-btn use-sem" data-stage="${key}"${locked?' disabled':''}>
              Use Active (−${stage.auraCost} Aura)
            </button>
          </div>
        </div>
      </details>`;
    cont.appendChild(card);
  });
  cont.querySelectorAll('.use-sem').forEach(btn => btn.addEventListener('click',()=>useSemblance(btn.dataset.stage)));
}

// ================================================================
// RENDER — TECHNIQUES
// ================================================================
function renderTechniques() {
  const c = getChar(); const cont = el('grantedTechniques'); if(!cont) return; cont.innerHTML='';
  if (!c.techniques.length) {
    cont.innerHTML = `<div style="padding:1rem;color:var(--muted)">No Aura Techniques yet. The DM grants them.</div>`;
    return;
  }
  c.techniques.forEach(t => {
    const card = document.createElement('div'); card.className='technique-card';
    card.innerHTML = `
      <details class="collapse-block">
        <summary class="collapse-summary">
          <div class="technique-top">
            <strong>${esc(t.name)}</strong>
            <div class="technique-meta">
              <span class="meta-pill">Lv ${t.level}</span>
              <span class="meta-pill aura">−${t.cost} Aura</span>
              <span class="meta-pill">${esc(t.type)}</span>
            </div>
          </div>
        </summary>
        <div class="collapse-body">
          <div class="small-note">${esc(t.description)}</div>
          <div class="technique-actions">
            <button type="button" class="neo-btn small use-btn use-tech" data-id="${t.id}">Use (−${t.cost} Aura)</button>
          </div>
        </div>
      </details>`;
    cont.appendChild(card);
  });
  cont.querySelectorAll('.use-tech').forEach(btn => btn.addEventListener('click',()=>useTechnique(btn.dataset.id)));
}

// ================================================================
// RENDER — DUST
// ================================================================
const DUST_COLORS = {'Fire Dust':'#e0522a','Ice Dust':'#5ad1ff','Electricity Dust':'#d4d45a','Wind Dust':'#7ad6a0','Earth Dust':'#b08850','Gravity Dust':'#a060e0','Hard Light Dust':'#ffffff'};
function renderDust() {
  const c = getChar(); const g = el('dustInventoryGrid'); if(!g) return; g.innerHTML='';
  DUST_TYPES.forEach(type => {
    const qty = c.dustInventory[type]||0;
    const col = DUST_COLORS[type]||'#00d4ff';
    const fill = Math.min(100, qty*10);
    const low = qty>0 && qty<=1;
    const card = document.createElement('div'); card.className=`dust-card dust-card-v2 ${DUST_CLASS[type]}${qty===0?' empty':''}${low?' low':''}`;
    card.style.setProperty('--dust-col', col);
    card.innerHTML = `
      <div class="dust-vial"><div class="dust-vial-fill" style="height:${fill}%"></div></div>
      <div class="dust-card-body">
        <label>${type}</label>
        <div class="dust-controls">
          <button class="dust-step" data-dust="${type}" data-step="-1" type="button">−</button>
          <input type="number" min="0" data-dust="${type}" value="${qty}">
          <button class="dust-step" data-dust="${type}" data-step="1" type="button">+</button>
        </div>
        ${low?'<span class="dust-low-tag">LOW</span>':qty===0?'<span class="dust-empty-tag">EMPTY</span>':''}
      </div>`;
    g.appendChild(card);
  });
  g.querySelectorAll('input[data-dust]').forEach(inp => inp.addEventListener('input', e => {
    c.dustInventory[e.target.dataset.dust] = Math.max(0, Number(e.target.value)||0); pushState(); renderDust();
  }));
  g.querySelectorAll('.dust-step').forEach(b => b.addEventListener('click', () => {
    const t=b.dataset.dust; const step=Number(b.dataset.step);
    c.dustInventory[t]=Math.max(0,(c.dustInventory[t]||0)+step); pushState(true); renderDust();
  }));
  const sel = el('dustSpellType'); if(sel) sel.innerHTML = DUST_TYPES.map(t=>`<option value="${t}">${t}</option>`).join('');
  renderDustSpells();
}
function renderDustSpells() {
  const c = getChar(); const cont = el('dustSpellList'); if(!cont) return; cont.innerHTML='';
  if (!c.dustSpells.length) { cont.innerHTML=`<div style="padding:.9rem;color:var(--muted)">No dust spells yet.</div>`; return; }
  c.dustSpells.forEach(sp => {
    const card = document.createElement('div'); card.className='technique-card';
    card.innerHTML = `
      <details class="collapse-block">
        <summary class="collapse-summary">
          <div class="technique-top">
            <strong>${esc(sp.name)}</strong>
            <div class="technique-meta"><span class="meta-pill">${esc(sp.type)}</span><span class="meta-pill">Consumes 1</span></div>
          </div>
        </summary>
        <div class="collapse-body">
          <div class="small-note">${esc(sp.description)}</div>
          <div class="dust-card-actions">
            <button type="button" class="neo-btn small use-btn use-dust" data-id="${sp.id}">Use (−1 ${esc(sp.type)})</button>
            <button type="button" class="neo-btn small ghost del-dust"   data-id="${sp.id}">Delete</button>
          </div>
        </div>
      </details>`;
    cont.appendChild(card);
  });
  cont.querySelectorAll('.use-dust').forEach(btn => btn.addEventListener('click',()=>useDustSpell(btn.dataset.id)));
  cont.querySelectorAll('.del-dust').forEach(btn => btn.addEventListener('click',()=>{
    c.dustSpells = c.dustSpells.filter(s=>s.id!==btn.dataset.id); pushState(); renderDust();
  }));
}

// ================================================================
// RENDER — DM SEMBLANCE
// ================================================================
function renderDmSemblance() {
  const c = dmTargetChar() || getChar(); const g = el('semblanceDmGrid'); if(!g) return; g.innerHTML='';
  SEM_KEYS.forEach(key => {
    const s   = c.semblance[key]; const col = document.createElement('div'); col.className='semblance-dm-col';
    col.innerHTML = `
      <div class="section-label" style="margin-bottom:.6rem">${SEM_LABELS[key]}</div>
      <div class="field"><label>Active Name</label><input type="text" data-sem="${key}" data-f="active" value="${esc(s.active)}"></div>
      <div class="field"><label>Active Desc</label><textarea class="small-textarea" data-sem="${key}" data-f="activeDescription">${esc(s.activeDescription)}</textarea></div>
      <div class="field"><label>Passive Name</label><input type="text" data-sem="${key}" data-f="passiveName" value="${esc(s.passiveName)}"></div>
      <div class="field"><label>Passive Desc</label><textarea class="small-textarea" data-sem="${key}" data-f="passiveDescription">${esc(s.passiveDescription)}</textarea></div>
      <div class="field"><label>Aura Cost</label><input type="number" min="0" data-sem="${key}" data-f="auraCost" value="${s.auraCost}"></div>`;
    g.appendChild(col);
  });
  const uf = (id,v) => { const e=el(id); if(e) e.checked=v; };
  uf('unlockFirst',c.semblance.unlocked.first);uf('unlockSecond',c.semblance.unlocked.second);
  uf('unlockThird',c.semblance.unlocked.third);uf('unlockAscended',c.semblance.unlocked.ascended);
}

// ================================================================
// RENDER — DM TECHNIQUE DATABASE (all players, grouped)
// ================================================================
function renderDmTechniques() {
  renderTechAssignList();
  const cont = el('dmTechniqueDatabase'); if(!cont) return; cont.innerHTML='';
  let any = false;
  state.characters.forEach(c => {
    if (!c.techniques.length) return; any = true;
    const hdr = document.createElement('div');
    hdr.style.cssText='font-family:var(--font-mono);font-size:.7rem;letter-spacing:.15em;text-transform:uppercase;color:var(--aura);margin:.6rem 0 .35rem;padding:.35rem .6rem;background:rgba(80,150,255,.06);border-radius:6px;border-left:2px solid var(--aura)';
    hdr.textContent = c.name || `Player`;
    cont.appendChild(hdr);
    c.techniques.forEach(t => {
      const card = document.createElement('div'); card.className='technique-card';
      card.innerHTML = `
        <details class="collapse-block">
          <summary class="collapse-summary">
            <div class="technique-top">
              <strong>${esc(t.name)}</strong>
              <div class="technique-meta"><span class="meta-pill">Lv ${t.level}</span><span class="meta-pill aura">−${t.cost}</span><span class="meta-pill">${esc(t.type)}</span></div>
            </div>
          </summary>
          <div class="collapse-body">
            <div class="form-grid">
              <div class="field"><label>Name</label><input type="text"   data-cid="${c.id}" data-tid="${t.id}" data-f="name"  value="${esc(t.name)}"></div>
              <div class="field"><label>Level</label><input type="number" data-cid="${c.id}" data-tid="${t.id}" data-f="level" value="${t.level}"></div>
              <div class="field"><label>Cost</label><input type="number"  data-cid="${c.id}" data-tid="${t.id}" data-f="cost"  value="${t.cost}"></div>
              <div class="field"><label>Type</label><input type="text"   data-cid="${c.id}" data-tid="${t.id}" data-f="type"  value="${esc(t.type)}"></div>
            </div>
            <div class="field"><label>Description</label><textarea class="small-textarea" data-cid="${c.id}" data-tid="${t.id}" data-f="description">${esc(t.description)}</textarea></div>
            <div class="dm-tech-actions"><button type="button" class="neo-btn small ghost" data-del-cid="${c.id}" data-del-tid="${t.id}">Delete</button></div>
          </div>
        </details>`;
      cont.appendChild(card);
    });
  });
  if (!any) cont.innerHTML = `<div style="padding:.9rem;color:var(--muted)">No techniques assigned yet.</div>`;
  cont.querySelectorAll('[data-cid][data-tid][data-f]').forEach(inp => {
    inp.addEventListener('input', e => {
      const ch = state.characters.find(c=>c.id===e.target.dataset.cid);
      const t  = ch?.techniques.find(t=>t.id===e.target.dataset.tid);
      if(!t) return;
      const f = e.target.dataset.f;
      t[f] = ['level','cost'].includes(f) ? Number(e.target.value)||0 : e.target.value;
      pushState(); renderTechniques();
    });
  });
  cont.querySelectorAll('[data-del-cid]').forEach(btn => {
    btn.addEventListener('click', ()=>{
      const ch = state.characters.find(c=>c.id===btn.dataset.delCid);
      if(ch) ch.techniques = ch.techniques.filter(t=>t.id!==btn.dataset.delTid);
      pushState(true); render();
    });
  });
}

function renderDmTargetSelect() {
  const sel = el('dmTechTarget'); if(!sel) return;
  sel.innerHTML = state.characters.map((c,i)=>`<option value="${i}">${esc(c.name||`Player ${i+1}`)}</option>`).join('');
}

function renderCurseTargetSelect() {
  const sel = el('curseTarget'); if(!sel) return;
  // List only characters that have been claimed by a player (have a presence id)
  const claimed = state.characters.filter(c => c.claimedBy);
  if (!claimed.length) {
    sel.innerHTML = `<option value="">— No players have claimed characters —</option>`;
    return;
  }
  sel.innerHTML = claimed.map(c =>
    `<option value="${c.claimedBy}">${esc(c.name || 'Unnamed')}</option>`
  ).join('');
}

const TAB_DEFS = [
  { id:'skills',     label:'Skills',     locked:true },
  { id:'semblance',  label:'Semblance' },
  { id:'techniques', label:'Techniques' },
  { id:'dust',       label:'Dust' },
  { id:'status',     label:'Status' },
  { id:'loadout',    label:'Loadout' },
  { id:'shop',       label:'Shop' },
  { id:'relations',  label:'Relations' },
  { id:'notes',      label:'Notes' },
  { id:'log',        label:'Log' },
  { id:'curses',     label:'Curses' },
  { id:'honors',     label:'Feats' }
];
function hiddenTabs(){
  try { return new Set(JSON.parse(localStorage.getItem('rwby-hidden-tabs')||'[]')); }
  catch(e){ return new Set(); }
}
function setHiddenTabs(set){
  localStorage.setItem('rwby-hidden-tabs', JSON.stringify([...set]));
}
function applyTabVisibility(){
  const hidden = hiddenTabs();
  document.querySelectorAll('.tab-btn[data-tab]').forEach(b=>{
    const def = TAB_DEFS.find(t=>t.id===b.dataset.tab);
    const hide = def && !def.locked && hidden.has(b.dataset.tab);
    b.style.display = hide ? 'none' : '';
  });
  if (hidden.has(state.activeTab)) {
    const firstVisible = TAB_DEFS.find(t=>t.locked || !hidden.has(t.id));
    if (firstVisible) { state.activeTab = firstVisible.id; }
  }
}
function renderTabMenu(){
  const list = el('tabMenuList'); if(!list) return;
  const hidden = hiddenTabs();
  list.innerHTML = TAB_DEFS.map(t=>{
    const on = t.locked || !hidden.has(t.id);
    return `<button class="tab-menu-item${on?' on':''}${t.locked?' locked':''}" data-tabid="${t.id}" ${t.locked?'disabled':''}>
      <span class="tab-menu-check">${on?'✓':''}</span>
      <span class="tab-menu-label">${esc(t.label)}</span>
      ${t.locked?'<span class="tab-menu-lock">always on</span>':''}
    </button>`;
  }).join('');
  list.querySelectorAll('.tab-menu-item:not(.locked)').forEach(b=>{
    b.addEventListener('click', ()=>{
      const id=b.dataset.tabid;
      const h=hiddenTabs();
      if(h.has(id)) h.delete(id); else h.add(id);
      setHiddenTabs(h);
      renderTabMenu(); applyTabVisibility(); renderTabs();
    });
  });
}
function toggleTabMenu(){
  const m=el('tabMenu'); if(!m) return;
  const opening = !m.classList.contains('open');
  m.classList.toggle('open');
  if(opening) renderTabMenu();
}

function renderTabs() {
  applyTabVisibility();
  document.querySelectorAll('.tab-btn[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab===state.activeTab));
  document.querySelectorAll('.tab-content[data-tab]').forEach(t => t.classList.toggle('active', t.dataset.tab===state.activeTab));
  // Re-render the now-active tab's content so it's never stale (fixes click-twice)
  try {
    switch (state.activeTab) {
      case 'relations':  renderRelationships(); break;
      case 'curses':     renderCurses(); break;
      case 'loadout':    renderWeapons(); renderInventory(); break;
      case 'shop':       renderShop(); break;
      case 'skills':     renderSkillsMatrix(); break;
      case 'techniques': renderTechniques(); break;
      case 'dust':       renderDust(); break;
      case 'status':     renderConditions(); renderThreatMeter(); break;
      case 'log':        renderSessionLog(); break;
      case 'semblance':  renderSemblance(); break;
      case 'honors':     renderCommendations(); renderHuntsmanLicense(); break;
    }
  } catch(e) {}
}

const CONDITIONS = [
  { id:'stunned',    icon:'💫', name:'Stunned',     color:'#c2a23a' },
  { id:'burning',    icon:'🔥', name:'Burning',     color:'#e0602a' },
  { id:'frozen',     icon:'❄️', name:'Frozen',      color:'#5ad1ff' },
  { id:'poisoned',   icon:'☠️', name:'Poisoned',    color:'#5ad17a' },
  { id:'bleeding',   icon:'🩸', name:'Bleeding',    color:'#c0000a' },
  { id:'shocked',    icon:'⚡', name:'Shocked',     color:'#d4d45a' },
  { id:'prone',      icon:'⬇️', name:'Prone',       color:'#8a96a2' },
  { id:'restrained', icon:'🔗', name:'Restrained',  color:'#a08050' },
  { id:'blinded',    icon:'🌑', name:'Blinded',     color:'#6a6a8a' },
  { id:'charmed',    icon:'💗', name:'Charmed',      color:'#e060c0' },
  { id:'frightened', icon:'😱', name:'Frightened',  color:'#9060e0' },
  { id:'aura_lock',  icon:'🚫', name:'Aura Locked',  color:'#c0000a' },
  { id:'empowered',  icon:'✨', name:'Empowered',    color:'#00d4ff' },
  { id:'hidden',     icon:'👁️', name:'Hidden',      color:'#5a7a8a' }
];
const CONDITION_BY_ID = Object.fromEntries(CONDITIONS.map(c=>[c.id,c]));
function renderConditions(){
  const c=getChar();
  const host=el('conditionsList'); if(!host) return;
  if(!Array.isArray(c.conditions)) c.conditions=[];
  const active=el('conditionsActive');
  if(active){
    if(!c.conditions.length){ active.innerHTML=`<div class="cond-none">No active conditions.</div>`; }
    else active.innerHTML=c.conditions.map(cd=>{
      const m=CONDITION_BY_ID[cd.id]; if(!m) return '';
      const dur=cd.duration!=null&&cd.duration!==''?`<span class="cond-dur">${esc(String(cd.duration))}</span>`:'';
      return `<div class="cond-chip" style="--cc:${m.color}"><span class="cond-icon">${m.icon}</span><span class="cond-name">${esc(m.name)}</span>${dur}<button class="cond-remove" data-cid="${m.id}">✕</button></div>`;
    }).join('');
    active.querySelectorAll('.cond-remove').forEach(b=>b.addEventListener('click',()=>toggleCondition(b.dataset.cid)));
  }
  host.innerHTML=CONDITIONS.map(m=>{
    const on=c.conditions.some(x=>x.id===m.id);
    return `<button class="cond-toggle${on?' on':''}" data-cid="${m.id}" style="--cc:${m.color}"><span class="cond-icon">${m.icon}</span><span>${esc(m.name)}</span></button>`;
  }).join('');
  host.querySelectorAll('.cond-toggle').forEach(b=>b.addEventListener('click',()=>toggleCondition(b.dataset.cid)));
}
function toggleCondition(id){
  const c=getChar();
  if(!Array.isArray(c.conditions)) c.conditions=[];
  const idx=c.conditions.findIndex(x=>x.id===id);
  if(idx>=0) c.conditions.splice(idx,1);
  else c.conditions.push({ id, duration:'' });
  pushState(true); renderConditions(); renderCharacterTabs();
}
function conditionBadges(c){
  if(!Array.isArray(c.conditions)||!c.conditions.length) return '';
  return `<span class="ctab-conditions">${c.conditions.map(cd=>{const m=CONDITION_BY_ID[cd.id];return m?`<span class="ctab-cond" title="${esc(m.name)}" style="--cc:${m.color}">${m.icon}</span>`:'';}).join('')}</span>`;
}

function runBootSequence(){
  if(sessionStorage.getItem('rwby-booted')==='1'){ return; }
  sessionStorage.setItem('rwby-booted','1');
  const boot=document.createElement('div');
  boot.className='boot-screen';
  boot.innerHTML=`<div class="boot-inner">
    <div class="boot-logo">RWBY</div>
    <div class="boot-sub">HUNTSMAN FIELD TERMINAL</div>
    <div class="boot-lines" id="bootLines"></div>
  </div>`;
  document.body.appendChild(boot);
  const lines=['Initializing Aura matrix…','Linking CCT network…','Calibrating Dust resonance…','Loading Huntsman registry…','Authenticating clearance…','Terminal ready.'];
  const host=boot.querySelector('#bootLines');
  let i=0;
  const tick=()=>{
    if(i<lines.length){
      const ln=document.createElement('div'); ln.className='boot-line'; ln.textContent='> '+lines[i];
      host.appendChild(ln); i++;
      setTimeout(tick, 200+Math.random()*180);
    } else {
      setTimeout(()=>{ boot.classList.add('boot-done'); setTimeout(()=>boot.remove(),700); }, 350);
    }
  };
  setTimeout(tick, 300);
}

let _weatherActive=null;
function applyWeather(){
  const w = (state.weather && state.weather!=='none') ? state.weather : null;
  if(w===_weatherActive) return;
  _weatherActive=w;
  let layer=el('weatherLayer');
  if(!w){ layer?.remove(); return; }
  if(!layer){ layer=document.createElement('div'); layer.id='weatherLayer'; layer.className='weather-layer'; document.body.appendChild(layer); }
  layer.className='weather-layer weather-'+w;
  layer.innerHTML='';
  const count = w==='ash'?40:(w==='snow'?50:60);
  for(let i=0;i<count;i++){
    const p=document.createElement('span'); p.className='weather-particle';
    p.style.left=Math.random()*100+'%';
    p.style.animationDelay=(Math.random()*8)+'s';
    p.style.animationDuration=(w==='rain'?(0.5+Math.random()*0.5):(5+Math.random()*7))+'s';
    p.style.setProperty('--drift',(Math.random()*40-20)+'px');
    if(w==='snow'||w==='ash'){ const s=2+Math.random()*4; p.style.width=s+'px'; p.style.height=s+'px'; }
    layer.appendChild(p);
  }
}
function setWeather(w){
  if(!dmUnlocked) return;
  state.weather = w;
  pushState(true); applyWeather();
  showToast(w==='none'?'Weather cleared':('Weather: '+w),'info');
}

function applyTimeSkin(){
  const mode = state.sceneTime && state.sceneTime!=='auto' ? state.sceneTime : autoTimeOfDay();
  document.body.classList.remove('scene-dawn','scene-day','scene-dusk','scene-night','scene-bloodmoon');
  document.body.classList.add('scene-'+mode);
}
function autoTimeOfDay(){
  const h=new Date().getHours();
  if(h>=5&&h<8) return 'dawn';
  if(h>=8&&h<17) return 'day';
  if(h>=17&&h<20) return 'dusk';
  return 'night';
}
function setSceneTime(t){
  if(!dmUnlocked) return;
  state.sceneTime=t;
  pushState(true); applyTimeSkin();
  showToast('Scene: '+t,'info');
}

let _prevLevelMap={};
function checkLevelUp(){
  state.characters.forEach(c=>{
    const key=c.id||c.name;
    if(!key) return;
    const lv=Number(c.level)||0;
    if(_prevLevelMap[key]!==undefined && lv>_prevLevelMap[key] && lv>0){
      if(c.claimedBy===MY_PRESENCE_ID || dmUnlocked) triggerLevelUp(c);
    }
    _prevLevelMap[key]=lv;
  });
}
function triggerLevelUp(c){
  const color=c.accentColor||'#00d4ff';
  const fx=document.createElement('div');
  fx.className='levelup-fx'; fx.style.setProperty('--lu-color',color);
  let rays='';
  for(let i=0;i<12;i++) rays+=`<span class="lu-ray" style="--a:${i*30}deg"></span>`;
  fx.innerHTML=`<div class="lu-burst"></div><div class="lu-rays">${rays}</div><div class="lu-text">LEVEL UP</div><div class="lu-sub">${esc((c.name||'Hunter').toUpperCase())} · LEVEL ${c.level}</div>`;
  document.body.appendChild(fx);
  levelUpSound();
  setTimeout(()=>fx.remove(),2600);
}
function levelUpSound(){
  if(typeof _rwSfxOn!=='undefined'&&!_rwSfxOn) return;
  try{
    _diceAudio=_diceAudio||new (window.AudioContext||window.webkitAudioContext)();
    const ac=_diceAudio; if(ac.state==='suspended')ac.resume();
    const t=ac.currentTime;
    [523,659,784,1047,1319].forEach((f,i)=>{ const o=ac.createOscillator(),g=ac.createGain(); o.type='triangle'; o.frequency.value=f; const w=t+i*0.1; g.gain.setValueAtTime(0.06,w); g.gain.exponentialRampToValueAtTime(0.0001,w+0.4); o.connect(g);g.connect(ac.destination);o.start(w);o.stop(w+0.42); });
  }catch(e){}
}

function rollDie(sides){ return Math.floor(Math.random()*sides)+1; }
function parseDiceExpr(expr){
  const cleaned = String(expr).replace(/\s+/g,'').toLowerCase();
  if(!cleaned) return null;
  // Reject stray decimals / unsupported chars early (e.g. "2.5d6")
  if(/[^\d+\-d]/.test(cleaned)) return null;
  const re = /([+-]?)(\d*)d(\d+)|([+-]?\d+)/g;
  let m, parts=[], total=0, valid=false, consumed=0;
  while((m=re.exec(cleaned))){
    consumed += m[0].length;
    if(m[3]!==undefined){
      const sides = Math.min(1000, Number(m[3]));
      if(sides<2){ return null; } // a die needs at least 2 sides
      valid=true;
      const sign = m[1]==='-'?-1:1;
      const count = Math.min(50, Math.max(1, Number(m[2]||1)));
      const rolls=[]; for(let i=0;i<count;i++){ const r=rollDie(sides); rolls.push(r); total+=sign*r; }
      parts.push({ type:'dice', sign, count, sides, rolls });
    } else if(m[4]!==undefined){
      valid=true;
      const n = Number(m[4]); total+=n;
      parts.push({ type:'mod', value:n });
    }
  }
  // If the regex couldn't account for the whole string, the input was malformed (e.g. "1d", "d", "2d6x")
  if(consumed !== cleaned.length) return null;
  return valid ? { total, parts } : null;
}
function rollD20(modifier, mode){
  const a = rollDie(20), b = rollDie(20);
  let nat;
  if(mode==='adv') nat = Math.max(a,b);
  else if(mode==='dis') nat = Math.min(a,b);
  else nat = a;
  return { nat, both:[a,b], mode, total: nat + modifier, modifier };
}
// ================================================================
// LIVE ROLL FEED — every roll broadcasts to the whole table
// ================================================================
const ROLL_FEED_MAX = 40;          // keep the last N rolls in the shared doc
let _rollFeedUnsub = null;
let _rollFeed = [];                // local mirror of the shared feed
let _lastFeedTs = 0;               // so we don't re-announce our own rolls

// Push a roll to the shared feed. Fire-and-forget; never blocks the local roll.
async function broadcastRoll(label, res){
  if (spectator) return;           // watchers observe, they don't roll
  try{
    const c = getChar();
    const entry = {
      id: MY_PRESENCE_ID + '-' + Date.now(),
      who: c?.name || 'Hunter',
      color: c?.accentColor || '#00d4ff',
      label: String(label||'').slice(0,60),
      total: res?.total ?? 0,
      nat: res?.nat,
      mode: res?.mode || 'normal',
      detail: rollDetailText(res),
      ts: Date.now()
    };
    const ref = doc(db,'rwby-meta','rollfeed');
    const snap = await getDoc(ref);
    const d = snap.exists() ? snap.data() : { rolls: [] };
    const rolls = Array.isArray(d.rolls) ? d.rolls : [];
    rolls.unshift(entry);
    await setDoc(ref, { rolls: rolls.slice(0, ROLL_FEED_MAX) });
  }catch(e){ /* offline / permission — local roll still worked */ }
}
// Compact human-readable breakdown for the feed
function rollDetailText(res){
  if(!res) return '';
  if(res.nat!==undefined){
    const base = (res.mode==='adv'||res.mode==='dis')
      ? `[${res.both?.[0]},${res.both?.[1]}]${res.mode==='adv'?'adv':'dis'}→${res.nat}`
      : `d20→${res.nat}`;
    return `${base} ${res.modifier>=0?'+':''}${res.modifier}`;
  }
  if(Array.isArray(res.parts)){
    return res.parts.map(p=> p.type==='dice'
      ? `${p.sign<0?'−':''}${p.count}d${p.sides}[${p.rolls.join(',')}]`
      : `${p.value>=0?'+':''}${p.value}`).join(' ');
  }
  return '';
}
function startRollFeed(){
  if(_rollFeedUnsub) return;
  _rollFeedUnsub = onSnapshot(doc(db,'rwby-meta','rollfeed'), snap=>{
    if(!snap.exists()) return;
    const d = snap.data();
    _rollFeed = Array.isArray(d.rolls) ? d.rolls : [];
    renderRollFeed();
    // announce the newest roll if it isn't ours and is fresh
    const top = _rollFeed[0];
    if(top && top.ts > _lastFeedTs){
      _lastFeedTs = top.ts;
      if(!String(top.id||'').startsWith(MY_PRESENCE_ID) && Date.now()-top.ts < 8000){
        if(top.nat===20) diceSound('crit'); else if(top.nat===1) diceSound('fumble');
      }
    }
  }, ()=>{});
}
function renderRollFeed(){
  const host = el('rollFeedList'); if(!host) return;
  if(!_rollFeed.length){
    host.innerHTML = `<div class="rf-empty">No rolls yet. Every roll at the table shows up here.</div>`;
    return;
  }
  host.innerHTML = _rollFeed.map(r=>{
    const crit = r.nat===20 ? ' crit' : (r.nat===1 ? ' fumble' : '');
    const mine = String(r.id||'').startsWith(MY_PRESENCE_ID) ? ' mine' : '';
    return `<div class="rf-row${crit}${mine}">
      <span class="rf-dot" style="background:${esc(r.color||'#00d4ff')}"></span>
      <span class="rf-body">
        <span class="rf-top"><span class="rf-who">${esc(r.who||'?')}</span><span class="rf-label">${esc(r.label||'')}</span></span>
        <span class="rf-detail">${esc(r.detail||'')}</span>
      </span>
      <span class="rf-total">${r.total}</span>
      ${crit?`<span class="rf-flag${crit}">${r.nat===20?'CRIT':'FUMBLE'}</span>`:''}
      <span class="rf-time">${rollAgo(r.ts)}</span>
    </div>`;
  }).join('');
}
function rollAgo(ts){
  const s = Math.max(0, Math.floor((Date.now()-ts)/1000));
  if(s<10) return 'now';
  if(s<60) return s+'s';
  const m=Math.floor(s/60); if(m<60) return m+'m';
  return Math.floor(m/60)+'h';
}
async function clearRollFeed(){
  if(!dmUnlocked) return;
  if(!confirm('Clear the roll feed for everyone?')) return;
  try{ await setDoc(doc(db,'rwby-meta','rollfeed'), { rolls: [] }); }catch(e){}
}

// ================================================================
// DM UNDO — snapshot stack for reversible DM actions
// ================================================================
const UNDO_MAX = 15;
let _undoStack = [];   // [{label, snapshot, ts}]

// Call BEFORE mutating state in a DM action.
function pushUndo(label){
  if(!dmUnlocked) return;
  try{
    _undoStack.push({
      label: String(label||'DM action'),
      snapshot: JSON.stringify(state.characters),
      ts: Date.now()
    });
    if(_undoStack.length > UNDO_MAX) _undoStack.shift();
    renderUndoBar();
  }catch(e){}
}
function undoLast(){
  if(!dmUnlocked || !_undoStack.length) return;
  const last = _undoStack.pop();
  try{
    const restored = JSON.parse(last.snapshot);
    if(Array.isArray(restored)){
      state.characters = restored;
      pushState(true);
      render();
      showToast(`Undid: ${last.label}`, 'info');
    }
  }catch(e){ showToast('Undo failed', 'warn'); }
  renderUndoBar();
}
function renderUndoBar(){
  const bar = el('dmUndoBar'); if(!bar) return;
  if(!dmUnlocked || !_undoStack.length){ bar.style.display='none'; return; }
  const last = _undoStack[_undoStack.length-1];
  bar.style.display='';
  bar.innerHTML = `<span class="undo-icon">↶</span>
    <span class="undo-label">Last: ${esc(last.label)}</span>
    <button class="undo-btn" id="dmUndoBtn">Undo</button>
    <span class="undo-count">${_undoStack.length}</span>`;
  el('dmUndoBtn')?.addEventListener('click', undoLast);
}

// ================================================================
// DM DASHBOARD — live party vitals at a glance
// ================================================================
// ================================================================
// DM DASHBOARD — live party vitals, multi-select + bulk actions
// ================================================================
let _dmSelected = new Set();   // indices selected for bulk actions

function toggleDmSelect(i){
  if(_dmSelected.has(i)) _dmSelected.delete(i); else _dmSelected.add(i);
  renderDmDashboard();
}
function dmSelectAll(){
  const n = (state.characters||[]).length;
  if(_dmSelected.size === n) _dmSelected.clear();
  else for(let i=0;i<n;i++) _dmSelected.add(i);
  renderDmDashboard();
}
// Apply an action to every selected character (or the target if none selected)
function dmBulkApply(kind, amount){
  const idxs = _dmSelected.size ? [..._dmSelected] : [_dmTarget];
  const names = idxs.map(i=>state.characters[i]?.name||'?').join(', ');
  pushUndo(`${kind} ${amount?amount+' ':''}→ ${names}`);
  idxs.forEach(i=>{
    const c = state.characters[i]; if(!c) return;
    if(kind==='damage'){
      c.hp.current = Math.max(0, (Number(c.hp.current)||0) - amount);
      flashCard(i,'dmg');
    }
    if(kind==='heal'){
      c.hp.current = Math.min(effectiveHpMax(c), (Number(c.hp.current)||0) + amount);
      flashCard(i,'heal');
    }
    if(kind==='aura'){ c.aura.current = effectiveAuraMax(c); flashCard(i,'aura'); }
    if(kind==='fullrest'){
      c.hp.current = effectiveHpMax(c);
      c.aura.current = effectiveAuraMax(c);
      if(c.deathSaves) c.deathSaves = {successes:0,failures:0,stable:false};
      flashCard(i,'heal');
    }
    ensureClamp(c);
  });
  pushState(true);
  setTimeout(()=>render(), 260);   // let the flash animation play first
  showToast(`${kind==='fullrest'?'Full rest':kind} applied to ${idxs.length} character${idxs.length===1?'':'s'}`, 'info');
}
// One-shot flash on a dashboard card
function flashCard(i, kind){
  const card = document.querySelector(`.dmd-card[data-dmd="${i}"]`);
  if(!card) return;
  card.classList.remove('flash-dmg','flash-heal','flash-aura');
  void card.offsetWidth;                   // restart the animation
  card.classList.add('flash-'+kind);
  setTimeout(()=>card.classList.remove('flash-'+kind), 700);
}
function renderBulkBar(){
  const bar = el('dmBulkBar'); if(!bar) return;
  if(!dmUnlocked){ bar.style.display='none'; return; }
  const n = _dmSelected.size;
  bar.style.display='';
  bar.className = 'dm-bulk-bar' + (n ? ' active' : '');
  const label = n ? `${n} selected` : 'None selected — actions hit the sidebar target';
  bar.innerHTML = `
    <button class="dbb-all" id="dmSelectAll">${n===(state.characters||[]).length && n>0 ? '☑' : '☐'} All</button>
    <span class="dbb-label">${label}</span>
    <span class="dbb-actions">
      <input type="number" id="dmBulkAmt" class="dbb-amt" value="10" min="1" title="Amount">
      <button class="dbb-btn dmg"  id="dmBulkDmg">− Damage</button>
      <button class="dbb-btn heal" id="dmBulkHeal">+ Heal</button>
      <button class="dbb-btn aura" id="dmBulkAura">⟳ Aura</button>
      <button class="dbb-btn rest" id="dmBulkRest">☾ Full Rest</button>
    </span>`;
  el('dmSelectAll')?.addEventListener('click', dmSelectAll);
  const amt = ()=> Math.max(1, Number(el('dmBulkAmt')?.value)||10);
  el('dmBulkDmg')?.addEventListener('click', ()=>dmBulkApply('damage', amt()));
  el('dmBulkHeal')?.addEventListener('click', ()=>dmBulkApply('heal', amt()));
  el('dmBulkAura')?.addEventListener('click', ()=>dmBulkApply('aura'));
  el('dmBulkRest')?.addEventListener('click', ()=>dmBulkApply('fullrest'));
}

function renderDmDashboard(){
  const host = el('dmDashboard'); if(!host || !dmUnlocked) return;
  const chars = (state.characters||[]);
  if(!chars.length){ host.innerHTML = '<div class="dm-empty">No characters.</div>'; return; }
  // who's online right now — a character is "live" if its claimer has a fresh heartbeat
  const isLive = (c)=> !!c.claimedBy && _livePresenceIds.has(c.claimedBy);

  host.innerHTML = chars.map((c,i)=>{
    const hpMax = Math.max(1, effectiveHpMax(c));
    const hpCur = Math.max(0, Number(c.hp?.current)||0);
    const auMax = Math.max(1, effectiveAuraMax(c));
    const auCur = Math.max(0, Number(c.aura?.current)||0);
    const hpPct = Math.min(100, (hpCur/hpMax)*100);
    const auPct = Math.min(100, (auCur/auMax)*100);
    const hpState = hpPct<=25 ? 'critical' : hpPct<=50 ? 'hurt' : 'ok';
    const dead = c.state==='dead';
    const reserve = c.state==='reserve';
    const col = c.accentColor || '#00d4ff';
    const isOnline = isLive(c);
    const claimed = !!c.claimedBy;
    const armor = (Number(c.armor)||0) + featBonus(c,'ac');
    const spd = (Number(c.speed)||0) + featBonus(c,'speed');
    const pp = (()=>{ try{ return passivePerception(c); }catch(e){ return '—'; } })();
    const semUnlocked = ['first','second','third','ascended'].filter(k=>c.semblance?.unlocked?.[k]).length;
    const techCount = (c.techniques||[]).length;
    const curseCount = (c.curses||[]).length;
    const featCount = (c.feats||[]).length;
    const isTarget = i===_dmTarget;
    const sel = _dmSelected.has(i);
    // Death saves surface only when it matters — at 0 HP
    const ds = c.deathSaves || {successes:0,failures:0,stable:false};
    const dying = hpCur<=0 && !dead;
    const dsBlock = dying ? `<div class="dmd-death ${ds.stable?'stable':''}">
        <span class="dmd-death-label">${ds.stable?'STABLE':'DYING'}</span>
        <span class="dmd-pips succ" title="Successes">${[0,1,2].map(n=>`<i class="${n<ds.successes?'on':''}"></i>`).join('')}</span>
        <span class="dmd-pips fail" title="Failures">${[0,1,2].map(n=>`<i class="${n<ds.failures?'on':''}"></i>`).join('')}</span>
      </div>` : '';
    return `<div class="dmd-card ${dead?'dead':''} ${reserve?'reserve':''} ${isTarget?'targeted':''} ${sel?'selected':''} ${dying?'dying':''}" data-dmd="${i}" style="--dmd-col:${esc(col)}">
      <div class="dmd-head">
        <button class="dmd-check ${sel?'on':''}" data-dmd-sel="${i}" title="Select for bulk actions">${sel?'☑':'☐'}</button>
        <span class="dmd-dot ${isOnline?'online':''}" title="${isOnline?'Online now':claimed?'Claimed, offline':'Unclaimed'}"></span>
        <span class="dmd-name">${esc(c.name||'Player '+(i+1))}</span>
        ${dead?'<span class="dmd-tag dead">DEAD</span>':reserve?'<span class="dmd-tag reserve">RESERVE</span>':''}
        ${isTarget?'<span class="dmd-tag target">TARGET</span>':''}
        <span class="dmd-lvl">Lv${c.level||1}</span>
      </div>
      <div class="dmd-sub">${esc(c.className||'—')}${c.race?' · '+esc(raceLabel(c)):''}</div>
      ${dsBlock}
      <div class="dmd-bars">
        <div class="dmd-bar-row">
          <span class="dmd-bar-label">HP</span>
          <div class="dmd-bar"><span class="dmd-fill hp ${hpState}" style="width:${hpPct}%"></span></div>
          <span class="dmd-val ${hpState}">${hpCur}/${hpMax}</span>
        </div>
        <div class="dmd-bar-row">
          <span class="dmd-bar-label">AU</span>
          <div class="dmd-bar"><span class="dmd-fill aura" style="width:${auPct}%"></span></div>
          <span class="dmd-val">${auCur}/${auMax}</span>
        </div>
      </div>
      <div class="dmd-stats">
        <span title="Armor">🛡 ${armor||'—'}</span>
        <span title="Speed">👟 ${spd||'—'}</span>
        <span title="Passive Perception">👁 ${pp}</span>
        <span title="Semblance stages unlocked">✦ ${semUnlocked}/4</span>
        <span title="Techniques">⚡ ${techCount}</span>
        ${featCount?`<span class="dmd-feats" title="Mechanical feats">★ ${featCount}</span>`:''}
        ${curseCount?`<span class="dmd-cursed" title="Active curses">☠ ${curseCount}</span>`:''}
      </div>
      <div class="dmd-quick">
        <button class="dmd-qbtn dmg" data-dmd-act="dmg" data-i="${i}" title="Deal 5 damage">−5 HP</button>
        <button class="dmd-qbtn heal" data-dmd-act="heal" data-i="${i}" title="Heal 5">+5 HP</button>
        <button class="dmd-qbtn aura" data-dmd-act="aura" data-i="${i}" title="Restore aura to full">⟳ Aura</button>
        <button class="dmd-qbtn view" data-dmd-act="view" data-i="${i}" title="Open ${esc(c.name||'this character')}'s full sheet">👁 Sheet</button>
      </div>
    </div>`;
  }).join('');

  // selection checkboxes
  host.querySelectorAll('.dmd-check').forEach(b=> b.addEventListener('click', e=>{
    e.stopPropagation();
    toggleDmSelect(Number(b.dataset.dmdSel));
  }));

  // clicking a card targets that character for all DM tools
  host.querySelectorAll('.dmd-card').forEach(card=> card.addEventListener('click', ()=>{
    setDmTarget(Number(card.dataset.dmd));
  }));

  host.querySelectorAll('.dmd-qbtn').forEach(b=> b.addEventListener('click', e=>{
    e.stopPropagation();
    const i = Number(b.dataset.i), act = b.dataset.dmdAct;
    const c = state.characters[i]; if(!c) return;
    // 'view' jumps to that character's actual sheet. It MUST leave the DM
    // page — otherwise dm-page-active keeps the sheet hidden behind it and
    // you just get a blank screen.
    if(act==='view'){
      setViewIdx(i);
      setDmTarget(i);      // keep the DM's target in step with what they opened
      hideDmPage();        // exits the page, keeps DM rights, re-renders
      return;
    }
    pushUndo(`${act==='dmg'?'Damaged':act==='heal'?'Healed':'Restored aura for'} ${c.name||'player'}`);
    if(act==='dmg')  c.hp.current = Math.max(0, (Number(c.hp.current)||0) - 5);
    if(act==='heal') c.hp.current = Math.min(effectiveHpMax(c), (Number(c.hp.current)||0) + 5);
    if(act==='aura') c.aura.current = effectiveAuraMax(c);
    ensureClamp(c); pushState(true); render();
  }));
}

// ================================================================
// DM TARGET — one character picker drives every DM tab
// ================================================================
let _dmTarget = 0;   // index into state.characters

function dmTargetChar(){
  const n = (state.characters||[]).length;
  if(!n) return null;
  if(_dmTarget >= n) _dmTarget = n-1;
  if(_dmTarget < 0) _dmTarget = 0;
  return state.characters[_dmTarget];
}
function setDmTarget(i){
  const n = (state.characters||[]).length;
  _dmTarget = Math.max(0, Math.min(i, Math.max(0,n-1)));
  renderDmTargetPicker();
  // refresh every tab that depends on the target
  try{ renderDmSemblance(); }catch(e){}
  try{ renderDmTechniques(); }catch(e){}
  try{ renderCommendPanel(); }catch(e){}
  try{ renderDmFeatGrid(); }catch(e){}
  try{ renderDmDashboard(); }catch(e){}
  const nameEl = el('dmSelectedCharacterName');
  if(nameEl) nameEl.textContent = dmTargetChar()?.name || '—';
}
// The sidebar picker itself
function renderDmTargetPicker(){
  const host = el('dmTargetPicker'); if(!host || !dmUnlocked) return;
  const chars = state.characters||[];
  host.innerHTML = chars.map((c,i)=>{
    const sel = i===_dmTarget;
    const col = c.accentColor || '#00d4ff';
    const hpMax = Math.max(1, Number(c.hp?.max)||1);
    const hpPct = Math.min(100, ((Number(c.hp?.current)||0)/hpMax)*100);
    const dead = c.state==='dead';
    return `<button class="dmt-pick${sel?' active':''}${dead?' dead':''}" data-dmt="${i}" style="--dmt-col:${esc(col)}" title="${esc(c.name||'Player '+(i+1))}">
      <span class="dmt-swatch"></span>
      <span class="dmt-name">${esc(c.name||'Player '+(i+1))}</span>
      <span class="dmt-hp"><span style="width:${hpPct}%"></span></span>
    </button>`;
  }).join('');
  host.querySelectorAll('.dmt-pick').forEach(b=>
    b.addEventListener('click', ()=> setDmTarget(Number(b.dataset.dmt))));
}

// ================================================================
// DM STAT LOCK — the DM views stats read-only unless they unlock
// ================================================================
let _dmStatsUnlocked = false;   // per-session, never persisted

// True when the person can actually type into this character's core stats.
function canEditStats(){
  if (spectator) return false;
  if (dmUnlocked) return true;               // the DM edits any sheet at will
  return isViewingOwnCharacter();            // players edit their own sheet
}
function toggleDmStatLock(){
  _dmStatsUnlocked = !_dmStatsUnlocked;
  showToast(_dmStatsUnlocked ? 'Stat editing UNLOCKED — be careful' : 'Stats locked (read-only)',
            _dmStatsUnlocked ? 'warn' : 'info');
  render();
}
function renderStatLockBar(){
  const bar = el('dmStatLock'); if(!bar) return;
  bar.style.display = 'none';   // stat locking retired — the DM edits freely
}

// ================================================================
// FEATS — mechanical perks granted by the DM that really change numbers
// ================================================================
// Each feat declares its effects declaratively so every calculation
// (stats, skills, attack, init, HP/Aura) reads from one place.
//   stat:{STR:+2}        flat ability-score bonus
//   skill:{Stealth:+3}   flat skill bonus
//   allSkillsOfStat:{DEX:+1}
//   attack:+1  initiative:+2  ac:+1  spellDC:+1  passive:+5
//   hpMax:+5  auraMax:+10  hpPerLevel:+1
//   speed:+10
const FEATS = [
  { id:'iron_hide',    icon:'🛡', name:'Iron Hide',        desc:'Toughened by a hundred fights. +2 CON, +5 max HP.',            effects:{ stat:{CON:2}, hpMax:5 } },
  { id:'quickstep',    icon:'💨', name:'Quickstep',        desc:'You move before others think. +2 DEX, +2 initiative.',          effects:{ stat:{DEX:2}, initiative:2 } },
  { id:'aura_well',    icon:'✶', name:'Deep Aura Well',    desc:'Your Aura runs deeper than most. +15 max Aura.',                effects:{ auraMax:15 } },
  { id:'duelist',      icon:'⚔', name:'Duelist',           desc:'Relentless in close quarters. +1 to all attack rolls.',         effects:{ attack:1 } },
  { id:'shadow',       icon:'🌑', name:'Shadow',           desc:'Unseen and unheard. +3 Stealth, +2 Sleight of Hand.',           effects:{ skill:{ 'Stealth':3, 'Sleight of Hand':2 } } },
  { id:'silver_tongue',icon:'💬', name:'Silver Tongue',    desc:'You talk your way out of anything. +1 to all CHA skills.',      effects:{ allSkillsOfStat:{CHA:1} } },
  { id:'scholar',      icon:'📖', name:'Scholar of Remnant',desc:'Deep study of Dust and Grimm. +2 INT, +1 spell DC.',           effects:{ stat:{INT:2}, spellDC:1 } },
  { id:'sentinel',     icon:'👁', name:'Sentinel',          desc:'Nothing slips past you. +5 passive Perception, +2 Perception.',effects:{ passive:5, skill:{'Perception':2} } },
  { id:'fleetfoot',    icon:'👟', name:'Fleet-Footed',     desc:'Faster than you look. +10 speed, +1 Acrobatics.',               effects:{ speed:10, skill:{'Acrobatics':1} } },
  { id:'brawler',      icon:'👊', name:'Brawler',          desc:'Raw physical power. +2 STR, +1 Athletics.',                     effects:{ stat:{STR:2}, skill:{'Athletics':1} } },
  { id:'warded',       icon:'🔰', name:'Warded',           desc:'Hard to pin down. +1 Armor.',                                   effects:{ ac:1 } },
  { id:'survivor',     icon:'❤', name:'Survivor',          desc:'You refuse to fall. +1 max HP per level.',                      effects:{ hpPerLevel:1 } },
  { id:'keen_senses',  icon:'🐾', name:'Keen Senses',      desc:'Faunus-sharp awareness. +2 WIS, +1 Investigation.',            effects:{ stat:{WIS:2}, skill:{'Investigation':1} } },
  { id:'battle_focus', icon:'🎯', name:'Battle Focus',     desc:'Calm in the storm. +1 attack, +1 initiative.',                  effects:{ attack:1, initiative:1 } },
];
function featById(id){
  const built = FEATS.find(f=>f.id===id);
  if (built) return built;
  // custom feats live campaign-wide so any character can be granted them
  const custom = Array.isArray(state?.customFeats) ? state.customFeats.find(f=>f.id===id) : null;
  return custom || null;
}
// Every feat the DM can grant: built-ins plus custom ones
function allFeats(){
  const custom = Array.isArray(state?.customFeats) ? state.customFeats : [];
  return FEATS.concat(custom);
}
function charFeats(c){
  if(!c || !Array.isArray(c.feats)) return [];
  return c.feats.map(featById).filter(Boolean);
}
// Sum one numeric effect key across all of a character's feats.
function featBonus(c, key){
  return charFeats(c).reduce((sum,f)=> sum + (Number(f.effects?.[key])||0), 0);
}
// Sum a nested map effect (stat / skill / allSkillsOfStat)
function featMapBonus(c, mapKey, subKey){
  return charFeats(c).reduce((sum,f)=> sum + (Number(f.effects?.[mapKey]?.[subKey])||0), 0);
}
// Total flat ability-score bonus from feats
function featStatBonus(c, stat){ return featMapBonus(c,'stat',stat); }
// Total skill bonus from feats: direct skill bonus + any allSkillsOfStat matching
function featSkillBonus(c, skillName){
  let total = featMapBonus(c,'skill',skillName);
  const def = SKILL_DEFS.find(s=>s.name===skillName);
  if(def) total += featMapBonus(c,'allSkillsOfStat',def.stat);
  return total;
}
// Human-readable list of what a feat does, for the UI
function featEffectSummary(f){
  const e = f.effects||{}; const out=[];
  if(e.stat) Object.entries(e.stat).forEach(([k,v])=>out.push(`${v>=0?'+':''}${v} ${k}`));
  if(e.skill) Object.entries(e.skill).forEach(([k,v])=>out.push(`${v>=0?'+':''}${v} ${k}`));
  if(e.allSkillsOfStat) Object.entries(e.allSkillsOfStat).forEach(([k,v])=>out.push(`${v>=0?'+':''}${v} all ${k} skills`));
  if(e.attack)     out.push(`${e.attack>=0?'+':''}${e.attack} attack`);
  if(e.initiative) out.push(`${e.initiative>=0?'+':''}${e.initiative} initiative`);
  if(e.ac)         out.push(`${e.ac>=0?'+':''}${e.ac} armor`);
  if(e.spellDC)    out.push(`${e.spellDC>=0?'+':''}${e.spellDC} spell DC`);
  if(e.passive)    out.push(`${e.passive>=0?'+':''}${e.passive} passive perception`);
  if(e.hpMax)      out.push(`${e.hpMax>=0?'+':''}${e.hpMax} max HP`);
  if(e.hpPerLevel) out.push(`${e.hpPerLevel>=0?'+':''}${e.hpPerLevel} HP/level`);
  if(e.auraMax)    out.push(`${e.auraMax>=0?'+':''}${e.auraMax} max Aura`);
  if(e.speed)      out.push(`${e.speed>=0?'+':''}${e.speed} speed`);
  return out;
}
// Bonus max HP/Aura contributed by feats (used by the sheet + dashboard)
function featHpMaxBonus(c){ return featBonus(c,'hpMax') + featBonus(c,'hpPerLevel')*(Number(c?.level)||1); }
function featAuraMaxBonus(c){ return featBonus(c,'auraMax'); }

// ================================================================
// RENDER — PLAYER FEATS (with live effect readout)
// ================================================================
function renderFeatsList(){
  const c = getChar(); const host = el('featsList'); if(!host) return;
  const mine = charFeats(c);
  if(!mine.length){
    host.innerHTML = `<div class="feats-empty">No feats yet. Your DM grants these — each one changes your actual numbers.</div>`;
    return;
  }
  host.innerHTML = mine.map(f=>`
    <div class="feat-card" data-feat="${f.id}">
      <div class="feat-icon">${f.icon}</div>
      <div class="feat-body">
        <div class="feat-name">${esc(f.name)}</div>
        <div class="feat-desc">${esc(f.desc)}</div>
        <div class="feat-effects">${featEffectSummary(f).map(e=>`<span class="feat-eff">${esc(e)}</span>`).join('')}</div>
      </div>
    </div>`).join('');
}

// ================================================================
// DM — GRANT MECHANICAL FEATS
// ================================================================
// Author form for custom feats — renders the ability inputs, the skill
// grid (History / Athletics / etc.), and wires Create.
// Skill inputs are grouped by governing stat so the DM can eyeball what
// they're stacking (e.g. "+2 to all INT skills? or just History?").
function renderCustomFeatAuthor(){
  const host = el('cfStats'); if(!host) return;
  if(!host.dataset.built){
    host.innerHTML = STATS.map(s=>`
      <label class="cfa-num"><span>${s}</span><input id="cf_${s}" type="number" value="0"></label>`).join('');
    host.dataset.built = '1';
  }
  // Skill grid — built once, then just left in the DOM
  const skillHost = el('cfSkills');
  if(skillHost && !skillHost.dataset.built){
    // group skills by stat, skip saves (those come from the STAT bonus already)
    const byStat = {};
    SKILL_DEFS.filter(d=>!d.isSave).forEach(d=>{
      (byStat[d.stat] = byStat[d.stat] || []).push(d.name);
    });
    skillHost.innerHTML = STATS.map(stat => {
      const skills = byStat[stat] || [];
      if(!skills.length) return '';
      return `<div class="cfa-skill-group">
        <div class="cfa-skill-head">
          <span class="cfa-skill-stat">${stat}</span>
          <label class="cfa-skill-all" title="Add a bonus to ALL ${stat} skills at once">
            <span>all ${stat}</span>
            <input id="cf_all_${stat}" type="number" value="0">
          </label>
        </div>
        <div class="cfa-skill-row">
          ${skills.map(s=>`
            <label class="cfa-skill-cell"><span>${esc(s)}</span>
              <input id="cf_sk_${esc(s.replace(/\s+/g,'_'))}" type="number" value="0" data-skill="${esc(s)}">
            </label>`).join('')}
        </div>
      </div>`;
    }).join('');
    skillHost.dataset.built = '1';
  }
  const btn = el('cfCreate');
  if(btn && !btn.dataset.bound){
    btn.dataset.bound = '1';
    btn.addEventListener('click', ()=>{
      if(!dmUnlocked) return;
      const name = (el('cfName')?.value||'').trim();
      if(!name){ showToast('Give the feat a name', 'warn'); return; }
      const effects = {};

      // Ability score bonuses
      const stat = {};
      STATS.forEach(s=>{ const v = Number(el('cf_'+s)?.value)||0; if(v) stat[s]=v; });
      if(Object.keys(stat).length) effects.stat = stat;

      // Per-skill bonuses (History, Athletics, etc.)
      const skill = {};
      document.querySelectorAll('#cfSkills input[data-skill]').forEach(inp => {
        const v = Number(inp.value)||0;
        if(v) skill[inp.dataset.skill] = v;
      });
      if(Object.keys(skill).length) effects.skill = skill;

      // "All X skills" umbrella bonuses
      const allSkills = {};
      STATS.forEach(s=>{ const v = Number(el('cf_all_'+s)?.value)||0; if(v) allSkills[s]=v; });
      if(Object.keys(allSkills).length) effects.allSkillsOfStat = allSkills;

      // Everything else
      const extra = {attack:'cfAttack',initiative:'cfInit',ac:'cfAc',passive:'cfPassive',hpMax:'cfHp',auraMax:'cfAura',speed:'cfSpeed'};
      Object.entries(extra).forEach(([k,id])=>{ const v = Number(el(id)?.value)||0; if(v) effects[k]=v; });

      const feat = {
        id: 'custom-' + Date.now(),
        icon: (el('cfIcon')?.value||'✦').slice(0,3) || '✦',
        name,
        desc: (el('cfDesc')?.value||'').trim(),
        custom: true,
        effects
      };
      if(!Array.isArray(state.customFeats)) state.customFeats = [];
      pushUndo(`Created custom feat "${name}"`);
      state.customFeats.push(feat);

      // reset the form
      el('cfName').value=''; el('cfDesc').value=''; el('cfIcon').value='✦';
      STATS.forEach(s=> { el('cf_'+s).value='0'; const a=el('cf_all_'+s); if(a) a.value='0'; });
      document.querySelectorAll('#cfSkills input[data-skill]').forEach(inp => inp.value='0');
      Object.values(extra).forEach(id=> { const e=el(id); if(e) e.value='0'; });

      pushState(true); render();
      showToast(`Custom feat "${name}" created`, 'success');
    });
  }
}

function renderDmFeatGrid(){
  const host = el('dmFeatGrid'); if(!host || !dmUnlocked) return;
  const c = dmTargetChar();
  if(!c){ host.innerHTML = '<div class="dm-empty">No character selected.</div>'; return; }
  if(!Array.isArray(c.feats)) c.feats = [];
  const feats = allFeats();
  host.innerHTML = feats.map(f=>{
    const has = c.feats.includes(f.id);
    return `<button class="dmf-card${has?' granted':''}${f.custom?' custom':''}" data-featid="${f.id}" title="${esc(f.desc)}">
      <span class="dmf-icon">${esc(f.icon)}</span>
      <span class="dmf-body">
        <span class="dmf-name">${esc(f.name)}${f.custom?' <em class="dmf-tag">custom</em>':''}</span>
        <span class="dmf-effects">${featEffectSummary(f).join(' · ')||'no effects'}</span>
      </span>
      ${f.custom?`<span class="dmf-trash" data-delfeat="${f.id}" title="Delete this custom feat">🗑</span>`:''}
      <span class="dmf-check">${has?'✓':'+'}</span>
    </button>`;
  }).join('');

  // delete a custom feat entirely (also strips it from everyone who had it)
  host.querySelectorAll('.dmf-trash').forEach(t=> t.addEventListener('click', e=>{
    e.stopPropagation();
    const id = t.dataset.delfeat;
    const f = featById(id);
    if(!confirm(`Delete the custom feat "${f?.name||id}"? It will be removed from every character who has it.`)) return;
    pushUndo(`Deleted custom feat "${f?.name||id}"`);
    state.customFeats = (state.customFeats||[]).filter(x=>x.id!==id);
    state.characters.forEach(ch=>{ if(Array.isArray(ch.feats)) ch.feats = ch.feats.filter(x=>x!==id); });
    pushState(true); render();
  }));

  host.querySelectorAll('.dmf-card').forEach(b=> b.addEventListener('click', ()=>{
    const id = b.dataset.featid;
    const target = dmTargetChar(); if(!target) return;
    if(!Array.isArray(target.feats)) target.feats = [];
    const has = target.feats.includes(id);
    pushUndo(`${has?'Revoked':'Granted'} feat "${featById(id)?.name||id}" ${has?'from':'to'} ${target.name||'player'}`);
    if(has){
      target.feats = target.feats.filter(x=>x!==id);
    } else {
      target.feats.push(id);
      b.classList.add('just-granted');
      setTimeout(()=>b.classList.remove('just-granted'), 900);
      showFeatGrantFx(featById(id), target);
    }
    ensureClamp(target);
    pushState(true); render();
  }));
}

// Celebratory one-shot animation when a feat lands
function showFeatGrantFx(feat, target){
  if(!feat) return;
  const fx = document.createElement('div');
  fx.className = 'feat-grant-fx';
  fx.innerHTML = `<div class="fgf-burst"></div>
    <div class="fgf-card">
      <div class="fgf-icon">${feat.icon}</div>
      <div class="fgf-text">
        <div class="fgf-label">FEAT GRANTED</div>
        <div class="fgf-name">${esc(feat.name)}</div>
        <div class="fgf-to">→ ${esc(target?.name||'player')}</div>
      </div>
    </div>`;
  document.body.appendChild(fx);
  setTimeout(()=>fx.classList.add('show'), 20);
  setTimeout(()=>{ fx.classList.remove('show'); setTimeout(()=>fx.remove(), 400); }, 2200);
}

// ================================================================
// SNAPSHOTS — durable safety net for destructive actions
// ================================================================
// pushState() overwrites ONE Firestore doc with no version history, so a
// delete is permanent the moment it syncs. Before anything destructive we
// write a timestamped copy to rwby-backups/* that outlives the session.
const SNAPSHOT_MAX = 10;

async function saveSnapshot(reason){
  try{
    const id = 'snap-' + Date.now();
    await setDoc(doc(db, 'rwby-backups', id), {
      ts: Date.now(),
      reason: String(reason||'manual'),
      by: MY_PRESENCE_ID,
      data: JSON.stringify(state)
    });
    // prune old snapshots so this never grows without bound
    const all = await getDocs(collection(db, 'rwby-backups'));
    const rows = [];
    all.forEach(d => rows.push({ id: d.id, ts: d.data().ts || 0 }));
    rows.sort((a,b) => b.ts - a.ts);
    for (const old of rows.slice(SNAPSHOT_MAX)) {
      await deleteDoc(doc(db, 'rwby-backups', old.id)).catch(()=>{});
    }
    return id;
  }catch(e){
    console.error('[rwby] snapshot failed:', e);
    return null;
  }
}

async function listSnapshots(){
  try{
    const all = await getDocs(collection(db, 'rwby-backups'));
    const rows = [];
    all.forEach(d => {
      const v = d.data();
      let chars = [];
      try { chars = (JSON.parse(v.data)?.characters || []).map(c => c.name || '?'); } catch(e){}
      rows.push({ id: d.id, ts: v.ts || 0, reason: v.reason || '', chars });
    });
    rows.sort((a,b) => b.ts - a.ts);
    return rows;
  }catch(e){ return []; }
}

async function restoreSnapshot(id){
  if(!dmUnlocked) return;
  try{
    const snap = await getDoc(doc(db, 'rwby-backups', id));
    if(!snap.exists()){ showToast('Snapshot not found', 'warn'); return; }
    const parsed = JSON.parse(snap.data().data);
    if(!parsed || !Array.isArray(parsed.characters)) { showToast('Snapshot is unreadable', 'warn'); return; }
    // Save where we are now, so restoring is itself undoable.
    await saveSnapshot('before restore');
    state = normalize(parsed);
    await pushState(true);
    render();
    showToast('Snapshot restored', 'success', 5000);
    renderSnapshotList();
  }catch(e){ showToast('Restore failed', 'warn'); }
}

function snapAgo(ts){
  const s = Math.max(0, Math.floor((Date.now()-ts)/1000));
  if(s<60) return s+'s ago';
  const m=Math.floor(s/60); if(m<60) return m+'m ago';
  const h=Math.floor(m/60); if(h<24) return h+'h ago';
  return Math.floor(h/24)+'d ago';
}

async function renderSnapshotList(){
  const host = el('snapshotList'); if(!host || !dmUnlocked) return;
  host.innerHTML = `<div class="snap-loading">Loading backups…</div>`;
  const rows = await listSnapshots();
  if(!rows.length){
    host.innerHTML = `<div class="snap-empty">No backups yet. One is saved automatically before any character is deleted.</div>`;
    return;
  }
  host.innerHTML = rows.map(r=>`
    <div class="snap-row">
      <div class="snap-info">
        <div class="snap-reason">${esc(r.reason)}</div>
        <div class="snap-meta">${snapAgo(r.ts)} · ${r.chars.length} character${r.chars.length===1?'':'s'} · ${esc(r.chars.slice(0,4).join(', '))}${r.chars.length>4?'…':''}</div>
      </div>
      <button class="snap-restore" data-snap="${esc(r.id)}">Restore</button>
    </div>`).join('');
  host.querySelectorAll('.snap-restore').forEach(b=> b.addEventListener('click', ()=>{
    const id = b.dataset.snap;
    if(!confirm('Restore this backup? Your current state will be backed up first, so this is reversible.')) return;
    restoreSnapshot(id);
  }));
}

// ================================================================
// COMPASS — Holy Armaments & Cursed Tools (per character, DM-managed)
// ================================================================
const COMPASS_BLANK = () => ({
  id: 'art-' + Date.now() + '-' + Math.random().toString(16).slice(2,6),
  name:'', type:'holy', image:'', effect:'',
  originalOwner:'', currentOwner:'',
  entityKind:'demon', entityName:'', entityTitle:''
});

// Players read their own artifacts; only the DM writes them.
function canEditCompass(){
  if (spectator) return false;
  return dmUnlocked;
}

function renderCompass(){
  const c = getChar(); const host = el('compassList'); if(!host) return;
  if(!Array.isArray(c.compass)) c.compass = [];
  const editable = canEditCompass();

  const bar = el('compassLockBar');
  if(bar){
    if(editable){ bar.style.display='none'; }
    else {
      bar.style.display='';
      bar.className = 'dm-stat-lock';
      bar.innerHTML = `<span class="dsl-icon">🔒</span>
        <span class="dsl-text">These artifacts are bound by your DM. You can read them, not rewrite them.</span>`;
    }
  }
  const addBtn = el('addCompassBtn');
  if(addBtn) addBtn.style.display = editable ? '' : 'none';

  if(!c.compass.length){
    host.innerHTML = `<div class="compass-empty">No armaments or tools bound to ${esc(c.name||'this Hunter')}.</div>`;
    return;
  }

  // Compact tile grid — click a tile to open the full sheet overlay.
  // Mirrors the .beast-tile pattern so both damage collections read
  // consistently. Portrait / glyph, name, type badge, entity badge.
  host.innerHTML = c.compass.map((a,i)=>{
    const cursed = a.type === 'cursed';
    const angel  = a.entityKind === 'angel';
    const entityChip = a.entityName
      ? `<span class="art-tile-entity ${angel?'angel':'demon'}"><span class="art-tile-entity-glyph">${angel?'✟':'⛧'}</span>${esc(a.entityName)}</span>`
      : '';
    const holdBy = a.currentOwner ? `<span class="art-tile-note">Held by ${esc(a.currentOwner)}</span>` : '';
    return `<button type="button" class="art-tile ${cursed?'cursed':'holy'}${a.image?'':' no-img'}" data-artid="${esc(a.id)}" data-ci="${i}">
      <div class="art-tile-portrait">
        ${a.image
          ? `<img src="${esc(a.image)}" alt="" onerror="this.parentElement.classList.add('no-img');this.remove()">`
          : `<span class="art-tile-glyph">${cursed?'⛧':'✟'}</span>`}
        <span class="art-tile-typebadge">${cursed?'CURSED':'HOLY'}</span>
      </div>
      <div class="art-tile-body">
        <div class="art-tile-name">${esc(a.name || 'Unnamed artifact')}</div>
        <div class="art-tile-meta">
          ${entityChip}
          ${holdBy}
        </div>
      </div>
      <span class="art-tile-open">↗</span>
    </button>`;
  }).join('');

  host.querySelectorAll('.art-tile').forEach(t => {
    t.addEventListener('click', () => openArtifactSheet(t.dataset.artid));
  });
}

// ================================================================
// ARTIFACT (COMPASS) STAT SHEET — click-to-open overlay
// One authoritative editor per artifact. Same pattern as beasts:
// the tile is a summary; all editing happens here.
// ================================================================
let _openArtifactId = null;

function openArtifactSheet(artId){
  const c = getChar(); if(!c) return;
  const a = (c.compass||[]).find(x => x.id === artId); if(!a) return;
  _openArtifactId = artId;
  renderArtifactSheet();
  const overlay = el('artifactSheetOverlay');
  if(overlay){
    overlay.classList.add('open');
    setTimeout(() => overlay.querySelector('.ash-name')?.focus(), 40);
  }
}
function closeArtifactSheet(){
  _openArtifactId = null;
  const overlay = el('artifactSheetOverlay');
  if(overlay) overlay.classList.remove('open');
}
function renderArtifactSheet(){
  if(!_openArtifactId) return;
  const c = getChar(); if(!c) { closeArtifactSheet(); return; }
  const idx = (c.compass||[]).findIndex(x => x.id === _openArtifactId);
  if(idx < 0){ closeArtifactSheet(); return; }
  const a = c.compass[idx];
  const editable = canEditCompass();
  const ro  = editable ? '' : 'readonly tabindex="-1"';
  const dis = editable ? '' : 'disabled';
  const cursed = a.type === 'cursed';
  const angel  = a.entityKind === 'angel';
  const body = el('artifactSheetBody'); if(!body) return;

  body.innerHTML = `
    <div class="ash-head ${cursed?'cursed':'holy'}">
      <div class="ash-portrait${a.image?'':' no-img'}">
        ${a.image
          ? `<img src="${esc(a.image)}" alt="" onerror="this.parentElement.classList.add('no-img');this.remove()">`
          : `<span class="ash-glyph">${cursed?'⛧':'✟'}</span>`}
      </div>
      <div class="ash-title-wrap">
        <div class="ash-kind">${cursed?'Cursed Tool':'Holy Armament'}</div>
        <input class="ash-name" data-af="name" value="${esc(a.name)}" placeholder="Unnamed artifact" ${ro}>
        ${a.entityName ? `<div class="ash-entity ${angel?'angel':'demon'}"><span>${angel?'✟':'⛧'}</span> ${esc(a.entityName)}${a.entityTitle?` · <em>${esc(a.entityTitle)}</em>`:''}</div>` : ''}
      </div>
      <div class="ash-actions">
        ${editable?`<button class="ash-del" title="Delete artifact">🗑</button>`:''}
        <button class="ash-close" title="Close">✕</button>
      </div>
    </div>
    <div class="ash-body">
      ${editable ? `
        <div class="ash-row-two">
          <label class="ash-field">
            <span>Type</span>
            <select class="ash-input" data-af="type" ${dis}>
              <option value="holy" ${!cursed?'selected':''}>Holy Armament</option>
              <option value="cursed" ${cursed?'selected':''}>Cursed Tool</option>
            </select>
          </label>
          <label class="ash-field">
            <span>Connected Entity</span>
            <select class="ash-input" data-af="entityKind" ${dis}>
              <option value="demon" ${!angel?'selected':''}>Demon</option>
              <option value="angel" ${angel?'selected':''}>Angel</option>
            </select>
          </label>
        </div>
        <label class="ash-field">
          <span>Image URL</span>
          <input class="ash-input" data-af="image" value="${esc(a.image)}" placeholder="https://…" ${ro}>
        </label>
      ` : ''}
      <label class="ash-field">
        <span>Effect</span>
        <textarea class="ash-input ash-effect" data-af="effect" placeholder="What does it do? What does it cost?" ${ro}>${esc(a.effect)}</textarea>
      </label>
      <div class="ash-row-two">
        <label class="ash-field">
          <span>Original Owner</span>
          <input class="ash-input" data-af="originalOwner" value="${esc(a.originalOwner)}" placeholder="Who forged or first bore it?" ${ro}>
        </label>
        <label class="ash-field">
          <span>Current Owner</span>
          <input class="ash-input" data-af="currentOwner" value="${esc(a.currentOwner)}" placeholder="Who carries it now?" ${ro}>
        </label>
      </div>
      <div class="ash-row-two">
        <label class="ash-field">
          <span>Entity Name</span>
          <input class="ash-input" data-af="entityName" value="${esc(a.entityName)}" placeholder="${angel?'e.g. Raziel':'e.g. Vassago'}" ${ro}>
        </label>
        <label class="ash-field">
          <span>Entity Title</span>
          <input class="ash-input" data-af="entityTitle" value="${esc(a.entityTitle)}" placeholder="${angel?'e.g. Keeper of Secrets':'e.g. The Hollow Choir'}" ${ro}>
        </label>
      </div>
    </div>`;

  body.querySelector('.ash-close')?.addEventListener('click', closeArtifactSheet);
  body.querySelector('.ash-del')?.addEventListener('click', () => {
    const nm = a.name || 'this artifact';
    if(!confirm(`Remove ${nm} from ${c.name||'this Hunter'}?`)) return;
    pushUndo(`Removed artifact "${nm}"`);
    c.compass.splice(idx, 1);
    closeArtifactSheet();
    pushState(true); renderCompass();
  });

  if(!editable) return;

  const target = () => {
    const cc = getChar(); if(!cc) return null;
    return (cc.compass||[]).find(x => x.id === _openArtifactId);
  };
  body.querySelectorAll('.ash-input, .ash-name').forEach(inp => {
    const ev = inp.tagName === 'SELECT' ? 'change' : 'input';
    inp.addEventListener(ev, e => {
      const t = target(); if(!t) return;
      t[e.target.dataset.af] = e.target.value;
      pushState();
      // fields that change chrome need a re-render
      if(['type','entityKind','entityName','entityTitle','name','image','currentOwner'].includes(e.target.dataset.af)){
        renderArtifactSheet(); renderCompass();
      }
    });
  });
}
// Backdrop / Escape close
document.addEventListener('click', e => {
  if(e.target?.id === 'artifactSheetOverlay') closeArtifactSheet();
});
document.addEventListener('keydown', e => {
  if(e.key === 'Escape' && _openArtifactId) closeArtifactSheet();
});

// ================================================================
// BESTIARY — shared field index (campaign-wide, DM-managed)
// ================================================================
let _bestiaryFilter = '';
// Which collection is currently open in the player-side bestiary tab
// (a bestiary id). Local to this browser — never synced.
let _bestiarySelectedId = null;

function canEditBestiary(){
  if (spectator) return false;
  return dmUnlocked;
}

// Collections visible to the CURRENT viewer.
// DM sees all. Players see the ones whose viewers[] contains their char id.
// Spectators/watchers see anything flagged viewable to *anyone* (they get
// the read-only union so the party's shared knowledge is still readable).
function bestiariesVisibleToMe(){
  if(!Array.isArray(state.bestiaries)) return [];
  if(dmUnlocked) return state.bestiaries.slice();
  const me = getChar();
  if(!me) return [];
  if(spectator){
    // watcher-style: show any collection anyone can see
    return state.bestiaries.filter(bx => (bx.viewers||[]).length > 0);
  }
  return state.bestiaries.filter(bx => (bx.viewers||[]).includes(me.id));
}

// Which collection the sheet is currently pointing at.
// Falls back to the first visible one; returns null if the viewer has none.
function activeBestiary(){
  const vis = bestiariesVisibleToMe();
  if(!vis.length) return null;
  let bx = vis.find(b => b.id === _bestiarySelectedId);
  if(!bx){ bx = vis[0]; _bestiarySelectedId = bx.id; }
  return bx;
}

function renderBestiary(){
  const host = el('bestiaryList'); if(!host) return;
  if(!Array.isArray(state.bestiaries)) state.bestiaries = [];
  const editable = canEditBestiary();
  const vis = bestiariesVisibleToMe();

  const addBtn = el('addBeastBtn');
  if(addBtn) addBtn.style.display = editable && vis.length ? '' : 'none';

  // Render the selector strip above the list
  const selHost = el('bestiarySelector');
  if(selHost){
    if(!vis.length){
      selHost.innerHTML = '';
      selHost.style.display = 'none';
    } else {
      selHost.style.display = '';
      const active = activeBestiary();
      selHost.innerHTML = vis.map(bx => {
        const on = active && bx.id === active.id;
        const cnt = (bx.entries||[]).length;
        return `<button type="button" class="bx-tab${on?' active':''}" data-bxid="${esc(bx.id)}" style="--bx-col:${esc(bx.color||'#00d4ff')}">
          <span class="bx-dot"></span>
          <span class="bx-name">${esc(bx.name||'Untitled')}</span>
          <span class="bx-count">${cnt}</span>
        </button>`;
      }).join('');
      selHost.querySelectorAll('.bx-tab').forEach(btn => {
        btn.addEventListener('click', () => {
          _bestiarySelectedId = btn.dataset.bxid;
          renderBestiary();
        });
      });
    }
  }

  if(!vis.length){
    host.innerHTML = `<div class="beast-empty">${editable
      ? 'No bestiary collections yet. Create one from the DM Panel under <strong>Bestiary</strong>.'
      : 'Your DM has not shared any field notes with you yet.'}</div>`;
    const cnt = el('bestiaryCount'); if(cnt) cnt.textContent = '';
    return;
  }

  const bx = activeBestiary();
  if(!bx){ host.innerHTML = ''; return; }
  const entries = bx.entries || [];

  const q = _bestiaryFilter.trim().toLowerCase();
  const rows = entries
    .map((b,i)=>({b,i}))
    .filter(({b}) => !q
      || (b.name||'').toLowerCase().includes(q)
      || (b.special||'').toLowerCase().includes(q)
      || (b.notes||'').toLowerCase().includes(q));

  const cnt = el('bestiaryCount');
  if(cnt) cnt.textContent = q ? `${rows.length}/${entries.length}` : (entries.length ? String(entries.length) : '');

  if(!entries.length){
    host.innerHTML = `<div class="beast-empty">${esc(bx.name)} is empty. ${editable ? 'Add the first creature below.' : 'Nothing catalogued here yet.'}</div>`;
    return;
  }
  if(!rows.length){
    host.innerHTML = `<div class="beast-empty">Nothing in ${esc(bx.name)} matches "${esc(_bestiaryFilter)}".</div>`;
    return;
  }

  // COMPACT CARD GRID — each creature is a tile that opens a full stat
  // sheet on click. All heavy editing now lives in the overlay so the
  // list stays scannable even with 30+ entries.
  host.innerHTML = rows.map(({b,i})=>{
    const totals = STATS.map(s => (Number(b.stats?.[s])||0) + (Number(b.bonuses?.[s])||0));
    const topStat = STATS.reduce((best,s,ix) => totals[ix] > totals[best.ix] ? {s, ix} : best, {s:STATS[0], ix:0});
    const topLabel = `${topStat.s} ${fmtMod(mod(totals[topStat.ix]))}`;
    const preview = (b.special||'').trim().split('\n')[0].slice(0,80);
    return `<button type="button" class="beast-tile${b.image?'':' no-img'}" data-bi="${i}" data-bxid="${esc(bx.id)}">
      <div class="beast-tile-portrait">
        ${b.image
          ? `<img src="${esc(b.image)}" alt="" onerror="this.parentElement.classList.add('no-img');this.remove()">`
          : `<span class="beast-tile-glyph">◈</span>`}
        ${b.tamer?`<span class="beast-tile-tamer">🖐 ${esc(b.tamer)}</span>`:''}
      </div>
      <div class="beast-tile-body">
        <div class="beast-tile-name">${esc(b.name || 'Unnamed')}</div>
        <div class="beast-tile-meta">
          <span class="beast-tile-top">${topLabel}</span>
          ${preview ? `<span class="beast-tile-note">${esc(preview)}${(b.special||'').length>80?'…':''}</span>` : ''}
        </div>
      </div>
      <span class="beast-tile-open">↗</span>
    </button>`;
  }).join('');

  // Clicking a tile opens the stat sheet overlay for that creature.
  host.querySelectorAll('.beast-tile').forEach(tile => {
    tile.addEventListener('click', () => {
      const i = Number(tile.dataset.bi);
      openBeastSheet(tile.dataset.bxid, i);
    });
  });
}

// ================================================================
// BEAST STAT SHEET — click-to-open overlay
// One authoritative editor per creature. Opened from a tile in the
// bestiary list. All fields live here; the tile is just a summary.
// ================================================================
let _openBeastKey = null;  // "<bxid>:<index>" while the sheet is open

function openBeastSheet(bxid, index){
  const bx = state.bestiaries.find(b => b.id === bxid);
  if(!bx || !bx.entries[index]) return;
  _openBeastKey = `${bxid}:${index}`;
  renderBeastSheet();
  const overlay = el('beastSheetOverlay');
  if(overlay){
    overlay.classList.add('open');
    // focus the name field so the DM can just start typing on a fresh entry
    setTimeout(() => overlay.querySelector('.bsh-name')?.focus(), 40);
  }
}
function closeBeastSheet(){
  _openBeastKey = null;
  const overlay = el('beastSheetOverlay');
  if(overlay) overlay.classList.remove('open');
}
function renderBeastSheet(){
  if(!_openBeastKey) return;
  const [bxid, idxStr] = _openBeastKey.split(':');
  const i = Number(idxStr);
  const bx = state.bestiaries.find(b => b.id === bxid);
  if(!bx || !bx.entries[i]){ closeBeastSheet(); return; }
  const b = bx.entries[i];
  const editable = canEditBestiary();
  const ro = editable ? '' : 'readonly tabindex="-1"';
  const dis = editable ? '' : 'disabled';
  const body = el('beastSheetBody'); if(!body) return;

  const tamerOptions = (sel) => `<option value="">Unassigned</option>` +
    state.characters.map(ch => {
      const nm = ch.name || 'Unnamed';
      return `<option value="${esc(nm)}" ${sel===nm?'selected':''}>${esc(nm)}</option>`;
    }).join('');

  body.innerHTML = `
    <div class="bsh-head" style="--bx-col:${esc(bx.color||'#00d4ff')}">
      <div class="bsh-portrait${b.image?'':' no-img'}">
        ${b.image
          ? `<img src="${esc(b.image)}" alt="" onerror="this.parentElement.classList.add('no-img');this.remove()">`
          : `<span class="bsh-glyph">◈</span>`}
      </div>
      <div class="bsh-title-wrap">
        <div class="bsh-codex">${esc(bx.name)}</div>
        <input class="bsh-name" data-bf="name" value="${esc(b.name)}" placeholder="Unnamed creature" ${ro}>
        ${b.tamer?`<span class="bsh-tamer">🖐 Tamed by ${esc(b.tamer)}</span>`:''}
      </div>
      <div class="bsh-actions">
        ${editable?`<button class="bsh-del" title="Delete creature">🗑</button>`:''}
        <button class="bsh-close" title="Close">✕</button>
      </div>
    </div>
    <div class="bsh-body">
      ${editable ? `
        <div class="bsh-row">
          <label class="bsh-field">
            <span>Tamer</span>
            <select class="bsh-input bsh-tamer-select" data-bf="tamer" ${dis}>${tamerOptions(b.tamer)}</select>
          </label>
          <label class="bsh-field bsh-wide">
            <span>Image URL</span>
            <input class="bsh-input" data-bf="image" value="${esc(b.image)}" placeholder="https://…" ${ro}>
          </label>
        </div>
      ` : ''}
      <div class="bsh-stats">
        <div class="bsh-stats-head">
          <span></span><span>Score</span><span>Bonus</span><span>Total</span>
        </div>
        ${STATS.map(s => {
          const base = Number(b.stats?.[s])||10;
          const bon  = Number(b.bonuses?.[s])||0;
          const tot  = base + bon;
          return `<div class="bsh-stat">
            <span class="bsh-stat-key">${s}</span>
            <input class="bsh-val" type="number" data-bs="${s}" value="${base}" ${ro}>
            <input class="bsh-bon" type="number" data-bb="${s}" value="${bon}" ${ro}>
            <span class="bsh-total" data-bt="${s}">${tot} <em>(${fmtMod(mod(tot))})</em></span>
          </div>`;
        }).join('')}
      </div>
      <label class="bsh-field">
        <span>Special Ability</span>
        <textarea class="bsh-input bsh-special" data-bf="special" placeholder="What makes it dangerous?" ${ro}>${esc(b.special)}</textarea>
      </label>
      <label class="bsh-field">
        <span>Notes</span>
        <textarea class="bsh-input bsh-notes" data-bf="notes" placeholder="Field notes, lore, behavior…" ${ro}>${esc(b.notes||'')}</textarea>
      </label>
    </div>`;

  // — wire —
  body.querySelector('.bsh-close')?.addEventListener('click', closeBeastSheet);
  body.querySelector('.bsh-del')?.addEventListener('click', () => {
    const nm = b.name || 'this creature';
    if(!confirm(`Remove ${nm} from ${bx.name}?`)) return;
    pushUndo(`Removed ${nm} from ${bx.name}`);
    bx.entries.splice(i, 1);
    closeBeastSheet();
    pushState(true); renderBestiary();
  });
  if(!editable) return;

  // resolve current beast fresh each event — collection could reorder
  const target = () => {
    const cbx = state.bestiaries.find(x => x.id === bxid);
    return cbx?.entries[i];
  };
  body.querySelectorAll('.bsh-input:not(.bsh-tamer-select), .bsh-name').forEach(inp => {
    inp.addEventListener('input', e => {
      const t = target(); if(!t) return;
      t[e.target.dataset.bf] = e.target.value;
      pushState();
    });
  });
  body.querySelector('.bsh-tamer-select')?.addEventListener('change', e => {
    const t = target(); if(!t) return;
    t.tamer = e.target.value;
    pushState(true);
    // refresh the sheet + list so the badge appears/updates
    renderBeastSheet();
    renderBestiary();
  });
  const recalc = (s) => {
    const t = target(); if(!t) return;
    const tot = (Number(t.stats?.[s])||0) + (Number(t.bonuses?.[s])||0);
    const out = body.querySelector(`[data-bt="${s}"]`);
    if(out) out.innerHTML = `${tot} <em>(${fmtMod(mod(tot))})</em>`;
  };
  body.querySelectorAll('.bsh-val').forEach(inp => {
    inp.addEventListener('input', e => {
      const t = target(); if(!t) return;
      if(!t.stats) t.stats = {};
      const s = e.target.dataset.bs;
      t.stats[s] = Number(e.target.value) || 0;
      recalc(s); pushState();
    });
  });
  body.querySelectorAll('.bsh-bon').forEach(inp => {
    inp.addEventListener('input', e => {
      const t = target(); if(!t) return;
      if(!t.bonuses) t.bonuses = {};
      const s = e.target.dataset.bb;
      t.bonuses[s] = Number(e.target.value) || 0;
      recalc(s); pushState();
    });
  });
}
// Backdrop-click and Escape close the sheet
document.addEventListener('click', e => {
  if(e.target?.id === 'beastSheetOverlay') closeBeastSheet();
});
document.addEventListener('keydown', e => {
  if(e.key === 'Escape' && _openBeastKey) closeBeastSheet();
});

// ================================================================
// DM — BESTIARY MANAGER
// Creates/renames/deletes collections, and toggles per-character
// viewer access via a matrix of checkboxes.
// ================================================================
let _dmBxSelectedId = null;
function dmActiveBestiary(){
  if(!Array.isArray(state.bestiaries) || !state.bestiaries.length) return null;
  let bx = state.bestiaries.find(b => b.id === _dmBxSelectedId);
  if(!bx){ bx = state.bestiaries[0]; _dmBxSelectedId = bx.id; }
  return bx;
}
function renderDmBestiaries(){
  const host = el('dmBestiariesRoot'); if(!host || !dmUnlocked) return;
  if(!Array.isArray(state.bestiaries)) state.bestiaries = [];
  const list = state.bestiaries;
  const bx = dmActiveBestiary();

  host.innerHTML = `
    <div class="dm-bx-shell">
      <aside class="dm-bx-side">
        <div class="dm-bx-side-head">
          <span>Collections</span>
          <button type="button" class="neo-btn small" id="dmBxAdd">＋ New</button>
        </div>
        <div class="dm-bx-list">
          ${list.length ? list.map(b => {
            const on = bx && b.id === bx.id;
            const cnt = (b.entries||[]).length;
            const viewers = (b.viewers||[]).length;
            return `<button type="button" class="dm-bx-row${on?' active':''}" data-bxid="${esc(b.id)}" style="--bx-col:${esc(b.color||'#00d4ff')}">
              <span class="dm-bx-dot"></span>
              <span class="dm-bx-info">
                <span class="dm-bx-name">${esc(b.name||'Untitled')}</span>
                <span class="dm-bx-sub">${cnt} creature${cnt===1?'':'s'} · ${viewers} viewer${viewers===1?'':'s'}</span>
              </span>
            </button>`;
          }).join('') : `<div class="dm-empty">No collections yet. Click <strong>+ New</strong>.</div>`}
        </div>
      </aside>
      <div class="dm-bx-main">
        ${bx ? `
          <div class="dm-bx-head">
            <label class="dm-bx-namefield">
              <span>Name</span>
              <input type="text" id="dmBxName" value="${esc(bx.name||'')}" placeholder="e.g. Grimm Bestiary">
            </label>
            <label class="dm-bx-colorfield">
              <span>Color</span>
              <input type="color" id="dmBxColor" value="${esc(bx.color||'#00d4ff')}">
            </label>
            <button type="button" class="neo-btn ghost small" id="dmBxDelete">🗑 Delete</button>
          </div>
          <div class="dm-bx-viewers">
            <div class="dm-bx-sec">Grant access</div>
            <p class="dm-hint" style="margin:.1rem 0 .6rem">Tick every character who should be able to open this codex. Multiple characters can share the same one, or each get a unique bestiary.</p>
            <div class="dm-bx-viewer-grid">
              ${state.characters.map(c => {
                const has = (bx.viewers||[]).includes(c.id);
                return `<label class="dm-bx-viewer${has?' on':''}">
                  <input type="checkbox" data-bxviewer="${esc(c.id)}" ${has?'checked':''}>
                  <span class="dm-bx-viewer-name">${esc(c.name||'Unnamed')}</span>
                  <span class="dm-bx-viewer-state">${c.state||'active'}</span>
                </label>`;
              }).join('')}
            </div>
            <div class="dm-bx-quick">
              <button type="button" class="neo-btn ghost small" id="dmBxAllOn">✓ All</button>
              <button type="button" class="neo-btn ghost small" id="dmBxAllOff">✕ None</button>
            </div>
          </div>
          <div class="dm-bx-entries">
            <div class="dm-bx-sec">Contents <span style="opacity:.5;font-weight:400">— ${bx.entries.length} entr${bx.entries.length===1?'y':'ies'}</span></div>
            <p class="dm-hint" style="margin:.1rem 0 .6rem">Add and edit the creatures in the sheet itself: switch to <strong>${esc(bx.name)}</strong> on the Bestiary tab, then use ＋ Add Creature. Everything you type there syncs here live.</p>
            <div class="dm-bx-preview">
              ${bx.entries.length
                ? bx.entries.slice(0,6).map(e => `<span class="dm-bx-chip">${esc(e.name||'unnamed')}</span>`).join('') + (bx.entries.length>6?`<span class="dm-bx-chip more">+${bx.entries.length-6} more</span>`:'')
                : '<span class="dm-empty" style="padding:.4rem .1rem">Empty</span>'}
            </div>
          </div>
        ` : `<div class="dm-empty" style="padding:2rem">Create a collection to begin.</div>`}
      </div>
    </div>`;

  // — wire up —
  host.querySelectorAll('.dm-bx-row').forEach(r => r.addEventListener('click', () => {
    _dmBxSelectedId = r.dataset.bxid; renderDmBestiaries();
  }));
  el('dmBxAdd')?.addEventListener('click', () => {
    pushUndo('Created bestiary collection');
    const nb = {
      id: 'bx-' + Date.now(),
      name: 'New Codex',
      color: '#00d4ff',
      viewers: [],
      entries: []
    };
    state.bestiaries.push(nb);
    _dmBxSelectedId = nb.id;
    pushState(true); renderDmBestiaries(); renderBestiary();
  });
  el('dmBxDelete')?.addEventListener('click', () => {
    const cur = dmActiveBestiary(); if(!cur) return;
    if(!confirm(`Delete "${cur.name}"? This wipes all ${cur.entries.length} entries in this collection.`)) return;
    pushUndo(`Deleted bestiary "${cur.name}"`);
    state.bestiaries = state.bestiaries.filter(b => b.id !== cur.id);
    _dmBxSelectedId = null;
    pushState(true); renderDmBestiaries(); renderBestiary();
  });
  el('dmBxName')?.addEventListener('input', e => {
    const cur = dmActiveBestiary(); if(!cur) return;
    cur.name = e.target.value; pushState();
    // update sidebar label live
    const side = host.querySelector(`.dm-bx-row.active .dm-bx-name`);
    if(side) side.textContent = cur.name || 'Untitled';
  });
  el('dmBxColor')?.addEventListener('input', e => {
    const cur = dmActiveBestiary(); if(!cur) return;
    cur.color = e.target.value; pushState(true);
    renderDmBestiaries(); renderBestiary();
  });
  host.querySelectorAll('[data-bxviewer]').forEach(cb => cb.addEventListener('change', e => {
    const cur = dmActiveBestiary(); if(!cur) return;
    const cid = e.target.dataset.bxviewer;
    const has = cur.viewers.includes(cid);
    if(e.target.checked && !has) cur.viewers.push(cid);
    if(!e.target.checked && has) cur.viewers = cur.viewers.filter(x => x !== cid);
    e.target.closest('.dm-bx-viewer').classList.toggle('on', e.target.checked);
    pushState(true); renderBestiary();
  }));
  el('dmBxAllOn')?.addEventListener('click', () => {
    const cur = dmActiveBestiary(); if(!cur) return;
    cur.viewers = state.characters.map(c => c.id);
    pushState(true); renderDmBestiaries(); renderBestiary();
  });
  el('dmBxAllOff')?.addEventListener('click', () => {
    const cur = dmActiveBestiary(); if(!cur) return;
    cur.viewers = [];
    pushState(true); renderDmBestiaries(); renderBestiary();
  });
}

// ================================================================
// DM PAGE MODE — the DM view is a full-viewport page, not a panel
// ================================================================
// The DM panel lives inside .main (which sits in .app's 230px grid and is
// capped at 1700px). That chrome is for the player sheet and just squeezes
// the DM view. When the panel is visible we flag the body, and CSS lifts it
// out to fill the whole viewport. Derived from the panel's real state so it
// can't drift out of sync with the five places that show/hide it.
// Makes it unmistakable that a DM is editing someone else's sheet, and gives
// a one-click route back to the DM page.
function renderDmSheetBar(){
  const bar = el('dmSheetBar'); if(!bar) return;
  const onPage = document.body.classList.contains('dm-page-active');
  if(!dmUnlocked || onPage){ bar.style.display='none'; return; }
  const c = getChar();
  const col = c?.accentColor || '#00d4ff';
  bar.style.display='';
  bar.style.setProperty('--dsb-col', col);
  bar.innerHTML = `
    <span class="dsb-dot"></span>
    <span class="dsb-text">DM view — editing <strong>${esc(c?.name || 'this character')}</strong></span>
    <span class="dsb-hint">Use the tabs on the left to switch character</span>
    <button class="dsb-btn" id="dmSheetBarBack">⚔ DM Page</button>`;
  el('dmSheetBarBack')?.addEventListener('click', showDmPage);
}

// ================================================================
// DM VIEW STATE MACHINE  — the ONE place any DM view visibility changes
// ================================================================
// There are exactly three view states:
//   'closed' — no overlay, player sheet fully visible & interactive
//   'login'  — overlay up, password prompt showing (DM page hidden)
//   'page'   — overlay up, full DM page showing (takes over the viewport)
// Every button, boot path, and recovery routes through applyDmView(state).
// Nothing else may touch #dmOverlay / #dmLoginPanel / #dmFullscreenPanel or
// the body flags. This is what makes the states impossible to contradict.
let _dmView = 'closed';

function applyDmView(next){
  const overlay = el('dmOverlay');
  const login   = el('dmLoginPanel');
  const panel   = el('dmFullscreenPanel');
  const fab     = el('dmReturnFab');

  // A non-DM can never reach 'page'; fall back to the login prompt.
  if (next === 'page' && !dmUnlocked) next = 'login';
  _dmView = next;

  const showOverlay = (next === 'login' || next === 'page');
  const showLogin   = (next === 'login');
  const showPanel   = (next === 'page');

  // Toggle the three elements from the single target state.
  overlay?.classList.toggle('hidden', !showOverlay);
  login  ?.classList.toggle('hidden', !showLogin);
  panel  ?.classList.toggle('hidden', !showPanel);

  // Body flags drive the CSS that hides the player sheet behind the page.
  document.body.classList.toggle('dm-page-active', showPanel);
  if (showPanel) document.body.setAttribute('data-dm-page','on');
  else           document.body.removeAttribute('data-dm-page');

  // The "return to DM page" FAB shows only for a DM who has stepped away.
  if (fab) fab.style.display = (dmUnlocked && next !== 'page') ? '' : 'none';

  try { renderDmSheetBar(); } catch(e) {}
}

// Back-compat shim: old code calls syncDmPageMode(); now it just re-asserts
// the current state (never invents a new one) and returns whether the page is up.
function syncDmPageMode(){
  applyDmView(_dmView);
  return _dmView === 'page';
}

// Safety net: if the DOM ever drifts out of the state machine (e.g. a stray
// class from old cached JS), snap it back to a coherent state on next render.
function assertNotBlank(){
  const overlay = el('dmOverlay');
  const panel   = el('dmFullscreenPanel');
  const login   = el('dmLoginPanel');
  const overlayUp = !!overlay && !overlay.classList.contains('hidden');
  const panelUp   = !!panel && !panel.classList.contains('hidden');
  const loginUp   = !!login && !login.classList.contains('hidden');
  // Blank screen = overlay covering everything with neither child visible.
  if (overlayUp && !panelUp && !loginUp){
    console.warn('[rwby] recovered from an inconsistent DM view state');
    applyDmView('closed');
    return true;
  }
  // Body flag set but no panel = sheet hidden behind nothing.
  if (document.body.classList.contains('dm-page-active') && !panelUp){
    console.warn('[rwby] recovered from a stuck page flag');
    applyDmView(dmUnlocked && loginUp ? 'login' : 'closed');
    return true;
  }
  return false;
}

// Leave the DM page but STAY the DM (distinct from Lock, which drops rights).
function hideDmPage(){ applyDmView('closed'); render(); }

function showDmPage(){
  if(!dmUnlocked) return;
  applyDmView('page');
  try { renderSnapshotList(); } catch(e) {}
  render();
}

function showDiceResult(label, res){
  if(!res) return;
  broadcastRoll(label, res);       // share with the table (fire-and-forget)
  // Feed the DM's roll log — one entry per resolved roll
  try {
    if (res.nat !== undefined) {
      const rollDetail = (res.mode==='adv'||res.mode==='dis')
        ? `d20 ${res.mode}[${res.both[0]},${res.both[1]}]→${res.nat}${res.modifier>=0?' +':' '}${res.modifier}`
        : `d20→${res.nat}${res.modifier>=0?' +':' '}${res.modifier}`;
      addRollLog({
        who: label.split(' · ')[0] || label,
        formula: label.includes(' · ') ? label.split(' · ').slice(1).join(' · ') + ' · ' + rollDetail : rollDetail,
        result: res.total,
        crit: res.nat === 20,
        kind: /Save/i.test(label) ? 'save' : /Attack|Damage/i.test(label) ? 'roll' : 'skill'
      });
    } else if (Array.isArray(res.parts)) {
      const bd = res.parts.map(p => p.type==='dice' ? `${p.sign<0?'−':''}${p.count}d${p.sides}[${p.rolls.join(',')}]` : `${p.value>=0?'+':''}${p.value}`).join(' ');
      addRollLog({ who: 'Dice', formula: `${label} · ${bd}`, result: res.total, kind:'roll' });
    }
  } catch(e) {}
  const panel = el('diceResultArea'); if(!panel) return;
  if(res.nat!==undefined){
    const crit = res.nat===20 ? ' crit' : (res.nat===1 ? ' fumble' : '');
    const rollTxt = (res.mode==='adv'||res.mode==='dis')
      ? `<span class="dice-rolls">[${res.both[0]}, ${res.both[1]}] ${res.mode==='adv'?'adv':'dis'}→${res.nat}</span>`
      : `<span class="dice-rolls">d20→${res.nat}</span>`;
    const detail = `${rollTxt}<span class="dice-mod">${res.modifier>=0?'+':''}${res.modifier}</span>`;
    const card = document.createElement('div');
    card.className = `dice-result${crit}`;
    card.innerHTML = `<div class="dice-result-head"><span class="dice-label">${esc(label)}</span><span class="dice-total">${res.total}</span></div><div class="dice-detail">${detail}${crit===' crit'?'<span class="dice-flag crit">CRIT</span>':crit===' fumble'?'<span class="dice-flag fumble">FUMBLE</span>':''}</div>`;
    panel.prepend(card);
    if(crit===' crit') diceSound('crit'); else if(crit===' fumble') diceSound('fumble'); else diceSound('roll');
  } else {
    const breakdown = res.parts.map(p=> p.type==='dice' ? `${p.sign<0?'−':''}${p.count}d${p.sides}[${p.rolls.join(',')}]` : `${p.value>=0?'+':''}${p.value}`).join(' ');
    const card = document.createElement('div');
    card.className = 'dice-result';
    card.innerHTML = `<div class="dice-result-head"><span class="dice-label">${esc(label)}</span><span class="dice-total">${res.total}</span></div><div class="dice-detail"><span class="dice-rolls">${esc(breakdown)}</span></div>`;
    panel.prepend(card);
    diceSound('roll');
  }
  while(panel.children.length>12) panel.removeChild(panel.lastChild);
}
let _diceAudio=null;
function diceSound(kind){
  if(typeof _rwSfxOn!=='undefined' && !_rwSfxOn) return;
  try{
    _diceAudio = _diceAudio || new (window.AudioContext||window.webkitAudioContext)();
    const ac=_diceAudio; if(ac.state==='suspended') ac.resume();
    const t=ac.currentTime;
    if(kind==='crit'){
      [523,659,784,1047].forEach((f,i)=>{ const o=ac.createOscillator(),g=ac.createGain(); o.type='square'; o.frequency.value=f; g.gain.setValueAtTime(0.05,t+i*0.06); g.gain.exponentialRampToValueAtTime(0.0001,t+i*0.06+0.18); o.connect(g);g.connect(ac.destination);o.start(t+i*0.06);o.stop(t+i*0.06+0.2); });
    } else if(kind==='fumble'){
      const o=ac.createOscillator(),g=ac.createGain(); o.type='sawtooth'; o.frequency.setValueAtTime(180,t); o.frequency.exponentialRampToValueAtTime(60,t+0.4); g.gain.setValueAtTime(0.06,t); g.gain.exponentialRampToValueAtTime(0.0001,t+0.45); o.connect(g);g.connect(ac.destination);o.start(t);o.stop(t+0.5);
    } else {
      for(let i=0;i<5;i++){ const o=ac.createOscillator(),g=ac.createGain(); o.type='triangle'; o.frequency.value=400+Math.random()*500; const w=t+i*0.025; g.gain.setValueAtTime(0.03,w); g.gain.exponentialRampToValueAtTime(0.0001,w+0.06); o.connect(g);g.connect(ac.destination);o.start(w);o.stop(w+0.07); }
    }
  }catch(e){}
}
let _diceMode='normal';
function rollSkill(skillName){
  const c=getChar();
  const def=SKILL_DEFS.find(d=>d.name===skillName);
  const m = def ? skillTotal(c, skillName) : 0;
  showDiceResult(`${c.name||'Hunter'} · ${skillName}`, rollD20(m, _diceMode));
}
function rollCustom(){
  const expr = el('diceCustomInput')?.value.trim(); if(!expr) return;
  const res = parseDiceExpr(expr);
  if(!res){ showToast('Invalid dice (try 2d6+3)','warn'); return; }
  showDiceResult(expr, res);
}
function toggleDicePanel(){ el('dicePanel')?.classList.toggle('open'); }
function setDiceMode(mode){
  _diceMode=mode;
  document.querySelectorAll('.dice-mode-btn').forEach(b=>b.classList.toggle('active', b.dataset.mode===mode));
}
function buildDiceSkillButtons(){
  const host=el('diceSkillButtons'); if(!host) return;
  const quick=['STR Save','DEX Save','CON Save','INT Save','WIS Save','CHA Save','Athletics','Acrobatics','Stealth','Perception','Investigation','Insight','Persuasion','Intimidation'];
  host.innerHTML = quick.map(s=>`<button class="dice-skill-btn" data-skill="${esc(s)}">${esc(s.replace(' Save','♦'))}</button>`).join('');
  host.querySelectorAll('.dice-skill-btn').forEach(b=> b.addEventListener('click', ()=>rollSkill(b.dataset.skill)));
}
let _groupRollUnsub=null, _groupRollLoadTs=Date.now(), _activeGroupRoll=null;
async function startGroupRoll(){
  if(!dmUnlocked) return;
  const skill = el('groupRollSkill')?.value || 'Perception';
  try{
    await setDoc(doc(db,'rwby-meta','grouproll'), { skill, ts:Date.now(), by:'DM', results:{} });
    showToast(`Group roll called: ${skill}`,'success');
  }catch(e){ showToast('Could not start group roll','warn'); }
}
function startGroupRollListener(){
  if(_groupRollUnsub) _groupRollUnsub();
  _groupRollUnsub = onSnapshot(doc(db,'rwby-meta','grouproll'), snap=>{
    if(!snap.exists()) return;
    const d=snap.data(); if(!d.ts) return;
    if(d.ts>_groupRollLoadTs && d.skill){
      _groupRollLoadTs=d.ts; _activeGroupRoll=d;
      showGroupRollPrompt(d.skill);
    }
    renderGroupRollResults(d);
  }, ()=>{});
}
function showGroupRollPrompt(skill){
  if(dmUnlocked||spectator) return;
  el('groupRollPrompt')?.remove();
  const c=getChar(); if(!c||!c.name) return;
  const p=document.createElement('div');
  p.id='groupRollPrompt'; p.className='group-roll-prompt';
  p.innerHTML=`<div class="grp-head">📢 Group Roll: <strong>${esc(skill)}</strong></div><button class="grp-roll-btn" id="grpRollGo">Roll ${esc(skill)}</button>`;
  document.body.appendChild(p);
  el('grpRollGo')?.addEventListener('click', ()=>submitGroupRoll(skill));
}
async function submitGroupRoll(skill){
  const c=getChar();
  const res=rollD20(skillTotal(c,skill),_diceMode);
  showDiceResult(`${c.name} · ${skill} (group)`, res);
  try{
    const ref=doc(db,'rwby-meta','grouproll');
    const snap=await getDoc(ref);
    const d=snap.exists()?snap.data():{results:{}};
    d.results=d.results||{};
    d.results[c.name||MY_PRESENCE_ID]={ name:c.name||'Hunter', total:res.total, nat:res.nat };
    await setDoc(ref,d);
  }catch(e){}
  el('groupRollPrompt')?.remove();
}
function renderGroupRollResults(d){
  const host=el('groupRollResults'); if(!host) return;
  const results=d&&d.results?Object.values(d.results):[];
  if(!d||!d.skill || !results.length){ host.innerHTML=`<div class="small-note">No group roll results yet.</div>`; return; }
  results.sort((a,b)=>b.total-a.total);
  host.innerHTML=`<div class="grp-results-title">${esc(d.skill)} — results</div>`+results.map(r=>`<div class="grp-result-row${r.nat===20?' crit':r.nat===1?' fumble':''}"><span>${esc(r.name)}</span><span class="grp-result-total">${r.total}</span></div>`).join('');
}
function populateRollSelects(){
  const opts = SKILL_DEFS.map(d=>`<option value="${esc(d.name)}">${esc(d.name)}</option>`).join('');
  const gs=el('groupRollSkill'); if(gs && gs.innerHTML!==opts){ const cur=gs.value; gs.innerHTML=opts; if(cur) gs.value=cur; }
  const wt=el('whisperTarget');
  if(wt){
    const cur=wt.value;
    wt.innerHTML=state.characters.map((c,i)=>`<option value="${i}">${esc(c.name||('Slot '+(i+1)))}</option>`).join('');
    if(cur && cur<state.characters.length) wt.value=cur;
  }
  document.querySelectorAll('.atmo-btn[data-weather]').forEach(b=>b.classList.toggle('active', b.dataset.weather===(state.weather||'none')));
  document.querySelectorAll('.atmo-btn[data-scene]').forEach(b=>b.classList.toggle('active', b.dataset.scene===(state.sceneTime||'auto')));
  document.querySelectorAll('.atmo-btn[data-cct]').forEach(b=>b.classList.toggle('active', (b.dataset.cct==='on')===(state.cctOnline!==false)));
}
let _whisperUnsub=null, _whisperLoadTs=Date.now();
async function sendWhisper(){
  if(!dmUnlocked) return;
  const idx=_dmTarget;
  const target=state.characters[idx];
  const msg=el('whisperInput')?.value.trim();
  if(!target||!msg){ showToast('Pick a recipient and write a message','warn'); return; }
  try{
    await setDoc(doc(db,'rwby-meta','whisper'),{ to:target.name||('slot'+idx), toIdx:idx, msg, ts:Date.now() });
    if(el('whisperInput')) el('whisperInput').value='';
    showToast(`Whisper sent to ${target.name||'player'}`,'success');
  }catch(e){ showToast('Could not send whisper','warn'); }
}
function startWhisperListener(){
  if(_whisperUnsub) _whisperUnsub();
  _whisperUnsub=onSnapshot(doc(db,'rwby-meta','whisper'),snap=>{
    if(!snap.exists()) return;
    const d=snap.data();
    if(!d.ts||d.ts<=_whisperLoadTs) return;
    _whisperLoadTs=d.ts;
    if(dmUnlocked||spectator) return;
    const mine=getChar();
    if(mine && mine.name && (mine.name===d.to)) showWhisper(d.msg);
  },()=>{});
}
function showWhisper(msg){
  const o=document.createElement('div');
  o.className='whisper-overlay';
  o.innerHTML=`<div class="whisper-card"><div class="whisper-head">💬 A private message reaches you</div><div class="whisper-msg">${esc(msg)}</div><button class="whisper-dismiss">Understood</button></div>`;
  document.body.appendChild(o);
  o.querySelector('.whisper-dismiss').addEventListener('click',()=>{ o.classList.add('out'); setTimeout(()=>o.remove(),300); });
  if(typeof _rwSfxOn==='undefined'||_rwSfxOn) diceSound('roll');
}

// ================================================================
// MASTER RENDER
// ================================================================
function render() {
  try { applyTheme(); } catch(e) { console.error('applyTheme:', e); }
  try { assertNotBlank(); } catch(e) {}   // never leave the viewer with nothing
  try { renderDmSheetBar(); } catch(e) {}
  let c;
  try { c = getChar(); ensureClamp(c); } catch(e){ console.error('render getChar/clamp:', e); }
  if (!c) c = state.characters?.[0];        // never let the sheet paint against undefined
  try { renderCharacterTabs(); }   catch(e) { console.error('renderCharacterTabs:', e); }
  try { renderHeader(); }          catch(e) { console.error('renderHeader:', e); }
  try { renderMainFields(); }      catch(e) { console.error('renderMainFields:', e); }
  try { renderPortrait(c); }       catch(e) {}
  try { renderDeathSaves(c); }     catch(e) {}
  try { renderHuntsmanLicense(); } catch(e) {}
  try { populateRollSelects(); }   catch(e) {}
  try { applyWeather(); }          catch(e) {}
  try { applyTimeSkin(); }         catch(e) {}
  try { checkLevelUp(); }          catch(e) {}
  try { renderAccentColor(); }     catch(e) {}
  try { applyCharacterAccents(); } catch(e) {}
  try { checkResourceFlash(c); }   catch(e) {}
  try { applyHeartbeat(); }        catch(e) {}
  try { updateAmbient(); }         catch(e) {}
  try { checkLowHp(c); }           catch(e) {}
  try { renderCalcPanel(); }       catch(e) { console.error('renderCalcPanel:', e); }
  try { renderStats(); }           catch(e) { console.error('renderStats:', e); }
  try { renderRacePanel(); }       catch(e) { console.error('renderRacePanel:', e); }
  try { renderDmDashboard(); }     catch(e) { console.error('renderDmDashboard:', e); }
  try { renderUndoBar(); }         catch(e) { console.error('renderUndoBar:', e); }
  try { renderStatLockBar(); }     catch(e) { console.error('renderStatLockBar:', e); }
  try { renderDmTargetPicker(); }  catch(e) { console.error('renderDmTargetPicker:', e); }
  try { renderBulkBar(); }         catch(e) { console.error('renderBulkBar:', e); }
  try { renderDmFeatGrid(); }      catch(e) { console.error('renderDmFeatGrid:', e); }
  try { renderCustomFeatAuthor(); }catch(e) { console.error('renderCustomFeatAuthor:', e); }
  try { renderFeatsList(); }       catch(e) { console.error('renderFeatsList:', e); }
  try { renderCompass(); }         catch(e) { console.error('renderCompass:', e); }
  try { renderBestiary(); }        catch(e) { console.error('renderBestiary:', e); }
  try { const f=el('sessionLogDmForm'); if(f) f.style.display = dmUnlocked ? 'block' : 'none'; } catch(e){}
  if (dmUnlocked) {
    try { renderDmCommendations(); } catch(e) {}
    try { renderDmSemblance(); }     catch(e) { console.error('renderDmSemblance:', e); }
    try { renderDmTechniques(); }    catch(e) { console.error('renderDmTechniques:', e); }
    try { renderDmTargetSelect(); }  catch(e) { console.error('renderDmTargetSelect:', e); }
    try { renderGrantTargetSelect(); }catch(e) {}
    try { renderDmShop(); }          catch(e) {}
    try { renderDmMoney(); }         catch(e) {}
    try { renderThemeFields(); }     catch(e) { console.error('renderThemeFields:', e); }
    try { renderDmBestiaries(); }    catch(e) { console.error('renderDmBestiaries:', e); }
  }
  try { renderCombatSuite(); } catch(e) { console.error('renderCombatSuite:', e); }
  // Overlays stay in sync with remote edits
  if (_openBeastKey)   { try { renderBeastSheet(); }    catch(e) { console.error('renderBeastSheet:', e); } }
  if (_openArtifactId) { try { renderArtifactSheet(); } catch(e) { console.error('renderArtifactSheet:', e); } }
  try { renderTabs(); }            catch(e) { console.error('renderTabs:', e); }
  try { pushPresence(); }          catch(e) {}
  try { if (spectator) disableAllInputs(); } catch(e) {}
}

// ================================================================
// ACTIONS
// ================================================================
function adjustResource(res, amt) {
  const c = getChar();
  if (res==='hp')   c.hp.current   = clamp(c.hp.current   + amt, 0, c.hp.max);
  if (res==='aura') c.aura.current = clamp(c.aura.current + amt, 0, c.aura.max);
  pushState(true); renderHeader(); renderMainFields(); renderCharacterTabs();
  try { checkResourceFlash(c); } catch(e) {}
}
function useTechnique(id) {
  const c = getChar(); const t = c.techniques.find(t=>t.id===id); if(!t) return;
  if (c.aura.current < t.cost) { alert(`Not enough Aura. Need ${t.cost}, have ${c.aura.current}.`); return; }
  c.aura.current -= t.cost; ensureClamp(c); pushState(true); render();
}
function useSemblance(key) {
  const c = getChar(); if (stageLocked(key,c)) { alert('That stage is locked.'); return; }
  const cost = c.semblance[key].auraCost;
  if (c.aura.current < cost) { alert(`Not enough Aura. Need ${cost}, have ${c.aura.current}.`); return; }
  c.aura.current -= cost; ensureClamp(c); pushState(true); render();
}
function useDustSpell(id) {
  const c = getChar(); const sp = c.dustSpells.find(s=>s.id===id); if(!sp) return;
  if ((c.dustInventory[sp.type]||0) < 1) { alert(`Not enough ${sp.type}.`); return; }
  c.dustInventory[sp.type]--; pushState(); renderDust();
}
function rollHp() {
  const c = getChar(); const conM = mod(effectiveStat(c,'CON')); const roll = rollD10();
  const total = Math.max(1, roll + conM); c.hp.max += total; c.hp.current = c.hp.max;
  pushState(true); render();
  alert(`HP Roll: d10(${roll}) + CON(${conM}) = +${total}\nNew Max: ${c.hp.max}`);
}
function rollAura() {
  const c = getChar(); const sk = c.skills['Aura Mastery'] || {}; const bonus = skillTotal(c, 'Aura Mastery');
  const roll = rollD10(); const total = Math.max(1, roll + bonus);
  c.aura.max += total; c.aura.current = c.aura.max;
  pushState(true); render();
  alert(`Aura Roll: d10(${roll}) + Aura Mastery(${fmtMod(bonus)}) = +${total}\nNew Max: ${c.aura.max}`);
}
function saveSemblance() {
  const c = getChar();
  el('semblanceDmGrid')?.querySelectorAll('[data-sem]').forEach(inp => {
    const key=inp.dataset.sem, f=inp.dataset.f;
    c.semblance[key][f] = f==='auraCost' ? Math.max(0,Number(inp.value)||0) : inp.value;
  });
  c.semblance.unlocked.first    = el('unlockFirst')?.checked    || false;
  c.semblance.unlocked.second   = el('unlockSecond')?.checked   || false;
  c.semblance.unlocked.third    = el('unlockThird')?.checked    || false;
  c.semblance.unlocked.ascended = el('unlockAscended')?.checked || false;
  pushState(true); render();
}
function saveCharState() {
  const c = getChar();
  if (el('stateActive')?.checked)  c.state = 'active';
  if (el('stateReserve')?.checked) c.state = 'reserve';
  if (el('stateDead')?.checked)    { c.state='dead'; c.hp.current=0; c.aura.current=0; }
  pushState(true); render();
}
function renderTechAssignList() {
  const cont = el('dmTechAssignList'); if(!cont) return;
  const active = state.characters.filter(c => c.state !== 'dead');
  cont.innerHTML = `
    <label class="dm-assign-pill all"><input type="checkbox" id="techAssignAll"> <span>✦ All Players</span></label>
    ${active.map((c,i) => {
      const realIdx = state.characters.indexOf(c);
      return `<label class="dm-assign-pill"><input type="checkbox" class="tech-assign-cb" data-idx="${realIdx}"> <span>${esc(c.name||`Player ${realIdx+1}`)}</span></label>`;
    }).join('')}`;
  // "All" toggles the rest
  el('techAssignAll')?.addEventListener('change', e => {
    cont.querySelectorAll('.tech-assign-cb').forEach(cb => cb.checked = e.target.checked);
  });
}

function createTechnique() {
  const name  = el('dmTechName')?.value.trim();
  const type  = el('dmTechType')?.value.trim();
  const desc  = el('dmTechDescription')?.value.trim();
  const level = Number(el('dmTechLevel')?.value) || 1;
  const cost  = Number(el('dmTechCost')?.value)  || 0;
  if (!name || !type || !desc) { alert('Fill out name, type, and description.'); return; }

  // Collect all checked players
  const checked = [...document.querySelectorAll('.tech-assign-cb:checked')].map(cb => Number(cb.dataset.idx));
  if (!checked.length) { alert('Select at least one player to assign this technique to.'); return; }

  const baseId = Date.now();
  checked.forEach((idx, n) => {
    const target = state.characters[idx];
    if (target) {
      target.techniques.push({ id:`tech-${baseId}-${n}`, name, level, cost, type, description: desc });
    }
  });

  // Clear form
  ['dmTechName','dmTechType','dmTechDescription'].forEach(id=>{const e=el(id);if(e)e.value='';});
  el('dmTechLevel').value = '1'; el('dmTechCost').value = '0';
  document.querySelectorAll('.tech-assign-cb, #techAssignAll').forEach(cb => cb.checked = false);

  pushState(true); render(); renderDmTechniques();
  showToast(`"${name}" granted to ${checked.length} player${checked.length>1?'s':''}`, 'success', 4000);
}
function addDustSpell() {
  const c    = getChar();
  const name = el('dustSpellName')?.value.trim();
  const type = el('dustSpellType')?.value;
  const desc = el('dustSpellDescription')?.value.trim();
  if (!name||!desc) { alert('Fill out spell name and description.'); return; }
  c.dustSpells.push({id:`dust-${Date.now()}`,name,type,description:desc});
  const e1=el('dustSpellName');if(e1)e1.value='';
  const e2=el('dustSpellDescription');if(e2)e2.value='';
  pushState(); renderDust();
}
function openDmOverlay() {
  if (dmUnlocked) {
    applyDmView('page');
    try { renderSnapshotList(); } catch(e) {}
    renderDmSemblance(); renderDmTechniques(); renderDmTargetSelect(); renderCurseTargetSelect(); renderThemeFields();
    render();
  } else {
    applyDmView('login');
    const p=el('dmPasswordInput'); if(p){p.value='';p.focus();}
  }
}
function closeDmOverlay() { applyDmView('closed'); }

function lockDm() {
  dmUnlocked=false;
  sessionStorage.removeItem('rwby-dm');
  applyDmView('closed');
  render();
}

function unlockDm() {
  if (el('dmPasswordInput')?.value !== DM_PASS) { alert('Wrong password.'); return; }
  dmUnlocked=true;
  sessionStorage.setItem('rwby-dm','1');
  // The DM never holds a character. Drop any claim left over from a
  // previous session in this browser, or it will pin the DM to that sheet.
  try { releaseMyClaim(); } catch(e) {}
  // Becoming DM overrides spectator mode entirely — clear it and re-enable the sheet.
  if (spectator) {
    spectator = false;
    sessionStorage.removeItem('rwby-spectator');
    document.body.classList.remove('spectator-mode');
    document.getElementById('spectatorBanner')?.remove();
    try { reenableAllInputs(); } catch(e) {}
  }
  applyDmView('page');
  try { renderSnapshotList(); } catch(e) {}
  // Activate players tab by default
  document.querySelectorAll('.dm-nav-btn').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.dm-tab').forEach(t=>t.classList.remove('active'));
  document.querySelector('.dm-nav-btn[data-dm-tab="players"]')?.classList.add('active');
  document.querySelector('.dm-tab[data-dm-tab="players"]')?.classList.add('active');
  renderDmSemblance(); renderDmTechniques(); renderDmTargetSelect(); renderCurseTargetSelect(); renderThemeFields();
  render();
}

// ================================================================
// INPUT BINDINGS
// ================================================================
function updateField(field, value) {
  const c = getChar();
  const hpF = {maxHp:'hp.max',currentHp:'hp.current',maxAura:'aura.max',currentAura:'aura.current'};
  if (hpF[field]) { const[o,k]=hpF[field].split('.'); c[o][k]=Math.max(0,Number(value)||0); }
  else if (['level','armor','tempHp'].includes(field)) c[field] = Math.max(0,Number(value)||0);
  else c[field] = value;
  ensureClamp(c); pushState();
  // Update the lightweight displays that DON'T contain the focused input,
  // so we never rewrite the field the user is actively typing in.
  renderHeader(); renderCharacterTabs();
  // Numeric fields affect derived stats; refresh those (they aren't the text field).
  if (['maxHp','currentHp','maxAura','currentAura','level','armor','tempHp'].includes(field)) {
    renderMainFields(); renderCalcPanel();
    if (field==='level') renderSkillsMatrix();
    if (field==='currentAura' || field==='maxAura') { try { checkResourceFlash(c); } catch(e){} }
  }
}

function bindAll() {
  // SAFETY NET: flush pending edits to the server the moment any field loses focus,
  // so text is never lost when leaving the page mid-edit.
  document.addEventListener('focusout', e=>{
    const t=e.target;
    if(t && (t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.tagName==='SELECT'||t.isContentEditable)) flushPendingPush();
  });
  document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='hidden') flushPendingPush(); });
  const ii = (id,field) => { const e=el(id); if(e) e.addEventListener('input', ev=>updateField(field,ev.target.value)); };
  ii('charName','name'); ii('charLevel','level'); ii('charClass','className');
  // Race is a <select> now — wire it to refresh the Faunus panel + recalc stats
  el('charRace')?.addEventListener('change', e=>{
    const c=getChar(); c.race=e.target.value||'';
    if(c.race!=='faunus'){ /* keep stored animal/bonus but they won't apply */ }
    pushState(true);
    renderRacePanel(); renderStats(); renderSkillsMatrix(); renderCalcPanel(); renderHeader?.();
  });
  ii('charAge','age'); ii('charBackground','background'); ii('charSemblanceName','semblanceName');
  ii('charWeaponName','weaponName');
  ii('currentHp','currentHp'); ii('maxHp','maxHp'); ii('currentAura','currentAura'); ii('maxAura','maxAura');
  ii('armor','armor'); ii('speed','speed'); ii('tempHp','tempHp');
  ii('abilitiesText','abilitiesText'); ii('notesText','notesText');

  // Notes journal: live word count + saved indicator
  (function(){
    const ta = el('notesText'); if(!ta) return;
    const updateCount = ()=>{
      const t = (ta.value||'').trim();
      const words = t ? t.split(/\s+/).length : 0;
      const cn = el('notesCount'); if(cn) cn.textContent = `${words} word${words===1?'':'s'} · ${(ta.value||'').length} chars`;
    };
    const flashSaved = ()=>{
      const s = el('notesSaved'); if(!s) return;
      s.textContent='○ saving…'; s.classList.add('saving');
      clearTimeout(ta._saveTimer);
      ta._saveTimer = setTimeout(()=>{ s.textContent='● synced'; s.classList.remove('saving'); }, 700);
    };
    ta.addEventListener('input', ()=>{ updateCount(); flashSaved(); });
    updateCount();
  })();

  document.querySelectorAll('.tab-btn[data-tab]').forEach(b => b.addEventListener('click',()=>{
    state.activeTab=b.dataset.tab; pushState(); renderTabs();
  }));
  el('tabMenuBtn')?.addEventListener('click', (e)=>{ e.stopPropagation(); toggleTabMenu(); });
  document.addEventListener('click', (e)=>{
    const m=el('tabMenu');
    if(m && m.classList.contains('open') && !e.target.closest('.tab-menu-wrap')) m.classList.remove('open');
  });
  el('statsGrid')?.addEventListener('click', e => {
    const btn=e.target.closest('button[data-action]'); if(!btn) return;
    const c=getChar(); c.stats[btn.dataset.stat]=(Number(c.stats[btn.dataset.stat])||0)+(btn.dataset.action==='plus'?1:-1);
    pushState(); renderStats(); renderSkillsMatrix(); renderCalcPanel();
  });
  document.addEventListener('click', e => {
    const btn=e.target.closest('.adj-btn'); if(!btn) return;
    adjustResource(btn.dataset.resource, Number(btn.dataset.amt));
  });

  el('rollHpBtn')?.addEventListener('click',   rollHp);
  el('rollAuraBtn')?.addEventListener('click',  rollAura);
  el('restoreHpBtn')?.addEventListener('click', ()=>{ const c=getChar(); c.hp.current=c.hp.max; pushState(true); render(); });
  el('restoreAuraBtn')?.addEventListener('click',()=>{ const c=getChar(); c.aura.current=c.aura.max; pushState(true); render(); });

  el('addCharacterBtn')?.addEventListener('click',()=>{
    const nc=blankChar(state.characters.length); nc.state='reserve';
    state.characters.push(nc);
    const newIdx = state.characters.length-1;

    setViewIdx(newIdx); setDmTarget(newIdx); state.showReserve=true;
    pushState(true); render();
  });
  el('toggleReserveBtn')?.addEventListener('click',()=>{ state.showReserve=!state.showReserve; pushState(true); render(); });
  el('toggleDeadBtn')?.addEventListener('click',  ()=>{ state.showDead=!state.showDead;       pushState(true); render(); });

  el('addDustSpellBtn')?.addEventListener('click',   addDustSpell);
  el('createTechniqueBtn')?.addEventListener('click', createTechnique);
  el('saveSemblanceBtn')?.addEventListener('click',   saveSemblance);
  el('saveCharacterStateBtn')?.addEventListener('click', saveCharState);

  el('saveSnapshotBtn')?.addEventListener('click', async ()=>{
    if(!dmUnlocked) return;
    showToast('Saving backup…', 'info', 1500);
    const id = await saveSnapshot('manual backup');
    showToast(id ? 'Backup saved' : 'Backup failed', id ? 'success' : 'warn');
    renderSnapshotList();
  });
  el('refreshSnapshotsBtn')?.addEventListener('click', renderSnapshotList);
  el('deleteCharacterBtn')?.addEventListener('click', async ()=>{
    if (!dmUnlocked) { alert('Only the DM can delete characters.'); return; }
    if (state.characters.length<=1) { alert('Keep at least one character.'); return; }

    // Delete the DM's TARGET (the sidebar selection), not getViewIdx().
    // getViewIdx() re-derives and self-clamps on every call, so reading it
    // around a splice gives inconsistent answers.
    const idx = Math.max(0, Math.min(_dmTarget, state.characters.length - 1));
    const victim = state.characters[idx];
    const name = victim?.name || `Player ${idx+1}`;

    // Typed confirmation — this is the most destructive action in the app.
    const typed = prompt(
      `Delete "${name}" permanently?\n\n` +
      `This removes their sheet, inventory, techniques, feats and notes for EVERYONE.\n` +
      `A backup is saved automatically and can be restored from the DM panel.\n\n` +
      `Type the character's name to confirm:`
    );
    if (typed === null) return;                    // cancelled
    if (typed.trim() !== name.trim()) {
      alert(`Name didn't match — "${name}" was NOT deleted.`);
      return;
    }

    // Durable backup FIRST — survives closing the tab, unlike the undo stack.
    showToast('Saving backup…', 'info', 2000);
    await saveSnapshot(`before deleting ${name}`);

    // Session undo as well, for a quick one-click revert.
    pushUndo(`Deleted ${name}`);

    state.characters.splice(idx, 1);

    // Re-point the DM's target and local view to something valid.
    const last = state.characters.length - 1;
    _dmTarget = Math.max(0, Math.min(idx, last));
    setViewIdx(Math.max(0, Math.min(idx, last)));
    _dmSelected.delete(idx);
    _dmSelected = new Set([..._dmSelected].map(i => i > idx ? i - 1 : i));

    await pushState(true);
    render();
    renderSnapshotList();
    showToast(`Deleted ${name} — restore from DM ▸ Players ▸ Backups`, 'warn', 7000);
  });

  el('openDmOverlayBtn')?.addEventListener('click', openDmOverlay);
  el('dmLoginBtn')?.addEventListener('click',       unlockDm);
  el('dmCloseBtn')?.addEventListener('click',       closeDmOverlay);
  el('dmBackToSheetBtn')?.addEventListener('click', hideDmPage);
  el('dmReturnFab')?.addEventListener('click',      showDmPage);
  el('dmLogoutBtn')?.addEventListener('click',      lockDm);
  el('dmPasswordInput')?.addEventListener('keydown',e=>{ if(e.key==='Enter') unlockDm(); });

  // DM panel tab switching
  document.querySelectorAll('.dm-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.dmTab;
      document.querySelectorAll('.dm-nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.dm-tab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      document.querySelector(`.dm-tab[data-dm-tab="${tab}"]`)?.classList.add('active');
      // Render tab-specific content
      if (tab === 'semblance')  { renderDmSemblance(); }
      if (tab === 'techniques') { renderDmTechniques(); }
      if (tab === 'commend')    { renderDmCommendations(); }
      if (tab === 'curse')      { renderCurseTargetSelect(); }
      if (tab === 'bestiaries') { renderDmBestiaries(); }
      if (tab === 'initiative') { renderInitiativeTracker(); }
      if (tab === 'damagebus')  { renderDamageBus(); }
      if (tab === 'rolllog')    { renderRollLog(); }
      if (tab === 'players')    { renderDmPerCharPanels(); }
    });
  });

  // Curse wheel send button — uses the unified DM target
  el('sendCurseBtn')?.addEventListener('click', () => {
    const targetChar = dmTargetChar();
    if (!targetChar) { alert('No character selected.'); return; }
    const targetId = targetChar.claimedBy;
    if (!targetId) { alert(`${targetChar.name||'That character'} hasn't been claimed by a player yet — the wheel needs a player's browser to appear on.`); return; }
    sendCurseWheel(targetId);
    showToast(`Curse wheel sent to ${targetChar.name || 'player'}`, 'warn', 4000);
  });

  const themeInps = ['themeBgColor','themePanelColor','themeAccentColor','themeAccentTwoColor','themeAuraColor','themeTextColor'];
  const readTheme = () => ({
    bg:   el('themeBgColor')?.value    || DEF_THEME.bg,
    panel:el('themePanelColor')?.value || DEF_THEME.panel,
    accent:el('themeAccentColor')?.value || DEF_THEME.accent,
    accentTwo:el('themeAccentTwoColor')?.value || DEF_THEME.accentTwo,
    aura: el('themeAuraColor')?.value  || DEF_THEME.aura,
    text: el('themeTextColor')?.value  || DEF_THEME.text,
  });
  themeInps.forEach(id=>{ el(id)?.addEventListener('input',()=>{ state.theme=readTheme(); applyTheme(); }); });
  el('saveThemeBtn')?.addEventListener('click', ()=>{ state.theme=readTheme(); pushState(true); render(); });
  el('resetThemeBtn')?.addEventListener('click',()=>{ state.theme={...DEF_THEME}; pushState(true); render(); });
}

// ── PORTRAIT ──
function initPortrait() {
  const upload = document.getElementById('portraitUpload');
  if (!upload) return;
  upload.addEventListener('change', e => {
    const file = e.target.files[0]; if (!file) return;
    // Reset input so same file can be re-selected
    upload.value = '';
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX = 240;
        const ratio = Math.min(MAX/img.width, MAX/img.height);
        canvas.width  = Math.round(img.width  * ratio);
        canvas.height = Math.round(img.height * ratio);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        // Save to the CURRENTLY VIEWED character
        const c = getChar();
        c.portrait = canvas.toDataURL('image/jpeg', 0.82);
        renderPortrait(c);
        pushState();
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}
function portraitFrameState(c){
  if(!c) return 'frame-normal';
  const dead = (c.hp && c.hp.max>0 && c.hp.current<=0) || c.dead;
  if(dead) return 'frame-dead';
  const hpPct = c.hp && c.hp.max>0 ? c.hp.current/c.hp.max : 1;
  const auraBroken = c.aura && c.aura.max>0 && c.aura.current<=0;
  const conds = Array.isArray(c.conditions)?c.conditions:[];
  if(conds.some(x=>x.id==='empowered')) return 'frame-empowered';
  if(hpPct<=0.25) return 'frame-critical';
  if(auraBroken) return 'frame-aura-broken';
  const tier = highestCommendTier(c);
  if(tier) return 'frame-'+tier;
  return 'frame-normal';
}
function highestCommendTier(c){
  if(!Array.isArray(c.commendations)||!c.commendations.length) return null;
  if(typeof COMMENDATIONS==='undefined'||typeof COMMEND_TIERS==='undefined') return null;
  const order = Object.keys(COMMEND_TIERS);
  let best=-1;
  c.commendations.forEach(id=>{
    const def = COMMENDATIONS.find(x=>x.id===id);
    if(def){ const idx=order.indexOf(def.tier); if(idx>best) best=idx; }
  });
  return best>=0 ? order[best] : null;
}
function renderPortrait(c) {
  const img   = document.getElementById('portraitImg');
  const label = document.getElementById('portraitLabel');
  if (!img || !label) return;
  if (c.portrait) {
    img.src = c.portrait; img.onerror = () => { img.style.display='none'; if(label)label.style.display='flex'; };
    img.style.display = 'block';
    label.style.display = 'none';
  } else {
    img.src = '';
    img.style.display = 'none';
    label.style.display = 'flex';
  }
  const slot = img.closest('.portrait-slot');
  if(slot){
    slot.className = slot.className.replace(/\bframe-[\w-]+/g,'').trim();
    slot.classList.add('portrait-slot', portraitFrameState(c));
  }
}

// ── DEATH SAVES ──
function renderDeathSaves(c) {
  const ds = c.deathSaves || {successes:0,failures:0,stable:false};
  ['deathSuccesses','deathFailures'].forEach((id,fi) => {
    const el2 = document.getElementById(id); if (!el2) return;
    el2.innerHTML = [0,1,2].map(i => {
      const filled = i < (fi===0 ? ds.successes : ds.failures);
      return `<button class="ds-pip ${filled?(fi===0?'pip-success':'pip-failure'):''}" data-type="${fi===0?'success':'failure'}" data-i="${i}"></button>`;
    }).join('');
    el2.querySelectorAll('.ds-pip').forEach(btn => {
      btn.addEventListener('click', () => {
        const c2 = getChar();
        if (!c2.deathSaves) c2.deathSaves = {successes:0,failures:0,stable:false};
        const type = btn.dataset.type;
        const idx  = parseInt(btn.dataset.i);
        const key  = type === 'success' ? 'successes' : 'failures';
        c2.deathSaves[key] = c2.deathSaves[key] === idx+1 ? idx : idx+1;
        pushState(true); render();
      });
    });
  });
}
function bindDeathSaves() {
  document.getElementById('stableBtn')?.addEventListener('click', ()=>{
    const c = getChar(); if (!c.deathSaves) c.deathSaves={successes:0,failures:0,stable:false};
    c.deathSaves.stable=true; c.deathSaves.successes=3; pushState(true); render();
  });
  document.getElementById('resetDeathBtn')?.addEventListener('click', ()=>{
    const c = getChar(); c.deathSaves={successes:0,failures:0,stable:false}; pushState(true); render();
  });
}

// ── BROADCAST ──
function bindBroadcast() {
  document.getElementById('broadcastBtn')?.addEventListener('click', ()=>{
    const msg = document.getElementById('broadcastInput')?.value.trim();
    if (!msg) return;
    sendBroadcast(msg);
    document.getElementById('broadcastInput').value = '';
  });
}

// ── GRANT XP / ITEMS ──
function bindGrant() {
  document.getElementById('grantBtn')?.addEventListener('click', ()=>{
    const targetIdx = _dmTarget;
    const xp   = parseInt(document.getElementById('grantXp')?.value) || 0;
    const item = document.getElementById('grantItem')?.value.trim() || '';
    if (!xp && !item) return;
    pushUndo(`Grant to ${state.characters[targetIdx]?.name||'player'}`);
    const c = state.characters[targetIdx]; if (!c) return;
    if (!c.notesText) c.notesText = '';
    const grant = [];
    if (xp)   grant.push(`+${xp} XP`);
    if (item)  grant.push(item);
    const note = `\n[DM Grant] ${grant.join(' · ')}`;
    c.notesText += note;
    // Also add item to inventory (new structured array)
    if (item) {
      if (!Array.isArray(c.inventory)) c.inventory = [];
      c.inventory.push({ name: item, qty: 1, notes: 'Granted by DM' });
    }
    pushState(true);
    document.getElementById('grantXp').value = '';
    document.getElementById('grantItem').value = '';
    alert(`Granted to ${c.name||`Player ${targetIdx+1}`}: ${grant.join(', ')}`);
    render();
  });
}

function renderGrantTargetSelect() {
  const sel = document.getElementById('grantTarget'); if (!sel) return;
  sel.innerHTML = state.characters.map((c,i)=>
    `<option value="${i}">${esc(c.name||`Player ${i+1}`)}</option>`
  ).join('');
}

// ================================================================
// #21 — RELATIONSHIPS TRACKER
// ================================================================
const RELATION_TYPES = ['Ally','Friend','Rival','Enemy','Mentor','Student','Family','Lover','Acquaintance','Neutral','Unknown'];
const RELATION_COLORS = {
  Ally:'#00e890', Friend:'#00d4ff', Rival:'#ff9900', Enemy:'#ff1a2e',
  Mentor:'#b06eff', Student:'#6effc7', Family:'#ffd060', Lover:'#ff6ec7',
  Acquaintance:'#90a0b0', Neutral:'#8090a0', Unknown:'#556070'
};
const RELATION_ICONS = {
  Ally:'🤝', Friend:'😊', Rival:'⚔️', Enemy:'💢', Mentor:'🎓', Student:'📚',
  Family:'🏠', Lover:'💗', Acquaintance:'👋', Neutral:'😐', Unknown:'❓'
};
const STANDING_LABELS = ['Hostile','Wary','Neutral','Warm','Devoted'];

let _relSearch = '';
let _relSort = 'manual';
let _relCollapsed = new Set();
let _relAllCollapsed = false;

function renderRelationships() {
  const c = getChar();
  const cont = el('relationshipsContainer'); if (!cont) return;
  if (!Array.isArray(c.relationships)) c.relationships = [];
  const rels = c.relationships;

  // ── Summary stats ──
  const summary = el('relSummary');
  if (summary) {
    if (!rels.length) {
      summary.innerHTML = '';
    } else {
      const counts = {};
      rels.forEach(r => { counts[r.type] = (counts[r.type]||0)+1; });
      const allies = rels.filter(r => ['Ally','Friend','Family','Lover','Mentor','Student'].includes(r.type)).length;
      const foes   = rels.filter(r => ['Enemy','Rival'].includes(r.type)).length;
      summary.innerHTML = `
        <div class="rel-stat"><span class="rel-stat-num">${rels.length}</span><span class="rel-stat-label">Total</span></div>
        <div class="rel-stat allies"><span class="rel-stat-num">${allies}</span><span class="rel-stat-label">Friendly</span></div>
        <div class="rel-stat foes"><span class="rel-stat-num">${foes}</span><span class="rel-stat-label">Hostile</span></div>
        <div class="rel-stat-chips">
          ${Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([t,n])=>
            `<span class="rel-chip" style="--c:${RELATION_COLORS[t]||'#8090a0'}">${RELATION_ICONS[t]||''} ${t} ${n}</span>`).join('')}
        </div>`;
    }
  }

  if (!rels.length) {
    cont.innerHTML = `<div class="rel-empty">
      <div class="rel-empty-icon">👥</div>
      <div>No relationships yet.</div>
      <span>Track allies, rivals, mentors, and everyone who matters.</span>
    </div>`;
    return;
  }

  // ── Build display list with original indices, then filter + sort ──
  let display = rels.map((r, i) => ({ r, i }));

  if (_relSearch.trim()) {
    const q = _relSearch.toLowerCase();
    display = display.filter(({r}) =>
      (r.name||'').toLowerCase().includes(q) ||
      (r.type||'').toLowerCase().includes(q) ||
      (r.role||'').toLowerCase().includes(q) ||
      (r.notes||'').toLowerCase().includes(q));
  }

  const standOf = r => typeof r.standing === 'number' ? r.standing : 2;
  if (_relSort === 'name')          display.sort((a,b)=>(a.r.name||'').localeCompare(b.r.name||''));
  else if (_relSort === 'type')     display.sort((a,b)=>(a.r.type||'').localeCompare(b.r.type||''));
  else if (_relSort === 'standing-high') display.sort((a,b)=>standOf(b.r)-standOf(a.r));
  else if (_relSort === 'standing-low')  display.sort((a,b)=>standOf(a.r)-standOf(b.r));

  if (!display.length) {
    cont.innerHTML = `<div class="rel-empty"><div class="rel-empty-icon">🔍</div><div>No matches.</div><span>Try a different search.</span></div>`;
    return;
  }

  cont.innerHTML = display.map(({r, i}) => {
    const color = RELATION_COLORS[r.type] || '#8090a0';
    const icon = RELATION_ICONS[r.type] || '';
    const initial = (r.name||'?').trim()[0]?.toUpperCase() || '?';
    const standing = standOf(r);
    const hasPortrait = !!r.portrait;
    const collapsed = _relCollapsed.has(i);
    return `
    <div class="rel-card${collapsed?' collapsed':''}" data-i="${i}" style="--rel-color:${color}">
      <div class="rel-avatar-wrap">
        <label class="rel-avatar" style="background:${color}22;border-color:${color}66;color:${color}" title="Click to add a photo">
          ${hasPortrait ? `<img src="${r.portrait}" class="rel-avatar-img" onerror="this.style.display='none'">` : `<span class="rel-avatar-initial">${esc(initial)}</span>`}
          <input type="file" accept="image/*" class="rel-portrait-input" data-i="${i}" style="display:none">
          <span class="rel-avatar-cam">📷</span>
        </label>
        <span class="rel-type-icon" title="${esc(r.type||'')}">${icon}</span>
      </div>
      <div class="rel-main">
        <div class="rel-card-top">
          <input class="rel-name" data-i="${i}" value="${esc(r.name||'')}" placeholder="Name…">
          <select class="rel-type" data-i="${i}" style="color:${color}">
            ${RELATION_TYPES.map(t=>`<option value="${t}" ${r.type===t?'selected':''}>${t}</option>`).join('')}
          </select>
          <button class="rel-collapse" data-i="${i}" title="${collapsed?'Expand':'Collapse'}">${collapsed?'▸':'▾'}</button>
          <button class="rel-del" data-i="${i}" title="Remove">✕</button>
        </div>
        ${collapsed ? `<div class="rel-collapsed-summary">${esc(r.role||STANDING_LABELS[standing])} · <span style="color:${color}">${STANDING_LABELS[standing]}</span></div>` : `
        <input class="rel-role" data-i="${i}" value="${esc(r.role||'')}" placeholder="Role / title — e.g. Team leader, Estranged sister, Crime boss…">
        <div class="rel-standing">
          <span class="rel-standing-label">${STANDING_LABELS[standing]}</span>
          <div class="rel-standing-track">
            ${[0,1,2,3,4].map(s=>`<button class="rel-pip ${s<=standing?'on':''}" data-i="${i}" data-s="${s}" style="--pip:${color}" title="${STANDING_LABELS[s]}"></button>`).join('')}
          </div>
        </div>
        <textarea class="rel-notes" data-i="${i}" placeholder="How do you know them? What's the history?">${esc(r.notes||'')}</textarea>
        <div class="rel-card-actions">
          <button class="rel-move" data-i="${i}" data-dir="up" title="Move up">↑</button>
          <button class="rel-move" data-i="${i}" data-dir="down" title="Move down">↓</button>
        </div>`}
      </div>
    </div>`;
  }).join('');

  cont.querySelectorAll('.rel-collapse').forEach(b => b.addEventListener('click', () => {
    const i = parseInt(b.dataset.i);
    if (_relCollapsed.has(i)) _relCollapsed.delete(i); else _relCollapsed.add(i);
    renderRelationships();
  }));

  // name
  cont.querySelectorAll('.rel-name').forEach(inp => {
    inp.addEventListener('input', () => {
      const i = parseInt(inp.dataset.i);
      c.relationships[i].name = inp.value;
      const av = inp.closest('.rel-card')?.querySelector('.rel-avatar-initial');
      if (av) av.textContent = (inp.value.trim()[0]||'?').toUpperCase();
      scheduleRelPush();
    });
  });
  // role
  cont.querySelectorAll('.rel-role').forEach(inp => {
    inp.addEventListener('input', () => {
      const i = parseInt(inp.dataset.i);
      c.relationships[i].role = inp.value;
      scheduleRelPush();
    });
  });
  // notes
  cont.querySelectorAll('.rel-notes').forEach(inp => {
    inp.addEventListener('input', () => {
      const i = parseInt(inp.dataset.i);
      c.relationships[i].notes = inp.value;
      scheduleRelPush();
    });
  });
  // type
  cont.querySelectorAll('.rel-type').forEach(sel => {
    sel.addEventListener('change', () => {
      const i = parseInt(sel.dataset.i);
      c.relationships[i].type = sel.value;
      pushState(true); renderRelationships();
    });
  });
  // standing pips
  cont.querySelectorAll('.rel-pip').forEach(pip => {
    pip.addEventListener('click', () => {
      const i = parseInt(pip.dataset.i), s = parseInt(pip.dataset.s);
      const cur = typeof c.relationships[i].standing === 'number' ? c.relationships[i].standing : 2;
      c.relationships[i].standing = (s === cur && s > 0) ? s - 1 : s;
      pushState(true); renderRelationships();
    });
  });
  // portrait upload
  cont.querySelectorAll('.rel-portrait-input').forEach(inp => {
    inp.addEventListener('change', e => {
      const i = parseInt(inp.dataset.i);
      const file = e.target.files?.[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        // compress to keep Firestore doc small
        const img = new Image();
        img.onload = () => {
          const max = 120;
          const scale = Math.min(max/img.width, max/img.height, 1);
          const cv = document.createElement('canvas');
          cv.width = img.width*scale; cv.height = img.height*scale;
          cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height);
          c.relationships[i].portrait = cv.toDataURL('image/jpeg', 0.7);
          pushState(true); renderRelationships();
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    });
  });
  // delete
  cont.querySelectorAll('.rel-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = parseInt(btn.dataset.i);
      c.relationships.splice(i, 1);
      _relCollapsed.clear(); _relAllCollapsed = false;
      pushState(true); renderRelationships();
    });
  });
  // reorder (only meaningful in manual sort)
  cont.querySelectorAll('.rel-move').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = parseInt(btn.dataset.i);
      const swap = btn.dataset.dir === 'up' ? i-1 : i+1;
      if (swap < 0 || swap >= c.relationships.length) return;
      [c.relationships[i], c.relationships[swap]] = [c.relationships[swap], c.relationships[i]];
      pushState(true); renderRelationships();
    });
  });
}

let _relPushTimer = null;
function scheduleRelPush() {
  clearTimeout(_relPushTimer);
  _relPushTimer = setTimeout(() => pushState(true), 600);
}

function bindRelationships() {
  el('addRelBtn')?.addEventListener('click', () => {
    const c = getChar();
    if (!c.relationships) c.relationships = [];
    c.relationships.unshift({ name:'', type:'Neutral', role:'', notes:'', standing:2, portrait:'' });
    _relSearch = ''; const sb = el('relSearch'); if (sb) sb.value = '';
    _relCollapsed.clear(); _relAllCollapsed = false;
    pushState(true); renderRelationships();
    setTimeout(() => {
      const inp = el('relationshipsContainer')?.querySelector('.rel-name');
      inp?.focus();
    }, 50);
  });
  el('relSearch')?.addEventListener('input', e => { _relSearch = e.target.value; renderRelationships(); });
  el('relSort')?.addEventListener('change', e => { _relSort = e.target.value; renderRelationships(); });
  el('relCollapseAllBtn')?.addEventListener('click', () => {
    const c = getChar();
    const rels = Array.isArray(c.relationships) ? c.relationships : [];
    _relAllCollapsed = !_relAllCollapsed;
    _relCollapsed = new Set(_relAllCollapsed ? rels.map((_,i)=>i) : []);
    const btn = el('relCollapseAllBtn');
    if (btn) btn.textContent = _relAllCollapsed ? '⊞ Expand All' : '⊟ Collapse All';
    renderRelationships();
  });
}

// ================================================================
// WEAPONS
// ================================================================
const DMG_TYPES = ['Slashing','Piercing','Bludgeoning','Fire','Ice','Lightning','Energy','Dust','Other'];
const WEAPON_PROF = ['Untrained','Proficient','Expert'];

function updateAmmoBar(i){
  const c=getChar(); const w=c.weapons[i]; if(!w) return;
  const f=w.forms[w.activeForm]; if(!f) return;
  const card=document.querySelector(`.wpn-card[data-i="${i}"]`); if(!card) return;
  const bar=card.querySelector('.wpn-ammo-bar span');
  if(bar) bar.style.width=(f.ammoMax>0?Math.min(100,(f.ammo/f.ammoMax)*100):0)+'%';
  const wrap=card.querySelector('.wpn-ammo');
  if(wrap) wrap.classList.toggle('empty', f.ammo===0 && f.ammoMax>0);
}
function ensureWeaponForms(w){
  if(!Array.isArray(w.forms) || !w.forms.length){
    w.forms = [{ formName: w.formName||'Form 1', damage:w.damage||'', dmgType:w.dmgType||DMG_TYPES[0], range:w.range||'' }];
    w.activeForm = 0;
  }
  if(typeof w.activeForm!=='number' || w.activeForm<0 || w.activeForm>=w.forms.length) w.activeForm=0;
  // Ammo: each form may be a gun with a bullet count
  w.forms.forEach(f=>{
    if(typeof f.isGun!=='boolean') f.isGun=false;
    if(typeof f.ammoMax!=='number') f.ammoMax=Number(f.ammoMax)||0;
    if(typeof f.ammo!=='number') f.ammo=Number(f.ammo)||0;
  });
  return w;
}
function renderWeapons() {
  const c = getChar();
  const cont = el('weaponsList'); if (!cont) return;
  const weapons = c.weapons || [];

  if (!weapons.length) {
    cont.innerHTML = `<div class="wpn-empty"><div class="wpn-empty-icon">⚔️</div><div>No weapons yet.</div><span>Add your armaments, their forms, damage, and your training.</span></div>`;
    return;
  }

  cont.innerHTML = weapons.map((w, i) => {
    ensureWeaponForms(w);
    const profClass = (w.prof||'Untrained').toLowerCase();
    const af = w.activeForm;
    const form = w.forms[af];
    const formTabs = w.forms.map((f,fi)=>`<button class="wpn-form-tab${fi===af?' active':''}" data-i="${i}" data-form="${fi}">${esc(f.formName||('Form '+(fi+1)))}</button>`).join('');
    return `
    <div class="wpn-card prof-${profClass}" data-i="${i}">
      <div class="wpn-head">
        <input class="wpn-name" data-i="${i}" value="${esc(w.name||'')}" placeholder="Weapon name…">
        <span class="wpn-prof-badge prof-${profClass}">${esc(w.prof||'Untrained')}</span>
        <button class="wpn-del" data-i="${i}" title="Remove">✕</button>
      </div>
      <div class="wpn-forms-bar">
        <span class="wpn-forms-label">Forms</span>
        ${formTabs}
        <button class="wpn-form-add" data-i="${i}" title="Add a transformation form">+ Form</button>
        ${w.forms.length>1?`<button class="wpn-form-del" data-i="${i}" data-form="${af}" title="Remove this form">✕ form</button>`:''}
      </div>
      <div class="wpn-stats">
        <div class="wpn-stat">
          <label>Form Name</label>
          <input class="wpn-formname" data-i="${i}" value="${esc(form.formName||'')}" placeholder="Sword / Rifle…">
        </div>
        <div class="wpn-stat">
          <label>Damage</label>
          <input class="wpn-dmg" data-i="${i}" value="${esc(form.damage||'')}" placeholder="1d8+3">
        </div>
        <div class="wpn-stat">
          <label>Type</label>
          <select class="wpn-dmgtype" data-i="${i}">
            ${DMG_TYPES.map(t=>`<option ${form.dmgType===t?'selected':''}>${t}</option>`).join('')}
          </select>
        </div>
        <div class="wpn-stat">
          <label>Range</label>
          <input class="wpn-range" data-i="${i}" value="${esc(form.range||'')}" placeholder="Melee / 60ft">
        </div>
        <div class="wpn-stat wpn-gun-toggle-wrap">
          <label>Gun?</label>
          <button type="button" class="wpn-gun-toggle${form.isGun?' on':''}" data-i="${i}" title="Mark this form as a firearm to track ammo">${form.isGun?'⊙ Firearm':'○ No'}</button>
        </div>
        <div class="wpn-stat">
          <label>Training</label>
          <select class="wpn-profsel" data-i="${i}">
            ${WEAPON_PROF.map(p=>`<option ${w.prof===p?'selected':''}>${p}</option>`).join('')}
          </select>
        </div>
      </div>
      ${form.isGun?`
      <div class="wpn-ammo${form.ammo===0&&form.ammoMax>0?' empty':''}">
        <span class="wpn-ammo-icon">▮</span>
        <span class="wpn-ammo-label">AMMO</span>
        <div class="wpn-ammo-counter">
          <button class="wpn-ammo-btn fire" data-i="${i}" data-act="fire" title="Fire one round (−1)" ${form.ammo<=0?'disabled':''}>− Fire</button>
          <div class="wpn-ammo-readout">
            <input class="wpn-ammo-cur" data-i="${i}" type="number" value="${form.ammo}" min="0">
            <span class="wpn-ammo-sep">/</span>
            <input class="wpn-ammo-max" data-i="${i}" type="number" value="${form.ammoMax}" min="0" title="Magazine capacity">
          </div>
          <button class="wpn-ammo-btn plus" data-i="${i}" data-act="plus" title="Add one round (+1)">+ 1</button>
          <button class="wpn-ammo-btn reload" data-i="${i}" data-act="reload" title="Reload to full" ${form.ammoMax<=0?'disabled':''}>⟳ Reload</button>
        </div>
        <div class="wpn-ammo-bar"><span style="width:${form.ammoMax>0?Math.min(100,(form.ammo/form.ammoMax)*100):0}%"></span></div>
      </div>`:''}
      <input class="wpn-notes" data-i="${i}" value="${esc(w.notes||'')}" placeholder="When to use it, special properties, dust effects…">
    </div>`;
  }).join('');

  const updForm = (sel, field) => {
    cont.querySelectorAll(sel).forEach(inp => {
      const evt = inp.tagName === 'SELECT' ? 'change' : 'input';
      inp.addEventListener(evt, () => {
        const i = parseInt(inp.dataset.i);
        const w = c.weapons[i]; ensureWeaponForms(w);
        w.forms[w.activeForm][field] = inp.value;
        if(field==='formName'){ pushState(true); renderWeapons(); }
        else scheduleWpnPush();
      });
    });
  };
  const updWpn = (sel, field, rerender=false) => {
    cont.querySelectorAll(sel).forEach(inp => {
      const evt = inp.tagName === 'SELECT' ? 'change' : 'input';
      inp.addEventListener(evt, () => {
        const i = parseInt(inp.dataset.i);
        c.weapons[i][field] = inp.value;
        if (rerender) { pushState(true); renderWeapons(); }
        else scheduleWpnPush();
      });
    });
  };
  updWpn('.wpn-name','name'); updWpn('.wpn-notes','notes');
  updForm('.wpn-formname','formName'); updForm('.wpn-dmg','damage'); updForm('.wpn-range','range'); updForm('.wpn-dmgtype','dmgType');
  updWpn('.wpn-profsel','prof', true);

  // gun toggle — mark the active form as a firearm
  cont.querySelectorAll('.wpn-gun-toggle').forEach(b=>b.addEventListener('click',()=>{
    const i=parseInt(b.dataset.i); const w=c.weapons[i]; ensureWeaponForms(w);
    const f=w.forms[w.activeForm]; f.isGun=!f.isGun;
    if(f.isGun && !f.ammoMax){ f.ammoMax=6; f.ammo=6; } // sensible default magazine
    pushState(true); renderWeapons();
  }));
  // ammo current/max direct edits
  cont.querySelectorAll('.wpn-ammo-cur').forEach(inp=>inp.addEventListener('input',()=>{
    const i=parseInt(inp.dataset.i); const w=c.weapons[i]; const f=w.forms[w.activeForm];
    f.ammo=Math.max(0,Number(inp.value)||0); scheduleWpnPush(); updateAmmoBar(i);
  }));
  cont.querySelectorAll('.wpn-ammo-max').forEach(inp=>inp.addEventListener('input',()=>{
    const i=parseInt(inp.dataset.i); const w=c.weapons[i]; const f=w.forms[w.activeForm];
    f.ammoMax=Math.max(0,Number(inp.value)||0); if(f.ammo>f.ammoMax) f.ammo=f.ammoMax; scheduleWpnPush(); updateAmmoBar(i);
  }));
  // ammo action buttons (fire / +1 / reload)
  cont.querySelectorAll('.wpn-ammo-btn').forEach(b=>b.addEventListener('click',()=>{
    const i=parseInt(b.dataset.i); const w=c.weapons[i]; const f=w.forms[w.activeForm];
    const act=b.dataset.act;
    if(act==='fire')      f.ammo=Math.max(0,(Number(f.ammo)||0)-1);
    else if(act==='plus') f.ammo=(f.ammoMax>0)?Math.min(f.ammoMax,(Number(f.ammo)||0)+1):(Number(f.ammo)||0)+1;
    else if(act==='reload') f.ammo=Number(f.ammoMax)||0;
    pushState(true); renderWeapons();
  }));

  cont.querySelectorAll('.wpn-form-tab').forEach(b=>b.addEventListener('click',()=>{
    const i=parseInt(b.dataset.i); c.weapons[i].activeForm=parseInt(b.dataset.form);
    pushState(true); renderWeapons();
  }));
  cont.querySelectorAll('.wpn-form-add').forEach(b=>b.addEventListener('click',()=>{
    const i=parseInt(b.dataset.i); const w=c.weapons[i]; ensureWeaponForms(w);
    w.forms.push({ formName:'Form '+(w.forms.length+1), damage:'', dmgType:DMG_TYPES[0], range:'' });
    w.activeForm=w.forms.length-1;
    pushState(true); renderWeapons();
  }));
  cont.querySelectorAll('.wpn-form-del').forEach(b=>b.addEventListener('click',()=>{
    const i=parseInt(b.dataset.i); const w=c.weapons[i];
    if(w.forms.length<=1) return;
    w.forms.splice(parseInt(b.dataset.form),1);
    w.activeForm=0; pushState(true); renderWeapons();
  }));
  cont.querySelectorAll('.wpn-del').forEach(btn => {
    btn.addEventListener('click', () => {
      c.weapons.splice(parseInt(btn.dataset.i), 1);
      pushState(true); renderWeapons();
    });
  });
}

let _wpnPushTimer = null;
function scheduleWpnPush() { clearTimeout(_wpnPushTimer); _wpnPushTimer = setTimeout(()=>pushState(true), 600); }

function bindWeapons() {
  el('addWeaponBtn')?.addEventListener('click', () => {
    const c = getChar();
    if (!c.weapons) c.weapons = [];
    c.weapons.push({ name:'', prof:'Proficient', notes:'', activeForm:0, forms:[{ formName:'Form 1', damage:'', dmgType:'Slashing', range:'Melee' }] });
    pushState(true); renderWeapons();
    setTimeout(() => {
      const inputs = el('weaponsList')?.querySelectorAll('.wpn-name');
      inputs?.[inputs.length-1]?.focus();
    }, 50);
  });
}

// ================================================================
// INVENTORY
// ================================================================
let _invFilter = '';
let _shopFilter = '';

function renderInventory() {
  const c = getChar();
  const cont = el('inventoryList'); if (!cont) return;
  const inv = c.inventory || [];

  if (!inv.length) {
    cont.innerHTML = `<div class="inv-empty">Your pack is empty.</div>`;
    const cnt = el('invSearchCount'); if(cnt) cnt.textContent = '';
    return;
  }

  // Filter but KEEP the original index — handlers below rely on data-i matching c.inventory
  const q = _invFilter.trim().toLowerCase();
  const rows = inv.map((it,i)=>({it,i})).filter(({it}) =>
    !q || (it.name||'').toLowerCase().includes(q) || (it.notes||'').toLowerCase().includes(q)
  );
  const cnt = el('invSearchCount');
  if(cnt) cnt.textContent = q ? `${rows.length}/${inv.length}` : '';

  if (!rows.length) {
    cont.innerHTML = `<div class="inv-empty">No items match "${esc(_invFilter)}".</div>`;
    return;
  }

  cont.innerHTML = rows.map(({it, i}) => `
    <div class="inv-item" data-i="${i}">
      <div class="inv-qty-ctrl">
        <button class="inv-qminus" data-i="${i}">−</button>
        <span class="inv-qty">${it.qty||1}</span>
        <button class="inv-qplus" data-i="${i}">+</button>
      </div>
      <input class="inv-name" data-i="${i}" value="${esc(it.name||'')}" placeholder="Item…">
      <input class="inv-notes" data-i="${i}" value="${esc(it.notes||'')}" placeholder="notes…">
      <button class="inv-del" data-i="${i}" title="Remove">✕</button>
    </div>`).join('');

  cont.querySelectorAll('.inv-name').forEach(inp => {
    inp.addEventListener('input', () => { c.inventory[parseInt(inp.dataset.i)].name = inp.value; scheduleInvPush(); });
  });
  cont.querySelectorAll('.inv-notes').forEach(inp => {
    inp.addEventListener('input', () => { c.inventory[parseInt(inp.dataset.i)].notes = inp.value; scheduleInvPush(); });
  });
  cont.querySelectorAll('.inv-qplus').forEach(b => {
    b.addEventListener('click', () => { const i=parseInt(b.dataset.i); c.inventory[i].qty=(c.inventory[i].qty||1)+1; pushState(true); renderInventory(); });
  });
  cont.querySelectorAll('.inv-qminus').forEach(b => {
    b.addEventListener('click', () => { const i=parseInt(b.dataset.i); c.inventory[i].qty=Math.max(1,(c.inventory[i].qty||1)-1); pushState(true); renderInventory(); });
  });
  cont.querySelectorAll('.inv-del').forEach(b => {
    b.addEventListener('click', () => { c.inventory.splice(parseInt(b.dataset.i),1); pushState(true); renderInventory(); });
  });
}

let _invPushTimer = null;
function scheduleInvPush() { clearTimeout(_invPushTimer); _invPushTimer = setTimeout(()=>pushState(true), 600); }

// ================================================================
// SHOP / CURRENCY  (RWBY uses Lien — DM-controlled)
// ================================================================
const CURRENCY = { name:'Lien', symbol:'₥', short:'Lien' };
function seedShopIfEmpty(force){
  const cat = window.RWBY_DEFAULT_SHOP;
  if (!Array.isArray(cat) || !cat.length) return false;
  if (!force && Array.isArray(state.shop) && state.shop.length) return false;
  state.shop = cat.map(x => ({ name:x.name, desc:x.desc||'', price:Number(x.price)||0, category:x.category||'General', rarity:x.rarity||'Common', stock:null }));
  return true;
}
function renderSessionLog(){
  const host = el('sessionLogList'); if(!host) return;
  const log = Array.isArray(state.sessionLog)?state.sessionLog:[];
  if(!log.length){ host.innerHTML=`<div class="slog-empty">No session entries yet.${dmUnlocked?' Add the first debrief from the form above.':''}</div>`; return; }
  host.innerHTML = log.slice().reverse().map(entry=>{
    const awards = entry.lien ? `<span class="slog-award">+${fmtMoney(entry.lien)} ${CURRENCY.short}</span>` : '';
    const del = dmUnlocked ? `<button class="slog-del" data-id="${entry.id}" title="Delete">✕</button>` : '';
    return `<div class="slog-entry">
      <div class="slog-entry-head">
        <span class="slog-num">Session ${entry.num||'?'}</span>
        <span class="slog-title">${esc(entry.title||'Untitled')}</span>
        ${awards}${del}
      </div>
      ${entry.date?`<div class="slog-date">${esc(entry.date)}</div>`:''}
      <div class="slog-body">${esc(entry.body||'').replace(/\n/g,'<br>')}</div>
    </div>`;
  }).join('');
  if(dmUnlocked){
    host.querySelectorAll('.slog-del').forEach(b=>b.addEventListener('click',()=>{
      if(!confirm('Delete this session entry?')) return;
      state.sessionLog = state.sessionLog.filter(e=>e.id!==b.dataset.id);
      pushState(true); renderSessionLog();
    }));
  }
}
function addSessionEntry(){
  if(!dmUnlocked) return;
  const title=el('slogTitle')?.value.trim();
  const body=el('slogBody')?.value.trim();
  const lien=Math.max(0,Number(el('slogLien')?.value)||0);
  if(!title && !body){ showToast('Add a title or summary first','warn'); return; }
  if(!Array.isArray(state.sessionLog)) state.sessionLog=[];
  const num=state.sessionLog.length+1;
  state.sessionLog.push({
    id:'s'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),
    num, title:title||('Session '+num), body:body||'',
    date:new Date().toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'}),
    lien
  });
  if(lien>0){
    state.characters.forEach(c=>{ if(c.name && c.name.trim()) c.money=(Number(c.money)||0)+lien; });
  }
  if(el('slogTitle')) el('slogTitle').value='';
  if(el('slogBody')) el('slogBody').value='';
  if(el('slogLien')) el('slogLien').value='';
  pushState(true); renderSessionLog(); renderHeader();
  showToast(lien>0?`Session logged · +${fmtMoney(lien)} Lien to the party`:'Session logged','success');
}

// ═══════════════════════════════════════════════════════════════════
// COMBAT & SESSION SUITE (July 2026)
// Initiative tracker · Damage bus · Roll log · Rest system ·
// Concentration · Inspiration · DM notes · Damage-type resistances
// ═══════════════════════════════════════════════════════════════════

// The catalog every damage-typed system reads from. Grouped so the
// resistances editor can render as three tidy rows.
const DAMAGE_TYPES = [
  {id:'slashing',    label:'Slashing',    group:'physical', icon:'⚔'},
  {id:'piercing',    label:'Piercing',    group:'physical', icon:'🗡'},
  {id:'bludgeoning', label:'Bludgeoning', group:'physical', icon:'🔨'},
  {id:'fire',        label:'Fire',        group:'element',  icon:'🔥'},
  {id:'cold',        label:'Cold',        group:'element',  icon:'❄'},
  {id:'lightning',   label:'Lightning',   group:'element',  icon:'⚡'},
  {id:'thunder',     label:'Thunder',     group:'element',  icon:'💥'},
  {id:'acid',        label:'Acid',        group:'element',  icon:'🧪'},
  {id:'poison',      label:'Poison',      group:'element',  icon:'☠'},
  {id:'force',       label:'Force',       group:'special',  icon:'💫'},
  {id:'necrotic',    label:'Necrotic',    group:'special',  icon:'💀'},
  {id:'radiant',     label:'Radiant',     group:'special',  icon:'✨'},
  {id:'psychic',     label:'Psychic',     group:'special',  icon:'🧠'},
  {id:'aura',        label:'Aura Drain',  group:'special',  icon:'🛡'}
];
const DAMAGE_TYPE_BY_ID = Object.fromEntries(DAMAGE_TYPES.map(d=>[d.id,d]));

// ── CORE: damage application with resistance resolution ────────────
// Returns the actual damage dealt after resistances/vulns/immunities.
// Applies to temp HP first, then HP. Aura damage bypasses temp HP.
// Triggers concentration prompt and death-save state as needed.
function applyDamageToChar(charId, rawAmount, dmgType, opts){
  const c = state.characters.find(x => x.id === charId); if(!c) return 0;
  const dmg = Math.max(0, Math.floor(Number(rawAmount) || 0));
  if (!dmg) return 0;
  opts = opts || {};

  // Resistance resolution — immune first (0), then vuln×2, then resist÷2
  let final = dmg;
  const resList = Array.isArray(c.resistances)     ? c.resistances     : [];
  const vulList = Array.isArray(c.vulnerabilities) ? c.vulnerabilities : [];
  const immList = Array.isArray(c.immunities)      ? c.immunities      : [];
  let flag = '';
  if (dmgType && immList.includes(dmgType)) { final = 0;         flag = 'IMMUNE'; }
  else if (dmgType && vulList.includes(dmgType)) { final = dmg * 2; flag = 'VULNERABLE ×2'; }
  else if (dmgType && resList.includes(dmgType)) { final = Math.floor(dmg / 2); flag = 'RESISTED ÷2'; }

  // Aura damage bypasses temp HP and hits aura directly
  if (dmgType === 'aura') {
    c.aura.current = Math.max(0, (c.aura.current || 0) - final);
  } else {
    const tmp = Number(c.tempHp) || 0;
    const absorbed = Math.min(tmp, final);
    c.tempHp = tmp - absorbed;
    c.hp.current = Math.max(0, (c.hp.current || 0) - (final - absorbed));
    // Death saves reset when taking damage above 0? no — only awake chars concentrate
    // If HP hits 0, wipe death saves so the downed overlay reflects fresh state
    if (c.hp.current <= 0 && (!c.deathSaves || c.deathSaves.stable)) {
      c.deathSaves = { successes:0, failures:0, stable:false };
    }
    // If already downed (unconscious) and hit for damage, add a failed save (crit = 2)
    if (c.hp.current <= 0 && c.hp.max > 0) {
      c.deathSaves = c.deathSaves || {successes:0, failures:0, stable:false};
      c.deathSaves.failures = Math.min(3, (c.deathSaves.failures||0) + (opts.crit?2:1));
      c.deathSaves.stable = false;
    }
  }

  ensureClamp(c);

  // Log the hit into the roll log (dmg is a form of resolution worth tracking)
  addRollLog({
    who: c.name || 'Unnamed',
    formula: `${dmg}${dmgType ? ' ' + (DAMAGE_TYPE_BY_ID[dmgType]?.label || dmgType) : ''}${flag ? ' · '+flag : ''}${opts.crit?' · CRIT':''}`,
    result: final,
    kind: 'damage'
  });

  // Concentration prompt — 5e rule: CON save DC = max(10, damage/2)
  if (c.concentration?.active && final > 0 && dmgType !== 'aura') {
    const dc = Math.max(10, Math.floor(final / 2));
    // Flag it: DM sees a prompt on next render
    c._concCheck = { dc, ts: Date.now() };
  }

  return final;
}

// ── CORE: roll log ─────────────────────────────────────────────────
const ROLL_LOG_MAX = 60;
function addRollLog(entry){
  if(!Array.isArray(state.rollLog)) state.rollLog = [];
  state.rollLog.unshift({
    id: 'r-' + Date.now() + '-' + Math.random().toString(16).slice(2,6),
    ts: Date.now(),
    who: String(entry.who || '—'),
    formula: String(entry.formula || ''),
    result: String(entry.result ?? ''),
    crit: !!entry.crit,
    kind: entry.kind || 'roll'    // 'roll' | 'damage' | 'save' | 'skill'
  });
  if (state.rollLog.length > ROLL_LOG_MAX) state.rollLog.length = ROLL_LOG_MAX;
  pushState();
  try { if (dmUnlocked) renderRollLog(); } catch(e) {}
}

// ═════════════════════════════════════════════════════════════════
// A. INITIATIVE TRACKER
// ═════════════════════════════════════════════════════════════════
function renderInitiativeTracker(){
  const host = el('dmInitiativeRoot'); if(!host || !dmUnlocked) return;
  const ini = state.initiative || (state.initiative = {active:false, round:1, turnIdx:0, entries:[]});
  const sorted = [...ini.entries].sort((a,b) => b.init - a.init);
  ini.entries = sorted;   // canonical order = descending init
  const activeId = ini.active && sorted[ini.turnIdx] ? sorted[ini.turnIdx].id : null;

  const chars = state.characters.filter(c => c.state === 'active');
  const bestiaryOpts = (state.bestiaries||[])
    .flatMap(bx => (bx.entries||[]).map(e => ({bxName: bx.name, name: e.name || 'unnamed', hp: (e.stats?.CON||10)*2, ac: 12})));

  host.innerHTML = `
    <div class="dm-ini-shell">
      <div class="dm-ini-head">
        <div class="dm-ini-status ${ini.active?'active':''}">
          ${ini.active
            ? `<span class="dm-ini-round">ROUND ${ini.round}</span><span class="dm-ini-turnlbl">TURN</span>`
            : `<span class="dm-ini-off">COMBAT · OFF</span>`}
        </div>
        <div class="dm-ini-actions">
          ${ini.active
            ? `<button class="neo-btn small" id="iniNext">▶ Next Turn</button>
               <button class="neo-btn ghost small" id="iniEnd">■ End Combat</button>`
            : `<button class="neo-btn small" id="iniStart" ${sorted.length?'':'disabled'}>▶ Start Combat</button>`}
        </div>
      </div>

      <div class="dm-ini-add">
        <div class="dm-ini-add-sec">Add player</div>
        <div class="dm-ini-add-row">
          ${chars.length
            ? chars.map(c => `<button class="dm-ini-quick player" data-addchar="${esc(c.id)}">＋ ${esc(c.name||'Unnamed')}</button>`).join('')
            : '<span class="dm-empty">No active players</span>'}
        </div>
        <div class="dm-ini-add-sec">Add creature / custom</div>
        <div class="dm-ini-add-row dm-ini-add-form">
          <input type="text" id="iniName" placeholder="Name" class="dm-ini-input" style="flex:2">
          <input type="number" id="iniInit" placeholder="Init" class="dm-ini-input" style="width:70px">
          <input type="number" id="iniHp"   placeholder="HP"   class="dm-ini-input" style="width:70px">
          <input type="number" id="iniAc"   placeholder="AC"   class="dm-ini-input" style="width:60px">
          <select id="iniKind" class="dm-ini-input" style="width:100px">
            <option value="enemy">Enemy</option><option value="ally">Ally</option>
          </select>
          <button class="neo-btn small" id="iniAdd">＋ Add</button>
        </div>
        ${bestiaryOpts.length ? `<div class="dm-ini-add-sec">From bestiary</div>
          <div class="dm-ini-add-row"><select id="iniFromBeast" class="dm-ini-input" style="flex:1">
            <option value="">— pick a creature —</option>
            ${bestiaryOpts.map((b,ix)=>`<option value="${ix}">${esc(b.name)} · ${esc(b.bxName)}</option>`).join('')}
          </select>
          <input type="number" id="iniFromBeastInit" placeholder="Init roll" class="dm-ini-input" style="width:90px">
          <button class="neo-btn small" id="iniAddBeast">＋ Add</button></div>` : ''}
      </div>

      <div class="dm-ini-list">
        ${sorted.length ? sorted.map((e,ix) => {
          const c = e.charId ? state.characters.find(x => x.id === e.charId) : null;
          const hp = c ? c.hp.current : e.hp;
          const maxHp = c ? c.hp.max : e.maxHp;
          const dead = maxHp > 0 && hp <= 0;
          const isActive = e.id === activeId;
          return `<div class="dm-ini-row ${e.kind} ${isActive?'active':''} ${dead?'dead':''}" data-eid="${esc(e.id)}">
            <div class="dm-ini-init">${e.init}</div>
            <div class="dm-ini-name">${esc(e.name)}${c?'<span class="dm-ini-linkbadge">P</span>':''}${dead?'<span class="dm-ini-deadmark">DOWN</span>':''}</div>
            <div class="dm-ini-hp">${hp}${maxHp?'<span class="dm-ini-hpmax">/'+maxHp+'</span>':''}</div>
            <div class="dm-ini-ac">${e.ac ? 'AC '+e.ac : ''}</div>
            <div class="dm-ini-ctrl">
              <button class="dm-ini-btn" data-inibump="-1" data-eid="${esc(e.id)}" title="HP -1">−</button>
              <button class="dm-ini-btn" data-inibump="+1" data-eid="${esc(e.id)}" title="HP +1">+</button>
              <button class="dm-ini-btn del" data-inidel="${esc(e.id)}" title="Remove">✕</button>
            </div>
          </div>`;
        }).join('') : '<div class="dm-empty">Add combatants above to build the initiative order.</div>'}
      </div>
    </div>
  `;

  el('iniStart')?.addEventListener('click', () => {
    ini.active = true; ini.round = 1; ini.turnIdx = 0;
    pushState(true); renderInitiativeTracker();
    addRollLog({ who:'⚔ Combat', formula:'Round 1', result:'START', kind:'roll' });
  });
  el('iniEnd')?.addEventListener('click', () => {
    ini.active = false; ini.turnIdx = 0; ini.round = 1;
    pushState(true); renderInitiativeTracker();
    addRollLog({ who:'⚔ Combat', formula:'ended', result:'END', kind:'roll' });
  });
  el('iniNext')?.addEventListener('click', () => {
    if (!ini.entries.length) return;
    ini.turnIdx = (ini.turnIdx + 1) % ini.entries.length;
    if (ini.turnIdx === 0) ini.round += 1;
    pushState(true); renderInitiativeTracker();
  });
  el('iniAdd')?.addEventListener('click', () => {
    const nm = (el('iniName')?.value||'').trim();
    const iv = Number(el('iniInit')?.value)||0;
    if(!nm){ showToast('Give the combatant a name','warn'); return; }
    ini.entries.push({
      id: 'init-' + Date.now(),
      name: nm, init: iv,
      hp: Number(el('iniHp')?.value)||0,
      maxHp: Number(el('iniHp')?.value)||0,
      ac: Number(el('iniAc')?.value)||0,
      kind: el('iniKind')?.value || 'enemy',
      charId: '', note: ''
    });
    ['iniName','iniInit','iniHp','iniAc'].forEach(id => { const e=el(id); if(e) e.value=''; });
    pushState(true); renderInitiativeTracker();
  });
  host.querySelectorAll('[data-addchar]').forEach(b => b.addEventListener('click', () => {
    const c = state.characters.find(x => x.id === b.dataset.addchar); if(!c) return;
    const init = mod(effectiveStat(c,'DEX')) + Number(c.initiativeBonus||0) + (10 + Math.floor(Math.random()*10) + 1); // rough roll
    ini.entries.push({
      id: 'init-' + Date.now(),
      name: c.name || 'Hunter', init,
      hp: c.hp.current, maxHp: c.hp.max, ac: c.armor || 0,
      kind: 'player', charId: c.id, note: ''
    });
    pushState(true); renderInitiativeTracker();
  }));
  el('iniAddBeast')?.addEventListener('click', () => {
    const ix = Number(el('iniFromBeast')?.value);
    if (isNaN(ix)) return;
    const b = bestiaryOpts[ix]; if(!b) return;
    const roll = Number(el('iniFromBeastInit')?.value) || (10 + Math.floor(Math.random()*20)+1);
    ini.entries.push({
      id: 'init-' + Date.now(),
      name: b.name, init: roll,
      hp: b.hp, maxHp: b.hp, ac: b.ac,
      kind: 'enemy', charId: '', note: ''
    });
    if(el('iniFromBeastInit')) el('iniFromBeastInit').value='';
    pushState(true); renderInitiativeTracker();
  });
  host.querySelectorAll('[data-inibump]').forEach(b => b.addEventListener('click', () => {
    const e = ini.entries.find(x => x.id === b.dataset.eid); if(!e) return;
    const delta = Number(b.dataset.inibump);
    if (e.charId) {
      const c = state.characters.find(x => x.id === e.charId);
      if (c) { c.hp.current = Math.max(0, Math.min(c.hp.max, c.hp.current + delta)); ensureClamp(c); }
    } else {
      e.hp = Math.max(0, Math.min(e.maxHp || 999, e.hp + delta));
    }
    pushState(true); renderInitiativeTracker(); render();
  }));
  host.querySelectorAll('[data-inidel]').forEach(b => b.addEventListener('click', () => {
    ini.entries = ini.entries.filter(x => x.id !== b.dataset.inidel);
    if (ini.turnIdx >= ini.entries.length) ini.turnIdx = 0;
    pushState(true); renderInitiativeTracker();
  }));
}

// ═════════════════════════════════════════════════════════════════
// B. DAMAGE BUS — quick damage/healing application by DM
// ═════════════════════════════════════════════════════════════════
let _dmgBusState = { targets: new Set(), amount:'', type:'', crit:false, heal:false };

function renderDamageBus(){
  const host = el('dmDamageBusRoot'); if(!host || !dmUnlocked) return;
  const chars = state.characters.filter(c => c.state !== 'dead');

  host.innerHTML = `
    <div class="dm-bus-shell">
      <div class="dm-bus-form">
        <div class="dm-bus-title">Apply Damage / Healing</div>
        <div class="dm-bus-row">
          <label class="dm-bus-field" style="flex:1;min-width:120px">
            <span>Amount</span>
            <input type="text" id="busAmount" value="${esc(_dmgBusState.amount)}" placeholder="e.g. 18 or 3d8+5" class="dm-bus-input">
          </label>
          <label class="dm-bus-field" style="flex:1;min-width:140px">
            <span>Damage type</span>
            <select id="busType" class="dm-bus-input">
              <option value="">— untyped —</option>
              ${DAMAGE_TYPES.map(d => `<option value="${d.id}" ${_dmgBusState.type===d.id?'selected':''}>${d.icon} ${d.label}</option>`).join('')}
            </select>
          </label>
          <label class="dm-bus-flag">
            <input type="checkbox" id="busCrit" ${_dmgBusState.crit?'checked':''}>
            <span>Crit</span>
          </label>
          <label class="dm-bus-flag">
            <input type="checkbox" id="busHeal" ${_dmgBusState.heal?'checked':''}>
            <span>Healing instead</span>
          </label>
        </div>
      </div>
      <div class="dm-bus-targets">
        <div class="dm-bus-title">Target(s)</div>
        <div class="dm-bus-target-grid">
          ${chars.map(c => {
            const on = _dmgBusState.targets.has(c.id);
            return `<label class="dm-bus-target${on?' on':''}" data-cid="${esc(c.id)}">
              <input type="checkbox" class="dm-bus-tgcb" data-cid="${esc(c.id)}" ${on?'checked':''}>
              <span class="dm-bus-tgname">${esc(c.name||'Unnamed')}</span>
              <span class="dm-bus-tgstats">HP ${c.hp.current}/${c.hp.max} · AC ${c.armor||0}</span>
            </label>`;
          }).join('')}
        </div>
        <div class="dm-bus-target-quick">
          <button class="neo-btn ghost small" id="busAll">All active</button>
          <button class="neo-btn ghost small" id="busNone">Clear</button>
        </div>
      </div>
      <div class="dm-bus-apply">
        <button class="neo-btn ${_dmgBusState.heal?'':'danger'}" id="busApply">${_dmgBusState.heal?'✚ Heal':'💥 Apply damage'}</button>
      </div>
    </div>
  `;

  const store = () => {
    _dmgBusState.amount = el('busAmount')?.value || '';
    _dmgBusState.type   = el('busType')?.value || '';
    _dmgBusState.crit   = !!el('busCrit')?.checked;
    _dmgBusState.heal   = !!el('busHeal')?.checked;
  };
  el('busAmount')?.addEventListener('input', store);
  el('busType')?.addEventListener('change', store);
  el('busCrit')?.addEventListener('change', () => { store(); });
  el('busHeal')?.addEventListener('change', () => { store(); renderDamageBus(); });
  host.querySelectorAll('.dm-bus-tgcb').forEach(cb => cb.addEventListener('change', e => {
    const cid = e.target.dataset.cid;
    if (e.target.checked) _dmgBusState.targets.add(cid);
    else _dmgBusState.targets.delete(cid);
    e.target.closest('.dm-bus-target').classList.toggle('on', e.target.checked);
  }));
  el('busAll')?.addEventListener('click', () => {
    chars.forEach(c => _dmgBusState.targets.add(c.id));
    renderDamageBus();
  });
  el('busNone')?.addEventListener('click', () => { _dmgBusState.targets.clear(); renderDamageBus(); });
  el('busApply')?.addEventListener('click', () => {
    store();
    if (!_dmgBusState.targets.size) { showToast('Pick at least one target', 'warn'); return; }
    const amount = evalMathInput(_dmgBusState.amount);
    if (!amount || amount <= 0) { showToast('Enter a positive number or math expression', 'warn'); return; }
    pushUndo(_dmgBusState.heal ? `Healed ${_dmgBusState.targets.size} target(s)` : `Damaged ${_dmgBusState.targets.size} target(s)`);

    _dmgBusState.targets.forEach(cid => {
      const c = state.characters.find(x => x.id === cid); if(!c) return;
      if (_dmgBusState.heal) {
        c.hp.current = Math.min(c.hp.max, (c.hp.current || 0) + amount);
        // Healing above 0 clears death saves
        if (c.hp.current > 0 && c.deathSaves) c.deathSaves = { successes:0, failures:0, stable:false };
        addRollLog({ who: c.name, formula: `+${amount} healing`, result: c.hp.current, kind: 'heal' });
        try { flashCharCard(c.id, 'heal'); } catch(e){}
      } else {
        const dealt = applyDamageToChar(cid, amount, _dmgBusState.type, { crit: _dmgBusState.crit });
        try { flashCharCard(c.id, 'damage'); } catch(e){}
      }
    });
    pushState(true); render();
    _dmgBusState.amount = ''; renderDamageBus();
    showToast(_dmgBusState.heal ? 'Healed' : 'Damage applied', 'success');
  });
}

// Little one-shot flash on a character card when they take damage/heal.
// Purely visual. Requires the card to expose data-cid.
function flashCharCard(charId, kind){
  document.querySelectorAll(`[data-cardcid="${charId}"]`).forEach(el => {
    el.classList.remove('flash-damage','flash-heal');
    void el.offsetWidth;
    el.classList.add(kind === 'heal' ? 'flash-heal' : 'flash-damage');
  });
}

// ═════════════════════════════════════════════════════════════════
// G. ROLL HISTORY LOG
// ═════════════════════════════════════════════════════════════════
function renderRollLog(){
  const host = el('dmRollLogRoot'); if(!host || !dmUnlocked) return;
  const log = Array.isArray(state.rollLog) ? state.rollLog : [];

  host.innerHTML = `
    <div class="dm-rlog-shell">
      <div class="dm-rlog-head">
        <div class="dm-rlog-title">Roll Log <span class="dm-rlog-count">${log.length}</span></div>
        <div class="dm-rlog-actions">
          <button class="neo-btn ghost small" id="rlogClear">🗑 Clear</button>
        </div>
      </div>
      <div class="dm-rlog-list">
        ${log.length ? log.map(r => {
          const t = new Date(r.ts);
          const time = `${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`;
          const kindCls = `k-${r.kind || 'roll'}`;
          return `<div class="dm-rlog-row ${kindCls} ${r.crit?'crit':''}">
            <div class="dm-rlog-time">${time}</div>
            <div class="dm-rlog-who">${esc(r.who)}</div>
            <div class="dm-rlog-formula">${esc(r.formula)}</div>
            <div class="dm-rlog-result">${esc(String(r.result))}${r.crit?' 💥':''}</div>
          </div>`;
        }).join('') : '<div class="dm-empty" style="padding:1.5rem">No rolls logged yet.</div>'}
      </div>
    </div>
  `;
  el('rlogClear')?.addEventListener('click', () => {
    if (!confirm('Clear the entire roll log?')) return;
    state.rollLog = []; pushState(true); renderRollLog();
  });
}

// ═════════════════════════════════════════════════════════════════
// F. DM's PRIVATE NOTES per character
// L. DAMAGE RESISTANCES / VULNERABILITIES / IMMUNITIES per character
//    Both live inline on the DM Players tab (rendered per-character card)
// ═════════════════════════════════════════════════════════════════
function renderDmPerCharPanels(){
  if(!dmUnlocked) return;
  const root = el('dmPerCharRoot'); if(!root) return;
  root.innerHTML = state.characters.filter(c => c.state !== 'dead').map(c => {
    const rows = ['resistances','vulnerabilities','immunities'].map(kind => {
      const set = new Set(Array.isArray(c[kind]) ? c[kind] : []);
      const lbl = kind === 'resistances' ? 'Resistant ÷2'
                : kind === 'vulnerabilities' ? 'Vulnerable ×2'
                : 'Immune (0 dmg)';
      const cls = kind === 'resistances' ? 'res' : kind === 'vulnerabilities' ? 'vul' : 'imm';
      return `<div class="dm-res-row">
        <div class="dm-res-label ${cls}">${lbl}</div>
        <div class="dm-res-cells">
          ${DAMAGE_TYPES.map(d => {
            const on = set.has(d.id);
            return `<label class="dm-res-cell${on?' on':''}" title="${d.label}" data-restype="${kind}" data-cid="${esc(c.id)}" data-dtype="${d.id}">
              <input type="checkbox" ${on?'checked':''}>
              <span class="dm-res-icon">${d.icon}</span>
            </label>`;
          }).join('')}
        </div>
      </div>`;
    }).join('');

    return `<details class="dm-charpanel" data-cpcid="${esc(c.id)}">
      <summary><span class="dm-charpanel-name">${esc(c.name||'Unnamed')}</span>
        <span class="dm-charpanel-state">${esc(c.state||'active')}</span></summary>
      <div class="dm-charpanel-body">
        <div class="dm-charpanel-sec">Damage-type profile</div>
        <p class="dm-hint" style="margin:.1rem 0 .5rem">These feed the Damage Bus. Click a damage type in a row to toggle it.</p>
        ${rows}
        <div class="dm-charpanel-sec">Private DM notes</div>
        <p class="dm-hint" style="margin:.1rem 0 .5rem">Only visible in DM mode. Backstory hooks, secrets, plot bombs.</p>
        <textarea class="dm-charpanel-notes" data-dmnotescid="${esc(c.id)}" placeholder="Only DMs see this…">${esc(c.dmNotes||'')}</textarea>
      </div>
    </details>`;
  }).join('') || '<div class="dm-empty">No active characters.</div>';

  root.querySelectorAll('[data-restype]').forEach(cell => {
    cell.addEventListener('click', e => {
      if (e.target.tagName !== 'INPUT') {
        e.preventDefault();
        const cb = cell.querySelector('input');
        cb.checked = !cb.checked;
      }
      const c = state.characters.find(x => x.id === cell.dataset.cid); if(!c) return;
      const kind = cell.dataset.restype;
      const list = Array.isArray(c[kind]) ? c[kind] : [];
      const dtype = cell.dataset.dtype;
      const idx = list.indexOf(dtype);
      if (cell.querySelector('input').checked) { if (idx<0) list.push(dtype); }
      else { if (idx>=0) list.splice(idx, 1); }
      c[kind] = list;
      cell.classList.toggle('on', cell.querySelector('input').checked);
      pushState();
    });
  });
  root.querySelectorAll('[data-dmnotescid]').forEach(ta => ta.addEventListener('input', e => {
    const c = state.characters.find(x => x.id === e.target.dataset.dmnotescid); if(!c) return;
    c.dmNotes = e.target.value; pushState();
  }));
}

// ═════════════════════════════════════════════════════════════════
// E. CONCENTRATION · J. REST · M. INSPIRATION
// Rendered inline on the character sheet's header area
// ═════════════════════════════════════════════════════════════════
function renderCombatStatusChips(){
  const c = getChar(); if(!c) return;
  const host = el('combatStatusChips'); if(!host) return;
  const editable = !spectator;

  const conc = c.concentration || {active:false, source:''};
  const insp = Math.max(0, Number(c.inspiration)||0);

  host.innerHTML = `
    <div class="csc-row">
      <button type="button" class="csc-chip conc ${conc.active?'on':''}" id="cscConcToggle" ${editable?'':'disabled'} title="Toggle concentration">
        <span class="csc-icon">🌀</span>
        <span class="csc-label">Concentrating${conc.active && conc.source ? ' · ' + esc(conc.source) : ''}</span>
      </button>
      ${conc.active ? `<input type="text" class="csc-conc-input" id="cscConcSource" placeholder="on what? (Semblance / Spell)" value="${esc(conc.source||'')}" ${editable?'':'readonly'}>` : ''}
      <div class="csc-chip insp ${insp>0?'on':''}">
        <span class="csc-icon">✨</span>
        <span class="csc-label">Inspiration</span>
        <span class="csc-count">${insp}</span>
        ${editable?`<button class="csc-mini-btn" data-inspd="-1" title="−">−</button>
        <button class="csc-mini-btn" data-inspd="+1" title="+">＋</button>`:''}
      </div>
      ${editable ? `
        <button type="button" class="csc-chip rest-short" id="cscShortRest" title="Short Rest — restore Hit Dice, some tech uses">
          <span class="csc-icon">🛏</span><span class="csc-label">Short Rest</span>
        </button>
        <button type="button" class="csc-chip rest-long" id="cscLongRest" title="Long Rest — full HP, full Aura, all uses reset">
          <span class="csc-icon">🌙</span><span class="csc-label">Long Rest</span>
        </button>
      ` : ''}
    </div>
    ${c._concCheck ? `<div class="csc-conc-prompt">
      <span class="csc-conc-prompt-icon">⚠</span>
      <span>Concentration check! Take a CON save vs <strong>DC ${c._concCheck.dc}</strong>.</span>
      <button class="neo-btn small" id="cscConcResolve">Dismiss</button>
    </div>` : ''}
  `;

  el('cscConcToggle')?.addEventListener('click', () => {
    c.concentration = c.concentration || {active:false, source:''};
    c.concentration.active = !c.concentration.active;
    if (!c.concentration.active) c.concentration.source = '';
    pushState(true); renderCombatStatusChips();
  });
  el('cscConcSource')?.addEventListener('input', e => {
    c.concentration.source = e.target.value;
    pushState();
  });
  el('cscConcResolve')?.addEventListener('click', () => {
    delete c._concCheck;
    pushState(true); renderCombatStatusChips();
  });
  host.querySelectorAll('[data-inspd]').forEach(b => b.addEventListener('click', () => {
    c.inspiration = Math.max(0, (Number(c.inspiration)||0) + Number(b.dataset.inspd));
    pushState(true); renderCombatStatusChips();
  }));
  el('cscShortRest')?.addEventListener('click', () => {
    if (!confirm(`Take a Short Rest for ${c.name||'this Hunter'}?`)) return;
    pushUndo(`${c.name||'Hunter'} took a short rest`);
    doShortRest(c);
    pushState(true); render();
    showToast('Short rest complete', 'success');
  });
  el('cscLongRest')?.addEventListener('click', () => {
    if (!confirm(`Take a Long Rest for ${c.name||'this Hunter'}? Restores HP, aura, and all uses.`)) return;
    pushUndo(`${c.name||'Hunter'} took a long rest`);
    doLongRest(c);
    pushState(true); render();
    showToast('Long rest — fully restored', 'success');
  });
}

// Rest math kept intentionally simple. Robert can extend if he wants
// per-technique short-rest recovery later.
function doShortRest(c){
  // Half aura restored (rounded down), tempHp cleared, downed cleared if stable
  c.aura.current = Math.min(c.aura.max, Math.floor((c.aura.current||0) + (c.aura.max||0)/2));
  c.tempHp = 0;
  // No HP restore on short rest (5e uses hit dice — leave to player choice)
  if (c.hp.current <= 0 && c.deathSaves?.stable) {
    c.hp.current = 1;
    c.deathSaves = { successes:0, failures:0, stable:false };
  }
  addRollLog({ who: c.name, formula: 'Short Rest', result: `Aura ${c.aura.current}/${c.aura.max}`, kind:'rest' });
}
function doLongRest(c){
  c.hp.current  = c.hp.max;
  c.aura.current = c.aura.max;
  c.tempHp = 0;
  c.deathSaves = { successes:0, failures:0, stable:false };
  c.concentration = { active:false, source:'' };
  // Clear conditions on long rest (5e-ish — most conditions end)
  c.conditions = [];
  addRollLog({ who: c.name, formula: 'Long Rest', result: 'Full restore', kind:'rest' });
}

// Hook the combat suite into the main render pipeline
function renderCombatSuite(){
  try { renderCombatStatusChips(); } catch(e) { console.error('renderCombatStatusChips:', e); }
  if (dmUnlocked) {
    try { renderInitiativeTracker(); } catch(e) { console.error('renderInitiativeTracker:', e); }
    try { renderDamageBus(); }        catch(e) { console.error('renderDamageBus:', e); }
    try { renderRollLog(); }          catch(e) { console.error('renderRollLog:', e); }
    try { renderDmPerCharPanels(); }  catch(e) { console.error('renderDmPerCharPanels:', e); }
  }
}

const SHOP_CATEGORIES_RWBY = ['Weapons','Dust','Gear','Consumables','Tech','Upgrades','Rare','General'];
function fmtMoney(n){ return (Number(n)||0).toLocaleString('en-US'); }

const RARITY_META = {
  Common:   { color:'#8a96a2', label:'Common' },
  Uncommon: { color:'#5ad17a', label:'Uncommon' },
  Rare:     { color:'#00d4ff', label:'Rare' },
  Legendary:{ color:'#c2a23a', label:'Legendary' }
};
// ── LOCATION-BASED PRICING (replaces factions entirely) ──
// Each location: base multiplier (everyone) × race multiplier. >1 = markup, <1 = discount.
// humanBlocked: humans cannot purchase here at all.
const SHOP_LOCATIONS = {
  vale:      { label:'Vale',      base:1.0,  human:1.0,  faunus:1.0,  desc:'The neutral heart of Remnant. Fair market rates for everyone.' },
  atlas:     { label:'Atlas',     base:1.25, human:1.0,  faunus:1.4,  desc:'Wealthy and expensive. Prices run high — and Faunus are charged steeper still.' },
  vacuo:     { label:'Vacuo',     base:2.5,  human:1.0,  faunus:1.0,  desc:'A lawless desert economy. Everything is wildly overpriced — for everyone equally.' },
  mistral:   { label:'Mistral',   base:1.0,  human:0.75, faunus:1.1,  desc:'Deeply pro-Human. Humans enjoy a generous discount; Faunus pay a premium.' },
  menagerie: { label:'Menagerie', base:1.0,  human:1.0,  faunus:0.5,  humanBlocked:true, desc:'The Faunus homeland. Faunus get half off nearly everything. Humans cannot trade here.' },
};
function currentLocation(){ return SHOP_LOCATIONS[state.shopLocation] || SHOP_LOCATIONS.vale; }
function raceMultAt(loc, c){
  return isFaunus(c) ? (Number(loc.faunus)||1) : (Number(loc.human)||1);
}
// Humans cannot buy in Menagerie.
function humanBlockedHere(c){
  const loc = currentLocation();
  return !!loc.humanBlocked && !isFaunus(c);
}
// Final price for an item at the current location for the current character.
function locationPrice(it){
  const base = Number(it.price)||0;
  const loc = currentLocation();
  const mult = (Number(loc.base)||1) * raceMultAt(loc, getChar());
  return Math.max(0, Math.round(base * mult));
}
// Back-compat alias used elsewhere in the file.
function discountedPrice(it){ return locationPrice(it); }
// Net multiplier for the current character at the current location (for display).
function locationMultiplier(){
  const loc = currentLocation();
  return (Number(loc.base)||1) * raceMultAt(loc, getChar());
}
function renderShop() {
  const c = getChar();
  const host = el('shopList'); if (!host) return;
  const bal = el('shopBalance'); if (bal) bal.textContent = `${fmtMoney(c.money)} ${CURRENCY.short}`;

  const fsel = el('shopFactionSelect');
  if (fsel) {
    const opts = Object.entries(SHOP_LOCATIONS).map(([k,v])=>`<option value="${k}" ${state.shopLocation===k?'selected':''}>${esc(v.label)}</option>`).join('');
    if (fsel.innerHTML !== opts) fsel.innerHTML = opts;
    fsel.value = state.shopLocation || 'vale';
  }
  const loc = currentLocation();
  const mult = locationMultiplier();
  const blocked = humanBlockedHere(c);
  const fnote = el('shopFactionNote');
  if (fnote){
    let note = loc.desc;
    if (blocked) note += '  ⛔ You are Human — you cannot trade in Menagerie.';
    else if (mult > 1) note += `  ▲ Prices ×${mult.toFixed(2)} (${isFaunus(c)?'Faunus':'Human'} rate).`;
    else if (mult < 1) note += `  ▼ Prices ×${mult.toFixed(2)} (${isFaunus(c)?'Faunus':'Human'} rate) — a discount.`;
    else note += '  ◆ Standard prices (×1.00).';
    fnote.textContent = note;
  }

  if (!Array.isArray(state.shop) || !state.shop.length) {
    host.innerHTML = `<div class="inv-empty">The shop is empty. The DM stocks it from the DM Panel.</div>`;
    return;
  }

  // Humans cannot buy in Menagerie — show a clear block message instead of the catalogue's buy buttons.
  if (blocked) {
    host.innerHTML = `<div class="shop-blocked">
      <div class="shop-blocked-icon">⛔</div>
      <div class="shop-blocked-title">No Trade Permitted</div>
      <div class="shop-blocked-text">Menagerie is Faunus territory. Human characters cannot purchase goods here. Travel to another location, or have a Faunus shop on your behalf.</div>
    </div>`;
    return;
  }

  const q = _shopFilter.trim().toLowerCase();
  const matches = (it)=> !q
    || (it.name||'').toLowerCase().includes(q)
    || (it.desc||'').toLowerCase().includes(q)
    || (it.category||'').toLowerCase().includes(q)
    || (it.rarity||'').toLowerCase().includes(q);
  const totalMatching = state.shop.filter(matches).length;
  const scnt = el('shopSearchCount');
  if(scnt) scnt.textContent = q ? `${totalMatching}/${state.shop.length}` : '';

  if(q && !totalMatching){
    host.innerHTML = `<div class="inv-empty">Nothing in stock matches "${esc(_shopFilter)}".</div>`;
    return;
  }

  const cats = [];
  state.shop.forEach(it => { const cc = it.category||'General'; if (!cats.includes(cc)) cats.push(cc); });
  // Category-level price tag (same multiplier applies to all, so show it once at the top via the note).
  const pctLabel = mult===1 ? '' : (mult<1 ? `−${Math.round((1-mult)*100)}%` : `+${Math.round((mult-1)*100)}%`);
  const pctClass = mult<1 ? 'discount' : (mult>1 ? 'markup' : '');

  host.innerHTML = cats.map(cat => {
    const rows = state.shop.map((it,i)=>({it,i})).filter(({it})=>(it.category||'General')===cat && matches(it));
    if(!rows.length) return '';   // hide categories with no matches
    return `
    <div class="shop-cat-group">
      <div class="shop-cat-header">${esc(cat)}<span class="shop-cat-count">${rows.length}</span>${pctLabel?`<span class="shop-cat-disc ${pctClass}">${pctLabel}</span>`:''}</div>
      ${rows.map(({it,i})=>{
        const base = Number(it.price)||0;
        const price = locationPrice(it);
        const diff = price !== base;
        const cheaper = price < base;
        const afford = (Number(c.money)||0) >= price;
        const out = it.stock!=null && it.stock<=0;
        const stock = it.stock==null?'∞':it.stock;
        const rar = RARITY_META[it.rarity] || RARITY_META.Common;
        return `
        <div class="shop-item ${out?'out':''}">
          <div class="shop-item-main">
            <div class="shop-item-name">${esc(it.name||'Item')} <span class="shop-rarity" style="--rar:${rar.color}">${rar.label}</span></div>
            <div class="shop-item-meta"><span class="shop-stock">Stock: ${out?'SOLD OUT':stock}</span></div>
            ${it.desc?`<div class="shop-item-desc">${esc(it.desc)}</div>`:''}
          </div>
          <div class="shop-item-buy">
            <div class="shop-price ${diff?(cheaper?'is-discount':'is-markup'):''}">${diff?`<span class="shop-price-old">${fmtMoney(base)}</span>`:''}${fmtMoney(price)}<span>${CURRENCY.symbol}</span></div>
            ${!spectator && !out ? `<button class="shop-buy-btn ${afford?'':'cant'}" data-i="${i}">${afford?'BUY':'NOT ENOUGH'}</button>` : (out?'<span class="shop-out-tag">OUT</span>':'')}
          </div>
        </div>`;
      }).join('')}
    </div>`;
  }).join('');

  host.querySelectorAll('.shop-buy-btn').forEach(b => {
    if (b.classList.contains('cant')) return;
    b.addEventListener('click', () => buyItem(parseInt(b.dataset.i)));
  });
}
function buyItem(i) {
  const c = getChar(); const item = state.shop[i]; if (!item) return;
  // players may only buy for their OWN claimed character
  if (!dmUnlocked && !spectator) {
    const mine = state.characters.find(x => x.claimedBy === MY_PRESENCE_ID);
    if (!mine || mine !== c) { showToast('You can only buy for your own character', 'warn'); return; }
  }
  if (spectator) return;
  if (humanBlockedHere(c)) { showToast('Humans cannot trade in Menagerie', 'warn'); return; }
  const price = locationPrice(item);
  if ((Number(c.money)||0) < price) { showToast('Not enough Lien', 'warn'); return; }
  if (item.stock!=null && item.stock<=0) { showToast('Sold out', 'warn'); return; }
  if (!confirm(`Buy ${item.name} for ${fmtMoney(price)} ${CURRENCY.short}?`)) return;
  c.money -= price;
  if (item.stock!=null) item.stock -= 1;
  if (!Array.isArray(c.inventory)) c.inventory = [];
  const existing = c.inventory.find(x => x.name === item.name);
  if (existing) existing.qty = (Number(existing.qty)||1) + 1;
  else c.inventory.push({ name:item.name, qty:1, notes:item.desc? item.desc.slice(0,60) : 'Purchased' });
  pushState(true); renderShop(); renderInventory(); renderHeader();
  showToast(`Purchased ${item.name}`, 'success');
}

// ── DM shop management ──
function renderDmShop() {
  const host = el('dmShopList'); if (!host) return;
  if (!Array.isArray(state.shop)) state.shop = [];
  const meta = el('dmShopMeta'); if (meta) meta.textContent = `${state.shop.length} items`;
  host.innerHTML = state.shop.length ? state.shop.map((it,i)=>`
    <div class="dm-shop-row">
      <input class="ds-name" data-i="${i}" value="${esc(it.name||'')}" placeholder="Item name">
      <select class="ds-cat" data-i="${i}">${SHOP_CATEGORIES_RWBY.map(t=>`<option ${it.category===t?'selected':''}>${t}</option>`).join('')}</select>
      <input class="ds-price" data-i="${i}" type="number" min="0" value="${it.price||0}" title="Price">
      <input class="ds-stock" data-i="${i}" type="number" min="0" value="${it.stock==null?'':it.stock}" placeholder="∞" title="Stock (blank = unlimited)">
      <button class="ds-del" data-i="${i}">✕</button>
    </div>
    <input class="ds-desc" data-i="${i}" value="${esc(it.desc||'')}" placeholder="Description (optional)">
  `).join('') : `<div class="inv-empty">No items stocked. Add items below.</div>`;
  host.querySelectorAll('.ds-name').forEach(inp=> inp.addEventListener('input',()=>{ state.shop[+inp.dataset.i].name=inp.value; scheduleInvPush(); }));
  host.querySelectorAll('.ds-desc').forEach(inp=> inp.addEventListener('input',()=>{ state.shop[+inp.dataset.i].desc=inp.value; scheduleInvPush(); }));
  host.querySelectorAll('.ds-price').forEach(inp=> inp.addEventListener('input',()=>{ state.shop[+inp.dataset.i].price=Math.max(0,Number(inp.value)||0); scheduleInvPush(); }));
  host.querySelectorAll('.ds-stock').forEach(inp=> inp.addEventListener('input',()=>{ const v=inp.value.trim(); state.shop[+inp.dataset.i].stock=v===''?null:Math.max(0,Number(v)||0); scheduleInvPush(); }));
  host.querySelectorAll('.ds-cat').forEach(s=> s.addEventListener('change',()=>{ state.shop[+s.dataset.i].category=s.value; pushState(true); }));
  host.querySelectorAll('.ds-del').forEach(b=> b.addEventListener('click',()=>{ state.shop.splice(+b.dataset.i,1); pushState(true); renderDmShop(); renderShop(); }));
}
function addShopItem() { if (!Array.isArray(state.shop)) state.shop=[]; state.shop.push({name:'',category:'General',price:100,stock:null,desc:''}); pushState(true); renderDmShop(); renderShop(); }

// ── DM money granting ──
function renderDmMoney() {
  const host = el('dmMoneyList'); if (!host) return;
  host.innerHTML = state.characters.map((c,i)=>`
    <div class="dm-money-row">
      <span class="dm-money-name">${esc(c.name||`Character ${i+1}`)}</span>
      <span class="dm-money-bal">${fmtMoney(c.money)} ${CURRENCY.short}</span>
      <input class="dm-money-amt" data-i="${i}" type="number" placeholder="amount">
      <button class="dm-money-give" data-i="${i}">+ Give</button>
      <button class="dm-money-take" data-i="${i}">− Take</button>
      <button class="dm-money-set" data-i="${i}">Set</button>
    </div>`).join('');
  const apply = (i, mode) => {
    const inp = host.querySelector(`.dm-money-amt[data-i="${i}"]`);
    const amt = Number(inp?.value)||0;
    const c = state.characters[i]; if (!c) return;
    if (mode==='give') c.money = (Number(c.money)||0) + amt;
    else if (mode==='take') c.money = Math.max(0, (Number(c.money)||0) - amt);
    else if (mode==='set') c.money = Math.max(0, amt);
    if (inp) inp.value = '';
    pushState(true); renderDmMoney(); renderHeader(); renderShop();
    showToast(`${c.name||'Character'}: ${fmtMoney(c.money)} ${CURRENCY.short}`, 'success');
  };
  host.querySelectorAll('.dm-money-give').forEach(b=> b.addEventListener('click',()=>apply(+b.dataset.i,'give')));
  host.querySelectorAll('.dm-money-take').forEach(b=> b.addEventListener('click',()=>apply(+b.dataset.i,'take')));
  host.querySelectorAll('.dm-money-set').forEach(b=> b.addEventListener('click',()=>apply(+b.dataset.i,'set')));
}

function bindInventory() {
  const add = () => {
    const c = getChar();
    const name = el('invAddName')?.value.trim();
    const qty  = Math.max(1, Number(el('invAddQty')?.value) || 1);
    if (!name) return;
    if (!c.inventory) c.inventory = [];
    c.inventory.push({ name, qty, notes:'' });
    el('invAddName').value = ''; el('invAddQty').value = '1';
    pushState(true); renderInventory();
    el('invAddName')?.focus();
  };
  el('addInvBtn')?.addEventListener('click', add);
  el('invAddName')?.addEventListener('keydown', e => { if (e.key==='Enter') add(); });
  el('addShopItemBtn')?.addEventListener('click', addShopItem);
  el('shopFactionSelect')?.addEventListener('change', e=>{ state.shopLocation = e.target.value; pushState(true); renderShop(); });
  el('restockShopBtn')?.addEventListener('click', ()=>{
    if(!dmUnlocked) return;
    const has = Array.isArray(state.shop) && state.shop.length;
    if(has && !confirm('Replace the current shop with the full default catalogue (73 items)? Existing custom items will be removed.')) return;
    if(seedShopIfEmpty(true)){ pushState(true); renderShop(); renderDmShop(); showToast('Shop catalogue loaded','success'); }
  });
  el('addSessionBtn')?.addEventListener('click', addSessionEntry);
  el('refillStockBtn')?.addEventListener('click', ()=>{
    if(!dmUnlocked) return;
    if(!Array.isArray(state.shop)||!state.shop.length){ showToast('Shop is empty','warn'); return; }
    let n=0;
    state.shop.forEach(it=>{ if(it.stock!=null){ const base=Number(it.restockTo)||Number(it.maxStock)||10; it.stock=base; n++; } });
    if(n===0){ showToast('No limited-stock items to refill','info'); return; }
    pushState(true); renderShop(); renderDmShop();
    showToast(`Refilled ${n} limited item${n>1?'s':''}`,'success');
  });
}

// ================================================================
// CURSES TAB
// ================================================================
function renderCurses() {
  const c = getChar();
  const cont = el('cursesList'); if (!cont) return;
  const curses = c.curses || [];

  if (!curses.length) {
    cont.innerHTML = `<div class="curses-empty">
      <div class="curses-empty-icon">☠</div>
      <div>No curses. For now.</div>
      <span>Whatever the wheel hands you will end up here.</span>
    </div>`;
    return;
  }

  const sevOrder = { extreme:0, severe:1, moderate:2, mild:3 };
  const sorted = [...curses].sort((a,b) => (sevOrder[a.severity]??9) - (sevOrder[b.severity]??9));

  cont.innerHTML = sorted.map(cur => {
    const realIdx = curses.indexOf(cur);
    const dur = cur.duration || '1 session';
    const durLabel = dur === 'permanent' ? '☠ Permanent' : '⏳ ' + dur;
    const sevLabel = { mild:'Mild', moderate:'Moderate', severe:'Severe', extreme:'Extreme' }[cur.severity] || cur.severity;
    return `
      <div class="curse-entry curse-${cur.severity}">
        <div class="curse-entry-bar"></div>
        <div class="curse-entry-body">
          <div class="curse-entry-top">
            <span class="curse-entry-name">${esc(cur.name)}</span>
            <span class="curse-entry-sev curse-sev-${cur.severity}">${sevLabel}</span>
          </div>
          <div class="curse-entry-dur ${dur==='permanent'?'perm':''}">${durLabel}</div>
          <div class="curse-entry-text">${esc(cur.text)}</div>
          <button class="curse-lift-btn" data-curse-idx="${realIdx}">Lift this curse</button>
        </div>
      </div>`;
  }).join('');

  cont.querySelectorAll('.curse-lift-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.curseIdx);
      const removed = c.curses.splice(idx, 1)[0];
      pushState(true); renderCurses();
      if (removed) showToast(`"${removed.name}" lifted`, 'success', 3000);
    });
  });
}

// ================================================================
// #23 — CHARACTER ACCENT COLOR
// ================================================================
function applyCharacterAccents() {
  state.characters.forEach((c, i) => {
    const color = c.accentColor || '';
    const tabs = document.querySelectorAll('.character-tab');
    if (tabs[i] && color) {
      tabs[i].style.setProperty('--char-color', color);
      tabs[i].style.borderLeftColor = color;
    }
  });
}

function bindAccentColor() {
  el('accentColorInput')?.addEventListener('input', e => {
    const c = getChar(); c.accentColor = e.target.value;
    pushState(); applyCharacterAccents();
  });
}

// ── Push personal notes to a PRIVATE library book (only this player can read) ──
async function pushNotesToLibrary() {
  const c = getMyCharacter() || getChar();
  if (!c) return;
  const notes = c.notesText || '';
  if (!notes.trim()) { setNotesLibStatus('Nothing to save — write some notes first.', true); return; }
  const charName = c.name || 'My';
  try {
    // Stored per-presence so it's private to this browser/player.
    await setDoc(doc(db, 'rwby-private', MY_PRESENCE_ID), {
      owner: MY_PRESENCE_ID,
      bookName: `${charName} · Notes`,
      character: charName,
      text: notes,
      updated: Date.now()
    });
    setNotesLibStatus('✓ Saved to your private Library book.', false);
  } catch(e) {
    console.error('pushNotesToLibrary', e);
    setNotesLibStatus('Could not save — check your connection.', true);
  }
}
function setNotesLibStatus(msg, isError) {
  const el2 = el('notesLibStatus');
  if (el2) { el2.textContent = msg; el2.style.color = isError ? '#ff8088' : 'var(--safe)'; el2.style.opacity = '1'; }
}
function bindNotesLibrary() {
  el('pushNotesToLibraryBtn')?.addEventListener('click', pushNotesToLibrary);
}

function renderAccentColor() {
  const c = getChar();
  const inp = el('accentColorInput');
  if (inp) inp.value = c.accentColor || '#00d4ff';
}

// ================================================================
// #26 — HP/AURA DAMAGE FLASH
// ================================================================
let _rwAudio = null;
let _rwSfxOn = localStorage.getItem('rwby-sfx') !== '0';
function _rwac(){
  if(!_rwSfxOn) return null;
  if(!_rwAudio){ try{ _rwAudio = new (window.AudioContext||window.webkitAudioContext)(); }catch(e){ return null; } }
  if(_rwAudio.state==='suspended') _rwAudio.resume().catch(()=>{});
  return _rwAudio;
}
let _rwAmbient = null;
function startAmbient(){
  const ac=_rwac(); if(!ac||_rwAmbient) return;
  const master=ac.createGain(); master.gain.value=0; master.connect(ac.destination);
  const oscA=ac.createOscillator(); oscA.type='sine'; oscA.frequency.value=65;
  const oscB=ac.createOscillator(); oscB.type='sine'; oscB.frequency.value=98;
  const oscC=ac.createOscillator(); oscC.type='triangle'; oscC.frequency.value=131;
  const gA=ac.createGain(); gA.gain.value=0.5;
  const gB=ac.createGain(); gB.gain.value=0.3;
  const gC=ac.createGain(); gC.gain.value=0.0;
  const lfo=ac.createOscillator(); lfo.type='sine'; lfo.frequency.value=0.1;
  const lfoGain=ac.createGain(); lfoGain.gain.value=7;
  lfo.connect(lfoGain); lfoGain.connect(oscA.frequency);
  oscA.connect(gA); oscB.connect(gB); oscC.connect(gC);
  gA.connect(master); gB.connect(master); gC.connect(master);
  oscA.start(); oscB.start(); oscC.start(); lfo.start();
  master.gain.linearRampToValueAtTime(0.045, ac.currentTime+3);
  _rwAmbient={ master, oscA, oscB, oscC, gC, lfo, ac };
  updateAmbient();
}
function stopAmbient(){
  if(!_rwAmbient) return;
  const { master, oscA, oscB, oscC, lfo, ac }=_rwAmbient;
  try{ master.gain.cancelScheduledValues(ac.currentTime); master.gain.linearRampToValueAtTime(0.0001, ac.currentTime+1.2);
    [oscA,oscB,oscC,lfo].forEach(o=>{ try{o.stop(ac.currentTime+1.3);}catch(e){} }); }catch(e){}
  _rwAmbient=null;
}
function updateAmbient(){
  if(!_rwAmbient) return;
  const c=getChar();
  const hpPct=c.hp.max>0?c.hp.current/c.hp.max:1;
  const auraPct=c.aura.max>0?c.aura.current/c.aura.max:1;
  const low=Math.min(hpPct,auraPct);
  const tension=1-low;
  const ac=_rwAmbient.ac;
  try{
    _rwAmbient.gC.gain.linearRampToValueAtTime(0.03+tension*0.15, ac.currentTime+1.5);
    _rwAmbient.lfo.frequency.linearRampToValueAtTime(0.1+tension*0.5, ac.currentTime+1.5);
  }catch(e){}
}
let _rwHeartbeat=null;
function applyHeartbeat(){
  const c=getChar();
  const hpPct=c.hp.max>0?c.hp.current/c.hp.max:1;
  const critical=c.hp.max>0&&hpPct>0&&hpPct<=0.25;
  if(critical&&!_rwHeartbeat){
    document.body.classList.add('heartbeat-active');
    const beat=()=>{
      pulseHeartbeatVisual();
      if(_rwSfxOn) heartbeatSound();
      const cc=getChar(); const p=cc.hp.max>0?cc.hp.current/cc.hp.max:1;
      _rwHeartbeat=setTimeout(beat, 600+Math.max(0,p/0.25)*600);
    };
    beat();
  } else if(!critical&&_rwHeartbeat){
    clearTimeout(_rwHeartbeat); _rwHeartbeat=null;
    document.body.classList.remove('heartbeat-active');
  }
}
function pulseHeartbeatVisual(){
  let o=document.getElementById('heartbeatOverlay');
  if(!o){ o=document.createElement('div'); o.id='heartbeatOverlay'; document.body.appendChild(o); }
  o.classList.remove('thump'); void o.offsetWidth; o.classList.add('thump');
}
function heartbeatSound(){
  const ac=_rwac(); if(!ac) return;
  const t=ac.currentTime;
  const thump=(when)=>{
    const o=ac.createOscillator(), g=ac.createGain();
    o.type='sine'; o.frequency.setValueAtTime(64,when); o.frequency.exponentialRampToValueAtTime(36,when+0.12);
    g.gain.setValueAtTime(0,when); g.gain.linearRampToValueAtTime(0.08,when+0.01); g.gain.exponentialRampToValueAtTime(0.0001,when+0.18);
    o.connect(g); g.connect(ac.destination); o.start(when); o.stop(when+0.2);
  };
  thump(t); thump(t+0.16);
}
let _knockUnsub=null, _knockLoadTs=Date.now();
async function sendKnock(){
  const c=getChar(); const who=c.name||'A Hunter';
  try{ await setDoc(doc(db,'rwby-meta','knock'),{ by:who, ts:Date.now() });
    showToast('Signal sent to the Headmaster','success'); }
  catch(e){ showToast('Could not send signal','warn'); }
}
function startKnockListener(){
  if(_knockUnsub) _knockUnsub();
  _knockUnsub=onSnapshot(doc(db,'rwby-meta','knock'), snap=>{
    if(!snap.exists()) return;
    const d=snap.data();
    if(!d.ts||d.ts<=_knockLoadTs) return;
    _knockLoadTs=d.ts;
    if(dmUnlocked) showKnockAlert(d.by||'A Hunter');
  }, ()=>{});
}
function showKnockAlert(who){
  const a=document.createElement('div');
  a.className='knock-alert';
  a.innerHTML=`<span class="knock-icon">✋</span><span class="knock-text"><strong>${esc(who)}</strong> is requesting your attention</span>`;
  document.body.appendChild(a);
  setTimeout(()=>{ a.classList.add('out'); setTimeout(()=>a.remove(),400); }, 5000);
}
function toggleAudio(){
  _rwSfxOn=!_rwSfxOn;
  localStorage.setItem('rwby-sfx', _rwSfxOn?'1':'0');
  const b=document.getElementById('audioToggle');
  if(b){ b.classList.toggle('off',!_rwSfxOn); b.textContent=_rwSfxOn?'♪ Audio':'♪ Audio Off'; }
  if(_rwSfxOn) startAmbient(); else stopAmbient();
}

let _prevHp = null, _prevAura = null, _prevResChar = null;
let _auraBreakChar = null; // id of the char whose break we last showed (avoid repeats)

// ================================================================
// COMMENDATIONS — DM-granted achievements (RWBY-themed)
// ================================================================
const COMMENDATIONS = [
  // ── INITIATE ──
  { id:'aura_unlocked',   icon:'✶', name:'Aura Unlocked',        tier:'initiate', desc:'Awakened your Aura for the first time.' },
  { id:'semblance_awoken',icon:'❂', name:'Semblance Awakened',   tier:'initiate', desc:'Manifested your Semblance under pressure.' },
  { id:'first_hunt',      icon:'⚔', name:'First Hunt',           tier:'initiate', desc:'Completed your first official mission.' },
  { id:'initiation',      icon:'⛰', name:'Survived Initiation',  tier:'initiate', desc:'Made it through the Emerald Forest initiation.' },
  { id:'team_formed',     icon:'❖', name:'Team Assembled',       tier:'initiate', desc:'Formed or joined a Huntsman team.' },
  { id:'first_blood',     icon:'⚐', name:'First Blood',          tier:'initiate', desc:'Scored your team\u2019s first kill in a real fight.' },
  { id:'weapon_forged',   icon:'⚒', name:'Forged in Steel',      tier:'initiate', desc:'Crafted or customized your signature weapon.' },
  { id:'combat_school',   icon:'✎', name:'Combat School Grad',   tier:'initiate', desc:'Graduated from a combat school (Signal, Sanctum, etc.).' },
  // ── FIELD ──
  { id:'grimm_slayer',    icon:'☠', name:'Grimm Slayer',         tier:'field',    desc:'Slew 25 creatures of Grimm.' },
  { id:'nevermore',       icon:'⩜', name:'Nevermore Down',       tier:'field',    desc:'Brought down a Giant Nevermore.' },
  { id:'deathstalker',    icon:'⦂', name:'Deathstalker Bane',    tier:'field',    desc:'Defeated a Deathstalker in close combat.' },
  { id:'aura_break',      icon:'✷', name:'Through the Break',    tier:'field',    desc:'Kept fighting after your Aura shattered.' },
  { id:'flawless_op',     icon:'✦', name:'Flawless Operation',   tier:'field',    desc:'Completed a mission without taking damage.' },
  { id:'protector',       icon:'⛨', name:'Protector',            tier:'field',    desc:'Took a fatal blow meant for a teammate.' },
  { id:'dust_master',     icon:'❉', name:'Dust Maven',           tier:'field',    desc:'Mastered combat application of every Dust type.' },
  { id:'semblance_master',icon:'❃', name:'Semblance Mastery',    tier:'field',    desc:'Fully evolved your Semblance to its ascended form.' },
  { id:'beast_master',    icon:'❦', name:'Beast Whisperer',      tier:'field',    desc:'Tamed or bonded with a dangerous creature.' },
  { id:'pack_hunter',     icon:'⛓', name:'Pack Hunter',          tier:'field',    desc:'Cleared an entire pack of Beowolves solo.' },
  { id:'night_op',        icon:'☾', name:'Night Operative',      tier:'field',    desc:'Completed a covert mission undetected.' },
  { id:'medic',           icon:'✚', name:'Field Medic',          tier:'field',    desc:'Saved a teammate from the brink of death.' },
  { id:'dust_smith',      icon:'✤', name:'Dust Artificer',       tier:'field',    desc:'Engineered a new Dust application or hybrid round.' },
  // ── ELITE ──
  { id:'team_leader',     icon:'♛', name:'Team Leader',          tier:'elite',    desc:'Led your team to victory as appointed leader.' },
  { id:'tournament',      icon:'⚑', name:'Vytal Champion',       tier:'elite',    desc:'Won a match in the Vytal Festival Tournament.' },
  { id:'breach_hero',     icon:'⊛', name:'Breach Hero',          tier:'elite',    desc:'Held the line during a Grimm breach of the city.' },
  { id:'huntsman',        icon:'★', name:'Licensed Huntsman',    tier:'elite',    desc:'Earned a full Huntsman/Huntress license.' },
  { id:'s_class',         icon:'✪', name:'Apex Hunter',          tier:'elite',    desc:'Recognized among the most elite Hunters of your generation.' },
  { id:'goliath',         icon:'⬢', name:'Goliath Felled',       tier:'elite',    desc:'Took down an ancient Goliath \u2014 a feat few survive.' },
  { id:'kingdom_shield',  icon:'⛉', name:'Shield of the Kingdom',tier:'elite',    desc:'Defended a Kingdom from catastrophe.' },
  { id:'maiden_touched',  icon:'❈', name:'Maiden\u2019s Favor',  tier:'elite',    desc:'Blessed with a fragment of a Maiden\u2019s power.' },
  { id:'silver_eyes',     icon:'◉', name:'Silver-Eyed Warrior',  tier:'elite',    desc:'Unleashed the legendary power of the silver eyes.' },
  // ── LEGEND ──
  { id:'last_stand',      icon:'☩', name:'Last Stand',           tier:'legend',   desc:'Sole survivor of a catastrophic operation.' },
  { id:'sacrifice',       icon:'✝', name:'Ultimate Sacrifice',   tier:'legend',   desc:'Gave everything to protect others. (Posthumous)' },
  { id:'wizard_saint',    icon:'☸', name:'Living Legend',        tier:'legend',   desc:'Your name is spoken across all four Kingdoms.' },
  { id:'godslayer',       icon:'☄', name:'Godslayer',            tier:'legend',   desc:'Struck down something that should not have been killable.' },
  { id:'relic_bearer',    icon:'❖', name:'Relic Bearer',         tier:'legend',   desc:'Entrusted with one of the four Relics of Remnant.' },
  // ── SACRED (radiant / divine) ──
  { id:'angels_herald',   icon:'✧', name:'Angel’s Herald',   tier:'sacred',   desc:'Chosen as the voice and blade of a higher power.' },
  { id:'seraphs_blessing',icon:'✺', name:'Seraph\u2019s Blessing',tier:'sacred',  desc:'Touched by radiant grace; wounds mend, light follows.' },
  { id:'holy_judgment',   icon:'✟', name:'Holy Judgment',        tier:'sacred',   desc:'Smote the wicked with sanctified power.' },
  { id:'guardian_angel',  icon:'⛧', name:'Guardian Angel',       tier:'sacred',   desc:'Shielded the innocent against impossible odds.' },
  { id:'ascendant',       icon:'⟁', name:'Ascendant',            tier:'sacred',   desc:'Transcended mortal limits, if only for a moment.' },
  { id:'martyr',          icon:'☦', name:'Hallowed Martyr',      tier:'sacred',   desc:'Died for a cause greater than yourself, and were remembered.' },
  { id:'divine_aegis',    icon:'❂', name:'Divine Aegis',         tier:'sacred',   desc:'Became an unbreakable bulwark of light.' },
  // ── CURSED (infernal / forbidden) ──
  { id:'devils_deal',     icon:'⛧', name:'Devil\u2019s Deal',     tier:'cursed',  desc:'Bargained with something infernal \u2014 and paid the price.' },
  { id:'demons_apostle',  icon:'⛥', name:'Demon\u2019s Apostle',  tier:'cursed',  desc:'Pledged yourself to a dark master and bear its mark.' },
  { id:'soul_eater',      icon:'☄', name:'Soul Eater',           tier:'cursed',   desc:'Consumed the essence of the fallen to grow stronger.' },
  { id:'hellforged',      icon:'⚿', name:'Hellforged',           tier:'cursed',   desc:'Wield a weapon tempered in cursed fire.' },
  { id:'blood_pact',      icon:'⛤', name:'Blood Pact',           tier:'cursed',   desc:'Sealed an oath in blood that cannot be broken.' },
  { id:'forbidden_power', icon:'☣', name:'Forbidden Power',      tier:'cursed',   desc:'Tapped a power no one was ever meant to wield.' },
  { id:'fallen',          icon:'⩩', name:'The Fallen',           tier:'cursed',   desc:'Turned from the light and embraced the dark.' },
  { id:'harbinger',       icon:'☠', name:'Harbinger of Ruin',    tier:'cursed',   desc:'Where you walk, devastation follows.' },
  { id:'damned',          icon:'⛧', name:'Damned Soul',          tier:'cursed',   desc:'Beyond salvation \u2014 and unstoppable because of it.' }
];
const COMMENDATION_BY_ID = Object.fromEntries(COMMENDATIONS.map(c=>[c.id,c]));
const COMMEND_TIERS = {
  initiate:{label:'Initiate', color:'#00d4ff'},
  field:   {label:'Field',    color:'#5ad17a'},
  elite:   {label:'Elite',    color:'#c2a23a'},
  legend:  {label:'Legend',   color:'#c0000a'},
  sacred:  {label:'Sacred',   color:'#ffe9a8'},
  cursed:  {label:'Cursed',   color:'#a020c0'}
};

function renderCommendations() {
  const c = getChar();
  const host = el('commendationsList'); if(!host) return;
  if(!Array.isArray(c.commendations)) c.commendations = [];
  if(!Array.isArray(c.feats)) c.feats = [];

  let html = '';
  if(c.feats.length){
    html += `<div class="feats-section-label">Awarded Feats</div><div class="feats-list">`;
    html += c.feats.map(f=>`
      <div class="feat-badge" title="${esc(f.desc||'')}">
        <span class="feat-icon">${esc(f.icon||'❖')}</span>
        <div class="feat-info">
          <span class="feat-name">${esc(f.name||'Feat')}</span>
          ${f.desc?`<span class="feat-desc">${esc(f.desc)}</span>`:''}
        </div>
      </div>`).join('');
    html += `</div>`;
  }

  if(c.commendations.length){
    html += `<div class="feats-section-label" style="margin-top:1.2rem">Legacy Commendations</div><div class="commendations-grid">`;
    html += c.commendations.map(id=>{
      const m = COMMENDATION_BY_ID[id]; if(!m) return '';
      const t = COMMEND_TIERS[m.tier]||COMMEND_TIERS.initiate;
      return `<div class="commend-badge tier-${m.tier}" title="${esc(m.desc)}" style="--ct:${t.color}">
        <span class="commend-icon">${m.icon}</span>
        <span class="commend-info"><span class="commend-name">${esc(m.name)}</span><span class="commend-tier">${t.label}</span></span>
      </div>`;
    }).join('');
    html += `</div>`;
  }

  if(!html){
    html = `<div class="commend-empty">No feats earned yet. They are granted by the Headmaster.</div>`;
  }
  host.innerHTML = html;
}

function renderDmCommendations() {
  const sel = el('commendTarget');
  if(sel){
    const cur = sel.value;
    sel.innerHTML = state.characters.map((c,i)=>`<option value="${i}">${esc(c.name||`Slot ${i+1}`)}</option>`).join('');
    if(cur && cur < state.characters.length) sel.value = cur;
    sel.onchange = ()=>renderDmCustomFeats();
  }
  renderDmCustomFeats();
}

function renderDmCustomFeats(){
  const host = el('dmFeatGranted'); if(!host) return;
  const idx = _dmTarget;
  const c = state.characters[idx];
  if(!c){ host.innerHTML = ''; return; }
  if(!Array.isArray(c.feats)) c.feats = [];
  if(!c.feats.length){
    host.innerHTML = `<div class="dm-feat-empty">No custom feats awarded to ${esc(c.name||'this character')} yet.</div>`;
    return;
  }
  host.innerHTML = c.feats.map(f=>`
    <div class="dm-feat-row">
      <span class="dm-feat-icon">${esc(f.icon||'❖')}</span>
      <div class="dm-feat-text"><span class="dm-feat-name">${esc(f.name||'Feat')}</span>${f.desc?`<span class="dm-feat-desc">${esc(f.desc)}</span>`:''}</div>
      <button class="dm-feat-del" data-fid="${esc(f.id)}" title="Revoke">✕</button>
    </div>`).join('');
  host.querySelectorAll('.dm-feat-del').forEach(b=> b.addEventListener('click', ()=> revokeFeat(idx, b.dataset.fid)));
}

function createCustomFeat(){
  if(!dmUnlocked) return;
  const idx = _dmTarget;
  const c = state.characters[idx]; if(!c) return;
  const name = el('featNameInput')?.value.trim();
  const desc = el('featDescInput')?.value.trim();
  const icon = el('featIconInput')?.value.trim() || '❖';
  if(!name){ showToast('Give the feat a name first', 'warn'); return; }
  if(!Array.isArray(c.feats)) c.feats = [];
  c.feats.push({ id:'f'+Date.now().toString(36)+Math.random().toString(36).slice(2,6), name, desc, icon, ts:Date.now() });
  if(el('featNameInput')) el('featNameInput').value = '';
  if(el('featDescInput')) el('featDescInput').value = '';
  if(el('featIconInput')) el('featIconInput').value = '';
  pushState(true); render();
  showToast(`❖ ${c.name||'Character'} earned the feat "${name}"`, 'success', 4000);
}

function revokeFeat(idx, fid){
  if(!dmUnlocked) return;
  const c = state.characters[idx]; if(!c || !Array.isArray(c.feats)) return;
  const f = c.feats.find(x=>x.id===fid);
  c.feats = c.feats.filter(x=>x.id!==fid);
  pushState(true); render();
  showToast(`Revoked "${f?f.name:'feat'}" from ${c.name||'character'}`, 'warn');
}

function grantCommendation(id){
  if(!dmUnlocked) return;
  const idx = _dmTarget;
  const c = state.characters[idx]; if(!c) return;
  if(!Array.isArray(c.commendations)) c.commendations = [];
  const m = COMMENDATION_BY_ID[id];
  if(c.commendations.includes(id)){
    c.commendations = c.commendations.filter(x=>x!==id);
    pushState(true); render();
    showToast(`Revoked "${m.name}" from ${c.name||'character'}`, 'warn');
  } else {
    c.commendations.push(id);
    pushState(true); render();
    showToast(`★ ${c.name||'Character'} earned "${m.name}"`, 'success', 4000);
  }
}

function checkResourceFlash(c) {
  // Track previous values per-character so switching sheets never mis-fires.
  if (_prevResChar !== c.id) {
    _prevResChar = c.id;
    _prevHp = c.hp.current; _prevAura = c.aura.current;
    if (c.aura.current > 0) _auraBreakChar = null; // allow a fresh break for this char
    return; // first look at this character — establish baseline, don't flash
  }
  if (_prevHp !== null && c.hp.current < _prevHp) flashBar('topHpBar', 'flash-damage');
  if (_prevHp !== null && c.hp.current > _prevHp) flashBar('topHpBar', 'flash-heal');
  if (_prevAura !== null && c.aura.current < _prevAura) flashBar('topAuraBar', 'flash-damage');
  if (_prevAura !== null && c.aura.current > _prevAura) flashBar('topAuraBar', 'flash-heal');
  // AURA BREAK: aura just shattered (crossed from >0 to 0 with a real max set)
  if (_prevAura !== null && _prevAura > 0 && c.aura.current === 0 && c.aura.max > 0) {
    triggerAuraBreak(c);
  }
  // reset the "shown" guard once aura is restored, so it can break again later
  if (c.aura.current > 0) _auraBreakChar = null;
  _prevHp = c.hp.current; _prevAura = c.aura.current;
}

// ── AURA BREAK SCREEN EFFECT ──
function triggerAuraBreak(c) {
  if (_auraBreakChar === c.id) return; // already shown for this break
  _auraBreakChar = c.id;
  const color = c.accentColor || c.auraColor || '#00d4ff';
  const ov = document.createElement('div');
  ov.className = 'aura-break-fx';
  ov.style.setProperty('--break-color', color);
  let shards = '';
  const N = 14;
  for (let i = 0; i < N; i++) {
    const ang = (360 / N) * i + (Math.random() * 18 - 9);
    const dist = 50 + Math.random() * 40;
    const delay = (Math.random() * 0.08).toFixed(2);
    const size = 30 + Math.random() * 60;
    shards += `<span class="ab-shard" style="--ang:${ang}deg;--dist:${dist}vmax;--sz:${size}px;--d:${delay}s"></span>`;
  }
  ov.innerHTML = `
    <div class="ab-flash"></div>
    <div class="ab-crack"></div>
    <div class="ab-ring"></div>
    <div class="ab-shards">${shards}</div>
    <div class="ab-label">AURA SHATTERED</div>
    <div class="ab-sub">${esc((c.name||'Agent').toUpperCase())} IS UNPROTECTED</div>`;
  document.body.appendChild(ov);
  try { playAuraBreakSound(); } catch(e){}
  setTimeout(()=> ov.remove(), 2200);
}

// synthesized glass-shatter + low boom (no audio files)
let _abAudioCtx = null;
function playAuraBreakSound(){
  try {
    _abAudioCtx = _abAudioCtx || new (window.AudioContext||window.webkitAudioContext)();
    const ac = _abAudioCtx; if(ac.state==='suspended') ac.resume();
    const t = ac.currentTime;
    const dur = 0.5;
    const buf = ac.createBuffer(1, ac.sampleRate*dur, ac.sampleRate);
    const d = buf.getChannelData(0);
    for(let i=0;i<d.length;i++){ d[i] = (Math.random()*2-1) * Math.pow(1 - i/d.length, 2.2); }
    const src = ac.createBufferSource(); src.buffer = buf;
    const hp = ac.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=2500;
    const g = ac.createGain(); g.gain.value=0.12;
    src.connect(hp); hp.connect(g); g.connect(ac.destination); src.start(t);
    const o = ac.createOscillator(), og = ac.createGain();
    o.type='sine'; o.frequency.setValueAtTime(140,t); o.frequency.exponentialRampToValueAtTime(40,t+0.4);
    og.gain.setValueAtTime(0.18,t); og.gain.exponentialRampToValueAtTime(0.0001,t+0.5);
    o.connect(og); og.connect(ac.destination); o.start(t); o.stop(t+0.55);
  } catch(e){}
}

function flashBar(id, cls) {
  const bar = el(id); if (!bar) return;
  bar.classList.remove('flash-damage','flash-heal');
  void bar.offsetWidth; // force reflow
  bar.classList.add(cls);
  setTimeout(() => bar.classList.remove(cls), 600);
}

// ================================================================
// #27 — LOW HP WARNING
// ================================================================
function checkLowHp(c) {
  const track = document.querySelector('.hud-hp .hud-bar-track');
  const fill  = el('topHpBar');
  if (!track || !fill) return;
  const pct = c.hp.max > 0 ? c.hp.current / c.hp.max : 1;
  if (pct <= 0.25 && c.hp.max > 0) {
    track.classList.add('low-hp');
    fill.classList.add('low-hp-fill');
  } else {
    track.classList.remove('low-hp');
    fill.classList.remove('low-hp-fill');
  }
}

// ================================================================
// #29 — FULLSCREEN MODE (hide sidebar)
// ================================================================
function bindFullscreen() {
  el('fullscreenBtn')?.addEventListener('click', () => {
    document.querySelector('.app')?.classList.toggle('sidebar-hidden');
    const btn = el('fullscreenBtn');
    const hidden = document.querySelector('.app')?.classList.contains('sidebar-hidden');
    if (btn) btn.textContent = hidden ? '◀ Show Sidebar' : '▶ Hide Sidebar';
  });
}

// ================================================================
// #31 — TOAST NOTIFICATIONS
// ================================================================
let _toastTimer = null;
function showToast(msg, type = 'info', duration = 3500) {
  let t = document.getElementById('toastEl');
  if (!t) {
    t = document.createElement('div'); t.id = 'toastEl';
    t.className = 'toast'; document.body.appendChild(t);
  }
  t.className = `toast toast-${type} show`;
  t.textContent = msg;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('show'), duration);
}
window.showToast = showToast;

// Hook into Firebase snapshot to show toasts for changes
let _toastPrevState = null;
function checkStateChanges(remote) {
  if (!_toastPrevState) { _toastPrevState = remote; return; }
  remote.characters.forEach((c, i) => {
    const prev = _toastPrevState.characters?.[i];
    if (!prev || !c.name) return;
    if (c.hp.current < prev.hp.current) {
      showToast(`${c.name} took ${prev.hp.current - c.hp.current} damage`, 'danger');
    } else if (c.hp.current > prev.hp.current) {
      showToast(`${c.name} healed ${c.hp.current - prev.hp.current} HP`, 'heal');
    }
    if (c.aura.current < prev.aura.current) {
      showToast(`${c.name} lost ${prev.aura.current - c.aura.current} Aura`, 'warn');
    }
    if (c.level > prev.level) {
      showToast(`⭐ ${c.name} leveled up to ${c.level}!`, 'success', 5000);
    }
  });
  _toastPrevState = remote;
}

// ================================================================
// #40 — WELCOME SCREEN
// ================================================================
function getMyCharacter() {
  return state.characters.find(c => c.claimedBy === MY_PRESENCE_ID) || null;
}

function isCharacterTaken(c) {
  if (!c.claimedBy) return false;
  return c.claimedBy !== MY_PRESENCE_ID;
}

// Release any character this browser currently holds.
// Watchers and DMs must NOT hold a claim — a stale claim from an earlier
// session is what used to drag them back onto a character.
function releaseMyClaim(push = true) {
  let changed = false;
  state.characters.forEach(ch => {
    if (ch.claimedBy === MY_PRESENCE_ID) { ch.claimedBy = ''; changed = true; }
  });
  try { localStorage.removeItem('rwby-my-idx'); } catch(e) {}
  if (changed && push) { try { pushState(true); } catch(e) {} }
  return changed;
}

function claimCharacter(realIdx) {
  const c = state.characters[realIdx];
  if (!c) return;
  // Release any previous claim by this browser
  state.characters.forEach(ch => { if (ch.claimedBy === MY_PRESENCE_ID) ch.claimedBy = ''; });
  c.claimedBy = MY_PRESENCE_ID;
  setViewIdx(realIdx);
  _relCollapsed.clear(); _relAllCollapsed = false;
  const rcab = el('relCollapseAllBtn'); if(rcab) rcab.textContent='⊟ Collapse All';
  localStorage.setItem('rwby-my-idx', realIdx); // shared with the Library for access gating
  pushState(true);
  pushPresence();
  render();
}

function checkWelcome() {
  // Returning spectators / DM skip the welcome entirely
  if (spectator) { applySpectatorMode(); return; }
  if (dmUnlocked) return;
  // Always show on page load — remove existing overlay if any
  document.getElementById('welcomeOverlay')?.remove();

  // Wait until we have real character data
  const activeChars = state.characters.filter(c => c.state === 'active' && c.name);
  if (!activeChars.length) return; // no named chars yet, snapshot will trigger us

  const overlay = document.createElement('div');
  overlay.id = 'welcomeOverlay';
  overlay.className = 'welcome-overlay';
  overlay.innerHTML = `
    <div class="welcome-inner">
      <div class="welcome-logo">RWBY DnD</div>
      <div class="welcome-sub">Homebrew · Remnant</div>
      <h2 class="welcome-title">Who are you?</h2>
      <p class="welcome-text">Choose your character each time you join. Taken characters are greyed out.</p>
      <div class="welcome-chars" id="welcomeCharList"></div>
      <div class="welcome-actions">
        <button class="neo-btn ghost" id="welcomeSkipBtn">I'm just watching</button>
        <button class="neo-btn welcome-dm-btn" id="welcomeDmBtn">⚔ Join as DM</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));

  function closeWelcome() {
    overlay.classList.remove('open');
    setTimeout(() => overlay.remove(), 400);
  }

  const list = document.getElementById('welcomeCharList');
  state.characters.forEach((c, realIdx) => {
    if (c.state !== 'active') return;
    const taken = isTakenByLiveOther(c);
    const btn = document.createElement('button');
    btn.className = `welcome-char-btn ${taken ? 'taken' : ''}`;
    btn.dataset.welcomeIdx = realIdx;
    btn.disabled = taken;
    btn.innerHTML = `
      ${c.portrait ? `<img src="${c.portrait}" class="welcome-portrait">` : `<div class="welcome-portrait-empty">${c.name ? c.name[0].toUpperCase() : '?'}</div>`}
      <span>${esc(c.name || `Player ${realIdx + 1}`)}</span>
      ${taken ? '<span class="taken-label">Taken</span>' : ''}`;
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      claimCharacter(realIdx);
      closeWelcome();
      showToast(`You are ${c.name} ✓`, 'success', 4000);
    });
    list.appendChild(btn);
  });

  document.getElementById('welcomeSkipBtn')?.addEventListener('click', () => {
    spectator = true;
    sessionStorage.setItem('rwby-spectator', '1');
    releaseMyClaim();          // a watcher holds no character
    closeWelcome();
    applySpectatorMode();
    render();
  });

  document.getElementById('welcomeDmBtn')?.addEventListener('click', () => {
    closeWelcome();
    openDmOverlay(); // opens the DM password prompt
  });
}

function recheckWelcomeIfNeeded() {
  // Re-point our LOCAL view to our claimed char if it drifted
  const mine = getMyCharacter();
  if (mine) {
    const idx = state.characters.indexOf(mine);
    if (idx >= 0 && getViewIdx() !== idx) setViewIdx(idx);
  }
}

// ================================================================
// INIT
// ================================================================
bindAll();
runBootSequence();
document.getElementById('knockBtn')?.addEventListener('click', sendKnock);
document.getElementById('audioToggle')?.addEventListener('click', toggleAudio);
startKnockListener();
buildDiceSkillButtons();
startGroupRollListener();
startWhisperListener();
el('groupRollBtn')?.addEventListener('click', startGroupRoll);
el('whisperBtn')?.addEventListener('click', sendWhisper);
el('createFeatBtn')?.addEventListener('click', createCustomFeat);
document.querySelectorAll('.atmo-btn[data-weather]').forEach(b=> b.addEventListener('click', ()=>setWeather(b.dataset.weather)));
document.querySelectorAll('.atmo-btn[data-scene]').forEach(b=> b.addEventListener('click', ()=>setSceneTime(b.dataset.scene)));
document.querySelectorAll('.atmo-btn[data-cct]').forEach(b=> b.addEventListener('click', ()=>{ if(!dmUnlocked) return; state.cctOnline = b.dataset.cct==='on'; pushState(true); renderScroll(); showToast(state.cctOnline?'CCT network online':'CCT network down','info'); }));
el('diceFab')?.addEventListener('click', toggleDicePanel);
el('scrollFab')?.addEventListener('click', toggleScroll);
el('scrollClose')?.addEventListener('click', toggleScroll);
document.querySelectorAll('.scroll-tab').forEach(b=> b.addEventListener('click', ()=>setScrollTab(b.dataset.stab)));
el('diceClose')?.addEventListener('click', toggleDicePanel);
el('diceCustomRoll')?.addEventListener('click', rollCustom);
el('diceCustomInput')?.addEventListener('keydown', e=>{ if(e.key==='Enter') rollCustom(); });
document.querySelectorAll('.dice-mode-btn').forEach(b=> b.addEventListener('click', ()=>setDiceMode(b.dataset.mode)));
document.querySelectorAll('.dice-quick-d').forEach(b=> b.addEventListener('click', ()=>{ showDiceResult('d'+b.dataset.d, parseDiceExpr('1d'+b.dataset.d)); }));

// roll feed: tab switching
document.querySelectorAll('.drt-btn').forEach(b=> b.addEventListener('click', ()=>{
  document.querySelectorAll('.drt-btn').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  const showFeed = b.dataset.drt === 'table';
  const mine = el('diceResultArea'), feed = el('rollFeedList');
  if(mine) mine.style.display = showFeed ? 'none' : '';
  if(feed) feed.style.display = showFeed ? '' : 'none';
  if(showFeed) renderRollFeed();
}));
el('rollFeedClear')?.addEventListener('click', clearRollFeed);

// compass: add artifact (DM only)
el('addCompassBtn')?.addEventListener('click', ()=>{
  if(!canEditCompass()) return;
  const c = getChar();
  if(!Array.isArray(c.compass)) c.compass = [];
  pushUndo(`Added artifact to ${c.name||'player'}`);
  const a = COMPASS_BLANK();
  c.compass.push(a);
  pushState(true); renderCompass();
  openArtifactSheet(a.id);
});

// bestiary: add creature (DM only) + live filter — always targets the
// collection currently open in the player-side Bestiary tab.
el('addBeastBtn')?.addEventListener('click', ()=>{
  if(!canEditBestiary()) return;
  const bx = activeBestiary();
  if(!bx){ showToast('Create a collection in the DM Panel first', 'warn'); return; }
  pushUndo(`Added creature to ${bx.name}`);
  const stats = {}; const bonuses = {}; STATS.forEach(s=> { stats[s] = 10; bonuses[s] = 0; });
  bx.entries.push({
    id: 'beast-' + Date.now(),
    name:'', image:'', stats, bonuses, special:'', tamer:'', notes:''
  });
  _bestiaryFilter = '';
  const sb = el('bestiarySearch'); if(sb) sb.value = '';
  pushState(true); renderBestiary();
  // Open the sheet on the new entry so the DM starts editing immediately
  openBeastSheet(bx.id, bx.entries.length - 1);
});
el('bestiarySearch')?.addEventListener('input', e=>{ _bestiaryFilter = e.target.value||''; renderBestiary(); });

// inventory + shop live filters
el('invSearch')?.addEventListener('input', e=>{ _invFilter = e.target.value||''; renderInventory(); });
el('shopSearch')?.addEventListener('input', e=>{ _shopFilter = e.target.value||''; renderShop(); });
startRollFeed();
// keep relative timestamps fresh while the feed is visible
setInterval(()=>{ if(el('rollFeedList')?.style.display !== 'none') renderRollFeed(); }, 30000);
(function(){ const b=document.getElementById('audioToggle'); if(b&&!_rwSfxOn){ b.classList.add('off'); b.textContent='♪ Audio Off'; } })();
document.addEventListener('click', ()=>{ if(_rwSfxOn) startAmbient(); }, { once:true });
initPortrait();
bindDeathSaves();
bindBroadcast();
bindGrant();
bindRelationships();
bindWeapons();
bindInventory();
bindAccentColor();
bindNotesLibrary();
bindFullscreen();
render();
if (spectator) applySpectatorMode();

// ── MIGRATION: rwby-chars → campaigns/rwby-campaign ──
async function migrateIfNeeded() {
  try {
    // Check if new doc already exists
    const mainSnap = await getDoc(doc(db, 'campaigns', 'rwby-campaign'));
    if (mainSnap.exists()) {
      console.log('campaigns/rwby-campaign exists, no migration needed');
      startListener();
      return;
    }

    console.log('campaigns/rwby-campaign not found — checking rwby-chars...');
    // Read from old collection using already-imported getDocs + collection
    const oldSnap = await getDocs(collection(db, 'rwby-chars'));

    if (!oldSnap.empty) {
      console.log(`Found ${oldSnap.size} docs in rwby-chars — migrating...`);
      const chars = [];
      oldSnap.forEach(d => {
        try {
          const parsed = JSON.parse(d.data().data);
          chars.push(parsed);
        } catch(e) {
          console.warn('Could not parse char doc:', d.id, e);
        }
      });

      if (chars.length) {
        // Sort by document id (they encode the index)
        chars.sort((a, b) => (a.id || '').localeCompare(b.id || ''));

        // Build proper state
        state.characters = chars.map((c, i) => {
          const b = blankChar(i);
          return {
            ...b, ...c,
            stats:  { ...b.stats,  ...(c.stats  || {}) },
            hp:     { ...b.hp,     ...(c.hp     || {}) },
            aura:   { ...b.aura,   ...(c.aura   || {}) },
            skills: (() => {
              const bsk = makeBlankSkills();
              Object.keys(bsk).forEach(n => { bsk[n] = { ...bsk[n], ...(c.skills?.[n] || {}) }; });
              return bsk;
            })()
          };
        });

        await setDoc(doc(db, 'campaigns', 'rwby-campaign'), { data: JSON.stringify(state) });
        console.log(`✓ Migrated ${chars.length} characters from rwby-chars to campaigns/rwby-campaign`);
        render();
      } else {
        console.log('rwby-chars was empty, starting fresh');
      }
    } else {
      console.log('rwby-chars collection not found or empty, starting fresh');
    }
  } catch(e) {
    console.error('Migration failed:', e);
  }
  // Always start listener after migration attempt
  startListener();
}
migrateIfNeeded();

startPresenceListener();
startBroadcastListener();
startThreatListener();
startCurseListener();
pushPresence();

// ── CLEANUP ON TAB CLOSE ──
window.addEventListener('beforeunload', () => {
  if (_pushDebounce) {
    clearTimeout(_pushDebounce);
    const hasData = state.characters.some(c => c.name && c.name.trim());
    if (hasData) setDoc(doc(db, 'campaigns', 'rwby-campaign'), { data: JSON.stringify(state) }).catch(()=>{});
  }
  deleteDoc(doc(db, 'rwby-presence', MY_PRESENCE_ID)).catch(()=>{});
});
if (dmUnlocked) {
  // Restore DM rights on reload, but land on the SHEET (closed view), not the
  // full page. The ⚔ return button is available to open the page when wanted.
  document.querySelector('.dm-nav-btn[data-dm-tab="players"]')?.classList.add('active');
  document.querySelector('.dm-tab[data-dm-tab="players"]')?.classList.add('active');
  applyDmView('closed');
  renderDmSemblance(); renderDmTechniques(); renderDmTargetSelect(); renderCurseTargetSelect(); renderThemeFields();
}
// Welcome is triggered by the snapshot handler once real data loads

// ── MOBILE SIDEBAR TOGGLE ──
(function() {
  const btn = document.getElementById('sidebarToggle');
  const sb  = document.querySelector('.sidebar');
  if (!btn || !sb) return;
  btn.addEventListener('click', () => sb.classList.toggle('open'));
  document.addEventListener('click', e => {
    if (sb.classList.contains('open') && !sb.contains(e.target) && e.target !== btn) {
      sb.classList.remove('open');
    }
  });
})();



