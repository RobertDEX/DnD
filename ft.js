// ============================================================
// Fairy Tail DnD — ft.js
// Full auto-calculations + Magic Type system + Firebase
// No import/export — Firebase is the save
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getFirestore, doc, getDoc, onSnapshot, setDoc } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

const FB_CONFIG = {
  apiKey:"AIzaSyCfEtfiU5swXvVkqt4shp8i6h4JYI8ES7U",authDomain:"dand-3c76a.firebaseapp.com",
  projectId:"dand-3c76a",storageBucket:"dand-3c76a.firebasestorage.app",
  messagingSenderId:"27455098509",appId:"1:27455098509:web:432929f697da9a947d5cc4",measurementId:"G-D1TQM5WJT8"
};
const fbApp = initializeApp(FB_CONFIG, 'ft');
const db    = getFirestore(fbApp);
const DOC   = 'ft-campaign';
const DM_PASS = '123456789';
const LOC_KEY = 'ft-v3-local';

// ================================================================
// CONSTANTS
// ================================================================
const STATS = ['STR','DEX','CON','INT','WIS','CHA'];

const SKILL_DEFS = [
  {name:'STR Save',       stat:'STR', isSave:true},
  {name:'Athletics',      stat:'STR'},
  {name:'Power Strike',   stat:'STR'},
  {name:'DEX Save',       stat:'DEX', isSave:true},
  {name:'Acrobatics',     stat:'DEX'},
  {name:'Sleight of Hand',stat:'DEX'},
  {name:'Stealth',        stat:'DEX'},
  {name:'CON Save',       stat:'CON', isSave:true},
  {name:'Endurance',      stat:'CON'},
  {name:'INT Save',       stat:'INT', isSave:true},
  {name:'Magic Control',  stat:'INT'},
  {name:'History',        stat:'INT'},
  {name:'Investigation',  stat:'INT'},
  {name:'Arcana',         stat:'INT'},
  {name:'Religion',       stat:'INT'},
  {name:'WIS Save',       stat:'WIS', isSave:true},
  {name:'Animal Handling',stat:'WIS'},
  {name:'Insight',        stat:'WIS'},
  {name:'Medicine',       stat:'WIS'},
  {name:'Perception',     stat:'WIS'},
  {name:'Survival',       stat:'WIS'},
  {name:'CHA Save',       stat:'CHA', isSave:true},
  {name:'Deception',      stat:'CHA'},
  {name:'Intimidation',   stat:'CHA'},
  {name:'Performance',    stat:'CHA'},
  {name:'Persuasion',     stat:'CHA'},
];

const SPELL_RANKS = ['D','C','B','A','S','SS'];
const RANK_ORDER  = {D:0,C:1,B:2,A:3,S:4,SS:5};

// Magic Category definitions
const MAGIC_CATS = {
  sense_int: {label:'Sense · INT', stat:'INT', manaRoll:'1d10', bonusNote:'1d10 mana pool · INT spell checks'},
  sense_wis: {label:'Sense · WIS', stat:'WIS', manaRoll:'1d10', bonusNote:'1d10 mana pool · WIS spell checks'},
  sense_cha: {label:'Sense · CHA', stat:'CHA', manaRoll:'1d10', bonusNote:'1d10 mana pool · CHA spell checks'},
  power_con: {label:'Power · CON', stat:'CON', manaRoll:'1d10', bonusNote:'1d10 hit dice · Unarmed Strike · CON spell checks'},
  power_str: {label:'Power · STR', stat:'STR', manaRoll:'1d10', bonusNote:'1d10 hit dice · Unarmed Strike · STR spell checks'},
  agility:   {label:'Agility · DEX',stat:'DEX',manaRoll:'1d8',  bonusNote:'Attack action: Speed +10 ft · Opportunity Attacks have Disadvantage · DEX spell checks'},
};

const DEF_THEME = {bg:'#060408',panel:'#0e0a16',accent:'#e8a030',accentTwo:'#7a4000',mana:'#a855f7',text:'#f5eedd'};

// ================================================================
// CALCULATION ENGINE
// ================================================================
function mod(score) { return Math.floor((Number(score)-10)/2); }
function fmtMod(m)  { return m >= 0 ? `+${m}` : `${m}`; }

function profBonus(level) {
  const l = Number(level)||1;
  return Math.ceil(l/4)+1;
}

function skillTotal(c, skillName) {
  const def = SKILL_DEFS.find(s=>s.name===skillName); if(!def) return 0;
  const statM = mod(c.stats[def.stat]||10);
  const sk    = c.skills[skillName]||{prof:false,expertise:false,bonus:0};
  const pb    = getEffectivePB(c);
  let total   = statM + Number(sk.bonus||0);
  if (sk.expertise) total += pb*2;
  else if (sk.prof) total += pb;
  return total;
}

function passivePerception(c) {
  const pb     = getEffectivePB(c);
  const wisMod = mod(c.stats.WIS);
  const sk     = c.skills['Perception'] || {bonus:0};
  return 10 + pb + wisMod + (Number(sk.bonus)||0);
}
function calcInitiative(c)    { return mod(c.stats.DEX) + Number(c.initiativeBonus||0); }

function getMagicCat(c) { return MAGIC_CATS[c.magicCategory||''] || null; }
function getMagicStat(c){ return getMagicCat(c)?.stat || 'INT'; }
function spellMod(c)    { return mod(c.stats[getMagicStat(c)]||10); }
function spellAtkBonus(c){ return spellMod(c) + getEffectivePB(c); }
function spellSaveDC(c) { return 8 + spellMod(c) + getEffectivePB(c); }

function getEffectivePB(c) {
  return c.profBonusOverride != null ? Number(c.profBonusOverride) : profBonus(c.level);
}

// ── DAMAGE TAKEN ──
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
  ensureClamp(c); pushState(); render();
  inp.value = '';
  const prev = document.getElementById('damagePreview');
  if (prev) { prev.textContent = ''; prev.className = 'damage-preview'; }
};

// ================================================================
// DATA
// ================================================================
function makeBlankSkills() {
  const s={};
  SKILL_DEFS.forEach(d=>{ s[d.name]={prof:false,expertise:false,bonus:0}; });
  return s;
}
function blankChar(i) {
  return {
    id:`char-${Date.now()}-${i}-${Math.random().toString(16).slice(2)}`,
    name:'',race:'',className:'',age:'',level:1,background:'',
    magicType:'',magicCategory:'',guild:'',guildMark:'',exceed:'',magicRank:'',
    profBonusOverride:null, initiativeBonus:0, attackStat:'STR',
    state: i<4?'active':'reserve',
    stats:{STR:10,DEX:10,CON:10,INT:10,WIS:10,CHA:10},
    skills:makeBlankSkills(),
    hp:{current:0,max:0}, mana:{current:0,max:0},
    armor:0, speed:'30 ft',
    weaponsText:'',abilitiesText:'',inventoryText:'',notesText:'',
    spells:[],lostMagic:[]
  };
}
const DEF_STATE = {selectedCharacter:0,activeTab:'skills',showReserve:false,showDead:false,theme:{...DEF_THEME},characters:[blankChar(0),blankChar(1),blankChar(2),blankChar(3)]};

