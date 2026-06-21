// ============================================================
// MAKE A WISH INCORPORATED — maw.js
// SCP-esque Paranormal Investigation DnD · Firebase-synced
// Evil · Corporate · Lifeless
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getFirestore, doc, collection, getDoc, getDocs, onSnapshot, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

const FB_CONFIG = {
  apiKey:"AIzaSyCfEtfiU5swXvVkqt4shp8i6h4JYI8ES7U",authDomain:"dand-3c76a.firebaseapp.com",
  projectId:"dand-3c76a",storageBucket:"dand-3c76a.firebasestorage.app",
  messagingSenderId:"27455098509",appId:"1:27455098509:web:432929f697da9a947d5cc4",measurementId:"G-D1TQM5WJT8"
};
const fbApp = initializeApp(FB_CONFIG, 'maw');
const db    = getFirestore(fbApp);
const DOC   = 'maw-campaign';
const DM_PASS = '123456789';

// ================================================================
// CONSTANTS
// ================================================================
const STATS = ['STR','DEX','CON','INT','WIS','CHA'];
const STAT_LABELS = {
  STR:'Force', DEX:'Reflex', CON:'Endurance', INT:'Intellect', WIS:'Awareness', CHA:'Presence'
};

// Skills — Arcana is replaced by SENSITIVITY (paranormal perception)
const SKILL_DEFS = [
  {name:'STR Save',        stat:'STR', isSave:true},
  {name:'Athletics',       stat:'STR'},
  {name:'Force',           stat:'STR'},
  {name:'DEX Save',        stat:'DEX', isSave:true},
  {name:'Acrobatics',      stat:'DEX'},
  {name:'Stealth',         stat:'DEX'},
  {name:'Sleight of Hand', stat:'DEX'},
  {name:'CON Save',        stat:'CON', isSave:true},
  {name:'Containment',     stat:'CON'},
  {name:'INT Save',        stat:'INT', isSave:true},
  {name:'Investigation',   stat:'INT'},
  {name:'Anomaly Lore',    stat:'INT'},
  {name:'Technology',      stat:'INT'},
  {name:'Medicine',        stat:'INT'},
  {name:'WIS Save',        stat:'WIS', isSave:true},
  {name:'Sensitivity',     stat:'WIS'},   // <-- replaces Arcana
  {name:'Perception',      stat:'WIS'},
  {name:'Insight',         stat:'WIS'},
  {name:'Survival',        stat:'WIS'},
  {name:'CHA Save',        stat:'CHA', isSave:true},
  {name:'Interrogation',   stat:'CHA'},
  {name:'Persuasion',      stat:'CHA'},
  {name:'Intimidation',    stat:'CHA'},
  {name:'Deception',       stat:'CHA'}
];

// Corporate ranks (Tiers)
const RANKS = [
  { id:'I',   tier:'TIER 1', title:'EMPLOYEE',   color:'#7a8590' },
  { id:'II',  tier:'TIER 2', title:'SUPERVISOR', color:'#9aa6b2' },
  { id:'III', tier:'TIER 3', title:'DEPUTY',     color:'#c2b067' },
  { id:'IV',  tier:'TIER 4', title:'CHIEF',      color:'#d94f4f' }
];
const RANK_BY_ID = Object.fromEntries(RANKS.map(r=>[r.id,r]));

// Threat grades for missions / anomalies and their point bounties
const THREAT_GRADES = [
  { grade:'F', points:100,    color:'#6f7a85', label:'Negligible' },
  { grade:'D', points:500,    color:'#5a9a78', label:'Minor' },
  { grade:'C', points:1000,   color:'#c2a23a', label:'Moderate' },
  { grade:'B', points:5000,   color:'#d98030', label:'Severe' },
  { grade:'A', points:10000,  color:'#d94f4f', label:'Critical' },
  { grade:'S', points:50000,  color:'#b04ad9', label:'Apollyon · Separate Review' }
];
const THREAT_BY_GRADE = Object.fromEntries(THREAT_GRADES.map(t=>[t.grade,t]));

// Anomaly containment classes (flavor for the bestiary-like anomaly log)
const ANOMALY_CLASSES = ['Safe','Euclid','Keter','Thaumiel','Neutralized','Uncontained'];

const DMG_TYPES = ['Ballistic','Slashing','Bludgeoning','Fire','Cryo','Electric','Chemical','Anomalous','Psychic','Other'];
const TRAINING  = ['Untrained','Trained','Specialist'];
const ITEM_CATEGORIES = ['Weapon','Armor','Tool','Consumable','Anomalous','Document','Misc'];

// Requisitions catalog categories + tier access
const SHOP_CATEGORIES = ['Warding & Barriers','Tech & Detection','Combat','Containment','Protection','Medical','Utility','Anomalous Items'];
const RANK_TO_TIER = { 'I':1, 'II':2, 'III':3, 'IV':4 };   // an agent of rank R can access all tiers <= R
const TIER_LABEL = { 1:'TIER 1 · EMPLOYEE', 2:'TIER 2 · SUPERVISOR', 3:'TIER 3 · DEPUTY', 4:'TIER 4 · CHIEF' };
const TIER_COLOR = { 1:'#7a8590', 2:'#9aa6b2', 3:'#c2b067', 4:'#d94f4f' };

// ================================================================
// STATE
// ================================================================
const MY_PRESENCE_ID = localStorage.getItem('maw-pid') || (() => {
  const id = Math.random().toString(36).slice(2);
  localStorage.setItem('maw-pid', id); return id;
})();

let dmUnlocked = sessionStorage.getItem('maw-dm') === '1';
let spectator  = sessionStorage.getItem('maw-spectator') === '1';
let _lastAppliedRaw = null;
let _welcomeShown = false;
let _unsub = null;
let _presenceUnsub = null;
let _livePresenceIds = new Set([MY_PRESENCE_ID]);

function makeBlankSkills() {
  const o = {};
  SKILL_DEFS.forEach(s => { o[s.name] = { prof:false, expert:false, misc:0 }; });
  return o;
}

function blankChar(i) {
  return {
    id:`maw-${Date.now()}-${i}-${Math.random().toString(16).slice(2)}`,
    name:'', codename:'', role:'', clearance:'', age:'', level:1, background:'',
    rank:'I',            // corporate tier I-IV
    points:0,            // mission points / currency
    division:'', site:'',
    profBonusOverride:null, initiativeBonus:0, attackStat:'DEX',
    state: i<4?'active':'reserve',
    portrait:'', accentColor:'', claimedBy:'',
    stats:{STR:10,DEX:10,CON:10,INT:10,WIS:10,CHA:10},
    skills:makeBlankSkills(),
    hp:{current:0,max:0}, sanity:{current:0,max:0},  // sanity replaces mana
    armor:10, speed:'30 ft', tempHp:0,
    deathSaves:{successes:0,failures:0,stable:false},
    abilitiesText:'', notesText:'',
    relationships:[], weapons:[], inventory:[], anomalies:[], missions:[], abilities:[]
  };
}

let state = {
  characters: Array.from({length:6}, (_,i)=>blankChar(i)),
  selectedCharacter: 0,
  activeTab: 'skills',
  showReserve: false,
  theme: null,
  shop: []  // shared shop catalog managed by the DM
};

// ================================================================
// HELPERS
// ================================================================
const el = id => document.getElementById(id);
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function mod(score){ return Math.floor((Number(score||10)-10)/2); }
function fmtMod(n){ return n>=0?`+${n}`:`${n}`; }
function profBonus(c){ if(c.profBonusOverride!=null) return Number(c.profBonusOverride)||0; return Math.ceil((Number(c.level)||1)/4)+1; }
function fmtPoints(n){ return (Number(n)||0).toLocaleString('en-US'); }

function getChar(){
  if(dmUnlocked||spectator) return state.characters[state.selectedCharacter] || state.characters[0];
  const mine = state.characters.find(c=>c.claimedBy===MY_PRESENCE_ID);
  if(mine) return mine;
  return state.characters[state.selectedCharacter] || state.characters[0];
}
function getMyCharacter(){ return state.characters.find(c=>c.claimedBy===MY_PRESENCE_ID) || null; }
function rankOf(c){ return RANK_BY_ID[c.rank] || RANKS[0]; }

function ensureClamp(c){
  if(c.hp.max<0)c.hp.max=0;
  if(c.hp.current>c.hp.max)c.hp.current=c.hp.max;
  if(c.hp.current<0)c.hp.current=0;
  if(c.sanity.max<0)c.sanity.max=0;
  if(c.sanity.current>c.sanity.max)c.sanity.current=c.sanity.max;
  if(c.sanity.current<0)c.sanity.current=0;
  if(c.points<0)c.points=0;
}

function normalize(raw){
  const m = { ...state, ...raw };
  if(!Array.isArray(m.characters)) m.characters = [];
  m.characters = m.characters.map((c,i)=>{
    const b = blankChar(i);
    const mc = { ...b, ...c };
    mc.stats = { ...b.stats, ...(c.stats||{}) };
    mc.hp = { ...b.hp, ...(c.hp||{}) };
    mc.sanity = { ...b.sanity, ...(c.sanity||{}) };
    mc.deathSaves = { ...b.deathSaves, ...(c.deathSaves||{}) };
    mc.relationships = Array.isArray(c.relationships)?c.relationships:[];
    mc.weapons    = Array.isArray(c.weapons)?c.weapons:[];
    mc.inventory  = Array.isArray(c.inventory)?c.inventory:[];
    mc.anomalies  = Array.isArray(c.anomalies)?c.anomalies:[];
    mc.missions   = Array.isArray(c.missions)?c.missions:[];
    mc.abilities  = Array.isArray(c.abilities)?c.abilities:[];
    if(typeof mc.points!=='number') mc.points = Number(mc.points)||0;
    if(!RANK_BY_ID[mc.rank]) mc.rank = 'I';
    const blankSk = makeBlankSkills(); mc.skills = {};
    Object.keys(blankSk).forEach(n=>{ mc.skills[n] = { ...blankSk[n], ...(c.skills?.[n]||{}) }; });
    return mc;
  });
  while(m.characters.length<6) m.characters.push(blankChar(m.characters.length));
  if(m.selectedCharacter>=m.characters.length) m.selectedCharacter = 0;
  if(!Array.isArray(m.shop)) m.shop = [];
  m.shop = m.shop.map(it=>({
    tier: Number(it.tier)||1,
    name: it.name||'',
    category: it.category||'Utility',
    price: Number(it.price)||0,
    stock: (it.stock===undefined?null:it.stock),
    desc: it.desc||''
  }));
  return m;
}

