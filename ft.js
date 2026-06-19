// ============================================================
// Fairy Tail DnD — ft.js
// Full auto-calculations + Magic Type system + Firebase
// No import/export — Firebase is the save
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getFirestore, doc, collection, getDoc, getDocs, onSnapshot, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

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
    portrait: '', accentColor: '', claimedBy: '',
    stats:{STR:10,DEX:10,CON:10,INT:10,WIS:10,CHA:10},
    skills:makeBlankSkills(),
    hp:{current:0,max:0}, mana:{current:0,max:0},
    armor:0, speed:'30 ft', tempHp:0,
    deathSaves:{successes:0,failures:0,stable:false},
    weaponsText:'',abilitiesText:'',inventoryText:'',notesText:'',
    relationships:[],
    spells:[],lostMagic:[]
  };
}
const DEF_STATE = {selectedCharacter:0,activeTab:'skills',showReserve:false,showDead:false,theme:{...DEF_THEME},characters:[blankChar(0),blankChar(1),blankChar(2),blankChar(3)]};

let state  = structuredClone(DEF_STATE);
let _unsub = null;
let _welcomeShown = false;
let dmUnlocked = sessionStorage.getItem('ft-dm') === '1';

// ── PRESENCE ──
const MY_PRESENCE_ID = localStorage.getItem('ft-pid') || (() => { const id = Math.random().toString(36).slice(2); localStorage.setItem('ft-pid', id); return id; })();
const PRESENCE_COLORS = ['#ff6b6b','#4ecdc4','#ffe66d','#a29bfe','#fd79a8','#55efc4','#fdcb6e','#74b9ff'];
const MY_COLOR = PRESENCE_COLORS[Math.floor(Math.random()*PRESENCE_COLORS.length)];
let _presenceUnsub=null;
async function pushPresence(){
  try{
    const mine=state.characters.find(c=>c.claimedBy===MY_PRESENCE_ID);
    const name=mine?.name||'Unknown';
    const color=mine?.accentColor||MY_COLOR;
    await setDoc(doc(db,'ft-presence',MY_PRESENCE_ID),{id:MY_PRESENCE_ID,name,color,tab:state.selectedCharacter,ts:Date.now()});
  }catch(e){}
}
function startPresenceListener(){
  if(_presenceUnsub)_presenceUnsub();
  _presenceUnsub=onSnapshot(collection(db,'ft-presence'),snap=>{
    const now=Date.now();const active=[];
    snap.forEach(d=>{
      const p=d.data();
      if(now-p.ts<35000){active.push(p);}
      else{deleteDoc(doc(db,'ft-presence',d.id)).catch(()=>{});}
    });
    renderPresence(active);
  },()=>{});
}
function renderPresence(players){
  const el2=document.getElementById('presenceBar');if(!el2)return;
  if(!players.length){el2.innerHTML='';return;}
  el2.innerHTML=players.map(p=>`<div class="presence-dot" style="border-color:${p.color};box-shadow:0 0 8px ${p.color}55" title="${esc(p.name)}"><span style="background:${p.color}"></span>${esc(p.name.split(' ')[0]||'?')}</div>`).join('');
}
setInterval(pushPresence,20000);

// ── BROADCAST ──
async function sendBroadcast(msg){if(!msg.trim())return;await setDoc(doc(db,'ft-meta','broadcast'),{msg,ts:Date.now(),from:'DM'});}
let _broadcastUnsub=null,_lastBroadcastTs=0;
function startBroadcastListener(){if(_broadcastUnsub)_broadcastUnsub();_broadcastUnsub=onSnapshot(doc(db,'ft-meta','broadcast'),snap=>{if(!snap.exists())return;const d=snap.data();if(d.ts>_lastBroadcastTs){_lastBroadcastTs=d.ts;showBroadcast(d.msg);}},()=>{});}
function showBroadcast(msg){let b=document.getElementById('broadcastBanner');if(!b){b=document.createElement('div');b.id='broadcastBanner';b.className='broadcast-banner';document.body.appendChild(b);}b.innerHTML=`<span class="broadcast-from">📡 DM:</span> ${esc(msg)} <button onclick="this.parentElement.remove()">×</button>`;b.classList.add('show');clearTimeout(b._t);b._t=setTimeout(()=>b.remove(),12000);}

