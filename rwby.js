// ============================================================
// RWBY DnD — rwby.js
// Full auto-calculations: proficiency, skills, saves, initiative,
// passive perception, attack bonuses, Uncanny Dodge
// Firebase Firestore sync — no import/export needed
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getFirestore, doc, collection, getDoc, onSnapshot, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

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
const DM_PASS   = '123456789';
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

// Proficiency bonus from level (standard D&D scale)
function profBonus(level) {
  const l = Number(level) || 1;
  return Math.ceil(l / 4) + 1; // Lv1-4→+2, 5-8→+3, 9-12→+4, 13-16→+5, 17-20→+6
}

// Skill total = stat mod + (proficiency if proficient) + extra bonus
function skillTotal(c, skillName) {
  const def  = SKILL_DEFS.find(s => s.name === skillName);
  if (!def) return 0;
  const statM = mod(c.stats[def.stat] || 10);
  const sk    = c.skills[skillName] || {prof:false, expertise:false, bonus:0};
  const pb    = profBonus(c.level);
  let total   = statM + Number(sk.bonus || 0);
  if (sk.expertise) total += pb * 2;
  else if (sk.prof)  total += pb;
  return total;
}

// Passive Perception = 10 + Perception total
function passivePerception(c) {
  const pb     = getEffectivePB(c);
  const wisMod = mod(c.stats.WIS);
  const sk     = c.skills['Perception'] || {bonus:0};
  return 10 + pb + wisMod + (Number(sk.bonus)||0);
}

// Initiative = DEX mod + any manual bonus stored in c.initiativeBonus
function calcInitiative(c) { return mod(c.stats.DEX) + Number(c.initiativeBonus || 0); }

// Attack bonus = chosen stat mod + proficiency
function attackBonus(c) { return mod(c.stats[c.attackStat || 'STR']) + profBonus(c.level); }

// Spell DC = 8 + proficiency + INT mod (Aura Mastery → INT)
function spellDC(c) { return 8 + profBonus(c.level) + mod(c.stats.INT); }

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
window.applyDamage = () => {
  const inp = document.getElementById('damageTaken');
  const dmg = parseInt(inp?.value);
  if (!dmg || dmg <= 0) { alert('Enter a damage amount.'); return; }
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
    name:'', race:'', className:'', age:'', level:1, background:'',
    semblanceName:'', weaponName:'',
    portrait: '',
    accentColor: '',   // #21/#23 — per-character color
    profBonusOverride: null,
    attackStat: 'STR', initiativeBonus: 0,
    state: i < 4 ? 'active' : 'reserve',
    stats: {STR:10,DEX:10,CON:10,INT:10,WIS:10,CHA:10},
    skills: makeBlankSkills(),
    hp:{current:0,max:0}, aura:{current:0,max:0},
    armor:0, speed:'30 ft', tempHp:0,
    deathSaves: {successes:0, failures:0, stable:false},
    weaponsText:'', abilitiesText:'', inventoryText:'', notesText:'',
    relationships: [],   // #21 — [{name, type, notes}]
    dustInventory: dust, dustSpells:[], techniques:[],
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
  characters:[blankChar(0),blankChar(1),blankChar(2),blankChar(3)]
};

