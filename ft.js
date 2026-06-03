// ============================================================
// Fairy Tail DnD — ft.js  |  Firebase + Magic Type system
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getFirestore, doc, onSnapshot, setDoc } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

const FB_CONFIG = {
  apiKey: "AIzaSyCfEtfiU5swXvVkqt4shp8i6h4JYI8ES7U",
  authDomain: "dand-3c76a.firebaseapp.com",
  projectId: "dand-3c76a",
  storageBucket: "dand-3c76a.firebasestorage.app",
  messagingSenderId: "27455098509",
  appId: "1:27455098509:web:432929f697da9a947d5cc4",
  measurementId: "G-D1TQM5WJT8"
};
const fbApp = initializeApp(FB_CONFIG, 'ft-app');
const db    = getFirestore(fbApp);
const DOC_ID = 'ft-campaign';

// ---- CONSTANTS ----
const DM_PASSWORD = '123456789';
const STORAGE_KEY = 'ft-dnd-v2-local';
const STAT_ORDER  = ['STR','DEX','CON','INT','WIS','CHA'];
const SKILL_MAP   = {
  STR:['STR Saving Throw','Athletics','Power Strike'],
  DEX:['DEX Saving Throw','Acrobatics','Sleight of Hand','Stealth'],
  CON:['CON Saving Throw','Endurance'],
  INT:['INT Saving Throw','Magic Control','History','Investigation','Arcana','Religion'],
  WIS:['WIS Saving Throw','Animal Handling','Insight','Medicine','Perception','Survival'],
  CHA:['CHA Saving Throw','Deception','Intimidation','Performance','Persuasion']
};
const SPELL_RANKS = ['D','C','B','A','S','SS'];
const DEF_THEME   = {bg:'#060408',panel:'#0e0a16',accent:'#e8a030',accentTwo:'#7a4000',mana:'#a855f7',text:'#f5eedd'};

// ---- MAGIC CATEGORY SYSTEM ----
// category → { statKey, rollDice, bonusDesc }
const MAGIC_CATEGORIES = {
  sense_int: { label:'Sense (INT)',  stat:'INT', rollDice:'1d10', bonus:'Roll 1d10 for your magic pool. Spell checks use INT modifier.' },
  sense_wis: { label:'Sense (WIS)',  stat:'WIS', rollDice:'1d10', bonus:'Roll 1d10 for your magic pool. Spell checks use WIS modifier.' },
  sense_cha: { label:'Sense (CHA)',  stat:'CHA', rollDice:'1d10', bonus:'Roll 1d10 for your magic pool. Spell checks use CHA modifier.' },
  power_con: { label:'Power (CON)',  stat:'CON', rollDice:'1d10', bonus:'Roll 1d10 Hit Dice. Gain Unarmed Strike. Spell checks use CON modifier.' },
  power_str: { label:'Power (STR)',  stat:'STR', rollDice:'1d10', bonus:'Roll 1d10 Hit Dice. Gain Unarmed Strike. Spell checks use STR modifier.' },
  agility:   { label:'Agility (DEX)',stat:'DEX', rollDice:'1d8',  bonus:'When you take the Attack action, Speed +10 ft and Opportunity Attacks have Disadvantage against you until end of turn. Spell checks use DEX modifier.' }
};

function getMagicCategory(c) { return MAGIC_CATEGORIES[c.magicCategory||''] || null; }
function getSpellMod(c) {
  const cat = getMagicCategory(c);
  if (!cat) return 0;
  return Math.floor((Number(c.stats[cat.stat]||10)-10)/2);
}
function getSpellAtkBonus(c) {
  const sm = getSpellMod(c);
  const pb = Number(c.proficiencyBonus)||2;
  return sm + pb;
}