// ── PORTRAIT ──
function initPortrait(){const upload=document.getElementById('portraitUpload');if(!upload)return;upload.addEventListener('change',e=>{const file=e.target.files[0];if(!file)return;const reader=new FileReader();reader.onload=ev=>{const img=new Image();img.onload=()=>{const canvas=document.createElement('canvas');const MAX=200;const ratio=Math.min(MAX/img.width,MAX/img.height);canvas.width=Math.round(img.width*ratio);canvas.height=Math.round(img.height*ratio);canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);const c=getChar();c.portrait=canvas.toDataURL('image/jpeg',.75);renderPortrait(c);pushState();};img.src=ev.target.result;};reader.readAsDataURL(file);});}
function renderPortrait(c){
  const img=document.getElementById('portraitImg');
  const label=document.getElementById('portraitLabel');
  if(!img||!label)return;
  if(c.portrait){
    img.src=c.portrait;img.style.display='block';label.style.display='none';
  }else{
    img.src='';img.style.display='none';label.style.display='flex';
  }
}

// ── DEATH SAVES ──
function renderDeathSaves(c){const ds=c.deathSaves||{successes:0,failures:0,stable:false};['deathSuccesses','deathFailures'].forEach((id,fi)=>{const el2=document.getElementById(id);if(!el2)return;el2.innerHTML=[0,1,2].map(i=>{const filled=i<(fi===0?ds.successes:ds.failures);return`<button class="ds-pip ${filled?(fi===0?'pip-success':'pip-failure'):''}" data-type="${fi===0?'success':'failure'}" data-i="${i}"></button>`;}).join('');el2.querySelectorAll('.ds-pip').forEach(btn=>{btn.addEventListener('click',()=>{const c2=getChar();if(!c2.deathSaves)c2.deathSaves={successes:0,failures:0,stable:false};const type=btn.dataset.type;const idx=parseInt(btn.dataset.i);const key=type==='success'?'successes':'failures';c2.deathSaves[key]=c2.deathSaves[key]===idx+1?idx:idx+1;pushState(true);render();});});});}
function bindDeathSaves(){document.getElementById('stableBtn')?.addEventListener('click',()=>{const c=getChar();if(!c.deathSaves)c.deathSaves={successes:0,failures:0,stable:false};c.deathSaves.stable=true;c.deathSaves.successes=3;pushState(true);render();});document.getElementById('resetDeathBtn')?.addEventListener('click',()=>{const c=getChar();c.deathSaves={successes:0,failures:0,stable:false};pushState(true);render();});}

// ── GRANT ──
function renderGrantTargetSelect(){const sel=document.getElementById('grantTarget');if(!sel)return;sel.innerHTML=state.characters.map((c,i)=>`<option value="${i}">${esc(c.name||`Player ${i+1}`)}</option>`).join('');}
function bindGrant(){document.getElementById('grantBtn')?.addEventListener('click',()=>{const targetIdx=parseInt(document.getElementById('grantTarget')?.value??'0');const xp=parseInt(document.getElementById('grantXp')?.value)||0;const item=document.getElementById('grantItem')?.value.trim()||'';if(!xp&&!item)return;const c=state.characters[targetIdx];if(!c)return;const grant=[];if(xp)grant.push(`+${xp} XP`);if(item)grant.push(item);c.notesText=(c.notesText||'')+`\n[DM Grant] ${grant.join(' · ')}`;if(item)c.inventoryText=(c.inventoryText||'')+`\n${item}`;pushState();document.getElementById('grantXp').value='';document.getElementById('grantItem').value='';alert(`Granted to ${c.name||`Player ${targetIdx+1}`}: ${grant.join(', ')}`);render();});}
function bindBroadcast(){document.getElementById('broadcastBtn')?.addEventListener('click',()=>{const msg=document.getElementById('broadcastInput')?.value.trim();if(!msg)return;sendBroadcast(msg);document.getElementById('broadcastInput').value='';});}

let _pushDebounce=null;
async function pushState(immediate=false){
  const hasData=state.characters.some(c=>c.name&&c.name.trim());
  if(!hasData)return;
  if(immediate){
    setSyncDot('syncing');
    try{await setDoc(doc(db,'campaigns','ft-campaign'),{data:JSON.stringify(state)});setSyncDot('synced');}
    catch(e){console.error(e);setSyncDot('error');}
    return;
  }
  setSyncDot('syncing');
  clearTimeout(_pushDebounce);
  _pushDebounce=setTimeout(async()=>{
    try{await setDoc(doc(db,'campaigns','ft-campaign'),{data:JSON.stringify(state)});setSyncDot('synced');}
    catch(e){console.error(e);setSyncDot('error');}
  },600);
}