// ================================================================
// CALCULATIONS
// ================================================================
function passivePerception(c){ return 10 + skillTotal(c,'Perception'); }
function skillTotal(c, skillName){
  const def = SKILL_DEFS.find(s=>s.name===skillName);
  if(!def) return 0;
  const sk = c.skills[skillName] || {prof:false,expert:false,misc:0};
  let total = mod(c.stats[def.stat]);
  const pb = profBonus(c);
  if(sk.expert) total += pb*2;
  else if(sk.prof) total += pb;
  total += Number(sk.misc)||0;
  return total;
}
function calcInitiative(c){ return mod(c.stats.DEX) + (Number(c.initiativeBonus)||0); }
function attackBonus(c){ return mod(c.stats[c.attackStat||'DEX']) + profBonus(c); }

// ================================================================
// FIREBASE SYNC
// ================================================================
function setSyncDot(s){
  const d = el('syncDot'); if(!d) return;
  d.className = 'sync-dot '+s;
  d.title = {synced:'Synced',syncing:'Syncing…',error:'Offline — changes may not save'}[s]||s;
}

let _pushDebounce = null;
async function pushState(immediate=false){
  if(spectator) return;
  const hasData = state.characters.some(c=>c.name && c.name.trim());
  if(!hasData && !state.shop.length) return;
  if(immediate){
    setSyncDot('syncing');
    try { await setDoc(doc(db,'campaigns',DOC), { data: JSON.stringify(state) }); setSyncDot('synced'); }
    catch(e){ console.error(e); setSyncDot('error'); }
    return;
  }
  setSyncDot('syncing');
  clearTimeout(_pushDebounce);
  _pushDebounce = setTimeout(async ()=>{
    try { await setDoc(doc(db,'campaigns',DOC), { data: JSON.stringify(state) }); setSyncDot('synced'); }
    catch(e){ console.error(e); setSyncDot('error'); }
  }, 600);
}

function startListener(){
  if(_unsub) _unsub();
  _unsub = onSnapshot(doc(db,'campaigns',DOC), snap=>{
    if(!snap.exists()) return;
    try {
      const raw = snap.data().data;
      if(raw===_lastAppliedRaw){ setSyncDot('synced'); return; }
      _lastAppliedRaw = raw;
      const remote = normalize(JSON.parse(raw));

      const ae = document.activeElement;
      const isTyping = ae && (ae.tagName==='INPUT'||ae.tagName==='TEXTAREA'||ae.tagName==='SELECT');
      const myIdx = state.characters.findIndex(c=>c.claimedBy===MY_PRESENCE_ID);

      remote.characters.forEach((rc,i)=>{
        if(isTyping && i===(myIdx>=0?myIdx:state.selectedCharacter)) return;
        state.characters[i] = rc;
      });
      while(state.characters.length<remote.characters.length)
        state.characters.push(remote.characters[state.characters.length]);
      state.shop = remote.shop;
      state.theme = remote.theme;
      setSyncDot('synced');

      if(isTyping){
        try{ renderCharacterTabs(); }catch(e){}
        recheckWelcomeIfNeeded();
        if(!el('welcomeOverlay') && !_welcomeShown){ _welcomeShown=true; checkWelcome(); }
        return;
      }
      render();
      if(spectator) disableAllInputs();
      recheckWelcomeIfNeeded();
      if(!el('welcomeOverlay') && !_welcomeShown){ _welcomeShown=true; checkWelcome(); }
    } catch(e){ console.error('Snapshot error:', e); }
  }, e=>{ console.error(e); setSyncDot('error'); });
}

// ── PRESENCE ──
async function pushPresence(){
  if(!getMyCharacter() && !dmUnlocked && !spectator) {
    // still register a faceless presence so the DM sees observers
  }
  try {
    const mine = getMyCharacter();
    const name = dmUnlocked ? 'DM' : (mine?.name || (spectator?'Observer':'Anon'));
    const color = mine?.accentColor || (dmUnlocked?'#d94f4f':'#7a8590');
    await setDoc(doc(db,'maw-presence',MY_PRESENCE_ID), { id:MY_PRESENCE_ID, name, color, ts:Date.now() });
  } catch(e){}
}
function startPresenceListener(){
  if(_presenceUnsub) _presenceUnsub();
  _presenceUnsub = onSnapshot(collection(db,'maw-presence'), snap=>{
    const now = Date.now(); const active=[]; const liveIds=new Set();
    snap.forEach(d=>{
      const p = d.data();
      if(now-p.ts<35000){ active.push(p); liveIds.add(p.id); }
      else { deleteDoc(doc(db,'maw-presence',d.id)).catch(()=>{}); }
    });
    liveIds.add(MY_PRESENCE_ID);
    _livePresenceIds = liveIds;
    renderPresence(active);
    try{ refreshWelcomeTaken(); }catch(e){}
    try{ renderCharacterTabs(); }catch(e){}
  }, ()=>{});
}
function renderPresence(players){
  const bar = el('presenceBar'); if(!bar) return;
  if(!players.length){ bar.innerHTML=''; return; }
  bar.innerHTML = players.map(p=>`<div class="presence-dot" style="border-color:${p.color};box-shadow:0 0 8px ${p.color}55" title="${esc(p.name)}"><span style="background:${p.color}"></span>${esc((p.name||'?').split(' ')[0])}</div>`).join('');
}
function isTakenByLiveOther(c){ return !!c.claimedBy && c.claimedBy!==MY_PRESENCE_ID && _livePresenceIds.has(c.claimedBy); }
setInterval(pushPresence, 20000);

// ================================================================
// RENDER ENGINE
// ================================================================
function render(){
  try{ renderCharacterTabs(); }catch(e){ console.error('tabs',e); }
  try{ renderHeader(); }catch(e){ console.error('header',e); }
  try{ renderMainFields(); }catch(e){ console.error('fields',e); }
  try{ renderStats(); }catch(e){ console.error('stats',e); }
  try{ renderSkillsMatrix(); }catch(e){ console.error('skills',e); }
  try{ renderCalcPanel(); }catch(e){ console.error('calc',e); }
  try{ renderRankBadge(); }catch(e){}
  try{ renderRelationships(); }catch(e){}
  try{ renderWeapons(); }catch(e){}
  try{ renderInventory(); }catch(e){}
  try{ renderAnomalies(); }catch(e){}
  try{ renderAbilities(); }catch(e){}
  try{ renderShop(); }catch(e){}
  try{ renderDeathSaves(); }catch(e){}
  try{ renderDmPanel(); }catch(e){}
  try{ applyCharacterAccents(); }catch(e){}
  try{ renderTabs(); }catch(e){}
  try{ pushPresence(); }catch(e){}
  if(spectator) disableAllInputs();
}

function renderTabs(){
  document.querySelectorAll('.tab-btn[data-tab]').forEach(b=>b.classList.toggle('active', b.dataset.tab===state.activeTab));
  document.querySelectorAll('.tab-content[data-tab]').forEach(t=>t.classList.toggle('active', t.dataset.tab===state.activeTab));
  try {
    switch(state.activeTab){
      case 'skills':    renderSkillsMatrix(); break;
      case 'loadout':   renderWeapons(); renderInventory(); break;
      case 'relations': renderRelationships(); break;
      case 'anomalies': renderAnomalies(); break;
      case 'abilities': renderAbilities(); break;
      case 'shop':      renderShop(); break;
    }
  } catch(e){}
}

function renderCharacterTabs(){
  const tabs = el('characterTabs'); if(!tabs) return; tabs.innerHTML='';
  state.characters.forEach((c,i)=>{
    if(c.state==='reserve' && !state.showReserve && !dmUnlocked) return;
    const isSel = i===state.selectedCharacter;
    const isOwn = c.claimedBy===MY_PRESENCE_ID;
    const taken = isTakenByLiveOther(c);
    const rk = rankOf(c);
    const btn = document.createElement('button'); btn.type='button';
    btn.className = `character-tab${c.state==='reserve'?' reserve':''}${c.state==='dead'?' dead':''}${isSel?' active':''}${isOwn?' owned':''}`;
    const pct = c.hp.max>0?clamp(c.hp.current/c.hp.max*100,0,100):0;
    const hpColor = pct>50?'#5a9a78':pct>25?'#c2a23a':'#d94f4f';
    btn.innerHTML = `
      <div class="ctab-top">
        <span class="ctab-rank" style="color:${rk.color}">${rk.id}</span>
        <span class="ctab-name">${esc(c.name||`Agent ${i+1}`)}</span>
        ${isOwn?'<span class="ctab-badge you">YOU</span>':taken?'<span class="ctab-badge taken">●</span>':''}
      </div>
      <span class="ctab-sub">${esc(c.role||c.codename||'—')}</span>
      <div class="ctab-hp"><div class="ctab-hp-fill" style="width:${pct}%;background:${hpColor}"></div></div>`;
    if(dmUnlocked||spectator){
      btn.addEventListener('click', ()=>{ state.selectedCharacter=i; render(); });
    } else {
      btn.style.cursor='default';
      if(!isOwn) btn.classList.add('locked-tab');
    }
    tabs.appendChild(btn);
  });
}

function renderHeader(){
  const c = getChar();
  const s = (id,v)=>{ const e=el(id); if(e) e.textContent=v; };
  const rk = rankOf(c);
  s('topAgentName', c.name||'—');
  s('topAgentRole', c.role||c.codename||'Unassigned');
  s('topRank', `${rk.tier} · ${rk.title}`);
  s('topPoints', fmtPoints(c.points)+' pts');
  s('topHpMini', `${c.hp.current} / ${c.hp.max}`);
  s('topSanityMini', `${c.sanity.current} / ${c.sanity.max}`);
  s('topArmorMini', c.armor);
  s('dmSelectedName', c.name||'—');
  const hpPct = c.hp.max>0?(c.hp.current/c.hp.max)*100:0;
  const sPct  = c.sanity.max>0?(c.sanity.current/c.sanity.max)*100:0;
  const hb=el('topHpBar'); if(hb) hb.style.width=clamp(hpPct,0,100)+'%';
  const sb=el('topSanityBar'); if(sb) sb.style.width=clamp(sPct,0,100)+'%';
  const rb=el('topRankBadge'); if(rb){ rb.textContent=rk.id; rb.style.color=rk.color; rb.style.borderColor=rk.color; }
}