// ================================================================
// PER-CHARACTER SYNC — same architecture as RWBY
// Each character = its own Firestore doc at ft-chars/{charId}
// Each browser owns one character via localStorage 'ft-my-char-id'
// DM unlock = sessionStorage only, never synced
// Theme = separate shared doc ft-meta/theme
// ================================================================
const CHARS_COLL = 'ft-chars';
const META_DOC   = 'ft-meta';

let state=loadLocal();
let _charUnsubs={};
let _metaUnsub=null;
let dmUnlocked=sessionStorage.getItem('ft-dm')==='1';

function getMyCharId(){
  let id=localStorage.getItem('ft-my-char-id');
  if(!id){const u=state.characters.find(c=>!c.name);id=u?u.id:blankChar(state.characters.length).id;localStorage.setItem('ft-my-char-id',id);}
  return id;
}
function isMine(c){return c.id===getMyCharId();}

function loadLocal(){try{const r=localStorage.getItem(LOC_KEY);return r?normalize(JSON.parse(r)):structuredClone(DEF_STATE);}catch{return structuredClone(DEF_STATE);}}
function saveLocal(){try{localStorage.setItem(LOC_KEY,JSON.stringify(state));}catch{}}

let _pushTimer=null;
async function pushState(){
  saveLocal();
  clearTimeout(_pushTimer);
  _pushTimer=setTimeout(async()=>{
    const myId=getMyCharId();
    const mine=state.characters.find(c=>c.id===myId);if(!mine)return;
    setSyncDot('syncing');
    try{await setDoc(doc(db,CHARS_COLL,myId),{data:JSON.stringify(mine),updated:Date.now()});setSyncDot('synced');}
    catch(e){console.error(e);setSyncDot('error');}
  },800);
}
async function pushTheme(){
  try{await setDoc(doc(db,META_DOC,'theme'),{data:JSON.stringify(state.theme),updated:Date.now()});}
  catch(e){console.error(e);}
}

function listenToChar(charId){
  if(_charUnsubs[charId])return;
  const myId=getMyCharId();
  _charUnsubs[charId]=onSnapshot(doc(db,CHARS_COLL,charId),snap=>{
    if(!snap.exists())return;
    // Skip our own echoes — would disrupt typing
    if(charId===myId){setSyncDot('synced');return;}
    try{
      const fresh=JSON.parse(snap.data().data);
      const idx=state.characters.findIndex(c=>c.id===charId);
      const b=blankChar(0);
      const merged={...b,...fresh,stats:{...b.stats,...(fresh.stats||{})},hp:{...b.hp,...(fresh.hp||{})},mana:{...b.mana,...(fresh.mana||{})},
        spells:Array.isArray(fresh.spells)?fresh.spells:[],lostMagic:Array.isArray(fresh.lostMagic)?fresh.lostMagic:[],
        skills:(()=>{const bsk=makeBlankSkills();Object.keys(bsk).forEach(n=>{bsk[n]={...bsk[n],...(fresh.skills?.[n]||{})};});return bsk;})()
      };
      if(idx>=0)state.characters[idx]=merged;else state.characters.push(merged);
      saveLocal();
      try{renderCharacterTabs();}catch(e){}
      if(state.selectedCharacter===idx){try{renderHeader();}catch(e){}}
      setSyncDot('synced');
    }catch(e){console.error('Snapshot parse error',e);}
  },e=>{console.error(e);setSyncDot('error');});
}

function startListeners(){
  state.characters.forEach(c=>listenToChar(c.id));
  if(_metaUnsub)_metaUnsub();
  _metaUnsub=onSnapshot(doc(db,META_DOC,'theme'),snap=>{
    if(!snap.exists())return;
    try{
      const t=JSON.parse(snap.data().data);
      state.theme={...DEF_THEME,...t};
      Object.keys(DEF_THEME).forEach(k=>{if(!state.theme[k]||!state.theme[k].startsWith('#'))state.theme[k]=DEF_THEME[k];});
      saveLocal();applyTheme();renderThemeFields();
    }catch(e){console.error(e);}
  },e=>console.error(e));
}

function setSyncDot(s){
  const d=el('syncDot');if(!d)return;
  d.className='sync-dot '+s;
  d.title={synced:'Synced ✓',syncing:'Syncing…',error:'Sync error — local only'}[s]||s;
}
function normalize(raw){
  const m=structuredClone(DEF_STATE);Object.assign(m,raw||{});
  m.theme={...DEF_THEME,...(raw?.theme||{})};
  Object.keys(DEF_THEME).forEach(k=>{
    if(!m.theme[k]||typeof m.theme[k]!=='string'||!m.theme[k].startsWith('#'))m.theme[k]=DEF_THEME[k];
  });
  m.characters=(raw?.characters?.length?raw.characters:DEF_STATE.characters).map((c,i)=>{
    const b=blankChar(i);const mc={...b,...c};
    mc.stats={...b.stats,...(c.stats||{})};mc.hp={...b.hp,...(c.hp||{})};mc.mana={...b.mana,...(c.mana||{})};
    mc.spells=Array.isArray(c.spells)?c.spells:[];mc.lostMagic=Array.isArray(c.lostMagic)?c.lostMagic:[];
    const blankSk=makeBlankSkills();mc.skills={};
    Object.keys(blankSk).forEach(n=>{mc.skills[n]={...blankSk[n],...(c.skills?.[n]||{})};});
    return mc;
  });
  if(m.selectedCharacter>=m.characters.length)m.selectedCharacter=Math.max(0,m.characters.length-1);
  return m;
}

// ================================================================
// HELPERS
// ================================================================
function getChar(){return state.characters[state.selectedCharacter]||state.characters[0];}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function rollD10(){return Math.floor(Math.random()*10)+1;}
function rollD8(){return Math.floor(Math.random()*8)+1;}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function ensureClamp(c){
  c.hp.max=Math.max(0,Number(c.hp.max)||0);c.mana.max=Math.max(0,Number(c.mana.max)||0);
  c.hp.current=clamp(Number(c.hp.current)||0,0,c.hp.max);
  c.mana.current=clamp(Number(c.mana.current)||0,0,c.mana.max);
}
function hexRgba(hex,a=1){
  if(!hex||typeof hex!=='string')return `rgba(0,0,0,${a})`;
  const cl=hex.replace('#','');
  if(cl.length<6)return `rgba(0,0,0,${a})`;
  const r=parseInt(cl.slice(0,2),16),g=parseInt(cl.slice(2,4),16),b=parseInt(cl.slice(4,6),16);
  if(isNaN(r)||isNaN(g)||isNaN(b))return `rgba(0,0,0,${a})`;
  return `rgba(${r},${g},${b},${a})`;
}
const el=id=>document.getElementById(id);