function startListener(){
  if(_unsub)_unsub();
  _unsub=onSnapshot(doc(db,'campaigns','ft-campaign'),snap=>{
    if(!snap.exists())return;
    try{
      const remote=normalize(JSON.parse(snap.data().data));
      checkStateChanges(remote);
      remote.characters.forEach((rc,i)=>{state.characters[i]=rc;});
      while(state.characters.length<remote.characters.length)
        state.characters.push(remote.characters[state.characters.length]);
      state.theme=remote.theme;
      setSyncDot('synced');
      try{renderCharacterTabs();}catch(e){}
      try{renderHeader();}catch(e){}
      try{applyTheme();}catch(e){}
      try{renderMainFields();}catch(e){}
      try{renderCalcPanel();}catch(e){}
      try{renderStats();}catch(e){}
      try{renderSkillsMatrix();}catch(e){}
      try{renderSpells();}catch(e){}
      try{renderLostMagic();}catch(e){}
      try{renderMagicBanner();}catch(e){}
      try{applyCharacterAccents();}catch(e){}
      try{checkLowHp(getChar());}catch(e){}
      recheckWelcomeIfNeeded();
      if(!document.getElementById('welcomeOverlay')&&!_welcomeShown){_welcomeShown=true;checkWelcome();}
    }catch(e){console.error('Snapshot error:',e);}
  },e=>{console.error(e);setSyncDot('error');});
}

function setSyncDot(s){
  const d=el('syncDot');if(!d)return;
  d.className='sync-dot '+s;
  d.title={synced:'Synced',syncing:'Syncing…',error:'Offline — changes may not save'}[s]||s;
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
function getChar(){
  if(dmUnlocked)return state.characters[state.selectedCharacter]||state.characters[0];
  const mine=state.characters.find(c=>c.claimedBy===MY_PRESENCE_ID);
  if(mine)return mine;
  return state.characters[state.selectedCharacter]||state.characters[0];
}
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
    const isOwn=c.claimedBy===MY_PRESENCE_ID;
    const isSel=i===state.selectedCharacter;
    const takenByOther=c.claimedBy&&c.claimedBy!==MY_PRESENCE_ID;
    const hpColor=pct>50?'var(--safe)':pct>25?'var(--warn)':'var(--danger)';
    const color=c.accentColor||(isOwn?'var(--gold)':'rgba(255,255,255,.15)');
    const btn=document.createElement('button');btn.type='button';
    btn.className=`character-tab${c.state==='reserve'?' reserve':''}${c.state==='dead'?' dead':''}${isSel?' active':''}${isOwn?' owned':''}`;
    btn.style.setProperty('--char-color',color);
    btn.innerHTML=`
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:.4rem">
        <strong>${esc(c.name||`Player ${i+1}`)}</strong>
        ${isOwn?'<span class="tab-badge you">YOU</span>':takenByOther?'<span class="tab-badge taken">●</span>':''}
      </div>
      <span>${esc(c.magicType||c.className||'—')} · Lv${c.level}</span>
      <div class="tab-hp-bar"><div class="tab-hp-fill" style="width:${pct}%;background:${hpColor};box-shadow:0 0 6px ${hpColor}60"></div></div>`;
    if(dmUnlocked){
      btn.addEventListener('click',()=>{state.selectedCharacter=i;render();});
    }else{
      btn.style.cursor='default';
      if(!isOwn)btn.classList.add('locked-tab');
    }
    tabs.appendChild(btn);
  });
}