// ---- BLANK HELPERS ----
function makeBlankSkills() {
  const s={};
  Object.entries(SKILL_MAP).forEach(([stat,list])=>list.forEach(sk=>{s[sk]={stat,bonus:0};}));
  return s;
}
function blankChar(i) {
  return {
    id:`char-${Date.now()}-${i}-${Math.random().toString(16).slice(2)}`,
    name:'',race:'',className:'',age:'',level:1,background:'',
    magicType:'',magicCategory:'',guild:'',guildMark:'',exceed:'',magicRank:'',
    proficiencyBonus:2, state: i<4?'active':'reserve',
    stats:{STR:10,DEX:10,CON:10,INT:10,WIS:10,CHA:10},
    skills:makeBlankSkills(),
    hp:{current:0,max:0}, mana:{current:0,max:0},
    armor:0,initiative:'',speed:'',
    weaponsText:'',abilitiesText:'',inventoryText:'',notesText:'',
    spells:[], lostMagic:[]
  };
}
const DEF_STATE = {selectedCharacter:0,activeTab:'skills',showReserve:false,showDead:false,theme:{...DEF_THEME},characters:[blankChar(0),blankChar(1),blankChar(2),blankChar(3)]};

let state = loadLocal();
let dmUnlocked = false;
let _unsubscribe = null;

// ---- PERSISTENCE ----
function loadLocal() {
  try{const r=localStorage.getItem(STORAGE_KEY);return r?normalize(JSON.parse(r)):structuredClone(DEF_STATE);}
  catch{return structuredClone(DEF_STATE);}
}
function saveLocal(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}catch{}}
async function pushState(){
  saveLocal(); setSyncDot('syncing');
  try{await setDoc(doc(db,'campaigns',DOC_ID),{data:JSON.stringify(state),updated:Date.now()});setSyncDot('synced');}
  catch(e){console.error('Firebase push failed',e);setSyncDot('error');}
}
function startFirebaseListener(){
  if(_unsubscribe)_unsubscribe();
  _unsubscribe=onSnapshot(doc(db,'campaigns',DOC_ID),snap=>{
    if(!snap.exists())return;
    try{const parsed=JSON.parse(snap.data().data);state=normalize(parsed);saveLocal();render();setSyncDot('synced');}
    catch(e){console.error('Snapshot parse error',e);}
  },err=>{console.error('Snapshot error',err);setSyncDot('error');});
}
function setSyncDot(s){
  const d=el('syncDot');if(!d)return;
  d.className='sync-dot '+s;
  d.title={synced:'Synced to Firebase',syncing:'Syncing…',error:'Sync error — using local data'}[s]||s;
}
function normalize(loaded){
  const m=structuredClone(DEF_STATE);
  Object.assign(m,loaded||{});
  m.theme={...DEF_THEME,...(loaded?.theme||{})};
  m.characters=(loaded?.characters?.length?loaded.characters:DEF_STATE.characters).map((c,i)=>{
    const b=blankChar(i);const mc={...b,...c};
    mc.stats={...b.stats,...(c.stats||{})};mc.skills={...b.skills,...(c.skills||{})};
    mc.hp={...b.hp,...(c.hp||{})};mc.mana={...b.mana,...(c.mana||{})};
    mc.spells=Array.isArray(c.spells)?c.spells:[];
    mc.lostMagic=Array.isArray(c.lostMagic)?c.lostMagic:[];
    return mc;
  });
  if(m.selectedCharacter>=m.characters.length)m.selectedCharacter=Math.max(0,m.characters.length-1);
  return m;
}

// ---- HELPERS ----
function getChar(){return state.characters[state.selectedCharacter]||state.characters[0];}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function modFrom(s){return Math.floor((Number(s)-10)/2);}
function fmtMod(m){return m>=0?`+${m}`:`${m}`;}
function rollD10(){return Math.floor(Math.random()*10)+1;}
function rollD8(){return Math.floor(Math.random()*8)+1;}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function ensureClamp(c){
  c.hp.max=Math.max(0,Number(c.hp.max)||0);c.mana.max=Math.max(0,Number(c.mana.max)||0);
  c.hp.current=clamp(Number(c.hp.current)||0,0,c.hp.max);
  c.mana.current=clamp(Number(c.mana.current)||0,0,c.mana.max);
}
function hexRgba(hex,a=1){const cl=hex.replace('#','');const r=parseInt(cl.slice(0,2),16),g=parseInt(cl.slice(2,4),16),b=parseInt(cl.slice(4,6),16);return `rgba(${r},${g},${b},${a})`;}
const el=id=>document.getElementById(id);

