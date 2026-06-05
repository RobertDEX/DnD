// ============================================================
// RWBY DnD — rwby.js
// Full auto-calculations: proficiency, skills, saves, initiative,
// passive perception, attack bonuses, Uncanny Dodge
// Firebase Firestore sync — no import/export needed
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getFirestore, doc, collection, getDoc, onSnapshot, setDoc } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

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
const DEF_THEME  = {bg:'#030205',panel:'#0a0712',accent:'#c0000a',accentTwo:'#5a0005',aura:'#6eb5ff',text:'#d8cfe8'};

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
  const c = getMyChar();
  const totalAuraCost = r.apCost + r.halved;
  if (c.aura.current < totalAuraCost) { alert(`Not enough Aura! Need ${totalAuraCost} AP (${r.apCost} cost + ${r.halved} halved damage), have ${c.aura.current}.`); return; }
  c.aura.current -= totalAuraCost;
  ensureClamp(c); pushState(); render();
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
  const c = getMyChar();
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
  const c = getMyChar();
  const tmp = Number(c.tempHp) || 0;
  const absorbed = Math.min(tmp, dmg);
  c.tempHp = tmp - absorbed;
  c.hp.current = Math.max(0, c.hp.current - (dmg - absorbed));
  ensureClamp(c); pushState(); render();
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
    // profBonus is now auto-calculated from level; we keep a manual override
    profBonusOverride: null, // null = auto
    attackStat: 'STR', initiativeBonus: 0,
    state: i < 4 ? 'active' : 'reserve',
    stats: {STR:10,DEX:10,CON:10,INT:10,WIS:10,CHA:10},
    skills: makeBlankSkills(),
    hp:{current:0,max:0}, aura:{current:0,max:0},
    armor:0, speed:'30 ft', tempHp:0,
    weaponsText:'', abilitiesText:'', inventoryText:'', notesText:'',
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

// ================================================================
// PER-CHARACTER SYNC ARCHITECTURE
// ─────────────────────────────────────────────────────────────────
// • Each character = its own Firestore doc at  rwby-chars/{charId}
// • Each browser claims one character via localStorage 'rwby-my-char-id'
// • All browsers listen to ALL character docs → full live roster
// • Theme is a separate shared doc: rwby-meta/theme
// • dmUnlocked lives in sessionStorage only — NEVER syncs to Firestore
// ================================================================

const CHARS_COLL = 'rwby-chars';   // collection
const META_DOC   = 'rwby-meta';    // doc for shared theme

let state      = loadLocal();
let _charUnsubs = {};  // charId → unsubscribe fn
let _metaUnsub  = null;

// DM unlock is purely session-local — never touches Firestore
let dmUnlocked = sessionStorage.getItem('rwby-dm') === '1';

// The character this browser "owns" and can edit
function getMyCharId() {
  let id = localStorage.getItem('rwby-my-char-id');
  if (!id) {
    // Claim the first active character slot that has no name yet, or make a new one
    const unclaimed = state.characters.find(c => !c.name);
    id = unclaimed ? unclaimed.id : blankChar(state.characters.length).id;
    localStorage.setItem('rwby-my-char-id', id);
  }
  return id;
}

function isMine(c) { return c.id === getMyCharId(); }

function loadLocal() {
  try { const r = localStorage.getItem(LOC_KEY); return r ? normalize(JSON.parse(r)) : structuredClone(DEF_STATE); }
  catch { return structuredClone(DEF_STATE); }
}
function saveLocal() { try { localStorage.setItem(LOC_KEY, JSON.stringify(state)); } catch {} }

// Push ONLY the current player's character to Firestore (debounced — waits 800ms after last change)
let _pushTimer = null;
async function pushState() {
  saveLocal();
  clearTimeout(_pushTimer);
  _pushTimer = setTimeout(async () => {
    const myId = getMyCharId();
    const mine = state.characters.find(c => c.id === myId);
    if (!mine) return;
    setSyncDot('syncing');
    try {
      await setDoc(doc(db, CHARS_COLL, myId), { data: JSON.stringify(mine), updated: Date.now() });
      setSyncDot('synced');
    } catch(e) { console.error(e); setSyncDot('error'); }
  }, 800);
}

// Push theme separately (DM only)
async function pushTheme() {
  try {
    await setDoc(doc(db, META_DOC, 'theme'), { data: JSON.stringify(state.theme), updated: Date.now() });
  } catch(e) { console.error(e); }
}