function renderRankBadge(){
  const c = getChar();
  const rk = rankOf(c);
  const host = el('rankDisplay'); if(!host) return;
  host.innerHTML = RANKS.map(r=>`
    <div class="rank-pip ${r.id===c.rank?'active':''}" style="--rk:${r.color}">
      <span class="rank-pip-id">${r.id}</span>
      <span class="rank-pip-title">${r.title}</span>
    </div>`).join('');
}

// ── MAIN FIELDS ──
function renderMainFields(){
  const c = getChar();
  const sv = (id,v)=>{ const e=el(id); if(e && document.activeElement!==e) e.value=(v==null?'':v); };
  sv('charName',c.name); sv('charCodename',c.codename); sv('charRole',c.role);
  sv('charClearance',c.clearance); sv('charAge',c.age); sv('charLevel',c.level);
  sv('charBackground',c.background); sv('charDivision',c.division); sv('charSite',c.site);
  sv('charSpeed',c.speed); sv('charArmor',c.armor); sv('charTempHp',c.tempHp);
  sv('currentHp',c.hp.current); sv('maxHp',c.hp.max);
  sv('currentSanity',c.sanity.current); sv('maxSanity',c.sanity.max);
  sv('charPoints',c.points);
  const initDisp = el('initiativeDisplay'); if(initDisp) initDisp.value = fmtMod(calcInitiative(c));
  const pp = el('passivePerc'); if(pp) pp.textContent = passivePerception(c);
  // portrait
  const slot = el('portraitSlot');
  if(slot){
    if(c.portrait) slot.style.backgroundImage = `url(${c.portrait})`;
    else slot.style.backgroundImage = '';
    slot.classList.toggle('has-img', !!c.portrait);
  }
  // rank select in profile
  const rkSel = el('charRank'); if(rkSel && document.activeElement!==rkSel) rkSel.value = c.rank;
  // state radios
  ['Active','Reserve','Dead'].forEach(st=>{
    const r = el('state'+st); if(r) r.checked = c.state===st.toLowerCase();
  });
}

// ── STATS ──
function renderStats(){
  const c = getChar();
  const grid = el('statsGrid'); if(!grid) return;
  grid.innerHTML = STATS.map(st=>{
    const score = c.stats[st];
    const m = mod(score);
    return `
    <div class="stat-block">
      <div class="stat-label">${st}<span class="stat-sub">${STAT_LABELS[st]}</span></div>
      <div class="stat-mod">${fmtMod(m)}</div>
      <div class="stat-score-row">
        <button class="stat-adj" data-stat="${st}" data-action="minus">−</button>
        <input class="stat-score" id="stat_${st}" type="number" value="${score}" data-stat="${st}">
        <button class="stat-adj" data-stat="${st}" data-action="plus">+</button>
      </div>
    </div>`;
  }).join('');
  grid.querySelectorAll('.stat-score').forEach(inp=>{
    inp.addEventListener('input', e=>{ c.stats[e.target.dataset.stat]=Number(e.target.value)||0; pushState(); renderStats(); renderSkillsMatrix(); renderCalcPanel(); renderHeader(); });
  });
  grid.querySelectorAll('.stat-adj').forEach(btn=>{
    btn.addEventListener('click', ()=>{ const st=btn.dataset.stat; c.stats[st]=(Number(c.stats[st])||0)+(btn.dataset.action==='plus'?1:-1); pushState(); renderStats(); renderSkillsMatrix(); renderCalcPanel(); renderHeader(); });
  });
}

// ── SKILLS MATRIX ──
function renderSkillsMatrix(){
  const c = getChar();
  const host = el('skillsMatrix'); if(!host) return;
  host.innerHTML = SKILL_DEFS.map(def=>{
    const sk = c.skills[def.name] || {prof:false,expert:false,misc:0};
    const total = skillTotal(c, def.name);
    const isSense = def.name==='Sensitivity';
    return `
    <div class="skill-row${def.isSave?' save-row':''}${isSense?' sense-row':''}" data-skill="${esc(def.name)}">
      <div class="skill-prof">
        <button class="prof-dot ${sk.prof?'on':''}" data-skill="${esc(def.name)}" data-kind="prof" title="Trained"></button>
        <button class="prof-dot expert ${sk.expert?'on':''}" data-skill="${esc(def.name)}" data-kind="expert" title="Specialist (x2)"></button>
      </div>
      <div class="skill-name">${esc(def.name)}${isSense?' <span class="sense-tag">◈</span>':''}</div>
      <div class="skill-stat">${def.stat}</div>
      <div class="skill-total">${fmtMod(total)}</div>
    </div>`;
  }).join('');
  host.querySelectorAll('.prof-dot').forEach(dot=>{
    dot.addEventListener('click', ()=>{
      const name = dot.dataset.skill, kind = dot.dataset.kind;
      const sk = c.skills[name];
      if(kind==='prof'){ sk.prof=!sk.prof; if(!sk.prof) sk.expert=false; }
      else { sk.expert=!sk.expert; if(sk.expert) sk.prof=true; }
      pushState(true); renderSkillsMatrix(); renderCalcPanel();
    });
  });
}

// ── CALC PANEL ──
function renderCalcPanel(){
  const c = getChar();
  const host = el('calcPanel'); if(!host) return;
  const pb = profBonus(c);
  host.innerHTML = `
    <div class="calc-grid">
      <div class="calc-cell"><span class="calc-k">Prof. Bonus</span><span class="calc-v">${fmtMod(pb)}</span></div>
      <div class="calc-cell"><span class="calc-k">Initiative</span><span class="calc-v">${fmtMod(calcInitiative(c))}</span></div>
      <div class="calc-cell"><span class="calc-k">Attack</span><span class="calc-v">${fmtMod(attackBonus(c))}</span></div>
      <div class="calc-cell"><span class="calc-k">Passive Perc.</span><span class="calc-v">${passivePerception(c)}</span></div>
      <div class="calc-cell"><span class="calc-k">Sensitivity</span><span class="calc-v">${fmtMod(skillTotal(c,'Sensitivity'))}</span></div>
      <div class="calc-cell"><span class="calc-k">Armor Class</span><span class="calc-v">${c.armor}</span></div>
    </div>
    <div class="calc-settings">
      <label class="calc-set"><span>PB Override</span><input id="pbOverrideInp" type="number" value="${c.profBonusOverride??''}" placeholder="auto"></label>
      <label class="calc-set"><span>Init Bonus</span><input id="initBonusInp" type="number" value="${c.initiativeBonus||0}"></label>
      <label class="calc-set"><span>Attack Stat</span>
        <select id="attackStatSel">${STATS.map(s=>`<option value="${s}" ${c.attackStat===s?'selected':''}>${s}</option>`).join('')}</select>
      </label>
    </div>`;
  el('pbOverrideInp')?.addEventListener('input', e=>{ const v=e.target.value.trim(); c.profBonusOverride = v===''?null:Number(v); pushState(); renderCalcPanel(); renderSkillsMatrix(); renderHeader(); });
  el('initBonusInp')?.addEventListener('input', e=>{ c.initiativeBonus=Number(e.target.value)||0; pushState(); renderCalcPanel(); });
  el('attackStatSel')?.addEventListener('change', e=>{ c.attackStat=e.target.value; pushState(true); renderCalcPanel(); });
}

// ── DEATH SAVES ──
function renderDeathSaves(){
  const c = getChar();
  const host = el('deathSaves'); if(!host) return;
  const ds = c.deathSaves;
  host.innerHTML = `
    <div class="ds-row"><span class="ds-label">Successes</span><div class="ds-pips">${[0,1,2].map(i=>`<button class="ds-pip succ ${i<ds.successes?'on':''}" data-kind="successes" data-i="${i}"></button>`).join('')}</div></div>
    <div class="ds-row"><span class="ds-label">Failures</span><div class="ds-pips">${[0,1,2].map(i=>`<button class="ds-pip fail ${i<ds.failures?'on':''}" data-kind="failures" data-i="${i}"></button>`).join('')}</div></div>`;
  host.querySelectorAll('.ds-pip').forEach(p=>{
    p.addEventListener('click', ()=>{
      const kind=p.dataset.kind, i=parseInt(p.dataset.i);
      ds[kind] = (ds[kind]===i+1)?i:i+1;
      pushState(true); renderDeathSaves();
    });
  });
}