// ================================================================
// HEADER
// ================================================================
function renderHeader(){
  const c=getChar();const name=c.name||'—';
  const mine=getChar();
  const s=(id,v)=>{const e=el(id);if(e)e.textContent=v;};
  s('topCharacterName',name);
  s('selectedNameSmall',name);
  s('selectedState',c.state.charAt(0).toUpperCase()+c.state.slice(1));
  s('selectedMagicType',c.magicType||'—');s('selectedSpellCount',c.spells.length);
  // Topbar bars always show YOUR OWN character
  s('topHpMini',`${c.hp.current} / ${c.hp.max}`);
  s('topManaMini',`${c.mana.current} / ${c.mana.max}`);
  s('topArmorMini',c.armor);
  s('dmSelectedCharacterName',name);
  const hpPct=c.hp.max>0?(c.hp.current/c.hp.max)*100:0;
  const mPct=c.mana.max>0?(c.mana.current/c.mana.max)*100:0;
  const hb=el('topHpBar');if(hb)hb.style.width=hpPct+'%';
  const mb=el('topManaBar');if(mb)mb.style.width=mPct+'%';
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
  renderLMAssignList();
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
      pushState(true);render();
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
  try{renderCharacterTabs();}catch(e){}
  try{renderHeader();}catch(e){}
  try{renderMainFields();}catch(e){}
  try{renderPortrait(c);}catch(e){}
  try{renderDeathSaves(c);}catch(e){}
  try{renderRelationships();}catch(e){}
  try{renderAccentColor();}catch(e){}
  try{applyCharacterAccents();}catch(e){}
  try{checkResourceFlash(c);}catch(e){}
  try{checkLowHp(c);}catch(e){}
  try{renderMagicBanner();}catch(e){}
  try{renderCalcPanel();}catch(e){}
  try{renderStats();}catch(e){}
  try{renderSkillsMatrix();}catch(e){}
  try{renderSpells();}catch(e){}
  try{renderLostMagic();}catch(e){}
  try{renderDmLostMagic();}catch(e){}
  try{renderDmTargetSelect();}catch(e){}
  try{renderGrantTargetSelect();}catch(e){}
  try{renderThemeFields();}catch(e){}
  try{renderTabs();}catch(e){}
  try{pushPresence();}catch(e){}
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
function renderLMAssignList(){
  const cont=el('dmLMAssignList');if(!cont)return;
  const active=state.characters.filter(c=>c.state!=='dead');
  cont.innerHTML=`
    <label class="dm-assign-pill all"><input type="checkbox" id="lmAssignAll"> <span>✦ All Players</span></label>
    ${active.map(c=>{const realIdx=state.characters.indexOf(c);return `<label class="dm-assign-pill"><input type="checkbox" class="lm-assign-cb" data-idx="${realIdx}"> <span>${esc(c.name||`Player ${realIdx+1}`)}</span></label>`;}).join('')}`;
  el('lmAssignAll')?.addEventListener('change',e=>{cont.querySelectorAll('.lm-assign-cb').forEach(cb=>cb.checked=e.target.checked);});
}
function addLostMagic(){
  const name=el('dmLMName')?.value.trim();const cost=Math.max(0,Number(el('dmLMCost')?.value)||0);
  const desc=el('dmLMDescription')?.value.trim();
  if(!name||!desc){alert('Fill out the Lost Magic name and description.');return;}
  const checked=[...document.querySelectorAll('.lm-assign-cb:checked')].map(cb=>Number(cb.dataset.idx));
  if(!checked.length){alert('Select at least one player.');return;}
  const baseId=Date.now();
  checked.forEach((idx,n)=>{
    const target=state.characters[idx];
    if(target){if(!Array.isArray(target.lostMagic))target.lostMagic=[];target.lostMagic.push({id:`lm-${baseId}-${n}`,name,manaCost:cost,description:desc});}
  });
  ['dmLMName','dmLMCost','dmLMDescription'].forEach(id=>{const e=el(id);if(e)e.value='';});
  document.querySelectorAll('.lm-assign-cb, #lmAssignAll').forEach(cb=>cb.checked=false);
  pushState(true);render();renderDmLostMagic();
  showToast(`"${name}" granted to ${checked.length} player${checked.length>1?'s':''}`,'success',4000);
}
function rollHp(){
  const c=getChar();const conM=mod(c.stats.CON);
  const isPower=c.magicCategory?.startsWith('power');
  const roll=rollD10();const total=Math.max(1,roll+conM);
  c.hp.max+=total;c.hp.current=c.hp.max;pushState(true);render();
  alert(`HP Roll: d10(${roll}) + CON(${conM}) = +${total}${isPower?'\n[Power magic: 1d10 hit dice]':''}\nNew Max: ${c.hp.max}`);
}
function rollMana(){
  const c=getChar();const cat=getMagicCat(c);
  const sm=spellMod(c);const mcBonus=skillTotal(c,'Magic Control')-sm;// just extra bonus part
  const fullBonus=spellMod(c)+(c.skills['Magic Control']?.bonus||0);
  const roll=cat?.manaRoll==='1d8'?rollD8():rollD10();
  const total=Math.max(1,roll+fullBonus);
  c.mana.max+=total;c.mana.current=c.mana.max;pushState(true);render();
  alert(`Mana Roll: ${cat?.manaRoll||'1d10'}(${roll}) + ${cat?.stat||'INT'} mod & Magic Control = +${total}\nNew Max: ${c.mana.max}`);
}
function saveCharState(){
  const c=getChar();
  if(el('stateActive')?.checked)c.state='active';
  if(el('stateReserve')?.checked)c.state='reserve';
  if(el('stateDead')?.checked){c.state='dead';c.hp.current=0;c.mana.current=0;}
  pushState(true);render();
}
function openDmOverlay(){
  el('dmOverlay')?.classList.remove('hidden');
  if(!dmUnlocked){el('dmLoginPanel')?.classList.remove('hidden');el('dmFullscreenPanel')?.classList.add('hidden');const p=el('dmPasswordInput');if(p){p.value='';p.focus();}}
  else{el('dmLoginPanel')?.classList.add('hidden');el('dmFullscreenPanel')?.classList.remove('hidden');activatePlayersTab();renderDmLostMagic();renderDmTargetSelect();renderThemeFields();}
}
function activatePlayersTab(){
  document.querySelectorAll('.dm-nav-btn').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.dm-tab').forEach(t=>t.classList.remove('active'));
  document.querySelector('.dm-nav-btn[data-dm-tab="players"]')?.classList.add('active');
  document.querySelector('.dm-tab[data-dm-tab="players"]')?.classList.add('active');
}
function closeDmOverlay(){el('dmOverlay')?.classList.add('hidden');}
function lockDm(){dmUnlocked=false;sessionStorage.removeItem('ft-dm');el('dmFullscreenPanel')?.classList.add('hidden');el('dmLoginPanel')?.classList.remove('hidden');}
function unlockDm(){
  if(el('dmPasswordInput')?.value!==DM_PASS){alert('Wrong password.');return;}
  dmUnlocked=true;sessionStorage.setItem('ft-dm','1');
  el('dmLoginPanel')?.classList.add('hidden');el('dmFullscreenPanel')?.classList.remove('hidden');
  activatePlayersTab();renderDmLostMagic();renderDmTargetSelect();renderThemeFields();
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
  el('restoreHpBtn')?.addEventListener('click',()=>{const c=getChar();c.hp.current=c.hp.max;pushState(true);render();});
  el('restoreManaBtn')?.addEventListener('click',()=>{const c=getChar();c.mana.current=c.mana.max;pushState(true);render();});
  el('addCharacterBtn')?.addEventListener('click',()=>{const nc=blankChar(state.characters.length);nc.state='reserve';state.characters.push(nc);const ni=state.characters.length-1;state.selectedCharacter=ni;state.showReserve=true;pushState(true);render();});
  el('toggleReserveBtn')?.addEventListener('click',()=>{state.showReserve=!state.showReserve;pushState(true);render();});
  el('toggleDeadBtn')?.addEventListener('click',()=>{state.showDead=!state.showDead;pushState(true);render();});
  el('addSpellBtn')?.addEventListener('click',addSpell);
  el('addLostMagicBtn')?.addEventListener('click',addLostMagic);
  el('saveCharacterStateBtn')?.addEventListener('click',saveCharState);
  el('deleteCharacterBtn')?.addEventListener('click',()=>{if(state.characters.length<=1){alert('Keep at least one.');return;}if(!confirm(`Delete ${getChar().name||'this character'}?`))return;state.characters.splice(state.selectedCharacter,1);if(state.selectedCharacter>=state.characters.length)state.selectedCharacter=state.characters.length-1;pushState(true);render();});
  el('openDmOverlayBtn')?.addEventListener('click',openDmOverlay);
  el('dmLoginBtn')?.addEventListener('click',unlockDm);
  el('dmCloseBtn')?.addEventListener('click',closeDmOverlay);
  el('dmCloseFullBtn')?.addEventListener('click',closeDmOverlay);
  el('dmLogoutBtn')?.addEventListener('click',lockDm);
  el('dmPasswordInput')?.addEventListener('keydown',e=>{if(e.key==='Enter')unlockDm();});

  // DM panel tab switching
  document.querySelectorAll('.dm-nav-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const tab=btn.dataset.dmTab;
      document.querySelectorAll('.dm-nav-btn').forEach(b=>b.classList.remove('active'));
      document.querySelectorAll('.dm-tab').forEach(t=>t.classList.remove('active'));
      btn.classList.add('active');
      document.querySelector(`.dm-tab[data-dm-tab="${tab}"]`)?.classList.add('active');
      if(tab==='magic'){renderDmLostMagic();}
    });
  });
  const readTheme=()=>({bg:el('themeBgColor')?.value||DEF_THEME.bg,panel:el('themePanelColor')?.value||DEF_THEME.panel,accent:el('themeAccentColor')?.value||DEF_THEME.accent,accentTwo:el('themeAccentTwoColor')?.value||DEF_THEME.accentTwo,mana:el('themeManaColor')?.value||DEF_THEME.mana,text:el('themeTextColor')?.value||DEF_THEME.text});
  ['themeBgColor','themePanelColor','themeAccentColor','themeAccentTwoColor','themeManaColor','themeTextColor'].forEach(id=>{el(id)?.addEventListener('input',()=>{state.theme=readTheme();applyTheme();});});
  el('saveThemeBtn')?.addEventListener('click',()=>{state.theme=readTheme();pushTheme();render();});
  el('resetThemeBtn')?.addEventListener('click',()=>{state.theme={...DEF_THEME};pushState(true);render();});
}