// Listen to a single character doc
function listenToChar(charId) {
  if (_charUnsubs[charId]) return;
  const myId = getMyCharId();
  _charUnsubs[charId] = onSnapshot(doc(db, CHARS_COLL, charId), snap => {
    if (!snap.exists()) return;
    // Skip snapshots for OUR OWN character — we already have live local data.
    // Firebase echoes our own pushes back; processing them would reset our UI mid-typing.
    if (charId === myId) { setSyncDot('synced'); return; }
    try {
      const fresh = JSON.parse(snap.data().data);
      const idx   = state.characters.findIndex(c => c.id === charId);
      const blank = blankChar(0);
      const merged = {
        ...blank, ...fresh,
        stats:    {...blank.stats,    ...(fresh.stats    || {})},
        hp:       {...blank.hp,       ...(fresh.hp       || {})},
        aura:     {...blank.aura,     ...(fresh.aura     || {})},
        dustInventory: {...blank.dustInventory, ...(fresh.dustInventory || {})},
        dustSpells:  Array.isArray(fresh.dustSpells)  ? fresh.dustSpells  : [],
        techniques:  Array.isArray(fresh.techniques)  ? fresh.techniques  : [],
        skills: (() => {
          const bsk = makeBlankSkills();
          Object.keys(bsk).forEach(n => { bsk[n] = {...bsk[n], ...(fresh.skills?.[n] || {})}; });
          return bsk;
        })(),
        semblance: {
          ...blank.semblance, ...(fresh.semblance || {}),
          base:     {...blank.semblance.base,     ...(fresh.semblance?.base     || {})},
          first:    {...blank.semblance.first,    ...(fresh.semblance?.first    || {})},
          second:   {...blank.semblance.second,   ...(fresh.semblance?.second   || {})},
          third:    {...blank.semblance.third,    ...(fresh.semblance?.third    || {})},
          ascended: {...blank.semblance.ascended, ...(fresh.semblance?.ascended || {})},
          unlocked: {...blank.semblance.unlocked, ...(fresh.semblance?.unlocked || {})}
        }
      };
      if (idx >= 0) state.characters[idx] = merged;
      else          state.characters.push(merged);
      saveLocal();
      try { renderCharacterTabs(); } catch(e) {}
      const viewIdx = idx >= 0 ? idx : state.characters.length - 1;
      if (state.selectedCharacter === viewIdx) {
        // Viewing this character's tab — full re-render so everything updates live
        try { render(); } catch(e) {}
      } else {
        try { renderHeader(); } catch(e) {}
      }
      setSyncDot('synced');
    } catch(e) { console.error('Snapshot parse error', e); }
  }, e => { console.error(e); setSyncDot('error'); });
}

// Watch the ENTIRE collection — picks up all characters regardless of who created them
function startListeners() {
  const myId = getMyCharId();

  // Single listener on the whole collection — fires whenever any char doc changes
  if (_charUnsubs['__collection__']) _charUnsubs['__collection__']();
  _charUnsubs['__collection__'] = onSnapshot(collection(db, CHARS_COLL), snapshot => {
    snapshot.docChanges().forEach(change => {
      if (change.type === 'removed') return;
      const charId = change.doc.id;
      // Skip echo of our own writes
      if (charId === myId) { setSyncDot('synced'); return; }
      try {
        const fresh = JSON.parse(change.doc.data().data);
        const idx   = state.characters.findIndex(c => c.id === charId);
        const blank = blankChar(0);
        const merged = {
          ...blank, ...fresh,
          stats:    {...blank.stats,    ...(fresh.stats    || {})},
          hp:       {...blank.hp,       ...(fresh.hp       || {})},
          aura:     {...blank.aura,     ...(fresh.aura     || {})},
          dustInventory: {...blank.dustInventory, ...(fresh.dustInventory || {})},
          dustSpells: Array.isArray(fresh.dustSpells)  ? fresh.dustSpells  : [],
          techniques: Array.isArray(fresh.techniques)  ? fresh.techniques  : [],
          skills: (() => {
            const bsk = makeBlankSkills();
            Object.keys(bsk).forEach(n => { bsk[n] = {...bsk[n], ...(fresh.skills?.[n] || {})}; });
            return bsk;
          })(),
          semblance: {
            ...blank.semblance, ...(fresh.semblance || {}),
            base:     {...blank.semblance.base,     ...(fresh.semblance?.base     || {})},
            first:    {...blank.semblance.first,    ...(fresh.semblance?.first    || {})},
            second:   {...blank.semblance.second,   ...(fresh.semblance?.second   || {})},
            third:    {...blank.semblance.third,    ...(fresh.semblance?.third    || {})},
            ascended: {...blank.semblance.ascended, ...(fresh.semblance?.ascended || {})},
            unlocked: {...blank.semblance.unlocked, ...(fresh.semblance?.unlocked || {})}
          }
        };
        if (idx >= 0) state.characters[idx] = merged;
        else          state.characters.push(merged);
        saveLocal();
        try { renderCharacterTabs(); } catch(e) {}
        if (state.selectedCharacter === (idx >= 0 ? idx : state.characters.length - 1)) {
          try { renderHeader(); renderMainFields(); } catch(e) {}
        } else {
          try { renderHeader(); } catch(e) {}
        }
        setSyncDot('synced');
      } catch(e) { console.error('Collection snapshot error', e); }
    });
  }, e => { console.error('Collection listener error', e); setSyncDot('error'); });

  // Theme listener
  if (_metaUnsub) _metaUnsub();
  _metaUnsub = onSnapshot(doc(db, META_DOC, 'theme'), snap => {
    if (!snap.exists()) return;
    try {
      const t = JSON.parse(snap.data().data);
      state.theme = {...DEF_THEME, ...t};
      Object.keys(DEF_THEME).forEach(k => {
        if (!state.theme[k] || !state.theme[k].startsWith('#')) state.theme[k] = DEF_THEME[k];
      });
      saveLocal(); applyTheme(); renderThemeFields();
    } catch(e) { console.error(e); }
  }, e => console.error(e));
}