// ================================================================
// WEAPONS
// ================================================================
function renderWeapons(){
  const c = getChar();
  const host = el('weaponsList'); if(!host) return;
  if(!Array.isArray(c.weapons)) c.weapons=[];
  if(!c.weapons.length){ host.innerHTML = `<div class="empty-note">No weapons logged.</div>`; return; }
  host.innerHTML = c.weapons.map((w,i)=>`
    <div class="wpn-card train-${(w.training||'Untrained').toLowerCase()}">
      <div class="wpn-head">
        <input class="wpn-name" data-i="${i}" value="${esc(w.name||'')}" placeholder="Weapon name">
        <span class="wpn-train-badge train-${(w.training||'Untrained').toLowerCase()}">${esc(w.training||'Untrained')}</span>
        <button class="wpn-del" data-i="${i}">✕</button>
      </div>
      <div class="wpn-stats">
        <label><span>Damage</span><input class="wpn-dmg" data-i="${i}" value="${esc(w.damage||'')}" placeholder="2d6"></label>
        <label><span>Type</span><select class="wpn-type" data-i="${i}">${DMG_TYPES.map(t=>`<option ${w.dmgType===t?'selected':''}>${t}</option>`).join('')}</select></label>
        <label><span>Range</span><input class="wpn-range" data-i="${i}" value="${esc(w.range||'')}" placeholder="Melee / 60ft"></label>
        <label><span>Training</span><select class="wpn-training" data-i="${i}">${TRAINING.map(t=>`<option ${w.training===t?'selected':''}>${t}</option>`).join('')}</select></label>
      </div>
      <textarea class="wpn-notes" data-i="${i}" placeholder="Notes, properties, anomalous effects…">${esc(w.notes||'')}</textarea>
    </div>`).join('');
  const upd = (sel,key)=> host.querySelectorAll(sel).forEach(inp=> inp.addEventListener('input', ()=>{ c.weapons[+inp.dataset.i][key]=inp.value; pushState(); }));
  upd('.wpn-name','name'); upd('.wpn-dmg','damage'); upd('.wpn-range','range'); upd('.wpn-notes','notes');
  host.querySelectorAll('.wpn-type').forEach(s=> s.addEventListener('change',()=>{ c.weapons[+s.dataset.i].dmgType=s.value; pushState(true); }));
  host.querySelectorAll('.wpn-training').forEach(s=> s.addEventListener('change',()=>{ c.weapons[+s.dataset.i].training=s.value; pushState(true); renderWeapons(); }));
  host.querySelectorAll('.wpn-del').forEach(b=> b.addEventListener('click',()=>{ c.weapons.splice(+b.dataset.i,1); pushState(true); renderWeapons(); }));
}
function addWeapon(){ const c=getChar(); if(!Array.isArray(c.weapons))c.weapons=[]; c.weapons.push({name:'',damage:'',dmgType:'Ballistic',range:'',training:'Untrained',notes:''}); pushState(true); renderWeapons(); }

// ================================================================
// INVENTORY  (qty-tracked, categorized, value for shop sell)
// ================================================================
function renderInventory(){
  const c = getChar();
  const host = el('inventoryList'); if(!host) return;
  if(!Array.isArray(c.inventory)) c.inventory=[];
  const totalVal = c.inventory.reduce((s,it)=> s + (Number(it.value)||0)*(Number(it.qty)||1), 0);
  const tv = el('inventoryValue'); if(tv) tv.textContent = fmtPoints(totalVal)+' pts';
  if(!c.inventory.length){ host.innerHTML = `<div class="empty-note">Inventory empty.</div>`; return; }
  host.innerHTML = c.inventory.map((it,i)=>`
    <div class="inv-item cat-${(it.category||'Misc').toLowerCase()}">
      <div class="inv-qty-ctrl">
        <button class="inv-q minus" data-i="${i}">−</button>
        <span class="inv-q-num">${Number(it.qty)||1}</span>
        <button class="inv-q plus" data-i="${i}">+</button>
      </div>
      <input class="inv-name" data-i="${i}" value="${esc(it.name||'')}" placeholder="Item">
      <select class="inv-cat" data-i="${i}">${ITEM_CATEGORIES.map(t=>`<option ${it.category===t?'selected':''}>${t}</option>`).join('')}</select>
      <div class="inv-val"><input class="inv-value" data-i="${i}" type="number" value="${it.value??''}" placeholder="0"><span>pts</span></div>
      ${canEdit()? `<button class="inv-sell" data-i="${i}" title="Sell to MAW Inc.">SELL</button>`:''}
      <button class="inv-del" data-i="${i}">✕</button>
    </div>`).join('');
  host.querySelectorAll('.inv-name').forEach(inp=> inp.addEventListener('input',()=>{ c.inventory[+inp.dataset.i].name=inp.value; pushState(); }));
  host.querySelectorAll('.inv-value').forEach(inp=> inp.addEventListener('input',()=>{ c.inventory[+inp.dataset.i].value=Number(inp.value)||0; pushState(); renderInventory(); }));
  host.querySelectorAll('.inv-cat').forEach(s=> s.addEventListener('change',()=>{ c.inventory[+s.dataset.i].category=s.value; pushState(true); renderInventory(); }));
  host.querySelectorAll('.inv-q.plus').forEach(b=> b.addEventListener('click',()=>{ const it=c.inventory[+b.dataset.i]; it.qty=(Number(it.qty)||1)+1; pushState(true); renderInventory(); }));
  host.querySelectorAll('.inv-q.minus').forEach(b=> b.addEventListener('click',()=>{ const it=c.inventory[+b.dataset.i]; it.qty=Math.max(1,(Number(it.qty)||1)-1); pushState(true); renderInventory(); }));
  host.querySelectorAll('.inv-del').forEach(b=> b.addEventListener('click',()=>{ c.inventory.splice(+b.dataset.i,1); pushState(true); renderInventory(); }));
  host.querySelectorAll('.inv-sell').forEach(b=> b.addEventListener('click',()=>{ sellItem(+b.dataset.i); }));
}
function addInventoryItem(){
  const c=getChar(); const name=el('invAddName')?.value.trim(); const qty=Math.max(1,Number(el('invAddQty')?.value)||1);
  if(!name) return;
  if(!Array.isArray(c.inventory)) c.inventory=[];
  c.inventory.push({name,qty,category:'Misc',value:0});
  el('invAddName').value=''; el('invAddQty').value='1';
  pushState(true); renderInventory();
  el('invAddName')?.focus();
}
function sellItem(i){
  const c=getChar(); const it=c.inventory[i]; if(!it) return;
  const unit = Number(it.value)||0;
  const refund = Math.floor(unit*0.5); // sell at 50%
  if(!confirm(`Sell 1× ${it.name} to Make a Wish Inc. for ${fmtPoints(refund)} pts?`)) return;
  c.points = (Number(c.points)||0) + refund;
  it.qty = (Number(it.qty)||1) - 1;
  if(it.qty<=0) c.inventory.splice(i,1);
  pushState(true); renderInventory(); renderHeader();
  showToast(`Sold ${it.name} · +${fmtPoints(refund)} pts`,'sell');
}

// ================================================================
// SHOP (DM-managed catalog; players buy with points)
// ================================================================
function renderShop(){
  const c = getChar();
  const host = el('shopList'); if(!host) return;
  const bal = el('shopBalance'); if(bal) bal.textContent = fmtPoints(c.points)+' pts';
  const myTier = RANK_TO_TIER[c.rank] || 1;
  // clearance banner
  const clr = el('shopClearance');
  if(clr) clr.innerHTML = `CLEARANCE <strong style="color:${TIER_COLOR[myTier]}">${TIER_LABEL[myTier]}</strong> — access to Tier ${myTier} requisitions and below`;

  if(!Array.isArray(state.shop) || !state.shop.length){
    host.innerHTML = `<div class="empty-note">The requisitions catalog is empty.${dmUnlocked?' Open the DM Panel → Requisitions and press <b>Load MAW Default Catalog</b> to stock it.':' The DM stocks it from the DM Panel.'}</div>`;
    return;
  }

  // Build a list of {item, realIndex} accessible at this tier, grouped by category
  const accessible = state.shop
    .map((item,i)=>({item,i}))
    .filter(({item})=> (Number(item.tier)||1) <= myTier);

  if(!accessible.length){
    host.innerHTML = `<div class="empty-note">No requisitions available at your clearance level.</div>`;
    return;
  }

  // group by category (in catalog order), then by tier within
  const cats = [...SHOP_CATEGORIES, 'Misc'].filter(cat => accessible.some(({item})=> (item.category||'Misc')===cat));
  // include any custom categories not in the standard list
  accessible.forEach(({item})=>{ const cc=item.category||'Misc'; if(!cats.includes(cc)) cats.push(cc); });

  host.innerHTML = cats.map(cat=>{
    const rows = accessible.filter(({item})=> (item.category||'Misc')===cat)
      .sort((a,b)=> (Number(a.item.tier)||1)-(Number(b.item.tier)||1) || (Number(a.item.price)||0)-(Number(b.item.price)||0));
    return `
    <div class="shop-cat-group">
      <div class="shop-cat-header">${esc(cat)}<span class="shop-cat-count">${rows.length}</span></div>
      ${rows.map(({item,i})=>{
        const price = Number(item.price)||0;
        const afford = (Number(c.points)||0) >= price;
        const out = item.stock!=null && item.stock<=0;
        const tier = Number(item.tier)||1;
        const stock = item.stock==null?'∞':item.stock;
        return `
        <div class="shop-item ${out?'out':''}" style="--tier-c:${TIER_COLOR[tier]}">
          <div class="shop-item-main">
            <div class="shop-item-name">${esc(item.name||'Item')}<span class="shop-tier-tag" style="color:${TIER_COLOR[tier]};border-color:${TIER_COLOR[tier]}">T${tier}</span></div>
            <div class="shop-item-meta"><span class="shop-stock">Stock: ${out?'SOLD OUT':stock}</span></div>
            ${item.desc?`<div class="shop-item-desc">${esc(item.desc)}</div>`:''}
          </div>
          <div class="shop-item-buy">
            <div class="shop-price">${fmtPoints(price)}<span>pts</span></div>
            ${canEdit()&&!out? `<button class="shop-buy-btn ${afford?'':'cant'}" data-i="${i}">${afford?'REQUISITION':'INSUFFICIENT'}</button>` : (out?'<span class="shop-out-tag">OUT</span>':'')}
          </div>
        </div>`;
      }).join('')}
    </div>`;
  }).join('');

  host.querySelectorAll('.shop-buy-btn').forEach(b=>{
    if(b.classList.contains('cant')) return;
    b.addEventListener('click', ()=> buyItem(+b.dataset.i));
  });
}
function buyItem(i){
  const c=getChar(); const item=state.shop[i]; if(!item) return;
  const myTier = RANK_TO_TIER[c.rank] || 1;
  const itemTier = Number(item.tier)||1;
  if(itemTier > myTier){ showToast(`Requires ${TIER_LABEL[itemTier]} clearance`,'warn'); return; }
  const price=Number(item.price)||0;
  if((Number(c.points)||0) < price){ showToast('Insufficient points','warn'); return; }
  if(item.stock!=null && item.stock<=0){ showToast('Sold out','warn'); return; }
  if(!confirm(`Requisition ${item.name} for ${fmtPoints(price)} pts?`)) return;
  c.points -= price;
  if(item.stock!=null) item.stock -= 1;
  if(!Array.isArray(c.inventory)) c.inventory=[];
  const existing = c.inventory.find(x=> x.name===item.name);
  if(existing) existing.qty = (Number(existing.qty)||1)+1;
  else c.inventory.push({ name:item.name, qty:1, category:mapShopCatToInv(item.category), value:Math.floor(price*0.5), notes:item.desc||'' });
  pushState(true); renderShop(); renderInventory(); renderHeader();
  showToast(`Acquired ${item.name}`,'buy');
}
// map a requisitions category to an inventory category bucket
function mapShopCatToInv(cat){
  switch(cat){
    case 'Combat': return 'Weapon';
    case 'Protection': return 'Armor';
    case 'Anomalous Items': return 'Anomalous';
    case 'Medical': case 'Warding & Barriers': return 'Consumable';
    case 'Tech & Detection': case 'Utility': case 'Containment': return 'Tool';
    default: return 'Misc';
  }
}