// ================================================================
// THEME
// ================================================================
function applyTheme(){
  try{
    const t={...DEF_THEME,...(state.theme||{})};
    const root=document.documentElement;
    root.style.setProperty('--accent',  t.accent   ||DEF_THEME.accent);
    root.style.setProperty('--accent2', t.accentTwo||DEF_THEME.accentTwo);
    root.style.setProperty('--mana',    t.mana     ||DEF_THEME.mana);
    root.style.setProperty('--text',    t.text     ||DEF_THEME.text);
    root.style.setProperty('--panel',   hexRgba(t.panel||DEF_THEME.panel,.97));
    root.style.setProperty('--line-hi', hexRgba(t.accent||DEF_THEME.accent,.5));
    document.body.style.background=`radial-gradient(ellipse at 30% 10%,${hexRgba(t.accent,.18)} 0%,transparent 38%),radial-gradient(ellipse at 80% 80%,${hexRgba(t.mana,.12)} 0%,transparent 38%),linear-gradient(180deg,${t.bg} 0%,${t.bg} 50%,${t.accentTwo} 100%)`;
  }catch(e){console.warn('applyTheme:',e);}
}
function renderThemeFields(){
  const t=state.theme||DEF_THEME;
  [['themeBgColor',t.bg],['themePanelColor',t.panel],['themeAccentColor',t.accent],['themeAccentTwoColor',t.accentTwo],['themeManaColor',t.mana],['themeTextColor',t.text]]
  .forEach(([id,v])=>{const e=el(id);if(e)e.value=v;});
}

// ================================================================
// MAGIC TYPE BANNER
// ================================================================
function renderMagicBanner(){
  const c=getChar();const banner=el('magicTypeBanner');if(!banner)return;
  const cat=getMagicCat(c);
  if(!cat||!c.magicType){banner.style.display='none';return;}
  banner.style.display='flex';
  const pb=getEffectivePB(c);const sm=spellMod(c);const atk=spellAtkBonus(c);const dc=spellSaveDC(c);
  const isPower=c.magicCategory?.startsWith('power');const isAgility=c.magicCategory==='agility';
  banner.innerHTML=`
    <div class="magic-type-tag">🐉 ${esc(c.magicType)}</div>
    <span class="magic-type-modifier">${cat.label}</span>
    <span class="magic-type-modifier">Spell Mod: ${fmtMod(sm)}</span>
    <span class="magic-type-modifier">Atk Bonus: ${fmtMod(atk)}</span>
    <span class="magic-type-modifier">Save DC: ${dc}</span>
    <span class="magic-type-modifier">Mana Die: ${cat.manaRoll}</span>
    ${isPower?'<span class="magic-type-modifier">🥊 Unarmed Strike</span>':''}
    ${isAgility?'<span class="magic-type-modifier">⚡ Attack: Speed +10</span>':''}`;
  const saEl=el('spellAtkBonus');if(saEl)saEl.value=fmtMod(atk);
}