// ── RELATIONSHIPS ──
const FT_RELATION_TYPES=['Ally','Guild Member','Rival','Enemy','Mentor','Family','Client','Neutral'];
function renderRelationships(){
  const c=getChar();const cont=el('relationshipsContainer');if(!cont)return;
  const rels=c.relationships||[];
  cont.innerHTML=rels.map((r,i)=>`
    <div class="rel-card" data-i="${i}">
      <div class="rel-card-top">
        <input class="rel-name" data-i="${i}" value="${esc(r.name||'')}" placeholder="Name…">
        <select class="rel-type" data-i="${i}">${FT_RELATION_TYPES.map(t=>`<option value="${t}" ${r.type===t?'selected':''}>${t}</option>`).join('')}</select>
        <button class="rel-del neo-btn small ghost" data-i="${i}">✕</button>
      </div>
      <textarea class="rel-notes" data-i="${i}" placeholder="Notes about this person…">${esc(r.notes||'')}</textarea>
    </div>`).join('');
  cont.querySelectorAll('.rel-name,.rel-notes,.rel-type').forEach(inp=>{
    inp.addEventListener('input',()=>saveRelationships(c));
    inp.addEventListener('change',()=>saveRelationships(c));
  });
  cont.querySelectorAll('.rel-del').forEach(btn=>{
    btn.addEventListener('click',()=>{const i=parseInt(btn.dataset.i);c.relationships.splice(i,1);pushState();renderRelationships();});
  });
}
function saveRelationships(c){
  const cont=el('relationshipsContainer');if(!cont)return;
  const cards=cont.querySelectorAll('.rel-card');
  c.relationships=Array.from(cards).map(card=>({name:card.querySelector('.rel-name').value,type:card.querySelector('.rel-type').value,notes:card.querySelector('.rel-notes').value}));
  pushState();
}
function bindRelationships(){el('addRelBtn')?.addEventListener('click',()=>{const c=getChar();if(!c.relationships)c.relationships=[];c.relationships.push({name:'',type:'Neutral',notes:''});pushState();renderRelationships();});}