// ================================================================
// RELATIONSHIPS
// ================================================================
const REL_TYPES = ['Handler','Colleague','Asset','Rival','Threat','Superior','Subordinate','Contact','Unknown'];
function renderRelationships(){
  const c = getChar();
  const host = el('relationshipsList'); if(!host) return;
  if(!Array.isArray(c.relationships)) c.relationships=[];
  if(!c.relationships.length){ host.innerHTML = `<div class="empty-note">No personnel records.</div>`; return; }
  host.innerHTML = c.relationships.map((r,i)=>`
    <div class="rel-card">
      <div class="rel-head">
        <input class="rel-name" data-i="${i}" value="${esc(r.name||'')}" placeholder="Name">
        <select class="rel-type" data-i="${i}">${REL_TYPES.map(t=>`<option ${r.type===t?'selected':''}>${t}</option>`).join('')}</select>
        <button class="rel-del" data-i="${i}">✕</button>
      </div>
      <textarea class="rel-notes" data-i="${i}" placeholder="Dossier notes…">${esc(r.notes||'')}</textarea>
    </div>`).join('');
  host.querySelectorAll('.rel-name').forEach(inp=> inp.addEventListener('input',()=>{ c.relationships[+inp.dataset.i].name=inp.value; pushState(); }));
  host.querySelectorAll('.rel-notes').forEach(inp=> inp.addEventListener('input',()=>{ c.relationships[+inp.dataset.i].notes=inp.value; pushState(); }));
  host.querySelectorAll('.rel-type').forEach(s=> s.addEventListener('change',()=>{ c.relationships[+s.dataset.i].type=s.value; pushState(true); }));
  host.querySelectorAll('.rel-del').forEach(b=> b.addEventListener('click',()=>{ c.relationships.splice(+b.dataset.i,1); pushState(true); renderRelationships(); }));
}
function addRelationship(){ const c=getChar(); if(!Array.isArray(c.relationships))c.relationships=[]; c.relationships.push({name:'',type:'Colleague',notes:''}); pushState(true); renderRelationships(); }

// ================================================================
// ANOMALY LOG  (SCP-style bestiary)
// ================================================================
function renderAnomalies(){
  const c = getChar();
  const host = el('anomaliesList'); if(!host) return;
  if(!Array.isArray(c.anomalies)) c.anomalies=[];
  const cnt = el('anomalyCount'); if(cnt) cnt.textContent = `${c.anomalies.length} FILED`;
  if(!c.anomalies.length){ host.innerHTML = `<div class="empty-note big">⬡<br>NO ANOMALIES DOCUMENTED<br><span>File the entities you encounter — their behavior, threat, and containment.</span></div>`; return; }
  host.innerHTML = c.anomalies.map((a,i)=>{
    const tg = THREAT_BY_GRADE[a.threat] || THREAT_BY_GRADE['F'];
    const open = a._open!==false;
    return `
    <div class="anom-card ${open?'open':''}" style="--tg:${tg.color}">
      <div class="anom-head" data-toggle="${i}">
        <span class="anom-grade" style="background:${tg.color}">${a.threat||'F'}</span>
        <span class="anom-desig">${esc(a.desig||'MAW-???')}</span>
        <span class="anom-name">${esc(a.name||'Unidentified')}</span>
        <span class="anom-class">${esc(a.class||'Euclid')}</span>
        <span class="anom-chev">▾</span>
      </div>
      <div class="anom-body">
        <div class="anom-row">
          <label><span>Designation</span><input class="anom-f" data-i="${i}" data-k="desig" value="${esc(a.desig||'')}" placeholder="MAW-001"></label>
          <label><span>Name</span><input class="anom-f" data-i="${i}" data-k="name" value="${esc(a.name||'')}" placeholder="Entity name"></label>
        </div>
        <div class="anom-row">
          <label><span>Threat</span><select class="anom-f" data-i="${i}" data-k="threat">${THREAT_GRADES.map(t=>`<option value="${t.grade}" ${a.threat===t.grade?'selected':''}>${t.grade} · ${t.label}</option>`).join('')}</select></label>
          <label><span>Class</span><select class="anom-f" data-i="${i}" data-k="class">${ANOMALY_CLASSES.map(t=>`<option ${a.class===t?'selected':''}>${t}</option>`).join('')}</select></label>
        </div>
        <textarea class="anom-f anom-desc" data-i="${i}" data-k="desc" placeholder="Description, behavior, containment procedures, weaknesses…">${esc(a.desc||'')}</textarea>
        <div class="anom-actions"><button class="anom-del" data-i="${i}">DELETE FILE</button></div>
      </div>
    </div>`;
  }).join('');
  host.querySelectorAll('.anom-head').forEach(h=> h.addEventListener('click', e=>{
    if(e.target.closest('input,select,textarea')) return;
    const i=+h.dataset.toggle; c.anomalies[i]._open = !(c.anomalies[i]._open!==false); renderAnomalies();
  }));
  host.querySelectorAll('.anom-f').forEach(inp=>{
    const ev = inp.tagName==='SELECT'?'change':'input';
    inp.addEventListener(ev, ()=>{ c.anomalies[+inp.dataset.i][inp.dataset.k]=inp.value; pushState(inp.tagName==='SELECT'); if(inp.dataset.k==='threat'||inp.dataset.k==='desig'||inp.dataset.k==='name'||inp.dataset.k==='class') renderAnomalies(); });
  });
  host.querySelectorAll('.anom-del').forEach(b=> b.addEventListener('click',()=>{ if(confirm('Delete this anomaly file?')){ c.anomalies.splice(+b.dataset.i,1); pushState(true); renderAnomalies(); } }));
}
function addAnomaly(){ const c=getChar(); if(!Array.isArray(c.anomalies))c.anomalies=[]; c.anomalies.unshift({desig:'MAW-',name:'',threat:'F',class:'Euclid',desc:'',_open:true}); pushState(true); renderAnomalies(); }

// ================================================================
// ABILITIES / TALENTS
// ================================================================
function renderAbilities(){
  const c = getChar();
  const host = el('abilitiesList'); if(!host) return;
  if(!Array.isArray(c.abilities)) c.abilities=[];
  if(!c.abilities.length){ host.innerHTML = `<div class="empty-note">No talents or anomalous abilities recorded.</div>`; return; }
  host.innerHTML = c.abilities.map((a,i)=>`
    <div class="ability-card">
      <div class="ability-head">
        <input class="ab-name" data-i="${i}" value="${esc(a.name||'')}" placeholder="Talent / ability name">
        <button class="ab-del" data-i="${i}">✕</button>
      </div>
      <textarea class="ab-desc" data-i="${i}" placeholder="What it does, cost, cooldown…">${esc(a.desc||'')}</textarea>
    </div>`).join('');
  host.querySelectorAll('.ab-name').forEach(inp=> inp.addEventListener('input',()=>{ c.abilities[+inp.dataset.i].name=inp.value; pushState(); }));
  host.querySelectorAll('.ab-desc').forEach(inp=> inp.addEventListener('input',()=>{ c.abilities[+inp.dataset.i].desc=inp.value; pushState(); }));
  host.querySelectorAll('.ab-del').forEach(b=> b.addEventListener('click',()=>{ c.abilities.splice(+b.dataset.i,1); pushState(true); renderAbilities(); }));
}
function addAbility(){ const c=getChar(); if(!Array.isArray(c.abilities))c.abilities=[]; c.abilities.push({name:'',desc:''}); pushState(true); renderAbilities(); }