// ================================================================
// CALCULATED STATS PANEL
// ================================================================
function renderCalcPanel(){
  const c=getChar();const pb=getEffectivePB(c);const ini=calcInitiative(c);
  const sm=spellMod(c);const atk=spellAtkBonus(c);const dc=spellSaveDC(c);const pp=passivePerception(c);
  const cat=getMagicCat(c);const manaStatLabel=cat?cat.stat:'?';
  const panel=el('calcPanel');if(!panel)return;

  // Magic type info
  const catKey=c.magicCategory||'';
  const isSense=catKey.startsWith('sense');
  const isPower=catKey.startsWith('power');
  const isAgility=catKey==='agility';
  const magicName=c.magicType?`<strong style="color:var(--gold)">${esc(c.magicType)}</strong>`:'<em style="color:var(--muted)">No magic type set</em>';

  let typeTag='', typeBonusHtml='', manaRoll='1d10';
  if(isSense){
    typeTag=`<span class="calc-type-badge sense">Sense · ${manaStatLabel}</span>`;
    typeBonusHtml=`<div class="magic-rule-line">✦ Roll <strong>1d10</strong> for your mana pool (instead of 1d8)</div><div class="magic-rule-line">✦ Spell checks use <strong>${manaStatLabel}</strong> modifier</div>`;
    manaRoll='1d10';
  } else if(isPower){
    typeTag=`<span class="calc-type-badge power">Power · ${manaStatLabel}</span>`;
    typeBonusHtml=`<div class="magic-rule-line">✦ Roll <strong>1d10</strong> Hit Dice instead of 1d8</div><div class="magic-rule-line">✦ You gain <strong>Unarmed Strike</strong></div><div class="magic-rule-line">✦ Spell checks use <strong>${manaStatLabel}</strong> modifier</div>`;
    manaRoll='1d10';
  } else if(isAgility){
    typeTag=`<span class="calc-type-badge agility">Agility · DEX</span>`;
    typeBonusHtml=`<div class="magic-rule-line">✦ On Attack action: Speed <strong>+10 ft</strong> until end of turn</div><div class="magic-rule-line">✦ Opportunity Attacks have <strong>Disadvantage</strong> against you</div><div class="magic-rule-line">✦ Spell checks use <strong>DEX</strong> modifier</div>`;
    manaRoll='1d8';
  } else {
    typeTag=`<span class="calc-type-badge none">No Category Set</span>`;
    typeBonusHtml=`<div class="magic-rule-line" style="color:var(--muted)">Select a Magic Category in the Character File to see bonuses.</div>`;
  }

  // Spell budget based on level
  const lv=Number(c.level)||1;
  // Base: basic application + 2 spells + 1 passive = 3 spell slots + passives
  // Each evolution (every 4 levels) = +2 spells +1 passive
  const evolutions=Math.floor((lv-1)/4); // 0 at lv1-4, 1 at lv5-8, etc.
  const totalSpells=2+evolutions*2; // base 2 active spells
  const totalPassives=1+evolutions;  // base 1 passive
  const spellsUsed=c.spells.filter(s=>s.type!=='Passive').length;
  const passivesUsed=c.spells.filter(s=>s.type==='Passive').length;

  panel.innerHTML=`
    <!-- CORE CALC NUMBERS -->
    <div class="calc-row">
      <div class="calc-item"><div class="calc-label">Prof Bonus</div><div class="calc-value accent">${fmtMod(pb)}</div><div class="calc-sub">Lv ${c.level}</div></div>
      <div class="calc-item"><div class="calc-label">Initiative</div><div class="calc-value">${fmtMod(ini)}</div><div class="calc-sub">DEX${c.initiativeBonus?` +${c.initiativeBonus}`:''}</div></div>
      <div class="calc-item"><div class="calc-label">Spell Mod</div><div class="calc-value mana">${fmtMod(sm)}</div><div class="calc-sub">${manaStatLabel} mod</div></div>
      <div class="calc-item"><div class="calc-label">Spell Atk</div><div class="calc-value mana">${fmtMod(atk)}</div><div class="calc-sub">Mod + Prof</div></div>
      <div class="calc-item"><div class="calc-label">Spell Save DC</div><div class="calc-value accent">${dc}</div><div class="calc-sub">8+Mod+Prof</div></div>
      <div class="calc-item"><div class="calc-label">Passive Perc.</div><div class="calc-value">${pp}</div><div class="calc-sub">10+Perception</div></div>
    </div>

    <!-- OVERRIDE INPUTS -->
    <div class="calc-settings" style="margin-bottom:1.1rem">
      <div class="field">
        <label>Initiative Bonus</label>
        <input type="number" id="initBonusInp" value="${c.initiativeBonus||0}" placeholder="0">
      </div>
      <div class="field">
        <label>Prof Override <span style="color:var(--muted);font-size:.68rem">(blank = auto)</span></label>
        <input type="number" id="pbOverrideInp" value="${c.profBonusOverride??''}" placeholder="auto">
      </div>
      <div class="field">
        <label>Mana Roll Die</label>
        <input type="text" value="${cat?manaRoll:'—'}" readonly style="text-align:center;color:var(--mana);font-family:var(--F4)">
      </div>
    </div>

    <!-- MAGIC INFO BLOCK -->
    <div class="magic-info-block">
      <div class="magic-info-header">
        <div class="magic-info-name">${magicName}</div>
        ${typeTag}
      </div>

      <div class="magic-rules-list">
        ${typeBonusHtml}
      </div>

      <div class="magic-restrictions">
        <div class="magic-rule-line warn">⚠ Ancient / Lost Magic not allowed as starting magic.</div>
      </div>

      <div class="magic-spell-budget">
        <div class="budget-title">Spell Budget — Level ${lv}</div>
        <div class="budget-row">
          <div class="budget-item">
            <div class="budget-label">Active Spells</div>
            <div class="budget-value ${spellsUsed>totalSpells?'over':''}">${spellsUsed} / ${totalSpells}</div>
          </div>
          <div class="budget-item">
            <div class="budget-label">Passives</div>
            <div class="budget-value ${passivesUsed>totalPassives?'over':''}">${passivesUsed} / ${totalPassives}</div>
          </div>
          <div class="budget-item">
            <div class="budget-label">Evolutions</div>
            <div class="budget-value">${evolutions}</div>
          </div>
          <div class="budget-item">
            <div class="budget-label">Next Evo At</div>
            <div class="budget-value">${evolutions>=0?`Lv ${(evolutions+1)*4+1}`:'—'}</div>
          </div>
        </div>
        <div class="budget-note">Base: basic application + 2 spells + 1 passive. Each evolution: +2 spells, +1 passive.</div>
      </div>
    </div>`;

  el('initBonusInp')?.addEventListener('input',e=>{c.initiativeBonus=Number(e.target.value)||0;pushState();renderCalcPanel();});
  el('pbOverrideInp')?.addEventListener('input',e=>{const v=e.target.value.trim();c.profBonusOverride=v===''?null:Number(v)||null;pushState();renderCalcPanel();renderSkillsMatrix();});
}

// ================================================================
// CHARACTER TABS
// ================================================================
function renderCharacterTabs(){
  const tabs=el('characterTabs');if(!tabs)return;tabs.innerHTML='';
  state.characters.forEach((c,i)=>{
    if(c.state==='dead'&&!state.showDead)return;
    if(c.state==='reserve'&&!state.showReserve)return;
    const pct=c.hp.max>0?Math.round((c.hp.current/c.hp.max)*100):0;
    const btn=document.createElement('button');btn.type='button';
    btn.className=`character-tab${c.state==='reserve'?' reserve':''}${c.state==='dead'?' dead':''}${i===state.selectedCharacter?' active':''}`;
    btn.innerHTML=`<strong>${esc(c.name||`Player ${i+1}`)}</strong><span>${esc(c.magicType||c.className||'—')} · Lv${c.level}</span><div class="tab-hp-bar"><div class="tab-hp-fill" style="width:${pct}%"></div></div>`;
    btn.addEventListener('click',()=>{state.selectedCharacter=i;pushState();render();});
    tabs.appendChild(btn);
  });
}

// ================================================================
// HEADER
// ================================================================
function renderHeader(){
  const c=getChar();const name=c.name||'—';
  const s=(id,v)=>{const e=el(id);if(e)e.textContent=v;};
  s('topCharacterName',name);s('selectedNameSmall',name);
  s('selectedState',c.state.charAt(0).toUpperCase()+c.state.slice(1));
  s('selectedMagicType',c.magicType||'—');s('selectedSpellCount',c.spells.length);
  s('topHpMini',`${c.hp.current} / ${c.hp.max}`);s('topManaMini',`${c.mana.current} / ${c.mana.max}`);s('topArmorMini',c.armor);
  s('dmSelectedCharacterName',name);
  const hpPct=c.hp.max>0?(c.hp.current/c.hp.max)*100:0;const mPct=c.mana.max>0?(c.mana.current/c.mana.max)*100:0;
  const hb=el('topHpBar');if(hb)hb.style.width=hpPct+'%';const mb=el('topManaBar');if(mb)mb.style.width=mPct+'%';
}