// ── ACCENT COLOR ──
function applyCharacterAccents(){state.characters.forEach((c,i)=>{const color=c.accentColor||'';const tabs=document.querySelectorAll('.character-tab');if(tabs[i]&&color)tabs[i].style.setProperty('--char-color',color);});}
function bindAccentColor(){el('accentColorInput')?.addEventListener('input',e=>{const c=getChar();c.accentColor=e.target.value;pushState();applyCharacterAccents();});}
function renderAccentColor(){const c=getChar();const inp=el('accentColorInput');if(inp)inp.value=c.accentColor||'#e8a030';}

// ── RESOURCE FLASH ──
let _prevHp=null,_prevMana=null;
function checkResourceFlash(c){
  if(_prevHp!==null&&c.hp.current<_prevHp)flashBar('topHpBar','flash-damage');
  if(_prevHp!==null&&c.hp.current>_prevHp)flashBar('topHpBar','flash-heal');
  if(_prevMana!==null&&c.mana.current<_prevMana)flashBar('topManaBar','flash-damage');
  if(_prevMana!==null&&c.mana.current>_prevMana)flashBar('topManaBar','flash-heal');
  _prevHp=c.hp.current;_prevMana=c.mana.current;
}
function flashBar(id,cls){const bar=el(id);if(!bar)return;bar.classList.remove('flash-damage','flash-heal');void bar.offsetWidth;bar.classList.add(cls);setTimeout(()=>bar.classList.remove(cls),600);}