function setSyncDot(s) {
  const d = document.getElementById('syncDot'); if (!d) return;
  d.className = 'sync-dot ' + s;
  d.title = {synced:'Synced ✓', syncing:'Syncing…', error:'Sync error — local only'}[s] || s;
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
// Who you are VIEWING (whatever tab is selected in the sidebar)
function getChar()     { return state.characters[state.selectedCharacter] || state.characters[0]; }
// Who YOU OWN — the only character you can edit
function getMyChar()   { const myId=getMyCharId(); return state.characters.find(c=>c.id===myId) || state.characters[0]; }
function isViewingOwnChar() { return getChar().id === getMyCharId(); }
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
    document.body.style.background = `
      radial-gradient(ellipse at 0% 0%,   ${hexRgba(t.accent,.18)} 0%, transparent 40%),
      radial-gradient(ellipse at 100% 100%,${hexRgba(t.accentTwo,.15)} 0%, transparent 40%),
      linear-gradient(180deg, #000 0%, ${t.bg} 50%, ${t.accentTwo} 100%)`;
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
  const myId = getMyCharId();
  state.characters.forEach((c,i) => {
    if (c.state==='dead'    && !state.showDead)    return;
    if (c.state==='reserve' && !state.showReserve) return;
    const pct = c.hp.max > 0 ? Math.round((c.hp.current/c.hp.max)*100) : 0;
    const isOwn = c.id === myId;
    const btn = document.createElement('button'); btn.type='button';
    btn.className = `character-tab${c.state==='reserve'?' reserve':''}${c.state==='dead'?' dead':''}${isOwn?' active':''}`;
    btn.innerHTML = `<strong>${esc(c.name||`Player ${i+1}`)}${isOwn?' <span style="color:var(--aura);font-size:.55rem">YOU</span>':''}</strong><span>${esc(c.className||'—')} · Lv${c.level} · ${esc(c.race||'—')}</span><div class="tab-hp-bar"><div class="tab-hp-fill" style="width:${pct}%"></div></div>`;
    btn.addEventListener('click', ()=>{ state.selectedCharacter=i; render(); });
    tabs.appendChild(btn);
  });
}

// ================================================================
// RENDER — TOPBAR
// ================================================================
function renderHeader() {
  const c = getChar(); const name = c.name || '—';
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
      pushState(); render();
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
  try { renderCharacterTabs(); } catch(e) { console.error('renderCharacterTabs:', e); }
  try { renderHeader(); }        catch(e) { console.error('renderHeader:', e); }
  try { renderMainFields(); }    catch(e) { console.error('renderMainFields:', e); }
  try { renderCalcPanel(); }     catch(e) { console.error('renderCalcPanel:', e); }
  try { renderStats(); }         catch(e) { console.error('renderStats:', e); }
  try { renderSkillsMatrix(); }  catch(e) { console.error('renderSkillsMatrix:', e); }
  try { renderSemblance(); }     catch(e) { console.error('renderSemblance:', e); }
  try { renderTechniques(); }    catch(e) { console.error('renderTechniques:', e); }
  try { renderDust(); }          catch(e) { console.error('renderDust:', e); }
  try { renderDmSemblance(); }   catch(e) { console.error('renderDmSemblance:', e); }
  try { renderDmTechniques(); }  catch(e) { console.error('renderDmTechniques:', e); }
  try { renderDmTargetSelect(); }catch(e) { console.error('renderDmTargetSelect:', e); }
  try { renderThemeFields(); }   catch(e) { console.error('renderThemeFields:', e); }
  try { renderTabs(); }          catch(e) { console.error('renderTabs:', e); }
}