// ================================================================
// MAIN FIELDS
// ================================================================
function renderMainFields(){
  const c=getChar();
  const sv=(id,v)=>{const e=el(id);if(e)e.value=v??'';};
  sv('charName',c.name);sv('charLevel',c.level);sv('charRace',c.race);sv('charClass',c.className);
  sv('charAge',c.age);sv('charBackground',c.background);sv('charMagicType',c.magicType);
  const mc=el('charMagicCategory');if(mc)mc.value=c.magicCategory||'';
  sv('charGuild',c.guild);sv('charGuildMark',c.guildMark);sv('charExceed',c.exceed);
  const mr=el('magicRank');if(mr)mr.value=c.magicRank||'';
  sv('currentHp',c.hp.current);sv('maxHp',c.hp.max);sv('currentMana',c.mana.current);sv('maxMana',c.mana.max);
  sv('armor',c.armor);sv('speed',c.speed);
  sv('weaponsText',c.weaponsText);sv('abilitiesText',c.abilitiesText);sv('inventoryText',c.inventoryText);sv('notesText',c.notesText);
  const hd=el('hpDisplay');if(hd)hd.textContent=`${c.hp.current} / ${c.hp.max}`;
  const md=el('manaDisplay');if(md)md.textContent=`${c.mana.current} / ${c.mana.max}`;
  const hpPct=c.hp.max>0?(c.hp.current/c.hp.max)*100:0;const mPct=c.mana.max>0?(c.mana.current/c.mana.max)*100:0;
  const hb=el('hpBar');if(hb)hb.style.width=hpPct+'%';const mb=el('manaBar');if(mb)mb.style.width=mPct+'%';
  const sa=el('stateActive');if(sa){el('stateActive').checked=c.state==='active';el('stateReserve').checked=c.state==='reserve';el('stateDead').checked=c.state==='dead';}
  const title=el('magicSpellTitle');if(title)title.textContent=c.magicType?`${c.magicType} Spells`:'Magic Spells';
  // Auto-calculated display fields
  const id2=el('initiativeDisplay');if(id2)id2.value=fmtMod(calcInitiative(c));
  const sa2=el('spellAtkDisplay');if(sa2)sa2.value=fmtMod(spellAtkBonus(c));
}

// ================================================================
// ABILITY SCORES
// ================================================================
function renderStats(){
  const c=getChar();const g=el('statsGrid');if(!g)return;g.innerHTML='';
  const cat=getMagicCat(c);
  STATS.forEach(stat=>{
    const score=c.stats[stat];const m=mod(score);
    const isMagicStat=cat&&cat.stat===stat;
    const card=document.createElement('div');card.className='stat-card';
    if(isMagicStat)card.style.borderColor='rgba(168,85,247,.4)';
    card.innerHTML=`
      <div class="stat-key" style="${isMagicStat?'color:var(--mana)':''}">${stat}${isMagicStat?' ✦':''}</div>
      <input class="stat-score-input" data-stat="${stat}" type="number" value="${score}">
      <div class="stat-mod">${fmtMod(m)}</div>
      <div class="stat-controls">
        <button type="button" data-stat="${stat}" data-action="minus">−</button>
        <button type="button" data-stat="${stat}" data-action="plus">+</button>
      </div>`;
    g.appendChild(card);
  });
  g.querySelectorAll('.stat-score-input').forEach(inp=>{
    inp.addEventListener('input',e=>{c.stats[e.target.dataset.stat]=Number(e.target.value)||0;pushState();renderStats();renderSkillsMatrix();renderCalcPanel();renderMagicBanner();});
  });
}

// ================================================================
// SKILLS MATRIX — full auto-calculation
// ================================================================
function renderSkillsMatrix(){
  const c=getChar();const pb=getEffectivePB(c);const m=el('skillsMatrix');if(!m)return;m.innerHTML='';
  const groups={};
  SKILL_DEFS.forEach(def=>{if(!groups[def.stat])groups[def.stat]=[];groups[def.stat].push(def);});
  Object.entries(groups).forEach(([stat,defs])=>{
    const statM=mod(c.stats[stat]);
    const grp=document.createElement('div');grp.className='skill-group';
    grp.innerHTML=`<div class="skill-group-header"><strong>${stat}</strong><span>Mod ${fmtMod(statM)} &nbsp;·&nbsp; Prof ${fmtMod(pb)}</span></div><div class="skill-list"></div>`;
    const list=grp.querySelector('.skill-list');
    defs.forEach(def=>{
      const sk=c.skills[def.name]||{prof:false,expertise:false,bonus:0};
      const total=skillTotal(c,def.name);
      const row=document.createElement('div');row.className='skill-row';
      row.innerHTML=`
        <div class="skill-prof-toggles">
          <button type="button" class="prof-btn${sk.prof?' active':''}" data-skill="${esc(def.name)}" data-toggle="prof" title="Proficient">${sk.prof?'●':'○'}</button>
          <button type="button" class="prof-btn exp${sk.expertise?' active':''}" data-skill="${esc(def.name)}" data-toggle="expertise" title="Expertise">${sk.expertise?'★':'☆'}</button>
        </div>
        <div class="skill-row-label">
          <strong>${esc(def.name)}</strong>
          <span>${def.stat}${sk.prof?(sk.expertise?' · Expertise':' · Prof'):''}</span>
        </div>
        <div class="skill-total ${total>=0?'pos':'neg'}">${fmtMod(total)}</div>
        <input type="number" data-skill="${esc(def.name)}" value="${sk.bonus||0}" placeholder="+0" title="Extra bonus">`;
      list.appendChild(row);
    });
    m.appendChild(grp);
  });
  m.querySelectorAll('.prof-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const sk=c.skills[btn.dataset.skill];const type=btn.dataset.toggle;
      if(type==='prof'){sk.prof=!sk.prof;if(!sk.prof)sk.expertise=false;}
      if(type==='expertise'){sk.expertise=!sk.expertise;if(sk.expertise)sk.prof=true;}
      pushState();renderSkillsMatrix();renderCalcPanel();
    });
  });
  m.querySelectorAll('input[data-skill]').forEach(inp=>{
    inp.addEventListener('input',e=>{c.skills[e.target.dataset.skill].bonus=Number(e.target.value)||0;pushState();renderSkillsMatrix();});
  });
}