let state  = structuredClone(DEF_STATE);
let _unsub = null;
let _welcomeShown = false; // shows once per page load after data arrives
let dmUnlocked = sessionStorage.getItem('rwby-dm') === '1';


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
      tab: state.selectedCharacter, ts: Date.now()
    });
  } catch(e) {}
}
function startPresenceListener() {
  if (_presenceUnsub) _presenceUnsub();
  _presenceUnsub = onSnapshot(collection(db, 'rwby-presence'), snap => {
    const now = Date.now();
    const active = [];
    snap.forEach(d => {
      const p = d.data();
      if (now - p.ts < 35000) {
        active.push(p);
      } else {
        // Auto-purge stale presence docs (older than 35s with no heartbeat)
        deleteDoc(doc(db, 'rwby-presence', d.id)).catch(()=>{});
      }
    });
    renderPresence(active);
  }, ()=>{});
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

// ── BROADCAST (DM message to all) ──
async function sendBroadcast(msg) {
  if (!msg.trim()) return;
  await setDoc(doc(db,'rwby-meta','broadcast'),{msg, ts:Date.now(), from:'DM'});
}
let _broadcastUnsub = null;
let _lastBroadcastTs = 0;
function startBroadcastListener() {
  if (_broadcastUnsub) _broadcastUnsub();
  _broadcastUnsub = onSnapshot(doc(db,'rwby-meta','broadcast'), snap => {
    if (!snap.exists()) return;
    const d = snap.data();
    if (d.ts > _lastBroadcastTs) {
      _lastBroadcastTs = d.ts;
      showBroadcast(d.msg);
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
  banner.innerHTML = `<span class="broadcast-from">📡 DM:</span> ${esc(msg)} <button onclick="this.parentElement.remove()">×</button>`;
  banner.classList.add('show');
  clearTimeout(banner._t);
  banner._t = setTimeout(()=>banner.remove(), 12000);
}

let _pushDebounce = null;
async function pushState(immediate = false) {
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

function startListener() {
  if (_unsub) _unsub();
  _unsub = onSnapshot(doc(db, 'campaigns', 'rwby-campaign'), snap => {
    if (!snap.exists()) return;
    try {
      const remote = normalize(JSON.parse(snap.data().data));
      checkStateChanges(remote);  // #31 toasts
      remote.characters.forEach((rc, i) => { state.characters[i] = rc; });
      while (state.characters.length < remote.characters.length)
        state.characters.push(remote.characters[state.characters.length]);
      state.theme = remote.theme;
      setSyncDot('synced');
      try { renderCharacterTabs(); } catch(e) {}
      try { renderHeader();        } catch(e) {}
      try { applyTheme();          } catch(e) {}
      try { renderMainFields();    } catch(e) {}
      try { renderCalcPanel();     } catch(e) {}
      try { renderStats();         } catch(e) {}
      try { renderSkillsMatrix();  } catch(e) {}
      try { renderSemblance();     } catch(e) {}
      try { renderTechniques();    } catch(e) {}
      try { renderDust();          } catch(e) {}
      try { applyCharacterAccents(); } catch(e) {}
      try { checkLowHp(getChar()); }   catch(e) {}
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
  // Ensure all theme values are hex strings
  Object.keys(DEF_THEME).forEach(k => {
    if (!m.theme[k] || typeof m.theme[k] !== 'string' || !m.theme[k].startsWith('#')) {
      m.theme[k] = DEF_THEME[k];
    }
  });
  m.characters = (raw?.characters?.length ? raw.characters : DEF_STATE.characters).map((c,i) => {
    const b = blankChar(i);
    const mc = {...b, ...c};
    mc.stats    = {...b.stats,    ...(c.stats    || {})};
    mc.hp       = {...b.hp,       ...(c.hp       || {})};
    mc.aura     = {...b.aura,     ...(c.aura     || {})};
    mc.dustInventory = {...b.dustInventory, ...(c.dustInventory || {})};
    mc.dustSpells    = Array.isArray(c.dustSpells)  ? c.dustSpells  : [];
    mc.techniques    = Array.isArray(c.techniques)  ? c.techniques  : [];
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
  return m;
}

// ================================================================
// HELPERS
// ================================================================
// Who you are VIEWING
function getChar() {
  // DM can view/edit whoever is selected
  if (dmUnlocked) return state.characters[state.selectedCharacter] || state.characters[0];
  // Players are locked to their OWN claimed character — can't edit anyone else
  const mine = state.characters.find(c => c.claimedBy === MY_PRESENCE_ID);
  if (mine) return mine;
  // Not claimed yet (observer/pre-welcome) — show selected but it'll be read-only
  return state.characters[state.selectedCharacter] || state.characters[0];
}
function isViewingOwnCharacter() {
  if (dmUnlocked) return true;
  const mine = state.characters.find(c => c.claimedBy === MY_PRESENCE_ID);
  return !!mine;
}
function clamp(v,a,b)  { return Math.max(a, Math.min(b, v)); }
function rollD10()     { return Math.floor(Math.random() * 10) + 1; }
function esc(s)        { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function ensureClamp(c) {
  c.hp.max    = Math.max(0, Number(c.hp.max)    || 0);
  c.aura.max  = Math.max(0, Number(c.aura.max)  || 0);
  c.hp.current   = clamp(Number(c.hp.current)   || 0, 0, c.hp.max);
  c.aura.current = clamp(Number(c.aura.current) || 0, 0, c.aura.max);
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
  const con = mod(c.stats.CON);

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
        <div class="calc-label">Aura DC</div>
        <div class="calc-value aura">${dc}</div>
        <div class="calc-sub">8+Prof+INT</div>
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
  state.characters.forEach((c,i) => {
    if (c.state==='dead'    && !state.showDead)    return;
    if (c.state==='reserve' && !state.showReserve) return;
    const pct    = c.hp.max > 0 ? Math.round((c.hp.current/c.hp.max)*100) : 0;
    const isOwn  = c.claimedBy === MY_PRESENCE_ID;
    const isSel  = i === state.selectedCharacter;
    const takenByOther = c.claimedBy && c.claimedBy !== MY_PRESENCE_ID;
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
      <span>${esc(c.className||'—')} · Lv${c.level}${c.race?' · '+esc(c.race):''}</span>
      <div class="tab-hp-bar"><div class="tab-hp-fill" style="width:${pct}%;background:${hpColor};box-shadow:0 0 6px ${hpColor}60"></div></div>`;
    // Only the DM can switch which character is displayed.
    // Players are locked to their own claimed character.
    if (dmUnlocked) {
      btn.addEventListener('click', ()=>{ state.selectedCharacter=i; render(); });
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
  s('selectedState', c.state.charAt(0).toUpperCase()+c.state.slice(1));
  s('selectedAscendedStatus', c.semblance.unlocked.ascended ? 'Unlocked' : 'Locked');
  s('selectedTechniqueCount', c.techniques.length);
  s('topHpMini',   `${c.hp.current} / ${c.hp.max}`);
  s('topAuraMini', `${c.aura.current} / ${c.aura.max}`);
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
  const sv = (id,v) => { const e=el(id); if(e) e.value=v??''; };
  sv('charName',c.name);sv('charLevel',c.level);sv('charRace',c.race);sv('charClass',c.className);
  sv('charAge',c.age);sv('charBackground',c.background);sv('charSemblanceName',c.semblanceName);
  sv('charWeaponName',c.weaponName||'');
  sv('currentHp',c.hp.current);sv('maxHp',c.hp.max);
  sv('currentAura',c.aura.current);sv('maxAura',c.aura.max);
  sv('armor',c.armor);sv('speed',c.speed);sv('tempHp',c.tempHp||0);
  sv('weaponsText',c.weaponsText);sv('abilitiesText',c.abilitiesText);
  sv('inventoryText',c.inventoryText);sv('notesText',c.notesText);
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
// RENDER — ABILITY SCORES
// ================================================================
function renderStats() {
  const c = getChar(); const g = el('statsGrid'); if(!g) return; g.innerHTML='';
  STATS.forEach(stat => {
    const score = c.stats[stat]; const m = mod(score);
    const card = document.createElement('div'); card.className='stat-card';
    card.innerHTML = `
      <div class="stat-key">${stat}</div>
      <input class="stat-score-input" data-stat="${stat}" type="number" value="${score}">
      <div class="stat-mod">${fmtMod(m)}</div>
      <div class="stat-controls">
        <button type="button" data-stat="${stat}" data-action="minus">−</button>
        <button type="button" data-stat="${stat}" data-action="plus">+</button>
      </div>`;
    g.appendChild(card);
  });
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
    const statM = mod(c.stats[stat]);
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
function renderDust() {
  const c = getChar(); const g = el('dustInventoryGrid'); if(!g) return; g.innerHTML='';
  DUST_TYPES.forEach(type => {
    const card = document.createElement('div'); card.className=`dust-card ${DUST_CLASS[type]}`;
    card.innerHTML = `<label>${type}</label><input type="number" min="0" data-dust="${type}" value="${c.dustInventory[type]||0}">`;
    g.appendChild(card);
  });
  g.querySelectorAll('input[data-dust]').forEach(inp => inp.addEventListener('input', e => {
    c.dustInventory[e.target.dataset.dust] = Math.max(0, Number(e.target.value)||0); pushState();
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
  const c = getChar(); const g = el('semblanceDmGrid'); if(!g) return; g.innerHTML='';
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

function renderTabs() {
  document.querySelectorAll('.tab-btn[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab===state.activeTab));
  document.querySelectorAll('.tab-content[data-tab]').forEach(t => t.classList.toggle('active', t.dataset.tab===state.activeTab));
}

// ================================================================
// MASTER RENDER
// ================================================================
function render() {
  try { applyTheme(); } catch(e) { console.error('applyTheme:', e); }
  const c = getChar(); ensureClamp(c);
  try { renderCharacterTabs(); }   catch(e) { console.error('renderCharacterTabs:', e); }
  try { renderHeader(); }          catch(e) { console.error('renderHeader:', e); }
  try { renderMainFields(); }      catch(e) { console.error('renderMainFields:', e); }
  try { renderPortrait(c); }       catch(e) {}
  try { renderDeathSaves(c); }     catch(e) {}
  try { renderRelationships(); }   catch(e) {}
  try { renderAccentColor(); }     catch(e) {}
  try { applyCharacterAccents(); } catch(e) {}
  try { checkResourceFlash(c); }   catch(e) {}
  try { checkLowHp(c); }           catch(e) {}
  try { renderCalcPanel(); }       catch(e) { console.error('renderCalcPanel:', e); }
  try { renderStats(); }           catch(e) { console.error('renderStats:', e); }
  try { renderSkillsMatrix(); }    catch(e) { console.error('renderSkillsMatrix:', e); }
  try { renderSemblance(); }       catch(e) { console.error('renderSemblance:', e); }
  try { renderTechniques(); }      catch(e) { console.error('renderTechniques:', e); }
  try { renderDust(); }            catch(e) { console.error('renderDust:', e); }
  try { renderDmSemblance(); }     catch(e) { console.error('renderDmSemblance:', e); }
  try { renderDmTechniques(); }    catch(e) { console.error('renderDmTechniques:', e); }
  try { renderDmTargetSelect(); }  catch(e) { console.error('renderDmTargetSelect:', e); }
  try { renderGrantTargetSelect(); }catch(e) {}
  try { renderThemeFields(); }     catch(e) { console.error('renderThemeFields:', e); }
  try { renderTabs(); }            catch(e) { console.error('renderTabs:', e); }
  try { pushPresence(); }          catch(e) {}
}

// ================================================================
// ACTIONS
// ================================================================
function adjustResource(res, amt) {
  const c = getChar();
  if (res==='hp')   c.hp.current   = clamp(c.hp.current   + amt, 0, c.hp.max);
  if (res==='aura') c.aura.current = clamp(c.aura.current + amt, 0, c.aura.max);
  pushState(true); renderHeader(); renderMainFields(); renderCharacterTabs();
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
  const c = getChar(); const conM = mod(c.stats.CON); const roll = rollD10();
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
function createTechnique() {
  const name  = el('dmTechName')?.value.trim();
  const type  = el('dmTechType')?.value.trim();
  const desc  = el('dmTechDescription')?.value.trim();
  const level = Number(el('dmTechLevel')?.value) || 1;
  const cost  = Number(el('dmTechCost')?.value)  || 0;
  const ti    = Number(el('dmTechTarget')?.value ?? state.selectedCharacter);
  if (!name||!type||!desc) { alert('Fill out all technique fields.'); return; }
  const target = state.characters[ti]; if(!target) { alert('No target found.'); return; }
  target.techniques.push({id:`tech-${Date.now()}`,name,level,cost,type,description:desc});
  ['dmTechName','dmTechLevel','dmTechCost','dmTechType','dmTechDescription'].forEach(id=>{const e=el(id);if(e)e.value='';});
  pushState(true); render();
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
  el('dmOverlay')?.classList.remove('hidden');
  if (!dmUnlocked) {
    el('dmLoginPanel')?.classList.remove('hidden'); el('dmFullscreenPanel')?.classList.add('hidden');
    const p=el('dmPasswordInput'); if(p){p.value='';p.focus();}
  } else {
    el('dmLoginPanel')?.classList.add('hidden'); el('dmFullscreenPanel')?.classList.remove('hidden');
    renderDmSemblance(); renderDmTechniques(); renderDmTargetSelect(); renderThemeFields();
  }
}
function closeDmOverlay() { el('dmOverlay')?.classList.add('hidden'); }
function lockDm()   {
  dmUnlocked=false;
  sessionStorage.removeItem('rwby-dm');
  el('dmFullscreenPanel')?.classList.add('hidden'); el('dmLoginPanel')?.classList.remove('hidden');
}
function unlockDm() {
  if (el('dmPasswordInput')?.value !== DM_PASS) { alert('Wrong password.'); return; }
  dmUnlocked=true;
  sessionStorage.setItem('rwby-dm','1');
  el('dmLoginPanel')?.classList.add('hidden');
  el('dmFullscreenPanel')?.classList.remove('hidden');
  // Activate players tab by default
  document.querySelectorAll('.dm-nav-btn').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.dm-tab').forEach(t=>t.classList.remove('active'));
  document.querySelector('.dm-nav-btn[data-dm-tab="players"]')?.classList.add('active');
  document.querySelector('.dm-tab[data-dm-tab="players"]')?.classList.add('active');
  renderDmSemblance(); renderDmTechniques(); renderDmTargetSelect(); renderThemeFields();
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
  renderHeader(); renderMainFields(); renderCharacterTabs();
  if (field==='level') { renderCalcPanel(); renderSkillsMatrix(); }
}

function bindAll() {
  const ii = (id,field) => { const e=el(id); if(e) e.addEventListener('input', ev=>updateField(field,ev.target.value)); };
  ii('charName','name'); ii('charLevel','level'); ii('charRace','race'); ii('charClass','className');
  ii('charAge','age'); ii('charBackground','background'); ii('charSemblanceName','semblanceName');
  ii('charWeaponName','weaponName');
  ii('currentHp','currentHp'); ii('maxHp','maxHp'); ii('currentAura','currentAura'); ii('maxAura','maxAura');
  ii('armor','armor'); ii('speed','speed'); ii('tempHp','tempHp');
  ii('weaponsText','weaponsText'); ii('abilitiesText','abilitiesText');
  ii('inventoryText','inventoryText'); ii('notesText','notesText');

  document.querySelectorAll('.tab-btn[data-tab]').forEach(b => b.addEventListener('click',()=>{
    state.activeTab=b.dataset.tab; pushState(); renderTabs();
  }));
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

    state.selectedCharacter=newIdx; state.showReserve=true;
    pushState(true); render();
  });
  el('toggleReserveBtn')?.addEventListener('click',()=>{ state.showReserve=!state.showReserve; pushState(true); render(); });
  el('toggleDeadBtn')?.addEventListener('click',  ()=>{ state.showDead=!state.showDead;       pushState(true); render(); });

  el('addDustSpellBtn')?.addEventListener('click',   addDustSpell);
  el('createTechniqueBtn')?.addEventListener('click', createTechnique);
  el('saveSemblanceBtn')?.addEventListener('click',   saveSemblance);
  el('saveCharacterStateBtn')?.addEventListener('click', saveCharState);
  el('deleteCharacterBtn')?.addEventListener('click',()=>{
    if (state.characters.length<=1) { alert('Keep at least one character.'); return; }
    if (!confirm(`Delete ${getChar().name||'this character'}?`)) return;
    state.characters.splice(state.selectedCharacter,1);
    if (state.selectedCharacter>=state.characters.length) state.selectedCharacter=state.characters.length-1;
    pushState(true); render();
  });

  el('openDmOverlayBtn')?.addEventListener('click', openDmOverlay);
  el('dmLoginBtn')?.addEventListener('click',       unlockDm);
  el('dmCloseBtn')?.addEventListener('click',       closeDmOverlay);
  el('dmCloseFullBtn')?.addEventListener('click',   closeDmOverlay);
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
    });
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
  el('saveThemeBtn')?.addEventListener('click', ()=>{ state.theme=readTheme(); pushTheme(); render(); });
  el('resetThemeBtn')?.addEventListener('click',()=>{ state.theme={...DEF_THEME}; pushTheme(); render(); });
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
function renderPortrait(c) {
  const img   = document.getElementById('portraitImg');
  const label = document.getElementById('portraitLabel');
  if (!img || !label) return;
  if (c.portrait) {
    img.src = c.portrait; img.onerror = () => { img.style.display='none'; if(label)label.style.display='flex'; };
    img.style.display = 'block';
    label.style.display = 'none';   // hide the "Photo" placeholder
  } else {
    img.src = '';
    img.style.display = 'none';
    label.style.display = 'flex';   // show the "Photo" placeholder
  }
  // Edit overlay is always in the DOM — CSS handles hover visibility
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
    const targetIdx = parseInt(document.getElementById('grantTarget')?.value ?? '0');
    const xp   = parseInt(document.getElementById('grantXp')?.value) || 0;
    const item = document.getElementById('grantItem')?.value.trim() || '';
    if (!xp && !item) return;
    const c = state.characters[targetIdx]; if (!c) return;
    if (!c.notesText) c.notesText = '';
    const grant = [];
    if (xp)   grant.push(`+${xp} XP`);
    if (item)  grant.push(item);
    const note = `\n[DM Grant] ${grant.join(' · ')}`;
    c.notesText += note;
    // Also add item to inventory
    if (item) c.inventoryText = (c.inventoryText||'') + `\n${item}`;
    pushState();
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
const RELATION_TYPES = ['Ally','Friend','Rival','Enemy','Mentor','Family','Neutral','Unknown'];

function renderRelationships() {
  const c = getChar();
  const cont = el('relationshipsContainer'); if (!cont) return;
  const rels = c.relationships || [];
  cont.innerHTML = rels.map((r, i) => `
    <div class="rel-card" data-i="${i}">
      <div class="rel-card-top">
        <input class="rel-name" data-i="${i}" value="${esc(r.name||'')}" placeholder="Name…">
        <select class="rel-type" data-i="${i}">
          ${RELATION_TYPES.map(t=>`<option value="${t}" ${r.type===t?'selected':''}>${t}</option>`).join('')}
        </select>
        <button class="rel-del neo-btn small ghost" data-i="${i}">✕</button>
      </div>
      <textarea class="rel-notes" data-i="${i}" placeholder="Notes on this person…">${esc(r.notes||'')}</textarea>
    </div>`).join('');

  cont.querySelectorAll('.rel-name,.rel-notes,.rel-type').forEach(inp => {
    inp.addEventListener('input', () => saveRelationships(c));
    inp.addEventListener('change', () => saveRelationships(c));
  });
  cont.querySelectorAll('.rel-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = parseInt(btn.dataset.i);
      c.relationships.splice(i, 1);
      pushState(); renderRelationships();
    });
  });
}

function saveRelationships(c) {
  const cont = el('relationshipsContainer'); if (!cont) return;
  const cards = cont.querySelectorAll('.rel-card');
  c.relationships = Array.from(cards).map(card => {
    const i = parseInt(card.dataset.i);
    return {
      name:  card.querySelector('.rel-name').value,
      type:  card.querySelector('.rel-type').value,
      notes: card.querySelector('.rel-notes').value,
    };
  });
  pushState();
}

function bindRelationships() {
  el('addRelBtn')?.addEventListener('click', () => {
    const c = getChar();
    if (!c.relationships) c.relationships = [];
    c.relationships.push({ name:'', type:'Neutral', notes:'' });
    pushState(); renderRelationships();
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

function renderAccentColor() {
  const c = getChar();
  const inp = el('accentColorInput');
  if (inp) inp.value = c.accentColor || '#00d4ff';
}

// ================================================================
// #26 — HP/AURA DAMAGE FLASH
// ================================================================
let _prevHp = null, _prevAura = null;

function checkResourceFlash(c) {
  if (_prevHp !== null && c.hp.current < _prevHp) flashBar('topHpBar', 'flash-damage');
  if (_prevHp !== null && c.hp.current > _prevHp) flashBar('topHpBar', 'flash-heal');
  if (_prevAura !== null && c.aura.current < _prevAura) flashBar('topAuraBar', 'flash-damage');
  if (_prevAura !== null && c.aura.current > _prevAura) flashBar('topAuraBar', 'flash-heal');
  _prevHp = c.hp.current; _prevAura = c.aura.current;
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

function claimCharacter(realIdx) {
  const c = state.characters[realIdx];
  if (!c) return;
  // Release any previous claim by this browser
  state.characters.forEach(ch => { if (ch.claimedBy === MY_PRESENCE_ID) ch.claimedBy = ''; });
  c.claimedBy = MY_PRESENCE_ID;
  state.selectedCharacter = realIdx;
  pushState(true);
  pushPresence();
  render();
}

function checkWelcome() {
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
    const taken = c.claimedBy && c.claimedBy !== MY_PRESENCE_ID;
    const btn = document.createElement('button');
    btn.className = `welcome-char-btn ${taken ? 'taken' : ''}`;
    btn.disabled = taken;
    btn.innerHTML = `
      ${c.portrait ? `<img src="${c.portrait}" class="welcome-portrait">` : `<div class="welcome-portrait-empty">${c.name ? c.name[0].toUpperCase() : '?'}</div>`}
      <span>${esc(c.name || `Player ${realIdx + 1}`)}</span>
      ${taken ? '<span class="taken-label">Taken</span>' : ''}`;
    btn.addEventListener('click', () => {
      claimCharacter(realIdx);
      closeWelcome();
      showToast(`You are ${c.name} ✓`, 'success', 4000);
    });
    list.appendChild(btn);
  });

  document.getElementById('welcomeSkipBtn')?.addEventListener('click', () => {
    closeWelcome();
  });
}

function recheckWelcomeIfNeeded() {
  // Re-point selectedCharacter to our claimed char if it drifted
  const mine = getMyCharacter();
  if (mine) {
    const idx = state.characters.indexOf(mine);
    if (idx >= 0 && state.selectedCharacter !== idx) state.selectedCharacter = idx;
  }
}

// ================================================================
// INIT
// ================================================================
bindAll();
initPortrait();
bindDeathSaves();
bindBroadcast();
bindGrant();
bindRelationships();
bindAccentColor();
bindFullscreen();
render();

// ── MIGRATION: rwby-chars → campaigns/rwby-campaign ──
// If the new doc doesn't exist yet, read old per-character collection and merge
async function migrateIfNeeded() {
  try {
    const mainSnap = await getDoc(doc(db, 'campaigns', 'rwby-campaign'));
    if (mainSnap.exists()) {
      // Data already in campaigns doc — no migration needed
      startListener();
      return;
    }
    // Try reading from old rwby-chars collection
    const { getDocs, collection: col } = await import('https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js');
    const oldSnap = await getDocs(col(db, 'rwby-chars')).catch(() => null);
    if (oldSnap && !oldSnap.empty) {
      const chars = [];
      oldSnap.forEach(d => {
        try { chars.push(JSON.parse(d.data().data)); } catch(e) {}
      });
      if (chars.length) {
        // Sort by index if possible
        chars.sort((a, b) => (a.id || '').localeCompare(b.id || ''));
        state.characters = chars.map((c, i) => {
          const b = blankChar(i);
          return { ...b, ...c,
            stats: {...b.stats, ...(c.stats||{})},
            hp: {...b.hp, ...(c.hp||{})},
            aura: {...b.aura, ...(c.aura||{})},
            skills: (() => { const bsk = makeBlankSkills(); Object.keys(bsk).forEach(n => { bsk[n] = {...bsk[n], ...(c.skills?.[n]||{})}; }); return bsk; })()
          };
        });
        await setDoc(doc(db, 'campaigns', 'rwby-campaign'), { data: JSON.stringify(state) });
        console.log(`Migrated ${chars.length} characters from rwby-chars`);
        render();
      }
    }
  } catch(e) {
    console.warn('Migration check failed:', e);
  }
  startListener();
}
migrateIfNeeded();

startPresenceListener();
startBroadcastListener();
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
  el('dmLoginPanel')?.classList.add('hidden');
  el('dmFullscreenPanel')?.classList.remove('hidden');
  document.querySelector('.dm-nav-btn[data-dm-tab="players"]')?.classList.add('active');
  document.querySelector('.dm-tab[data-dm-tab="players"]')?.classList.add('active');
  renderDmSemblance(); renderDmTechniques(); renderDmTargetSelect(); renderThemeFields();
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