// ---- THEME ----
function applyTheme(){
  const t=state.theme||DEF_THEME;const root=document.documentElement;
  root.style.setProperty('--accent',t.accent);root.style.setProperty('--accent2',t.accentTwo);
  root.style.setProperty('--mana',t.mana);root.style.setProperty('--text',t.text);
  root.style.setProperty('--panel',hexRgba(t.panel,.97));root.style.setProperty('--line-hi',hexRgba(t.accent,.5));
  document.body.style.background=`radial-gradient(ellipse at 30% 10%,${hexRgba(t.accent,.18)} 0%,transparent 38%),radial-gradient(ellipse at 80% 80%,${hexRgba(t.mana,.12)} 0%,transparent 38%),linear-gradient(180deg,${t.bg} 0%,${t.bg} 50%,${t.accentTwo} 100%)`;
}
function renderThemeFields(){
  const t=state.theme||DEF_THEME;
  const f=(id,v)=>{const e=el(id);if(e)e.value=v;};
  f('themeBgColor',t.bg);f('themePanelColor',t.panel);f('themeAccentColor',t.accent);
  f('themeAccentTwoColor',t.accentTwo);f('themeManaColor',t.mana);f('themeTextColor',t.text);
}

// ---- MAGIC TYPE BANNER ----
function renderMagicBanner(){
  const c=getChar();const banner=el('magicTypeBanner');if(!banner)return;
  const cat=getMagicCategory(c);
  if(!cat||!c.magicType){banner.style.display='none';return;}
  banner.style.display='flex';
  const atkBonus=getSpellAtkBonus(c);
  const sm=getSpellMod(c);
  const isAgility=c.magicCategory==='agility';
  const isPower=c.magicCategory?.startsWith('power');
  banner.innerHTML=`
    <div class="magic-type-tag">🐉 ${esc(c.magicType)}</div>
    <span class="magic-type-modifier">${cat.label}</span>
    <span class="magic-type-modifier">Spell Mod: ${fmtMod(sm)}</span>
    <span class="magic-type-modifier">Spell Atk: ${fmtMod(atkBonus)}</span>
    <span class="magic-type-modifier">Mana Die: ${cat.rollDice}</span>
    ${isPower?'<span class="magic-type-modifier">🥊 Unarmed Strike</span>':''}
    ${isAgility?'<span class="magic-type-modifier">⚡ Speed +10 on Attack</span>':''}`;
  // Update spell atk bonus display
  const saEl=el('spellAtkBonus');if(saEl)saEl.value=fmtMod(atkBonus);
}