// ================================================================
// SPELLS
// ================================================================
function renderSpells(){
  const c=getChar();const cont=el('spellList');if(!cont)return;cont.innerHTML='';
  if(!c.spells.length){cont.innerHTML=`<div style="padding:.9rem;color:var(--muted)">No spells yet. Use the form above.</div>`;return;}
  [...c.spells].sort((a,b)=>(RANK_ORDER[b.rank]||0)-(RANK_ORDER[a.rank]||0)).forEach(sp=>{
    const card=document.createElement('div');card.className='spell-card collapse-block';
    card.innerHTML=`<details><summary class="collapse-summary"><div class="spell-card-header"><span class="spell-name">${esc(sp.name)}</span><div class="spell-meta"><span class="rank-pill rank-${sp.rank}">${sp.rank}-Rank</span><span class="type-pill">${esc(sp.type)}</span>${sp.manaCost>0?`<span class="mana-pill">−${sp.manaCost} Mana</span>`:''}</div></div></summary><div class="collapse-body"><div class="small-note">${esc(sp.description)}</div><div class="spell-actions"><button type="button" class="neo-btn small cast-btn cast-spell" data-id="${sp.id}">Cast${sp.manaCost>0?` (−${sp.manaCost} Mana)`:''}</button><button type="button" class="neo-btn small ghost edit-spell" data-id="${sp.id}">Edit</button><button type="button" class="neo-btn small ghost del-spell" data-id="${sp.id}">Delete</button></div></div></details>`;
    cont.appendChild(card);
  });
  cont.querySelectorAll('.cast-spell').forEach(btn=>btn.addEventListener('click',()=>castSpell(btn.dataset.id)));
  cont.querySelectorAll('.del-spell').forEach(btn=>btn.addEventListener('click',()=>{c.spells=c.spells.filter(s=>s.id!==btn.dataset.id);pushState();renderSpells();renderHeader();}));
  cont.querySelectorAll('.edit-spell').forEach(btn=>btn.addEventListener('click',()=>openEditSpell(btn.dataset.id)));
}
function openEditSpell(id){
  const c=getChar();const sp=c.spells.find(s=>s.id===id);if(!sp)return;
  const sv=(eid,v)=>{const e=el(eid);if(e)e.value=v;};
  sv('spellName',sp.name);sv('spellRank',sp.rank);sv('spellManaCost',sp.manaCost);sv('spellType',sp.type);sv('spellDescription',sp.description);
  const btn=el('addSpellBtn');if(btn){btn.textContent='Update Spell';btn.dataset.editId=id;}
  state.activeTab='magic';renderTabs();el('spellName')?.focus();el('spellName')?.scrollIntoView({behavior:'smooth',block:'center'});
}

