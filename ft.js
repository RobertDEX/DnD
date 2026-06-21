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
    magicType:'',magicCategory:'',guild:'',guildMark:'',religion:'',magicRank:'',
    profBonusOverride:null, initiativeBonus:0, attackStat:'STR',
    state: i<4?'active':'reserve',
    money: 0,            // Jewels — DM-controlled currency
    portrait: '', accentColor: '', claimedBy: '',
    stats:{STR:10,DEX:10,CON:10,INT:10,WIS:10,CHA:10},
    skills:makeBlankSkills(),
    hp:{current:0,max:0}, mana:{current:0,max:0},
    armor:0, speed:'30 ft', tempHp:0,
    deathSaves:{successes:0,failures:0,stable:false},
    weaponsText:'',abilitiesText:'',inventoryText:'',notesText:'',
    relationships:[],
    spells:[],lostMagic:[],magics:[],weapons:[],inventory:[],archive:[],bestiary:[]
  };
}
const DEF_STATE = {selectedCharacter:0,activeTab:'skills',showReserve:false,showDead:false,theme:{...DEF_THEME},shop:[],characters:[blankChar(0),blankChar(1),blankChar(2),blankChar(3)]};

let state  = structuredClone(DEF_STATE);
let _unsub = null;
let _welcomeShown = false;
let dmUnlocked = sessionStorage.getItem('ft-dm') === '1';
let spectator = sessionStorage.getItem('ft-spectator') === '1';
let _lastAppliedRaw = null;

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
let _livePresenceIds = new Set([MY_PRESENCE_ID]); // who is actually here right now
function startPresenceListener(){
  if(_presenceUnsub)_presenceUnsub();
  _presenceUnsub=onSnapshot(collection(db,'ft-presence'),snap=>{
    const now=Date.now();const active=[];const liveIds=new Set();
    snap.forEach(d=>{
      const p=d.data();
      if(now-p.ts<35000){active.push(p);liveIds.add(p.id);}
      else{deleteDoc(doc(db,'ft-presence',d.id)).catch(()=>{});}
    });
    liveIds.add(MY_PRESENCE_ID); // always count myself
    _livePresenceIds=liveIds;
    renderPresence(active);
    // A claim only counts as "taken" if the claimer is still present — refresh
    // the welcome list and character tabs so stale claims free up.
    try{ refreshWelcomeTaken(); }catch(e){}
    try{ renderCharacterTabs(); }catch(e){}
  },()=>{});
}
// True only if someone OTHER than me currently holds this character AND is live
function isTakenByLiveOther(c){
  return !!c.claimedBy && c.claimedBy!==MY_PRESENCE_ID && _livePresenceIds.has(c.claimedBy);
}
// Re-evaluate the welcome screen's taken states without rebuilding it
function refreshWelcomeTaken(){
  const list=document.getElementById('welcomeCharList'); if(!list) return;
  state.characters.forEach((c,realIdx)=>{
    if(c.state!=='active')return;
    const btn=list.querySelector(`[data-welcome-idx="${realIdx}"]`); if(!btn)return;
    const taken=isTakenByLiveOther(c);
    btn.disabled=taken;
    btn.classList.toggle('taken',taken);
    const lbl=btn.querySelector('.taken-label');
    if(taken && !lbl){ const s=document.createElement('span'); s.className='taken-label'; s.textContent='Taken'; btn.appendChild(s); }
    else if(!taken && lbl){ lbl.remove(); }
  });
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
function bindGrant(){document.getElementById('grantBtn')?.addEventListener('click',()=>{const targetIdx=parseInt(document.getElementById('grantTarget')?.value??'0');const xp=parseInt(document.getElementById('grantXp')?.value)||0;const item=document.getElementById('grantItem')?.value.trim()||'';if(!xp&&!item)return;const c=state.characters[targetIdx];if(!c)return;const grant=[];if(xp)grant.push(`+${xp} XP`);if(item)grant.push(item);c.notesText=(c.notesText||'')+`\n[DM Grant] ${grant.join(' · ')}`;if(item){if(!Array.isArray(c.inventory))c.inventory=[];c.inventory.push({name:item,qty:1,notes:'Granted by DM'});}pushState();document.getElementById('grantXp').value='';document.getElementById('grantItem').value='';alert(`Granted to ${c.name||`Player ${targetIdx+1}`}: ${grant.join(', ')}`);render();});}
function bindBroadcast(){document.getElementById('broadcastBtn')?.addEventListener('click',()=>{const msg=document.getElementById('broadcastInput')?.value.trim();if(!msg)return;sendBroadcast(msg);document.getElementById('broadcastInput').value='';});}

let _pushDebounce=null;
async function pushState(immediate=false){
  if(spectator)return;
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
      const raw=snap.data().data;
      if(raw===_lastAppliedRaw){setSyncDot('synced');return;}
      _lastAppliedRaw=raw;
      const remote=normalize(JSON.parse(raw));
      checkStateChanges(remote);

      // TYPING GUARD: don't overwrite / re-render the field the user is editing
      const ae=document.activeElement;
      const isTyping=ae&&(ae.tagName==='INPUT'||ae.tagName==='TEXTAREA'||ae.tagName==='SELECT');
      const myIdx=state.characters.findIndex(c=>c.claimedBy===MY_PRESENCE_ID);

      remote.characters.forEach((rc,i)=>{
        if(isTyping && i===(myIdx>=0?myIdx:state.selectedCharacter)) return;
        state.characters[i]=rc;
      });
      while(state.characters.length<remote.characters.length)
        state.characters.push(remote.characters[state.characters.length]);
      state.theme=remote.theme;
      state.shop=remote.shop;
      setSyncDot('synced');

      if(isTyping){
        try{renderCharacterTabs();}catch(e){}
        try{applyTheme();}catch(e){}
        try{applyCharacterAccents();}catch(e){}
        recheckWelcomeIfNeeded();
        if(!document.getElementById('welcomeOverlay')&&!_welcomeShown){_welcomeShown=true;checkWelcome();}
        return;
      }

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
      try{renderMagicsKnown();}catch(e){}
      try{renderArchive();}catch(e){}
      try{renderRelationships();}catch(e){}
      try{renderWeapons();}catch(e){}
      try{renderInventory();}catch(e){}
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
    mc.magics=Array.isArray(c.magics)?c.magics:[];mc.relationships=Array.isArray(c.relationships)?c.relationships:[];mc.weapons=Array.isArray(c.weapons)?c.weapons:[];mc.inventory=Array.isArray(c.inventory)?c.inventory:[];mc.archive=Array.isArray(c.archive)?c.archive:[];mc.bestiary=Array.isArray(c.bestiary)?c.bestiary:[];
    mc.money=Number(c.money)||0;
    const blankSk=makeBlankSkills();mc.skills={};
    Object.keys(blankSk).forEach(n=>{mc.skills[n]={...blankSk[n],...(c.skills?.[n]||{})};});
    return mc;
  });
  if(m.selectedCharacter>=m.characters.length)m.selectedCharacter=Math.max(0,m.characters.length-1);
  if(!Array.isArray(m.shop))m.shop=[];
  m.shop=m.shop.map(it=>({name:it.name||'',category:it.category||'General',price:Number(it.price)||0,stock:(it.stock===undefined?null:it.stock),desc:it.desc||''}));
  return m;
}