// ================================================================
// DM PANEL
// ================================================================
function renderDmPanel(){
  if(!dmUnlocked) return;
  // Player roster with rank + points controls
  const roster = el('dmRoster');
  if(roster){
    roster.innerHTML = state.characters.map((c,i)=>{
      const rk = rankOf(c);
      const st = c.state||'active';
      return `
      <div class="dm-agent state-${st} ${i===state.selectedCharacter?'sel':''}">
        <div class="dm-agent-top">
          <button class="dm-agent-pick" data-i="${i}">${esc(c.name||`Agent ${i+1}`)}</button>
          <span class="dm-agent-rank" style="color:${rk.color}">${rk.tier} · ${rk.title}</span>
          <span class="dm-agent-state-tag ${st}">${st==='active'?'ACTIVE':st==='reserve'?'RESERVE':'KIA'}</span>
        </div>
        <div class="dm-agent-controls">
          <label class="dm-mini"><span>Rank</span>
            <select class="dm-rank" data-i="${i}">${RANKS.map(r=>`<option value="${r.id}" ${c.rank===r.id?'selected':''}>${r.id} · ${r.title}</option>`).join('')}</select>
          </label>
          <label class="dm-mini"><span>Points</span>
            <input class="dm-points" data-i="${i}" type="number" value="${c.points||0}">
          </label>
          <label class="dm-mini"><span>Status</span>
            <select class="dm-state" data-i="${i}">
              <option value="active" ${st==='active'?'selected':''}>Active</option>
              <option value="reserve" ${st==='reserve'?'selected':''}>Reserve</option>
              <option value="dead" ${st==='dead'?'selected':''}>KIA</option>
            </select>
          </label>
        </div>
        <div class="dm-agent-actions">
          <span class="dm-pts-display">${fmtPoints(c.points)} pts</span>
          <button class="dm-agent-reserve" data-i="${i}" title="Toggle reserve">${st==='reserve'?'⟲ Reinstate':'⇩ To Reserve'}</button>
          <button class="dm-agent-del" data-i="${i}" title="Terminate record">✕ Delete</button>
        </div>
      </div>`;
    }).join('');
    roster.querySelectorAll('.dm-agent-pick').forEach(b=> b.addEventListener('click',()=>{ state.selectedCharacter=+b.dataset.i; render(); }));
    roster.querySelectorAll('.dm-rank').forEach(s=> s.addEventListener('change',()=>{ state.characters[+s.dataset.i].rank=s.value; pushState(true); render(); }));
    roster.querySelectorAll('.dm-points').forEach(inp=> inp.addEventListener('input',()=>{ state.characters[+inp.dataset.i].points=Math.max(0,Number(inp.value)||0); pushState(); renderHeader(); }));
    roster.querySelectorAll('.dm-state').forEach(s=> s.addEventListener('change',()=>{ state.characters[+s.dataset.i].state=s.value; pushState(true); render(); }));
    roster.querySelectorAll('.dm-agent-reserve').forEach(b=> b.addEventListener('click',()=>{ const c=state.characters[+b.dataset.i]; c.state = c.state==='reserve'?'active':'reserve'; pushState(true); render(); showToast(c.state==='reserve'?`${c.name||'Agent'} moved to reserve`:`${c.name||'Agent'} reinstated`,'info'); }));
    roster.querySelectorAll('.dm-agent-del').forEach(b=> b.addEventListener('click',()=> dmDeleteAgent(+b.dataset.i)));
  }

  // Mission point award by threat grade
  const award = el('dmAwardGrades');
  if(award){
    award.innerHTML = THREAT_GRADES.map(t=>`
      <button class="grade-btn" data-grade="${t.grade}" style="--gc:${t.color}">
        <span class="grade-letter">${t.grade}</span>
        <span class="grade-pts">${fmtPoints(t.points)}${t.grade==='S'?'+':''}</span>
        <span class="grade-label">${t.label}</span>
      </button>`).join('');
    award.querySelectorAll('.grade-btn').forEach(b=> b.addEventListener('click',()=> awardMissionPoints(b.dataset.grade)));
  }

  // Shop management
  renderDmShop();
}

function awardMissionPoints(grade){
  const tg = THREAT_BY_GRADE[grade]; if(!tg) return;
  const targetSel = el('dmAwardTarget');
  const idx = targetSel ? parseInt(targetSel.value) : state.selectedCharacter;
  const missionName = el('dmMissionName')?.value.trim() || `Grade ${grade} Operation`;
  let amount = tg.points;
  if(grade==='S'){
    const custom = prompt('Grade S — enter point award (50,000+):', '50000');
    if(custom==null) return;
    amount = Math.max(50000, Number(custom)||50000);
  }
  const applyTo = idx===-1 ? state.characters.filter(c=>c.state==='active') : [state.characters[idx]];
  applyTo.forEach(c=>{
    if(!c) return;
    c.points = (Number(c.points)||0) + amount;
    if(!Array.isArray(c.missions)) c.missions=[];
    c.missions.unshift({ name:missionName, grade, points:amount, ts:Date.now() });
  });
  if(el('dmMissionName')) el('dmMissionName').value='';
  pushState(true); render();
  const who = idx===-1?'all active agents':(state.characters[idx]?.name||'agent');
  showToast(`Awarded ${fmtPoints(amount)} pts to ${who} · Grade ${grade}`,'buy');
}

function renderDmShop(){
  const host = el('dmShopList'); if(!host) return;
  if(!Array.isArray(state.shop)) state.shop=[];
  // header: count + reset/seed control
  const meta = el('dmShopMeta');
  if(meta) meta.textContent = `${state.shop.length} items stocked`;

  host.innerHTML = state.shop.length ? state.shop.map((it,i)=>`
    <div class="dm-shop-row" style="--tier-c:${TIER_COLOR[Number(it.tier)||1]}">
      <input class="ds-name" data-i="${i}" value="${esc(it.name||'')}" placeholder="Item name">
      <select class="ds-tier" data-i="${i}" title="Required tier">${[1,2,3,4].map(t=>`<option value="${t}" ${(Number(it.tier)||1)===t?'selected':''}>T${t}</option>`).join('')}</select>
      <select class="ds-cat" data-i="${i}">${SHOP_CATEGORIES.map(t=>`<option ${it.category===t?'selected':''}>${t}</option>`).join('')}</select>
      <input class="ds-price" data-i="${i}" type="number" value="${it.price||0}" placeholder="Price" title="Price in points">
      <input class="ds-stock" data-i="${i}" type="number" value="${it.stock==null?'':it.stock}" placeholder="∞" title="Stock (blank = unlimited)">
      <button class="ds-del" data-i="${i}">✕</button>
    </div>
    <input class="ds-desc" data-i="${i}" value="${esc(it.desc||'')}" placeholder="Short description (optional)">
  `).join('') : `<div class="empty-note">No items stocked. Add requisitions below, or load the default MAW catalog.</div>`;
  host.querySelectorAll('.ds-name').forEach(inp=> inp.addEventListener('input',()=>{ state.shop[+inp.dataset.i].name=inp.value; pushState(); }));
  host.querySelectorAll('.ds-desc').forEach(inp=> inp.addEventListener('input',()=>{ state.shop[+inp.dataset.i].desc=inp.value; pushState(); }));
  host.querySelectorAll('.ds-price').forEach(inp=> inp.addEventListener('input',()=>{ state.shop[+inp.dataset.i].price=Math.max(0,Number(inp.value)||0); pushState(); }));
  host.querySelectorAll('.ds-stock').forEach(inp=> inp.addEventListener('input',()=>{ const v=inp.value.trim(); state.shop[+inp.dataset.i].stock = v===''?null:Math.max(0,Number(v)||0); pushState(); }));
  host.querySelectorAll('.ds-cat').forEach(s=> s.addEventListener('change',()=>{ state.shop[+s.dataset.i].category=s.value; pushState(true); }));
  host.querySelectorAll('.ds-tier').forEach(s=> s.addEventListener('change',()=>{ state.shop[+s.dataset.i].tier=Number(s.value)||1; pushState(true); renderDmShop(); }));
  host.querySelectorAll('.ds-del').forEach(b=> b.addEventListener('click',()=>{ state.shop.splice(+b.dataset.i,1); pushState(true); renderDmShop(); renderShop(); }));
  // populate award target dropdown
  const tgt = el('dmAwardTarget');
  if(tgt){
    const cur = tgt.value;
    tgt.innerHTML = `<option value="-1">★ All Active Agents</option>` + state.characters.map((c,i)=>`<option value="${i}">${esc(c.name||`Agent ${i+1}`)}</option>`).join('');
    if(cur) tgt.value = cur;
  }
}
function addShopItem(){ if(!Array.isArray(state.shop)) state.shop=[]; state.shop.push({tier:1,name:'',category:'Utility',price:100,stock:null,desc:''}); pushState(true); renderDmShop(); renderShop(); }
function loadDefaultCatalog(replace){
  const def = (window.MAW_DEFAULT_SHOP||[]).map(x=>({ ...x, stock:null }));
  if(!def.length){ showToast('Default catalog not found','warn'); return; }
  if(replace){
    if(!confirm(`Replace the entire catalog with the ${def.length}-item MAW default? Current items will be removed.`)) return;
    state.shop = def;
  } else {
    // append only items not already present by name
    const have = new Set(state.shop.map(i=>i.name));
    const add = def.filter(i=>!have.has(i.name));
    if(!add.length){ showToast('Default items already loaded','info'); return; }
    state.shop = state.shop.concat(add);
  }
  pushState(true); renderDmShop(); renderShop();
  showToast(`Catalog loaded · ${state.shop.length} items`,'buy');
}

// ── DM CHARACTER MANAGEMENT ──
function dmDeleteAgent(i){
  const c = state.characters[i]; if(!c) return;
  if(state.characters.length<=1){ showToast('Cannot delete the last personnel file','warn'); return; }
  if(!confirm(`TERMINATE personnel record for ${c.name||`Agent ${i+1}`}?\n\nThis permanently deletes the file for everyone.`)) return;
  state.characters.splice(i,1);
  if(state.selectedCharacter>=state.characters.length) state.selectedCharacter = state.characters.length-1;
  pushState(true); render();
  showToast(`Record terminated: ${c.name||'Agent'}`,'warn');
}
function dmAddAgent(){
  const nc = blankChar(state.characters.length);
  nc.state = 'reserve';
  state.characters.push(nc);
  state.selectedCharacter = state.characters.length-1;
  state.showReserve = true;
  pushState(true); render();
  showToast('New personnel file created (Reserve)','buy');
}

// ================================================================
// RESOURCE ADJUST (HP / Sanity / Points quick buttons)
// ================================================================
function adjustResource(resource, amt){
  const c = getChar();
  if(resource==='hp'){ c.hp.current = clamp((c.hp.current||0)+amt, 0, c.hp.max); }
  else if(resource==='sanity'){ c.sanity.current = clamp((c.sanity.current||0)+amt, 0, c.sanity.max); }
  else if(resource==='points'){ c.points = Math.max(0,(Number(c.points)||0)+amt); }
  ensureClamp(c); pushState(true); renderMainFields(); renderHeader();
}

// ================================================================
// TOASTS
// ================================================================
let _toastTimer = null;
function showToast(msg, kind='info', dur=3200){
  let t = el('toastEl');
  if(!t){ t=document.createElement('div'); t.id='toastEl'; t.className='toast'; document.body.appendChild(t); }
  t.textContent = msg; t.className = 'toast show '+kind;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(()=>{ t.className='toast '+kind; }, dur);
}

// ================================================================
// BROADCAST — full-screen eerie takeover, pushed by the DM
// ================================================================
let _broadcastUnsub = null;
let _lastBroadcastTs = 0;