// ================================================================
// LOST MAGIC
// ================================================================
function renderLostMagic(){
  const c=getChar();const cont=el('lostMagicList');if(!cont)return;cont.innerHTML='';
  if(!c.lostMagic.length){cont.innerHTML=`<div style="padding:.9rem;color:var(--muted)">No Lost Magic yet. DM grants via the DM panel.</div>`;return;}
  c.lostMagic.forEach(lm=>{
    const card=document.createElement('div');card.className='spell-card lm-card collapse-block';
    card.innerHTML=`<details><summary class="collapse-summary"><div class="spell-card-header"><span class="spell-name">🐲 ${esc(lm.name)}</span><div class="spell-meta">${lm.manaCost>0?`<span class="mana-pill">−${lm.manaCost} Mana</span>`:''}<span class="type-pill" style="border-color:rgba(232,160,48,.3);color:var(--accent)">DM Granted</span></div></div></summary><div class="collapse-body"><div class="small-note">${esc(lm.description)}</div>${lm.manaCost>0?`<div class="spell-actions"><button type="button" class="neo-btn small cast-btn use-lm" data-id="${lm.id}">Use (−${lm.manaCost} Mana)</button></div>`:''}</div></details>`;
    cont.appendChild(card);
  });
  cont.querySelectorAll('.use-lm').forEach(btn=>btn.addEventListener('click',()=>useLostMagic(btn.dataset.id)));
}
function renderDmLostMagic(){
  const container=el('dmLostMagicList');if(!container)return;container.innerHTML='';
  let any=false;
  state.characters.forEach(c=>{
    if(!c.lostMagic.length)return;any=true;
    const hdr=document.createElement('div');
    hdr.style.cssText='font-family:var(--font-mono);font-size:.7rem;letter-spacing:.15em;text-transform:uppercase;color:var(--accent);margin:.6rem 0 .35rem;padding:.35rem .6rem;background:rgba(232,160,48,.06);border-radius:6px;border-left:2px solid var(--accent)';
    hdr.textContent=c.name||'Player';container.appendChild(hdr);
    c.lostMagic.forEach(lm=>{
      const card=document.createElement('div');card.className='collapse-block';
      card.innerHTML=`<details><summary class="collapse-summary"><div style="display:flex;justify-content:space-between;align-items:center;width:100%"><span>${esc(lm.name)}</span>${lm.manaCost>0?`<span class="mana-pill">−${lm.manaCost} Mana</span>`:''}</div></summary><div class="collapse-body"><div class="field"><label>Name</label><input type="text" data-lm="${lm.id}" data-cid="${c.id}" data-f="name" value="${esc(lm.name)}"></div><div class="field" style="margin-top:.55rem"><label>Mana Cost</label><input type="number" min="0" data-lm="${lm.id}" data-cid="${c.id}" data-f="manaCost" value="${lm.manaCost}"></div><div class="field" style="margin-top:.55rem"><label>Description</label><textarea class="small-textarea" data-lm="${lm.id}" data-cid="${c.id}" data-f="description">${esc(lm.description)}</textarea></div><div class="dm-tech-actions"><button type="button" class="neo-btn small ghost" data-del-lm="${lm.id}" data-del-cid="${c.id}">Delete</button></div></div></details>`;
      container.appendChild(card);
    });
  });
  if(!any)container.innerHTML=`<div style="padding:.9rem;color:var(--muted)">No Lost Magic assigned yet.</div>`;
  container.querySelectorAll('[data-lm]').forEach(inp=>{
    inp.addEventListener('input',e=>{
      const ch=state.characters.find(c=>c.id===e.target.dataset.cid);
      const lm=ch?.lostMagic.find(l=>l.id===e.target.dataset.lm);if(!lm)return;
      const f=e.target.dataset.f;lm[f]=f==='manaCost'?Math.max(0,Number(e.target.value)||0):e.target.value;
      pushState();renderLostMagic();
    });
  });
  container.querySelectorAll('[data-del-lm]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const ch=state.characters.find(c=>c.id===btn.dataset.delCid);
      if(ch)ch.lostMagic=ch.lostMagic.filter(l=>l.id!==btn.dataset.delLm);
      pushState();render();
    });
  });
}
function renderDmTargetSelect(){
  const sel=el('dmLMTarget');if(!sel)return;
  sel.innerHTML=state.characters.map((c,i)=>`<option value="${i}">${esc(c.name||`Player ${i+1}`)}</option>`).join('');
}
function renderTabs(){
  document.querySelectorAll('.tab-btn[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===state.activeTab));
  document.querySelectorAll('.tab-content[data-tab]').forEach(t=>t.classList.toggle('active',t.dataset.tab===state.activeTab));
}

// ================================================================
// MASTER RENDER
// ================================================================
function render(){
  try{applyTheme();}catch(e){console.error('applyTheme:',e);}
  const c=getChar();ensureClamp(c);
  try{renderCharacterTabs();}catch(e){console.error('renderCharacterTabs:',e);}
  try{renderHeader();}       catch(e){console.error('renderHeader:',e);}
  try{renderMainFields();}   catch(e){console.error('renderMainFields:',e);}
  try{renderMagicBanner();}  catch(e){console.error('renderMagicBanner:',e);}
  try{renderCalcPanel();}    catch(e){console.error('renderCalcPanel:',e);}
  try{renderStats();}        catch(e){console.error('renderStats:',e);}
  try{renderSkillsMatrix();} catch(e){console.error('renderSkillsMatrix:',e);}
  try{renderSpells();}       catch(e){console.error('renderSpells:',e);}
  try{renderLostMagic();}    catch(e){console.error('renderLostMagic:',e);}
  try{renderDmLostMagic();}  catch(e){console.error('renderDmLostMagic:',e);}
  try{renderDmTargetSelect();}catch(e){console.error('renderDmTargetSelect:',e);}
  try{renderThemeFields();}  catch(e){console.error('renderThemeFields:',e);}
  try{renderTabs();}         catch(e){console.error('renderTabs:',e);}
}

// ================================================================
// ACTIONS
// ================================================================
function adjustResource(res,amt){
  const c=getChar();
  if(res==='hp')c.hp.current=clamp(c.hp.current+amt,0,c.hp.max);
  if(res==='mana')c.mana.current=clamp(c.mana.current+amt,0,c.mana.max);
  pushState();renderHeader();renderMainFields();renderCharacterTabs();
}
function castSpell(id){
  const c=getChar();const sp=c.spells.find(s=>s.id===id);if(!sp)return;
  if(sp.manaCost>0&&c.mana.current<sp.manaCost){alert(`Not enough Mana! Need ${sp.manaCost}, have ${c.mana.current}.`);return;}
  if(sp.manaCost>0){c.mana.current-=sp.manaCost;ensureClamp(c);pushState();renderHeader();renderMainFields();}
}
function useLostMagic(id){
  const c=getChar();const lm=c.lostMagic.find(l=>l.id===id);if(!lm)return;
  if(lm.manaCost>0&&c.mana.current<lm.manaCost){alert(`Not enough Mana! Need ${lm.manaCost}, have ${c.mana.current}.`);return;}
  if(lm.manaCost>0){c.mana.current-=lm.manaCost;ensureClamp(c);pushState();renderHeader();renderMainFields();}
}
function addSpell(){
  const c=getChar();const name=el('spellName')?.value.trim();const rank=el('spellRank')?.value||'D';
  const manaCost=Math.max(0,Number(el('spellManaCost')?.value)||0);const type=el('spellType')?.value||'Offensive';
  const description=el('spellDescription')?.value.trim();
  if(!name||!description){alert('Spell needs a name and description.');return;}
  const btn=el('addSpellBtn');const editId=btn?.dataset.editId;
  if(editId){const sp=c.spells.find(s=>s.id===editId);if(sp){sp.name=name;sp.rank=rank;sp.manaCost=manaCost;sp.type=type;sp.description=description;}delete btn.dataset.editId;if(btn)btn.textContent='Add Spell';}
  else{c.spells.push({id:`spell-${Date.now()}`,name,rank,manaCost,type,description});}
  ['spellName','spellManaCost','spellDescription'].forEach(id=>{const e=el(id);if(e)e.value='';});
  pushState();renderSpells();renderHeader();
}
function addLostMagic(){
  const name=el('dmLMName')?.value.trim();const cost=Math.max(0,Number(el('dmLMCost')?.value)||0);
  const desc=el('dmLMDescription')?.value.trim();const ti=Number(el('dmLMTarget')?.value??state.selectedCharacter);
  if(!name||!desc){alert('Fill out the Lost Magic form.');return;}
  const target=state.characters[ti];if(!target){alert('No target found.');return;}
  target.lostMagic.push({id:`lm-${Date.now()}`,name,manaCost:cost,description:desc});
  ['dmLMName','dmLMCost','dmLMDescription'].forEach(id=>{const e=el(id);if(e)e.value='';});
  pushState();render();
}
function rollHp(){
  const c=getChar();const conM=mod(c.stats.CON);
  const isPower=c.magicCategory?.startsWith('power');
  const roll=rollD10();const total=Math.max(1,roll+conM);
  c.hp.max+=total;c.hp.current=c.hp.max;pushState();render();
  alert(`HP Roll: d10(${roll}) + CON(${conM}) = +${total}${isPower?'\n[Power magic: 1d10 hit dice]':''}\nNew Max: ${c.hp.max}`);
}
function rollMana(){
  const c=getChar();const cat=getMagicCat(c);
  const sm=spellMod(c);const mcBonus=skillTotal(c,'Magic Control')-sm;// just extra bonus part
  const fullBonus=spellMod(c)+(c.skills['Magic Control']?.bonus||0);
  const roll=cat?.manaRoll==='1d8'?rollD8():rollD10();
  const total=Math.max(1,roll+fullBonus);
  c.mana.max+=total;c.mana.current=c.mana.max;pushState();render();
  alert(`Mana Roll: ${cat?.manaRoll||'1d10'}(${roll}) + ${cat?.stat||'INT'} mod & Magic Control = +${total}\nNew Max: ${c.mana.max}`);
}
function saveCharState(){
  const c=getChar();
  if(el('stateActive')?.checked)c.state='active';
  if(el('stateReserve')?.checked)c.state='reserve';
  if(el('stateDead')?.checked){c.state='dead';c.hp.current=0;c.mana.current=0;}
  pushState();render();
}
function openDmOverlay(){
  el('dmOverlay')?.classList.remove('hidden');
  if(!dmUnlocked){el('dmLoginPanel')?.classList.remove('hidden');el('dmFullscreenPanel')?.classList.add('hidden');const p=el('dmPasswordInput');if(p){p.value='';p.focus();}}
  else{el('dmLoginPanel')?.classList.add('hidden');el('dmFullscreenPanel')?.classList.remove('hidden');renderDmLostMagic();renderDmTargetSelect();renderThemeFields();}
}
function closeDmOverlay(){el('dmOverlay')?.classList.add('hidden');}
function lockDm(){dmUnlocked=false;sessionStorage.removeItem('ft-dm');el('dmFullscreenPanel')?.classList.add('hidden');el('dmLoginPanel')?.classList.remove('hidden');}
function unlockDm(){
  if(el('dmPasswordInput')?.value!==DM_PASS){alert('Wrong password.');return;}
  dmUnlocked=true;sessionStorage.setItem('ft-dm','1');
  el('dmLoginPanel')?.classList.add('hidden');el('dmFullscreenPanel')?.classList.remove('hidden');
  renderDmLostMagic();renderDmTargetSelect();renderThemeFields();
}

// ================================================================
// BINDINGS
// ================================================================
function updateField(field,value){
  const c=getChar();
  const mf={maxHp:'hp.max',currentHp:'hp.current',maxMana:'mana.max',currentMana:'mana.current'};
  if(mf[field]){const[o,k]=mf[field].split('.');c[o][k]=Math.max(0,Number(value)||0);}
  else if(['level','armor'].includes(field))c[field]=Math.max(0,Number(value)||0);
  else c[field]=value;
  ensureClamp(c);pushState();
  renderHeader();renderMainFields();renderMagicBanner();renderCharacterTabs();
  if(field==='level'||field==='magicCategory'){renderCalcPanel();renderSkillsMatrix();renderStats();}
}
function bindAll(){
  const ii=(id,field)=>{const e=el(id);if(e)e.addEventListener('input',ev=>updateField(field,ev.target.value));};
  const ic=(id,field)=>{const e=el(id);if(e)e.addEventListener('change',ev=>updateField(field,ev.target.value));};
  ii('charName','name');ii('charLevel','level');ii('charRace','race');ii('charClass','className');
  ii('charAge','age');ii('charBackground','background');ii('charMagicType','magicType');
  ic('charMagicCategory','magicCategory');ic('magicRank','magicRank');
  ii('charGuild','guild');ii('charGuildMark','guildMark');ii('charExceed','exceed');
  ii('currentHp','currentHp');ii('maxHp','maxHp');ii('currentMana','currentMana');ii('maxMana','maxMana');
  ii('armor','armor');ii('speed','speed');
  ii('weaponsText','weaponsText');ii('abilitiesText','abilitiesText');ii('inventoryText','inventoryText');ii('notesText','notesText');

  document.querySelectorAll('.tab-btn[data-tab]').forEach(b=>b.addEventListener('click',()=>{state.activeTab=b.dataset.tab;pushState();renderTabs();}));
  el('statsGrid')?.addEventListener('click',e=>{const btn=e.target.closest('button[data-action]');if(!btn)return;const c=getChar();c.stats[btn.dataset.stat]=(Number(c.stats[btn.dataset.stat])||0)+(btn.dataset.action==='plus'?1:-1);pushState();renderStats();renderSkillsMatrix();renderCalcPanel();renderMagicBanner();});
  document.addEventListener('click',e=>{const btn=e.target.closest('.adj-btn');if(!btn)return;adjustResource(btn.dataset.resource,Number(btn.dataset.amt));});
  el('rollHpBtn')?.addEventListener('click',rollHp);
  el('rollManaBtn')?.addEventListener('click',rollMana);
  el('restoreHpBtn')?.addEventListener('click',()=>{const c=getChar();c.hp.current=c.hp.max;pushState();render();});
  el('restoreManaBtn')?.addEventListener('click',()=>{const c=getChar();c.mana.current=c.mana.max;pushState();render();});
  el('addCharacterBtn')?.addEventListener('click',()=>{const nc=blankChar(state.characters.length);nc.state='reserve';state.characters.push(nc);localStorage.setItem('ft-my-char-id',nc.id);state.selectedCharacter=state.characters.length-1;state.showReserve=true;listenToChar(nc.id);pushState();render();});
  el('toggleReserveBtn')?.addEventListener('click',()=>{state.showReserve=!state.showReserve;pushState();render();});
  el('toggleDeadBtn')?.addEventListener('click',()=>{state.showDead=!state.showDead;pushState();render();});
  el('addSpellBtn')?.addEventListener('click',addSpell);
  el('addLostMagicBtn')?.addEventListener('click',addLostMagic);
  el('saveCharacterStateBtn')?.addEventListener('click',saveCharState);
  el('deleteCharacterBtn')?.addEventListener('click',()=>{if(state.characters.length<=1){alert('Keep at least one.');return;}if(!confirm(`Delete ${getChar().name||'this character'}?`))return;state.characters.splice(state.selectedCharacter,1);if(state.selectedCharacter>=state.characters.length)state.selectedCharacter=state.characters.length-1;pushState();render();});
  el('openDmOverlayBtn')?.addEventListener('click',openDmOverlay);
  el('dmLoginBtn')?.addEventListener('click',unlockDm);
  el('dmCloseBtn')?.addEventListener('click',closeDmOverlay);
  el('dmCloseFullBtn')?.addEventListener('click',closeDmOverlay);
  el('dmLogoutBtn')?.addEventListener('click',lockDm);
  el('dmPasswordInput')?.addEventListener('keydown',e=>{if(e.key==='Enter')unlockDm();});
  const readTheme=()=>({bg:el('themeBgColor')?.value||DEF_THEME.bg,panel:el('themePanelColor')?.value||DEF_THEME.panel,accent:el('themeAccentColor')?.value||DEF_THEME.accent,accentTwo:el('themeAccentTwoColor')?.value||DEF_THEME.accentTwo,mana:el('themeManaColor')?.value||DEF_THEME.mana,text:el('themeTextColor')?.value||DEF_THEME.text});
  ['themeBgColor','themePanelColor','themeAccentColor','themeAccentTwoColor','themeManaColor','themeTextColor'].forEach(id=>{el(id)?.addEventListener('input',()=>{state.theme=readTheme();applyTheme();});});
  el('saveThemeBtn')?.addEventListener('click',()=>{state.theme=readTheme();pushTheme();render();});
  el('resetThemeBtn')?.addEventListener('click',()=>{state.theme={...DEF_THEME};pushState();render();});
}

// ================================================================
// INIT — migrate old single-doc data then start listeners
// ================================================================
async function init(){
  bindAll();
  render();

  const myId=getMyCharId();
  const myDocSnap=await getDoc(doc(db,CHARS_COLL,myId)).catch(()=>null);

  if(!myDocSnap||!myDocSnap.exists()){
    const oldSnap=await getDoc(doc(db,'campaigns','ft-campaign')).catch(()=>null);
    if(oldSnap&&oldSnap.exists()){
      try{
        const oldState=JSON.parse(oldSnap.data().data);
        const oldChars=oldState?.characters;
        if(Array.isArray(oldChars)&&oldChars.length){
          console.log('Migrating',oldChars.length,'FT characters from old doc…');
          for(const c of oldChars){
            if(c&&c.id) await setDoc(doc(db,CHARS_COLL,c.id),{data:JSON.stringify(c),updated:Date.now()});
          }
          state.characters=oldChars;
          const firstNamed=oldChars.find(c=>c.name);
          if(firstNamed)localStorage.setItem('ft-my-char-id',firstNamed.id);
          saveLocal();render();
        }
        if(oldState?.theme) await setDoc(doc(db,META_DOC,'theme'),{data:JSON.stringify(oldState.theme),updated:Date.now()});
      }catch(e){console.error('Migration error:',e);}
    }
  }

  startListeners();
}

init();