// ================================================================
// ACTIONS
// ================================================================
function adjustResource(res, amt) {
  const c = getMyChar();
  if (res==='hp')   c.hp.current   = clamp(c.hp.current   + amt, 0, c.hp.max);
  if (res==='aura') c.aura.current = clamp(c.aura.current + amt, 0, c.aura.max);
  pushState(); renderHeader(); renderMainFields(); renderCharacterTabs();
}
function useTechnique(id) {
  const c = getMyChar(); const t = c.techniques.find(t=>t.id===id); if(!t) return;
  if (c.aura.current < t.cost) { alert(`Not enough Aura. Need ${t.cost}, have ${c.aura.current}.`); return; }
  c.aura.current -= t.cost; ensureClamp(c); pushState(); render();
}
function useSemblance(key) {
  const c = getMyChar(); if (stageLocked(key,c)) { alert('That stage is locked.'); return; }
  const cost = c.semblance[key].auraCost;
  if (c.aura.current < cost) { alert(`Not enough Aura. Need ${cost}, have ${c.aura.current}.`); return; }
  c.aura.current -= cost; ensureClamp(c); pushState(); render();
}
function useDustSpell(id) {
  const c = getMyChar(); const sp = c.dustSpells.find(s=>s.id===id); if(!sp) return;
  if ((c.dustInventory[sp.type]||0) < 1) { alert(`Not enough ${sp.type}.`); return; }
  c.dustInventory[sp.type]--; pushState(); renderDust();
}
function rollHp() {
  const c = getMyChar(); const conM = mod(c.stats.CON); const roll = rollD10();
  const total = Math.max(1, roll + conM); c.hp.max += total; c.hp.current = c.hp.max;
  pushState(); render();
  alert(`HP Roll: d10(${roll}) + CON(${conM}) = +${total}\nNew Max: ${c.hp.max}`);
}
function rollAura() {
  const c = getMyChar(); const sk = c.skills['Aura Mastery'] || {}; const bonus = skillTotal(c, 'Aura Mastery');
  const roll = rollD10(); const total = Math.max(1, roll + bonus);
  c.aura.max += total; c.aura.current = c.aura.max;
  pushState(); render();
  alert(`Aura Roll: d10(${roll}) + Aura Mastery(${fmtMod(bonus)}) = +${total}\nNew Max: ${c.aura.max}`);
}
function saveSemblance() {
  const c = getMyChar();
  el('semblanceDmGrid')?.querySelectorAll('[data-sem]').forEach(inp => {
    const key=inp.dataset.sem, f=inp.dataset.f;
    c.semblance[key][f] = f==='auraCost' ? Math.max(0,Number(inp.value)||0) : inp.value;
  });
  c.semblance.unlocked.first    = el('unlockFirst')?.checked    || false;
  c.semblance.unlocked.second   = el('unlockSecond')?.checked   || false;
  c.semblance.unlocked.third    = el('unlockThird')?.checked    || false;
  c.semblance.unlocked.ascended = el('unlockAscended')?.checked || false;
  pushState(); render();
}
function saveCharState() {
  const c = getMyChar();
  if (el('stateActive')?.checked)  c.state = 'active';
  if (el('stateReserve')?.checked) c.state = 'reserve';
  if (el('stateDead')?.checked)    { c.state='dead'; c.hp.current=0; c.aura.current=0; }
  pushState(); render();
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
  pushState(); render();
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
  el('dmLoginPanel')?.classList.add('hidden'); el('dmFullscreenPanel')?.classList.remove('hidden');
  renderDmSemblance(); renderDmTechniques(); renderDmTargetSelect(); renderThemeFields();
}