async function sendBroadcast(msg){
  if(!dmUnlocked) return;
  try { await setDoc(doc(db,'maw-meta','broadcast'), { msg, ts:Date.now(), cleared:false }); }
  catch(e){ console.error(e); }
}
async function clearBroadcast(){
  try { await setDoc(doc(db,'maw-meta','broadcast'), { msg:'', ts:Date.now(), cleared:true }); }
  catch(e){ console.error(e); }
}
function startBroadcastListener(){
  if(_broadcastUnsub) _broadcastUnsub();
  const _loadTime = Date.now();
  _broadcastUnsub = onSnapshot(doc(db,'maw-meta','broadcast'), snap=>{
    if(!snap.exists()) return;
    const d = snap.data();
    if(d.ts && d.ts > _lastBroadcastTs){
      _lastBroadcastTs = d.ts;
      if(d.cleared || !d.msg){ removeBroadcastScreen(); return; }
      // Don't let a stale broadcast (sent long before this page loaded) ambush a new visitor.
      // Only auto-show broadcasts that are fresh (within 2h) OR sent after we loaded.
      const age = Date.now() - d.ts;
      const isFresh = age < 2*60*60*1000;          // under 2 hours old
      const sentAfterLoad = d.ts >= _loadTime - 5000;
      if(isFresh || sentAfterLoad) showBroadcastScreen(d.msg);
    }
  }, ()=>{});
}
function removeBroadcastScreen(){ el('broadcastScreen')?.remove(); }
function showBroadcastScreen(msg){
  const alreadyShowing = !!el('broadcastScreen');
  removeBroadcastScreen();
  const ov = document.createElement('div');
  ov.id = 'broadcastScreen';
  ov.className = alreadyShowing ? 'broadcast-screen no-intro' : 'broadcast-screen';
  const canDismiss = dmUnlocked;
  ov.innerHTML = `
    <div class="bcs-noise"></div>
    <div class="bcs-scan"></div>
    <div class="bcs-vignette"></div>
    ${canDismiss ? `
    <div class="bcs-pin">
      <span class="bcs-pin-label">ADMIN CONTROLS</span>
      <button class="bcs-pin-edit" id="bcsPinEdit" title="Jump to editor">✎ EDIT</button>
      <button class="bcs-pin-end" id="bcsPinEnd" title="End the transmission for everyone">▣ END</button>
    </div>` : ''}
    <div class="bcs-scroll">
      <div class="bcs-inner">
        <div class="bcs-head">
          <span class="bcs-dot"></span>
          <span class="bcs-channel">MAKE A WISH INCORPORATED · INTERNAL BROADCAST</span>
          <span class="bcs-dot"></span>
        </div>
        <div class="bcs-tag">// PRIORITY TRANSMISSION //</div>
        <div class="bcs-message" id="bcsMessage"></div>
        <div class="bcs-foot">
          <span>THIS MESSAGE IS MANDATORY VIEWING</span>
          <span class="bcs-id">REF ${Math.random().toString(36).slice(2,8).toUpperCase()}-${new Date().getFullYear()}</span>
        </div>
        ${canDismiss ? `
        <div class="bcs-dm-bar" id="bcsDmBar">
          <textarea class="bcs-dm-input" id="bcsDmInput" placeholder="Amend or extend the transmission… (this replaces the message on every screen)"></textarea>
          <div class="bcs-dm-actions">
            <button class="bcs-dm-update" id="bcsUpdate">⟳ UPDATE MESSAGE</button>
            <button class="bcs-dm-append" id="bcsAppend">＋ APPEND LINE</button>
            <button class="bcs-dismiss" id="bcsDismiss">▣ END TRANSMISSION</button>
          </div>
        </div>` : `
        <div class="bcs-wait">AWAITING CLEARANCE FROM ADMINISTRATOR…</div>
        <button class="bcs-admin-login" id="bcsAdminLogin">⚿ ADMINISTRATOR OVERRIDE</button>`}
      </div>
    </div>`;
  document.body.appendChild(ov);
  // typewriter reveal for eerie effect
  const target = el('bcsMessage');
  const text = String(msg);
  let idx = 0;
  target.classList.add('typing');
  const tick = ()=>{
    if(idx<=text.length){ target.textContent = text.slice(0,idx); idx++; setTimeout(tick, 34); }
    else { target.classList.remove('typing'); }
  };
  tick();
  // pre-fill the DM editor with the current message so they can edit in place
  const dmInput = el('bcsDmInput');
  if(dmInput) dmInput.value = text;
  el('bcsUpdate')?.addEventListener('click', ()=>{
    const v = el('bcsDmInput')?.value.trim();
    if(!v){ showToast('Message is empty','warn'); return; }
    sendBroadcast(v);   // re-broadcast → all screens (incl. this one) re-render via snapshot
    showToast('Transmission updated','info');
  });
  el('bcsAppend')?.addEventListener('click', ()=>{
    const extra = el('bcsDmInput')?.value.trim();
    if(!extra){ showToast('Nothing to append','warn'); return; }
    const current = el('bcsMessage')?.textContent || '';
    const combined = current ? (current + '\n' + extra) : extra;
    sendBroadcast(combined);
    if(el('bcsDmInput')) el('bcsDmInput').value = combined;
    showToast('Line appended to transmission','info');
  });
  el('bcsDismiss')?.addEventListener('click', ()=>{ clearBroadcast(); removeBroadcastScreen(); });
  // Always-visible pinned controls
  el('bcsPinEnd')?.addEventListener('click', ()=>{ clearBroadcast(); removeBroadcastScreen(); });
  el('bcsPinEdit')?.addEventListener('click', ()=>{
    const bar = el('bcsDmBar');
    bar?.scrollIntoView({ behavior:'smooth', block:'center' });
    el('bcsDmInput')?.focus();
  });
  // Non-DM: administrator override — log in as DM right from the broadcast screen
  el('bcsAdminLogin')?.addEventListener('click', ()=>{
    const pass = prompt('Administrator access code:');
    if(pass===null) return;
    if(pass !== DM_PASS){ showToast('Access denied','warn'); return; }
    dmUnlocked = true; sessionStorage.setItem('maw-dm','1');
    render();
    // re-render the broadcast screen so DM controls now appear
    showBroadcastScreen(el('bcsMessage')?.textContent || msg);
    showToast('Administrator access granted','buy');
  });
}