// ── LOW HP ──
function checkLowHp(c){
  const track=document.querySelector('.hud-hp .hud-bar-track');const fill=el('topHpBar');if(!track||!fill)return;
  const pct=c.hp.max>0?c.hp.current/c.hp.max:1;
  if(pct<=0.25&&c.hp.max>0){track.classList.add('low-hp');fill.classList.add('low-hp-fill');}
  else{track.classList.remove('low-hp');fill.classList.remove('low-hp-fill');}
}

// ── FULLSCREEN ──
function bindFullscreen(){el('fullscreenBtn')?.addEventListener('click',()=>{document.querySelector('.app')?.classList.toggle('sidebar-hidden');const btn=el('fullscreenBtn');const hidden=document.querySelector('.app')?.classList.contains('sidebar-hidden');if(btn)btn.textContent=hidden?'◀ Show':'▶ Hide';});}

// ── TOAST ──
let _toastTimer=null;
function showToast(msg,type='info',duration=3500){let t=document.getElementById('toastEl');if(!t){t=document.createElement('div');t.id='toastEl';t.className='toast';document.body.appendChild(t);}t.className=`toast toast-${type} show`;t.textContent=msg;clearTimeout(_toastTimer);_toastTimer=setTimeout(()=>t.classList.remove('show'),duration);}
window.showToast=showToast;
let _toastPrevState=null;
function checkStateChanges(remote){
  if(!_toastPrevState){_toastPrevState=remote;return;}
  remote.characters.forEach((c,i)=>{
    const prev=_toastPrevState.characters?.[i];if(!prev||!c.name)return;
    if(c.hp.current<prev.hp.current)showToast(`${c.name} took ${prev.hp.current-c.hp.current} damage`,'danger');
    else if(c.hp.current>prev.hp.current)showToast(`${c.name} healed ${c.hp.current-prev.hp.current} HP`,'heal');
    if(c.mana.current<prev.mana.current)showToast(`${c.name} used ${prev.mana.current-c.mana.current} Mana`,'warn');
    if(c.level>prev.level)showToast(`⭐ ${c.name} leveled up to ${c.level}!`,'success',5000);
  });
  _toastPrevState=remote;
}

// ── WELCOME ──
function getMyCharacter(){return state.characters.find(c=>c.claimedBy===MY_PRESENCE_ID)||null;}

function claimCharacter(realIdx){
  const c=state.characters[realIdx];if(!c)return;
  state.characters.forEach(ch=>{if(ch.claimedBy===MY_PRESENCE_ID)ch.claimedBy='';});
  c.claimedBy=MY_PRESENCE_ID;
  state.selectedCharacter=realIdx;
  pushState(true);pushPresence();render();
}