// ================================================================
// HELPERS
// ================================================================
function getChar(){
  if(dmUnlocked||spectator)return state.characters[state.selectedCharacter]||state.characters[0];
  const mine=state.characters.find(c=>c.claimedBy===MY_PRESENCE_ID);
  if(mine)return mine;
  return state.characters[state.selectedCharacter]||state.characters[0];
}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function applySpectatorMode(){
  if(!spectator)return;
  document.body.classList.add('spectator-mode');
  if(!document.getElementById('spectatorBanner')){
    const b=document.createElement('div');b.id='spectatorBanner';b.className='spectator-banner';
    b.innerHTML=`<span>👁 Spectating — read only</span><button id="spectatorExit">Join instead</button>`;
    document.body.appendChild(b);
    document.getElementById('spectatorExit')?.addEventListener('click',()=>{
      spectator=false;sessionStorage.removeItem('ft-spectator');
      document.body.classList.remove('spectator-mode');b.remove();checkWelcome();
    });
  }
  disableAllInputs();
}
function disableAllInputs(){
  if(!spectator)return;
  document.querySelectorAll('input, textarea, select, button, [contenteditable]').forEach(elx=>{
    if(elx.closest('#characterTabs')||
       elx.closest('.character-tabs')||
       elx.classList.contains('sidebar-toggle')||
       elx.id==='sidebarToggle'||
       elx.closest('.spectator-banner')||
       elx.closest('.tab-bar')){
      return;
    }
    if(elx.tagName==='INPUT'||elx.tagName==='TEXTAREA'||elx.tagName==='SELECT'){
      elx.setAttribute('readonly','readonly');elx.setAttribute('disabled','disabled');
    }else{
      elx.setAttribute('disabled','disabled');
    }
    if(elx.hasAttribute('contenteditable'))elx.setAttribute('contenteditable','false');
    elx.classList.add('spectator-disabled');
  });
  document.querySelectorAll('.portrait-slot, .portrait-upload-label, label[for]').forEach(l=>{
    if(l.closest('#characterTabs'))return;
    l.classList.add('spectator-disabled');l.style.pointerEvents='none';
  });
}
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
    const takenByOther=isTakenByLiveOther(c);
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
    if(dmUnlocked||spectator){
      btn.addEventListener('click',()=>{state.selectedCharacter=i;_archiveSearch='';_archiveFilter='all';const as=el('archiveSearch');if(as)as.value='';const af=el('archiveFilter');if(af)af.value='all';render();});
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
  s('moneyDisplay',`${(Number(c.money)||0).toLocaleString('en-US')} Jewels`);
  // Topbar bars always show YOUR OWN character
  s('topHpMini',`${c.hp.current} / ${c.hp.max}`);
  s('topManaMini',`${c.mana.current} / ${c.mana.max}`);
  s('topArmorMini',c.armor);
  s('dmSelectedCharacterName',name);
  const hpPct=c.hp.max>0?(c.hp.current/c.hp.max)*100:0;
  const mPct=c.mana.max>0?(c.mana.current/c.mana.max)*100:0;
  const hb=el('topHpBar');if(hb)hb.style.width=hpPct+'%';
  const mb=el('topManaBar');if(mb)mb.style.width=mPct+'%';
  try{ updateArchiveTabVisibility(); }catch(e){}
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
  sv('charGuild',c.guild);sv('charGuildMark',c.guildMark);sv('charReligion',c.religion);
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
// ================================================================
// WEAPONS & INVENTORY (structured)
// ================================================================
const DMG_TYPES = ['Slashing','Piercing','Bludgeoning','Fire','Ice','Lightning','Energy','Magic','Other'];
const WEAPON_PROF = ['Untrained','Proficient','Expert'];

function renderWeapons() {
  const c = getChar();
  const cont = el('weaponsList'); if (!cont) return;
  const weapons = c.weapons || [];

  if (!weapons.length) {
    cont.innerHTML = `<div class="wpn-empty"><div class="wpn-empty-icon">⚔️</div><div>No weapons yet.</div><span>Add your armaments, their damage, and your training.</span></div>`;
    return;
  }

  cont.innerHTML = weapons.map((w, i) => {
    const profClass = (w.prof||'Untrained').toLowerCase();
    return `
    <div class="wpn-card prof-${profClass}" data-i="${i}">
      <div class="wpn-head">
        <input class="wpn-name" data-i="${i}" value="${esc(w.name||'')}" placeholder="Weapon name…">
        <span class="wpn-prof-badge prof-${profClass}">${esc(w.prof||'Untrained')}</span>
        <button class="wpn-del" data-i="${i}" title="Remove">✕</button>
      </div>
      <div class="wpn-stats">
        <div class="wpn-stat">
          <label>Damage</label>
          <input class="wpn-dmg" data-i="${i}" value="${esc(w.damage||'')}" placeholder="1d8+3">
        </div>
        <div class="wpn-stat">
          <label>Type</label>
          <select class="wpn-dmgtype" data-i="${i}">
            ${DMG_TYPES.map(t=>`<option ${w.dmgType===t?'selected':''}>${t}</option>`).join('')}
          </select>
        </div>
        <div class="wpn-stat">
          <label>Range</label>
          <input class="wpn-range" data-i="${i}" value="${esc(w.range||'')}" placeholder="Melee / 60ft">
        </div>
        <div class="wpn-stat">
          <label>Training</label>
          <select class="wpn-profsel" data-i="${i}">
            ${WEAPON_PROF.map(p=>`<option ${w.prof===p?'selected':''}>${p}</option>`).join('')}
          </select>
        </div>
      </div>
      <input class="wpn-notes" data-i="${i}" value="${esc(w.notes||'')}" placeholder="When to use it, special properties, magic effects…">
    </div>`;
  }).join('');

  const upd = (sel, field, rerender=false) => {
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
  upd('.wpn-name','name'); upd('.wpn-dmg','damage'); upd('.wpn-range','range'); upd('.wpn-notes','notes');
  upd('.wpn-dmgtype','dmgType');
  upd('.wpn-profsel','prof', true); // re-render to recolor badge

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
    c.weapons.push({ name:'', damage:'', dmgType:'Slashing', range:'Melee', prof:'Proficient', notes:'' });
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
function renderInventory() {
  const c = getChar();
  const cont = el('inventoryList'); if (!cont) return;
  const inv = c.inventory || [];

  if (!inv.length) {
    cont.innerHTML = `<div class="inv-empty">Your pack is empty.</div>`;
    return;
  }

  cont.innerHTML = inv.map((it, i) => `
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
// SHOP / CURRENCY  (Fairy Tail uses Jewels — DM-controlled)
// ================================================================
const CURRENCY = { name:'Jewels', symbol:'J', short:'Jewels' };
const SHOP_CATEGORIES_FT = ['Weapons','Magic Items','Gear','Consumables','Lacrima','Keys','Rare','General'];
function fmtMoney(n){ return (Number(n)||0).toLocaleString('en-US'); }

function renderShop() {
  const c = getChar();
  const host = el('shopList'); if (!host) return;
  const bal = el('shopBalance'); if (bal) bal.textContent = `${fmtMoney(c.money)} ${CURRENCY.short}`;

  if (!Array.isArray(state.shop) || !state.shop.length) {
    host.innerHTML = `<div class="inv-empty">The shop is empty. The DM stocks it from the DM Panel.</div>`;
    return;
  }
  const cats = [];
  state.shop.forEach(it => { const cc = it.category||'General'; if (!cats.includes(cc)) cats.push(cc); });

  host.innerHTML = cats.map(cat => {
    const rows = state.shop.map((it,i)=>({it,i})).filter(({it})=>(it.category||'General')===cat);
    return `
    <div class="shop-cat-group">
      <div class="shop-cat-header">${esc(cat)}<span class="shop-cat-count">${rows.length}</span></div>
      ${rows.map(({it,i})=>{
        const price = Number(it.price)||0;
        const afford = (Number(c.money)||0) >= price;
        const out = it.stock!=null && it.stock<=0;
        const stock = it.stock==null?'∞':it.stock;
        return `
        <div class="shop-item ${out?'out':''}">
          <div class="shop-item-main">
            <div class="shop-item-name">${esc(it.name||'Item')}</div>
            <div class="shop-item-meta"><span class="shop-stock">Stock: ${out?'SOLD OUT':stock}</span></div>
            ${it.desc?`<div class="shop-item-desc">${esc(it.desc)}</div>`:''}
          </div>
          <div class="shop-item-buy">
            <div class="shop-price">${fmtMoney(price)}<span>${CURRENCY.symbol}</span></div>
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
  if (!dmUnlocked && !spectator) {
    const mine = state.characters.find(x => x.claimedBy === MY_PRESENCE_ID);
    if (!mine || mine !== c) { showToast('You can only buy for your own character', 'warn'); return; }
  }
  if (spectator) return;
  const price = Number(item.price)||0;
  if ((Number(c.money)||0) < price) { showToast('Not enough Jewels', 'warn'); return; }
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
      <select class="ds-cat" data-i="${i}">${SHOP_CATEGORIES_FT.map(t=>`<option ${it.category===t?'selected':''}>${t}</option>`).join('')}</select>
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
}


// ================================================================
// ARCHIVE MAGIC (eidetic memory bank)
// ================================================================
const ARCHIVE_ICONS = { Person:'◉', Place:'⬡', Event:'◈', Item:'◇', Knowledge:'❖', Spell:'✦', Other:'▪' };
let _archiveSearch = '';
let _archiveFilter = 'all';
let _archiveEditScroll = 0;

function renderArchive(){
  const c = getChar();
  const cont = el('archiveList'); if(!cont) return;
  if(!Array.isArray(c.archive)) c.archive = [];
  const records = c.archive;

  const countEl = el('archiveCount');
  if(countEl) countEl.textContent = `${records.length} RECORD${records.length===1?'':'S'}`;

  // Perf: only rebuild the (potentially large) record list when the Archive
  // tab is actually showing. The count above still updates cheaply.
  if(state.activeTab !== 'archive') return;

  let display = records.map((r,i)=>({r,i}));
  if(_archiveFilter!=='all') display = display.filter(({r})=>r.type===_archiveFilter);
  if(_archiveSearch.trim()){
    const q=_archiveSearch.toLowerCase();
    display = display.filter(({r})=>(r.title||'').toLowerCase().includes(q)||(r.body||'').toLowerCase().includes(q)||(r.type||'').toLowerCase().includes(q));
  }
  // newest first
  display.sort((a,b)=>(b.r.ts||0)-(a.r.ts||0));

  if(!records.length){
    cont.innerHTML = `<div class="archive-empty"><div class="archive-empty-glyph">◈</div><div>THE ARCHIVE IS EMPTY</div><span>Commit your first memory above. Nothing seen will be forgotten.</span></div>`;
    return;
  }
  if(!display.length){
    cont.innerHTML = `<div class="archive-empty"><div class="archive-empty-glyph">⌕</div><div>NO MATCHING RECORDS</div><span>Adjust your search or filter.</span></div>`;
    return;
  }

  cont.innerHTML = display.map(({r,i})=>{
    const icon = ARCHIVE_ICONS[r.type]||'▪';
    const date = r.ts ? new Date(r.ts).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}) : '';
    return `
    <div class="archive-record" data-i="${i}">
      <div class="archive-record-rail"></div>
      <div class="archive-record-main">
        <div class="archive-record-head">
          <span class="archive-record-icon">${icon}</span>
          <span class="archive-record-title">${esc(r.title||'Untitled Record')}</span>
          <span class="archive-record-type">${esc(r.type||'Other')}</span>
        </div>
        <div class="archive-record-body">${esc(r.body||'')}</div>
        <div class="archive-record-foot">
          <span class="archive-record-date">⌖ ${date}</span>
          <div class="archive-record-actions">
            <button class="archive-edit" data-i="${i}" title="Amend record">✎ Amend</button>
            <button class="archive-del" data-i="${i}" title="Purge record">✕ Purge</button>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');

  cont.querySelectorAll('.archive-del').forEach(btn=>btn.addEventListener('click',()=>{
    const i=parseInt(btn.dataset.i);
    if(!confirm('Purge this record from the Archive?'))return;
    c.archive.splice(i,1); pushState(true); renderArchive();
  }));
  cont.querySelectorAll('.archive-edit').forEach(btn=>btn.addEventListener('click',()=>{
    const i=parseInt(btn.dataset.i);
    openArchiveEditor(c.archive[i], i);
  }));
}

function openArchiveEditor(record, idx){
  const c=getChar();
  const cont=el('archiveList');
  const rec=cont.querySelector(`.archive-record[data-i="${idx}"]`);
  if(!rec)return;
  rec.classList.add('editing');
  rec.querySelector('.archive-record-main').innerHTML = `
    <div class="archive-edit-form">
      <div class="archive-add-row">
        <input class="archive-input" id="archiveEditTitle" value="${esc(record.title||'')}" placeholder="Title…">
        <select class="archive-type-select" id="archiveEditType">
          ${['Person','Place','Event','Item','Knowledge','Spell','Other'].map(t=>`<option value="${t}" ${record.type===t?'selected':''}>${t}</option>`).join('')}
        </select>
      </div>
      <textarea class="archive-textarea" id="archiveEditBody">${esc(record.body||'')}</textarea>
      <div class="archive-edit-actions">
        <button class="archive-add-btn small" id="archiveSaveEdit">⟢ SAVE</button>
        <button class="archive-cancel-btn" id="archiveCancelEdit">CANCEL</button>
      </div>
    </div>`;
  el('archiveEditBody')?.focus();
  el('archiveSaveEdit')?.addEventListener('click',()=>{
    record.title = el('archiveEditTitle').value.trim();
    record.type  = el('archiveEditType').value;
    record.body  = el('archiveEditBody').value.trim();
    record.edited = Date.now();
    pushState(true); renderArchive();
  });
  el('archiveCancelEdit')?.addEventListener('click',()=>renderArchive());
}

function addArchiveRecord(){
  const c=getChar();
  const title=el('archiveNewTitle')?.value.trim();
  const type=el('archiveNewType')?.value||'Other';
  const body=el('archiveNewBody')?.value.trim();
  if(!title&&!body){ return; }
  if(!Array.isArray(c.archive)) c.archive=[];
  c.archive.unshift({ id:'arc-'+Date.now(), title:title||'Untitled Record', type, body, ts:Date.now() });
  el('archiveNewTitle').value=''; el('archiveNewBody').value=''; el('archiveNewType').value='Person';
  pushState(true); renderArchive();
  el('archiveNewTitle')?.focus();
}

function bindArchive(){
  el('archiveAddBtn')?.addEventListener('click', addArchiveRecord);
  el('archiveNewTitle')?.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); el('archiveNewBody')?.focus(); } });
  el('archiveSearch')?.addEventListener('input', e=>{ _archiveSearch=e.target.value; renderArchive(); });
  el('archiveFilter')?.addEventListener('change', e=>{ _archiveFilter=e.target.value; renderArchive(); });
}

// ================================================================
// MAGICS KNOWN (multiple magics)
// ================================================================
function renderMagicsKnown(){
  const c=getChar();const cont=el('magicsKnownList');if(!cont)return;
  if(!Array.isArray(c.magics))c.magics=[];
  const primary=(c.magicType||'').trim().toLowerCase();
  if(!c.magics.length){
    cont.innerHTML=`<div class="magics-empty">No magics learned yet. Add the magics your mage has mastered below.</div>`;
    return;
  }
  cont.innerHTML=c.magics.map((m,i)=>{
    const isPrimary=m.trim().toLowerCase()===primary && primary;
    return `<div class="magic-chip ${isPrimary?'primary':''}">
      <span class="magic-chip-icon">✦</span>
      <span class="magic-chip-name">${esc(m)}</span>
      ${isPrimary?'<span class="magic-chip-tag">Primary</span>':`<button class="magic-chip-makeprimary" data-i="${i}" title="Set as primary magic">★</button>`}
      <button class="magic-chip-del" data-i="${i}" title="Remove">✕</button>
    </div>`;
  }).join('');
  cont.querySelectorAll('.magic-chip-del').forEach(btn=>btn.addEventListener('click',()=>{
    c.magics.splice(parseInt(btn.dataset.i),1);pushState(true);renderMagicsKnown();
  }));
  cont.querySelectorAll('.magic-chip-makeprimary').forEach(btn=>btn.addEventListener('click',()=>{
    c.magicType=c.magics[parseInt(btn.dataset.i)];
    const mt=el('charMagicType');if(mt)mt.value=c.magicType;
    pushState(true);renderMagicsKnown();renderMagicBanner();renderCalcPanel();renderHeader();
  }));
}
function addMagic(){
  const c=getChar();const inp=el('newMagicName');if(!inp)return;
  const name=inp.value.trim();if(!name)return;
  if(!Array.isArray(c.magics))c.magics=[];
  if(c.magics.some(m=>m.trim().toLowerCase()===name.toLowerCase())){inp.value='';return;}
  c.magics.push(name);
  // If no primary magic set yet, make this the primary automatically
  if(!(c.magicType||'').trim()){c.magicType=name;const mt=el('charMagicType');if(mt)mt.value=name;}
  inp.value='';pushState(true);renderMagicsKnown();renderMagicBanner();renderCalcPanel();renderHeader();
}
function bindMagicsKnown(){
  el('addMagicBtn')?.addEventListener('click',addMagic);
  el('newMagicName')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();addMagic();}});
}

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
function hasArchiveMagic(){
  const c = getChar();
  return /archive/i.test(c?.magicType || '');
}
function updateArchiveTabVisibility(){
  const btn = document.querySelector('.archive-tab-btn');
  const show = hasArchiveMagic();
  if (btn) btn.style.display = show ? '' : 'none';
  // If the archive tab is active but no longer available, fall back to Skills
  if (!show && state.activeTab === 'archive') {
    state.activeTab = 'skills';
    document.querySelectorAll('.tab-btn[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab==='skills'));
    document.querySelectorAll('.tab-content[data-tab]').forEach(t=>t.classList.toggle('active',t.dataset.tab==='skills'));
  }
}
function renderTabs(){
  updateArchiveTabVisibility();
  document.querySelectorAll('.tab-btn[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===state.activeTab));
  document.querySelectorAll('.tab-content[data-tab]').forEach(t=>t.classList.toggle('active',t.dataset.tab===state.activeTab));
  try {
    switch (state.activeTab) {
      case 'relations': renderRelationships(); break;
      case 'archive':   renderArchive(); break;
      case 'skills':    renderSkillsMatrix(); break;
      case 'magic':     renderSpells?.(); renderMagicsKnown?.(); break;
      case 'loadout':   renderWeapons?.(); renderInventory?.(); break;
      case 'shop':      renderShop?.(); break;
      case 'lostmagic': renderLostMagic?.(); break;
    }
  } catch(e) {}
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
  try{renderMagicsKnown();}catch(e){}
  try{renderArchive();}catch(e){}
  try{renderWeapons();}catch(e){}
  try{renderInventory();}catch(e){}
  try{renderShop();}catch(e){}
  try{renderDmShop();}catch(e){}
  try{renderDmMoney();}catch(e){}
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
  try{if(spectator)disableAllInputs();}catch(e){}
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
  // Update displays that DON'T contain the focused input.
  renderHeader();renderMagicBanner();renderCharacterTabs();
  // Numeric/derived fields aren't the text field, safe to refresh.
  if(mf[field]||['level','armor'].includes(field)){renderMainFields();renderCalcPanel();}
  if(field==='level'||field==='magicCategory'){renderCalcPanel();renderSkillsMatrix();renderStats();}
}
function bindAll(){
  const ii=(id,field)=>{const e=el(id);if(e)e.addEventListener('input',ev=>updateField(field,ev.target.value));};
  const ic=(id,field)=>{const e=el(id);if(e)e.addEventListener('change',ev=>updateField(field,ev.target.value));};
  ii('charName','name');ii('charLevel','level');ii('charRace','race');ii('charClass','className');
  ii('charAge','age');ii('charBackground','background');ii('charMagicType','magicType');
  ic('charMagicCategory','magicCategory');ic('magicRank','magicRank');
  ii('charGuild','guild');ii('charGuildMark','guildMark');ii('charReligion','religion');
  ii('currentHp','currentHp');ii('maxHp','maxHp');ii('currentMana','currentMana');ii('maxMana','maxMana');
  ii('armor','armor');ii('speed','speed');
  ii('weaponsText','weaponsText');ii('abilitiesText','abilitiesText');ii('inventoryText','inventoryText');ii('notesText','notesText');

  document.querySelectorAll('.tab-btn[data-tab]').forEach(b=>{
    if(b.dataset.tab==='archive-link')return; // archive link opens standalone file, not a tab
    b.addEventListener('click',()=>{state.activeTab=b.dataset.tab;pushState();renderTabs();});
  });
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
  el('saveThemeBtn')?.addEventListener('click',()=>{state.theme=readTheme();pushState(true);render();});
  el('resetThemeBtn')?.addEventListener('click',()=>{state.theme={...DEF_THEME};pushState(true);render();});
}

// ── RELATIONSHIPS ──
const RELATION_TYPES = ['Ally','Friend','Guild Member','Rival','Enemy','Mentor','Student','Family','Lover','Client','Acquaintance','Neutral','Unknown'];
const RELATION_COLORS = {
  Ally:'#00e890', Friend:'#ffcf40', 'Guild Member':'#ff8a3c', Rival:'#ff9900', Enemy:'#ff1a2e',
  Mentor:'#b06eff', Student:'#6effc7', Family:'#ffd060', Lover:'#ff6ec7',
  Client:'#40c4ff', Acquaintance:'#90a0b0', Neutral:'#8090a0', Unknown:'#556070'
};
const RELATION_ICONS = {
  Ally:'🤝', Friend:'😊', 'Guild Member':'⚜️', Rival:'⚔️', Enemy:'💢', Mentor:'🎓', Student:'📚',
  Family:'🏠', Lover:'💗', Client:'💼', Acquaintance:'👋', Neutral:'😐', Unknown:'❓'
};
const STANDING_LABELS = ['Hostile','Wary','Neutral','Warm','Devoted'];

let _relSearch = '';
let _relSort = 'manual';

function renderRelationships() {
  const c = getChar();
  const cont = el('relationshipsContainer'); if (!cont) return;
  if (!Array.isArray(c.relationships)) c.relationships = [];
  const rels = c.relationships;

  const summary = el('relSummary');
  if (summary) {
    if (!rels.length) { summary.innerHTML = ''; }
    else {
      const counts = {};
      rels.forEach(r => { counts[r.type] = (counts[r.type]||0)+1; });
      const allies = rels.filter(r => ['Ally','Friend','Guild Member','Family','Lover','Mentor','Student'].includes(r.type)).length;
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
      <span>Track guildmates, rivals, mentors, and everyone who matters.</span>
    </div>`;
    return;
  }

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
  if (_relSort === 'name')               display.sort((a,b)=>(a.r.name||'').localeCompare(b.r.name||''));
  else if (_relSort === 'type')          display.sort((a,b)=>(a.r.type||'').localeCompare(b.r.type||''));
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
    return `
    <div class="rel-card" data-i="${i}" style="--rel-color:${color}">
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
          <button class="rel-del" data-i="${i}" title="Remove">✕</button>
        </div>
        <input class="rel-role" data-i="${i}" value="${esc(r.role||'')}" placeholder="Role / title — e.g. Guild Master, Childhood friend, Dark mage…">
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
        </div>
      </div>
    </div>`;
  }).join('');

  cont.querySelectorAll('.rel-name').forEach(inp => {
    inp.addEventListener('input', () => {
      const i = parseInt(inp.dataset.i);
      c.relationships[i].name = inp.value;
      const av = inp.closest('.rel-card')?.querySelector('.rel-avatar-initial');
      if (av) av.textContent = (inp.value.trim()[0]||'?').toUpperCase();
      scheduleRelPush();
    });
  });
  cont.querySelectorAll('.rel-role').forEach(inp => {
    inp.addEventListener('input', () => { c.relationships[parseInt(inp.dataset.i)].role = inp.value; scheduleRelPush(); });
  });
  cont.querySelectorAll('.rel-notes').forEach(inp => {
    inp.addEventListener('input', () => { c.relationships[parseInt(inp.dataset.i)].notes = inp.value; scheduleRelPush(); });
  });
  cont.querySelectorAll('.rel-type').forEach(sel => {
    sel.addEventListener('change', () => { c.relationships[parseInt(sel.dataset.i)].type = sel.value; pushState(true); renderRelationships(); });
  });
  cont.querySelectorAll('.rel-pip').forEach(pip => {
    pip.addEventListener('click', () => {
      const i = parseInt(pip.dataset.i), s = parseInt(pip.dataset.s);
      const cur = typeof c.relationships[i].standing === 'number' ? c.relationships[i].standing : 2;
      c.relationships[i].standing = (s === cur && s > 0) ? s - 1 : s;
      pushState(true); renderRelationships();
    });
  });
  cont.querySelectorAll('.rel-portrait-input').forEach(inp => {
    inp.addEventListener('change', e => {
      const i = parseInt(inp.dataset.i);
      const file = e.target.files?.[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        const img = new Image();
        img.onload = () => {
          const max = 120; const scale = Math.min(max/img.width, max/img.height, 1);
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
  cont.querySelectorAll('.rel-del').forEach(btn => {
    btn.addEventListener('click', () => { c.relationships.splice(parseInt(btn.dataset.i), 1); pushState(true); renderRelationships(); });
  });
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
function scheduleRelPush() { clearTimeout(_relPushTimer); _relPushTimer = setTimeout(() => pushState(true), 600); }

function bindRelationships() {
  el('addRelBtn')?.addEventListener('click', () => {
    const c = getChar();
    if (!c.relationships) c.relationships = [];
    c.relationships.unshift({ name:'', type:'Neutral', role:'', notes:'', standing:2, portrait:'' });
    _relSearch = ''; const sb = el('relSearch'); if (sb) sb.value = '';
    pushState(true); renderRelationships();
    setTimeout(() => { el('relationshipsContainer')?.querySelector('.rel-name')?.focus(); }, 50);
  });
  el('relSearch')?.addEventListener('input', e => { _relSearch = e.target.value; renderRelationships(); });
  el('relSort')?.addEventListener('change', e => { _relSort = e.target.value; renderRelationships(); });
}

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
  if(spectator){applySpectatorMode();return;}
  if(dmUnlocked)return;
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
    const taken=isTakenByLiveOther(c);
    const btn=document.createElement('button');
    btn.className=`welcome-char-btn ${taken?'taken':''}`;
    btn.dataset.welcomeIdx=realIdx;
    btn.disabled=taken;
    btn.innerHTML=`${c.portrait?`<img src="${c.portrait}" class="welcome-portrait">`:`<div class="welcome-portrait-empty">${c.name?c.name[0].toUpperCase():'✦'}</div>`}<span>${esc(c.name||`Player ${realIdx+1}`)}</span>${taken?'<span class="taken-label">Taken</span>':''}`;
    btn.addEventListener('click',()=>{if(btn.disabled)return;claimCharacter(realIdx);closeWelcome();showToast(`You are ${c.name} ✓`,'success',4000);});
    list.appendChild(btn);
  });
  document.getElementById('welcomeSkipBtn')?.addEventListener('click',()=>{spectator=true;sessionStorage.setItem('ft-spectator','1');closeWelcome();applySpectatorMode();render();});
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
bindMagicsKnown();
bindArchive();
bindWeapons();
bindInventory();
bindAccentColor();
bindFullscreen();
render();
if(spectator)applySpectatorMode();

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