// ================================================================
// WELCOME / CLAIM
// ================================================================
function checkWelcome(){
  if(spectator){ applySpectatorMode(); return; }
  if(dmUnlocked) return;
  el('welcomeOverlay')?.remove();
  const activeChars = state.characters.filter(c=>c.state==='active' && c.name);
  if(!activeChars.length) return;
  // if already claimed by me, skip
  if(getMyCharacter()) return;
  buildWelcome();
}
function recheckWelcomeIfNeeded(){
  if(spectator||dmUnlocked) return;
  if(getMyCharacter()) { el('welcomeOverlay')?.remove(); }
}
function buildWelcome(){
  const ov = document.createElement('div');
  ov.id='welcomeOverlay'; ov.className='welcome-overlay';
  ov.innerHTML = `
    <div class="welcome-box">
      <div class="welcome-logo"><img src="MW.png" alt="MAW" class="welcome-logo-img"></div>
      <div class="welcome-title">MAKE A WISH<span>INCORPORATED</span></div>
      <div class="welcome-sub">PERSONNEL IDENTIFICATION REQUIRED</div>
      <div class="welcome-charlist" id="welcomeCharList"></div>
      <div class="welcome-actions">
        <button class="maw-btn ghost" id="welcomeSkipBtn">I'm just watching</button>
        <button class="maw-btn dm" id="welcomeDmBtn">⚿ Administrator Access</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  const list = el('welcomeCharList');
  state.characters.forEach((c,realIdx)=>{
    if(c.state!=='active') return;
    const taken = isTakenByLiveOther(c);
    const rk = rankOf(c);
    const btn = document.createElement('button');
    btn.className = `welcome-char ${taken?'taken':''}`;
    btn.dataset.welcomeIdx = realIdx;
    btn.disabled = taken;
    btn.innerHTML = `
      ${c.portrait?`<img src="${c.portrait}" class="welcome-portrait">`:`<div class="welcome-portrait-empty">${(c.name||'?')[0].toUpperCase()}</div>`}
      <span class="welcome-char-name">${esc(c.name||`Agent ${realIdx+1}`)}</span>
      <span class="welcome-char-rank" style="color:${rk.color}">${rk.tier}</span>
      ${taken?'<span class="welcome-taken-label">IN USE</span>':''}`;
    btn.addEventListener('click', ()=>{ if(btn.disabled) return; claimCharacter(realIdx); el('welcomeOverlay')?.remove(); showToast(`Identity confirmed: ${c.name}`,'buy'); });
    list.appendChild(btn);
  });
  el('welcomeSkipBtn')?.addEventListener('click', ()=>{ spectator=true; sessionStorage.setItem('maw-spectator','1'); el('welcomeOverlay')?.remove(); applySpectatorMode(); render(); });
  el('welcomeDmBtn')?.addEventListener('click', ()=>{ el('welcomeOverlay')?.remove(); openDmLogin(); });
}
function refreshWelcomeTaken(){
  const list = el('welcomeCharList'); if(!list) return;
  state.characters.forEach((c,realIdx)=>{
    if(c.state!=='active') return;
    const btn = list.querySelector(`[data-welcome-idx="${realIdx}"]`); if(!btn) return;
    const taken = isTakenByLiveOther(c);
    btn.disabled = taken; btn.classList.toggle('taken',taken);
    let lbl = btn.querySelector('.welcome-taken-label');
    if(taken && !lbl){ const s=document.createElement('span'); s.className='welcome-taken-label'; s.textContent='IN USE'; btn.appendChild(s); }
    else if(!taken && lbl){ lbl.remove(); }
  });
}
function claimCharacter(realIdx){
  const c = state.characters[realIdx]; if(!c) return;
  state.characters.forEach(ch=>{ if(ch.claimedBy===MY_PRESENCE_ID) ch.claimedBy=''; });
  c.claimedBy = MY_PRESENCE_ID;
  state.selectedCharacter = realIdx;
  localStorage.setItem('maw-my-idx', realIdx);
  pushState(true); pushPresence(); render();
}

// ================================================================
// SPECTATOR
// ================================================================
function applySpectatorMode(){
  if(!spectator) return;
  document.body.classList.add('spectator-mode');
  if(!el('spectatorBanner')){
    const b = document.createElement('div');
    b.id='spectatorBanner'; b.className='spectator-banner';
    b.innerHTML = `<span>👁 OBSERVER MODE — READ ONLY</span><button id="spectatorExit">Identify</button>`;
    document.body.appendChild(b);
    el('spectatorExit')?.addEventListener('click', ()=>{ spectator=false; sessionStorage.removeItem('maw-spectator'); document.body.classList.remove('spectator-mode'); b.remove(); checkWelcome(); });
  }
  disableAllInputs();
}
function disableAllInputs(){
  if(!spectator) return;
  document.querySelectorAll('input, textarea, select, button, [contenteditable]').forEach(elx=>{
    if(elx.closest('#characterTabs')||elx.closest('.character-tabs')||elx.classList.contains('sidebar-toggle')||elx.id==='sidebarToggle'||elx.closest('.spectator-banner')||elx.closest('.broadcast-screen')||elx.closest('.tab-bar')) return;
    if(elx.tagName==='INPUT'||elx.tagName==='TEXTAREA'||elx.tagName==='SELECT'){ elx.setAttribute('readonly','readonly'); elx.setAttribute('disabled','disabled'); }
    else elx.setAttribute('disabled','disabled');
    if(elx.hasAttribute('contenteditable')) elx.setAttribute('contenteditable','false');
    elx.classList.add('spectator-disabled');
  });
  document.querySelectorAll('.portrait-slot, label[for]').forEach(l=>{ if(l.closest('#characterTabs')) return; l.classList.add('spectator-disabled'); l.style.pointerEvents='none'; });
}

// ================================================================
// DM LOGIN
// ================================================================
function openDmLogin(){
  const ov = el('dmOverlay'); if(!ov) return;
  ov.classList.remove('hidden');
  el('dmLoginPanel')?.classList.remove('hidden');
  el('dmFullPanel')?.classList.add('hidden');
  if(dmUnlocked){ el('dmLoginPanel')?.classList.add('hidden'); el('dmFullPanel')?.classList.remove('hidden'); renderDmPanel(); }
}
function unlockDm(){
  if(el('dmPasswordInput')?.value !== DM_PASS){ showToast('Access denied','warn'); return; }
  dmUnlocked = true; sessionStorage.setItem('maw-dm','1');
  el('dmLoginPanel')?.classList.add('hidden');
  el('dmFullPanel')?.classList.remove('hidden');
  render();
}
function lockDm(){ dmUnlocked=false; sessionStorage.removeItem('maw-dm'); el('dmOverlay')?.classList.add('hidden'); render(); }
function closeDmOverlay(){ el('dmOverlay')?.classList.add('hidden'); }

function applyCharacterAccents(){
  state.characters.forEach((c,i)=>{
    const color=c.accentColor||''; const tabs=document.querySelectorAll('.character-tab');
    if(tabs[i]&&color) tabs[i].style.setProperty('--char-color',color);
  });
  const c=getChar();
  if(c.accentColor) document.documentElement.style.setProperty('--accent', c.accentColor);
}

// ================================================================
// FIELD BINDINGS
// ================================================================
function canEdit(){
  if(spectator) return false;
  if(dmUnlocked) return true;
  const c = getChar();
  return !!c && (c.claimedBy===MY_PRESENCE_ID || !c.claimedBy);
}
function updateField(field, value){
  const c = getChar();
  const map = { currentHp:'hp.current', maxHp:'hp.max', currentSanity:'sanity.current', maxSanity:'sanity.max' };
  if(map[field]){ const[o,k]=map[field].split('.'); c[o][k]=Math.max(0,Number(value)||0); }
  else if(['level','armor','tempHp','points'].includes(field)) c[field]=Math.max(0,Number(value)||0);
  else c[field]=value;
  ensureClamp(c); pushState();
  renderHeader();
  if(map[field]||['level','armor','tempHp','points'].includes(field)){ renderCalcPanel(); }
  if(field==='level'){ renderSkillsMatrix(); renderCalcPanel(); }
  renderCharacterTabs();
}

function bindFields(){
  const ii = (id,field)=>{ const e=el(id); if(e) e.addEventListener('input', ev=>updateField(field,ev.target.value)); };
  ii('charName','name'); ii('charCodename','codename'); ii('charRole','role');
  ii('charClearance','clearance'); ii('charAge','age'); ii('charLevel','level');
  ii('charBackground','background'); ii('charDivision','division'); ii('charSite','site');
  ii('charSpeed','speed'); ii('charArmor','armor'); ii('charTempHp','tempHp');
  ii('currentHp','currentHp'); ii('maxHp','maxHp');
  ii('currentSanity','currentSanity'); ii('maxSanity','maxSanity');
  ii('charPoints','points'); ii('abilitiesText','abilitiesText'); ii('notesText','notesText');

  el('charRank')?.addEventListener('change', e=>{ getChar().rank=e.target.value; pushState(true); render(); });

  // state radios
  ['Active','Reserve','Dead'].forEach(st=>{
    el('state'+st)?.addEventListener('change', ()=>{ getChar().state=st.toLowerCase(); pushState(true); render(); });
  });

  // portrait upload
  el('portraitInput')?.addEventListener('change', e=>{
    const file=e.target.files?.[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=ev=>{
      const img=new Image();
      img.onload=()=>{
        const max=400; const scale=Math.min(max/img.width,max/img.height,1);
        const cv=document.createElement('canvas'); cv.width=img.width*scale; cv.height=img.height*scale;
        cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height);
        getChar().portrait=cv.toDataURL('image/jpeg',0.8);
        pushState(true); renderMainFields();
      };
      img.src=ev.target.result;
    };
    reader.readAsDataURL(file);
  });

  // accent color
  el('accentColorInput')?.addEventListener('input', e=>{ getChar().accentColor=e.target.value; pushState(); applyCharacterAccents(); renderCharacterTabs(); });

  // resource adjust buttons (event delegation)
  document.addEventListener('click', e=>{
    const btn=e.target.closest('.adj-btn'); if(!btn) return;
    adjustResource(btn.dataset.resource, Number(btn.dataset.amt));
  });

  // add buttons
  el('addWeaponBtn')?.addEventListener('click', addWeapon);
  el('addInvBtn')?.addEventListener('click', addInventoryItem);
  el('invAddName')?.addEventListener('keydown', e=>{ if(e.key==='Enter') addInventoryItem(); });
  el('addRelBtn')?.addEventListener('click', addRelationship);
  el('addAnomalyBtn')?.addEventListener('click', addAnomaly);
  el('addAbilityBtn')?.addEventListener('click', addAbility);

  // tab nav
  document.querySelectorAll('.tab-btn[data-tab]').forEach(b=> b.addEventListener('click', ()=>{ state.activeTab=b.dataset.tab; pushState(); renderTabs(); }));
  // DM nav (sub-tabs inside DM panel)
  document.querySelectorAll('.dm-nav-btn[data-dm]').forEach(b=> b.addEventListener('click', ()=>{
    document.querySelectorAll('.dm-nav-btn').forEach(x=>x.classList.remove('active'));
    document.querySelectorAll('.dm-section').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    document.querySelector(`.dm-section[data-dm="${b.dataset.dm}"]`)?.classList.add('active');
  }));

  // DM controls
  el('dmTriggerBtn')?.addEventListener('click', openDmLogin);
  el('dmUnlockBtn')?.addEventListener('click', unlockDm);
  el('dmPasswordInput')?.addEventListener('keydown', e=>{ if(e.key==='Enter') unlockDm(); });
  el('dmCloseBtn')?.addEventListener('click', closeDmOverlay);
  el('dmLockBtn')?.addEventListener('click', lockDm);
  el('addShopItemBtn')?.addEventListener('click', addShopItem);
  el('dmLoadCatalogBtn')?.addEventListener('click', ()=> loadDefaultCatalog(false));
  el('dmResetCatalogBtn')?.addEventListener('click', ()=> loadDefaultCatalog(true));
  el('dmAddAgentBtn')?.addEventListener('click', dmAddAgent);
  el('dmBroadcastSendBtn')?.addEventListener('click', ()=>{
    const msg = el('dmBroadcastInput')?.value.trim();
    if(!msg){ showToast('Enter a broadcast message','warn'); return; }
    sendBroadcast(msg);
    if(el('dmBroadcastInput')) el('dmBroadcastInput').value='';
    showToast('Broadcast transmitted to all terminals','info');
  });
  el('dmBroadcastClearBtn')?.addEventListener('click', ()=>{ clearBroadcast(); removeBroadcastScreen(); });

  // sidebar toggle (mobile)
  el('sidebarToggle')?.addEventListener('click', ()=> document.querySelector('.sidebar')?.classList.toggle('open'));

  // reserve toggle
  el('showReserveToggle')?.addEventListener('click', ()=>{ state.showReserve=!state.showReserve; renderCharacterTabs(); el('showReserveToggle').textContent = state.showReserve?'Hide Reserve':'Show Reserve'; });
}

// ================================================================
// MIGRATION + INIT
// ================================================================
async function migrateIfNeeded(){
  try {
    const mainSnap = await getDoc(doc(db,'campaigns',DOC));
    if(mainSnap.exists()){
      // Doc exists. If its shop is empty but we have a default catalog, seed it once.
      try {
        const existing = JSON.parse(mainSnap.data().data || '{}');
        const shopEmpty = !Array.isArray(existing.shop) || existing.shop.length === 0;
        if(shopEmpty && window.MAW_DEFAULT_SHOP && window.MAW_DEFAULT_SHOP.length){
          existing.shop = window.MAW_DEFAULT_SHOP.map(x=>({ ...x, stock:null }));
          await setDoc(doc(db,'campaigns',DOC), { data: JSON.stringify(existing) });
        }
      } catch(seedErr){ console.error('catalog seed check failed', seedErr); }
      startListener();
      return;
    }
    // No doc yet — seed fresh with the default requisitions catalog.
    if(window.MAW_DEFAULT_SHOP && (!state.shop || !state.shop.length)){
      state.shop = window.MAW_DEFAULT_SHOP.map(x=>({ ...x, stock:null }));
    }
    await setDoc(doc(db,'campaigns',DOC), { data: JSON.stringify(state) });
    startListener();
  } catch(e){ console.error('init', e); startListener(); }
}

bindFields();
render();
if(spectator) applySpectatorMode();
migrateIfNeeded();
startPresenceListener();
startBroadcastListener();
pushPresence();