function checkWelcome(){
  document.getElementById('welcomeOverlay')?.remove();
  const active=state.characters.filter(c=>c.state==='active'&&c.name);
  if(!active.length)return;
  const overlay=document.createElement('div');overlay.id='welcomeOverlay';overlay.className='welcome-overlay';
  overlay.innerHTML=`
    <div class="welcome-inner">
      <div class="welcome-logo">Fairy Tail DnD</div>
      <div class="welcome-sub">Guild · Magic · Adventure</div>
      <h2 class="welcome-title">Who are you?</h2>
      <p class="welcome-text">Choose your guild member each time you join. Taken members are greyed out.</p>
      <div class="welcome-chars" id="welcomeCharList"></div>
      <div class="welcome-actions"><button class="neo-btn ghost" id="welcomeSkipBtn">I'm just watching</button><button class="neo-btn welcome-dm-btn" id="welcomeDmBtn">⚔ Join as DM</button></div>
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(()=>overlay.classList.add('open'));
  function closeWelcome(){overlay.classList.remove('open');setTimeout(()=>overlay.remove(),400);}
  const list=document.getElementById('welcomeCharList');
  state.characters.forEach((c,realIdx)=>{
    if(c.state!=='active')return;
    const taken=c.claimedBy&&c.claimedBy!==MY_PRESENCE_ID;
    const btn=document.createElement('button');
    btn.className=`welcome-char-btn ${taken?'taken':''}`;
    btn.disabled=taken;
    btn.innerHTML=`${c.portrait?`<img src="${c.portrait}" class="welcome-portrait">`:`<div class="welcome-portrait-empty">${c.name?c.name[0].toUpperCase():'✦'}</div>`}<span>${esc(c.name||`Player ${realIdx+1}`)}</span>${taken?'<span class="taken-label">Taken</span>':''}`;
    btn.addEventListener('click',()=>{claimCharacter(realIdx);closeWelcome();showToast(`You are ${c.name} ✓`,'success',4000);});
    list.appendChild(btn);
  });
  document.getElementById('welcomeSkipBtn')?.addEventListener('click',()=>{closeWelcome();});
  document.getElementById('welcomeDmBtn')?.addEventListener('click',()=>{closeWelcome();openDmOverlay();});
}

function recheckWelcomeIfNeeded(){
  const mine=getMyCharacter();
  if(mine){const idx=state.characters.indexOf(mine);if(idx>=0&&state.selectedCharacter!==idx)state.selectedCharacter=idx;}
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

// ── MIGRATION: ft-chars → campaigns/ft-campaign ──
async function migrateIfNeeded(){
  try{
    const mainSnap=await getDoc(doc(db,'campaigns','ft-campaign'));
    if(mainSnap.exists()){startListener();return;}
    const oldSnap = await getDocs(collection(db,'ft-chars'));
    if(oldSnap&&!oldSnap.empty){
      const chars=[];
      oldSnap.forEach(d=>{try{chars.push(JSON.parse(d.data().data));}catch(e){}});
      if(chars.length){
        chars.sort((a,b)=>(a.id||'').localeCompare(b.id||''));
        state.characters=chars.map((c,i)=>{
          const b=blankChar(i);
          return {...b,...c,
            stats:{...b.stats,...(c.stats||{})},
            hp:{...b.hp,...(c.hp||{})},
            mana:{...b.mana,...(c.mana||{})},
            skills:(()=>{const bsk=makeBlankSkills();Object.keys(bsk).forEach(n=>{bsk[n]={...bsk[n],...(c.skills?.[n]||{})};});return bsk;})()
          };
        });
        await setDoc(doc(db,'campaigns','ft-campaign'),{data:JSON.stringify(state)});
        console.log(`Migrated ${chars.length} characters from ft-chars`);
        render();
      }
    }
  }catch(e){console.warn('Migration failed:',e);}
  startListener();
}
migrateIfNeeded();

startPresenceListener();
startBroadcastListener();
pushPresence();

// ── CLEANUP ON TAB CLOSE ──
window.addEventListener('beforeunload', () => {
  if(_pushDebounce){
    clearTimeout(_pushDebounce);
    const hasData=state.characters.some(c=>c.name&&c.name.trim());
    if(hasData)setDoc(doc(db,'campaigns','ft-campaign'),{data:JSON.stringify(state)}).catch(()=>{});
  }
  deleteDoc(doc(db,'ft-presence',MY_PRESENCE_ID)).catch(()=>{});
});
// Welcome triggered by snapshot handler once data loads

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

// ── MAGIC PARTICLES ──
(function() {
  const container = document.getElementById('bgMagic'); if (!container) return;
  const colors = ['rgba(232,160,48,.7)','rgba(176,96,255,.6)','rgba(255,120,60,.65)','rgba(255,220,120,.5)','rgba(200,120,255,.55)'];
  for (let i = 0; i < 25; i++) {
    const el = document.createElement('div');
    el.className = 'magic-particle';
    const size = 2 + Math.random() * 5;
    el.style.cssText = `
      left:${Math.random()*100}%;
      bottom:-10px;
      width:${size}px; height:${size}px;
      background:${colors[Math.floor(Math.random()*colors.length)]};
      box-shadow:0 0 ${size*2}px ${colors[Math.floor(Math.random()*colors.length)]};
      animation-duration:${4+Math.random()*8}s;
      animation-delay:${Math.random()*8}s;
    `;
    container.appendChild(el);
  }
})();