// ---- RENDER ----
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
function renderHeader(){
  const c=getChar();const name=c.name||'—';
  const s=(id,v)=>{const e=el(id);if(e)e.textContent=v;};
  s('topCharacterName',name);s('selectedNameSmall',name);
  s('selectedState',c.state.charAt(0).toUpperCase()+c.state.slice(1));
  s('selectedMagicType',c.magicType||'—');s('selectedSpellCount',c.spells.length);
  s('topHpMini',`${c.hp.current} / ${c.hp.max}`);s('topManaMini',`${c.mana.current} / ${c.mana.max}`);s('topArmorMini',c.armor);
  s('dmSelectedCharacterName',name);
  const hpPct=c.hp.max>0?(c.hp.current/c.hp.max)*100:0;
  const mPct=c.mana.max>0?(c.mana.current/c.mana.max)*100:0;
  const hb=el('topHpBar');if(hb)hb.style.width=hpPct+'%';
  const mb=el('topManaBar');if(mb)mb.style.width=mPct+'%';
}
function renderMainFields(){
  const c=getChar();
  const sv=(id,v)=>{const e=el(id);if(e)e.value=v??'';};
  sv('charName',c.name);sv('charLevel',c.level);sv('charRace',c.race);sv('charClass',c.className);
  sv('charAge',c.age);sv('charBackground',c.background);sv('charMagicType',c.magicType);
  sv('charMagicCategory',c.magicCategory||'');sv('charGuild',c.guild);sv('charGuildMark',c.guildMark);
  sv('charExceed',c.exceed);sv('charPB',c.proficiencyBonus);
  const mr=el('magicRank');if(mr)mr.value=c.magicRank||'';
  sv('currentHp',c.hp.current);sv('maxHp',c.hp.max);sv('currentMana',c.mana.current);sv('maxMana',c.mana.max);
  sv('armor',c.armor);sv('initiative',c.initiative);sv('speed',c.speed);
  sv('weaponsText',c.weaponsText);sv('abilitiesText',c.abilitiesText);sv('inventoryText',c.inventoryText);sv('notesText',c.notesText);
  const hd=el('hpDisplay');if(hd)hd.textContent=`${c.hp.current} / ${c.hp.max}`;
  const md=el('manaDisplay');if(md)md.textContent=`${c.mana.current} / ${c.mana.max}`;
  const hpPct=c.hp.max>0?(c.hp.current/c.hp.max)*100:0;
  const mPct=c.mana.max>0?(c.mana.current/c.mana.max)*100:0;
  const hb=el('hpBar');if(hb)hb.style.width=hpPct+'%';
  const mb=el('manaBar');if(mb)mb.style.width=mPct+'%';
  const sa=el('stateActive');if(sa){el('stateActive').checked=c.state==='active';el('stateReserve').checked=c.state==='reserve';el('stateDead').checked=c.state==='dead';}
  const title=el('magicSpellTitle');
  if(title)title.textContent=c.magicType?`${c.magicType} Spells`:'Magic Spells';
}
function renderStats(){
  const c=getChar();const g=el('statsGrid');if(!g)return;g.innerHTML='';
  const cat=getMagicCategory(c);
  STAT_ORDER.forEach(stat=>{
    const score=c.stats[stat];const mod=modFrom(score);
    const isMagicStat=cat&&cat.stat===stat;
    const card=document.createElement('div');card.className='stat-card';
    if(isMagicStat)card.style.borderColor='rgba(168,85,247,.4)';
    card.innerHTML=`<div class="stat-key" style="${isMagicStat?'color:var(--mana)':''}">${stat}${isMagicStat?' ✦':''}</div><input class="stat-score-input" data-stat="${stat}" type="number" value="${score}"><div class="stat-mod">${fmtMod(mod)}</div><div class="stat-controls"><button type="button" data-stat="${stat}" data-action="minus">−</button><button type="button" data-stat="${stat}" data-action="plus">+</button></div>`;
    g.appendChild(card);
  });
  g.querySelectorAll('.stat-score-input').forEach(inp=>{inp.addEventListener('input',e=>{c.stats[e.target.dataset.stat]=Number(e.target.value)||0;pushState();renderStats();renderSkills();renderMagicBanner();});});
}
function renderSkills(){
  const c=getChar();const m=el('skillsMatrix');if(!m)return;m.innerHTML='';
  Object.entries(SKILL_MAP).forEach(([stat,skills])=>{
    const sm=modFrom(c.stats[stat]);
    const grp=document.createElement('div');grp.className='skill-group';
    grp.innerHTML=`<div class="skill-group-header"><strong>${stat}</strong><span>Mod ${fmtMod(sm)}</span></div><div class="skill-list"></div>`;
    const list=grp.querySelector('.skill-list');
    skills.forEach(sk=>{
      const sd=c.skills[sk]||{stat,bonus:0};const total=sm+(Number(sd.bonus)||0);
      const display=sk.includes('Saving Throw')?'Saving Throw':sk;
      const row=document.createElement('div');row.className='skill-row';
      row.innerHTML=`<div class="skill-row-label"><strong>${esc(display)}</strong><span>${fmtMod(total)} total</span></div><input type="number" data-skill="${esc(sk)}" value="${sd.bonus}" placeholder="bonus">`;
      list.appendChild(row);
    });
    m.appendChild(grp);
  });
  m.querySelectorAll('input[data-skill]').forEach(inp=>inp.addEventListener('input',e=>{c.skills[e.target.dataset.skill].bonus=Number(e.target.value)||0;pushState();renderSkills();}));
}
function renderSpells(){
  const c=getChar();const cont=el('spellList');if(!cont)return;cont.innerHTML='';
  if(!c.spells.length){cont.innerHTML=`<div style="padding:.9rem;color:var(--muted)">No spells yet. Use the form above to add yours.</div>`;return;}
  const rankOrder={D:0,C:1,B:2,A:3,S:4,SS:5};
  [...c.spells].sort((a,b)=>(rankOrder[b.rank]||0)-(rankOrder[a.rank]||0)).forEach(sp=>{
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
function renderLostMagic(){
  const c=getChar();const cont=el('lostMagicList');if(!cont)return;cont.innerHTML='';
  if(!c.lostMagic.length){cont.innerHTML=`<div style="padding:.9rem;color:var(--muted)">No Lost Magic assigned yet. Your DM grants these.</div>`;return;}
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
    hdr.style.cssText='font-family:var(--font-mono);font-size:.72rem;letter-spacing:.15em;text-transform:uppercase;color:var(--accent);margin:.65rem 0 .4rem;padding:.4rem .6rem;background:rgba(232,160,48,.06);border-radius:6px;border-left:2px solid var(--accent)';
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
      const lm=ch?.lostMagic.find(l=>l.id===e.target.dataset.lm);
      if(!lm)return;const f=e.target.dataset.f;
      lm[f]=f==='manaCost'?Math.max(0,Number(e.target.value)||0):e.target.value;
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

// ---- MASTER RENDER ----
function render(){
  applyTheme();const c=getChar();ensureClamp(c);
  renderCharacterTabs();renderHeader();renderMainFields();renderMagicBanner();
  renderStats();renderSkills();renderSpells();renderLostMagic();
  renderDmLostMagic();renderDmTargetSelect();renderThemeFields();renderTabs();
}

// ---- ACTIONS ----
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
  const c=getChar();
  const name=el('spellName')?.value.trim();
  const rank=el('spellRank')?.value||'D';
  const manaCost=Math.max(0,Number(el('spellManaCost')?.value)||0);
  const type=el('spellType')?.value||'Offensive';
  const description=el('spellDescription')?.value.trim();
  if(!name||!description){alert('Spell needs a name and description.');return;}
  const btn=el('addSpellBtn');
  const editId=btn?.dataset.editId;
  if(editId){
    const sp=c.spells.find(s=>s.id===editId);
    if(sp){sp.name=name;sp.rank=rank;sp.manaCost=manaCost;sp.type=type;sp.description=description;}
    delete btn.dataset.editId;if(btn)btn.textContent='Add Spell';
  }else{
    c.spells.push({id:`spell-${Date.now()}`,name,rank,manaCost,type,description});
  }
  ['spellName','spellManaCost','spellDescription'].forEach(id=>{const e=el(id);if(e)e.value='';});
  pushState();renderSpells();renderHeader();
}
function addLostMagic(){
  const name=el('dmLMName')?.value.trim();
  const cost=Math.max(0,Number(el('dmLMCost')?.value)||0);
  const desc=el('dmLMDescription')?.value.trim();
  const targetIdx=Number(el('dmLMTarget')?.value??state.selectedCharacter);
  if(!name||!desc){alert('Fill out the Lost Magic form.');return;}
  const target=state.characters[targetIdx];if(!target){alert('No target found.');return;}
  target.lostMagic.push({id:`lm-${Date.now()}`,name,manaCost:cost,description:desc});
  ['dmLMName','dmLMCost','dmLMDescription'].forEach(id=>{const e=el(id);if(e)e.value='';});
  pushState();render();
}
function rollHp(){
  const c=getChar();const conMod=modFrom(c.stats.CON);
  const cat=getMagicCategory(c);
  const isPower=c.magicCategory?.startsWith('power');
  const roll=isPower?rollD10():rollD10();// both use d10 per rules
  const total=Math.max(1,roll+conMod);c.hp.max+=total;c.hp.current=c.hp.max;
  pushState();render();
  alert(`HP Roll: d10 (${roll}) + CON (${conMod}) = +${total} HP\nNew Max: ${c.hp.max}${isPower?'\n(Power magic: 1d10 hit dice)':''}`);
}
function rollMana(){
  const c=getChar();const cat=getMagicCategory(c);
  const isSense=c.magicCategory?.startsWith('sense');
  const roll=isSense?rollD10():rollD10();
  const sm=getSpellMod(c);
  const mcBonus=c.skills['Magic Control']?.bonus||0;
  const total=Math.max(1,roll+sm+mcBonus);
  c.mana.max+=total;c.mana.current=c.mana.max;
  pushState();render();
  const diceLabel=cat?cat.rollDice:'1d10';
  alert(`Mana Roll: ${diceLabel} (${roll}) + ${cat?cat.stat:'INT'} mod (${sm}) + Magic Control (${mcBonus}) = +${total} Mana\nNew Max: ${c.mana.max}`);
}
function saveCharState(){
  const c=getChar();
  if(el('stateActive')?.checked)c.state='active';
  if(el('stateReserve')?.checked)c.state='reserve';
  if(el('stateDead')?.checked){c.state='dead';c.hp.current=0;c.mana.current=0;}
  pushState();render();
}
function exportSave(){
  const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');
  a.href=url;a.download=`ft-save-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(url);a.remove();},100);
}
function importSave(file){
  if(!file)return;const r=new FileReader();
  r.onload=()=>{try{const p=JSON.parse(r.result);if(!p||!Array.isArray(p.characters)){alert('Invalid save.');return;}state=normalize(p);pushState();render();alert('Imported!');}catch{alert('Could not read file.');}};
  r.onerror=()=>alert('Could not read file.');r.readAsText(file);
}
function openDmOverlay(){
  el('dmOverlay')?.classList.remove('hidden');
  if(!dmUnlocked){el('dmLoginPanel')?.classList.remove('hidden');el('dmFullscreenPanel')?.classList.add('hidden');const p=el('dmPasswordInput');if(p){p.value='';p.focus();}}
  else{el('dmLoginPanel')?.classList.add('hidden');el('dmFullscreenPanel')?.classList.remove('hidden');renderDmLostMagic();renderDmTargetSelect();renderThemeFields();}
}
function closeDmOverlay(){el('dmOverlay')?.classList.add('hidden');}
function lockDm(){dmUnlocked=false;el('dmFullscreenPanel')?.classList.add('hidden');el('dmLoginPanel')?.classList.remove('hidden');}
function unlockDm(){
  if(el('dmPasswordInput')?.value!==DM_PASSWORD){alert('Wrong password.');return;}
  dmUnlocked=true;el('dmLoginPanel')?.classList.add('hidden');el('dmFullscreenPanel')?.classList.remove('hidden');
  renderDmLostMagic();renderDmTargetSelect();renderThemeFields();
}

// ---- BINDINGS ----
function updateField(field,value){
  const c=getChar();
  const mf={maxHp:'hp.max',currentHp:'hp.current',maxMana:'mana.max',currentMana:'mana.current'};
  if(mf[field]){const[o,k]=mf[field].split('.');c[o][k]=Math.max(0,Number(value)||0);}
  else if(['level','proficiencyBonus','armor'].includes(field))c[field]=Math.max(0,Number(value)||0);
  else c[field]=value;
  ensureClamp(c);pushState();renderHeader();renderMainFields();renderMagicBanner();renderCharacterTabs();
}
function bindInputs(){
  const ii=(id,field)=>{const e=el(id);if(e)e.addEventListener('input',ev=>updateField(field,ev.target.value));};
  const ic=(id,field)=>{const e=el(id);if(e)e.addEventListener('change',ev=>updateField(field,ev.target.value));};
  ii('charName','name');ii('charLevel','level');ii('charRace','race');ii('charClass','className');
  ii('charAge','age');ii('charBackground','background');ii('charMagicType','magicType');
  ic('charMagicCategory','magicCategory');ic('magicRank','magicRank');
  ii('charGuild','guild');ii('charGuildMark','guildMark');ii('charExceed','exceed');ii('charPB','proficiencyBonus');
  ii('currentHp','currentHp');ii('maxHp','maxHp');ii('currentMana','currentMana');ii('maxMana','maxMana');
  ii('armor','armor');ii('initiative','initiative');ii('speed','speed');
  ii('weaponsText','weaponsText');ii('abilitiesText','abilitiesText');ii('inventoryText','inventoryText');ii('notesText','notesText');

  document.querySelectorAll('.tab-btn[data-tab]').forEach(b=>b.addEventListener('click',()=>{state.activeTab=b.dataset.tab;pushState();renderTabs();}));
  el('statsGrid')?.addEventListener('click',e=>{const btn=e.target.closest('button[data-action]');if(!btn)return;const c=getChar();c.stats[btn.dataset.stat]=(Number(c.stats[btn.dataset.stat])||0)+(btn.dataset.action==='plus'?1:-1);pushState();render();});
  document.addEventListener('click',e=>{const btn=e.target.closest('.adj-btn');if(!btn)return;adjustResource(btn.dataset.resource,Number(btn.dataset.amt));});
  el('rollHpBtn')?.addEventListener('click',rollHp);
  el('rollManaBtn')?.addEventListener('click',rollMana);
  el('restoreHpBtn')?.addEventListener('click',()=>{const c=getChar();c.hp.current=c.hp.max;pushState();render();});
  el('restoreManaBtn')?.addEventListener('click',()=>{const c=getChar();c.mana.current=c.mana.max;pushState();render();});
  el('addCharacterBtn')?.addEventListener('click',()=>{const nc=blankChar(state.characters.length);nc.state='reserve';state.characters.push(nc);state.selectedCharacter=state.characters.length-1;state.showReserve=true;pushState();render();});
  el('toggleReserveBtn')?.addEventListener('click',()=>{state.showReserve=!state.showReserve;pushState();render();});
  el('toggleDeadBtn')?.addEventListener('click',()=>{state.showDead=!state.showDead;pushState();render();});
  el('addSpellBtn')?.addEventListener('click',addSpell);
  el('addLostMagicBtn')?.addEventListener('click',addLostMagic);
  el('saveCharacterStateBtn')?.addEventListener('click',saveCharState);
  el('deleteCharacterBtn')?.addEventListener('click',()=>{if(state.characters.length<=1){alert('Keep at least one character.');return;}if(!confirm(`Delete ${getChar().name||'this character'}?`))return;state.characters.splice(state.selectedCharacter,1);if(state.selectedCharacter>=state.characters.length)state.selectedCharacter=state.characters.length-1;pushState();render();});
  el('openDmOverlayBtn')?.addEventListener('click',openDmOverlay);
  el('dmLoginBtn')?.addEventListener('click',unlockDm);
  el('dmCloseBtn')?.addEventListener('click',closeDmOverlay);
  el('dmCloseFullBtn')?.addEventListener('click',closeDmOverlay);
  el('dmLogoutBtn')?.addEventListener('click',lockDm);
  el('dmPasswordInput')?.addEventListener('keydown',e=>{if(e.key==='Enter')unlockDm();});
  el('exportDataBtn')?.addEventListener('click',exportSave);
  el('importDataBtn')?.addEventListener('click',()=>el('importDataInput')?.click());
  el('importDataInput')?.addEventListener('change',e=>{importSave(e.target.files?.[0]);e.target.value='';});
  el('saveThemeBtn')?.addEventListener('click',()=>{state.theme={bg:el('themeBgColor')?.value,panel:el('themePanelColor')?.value,accent:el('themeAccentColor')?.value,accentTwo:el('themeAccentTwoColor')?.value,mana:el('themeManaColor')?.value,text:el('themeTextColor')?.value};pushState();render();});
  el('resetThemeBtn')?.addEventListener('click',()=>{state.theme={...DEF_THEME};pushState();render();});
  [el('themeBgColor'),el('themePanelColor'),el('themeAccentColor'),el('themeAccentTwoColor'),el('themeManaColor'),el('themeTextColor')].forEach(inp=>{if(inp)inp.addEventListener('input',()=>{state.theme={bg:el('themeBgColor')?.value||DEF_THEME.bg,panel:el('themePanelColor')?.value||DEF_THEME.panel,accent:el('themeAccentColor')?.value||DEF_THEME.accent,accentTwo:el('themeAccentTwoColor')?.value||DEF_THEME.accentTwo,mana:el('themeManaColor')?.value||DEF_THEME.mana,text:el('themeTextColor')?.value||DEF_THEME.text};applyTheme();});});
}

// ---- INIT ----
bindInputs();
render();
startFirebaseListener();