// ================================================================
// INPUT BINDINGS
// ================================================================
function updateField(field, value) {
  const c = getMyChar();
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
    const c=getMyChar(); c.stats[btn.dataset.stat]=(Number(c.stats[btn.dataset.stat])||0)+(btn.dataset.action==='plus'?1:-1);
    pushState(); renderStats(); renderSkillsMatrix(); renderCalcPanel();
  });
  document.addEventListener('click', e => {
    const btn=e.target.closest('.adj-btn'); if(!btn) return;
    adjustResource(btn.dataset.resource, Number(btn.dataset.amt));
  });

  el('rollHpBtn')?.addEventListener('click',   rollHp);
  el('rollAuraBtn')?.addEventListener('click',  rollAura);
  el('restoreHpBtn')?.addEventListener('click', ()=>{ const c=getMyChar(); c.hp.current=c.hp.max; pushState(); render(); });
  el('restoreAuraBtn')?.addEventListener('click',()=>{ const c=getMyChar(); c.aura.current=c.aura.max; pushState(); render(); });

  el('addCharacterBtn')?.addEventListener('click',()=>{
    const nc=blankChar(state.characters.length); nc.state='reserve';
    state.characters.push(nc);
    // Claim this new character for THIS browser
    localStorage.setItem('rwby-my-char-id', nc.id);
    state.selectedCharacter=state.characters.length-1; state.showReserve=true;
    listenToChar(nc.id); // start watching its doc
    pushState(); render();
  });
  el('toggleReserveBtn')?.addEventListener('click',()=>{ state.showReserve=!state.showReserve; pushState(); render(); });
  el('toggleDeadBtn')?.addEventListener('click',  ()=>{ state.showDead=!state.showDead;       pushState(); render(); });

  el('addDustSpellBtn')?.addEventListener('click',   addDustSpell);
  el('createTechniqueBtn')?.addEventListener('click', createTechnique);
  el('saveSemblanceBtn')?.addEventListener('click',   saveSemblance);
  el('saveCharacterStateBtn')?.addEventListener('click', saveCharState);
  el('deleteCharacterBtn')?.addEventListener('click',()=>{
    if (state.characters.length<=1) { alert('Keep at least one character.'); return; }
    if (!confirm(`Delete ${getChar().name||'this character'}?`)) return;
    state.characters.splice(state.selectedCharacter,1);
    if (state.selectedCharacter>=state.characters.length) state.selectedCharacter=state.characters.length-1;
    pushState(); render();
  });

  el('openDmOverlayBtn')?.addEventListener('click', openDmOverlay);
  el('dmLoginBtn')?.addEventListener('click',       unlockDm);
  el('dmCloseBtn')?.addEventListener('click',       closeDmOverlay);
  el('dmCloseFullBtn')?.addEventListener('click',   closeDmOverlay);
  el('dmLogoutBtn')?.addEventListener('click',      lockDm);
  el('dmPasswordInput')?.addEventListener('keydown',e=>{ if(e.key==='Enter') unlockDm(); });

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

// ================================================================
// INIT — migrate old single-doc data then start listeners
// ================================================================
async function init() {
  bindAll();
  render();

  // Check if any per-character docs already exist
  // by attempting to load the first known character's doc.
  // If nothing exists yet, migrate from the old campaigns/rwby-campaign doc.
  const myId = getMyCharId();
  const myDocSnap = await getDoc(doc(db, CHARS_COLL, myId)).catch(() => null);

  if (!myDocSnap || !myDocSnap.exists()) {
    // Try migrating from old doc
    const oldSnap = await getDoc(doc(db, 'campaigns', 'rwby-campaign')).catch(() => null);
    if (oldSnap && oldSnap.exists()) {
      try {
        const oldState = JSON.parse(oldSnap.data().data);
        const oldChars = oldState?.characters;
        if (Array.isArray(oldChars) && oldChars.length) {
          console.log('Migrating', oldChars.length, 'characters from old doc…');
          // Write each character to its own doc
          for (const c of oldChars) {
            if (c && c.id) {
              await setDoc(doc(db, CHARS_COLL, c.id), { data: JSON.stringify(c), updated: Date.now() });
            }
          }
          // Update local state with migrated characters
          state.characters = oldChars;
          // Claim the first named character as ours if we don't already have one
          const firstNamed = oldChars.find(c => c.name);
          if (firstNamed) localStorage.setItem('rwby-my-char-id', firstNamed.id);
          saveLocal();
          render();
        }
        // Migrate theme too
        if (oldState?.theme) {
          await setDoc(doc(db, META_DOC, 'theme'), { data: JSON.stringify(oldState.theme), updated: Date.now() });
        }
      } catch(e) { console.error('Migration error:', e); }
    }
  }

  startListeners();
}

init();
