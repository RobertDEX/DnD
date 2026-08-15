// ============================================================
// DUNGEON TOWER — dt.js
// Solo-Leveling-inspired Tower-Climbing RPG · Firebase-synced
// Dark · System · Dungeon · Fantasy
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getFirestore, doc, collection, getDoc, getDocs, onSnapshot, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

const FB_CONFIG = {
  apiKey:"AIzaSyCfEtfiU5swXvVkqt4shp8i6h4JYI8ES7U",authDomain:"dand-3c76a.firebaseapp.com",
  projectId:"dand-3c76a",storageBucket:"dand-3c76a.firebasestorage.app",
  messagingSenderId:"27455098509",appId:"1:27455098509:web:432929f697da9a947d5cc4",measurementId:"G-D1TQM5WJT8"
};
const fbApp = initializeApp(FB_CONFIG, 'dt');
const db    = getFirestore(fbApp);
const DOC   = 'dt-campaign';
const DM_PASS = '123456789';

// ================================================================
// CONSTANTS
// ================================================================
const STATS = ['STR','DEX','CON','INT','WIS','CHA'];
const STAT_LABELS = {
  STR:'Strength', DEX:'Agility', CON:'Vitality', INT:'Intelligence', WIS:'Wisdom', CHA:'Charisma'
};

// Skills — fantasy RPG skill list
const SKILL_DEFS = [
  {name:'STR Save',        stat:'STR', isSave:true},
  {name:'Athletics',       stat:'STR'},
  {name:'DEX Save',        stat:'DEX', isSave:true},
  {name:'Acrobatics',      stat:'DEX'},
  {name:'Stealth',         stat:'DEX'},
  {name:'Sleight of Hand', stat:'DEX'},
  {name:'CON Save',        stat:'CON', isSave:true},
  {name:'Tanking',         stat:'CON'},
  {name:'INT Save',        stat:'INT', isSave:true},
  {name:'Investigation',   stat:'INT'},
  {name:'Arcana',          stat:'INT'},
  {name:'History',         stat:'INT'},
  {name:'Medicine',        stat:'WIS'},
  {name:'WIS Save',        stat:'WIS', isSave:true},
  {name:'Mana Sense',      stat:'WIS'},
  {name:'Perception',      stat:'WIS'},
  {name:'Insight',         stat:'WIS'},
  {name:'Survival',        stat:'WIS'},
  {name:'Nature',          stat:'WIS'},
  {name:'Religion',        stat:'WIS'},
  {name:'CHA Save',        stat:'CHA', isSave:true},
  {name:'Intimidation',    stat:'CHA'},
  {name:'Persuasion',      stat:'CHA'},
  {name:'Deception',       stat:'CHA'}
];

// Full stat names for the grouped skills matrix header — falls back
// to STAT_LABELS which is the canonical map, but this const stays
// available in case we want to swap it for grimmer flavor later.
const STAT_FULL = STAT_LABELS;

// Skill descriptions — dungeon-diving RPG flavor. Kept tight
// and specific so the tooltip fires as clean tactical guidance.
const SKILL_DESCS = {
  // Saves — resistance rolls against being acted on
  'STR Save': 'Resist being moved, held, restrained, or crushed against your will.',
  'DEX Save': 'Dodge blasts, react in time, evade grasping appendages and traps.',
  'CON Save': 'Resist poison, disease, exhaustion, and exposure to anomalous effects.',
  'INT Save': 'Resist mental compulsion, forced recall, and memetic hazards.',
  'WIS Save': 'Resist fear, corruption, madness, and being turned against your team.',
  'CHA Save': 'Resist domination — refuse to have your voice, identity, or will overridden.',

  // STR
  'Athletics': 'Climb, swim, run, jump. Physical endurance in the field.',
  'Force':     'Break, bend, push through, or brute-strength something back.',

  // DEX
  'Acrobatics':      'Balance, tumble, escape restraints, land safely from falls.',
  'Stealth':         'Move silently. Blend into shadows. Avoid being seen.',
  'Sleight of Hand': 'Pick pockets, palm items, quietly disable small devices.',

  // CON
  'Tanking': 'Hold the line. Absorb damage for your party. Endure what others cannot.',

  // INT
  'Investigation': 'Search a room. Reconstruct events. Deduce what happened here.',
  'Arcana': 'Identify spells, enchantments, magical items. Understand mana flows.',
  'History': 'Recall lore about dungeons, monsters, ancient civilizations, and artifacts.',
  'Medicine':      'Stabilize the wounded. Diagnose. Identify what is wrong with them.',

  // WIS
  'Mana Sense': 'Feel mana flows, detect hidden magic, sense enchantments and wards.',
  'Perception':  'Notice sounds, movements, hidden details — mundane awareness.',
  'Insight':     'Read people. Detect lies. Sense hidden motives and intentions.',
  'Survival':    'Track, navigate unfamiliar terrain, endure the elements, find shelter.',

  // CHA
  'Nature': 'Identify plants, beasts, terrain. Understand natural hazards and ecosystems.',
  'Religion': 'Knowledge of gods, rites, prayers, holy symbols, and the undead. Recognize divine magic and sacred sites.',
  'Intimidation': 'Frighten enemies, demand surrender, project dominance and menace.',
  'Persuasion':    'Convince, negotiate, win over. Get civilians to comply.',
  'Intimidation':  'Threaten. Coerce. Dominate through fear.',
  'Deception':     'Lie convincingly. Maintain cover. Misdirect.'
};

// Player ranks — Solo Leveling letter-grade system.
// E through S rank, earned through Tower progression.
const RANKS = [
  { id:'E', tier:'E-RANK', title:'E-RANK',  subtitle:'Apprentice',   color:'#7a8590' },
  { id:'D', tier:'D-RANK', title:'D-RANK',  subtitle:'Initiate',     color:'#5a9a78' },
  { id:'C', tier:'C-RANK', title:'C-RANK',  subtitle:'Veteran',      color:'#c2a23a' },
  { id:'B', tier:'B-RANK', title:'B-RANK',  subtitle:'Elite',        color:'#5aa8f5' },
  { id:'A', tier:'A-RANK', title:'A-RANK',  subtitle:'Champion',     color:'#d94f4f' },
  { id:'S', tier:'S-RANK', title:'S-RANK',  subtitle:'Monarch',      color:'#b04ad9' }
];
const RANK_BY_ID = Object.fromEntries(RANKS.map(r=>[r.id,r]));

const PLAYER_CLASSES = [
  { id:'knight',    label:'Knight',    icon:'⚔', color:'#5aa8f5', primary:'STR', desc:'Frontline tank. Heavy armor, sword & shield.' },
  { id:'sorcerer',  label:'Sorcerer',  icon:'🔮', color:'#a462d3', primary:'INT', desc:'Raw arcane power. High damage, fragile.' },
  { id:'priest',    label:'Priest',    icon:'✝', color:'#ffd460', primary:'WIS', desc:'Healer and support. Radiant damage, buffs.' },
  { id:'ranger',    label:'Ranger',    icon:'🏹', color:'#4ade80', primary:'DEX', desc:'Ranged DPS. Traps, beast companions.' },
  { id:'assassin',  label:'Assassin',  icon:'🗡', color:'#c04a5a', primary:'DEX', desc:'Stealth striker. Critical hits, poison.' },
  { id:'berserker', label:'Berserker', icon:'🪓', color:'#e0802a', primary:'STR', desc:'Reckless damage. Rage, cleave, lifesteal.' },
  { id:'necromancer',label:'Necromancer',icon:'💀',color:'#8a5ad1',primary:'INT', desc:'Summons undead. Drains life. Dark magic.' },
  { id:'paladin',   label:'Paladin',   icon:'🛡', color:'#e8a72c', primary:'CHA', desc:'Holy warrior. Smites, heals, auras.' },
  // ─── HIDDEN / ADVANCED CLASSES (DM only, prestige) ───
  { id:'magic_knight',    label:'Magic Knight',      icon:'⚔🔮', color:'#6a8cf5', primary:'STR', desc:'Blade and sorcery combined. Enchants weapons with mana.', hidden:true },
  { id:'lich_lord',       label:'Lich Lord',          icon:'💀👑', color:'#6a2aaa', primary:'INT', desc:'Master of death itself. Commands undead armies. Phylactery bound.', hidden:true },
  { id:'brutal_berserker',label:'Brutal Berserker',   icon:'🪓💀', color:'#c04020', primary:'STR', desc:'Beyond rage. Every kill fuels the next. Unstoppable carnage.', hidden:true },
  { id:'shadow_assassin', label:'Shadow Assassin',    icon:'🗡🌑', color:'#4a1a3a', primary:'DEX', desc:'One with darkness. Can kill from the shadow realm itself.', hidden:true },
  { id:'arch_mage',       label:'Arch Mage',          icon:'🔮✦', color:'#c080ff', primary:'INT', desc:'Transcendent arcane mastery. Bends reality. Infinite mana potential.', hidden:true },
  { id:'high_priest',     label:'High Priest',        icon:'✝✦', color:'#fff0a0', primary:'WIS', desc:'Direct conduit to the divine. Mass resurrection. Absolute healing.', hidden:true },
  { id:'beast_master',    label:'Beast Master',       icon:'🏹🐺', color:'#2aaa60', primary:'DEX', desc:'Commands tamed monsters. Rides dragons. The wild obeys.', hidden:true },
  { id:'shadow_monarch',  label:'Shadow Monarch',     icon:'👁', color:'#1a1a4a', primary:'INT', desc:'Ruler of shadows. Extracts and commands shadow soldiers from the dead. The apex predator.', hidden:true },
  { id:'dragon_knight',   label:'Dragon Knight',      icon:'🐉', color:'#d4a020', primary:'STR', desc:'Bonded to a dragon. Scales as armor. Breath weapon. Flight.', hidden:true },
  { id:'saint',           label:'Saint',              icon:'✦', color:'#ffffff', primary:'WIS', desc:'Ascended beyond mortal limits. Immune to death magic. Aura of salvation.', hidden:true },
];
const CLASS_BY_ID = Object.fromEntries(PLAYER_CLASSES.map(c => [c.id, c]));

const CLASS_BASIC_SKILLS = {
  knight:     [
    { name:'Swordsmanship',  type:'Passive', cost:'—',     cooldown:'—',       desc:'Mastery of blade techniques. +2 to melee attack rolls. Can perform Thrust (single target, +1d6) and Sweep (2 targets, normal damage).' },
    { name:'Shield Bash',    type:'Active',  cost:'15 MP', cooldown:'1 round', desc:'Slam your shield into a target. Deals 2d6 bludgeoning and stuns the target for 1 round. STR save DC 14 negates stun.' }
  ],
  sorcerer:   [
    { name:'Arcane Bolt',    type:'Active',  cost:'10 MP', cooldown:'—',       desc:'Hurl a bolt of pure arcane energy. 3d6 force damage, range 120ft. Spell attack roll.' },
    { name:'Mana Shield',    type:'Active',  cost:'20 MP', cooldown:'3 rounds',desc:'Conjure a barrier of mana. Absorbs up to 30 damage for 1 minute. Excess damage breaks the shield.' }
  ],
  priest:     [
    { name:'Holy Light',     type:'Active',  cost:'15 MP', cooldown:'—',       desc:'Channel radiant energy. Heals 3d8+WIS to one ally, or deals 3d8 radiant to one undead/demon.' },
    { name:'Blessing',       type:'Active',  cost:'25 MP', cooldown:'Long rest',desc:'Bless up to 3 allies. They gain +1d4 to attack rolls and saving throws for 10 minutes.' }
  ],
  ranger:     [
    { name:'Quick Shot',     type:'Active',  cost:'10 MP', cooldown:'—',       desc:'Fire two arrows in rapid succession. Each deals 1d8+DEX piercing. Both can target the same or different enemies.' },
    { name:"Nature's Mark",  type:'Active',  cost:'15 MP', cooldown:'Short rest',desc:'Mark a target. All attacks against it gain advantage for 1 minute. The mark is visible only to your party.' }
  ],
  assassin:   [
    { name:'Backstab',       type:'Passive', cost:'—',     cooldown:'—',       desc:'Attacks from stealth or against surprised targets deal an extra 3d6 damage. Critical hits add another 2d6.' },
    { name:'Shadow Step',    type:'Active',  cost:'20 MP', cooldown:'2 rounds',desc:'Teleport up to 60ft to an unoccupied space you can see. If you appear behind an enemy, your next attack has advantage.' }
  ],
  berserker:  [
    { name:'Rage',           type:'Active',  cost:'20 MP', cooldown:'Short rest',desc:'Enter a berserker rage for 1 minute. +3 to melee damage, resistance to physical damage, but cannot cast spells. Ends early if you take no damage for 1 round.' },
    { name:'Cleave',         type:'Active',  cost:'15 MP', cooldown:'1 round', desc:'A devastating horizontal swing. Hits all enemies within 10ft in a 180° arc. Deals weapon damage +2d6 to each.' }
  ],
  necromancer:[
    { name:'Raise Dead',     type:'Active',  cost:'30 MP', cooldown:'Long rest',desc:'Animate a corpse as an undead servant. It has half the original creature\'s HP and obeys simple commands. Lasts 1 hour or until destroyed.' },
    { name:'Life Drain',     type:'Active',  cost:'15 MP', cooldown:'—',       desc:'Drain life from a target within 30ft. Deals 3d6 necrotic damage and you heal for half the damage dealt.' }
  ],
  paladin:    [
    { name:'Divine Smite',   type:'Active',  cost:'15 MP', cooldown:'—',       desc:'Channel divine energy through your weapon. On a hit, deal an extra 2d8 radiant damage. +1d8 against undead and fiends.' },
    { name:'Lay on Hands',   type:'Active',  cost:'—',     cooldown:'Long rest',desc:'Touch an ally and restore up to 5×your level HP from your divine pool. Can also cure one disease or neutralize one poison.' }
  ],
  // ─── HIDDEN / ADVANCED CLASS SKILLS ───
  magic_knight: [
    { name:'Mana Blade',       type:'Active',  cost:'20 MP', cooldown:'—',       desc:'Infuse your weapon with raw mana. Next 3 attacks deal +2d8 force damage and count as magical.' },
    { name:'Spell Parry',      type:'Passive', cost:'—',     cooldown:'—',       desc:'When targeted by a spell, use your reaction to make a melee attack. On hit, the spell is deflected.' }
  ],
  lich_lord: [
    { name:'Army of the Dead', type:'Active',  cost:'60 MP', cooldown:'Long rest',desc:'Raise up to 6 undead servants simultaneously. They persist until destroyed. You command them telepathically.' },
    { name:'Soul Cage',        type:'Active',  cost:'40 MP', cooldown:'—',       desc:'Trap the soul of a creature that died within 60ft. Consume it to restore 50 HP or ask it one question it must answer truthfully.' }
  ],
  brutal_berserker: [
    { name:'Bloodlust',        type:'Passive', cost:'—',     cooldown:'—',       desc:'Every kill heals you for 2d6 HP and adds +1 damage to your next attack (stacks up to +10).' },
    { name:'Rampage',          type:'Active',  cost:'30 MP', cooldown:'Short rest',desc:'For 3 rounds, you can make one additional attack per turn. Each kill extends the duration by 1 round.' }
  ],
  shadow_assassin: [
    { name:'Shadow Kill',      type:'Active',  cost:'25 MP', cooldown:'—',       desc:'Strike from the shadow realm. Teleport behind target, deal 6d6+DEX piercing. Target cannot use reactions until their next turn.' },
    { name:'Vanish',           type:'Active',  cost:'15 MP', cooldown:'2 rounds',desc:'Become completely invisible and intangible for 1 round. You can move through creatures and walls up to 5ft thick.' }
  ],
  arch_mage: [
    { name:'Mana Overflow',    type:'Active',  cost:'50 MP', cooldown:'Long rest',desc:'For 1 minute, all spell damage is doubled and spell MP costs are halved. Mana regenerates 10/round.' },
    { name:'Reality Warp',     type:'Active',  cost:'80 MP', cooldown:'Long rest',desc:'Reshape a 30ft cube of reality. Transmute matter, create terrain, or undo damage to structures and creatures within.' }
  ],
  high_priest: [
    { name:'Mass Resurrection', type:'Active', cost:'100 MP',cooldown:'Long rest',desc:'Resurrect up to 4 dead allies within 60ft to full HP. Removes all conditions. The light blinds undead within 120ft for 8d8 radiant.' },
    { name:'Divine Aegis',      type:'Active', cost:'40 MP', cooldown:'Short rest',desc:'Create a 30ft aura for 10 minutes. All allies inside gain +2 AC, resistance to all damage, and immunity to fear and charm.' }
  ],
  beast_master: [
    { name:'Tame Monster',     type:'Active',  cost:'30 MP', cooldown:'Long rest',desc:'Attempt to bond with a monster. WIS save DC equals your spell DC. On success, it becomes your permanent companion (max 2).' },
    { name:'Pack Tactics',     type:'Passive', cost:'—',     cooldown:'—',       desc:'You and your tamed beasts have advantage on attack rolls against a creature if at least one beast is within 5ft of it.' }
  ],
  shadow_monarch: [
    { name:"Ruler's Authority",type:'Active',  cost:'40 MP', cooldown:'—',       desc:'Telekinesis — move any object or creature up to 300lbs. Can crush, throw, or restrain. STR save to resist.' },
    { name:'Shadow Extraction',type:'Active',  cost:'50 MP', cooldown:'—',       desc:'Extract the shadow of a slain enemy. It becomes a permanent shadow soldier under your command. No limit on army size.' }
  ],
  dragon_knight: [
    { name:'Dragon Bond',      type:'Passive', cost:'—',     cooldown:'—',       desc:'You are bonded to a dragon. Gain fire resistance, +2 AC from scales, and can summon your dragon once per long rest.' },
    { name:'Breath Weapon',    type:'Active',  cost:'35 MP', cooldown:'Short rest',desc:'Channel your dragon\'s breath. 60ft cone, 8d6 fire/cold/lightning damage (matches your dragon). DEX save for half.' }
  ],
  saint: [
    { name:'Aura of Salvation',type:'Passive', cost:'—',     cooldown:'—',       desc:'All allies within 30ft heal 1d4 HP at the start of each of your turns. Undead within range take 1d4 radiant damage.' },
    { name:'Miracle',          type:'Active',  cost:'100 MP',cooldown:'Long rest',desc:'Request a miracle from the divine. The DM determines the outcome, but the effect can duplicate any spell of 8th level or lower.' }
  ]
};

const RARITY_COLORS = { common:'#9aa6b2', uncommon:'#5a9a78', rare:'#5aa8f5', epic:'#a462d3', legendary:'#e8a72c' };

// Threat grades for missions / anomalies and their point bounties
const THREAT_GRADES = [
  { grade:'E', points:100,    color:'#7a8590', label:'Easy' },
  { grade:'D', points:300,    color:'#5a9a78', label:'Normal' },
  { grade:'C', points:2700,   color:'#c2a23a', label:'Hard' },
  { grade:'B', points:75000,  color:'#5aa8f5', label:'Very Hard' },
  { grade:'A', points:100000, color:'#d94f4f', label:'Deadly' },
  { grade:'S', points:200000, color:'#b04ad9', label:'Catastrophic' }
];
const THREAT_BY_GRADE = Object.fromEntries(THREAT_GRADES.map(t=>[t.grade,t]));

// Monster types for the Tower bestiary
const ANOMALY_CLASSES = ['Beast','Undead','Demon','Dragon','Elemental','Construct','Aberration','Humanoid'];

// Damage types — mundane, elemental, divine, arcane. Each character
// can have a set they RESIST (half damage), a set they're VULNERABLE to
// (double damage), and a set they're IMMUNE to (no damage).
const DAMAGE_TYPES = [
  { id:'physical',  label:'Physical',  cat:'mundane',    icon:'⚔', desc:'Slashing, piercing, and bludgeoning damage.' },
  { id:'fire',      label:'Fire',      cat:'elemental',  icon:'🔥', desc:'Flames, lava, and burning heat.' },
  { id:'cold',      label:'Cold',      cat:'elemental',  icon:'❄', desc:'Ice, frost, and freezing cold.' },
  { id:'lightning', label:'Lightning',  cat:'elemental',  icon:'⚡', desc:'Electric bolts and chain lightning.' },
  { id:'acid',      label:'Acid',      cat:'elemental',  icon:'⚠', desc:'Corrosive substances and dissolving attacks.' },
  { id:'radiant',   label:'Radiant',   cat:'divine',     icon:'✦', desc:'Holy light, divine power, sacred energy.' },
  { id:'necrotic',  label:'Necrotic',  cat:'divine',     icon:'💀', desc:'Life-draining rot, death magic, undeath.' },
  { id:'psychic',   label:'Psychic',   cat:'arcane',     icon:'👁', desc:'Mind-rending attacks, psionic force.' },
  { id:'force',     label:'Force',     cat:'arcane',     icon:'◆', desc:'Pure magical force — raw mana made lethal.' },
  { id:'poison',    label:'Poison',    cat:'mundane',    icon:'🐍', desc:'Venoms, toxins, and poisonous gases.' },
  { id:'thunder',   label:'Thunder',   cat:'elemental',  icon:'💥', desc:'Concussive blasts and sonic damage.' },
];
const DAMAGE_TYPE_BY_ID = Object.fromEntries(DAMAGE_TYPES.map(t => [t.id, t]));

const DMG_TYPES = ['Slashing','Bludgeoning','Piercing','Fire','Cold','Lightning','Acid','Radiant','Necrotic','Psychic','Force','Poison','Thunder'];
const TRAINING  = ['Untrained','Trained','Master'];
const ITEM_CATEGORIES = ['Weapon','Armor','Accessory','Consumable','Skill Stone','Material','Misc'];

// Shop categories + tier access
const SHOP_CATEGORIES = ['Consumables','Weapons','Armor','Accessories','Skill Stones','Rune Stones','Loot Boxes','Materials','Utility'];

const QUEST_TYPES = {
  main:      { label:'Main Quest',  icon:'⚔', color:'#d94f4f' },
  side:      { label:'Side Quest',  icon:'◆', color:'#4a8bf5' },
  daily:     { label:'Daily',       icon:'☀', color:'#4ade80' },
  emergency: { label:'Emergency',   icon:'⚠', color:'#e8a72c' },
  hunt:      { label:'Hunt',        icon:'🎯', color:'#c04a5a' }
};
const RANK_TO_TIER = { 'E':1, 'D':2, 'C':3, 'B':4, 'A':4, 'S':4 };   // an agent of rank R can access all tiers <= R
const TIER_LABEL = { 1:'E-RANK', 2:'D-RANK', 3:'C-RANK', 4:'B-RANK+' };
const TIER_COLOR = { 1:'#7a8590', 2:'#9aa6b2', 3:'#c2b067', 4:'#d94f4f' };

// ================================================================
// STATE
// ================================================================
const MY_PRESENCE_ID = localStorage.getItem('dt-pid') || (() => {
  const id = Math.random().toString(36).slice(2);
  localStorage.setItem('dt-pid', id); return id;
})();

let dmUnlocked = sessionStorage.getItem('dt-dm') === '1';
let spectator  = sessionStorage.getItem('dt-spectator') === '1';
let _lastAppliedRaw = null;
let _claimReconciled = false;  // runs once per session to drop stale claims

// ── Debug tools — available as window.dtDebug in browser console ──
window.dtDebug = {
  state()        { return JSON.parse(JSON.stringify(state)); },
  snapshotStatus(){ return { received: _firstSnapshotReceived, chars: state.characters.length, dmUnlocked, spectator }; },
  char(i)        { return state.characters[i ?? state.selectedCharacter]; },
  expTable(n=25) {
    let cumul = 0;
    for(let l=1;l<=n;l++){ const e=expForLevel(l); cumul+=e; console.log(`Lv.${l}→${l+1}: ${e} EXP (cumul: ${cumul}, DnD ${dndLevelFromSystem(l)})`); }
  },
  stateSize()    { return JSON.stringify(state).length; },
  forceRender()  { render(); },
  async forcePush(){ return pushState(true); },
};
let _firstSnapshotReceived = false;  // Firebase load-completed guard — see pushState
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
    id:`dt-${Date.now()}-${i}-${Math.random().toString(16).slice(2)}`,
    name:'', codename:'', role:'', clearance:'', age:'', level:1, background:'',
    playerClass:'none',       // no class until DM assigns at level 10
    rank:'E',                 // letter rank E-S
    points:0,                 // gold currency
    title:'',                 // earned title (e.g. "Shadow Monarch")
    exp:0,                    // current experience points
    systemLevel:1,            // system level (every 10 = 1 DnD level)
    division:'', site:'',
    profBonusOverride:null, initiativeBonus:0, attackStat:'STR',
    state: i<4?'active':'reserve',
    portrait:'', accentColor:'', claimedBy:'',
    // Base DnD stats — start at 8, player distributes 9 creation points
    stats:{STR:8,DEX:8,CON:8,INT:8,WIS:8,CHA:8},
    baseStatPoints:9,  // creation points remaining (out of 9)
    // System Stats — gain 3 distributable points per level
    // These ADD to the base DnD stats to form the effective score
    systemStats:{str:0,dex:0,con:0,int:0,wis:0,cha:0},
    skills:makeBlankSkills(),
    hp:{current:0,max:0}, mana:{current:0,max:0},
    armor:10, speed:'30 ft', tempHp:0,
    fatigue:0,  // 0-100, like Solo Leveling fatigue
    deathSaves:{successes:0,failures:0,stable:false},
    abilitiesText:'', notesText:'',
    relationships:[], weapons:[], inventory:[], anomalies:[], missions:[], abilities:[], commendations:[],
    skillStones:[]  // unabsorbed skill stones — absorbing moves them to abilities permanently
  };
}

let state = {
  characters: Array.from({length:6}, (_,i)=>blankChar(i)),
  selectedCharacter: 0,
  activeTab: 'status',
  showReserve: false,
  theme: null,
  shop: [],  // shared shop catalog managed by the DM

  siteAlert: 'normal',                        // normal | lockdown | uncontained
  requests: []  // player item requests awaiting DM review
};

// Commendation/achievement catalog (DM grants these)
const COMMENDATIONS = [
  { id:'first_contain', icon:'◈', name:'First Kill',   desc:'Slew your first monster in the Tower.' },
  { id:'survived_keter', icon:'⚠', name:'Keter Survivor',     desc:'Survived direct contact with a Keter-class entity.' },
  { id:'tier4',         icon:'★', name:'Ascension',           desc:'Reached Tier IV — Overseer clearance.' },
  { id:'flawless',      icon:'✦', name:'Flawless Operation',  desc:'Completed a mission with no casualties or losses.' },
  { id:'scholar',       icon:'❖', name:'Field Scholar',       desc:'Documented 10+ anomalies in the log.' },
  { id:'big_game',      icon:'⬡', name:'Big Game',            desc:'Captured an A-grade or higher anomaly.' },
  { id:'sole_survivor', icon:'☩', name:'Sole Survivor',       desc:'The only agent to walk out of an operation.' },
  { id:'loyal',         icon:'⚒', name:'Tower Veteran',       desc:'Proven service in the Tower. Respected by all.' },
  { id:'sacrifice',     icon:'✝', name:'Ultimate Sacrifice',  desc:'Gave everything in the line of duty. (Posthumous)' }
];
const COMMENDATION_BY_ID = Object.fromEntries(COMMENDATIONS.map(c=>[c.id,c]));

// ================================================================
// HELPERS
// ================================================================
const el = id => document.getElementById(id);
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function mod(score){ return Math.floor((Number(score||10)-10)/2); }
function fmtMod(n){ return n>=0?`+${n}`:`${n}`; }
function profBonus(c){ if(c.profBonusOverride!=null) return Number(c.profBonusOverride)||0; return Math.ceil((Number(c.level)||1)/4)+1; }
function fmtGold(n){ return (Number(n)||0).toLocaleString('en-US'); }

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
  if(c.mana.max<0)c.mana.max=0;
  if(c.mana.current>c.mana.max)c.mana.current=c.mana.max;
  if(c.mana.current<0)c.mana.current=0;
  if(c.points<0)c.points=0;
  c.fatigue = clamp(c.fatigue || 0, 0, 100);
}

// System Stats → DnD stat mapping. Each system stat point adds +1
// to the corresponding DnD ability score. The base score comes from
// the point-buy (starts at 8, 9 points to distribute at creation).
const SYSTEM_STAT_MAP = {str:'STR', dex:'DEX', con:'CON', int:'INT', wis:'WIS', cha:'CHA'};
const SYSTEM_STAT_LABELS = {str:'Strength', dex:'Agility', con:'Vitality', int:'Intelligence', wis:'Sense', cha:'Charisma'};

function effectiveStat(c, stat) {
  const base = Number(c.stats[stat]) || 8;
  const sysKey = stat.toLowerCase();
  const sysBonus = Number(c.systemStats?.[sysKey]) || 0;
  const cls = getClassDef(c.playerClass);
  const classBonus = Number(cls?.bonuses?.[stat]) || 0;
  return base + sysBonus + classBonus;
}

function getAllClasses() {
  const all = {};
  PLAYER_CLASSES.forEach(c => { all[c.id] = c; });
  try {
    if (Array.isArray(state?.customClasses)) {
      state.customClasses.forEach(c => { if(c && c.id) all[c.id] = c; });
    }
  } catch(e) { console.error('getAllClasses custom error:', e); }
  return all;
}
function getClassDef(id) { return getAllClasses()[id] || null; }

function calcSuggestedMaxHp(c) {
  const cls = getClassDef(c.playerClass);
  const hitDie = cls?.hitDie || 8;
  const conMod = mod(effectiveStat(c, 'CON'));
  const dndLvl = c.level || 1;
  const lvl1Hp = hitDie + conMod;
  const perLevel = Math.max(1, Math.floor(hitDie / 2) + 1 + conMod);
  return Math.max(1, lvl1Hp + perLevel * (dndLvl - 1));
}

function calcSuggestedMaxMana(c) {
  const cls = getClassDef(c.playerClass);
  if (!cls) return 10;
  const manaStat = cls.primary === 'WIS' ? 'WIS' : cls.primary === 'CHA' ? 'CHA' : 'INT';
  const manamod = mod(effectiveStat(c, manaStat));
  const dndLvl = c.level || 1;
  return Math.max(0, 10 + (manamod * 2 + 3) * dndLvl);
}

// System stat points: 3 points per system level above 1.
// Lv.1 = 0pts, Lv.2 = 3pts, Lv.6 = 15pts, Lv.50 = 147pts, Lv.200 = 597pts.
function systemPointsTotal(c) {
  const sysLvl = Number(c.systemLevel) || 1;
  return Math.max(0, sysLvl - 1) * 3;
}
function systemPointsSpent(c) {
  const ss = c.systemStats || {};
  return Object.values(ss).reduce((sum, v) => sum + (Number(v) || 0), 0);
}
function systemPointsRemaining(c) { return Math.max(0, systemPointsTotal(c) - systemPointsSpent(c)); }

// ═════════════════════════════════════════════════════════════════
// EXP & LEVELING SYSTEM
// EXP needed scales ×1.8 per system level. Every 10 system levels = 1 DnD level.
// ═════════════════════════════════════════════════════════════════
const EXP_BASE = 100;    // EXP to go from system level 1 → 2
const EXP_SCALE = 1.05;  // ×1.05 per level — matches monster reward scaling across 200 levels

// EXP needed to go from level n to level n+1
// Each level takes roughly the same number of on-level fights (~8-15 kills)
// because monster EXP rewards scale at a similar rate to requirements.
// Levels 10-11 get a ×1.15 bump (class unlock wall — earns a grind moment).
function expForLevel(n) {
  let total = EXP_BASE;
  for (let i = 1; i < n; i++) {
    const scale = (i >= 10 && i <= 11) ? 1.15 : EXP_SCALE;
    total = Math.floor(total * scale);
  }
  return total;
}

// Total cumulative EXP needed to REACH level n (from level 1)
function expCumulativeForLevel(n) {
  let total = 0;
  for (let i = 1; i < n; i++) total += expForLevel(i);
  return total;
}

// EXP into current level (how much of the current level's bar is filled)
function expIntoCurrentLevel(c) {
  const cumNeeded = expCumulativeForLevel(c.systemLevel || 1);
  return Math.max(0, (c.exp || 0) - cumNeeded);
}

// EXP needed for the NEXT level up from current
function expNeededForNextLevel(c) { return expForLevel(c.systemLevel || 1); }

// DnD level derived from system level: every 10 system levels = 1 DnD level
function dndLevelFromSystem(sysLvl) { return Math.floor((Math.max(1, sysLvl) - 1) / 10) + 1; }

// Process EXP gain — auto level up, return number of levels gained
function gainExp(c, amount) {
  if (amount <= 0) return 0;
  c.exp = (c.exp || 0) + amount;
  let levelsGained = 0;
  const oldDndLevel = dndLevelFromSystem(c.systemLevel || 1);
  // Keep leveling up while we have enough EXP
  while (true) {
    const needed = expCumulativeForLevel((c.systemLevel || 1) + 1);
    if (c.exp >= needed) {
      c.systemLevel = (c.systemLevel || 1) + 1;
      levelsGained++;
    } else break;
  }
  // Sync DnD level
  c.level = dndLevelFromSystem(c.systemLevel);
  // Check if DnD level changed — announce rewards
  if (c.level > oldDndLevel) {
    for (let dLvl = oldDndLevel + 1; dLvl <= c.level; dLvl++) {
      announceDndLevelUp(c, dLvl);
    }
  }
  return levelsGained;
}

// DnD level-up benefits table
const DND_LEVEL_REWARDS = {
  1:  { profBonus:2, note:'Starting level.' },
  2:  { profBonus:2, note:'Gain a Hit Die. Class features improve.' },
  3:  { profBonus:2, note:'Gain a Hit Die. Subclass or archetype available.' },
  4:  { profBonus:2, note:'Gain a Hit Die. +2 to one Ability Score (or a Feat).' },
  5:  { profBonus:3, note:'Proficiency Bonus increases to +3. Gain a Hit Die. Extra Attack (martial).' },
  6:  { profBonus:3, note:'Gain a Hit Die. Class feature.' },
  7:  { profBonus:3, note:'Gain a Hit Die. Class feature.' },
  8:  { profBonus:3, note:'Gain a Hit Die. +2 to one Ability Score (or a Feat).' },
  9:  { profBonus:4, note:'Proficiency Bonus increases to +4. Gain a Hit Die. 5th-level spells (casters).' },
  10: { profBonus:4, note:'Gain a Hit Die. Class feature.' },
  11: { profBonus:4, note:'Gain a Hit Die. Class feature.' },
  12: { profBonus:4, note:'Gain a Hit Die. +2 to one Ability Score (or a Feat).' },
  13: { profBonus:5, note:'Proficiency Bonus increases to +5. Gain a Hit Die. 7th-level spells (casters).' },
  14: { profBonus:5, note:'Gain a Hit Die. Class feature.' },
  15: { profBonus:5, note:'Gain a Hit Die. Class feature.' },
  16: { profBonus:5, note:'Gain a Hit Die. +2 to one Ability Score (or a Feat).' },
  17: { profBonus:6, note:'Proficiency Bonus increases to +6. Gain a Hit Die. 9th-level spells (casters).' },
  18: { profBonus:6, note:'Gain a Hit Die. Class feature.' },
  19: { profBonus:6, note:'Gain a Hit Die. +2 to one Ability Score (or a Feat).' },
  20: { profBonus:6, note:'Gain a Hit Die. Capstone class feature. Maximum power.' }
};

function announceDndLevelUp(c, newDndLevel) {
  const reward = DND_LEVEL_REWARDS[newDndLevel] || {};
  const sysLvl = newDndLevel * 10;
  const isASI = [4,8,12,16,19].includes(newDndLevel);
  const isProfUp = [5,9,13,17].includes(newDndLevel);

  let msg = `⚔ DnD LEVEL UP! ${c.name||'Player'} is now DnD Level ${newDndLevel}!`;
  if (isProfUp) msg += ` Proficiency Bonus → +${reward.profBonus}.`;
  if (isASI) msg += ` Ability Score Improvement available!`;
  msg += ` ${reward.note || ''}`;

  showToast(msg, 'buy');

  // Auto-announce ASI availability (points are handled by totalBasePoints automatically)
  if (isASI) {
    showToast(`+2 Ability Score points available for ${c.name||'Player'}. Spend them in the Profile tab.`, 'info');
  }
}

// Base stat point-buy: starts with 9 points, gains +2 at DnD levels 4/8/12/16/19 (ASI).
// Total pool = baseStatPoints (default 9, DM can change) + (2 × number of ASI levels reached).
// Points spent = sum(stats) - 48 (6 stats × 8 base).
function totalBasePoints(c) {
  const dndLvl = c.level || 1;
  const asiLevels = [4,8,12,16,19].filter(l => dndLvl >= l).length;
  return (Number(c.baseStatPoints) || 9) + (asiLevels * 2);
}
function basePointsSpent(c) {
  return STATS.reduce((sum, s) => sum + (Number(c.stats[s]) || 8), 0) - 48;
}
function basePointsRemaining(c) { return Math.max(0, totalBasePoints(c) - basePointsSpent(c)); }

function normalize(raw){
  const m = { ...state, ...raw };
  if(!Array.isArray(m.characters)) m.characters = [];
  m.characters = m.characters.map((c,i)=>{
    try {
      const b = blankChar(i);
      const mc = { ...b, ...c };
      mc.stats = { ...b.stats, ...(c.stats||{}) };
      mc.hp = { ...b.hp, ...(c.hp||{}) };
      // Migrate mana → mana (backwards compat)
      mc.mana = { ...b.mana, ...(c.mana || c.sanity || {}) };
      mc.deathSaves = { ...b.deathSaves, ...(c.deathSaves||{}) };
      // System Stats — parallel stat pool that boosts DnD stats
      const bs = c.systemStats || {};
      mc.systemStats = {
        str: Math.max(0, Number(bs.str) || 0),
        dex: Math.max(0, Number(bs.dex) || 0),
        con: Math.max(0, Number(bs.con) || 0),
        int: Math.max(0, Number(bs.int) || 0),
        wis: Math.max(0, Number(bs.wis) || 0),
        cha: Math.max(0, Number(bs.cha) || 0)
      };
      mc.baseStatPoints = Math.max(0, Number(c.baseStatPoints ?? 9));
      mc.playerClass = (c.playerClass === 'none' || getClassDef(c.playerClass)) ? c.playerClass : 'none';
      mc.title = String(c.title || '');
      mc.exp = Math.max(0, Number(c.exp) || 0);
      mc.systemLevel = Math.max(1, Number(c.systemLevel) || 1);
      // DnD level is always derived from system level
      mc.level = dndLevelFromSystem(mc.systemLevel);
      mc.fatigue = clamp(Number(c.fatigue) || 0, 0, 100);
      if(!RANK_BY_ID[mc.rank]) mc.rank = 'E';      mc.relationships = Array.isArray(c.relationships)?c.relationships:[];
      mc.weapons    = Array.isArray(c.weapons)?c.weapons:[];
      mc.inventory  = Array.isArray(c.inventory)?c.inventory:[];
      mc.anomalies  = Array.isArray(c.anomalies)?c.anomalies:[];
      mc.missions   = Array.isArray(c.missions)?c.missions:[];
      // Damage-type arrays — resistances and vulnerabilities
      mc.resistances    = Array.isArray(c.resistances)    ? c.resistances.map(String)    : [];
      mc.vulnerabilities= Array.isArray(c.vulnerabilities)? c.vulnerabilities.map(String): [];
      mc.immunities     = Array.isArray(c.immunities)     ? c.immunities.map(String)     : [];
      mc.abilities  = (Array.isArray(c.abilities)?c.abilities:[]).map(a=>({
        name:a?.name||'', type:a?.type||'Talent', cost:a?.cost||'', cooldown:a?.cooldown||'', desc:a?.desc||''
      }));
      mc.commendations = Array.isArray(c.commendations)?c.commendations:[];
      mc.skillStones = (Array.isArray(c.skillStones)?c.skillStones:[]).map(s=>({
        id:       String(s?.id || ('ss-'+Date.now()+'-'+Math.random().toString(16).slice(2))),
        name:     String(s?.name || 'Unknown Skill'),
        type:     String(s?.type || 'Active'),
        cost:     String(s?.cost || '—'),
        cooldown: String(s?.cooldown || '—'),
        desc:     String(s?.desc || ''),
        element:  String(s?.element || ''),
        fromDm:   !!s?.fromDm,
        fromPlayer: String(s?.fromPlayer || '')
      }));
      if(typeof mc.points!=='number') mc.points = Number(mc.points)||0;
      if(!RANK_BY_ID[mc.rank]) mc.rank = 'E';
      const blankSk = makeBlankSkills(); mc.skills = {};
      Object.keys(blankSk).forEach(n=>{ mc.skills[n] = { ...blankSk[n], ...(c.skills?.[n]||{}) }; });
      return mc;
    } catch(err) {
      console.error(`Normalize failed for character ${i}, keeping raw:`, err, c);
      return c || blankChar(i);
    }
  });
  // Never force the roster back up to a fixed count — that re-spawned deleted agents.
  // Only guarantee at least one player file exists so the sheet can render.
  if(m.characters.length === 0) m.characters.push(blankChar(0));
  if(m.selectedCharacter>=m.characters.length) m.selectedCharacter = 0;
  if(!Array.isArray(m.shop)) m.shop = [];
  m.shop = m.shop.map(it=>({
    tier: Number(it.tier)||1,
    name: it.name||'',
    category: it.category||'Utility',
    price: Number(it.price)||0,
    stock: (it.stock===undefined?null:it.stock),
    desc: it.desc||'',
    icon: it.icon||'',
    rarity: it.rarity||'common',
    stats: it.stats||''
  }));
  // Evidence board
  // Site alert state
  if(!['normal','lockdown','uncontained'].includes(m.siteAlert)) m.siteAlert = 'normal';
  // Item requests
  if(!Array.isArray(m.requests)) m.requests = [];
  // Anomaly catalog — DM-authored master list. Each anomaly has an id
  // and a grantedTo:[charIds] array. Character sees it if their id is in there.
  if(!Array.isArray(m.anomalyCatalog)) m.anomalyCatalog = [];
  m.anomalyCatalog = m.anomalyCatalog.map((a,ix) => ({
    id:        String(a?.id ?? ('anom-'+Date.now()+'-'+ix+'-'+Math.random().toString(16).slice(2,5))),
    desig:     String(a?.desig ?? 'DT-???'),
    name:      String(a?.name ?? 'Unidentified'),
    threat:    THREAT_BY_GRADE[a?.threat] ? a.threat : 'F',
    class:     ANOMALY_CLASSES.includes(a?.class) ? a.class : 'Euclid',
    desc:      String(a?.desc ?? ''),
    redacted:  !!a?.redacted,   // DM classifies the description — players see █████
    grantedTo: Array.isArray(a?.grantedTo) ? a.grantedTo.map(String) : []
  }));

  // Investigation Cases — DM-authored, granted to specific agents
  if(!Array.isArray(m.cases)) m.cases = [];
  m.cases = m.cases.map((k,ix) => ({
    id:         String(k?.id ?? ('quest-'+Date.now()+'-'+ix+'-'+Math.random().toString(16).slice(2,5))),
    name:       String(k?.name ?? k?.title ?? 'Untitled Quest'),
    type:       ['main','side','daily','emergency','hunt'].includes(k?.type) ? k.type : 'side',
    rank:       RANK_BY_ID[k?.rank] ? k.rank : 'E',
    status:     ['available','active','completed','failed'].includes(k?.status) ? k.status : (k?.status==='open'?'active': k?.status==='closed'?'completed': 'available'),
    desc:       String(k?.desc ?? k?.briefing ?? ''),
    objectives: Array.isArray(k?.objectives) ? k.objectives.map(o => ({
      id: String(o?.id ?? ('obj-'+Math.random().toString(16).slice(2,6))),
      text: String(o?.text ?? ''),
      done: !!o?.done
    })) : [],
    rewards:    {
      exp:   Math.max(0, Number(k?.rewards?.exp) || 0),
      gold:  Math.max(0, Number(k?.rewards?.gold) || 0),
      items: Array.isArray(k?.rewards?.items) ? k.rewards.items.map(String) : []
    },
    assignedTo: k?.assignedTo === 'all' ? 'all' : (Array.isArray(k?.assignedTo) ? k.assignedTo.map(String) : (Array.isArray(k?.visibleTo) ? k.visibleTo : [])),
    timeLimit:  String(k?.timeLimit ?? ''),
    dmNotes:    String(k?.dmNotes ?? ''),
    completedBy: Array.isArray(k?.completedBy) ? k.completedBy.map(String) : [],
    created:    Number(k?.created) || Date.now()
  }));

  // Site Locator — investigation sites with atmosphere. One flagged as current scene.
  if(!Array.isArray(m.sites)) m.sites = [];
  m.sites = m.sites.map((s,ix) => ({
    id:         String(s?.id ?? ('site-'+Date.now()+'-'+ix+'-'+Math.random().toString(16).slice(2,5))),
    name:       String(s?.name ?? 'Unnamed Site'),
    designation:String(s?.designation ?? ''),
    region:     String(s?.region ?? 'urban'),
    description:String(s?.description ?? ''),
    atmosphere: String(s?.atmosphere ?? ''),
    contaminated: !!s?.contaminated,
    dmNotes:    String(s?.dmNotes ?? ''),
    current:    !!s?.current
  }));
  // Enforce single current site
  const cur = m.sites.filter(s => s.current).length;
  if (cur > 1) {
    let found = false;
    m.sites.forEach(s => { if (s.current) { if (found) s.current = false; else found = true; } });
  }

  // Initiative Tracker — combat encounter turn order (DM-managed)
  if(!m.initiative || typeof m.initiative !== 'object') m.initiative = { active:false, round:1, turnIdx:0, entries:[] };
  m.initiative.active = !!m.initiative.active;
  m.initiative.round  = Math.max(1, Number(m.initiative.round) || 1);
  m.initiative.turnIdx = Math.max(0, Number(m.initiative.turnIdx) || 0);
  m.initiative.entries = Array.isArray(m.initiative.entries) ? m.initiative.entries.map((e,ix) => ({
    id:    String(e?.id ?? ('init-'+Date.now()+'-'+ix)),
    name:  String(e?.name ?? '—'),
    init:  Number(e?.init) || 0,
    hp:    e?.hp === undefined ? null : Number(e.hp),
    hpMax: e?.hpMax === undefined ? null : Number(e.hpMax),
    hostile: !!e?.hostile,
    kind:  ['agent','anomaly','npc'].includes(e?.kind) ? e.kind : 'npc'
  })) : [];

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
  let total = mod(effectiveStat(c, def.stat));
  const pb = profBonus(c);
  if(sk.expert) total += pb*2;
  else if(sk.prof) total += pb;
  total += Number(sk.misc)||0;
  return total;
}
function calcInitiative(c){ return mod(effectiveStat(c, 'DEX')) + (Number(c.initiativeBonus)||0); }
function attackBonus(c){ return mod(effectiveStat(c, c.attackStat||'STR')) + profBonus(c); }

// ================================================================
// FIREBASE SYNC
// ================================================================
function setSyncDot(s){
  const d = el('syncDot'); if(!d) return;
  d.className = 'sync-dot '+s;
  d.title = {synced:'Synced',syncing:'Syncing…',error:'Offline — changes may not save',warn:'Waiting for Firebase — writes paused for safety'}[s]||s;
}

let _pushDebounce = null;
async function pushState(immediate=false){
  if(spectator) return;
  // ────────────────────────────────────────────────────────────
  // CRITICAL SAFETY: never push local state to Firebase until we
  // have successfully RECEIVED at least one snapshot from Firebase.
  // Without this guard, if the initial load fails silently, the
  // default empty state would overwrite the real data on first
  // interaction. This is what caused "everything is gone" issues.
  // ────────────────────────────────────────────────────────────
  if(!_firstSnapshotReceived){
    console.warn('pushState blocked: no Firebase snapshot received yet. Will retry after load.');
    setSyncDot('warn');
    return;
  }
  // Guard: don't push completely empty state (no names AND no shop).
  // But DO allow pushing if there are system-level changes (EXP, gold, etc.)
  // Strip local-only fields that should NOT sync across clients.
  // Each player navigates their own tabs and selects their own character.
  const pushData = { ...state };
  delete pushData.activeTab;
  delete pushData.selectedCharacter;
  const dataStr = JSON.stringify(pushData);
  // Size guard — Firestore doc limit ~1MB
  if(dataStr.length > 900000){
    console.error('pushState: data too large!', (dataStr.length/1024).toFixed(0)+'KB');
    showToast('⚠ Save data very large. Clear old quests/shop items.','warn');
  }
  if(immediate){
    setSyncDot('syncing');
    try { await setDoc(doc(db,'campaigns',DOC), { data: dataStr }); setSyncDot('synced'); }
    catch(e){ console.error(e); setSyncDot('error'); }
    return;
  }
  setSyncDot('syncing');
  clearTimeout(_pushDebounce);
  _pushDebounce = setTimeout(async ()=>{
    try { await setDoc(doc(db,'campaigns',DOC), { data: dataStr }); setSyncDot('synced'); }
    catch(e){ console.error(e); setSyncDot('error'); }
  }, 600);
}
// Force any pending debounced write to go out right now (e.g. on blur / before unload).
function flushPendingPush(){
  if(_pushDebounce){ clearTimeout(_pushDebounce); _pushDebounce=null; pushState(true); }
}

function startListener(){
  if(_unsub) _unsub();
  _unsub = onSnapshot(doc(db,'campaigns',DOC), snap=>{
    if(!snap.exists()){
      // Doc doesn't exist — first-time campaign. Unlock pushes so the
      // initial character setup can go into Firebase.
      _firstSnapshotReceived = true;
      setSyncDot('synced');
      return;
    }
    try {
      const raw = snap.data().data;
      if(raw===_lastAppliedRaw){ setSyncDot('synced'); _firstSnapshotReceived = true; return; }
      _lastAppliedRaw = raw;
      const remote = normalize(JSON.parse(raw));

      const ae = document.activeElement;
      const isTyping = ae && (ae.tagName==='INPUT'||ae.tagName==='TEXTAREA'||ae.tagName==='SELECT');
      const myIdx = state.characters.findIndex(c=>c.claimedBy===MY_PRESENCE_ID);

      remote.characters.forEach((rc,i)=>{
        if(isTyping && i===(myIdx>=0?myIdx:state.selectedCharacter)) return;
        state.characters[i] = rc;
      });
      // Match the remote roster length exactly — grow if added, shrink if deleted.
      if(state.characters.length > remote.characters.length){
        state.characters.length = remote.characters.length;
      } else {
        while(state.characters.length < remote.characters.length)
          state.characters.push(remote.characters[state.characters.length]);
      }
      if(state.selectedCharacter >= state.characters.length) state.selectedCharacter = 0;
      if(Array.isArray(remote.shop)) state.shop = remote.shop;
      if(Array.isArray(remote.requests)) state.requests = remote.requests;
      if(Array.isArray(remote.customClasses)) state.customClasses = remote.customClasses;
      state.theme = remote.theme;
      state.anomalyCatalog = remote.anomalyCatalog || [];
      state.cases         = remote.cases         || [];
      state.sites         = remote.sites         || [];
      state.initiative    = remote.initiative    || { active:false, round:1, turnIdx:0, entries:[] };
      state.sceneName     = remote.sceneName     || '';
      state.broadcast     = remote.broadcast     || '';
      // DO NOT sync activeTab or selectedCharacter — those are local per-client
      const prevAlert = state.siteAlert;
      state.siteAlert = remote.siteAlert;
      _firstSnapshotReceived = true;   // Firebase data safely loaded — writes are now safe

      // ── Stale-claim reconciliation ────────────────────────
      if ((spectator || dmUnlocked) && !_claimReconciled) {
        _claimReconciled = true;
        const held = state.characters.some(c => c.claimedBy === MY_PRESENCE_ID);
        if (held) {
          releaseMyClaim(true);
          console.log('[dt] released stale character claim (watcher/DM mode)');
        }
      }

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
    } catch(e){
      console.error('Snapshot error — Firebase load failed:', e);
      setSyncDot('error');
      // Do NOT flip _firstSnapshotReceived — writes stay blocked so
      // we can't overwrite Firebase with local defaults.
    }
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
    await setDoc(doc(db,'dt-presence',MY_PRESENCE_ID), { id:MY_PRESENCE_ID, name, color, ts:Date.now() });
  } catch(e){}
}
function startPresenceListener(){
  if(_presenceUnsub) _presenceUnsub();
  _presenceUnsub = onSnapshot(collection(db,'dt-presence'), snap=>{
    const now = Date.now(); const active=[]; const liveIds=new Set();
    snap.forEach(d=>{
      const p = d.data();
      if(now-p.ts<35000){ active.push(p); liveIds.add(p.id); }
      else { deleteDoc(doc(db,'dt-presence',d.id)).catch(()=>{}); }
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

// ── RELEASE CHARACTER ON LEAVE ──
// When this person leaves the site, free up whatever character they claimed
// so it isn't hard-locked for the next session / another player.
function releaseMyCharacterSync(){
  try {
    // Make sure any pending debounced edit is included in what we beacon out.
    if(_pushDebounce){ clearTimeout(_pushDebounce); _pushDebounce=null; }
    const mine = state.characters.find(c=>c.claimedBy===MY_PRESENCE_ID);
    if(!mine) { // still drop presence
      navigator.sendBeacon && _beaconDelete('dt-presence', MY_PRESENCE_ID);
      return;
    }
    mine.claimedBy = '';
    // Write the freed state + remove presence using sendBeacon so it survives unload.
    _beaconSetCampaign();
    _beaconDelete('dt-presence', MY_PRESENCE_ID);
  } catch(e){}
}
// Firestore REST beacon helpers (regular setDoc won't reliably finish during unload)
function _fbProjectUrl(path){
  return `https://firestore.googleapis.com/v1/projects/${FB_CONFIG.projectId}/databases/(default)/documents/${path}`;
}
function _beaconDelete(coll, id){
  // best-effort; presence also self-expires after 35s if this fails
  try { fetch(_fbProjectUrl(`${coll}/${id}`), { method:'DELETE', keepalive:true }); } catch(e){}
}
function _beaconSetCampaign(){
  try {
    const body = JSON.stringify({ fields: { data: { stringValue: JSON.stringify(state) } } });
    fetch(_fbProjectUrl(`campaigns/${DOC}`) + `?updateMask.fieldPaths=data`, {
      method:'PATCH', keepalive:true, headers:{'Content-Type':'application/json'}, body
    });
  } catch(e){}
}
function releaseMyCharacter(){
  // Used for explicit "release" actions while the page is alive (normal setDoc path).
  const mine = state.characters.find(c=>c.claimedBy===MY_PRESENCE_ID);
  if(!mine) return;
  mine.claimedBy = '';
  localStorage.removeItem('dt-my-idx');
  pushState(true); pushPresence(); render();
}
window.addEventListener('pagehide', releaseMyCharacterSync);
window.addEventListener('beforeunload', releaseMyCharacterSync);
// When the tab is hidden (switched away / about to close), flush pending edits — this is
// the most reliable save hook on mobile, where unload events often don't fire.
document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='hidden'){ if(_pushDebounce){ clearTimeout(_pushDebounce); _pushDebounce=null; } _beaconSetCampaign(); } });

// ================================================================
// RENDER ENGINE
// ================================================================
function render(){
  try{ renderCharacterTabs(); }catch(e){ console.error('tabs',e); }
  try{ renderHeader(); }catch(e){ console.error('header',e); }
  try{ renderMainFields(); }catch(e){ console.error('fields',e); }
  try{ renderStats(); }catch(e){ console.error('stats',e); }
  try{ renderStatusWindow(); }catch(e){ console.error('statusWindow',e); }
  try{ renderDamageTypes(); }catch(e){ console.error('damageTypes',e); }
  try{ renderQuestLog(); }catch(e){}
  try{ renderSkillsMatrix(); }catch(e){ console.error('skills',e); }
  try{ renderCalcPanel(); }catch(e){ console.error('calc',e); }
  try{ renderRankBadge(); }catch(e){}
  try{ renderRelationships(); }catch(e){}
  try{ renderWeapons(); }catch(e){}
  try{ renderInventory(); }catch(e){}

  try{ renderAbilities(); }catch(e){}
  try{ renderShop(); }catch(e){}


  try{ renderDeathSaves(); }catch(e){}
  try{ renderDmPanel(); }catch(e){ console.error('renderDmPanel error:', e); }
  try{ applyCharacterAccents(); }catch(e){}
  try{ renderIdentityBar(); }catch(e){}
  try{ applyManaDamage(); }catch(e){}
  try{ applyHeartbeat(); }catch(e){}
  try{ updateAmbient(); }catch(e){}
  try{ renderTabs(); }catch(e){}
  try{ pushPresence(); }catch(e){}
  if(spectator) disableAllInputs();
}

function renderTabs(){
  const c = getChar();
  document.querySelectorAll('.tab-btn[data-tab]').forEach(b=>{
    b.classList.toggle('active', b.dataset.tab===state.activeTab);
    // Add badges
    const old = b.querySelector('.tab-badge');
    if(old) old.remove();
    if(b.dataset.tab === 'cases'){
      const activeQuests = (state.cases||[]).filter(q=>q.status==='active').length;
      if(activeQuests > 0) b.insertAdjacentHTML('beforeend', `<span class="tab-badge">${activeQuests}</span>`);
    }
    if(b.dataset.tab === 'abilities' && c){
      const stones = (c.skillStones||[]).length;
      if(stones > 0) b.insertAdjacentHTML('beforeend', `<span class="tab-badge stones">${stones}</span>`);
    }
  });
  document.querySelectorAll('.tab-content[data-tab]').forEach(t=>t.classList.toggle('active', t.dataset.tab===state.activeTab));
  try {
    switch(state.activeTab){
      case 'profile':   renderMainFields(); renderStats(); renderDamageTypes(); renderCalcPanel(); renderDeathSaves(); renderRankBadge(); break;
      case 'status':    renderStatusWindow(); break;
      case 'skills':    renderSkillsMatrix(); break;
      case 'loadout':   renderWeapons(); renderInventory(); break;
      case 'relations': renderPartyOverview(); renderRelationships(); break;
      case 'notes': break;
      case 'cases':     renderQuestLog(); break;
      case 'abilities': renderAbilities(); renderSkillStones(); break;
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
    const cls = getClassDef(c.playerClass);
    const btn = document.createElement('button'); btn.type='button';
    btn.className = `character-tab${c.state==='reserve'?' reserve':''}${c.state==='dead'?' dead':''}${isSel?' active':''}${isOwn?' owned':''}`;
    btn.style.setProperty('--char-color', rk.color);
    const hpPct = c.hp.max>0?clamp(c.hp.current/c.hp.max*100,0,100):0;
    const mpPct = c.mana.max>0?clamp(c.mana.current/c.mana.max*100,0,100):0;
    const expPct = expNeededForNextLevel(c)>0?clamp(expIntoCurrentLevel(c)/expNeededForNextLevel(c)*100,0,100):0;
    const hpColor = hpPct>50?'#5a9a78':hpPct>25?'#c2a23a':'#d94f4f';
    btn.innerHTML = `
      <div class="ctab-top">
        <span class="ctab-rank" style="color:${rk.color}">${rk.id}</span>
        <span class="ctab-name">${esc(c.name||`Player ${i+1}`)}</span>
        ${isOwn?'<span class="ctab-badge you">YOU</span>':taken?'<span class="ctab-badge taken">●</span>':''}
      </div>
      <div class="ctab-info">
        <span class="ctab-class">${cls ? `${cls.icon}` : '—'}</span>
        <span class="ctab-lvl">Lv.${c.systemLevel||1}</span>
      </div>
      <div class="ctab-bars">
        <div class="ctab-bar hp"><div class="ctab-bar-fill" style="width:${hpPct}%;background:${hpColor}"></div></div>
        <div class="ctab-bar mp"><div class="ctab-bar-fill" style="width:${mpPct}%;background:#4a8bf5"></div></div>
        <div class="ctab-bar exp"><div class="ctab-bar-fill" style="width:${expPct}%;background:#4ade80"></div></div>
      </div>`;
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
  const cls = getClassDef(c.playerClass);
  s('topPlayerName', c.name||'—');
  s('topPlayerRole', cls ? `${cls.icon} ${cls.label}` : 'No Class');
  s('topRank', `${rk.title} · Sys.Lv.${c.systemLevel||1}`);
  s('topGold', fmtGold(c.points));
  s('topHpMini', `${c.hp.current} / ${c.hp.max}`);
  s('topManaMini', `${c.mana.current} / ${c.mana.max}`);
  s('topArmorMini', c.armor);
  try { renderDmTargetPicker(); } catch(e){}
  const hpPct = c.hp.max>0?(c.hp.current/c.hp.max)*100:0;
  const sPct  = c.mana.max>0?(c.mana.current/c.mana.max)*100:0;
  const hb=el('topHpBar'); if(hb) hb.style.width=clamp(hpPct,0,100)+'%';
  const sb=el('topManaBar'); if(sb) sb.style.width=clamp(sPct,0,100)+'%';
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
  // Skip if user is actively typing in one of our fields
  const ae = document.activeElement;
  const isTypingHere = ae && ae.closest && ae.closest('.profile-grid');
  const sv = (id,v)=>{ const e=el(id); if(e && document.activeElement!==e) e.value=(v==null?'':v); };
  sv('charName',c.name); sv('charCodename',c.title || c.codename);
  sv('charAge',c.age); sv('charLevel',c.level);
  sv('charBackground',c.background);
  sv('charSpeed',c.speed); sv('charArmor',c.armor); sv('charTempHp',c.tempHp);
  sv('currentHp',c.hp.current); sv('maxHp',c.hp.max);
  sv('currentMana',c.mana.current); sv('maxMana',c.mana.max);
  // Show suggested HP/MP based on class + CON/INT
  const sugHp = el('suggestedHp');
  if(sugHp) sugHp.textContent = `Suggested: ${calcSuggestedMaxHp(c)}`;
  const sugMp = el('suggestedMp');
  if(sugMp) sugMp.textContent = `Suggested: ${calcSuggestedMaxMana(c)}`;
  const initDisp = el('initiativeDisplay'); if(initDisp) initDisp.value = fmtMod(calcInitiative(c));
  const pp = el('passivePerc'); if(pp) pp.textContent = passivePerception(c);
  // portrait
  const slot = el('portraitSlot');
  if(slot){
    if(c.portrait) slot.style.setProperty('--portrait-url', `url("${c.portrait}")`);
    else slot.style.removeProperty('--portrait-url');
    slot.classList.toggle('has-img', !!c.portrait);
  }
  // Notes textarea
  const notes = el('notesArea');
  if(notes && document.activeElement !== notes) notes.value = c.notesText || '';

  // Class display — read-only, DM assigns at system level 10
  const classDisplay = el('charClassDisplay');
  if(classDisplay){
    const cls = getClassDef(c.playerClass);
    const sysLvl = Number(c.systemLevel) || 1;
    if(cls){
      classDisplay.value = `${cls.icon} ${cls.label}`;
      classDisplay.style.color = cls.color;
    } else {
      classDisplay.value = sysLvl >= 10 ? 'Awaiting assignment (DM)' : `Unlocks at Sys.Lv.10 (currently ${sysLvl})`;
      classDisplay.style.color = '';
    }
  }
  // Rank dropdown
  const rkSel = el('charClearance'); if(rkSel && document.activeElement!==rkSel) rkSel.value = c.rank;
  // state radios
  ['Active','Reserve','Dead'].forEach(st=>{
    const r = el('state'+st); if(r) r.checked = c.state===st.toLowerCase();
  });
}

// ── DAMAGE TYPES — click to cycle: none → resist → vulnerable → immune ──
function renderDamageTypes(){
  const c = getChar();
  const host = el('damageTypesGrid'); if(!host) return;

  host.innerHTML = DAMAGE_TYPES.map(t => {
    let stateCls = 'none';
    if ((c.immunities||[]).includes(t.id))          stateCls = 'imm';
    else if ((c.resistances||[]).includes(t.id))    stateCls = 'res';
    else if ((c.vulnerabilities||[]).includes(t.id)) stateCls = 'vuln';
    return `<button type="button" class="dt-cell dt-${stateCls}" data-dt="${t.id}"
      data-tt="${esc(t.desc)} · Click to cycle: neutral → resist → vulnerable → immune → neutral">
      <span class="dt-icon">${t.icon}</span>
      <span class="dt-name">${t.label}</span>
      <span class="dt-badge">${stateCls==='res'?'RES':stateCls==='vuln'?'VUL':stateCls==='imm'?'IMM':''}</span>
    </button>`;
  }).join('');

  host.querySelectorAll('[data-dt]').forEach(btn => btn.addEventListener('click', () => {
    const id = btn.dataset.dt;
    let cur = 'none';
    if ((c.immunities||[]).includes(id))          cur = 'imm';
    else if ((c.resistances||[]).includes(id))    cur = 'res';
    else if ((c.vulnerabilities||[]).includes(id)) cur = 'vuln';
    c.resistances     = (c.resistances||[]).filter(x => x !== id);
    c.vulnerabilities = (c.vulnerabilities||[]).filter(x => x !== id);
    c.immunities      = (c.immunities||[]).filter(x => x !== id);
    const next = { none:'res', res:'vuln', vuln:'imm', imm:'none' }[cur];
    if (next === 'res')  c.resistances.push(id);
    if (next === 'vuln') c.vulnerabilities.push(id);
    if (next === 'imm')  c.immunities.push(id);
    pushState(true); renderDamageTypes();
  }));
}

// ── STATS ──
function renderStats(){
  const c = getChar();
  const grid = el('statsGrid'); if(!grid) return;
  grid.innerHTML = STATS.map(st=>{
    const base = Number(c.stats[st]) || 8;
    const sysKey = st.toLowerCase();
    const sysBonus = Number(c.systemStats?.[sysKey]) || 0;
    const cls = getClassDef(c.playerClass);
    const classBonus = Number(cls?.bonuses?.[st]) || 0;
    const effective = base + sysBonus + classBonus;
    const m = mod(effective);
    const modPos = m > 0;
    const modZero = m === 0;
    const bonusParts = [];
    if(sysBonus) bonusParts.push(`+${sysBonus} sys`);
    if(classBonus) bonusParts.push(`+${classBonus} class`);
    return `
    <div class="stat-block ${modPos?'positive':''} ${modZero?'neutral':''}">
      <div class="stat-header">
        <span class="stat-key">${st}</span>
        <span class="stat-sub">${STAT_LABELS[st]}</span>
      </div>
      <div class="stat-mod-display">
        <span class="stat-mod-sign">${modPos?'+':m<0?'−':'±'}</span>
        <span class="stat-mod-val">${Math.abs(m)}</span>
      </div>
      <div class="stat-score-row">
        <button class="stat-adj minus" data-stat="${st}" data-action="minus" title="Decrease base">−</button>
        <input class="stat-score" id="stat_${st}" type="number" value="${base}" data-stat="${st}" aria-label="${st} base score">
        <button class="stat-adj plus" data-stat="${st}" data-action="plus" title="Increase base">+</button>
      </div>
      ${bonusParts.length ? `<div class="stat-sys-bonus">${bonusParts.join(' ')}</div>` : ''}
      <div class="stat-effective">= ${effective}</div>
      <div class="stat-corner tl"></div>
      <div class="stat-corner br"></div>
    </div>`;
  }).join('');
  // Base creation points remaining
  const bpr = basePointsRemaining(c);
  const bprEl = el('basePointsRemaining');
  if (bprEl) bprEl.textContent = `${bpr} / ${totalBasePoints(c)}`;

  grid.querySelectorAll('.stat-score').forEach(inp=>{
    inp.addEventListener('input', e=>{
      const newVal = Number(e.target.value) || 8;
      c.stats[e.target.dataset.stat] = newVal;
      pushState(); renderStats(); renderSkillsMatrix(); renderCalcPanel(); renderHeader();
      renderStatusWindow();
    });
  });
  grid.querySelectorAll('.stat-adj').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const st=btn.dataset.stat;
      const dir = btn.dataset.action==='plus' ? 1 : -1;
      // If increasing, check base point budget
      if (dir > 0 && basePointsRemaining(c) <= 0) return;
      const newVal = (Number(c.stats[st])||8) + dir;
      if (newVal < 1) return;
      c.stats[st] = newVal;
      pushState(); renderStats(); renderSkillsMatrix(); renderCalcPanel(); renderHeader();
      renderStatusWindow();
    });
  });
}

// ═════════════════════════════════════════════════════════════════
// STATUS WINDOW — Solo Leveling system panel
// Shows the character's System Stats with point allocation,
// HP/MP bars, class, title, fatigue, and remaining points.
// ═════════════════════════════════════════════════════════════════
function renderStatusWindow(){
  const host = el('statusWindow'); if(!host) return;
  const c = getChar();
  if(!c || !c.stats) { host.innerHTML = '<div class="empty-note">No character selected.</div>'; return; }
  const cls = getClassDef(c.playerClass);
  const rank = RANK_BY_ID[c.rank] || RANKS[0];
  const remaining = systemPointsRemaining(c);
  const total = systemPointsTotal(c);
  const spent = systemPointsSpent(c);
  const hpPct = c.hp.max > 0 ? (c.hp.current / c.hp.max * 100) : 0;
  const mpPct = c.mana.max > 0 ? (c.mana.current / c.mana.max * 100) : 0;
  const lvl = Number(c.level) || 1;
  const sysLvl = Number(c.systemLevel) || 1;
  const classLabel = cls ? `<span style="color:${cls.color}">${cls.icon} ${cls.label}</span>` : (sysLvl >= 10 ? '<span style="color:var(--amber)">Awaiting Class</span>' : '<span style="color:var(--text-dim)">Locked (Sys.Lv.10)</span>');

  // EXP bar calculations
  const expCurrent = expIntoCurrentLevel(c);
  const expNeeded = expNeededForNextLevel(c);
  const expPct = expNeeded > 0 ? Math.min(100, (expCurrent / expNeeded) * 100) : 0;

  try {
  host.innerHTML = `
    <div class="sw-ornament tl"></div>
    <div class="sw-ornament tr"></div>
    <div class="sw-ornament bl"></div>
    <div class="sw-ornament br"></div>
    <div class="sw-crest"></div>
    <h2 class="sw-title">STATUS</h2>

    <div class="sw-info-grid">
      <div class="sw-info-row">
        <span class="sw-label">NAME:</span>
        <span class="sw-value">${esc(c.name || '—')}</span>
        <span class="sw-label">LEVEL:</span>
        <span class="sw-value">${sysLvl}</span>
      </div>
      <div class="sw-info-row">
        <span class="sw-label">JOB:</span>
        <span class="sw-value">${classLabel}</span>
        <span class="sw-label">DND LV:</span>
        <span class="sw-value">${lvl}</span>
      </div>
      <div class="sw-info-row">
        <span class="sw-label">TITLE:</span>
        <span class="sw-value">${esc(c.title || 'None')}</span>
        <span class="sw-label">FATIGUE:</span>
        <span class="sw-value">${c.fatigue || 0}</span>
      </div>
    </div>

    <div class="sw-bars">
      <div class="sw-bar-group">
        <span class="sw-bar-label">HP:</span>
        <span class="sw-bar-nums">${c.hp.current} / ${c.hp.max}</span>
        <div class="sw-bar hp"><div class="sw-bar-fill" style="width:${hpPct}%"></div></div>
      </div>
      <div class="sw-bar-group">
        <span class="sw-bar-label">MP:</span>
        <span class="sw-bar-nums">${c.mana.current} / ${c.mana.max}</span>
        <div class="sw-bar mp"><div class="sw-bar-fill" style="width:${mpPct}%"></div></div>
      </div>
      <div class="sw-bar-group">
        <span class="sw-bar-label">EXP:</span>
        <span class="sw-bar-nums">${fmtGold(expCurrent)} / ${fmtGold(expNeeded)}</span>
        <div class="sw-bar exp"><div class="sw-bar-fill" style="width:${expPct}%"></div></div>
      </div>
    </div>

    <div class="sw-divider"><span class="sw-diamond">◆</span></div>

    <div class="sw-sys-stats">
      ${Object.entries(SYSTEM_STAT_LABELS).map(([key, label]) => {
        const val = Number(c.systemStats?.[key]) || 0;
        const canAdd = remaining > 0;
        const hpTag = key === 'con' ? `<span class="sw-sys-tag hp-tag">+4 HP/pt</span>` : '';
        const mpTag = key === 'int' ? `<span class="sw-sys-tag mp-tag">+4 MP/pt</span>` : '';
        return `
        <div class="sw-sys-row">
          <span class="sw-sys-label">${label.toUpperCase()}:${hpTag}${mpTag}</span>
          <span class="sw-sys-value">${val}</span>
          <div class="sw-sys-adj">
            <button class="sw-sys-btn plus" data-sysstat="${key}" ${canAdd?'':'disabled'} title="+1 ${label}${key==='con'?' (+4 HP)':''}${key==='int'?' (+4 MP)':''}">▲</button>
            <button class="sw-sys-btn minus" data-sysstat="${key}" ${val<=0?'disabled':''} title="-1 ${label}">▼</button>
          </div>
        </div>`;
      }).join('')}
    </div>

    <div class="sw-divider"><span class="sw-diamond">◆</span></div>

    <div class="sw-remaining">
      <span class="sw-remaining-label">REMAINING POINTS:</span>
      <span class="sw-remaining-value ${remaining>0?'has-points':''}">${remaining}</span>
      <span class="sw-remaining-sub">(${spent} / ${total} used)</span>
    </div>

    <div class="sw-divider"><span class="sw-diamond">◆</span></div>

    <div class="sw-dnd-info">
      <div class="sw-dnd-row">
        <span class="sw-label">PROF. BONUS:</span>
        <span class="sw-value" style="color:var(--accent)">+${profBonus(c)}</span>
        <span class="sw-label">BASE STAT PTS:</span>
        <span class="sw-value">${totalBasePoints(c)} (${basePointsRemaining(c)} left)</span>
      </div>
      <div class="sw-dnd-row">
        <span class="sw-label">NEXT DND LV:</span>
        <span class="sw-value">${lvl < 20 ? `Lv.${(lvl)*10+1} (${(lvl)*10+1 - sysLvl} sys.levels away)` : 'MAX LEVEL'}</span>
      </div>
    </div>
    ${cls ? `<div class="sw-class-bonuses">${Object.entries(cls.bonuses||{}).filter(([,v])=>v>0).map(([k,v])=>`<span class="sw-class-bonus-tag">+${v} ${k}</span>`).join('')}</div>` : ''}
    ${systemPointsRemaining(c) > 0 ? `<div class="sw-milestone">▲ ${systemPointsRemaining(c)} SYSTEM POINTS AVAILABLE — ALLOCATE ABOVE ▲</div>` : ''}
  `;
  } catch(err) {
    console.error('renderStatusWindow error:', err);
    host.innerHTML = `<div style="position:relative;z-index:5;color:#ff6b6b;padding:2rem;font-family:monospace;font-size:.8rem">
      <strong>Status Window Error</strong><br>${err.message}<br><pre>${err.stack}</pre>
    </div>`;
    return;
  }

  // Wire system stat +/- buttons
  host.querySelectorAll('.sw-sys-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.sysstat;
      const dir = btn.classList.contains('plus') ? 1 : -1;
      if (dir > 0 && systemPointsRemaining(c) <= 0) return;
      const newVal = (Number(c.systemStats[key]) || 0) + dir;
      if (newVal < 0) return;
      c.systemStats[key] = newVal;

      // System stat → HP/MP scaling
      // Every point in Vitality (CON) = +4 Max HP
      // Every point in Intelligence (INT) = +4 Max MP
      if (key === 'con') {
        c.hp.max = Math.max(0, (c.hp.max || 0) + (dir * 4));
        c.hp.current = Math.min(c.hp.current, c.hp.max);
      }
      if (key === 'int') {
        c.mana.max = Math.max(0, (c.mana.max || 0) + (dir * 4));
        c.mana.current = Math.min(c.mana.current, c.mana.max);
      }

      pushState(true);
      renderStatusWindow();
      renderStats();
      renderSkillsMatrix();
      renderCalcPanel();
      renderHeader();
      renderMainFields();
    });
  });
}

// ── SKILLS MATRIX — grouped by stat, tooltip on hover ──
function renderSkillsMatrix(){
  const c = getChar();
  const host = el('skillsMatrix'); if(!host) return;

  // Group skills by their governing stat
  const groups = {};
  SKILL_DEFS.forEach(def => {
    if (!groups[def.stat]) groups[def.stat] = [];
    groups[def.stat].push(def);
  });

  // Preserve stat order (STR → CHA)
  const statOrder = ['STR','DEX','CON','INT','WIS','CHA'];

  host.innerHTML = statOrder.map(stat => {
    const skills = groups[stat] || [];
    const statMod = mod(c.stats[stat] || 10);
    // Sort: save first, then everything else in declaration order
    const sorted = skills.slice().sort((a, b) => (b.isSave?1:0) - (a.isSave?1:0));

    return `
    <div class="skill-group" data-stat="${stat}">
      <div class="skill-group-head">
        <span class="sgh-stat" data-tt="Governs the skills below. Modifier is added to every roll in this group.">${stat}</span>
        <span class="sgh-name">${esc(STAT_FULL[stat] || stat)}</span>
        <span class="sgh-mod ${statMod>=0?'pos':'neg'}">${fmtMod(statMod)}</span>
      </div>
      <div class="skill-group-body">
        ${sorted.map(def => {
          const sk = c.skills[def.name] || {prof:false,expert:false,misc:0};
          const total = skillTotal(c, def.name);
          const isSense = def.name === 'Mana Sense';
          const desc = SKILL_DESCS[def.name] || '';
          return `
          <div class="skill-row${def.isSave?' save-row':''}${isSense?' sense-row':''}"
               data-skill="${esc(def.name)}"
               data-tt="${esc(desc)}">
            <div class="skill-prof">
              <button class="prof-dot ${sk.prof?'on':''}" data-skill="${esc(def.name)}" data-kind="prof" data-tt="Trained — proficient in this skill (+ prof bonus)"></button>
              <button class="prof-dot expert ${sk.expert?'on':''}" data-skill="${esc(def.name)}" data-kind="expert" data-tt="Specialist — expertise in this skill (×2 prof bonus)"></button>
            </div>
            <div class="skill-name">${esc(def.name)}${isSense?' <span class="sense-tag" data-tt="Mana perception — sense magical energies and hidden enchantments">◈</span>':''}</div>
            <div class="skill-total">${fmtMod(total)}</div>
          </div>`;
        }).join('')}
      </div>
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
      <div class="calc-cell"><span class="calc-k">Mana Sense</span><span class="calc-v">${fmtMod(skillTotal(c,'Mana Sense'))}</span></div>
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
  const tv = el('inventoryValue'); if(tv) tv.textContent = fmtGold(totalVal);
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
      <div class="inv-val"><input class="inv-value" data-i="${i}" type="number" value="${it.value??''}" placeholder="0"><span>gold</span></div>
      ${canEdit()? `<button class="inv-sell" data-i="${i}" title="Sell to DT Inc.">SELL</button>`:''}
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
  const value = Math.max(0, Number(el('invVal')?.value)||0);
  const category = el('invCat')?.value || 'Misc';
  if(!name) return;
  if(!Array.isArray(c.inventory)) c.inventory=[];
  c.inventory.push({name, qty, category, value});
  el('invAddName').value=''; el('invAddQty').value='1'; if(el('invVal')) el('invVal').value='0';
  pushState(true); renderInventory();
  el('invAddName')?.focus();
}
function sellItem(i){
  const c=getChar(); const it=c.inventory[i]; if(!it) return;
  const unit = Number(it.value)||0;
  const refund = Math.floor(unit*0.5); // sell at 50%
  if(!confirm(`Sell 1× ${it.name} to the Shop for ${fmtGold(refund)} gold?`)) return;
  c.points = (Number(c.points)||0) + refund;
  it.qty = (Number(it.qty)||1) - 1;
  if(it.qty<=0) c.inventory.splice(i,1);
  pushState(true); renderInventory(); renderHeader();
  showToast(`Sold ${it.name} · +${fmtGold(refund)} gold`,'sell');
}

// ================================================================
// SHOP (DM-managed catalog; players buy with points)
// ================================================================
function renderShop(){
  const c = getChar();
  const host = el('shopList'); if(!host) return;
  const bal = el('shopBalance'); if(bal) bal.textContent = fmtGold(c.points);
  const myTier = RANK_TO_TIER[c.rank] || 1;
  const notice = el('shopNotice');
  if(notice) notice.innerHTML = `Your rank: <strong style="color:${TIER_COLOR[myTier]}">${TIER_LABEL[myTier]}</strong>`;

  if(!Array.isArray(state.shop) || !state.shop.length){
    host.innerHTML = `<div class="empty-note">The shop is empty.${dmUnlocked?' Open the GM Console and press <b>Load Default Shop Catalog</b> to stock it.':' The GM stocks it from the GM Console.'}</div>`;
    el('shopFilter') && (el('shopFilter').innerHTML = '');
    return;
  }

  const accessible = state.shop
    .map((item,i)=>({item,i}))
    .filter(({item})=> (Number(item.tier)||1) <= myTier);

  if(!accessible.length){
    host.innerHTML = `<div class="empty-note">No items available at your rank.</div>`;
    el('shopFilter') && (el('shopFilter').innerHTML = '');
    return;
  }

  // Category filter buttons
  const cats = [...new Set(accessible.map(({item})=> item.category||'Misc'))];
  const filterHost = el('shopFilter');
  if(filterHost){
    filterHost.innerHTML = `<button class="shop-filter-btn active" data-cat="all">All</button>` +
      cats.map(cat => `<button class="shop-filter-btn" data-cat="${esc(cat)}">${esc(cat)}</button>`).join('');
    filterHost.querySelectorAll('.shop-filter-btn').forEach(btn => {
      btn.addEventListener('click', ()=>{
        filterHost.querySelectorAll('.shop-filter-btn').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        const cat = btn.dataset.cat;
        host.querySelectorAll('.shop-cat-group').forEach(g => {
          g.style.display = (cat==='all' || g.dataset.cat===cat) ? '' : 'none';
        });
      });
    });
  }

  host.innerHTML = cats.map(cat=>{
    const rows = accessible.filter(({item})=> (item.category||'Misc')===cat)
      .sort((a,b)=> (Number(a.item.tier)||1)-(Number(b.item.tier)||1) || (Number(a.item.price)||0)-(Number(b.item.price)||0));
    return `
    <div class="shop-cat-group" data-cat="${esc(cat)}">
      <div class="shop-cat-header">${esc(cat)}<span class="shop-cat-count">${rows.length}</span></div>
      ${rows.map(({item,i})=>{
        const price = Number(item.price)||0;
        const afford = (Number(c.points)||0) >= price;
        const out = item.stock!=null && item.stock<=0;
        const tier = Number(item.tier)||1;
        const rarity = item.rarity || 'common';
        const rarCol = RARITY_COLORS[rarity] || RARITY_COLORS.common;
        return `
        <div class="shop-item ${out?'out':''}" style="--rarity-c:${rarCol}">
          <div class="shop-item-icon">${esc(item.icon||'◆')}</div>
          <div class="shop-item-main">
            <div class="shop-item-name">${esc(item.name||'Item')}</div>
            <div class="shop-item-tags">
              <span class="shop-rarity-tag" style="color:${rarCol};border-color:${rarCol}">${rarity.toUpperCase()}</span>
              ${item.stats?`<span class="shop-stats-tag">${esc(item.stats)}</span>`:''}
            </div>
            ${item.desc?`<div class="shop-item-desc">${esc(item.desc)}</div>`:''}
          </div>
          <div class="shop-item-buy">
            <div class="shop-price">${fmtGold(price)}</div>
            ${canEdit()&&!out? `<button class="shop-buy-btn ${afford?'':'cant'}" data-i="${i}">${afford?'BUY':'—'}</button>` : (out?'<span class="shop-out-tag">SOLD</span>':'')}
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
  if((Number(c.points)||0) < price){ showToast('Insufficient gold','warn'); return; }
  if(item.stock!=null && item.stock<=0){ showToast('Sold out','warn'); return; }
  if(!confirm(`Buy ${item.name} for ${fmtGold(price)} gold?`)) return;
  c.points -= price;
  if(item.stock!=null) item.stock -= 1;
  if(!Array.isArray(c.inventory)) c.inventory=[];
  const existing = c.inventory.find(x=> x.name===item.name);
  if(existing) existing.qty = (Number(existing.qty)||1)+1;
  else c.inventory.push({ name:item.name, qty:1, category:mapShopCatToInv(item.category), value:Math.floor(price*0.5), notes:item.desc||'' });
  pushState(true); renderShop(); renderInventory(); renderHeader();
  showToast(`Acquired ${item.name}`,'buy');
}
// map a shop category to an inventory category bucket
function mapShopCatToInv(cat){
  switch(cat){
    case 'Combat': return 'Weapon';
    case 'Protection': return 'Armor';
    case 'Anomalous Items': return 'Anomalous';
    case 'Medical': case 'Warding & Barriers': return 'Consumable';
    case 'Skill Stones': case 'Loot Boxes': return 'Misc';
    default: return 'Misc';
  }
}

// ================================================================
// ITEM REQUESTS — players ask for items not in the catalog
// ================================================================
// Player-side: see your own requests + their status
// DM-side: review queue
function renderDmRequests(){
  const host = el('dmRequestsList'); if(!host) return;
  const reqs = (state.requests||[]).filter(r=>r.status==='pending');
  const badge = el('reqBadge');
  if(badge){ badge.textContent = reqs.length||''; badge.style.display = reqs.length?'inline-flex':'none'; }
  if(!reqs.length){ host.innerHTML = `<div class="empty-note">No pending requests.</div>`; return; }
  host.innerHTML = reqs.slice().reverse().map(r=>`
    <div class="dm-req-card" data-id="${r.id}">
      <div class="dm-req-head">
        <span class="dm-req-item">${esc(r.item)}</span>
        <span class="dm-req-by">— ${esc(r.by)}</span>
      </div>
      ${r.note?`<div class="dm-req-note">"${esc(r.note)}"</div>`:''}
      <div class="dm-req-controls">
        <input class="dm-req-price" data-id="${r.id}" type="number" min="0" placeholder="Price" value="100">
        <select class="dm-req-tier" data-id="${r.id}">${[1,2,3,4].map(t=>`<option value="${t}">T${t}</option>`).join('')}</select>
        <select class="dm-req-cat" data-id="${r.id}">${SHOP_CATEGORIES.map(cat=>`<option>${cat}</option>`).join('')}</select>
        <button class="dm-req-approve" data-id="${r.id}">✓ Stock & Approve</button>
        <button class="dm-req-deny" data-id="${r.id}">✕ Deny</button>
      </div>
    </div>`).join('');
  host.querySelectorAll('.dm-req-approve').forEach(b=> b.addEventListener('click', ()=> approveRequest(b.dataset.id)));
  host.querySelectorAll('.dm-req-deny').forEach(b=> b.addEventListener('click', ()=> denyRequest(b.dataset.id)));
}
function approveRequest(id){
  if(!dmUnlocked) return;
  const r = (state.requests||[]).find(x=>x.id===id); if(!r) return;
  const card = document.querySelector(`.dm-req-card[data-id="${id}"]`);
  const price = Math.max(0, Number(card?.querySelector('.dm-req-price')?.value)||0);
  const tier = Number(card?.querySelector('.dm-req-tier')?.value)||1;
  const category = card?.querySelector('.dm-req-cat')?.value || 'Utility';
  if(!Array.isArray(state.shop)) state.shop=[];
  state.shop.push({ tier, name:r.item, category, price, stock:null, desc:r.note||'' });
  r.status = 'approved';
  pushState(true); render();
  SFX?.buy?.();
  showToast(`Stocked "${r.item}" · ${fmtGold(price)} gold`,'buy');
}
function denyRequest(id){
  if(!dmUnlocked) return;
  const r = (state.requests||[]).find(x=>x.id===id); if(!r) return;
  r.status = 'denied';
  pushState(true); render();
  showToast(`Denied request: ${r.item}`,'warn');
}
function clearResolvedRequests(){
  if(!dmUnlocked) return;
  state.requests = (state.requests||[]).filter(r=>r.status==='pending');
  pushState(true); render();
  showToast('Cleared resolved requests','info');
}

// ================================================================
// RELATIONSHIPS
// ================================================================
const REL_TYPES = ['Handler','Colleague','Asset','Rival','Threat','Superior','Subordinate','Contact','Unknown'];
function renderPartyOverview(){
  const host = el('partyOverview'); if(!host) return;
  const active = state.characters.filter(c=>c.state==='active');
  if(!active.length){ host.innerHTML='<div class="dm-empty">No active party members.</div>'; return; }
  host.innerHTML = active.map(c=>{
    const rk = rankOf(c);
    const cls = getClassDef(c.playerClass);
    const hpPct = c.hp.max>0?clamp(c.hp.current/c.hp.max*100,0,100):0;
    const mpPct = c.mana.max>0?clamp(c.mana.current/c.mana.max*100,0,100):0;
    const hpColor = hpPct>50?'#4ade80':hpPct>25?'#e8a72c':'#d94f4f';
    return `
    <div class="po-card">
      <div class="po-head">
        <span class="po-rank" style="color:${rk.color}">${rk.id}</span>
        <span class="po-name">${esc(c.name||'Unknown')}</span>
        <span class="po-class">${cls?`${cls.icon} ${cls.label}`:'No Class'}</span>
        <span class="po-level">Lv.${c.systemLevel||1}</span>
      </div>
      <div class="po-bars">
        <div class="po-bar-row"><span class="po-bar-label" style="color:${hpColor}">HP</span><div class="po-bar-track"><div class="po-bar-fill" style="width:${hpPct}%;background:${hpColor}"></div></div><span class="po-bar-val">${c.hp.current}/${c.hp.max}</span></div>
        <div class="po-bar-row"><span class="po-bar-label" style="color:#4a8bf5">MP</span><div class="po-bar-track"><div class="po-bar-fill" style="width:${mpPct}%;background:#4a8bf5"></div></div><span class="po-bar-val">${c.mana.current}/${c.mana.max}</span></div>
      </div>
      <div class="po-stats">${['STR','DEX','CON','INT','WIS','CHA'].map(s=>`<span class="po-stat">${s} ${effectiveStat(c,s)}</span>`).join('')}</div>
    </div>`;
  }).join('');
}

function renderRelationships(){
  const c = getChar();
  const host = el('relationshipsList'); if(!host) return;
  if(!Array.isArray(c.relationships)) c.relationships=[];
  if(!c.relationships.length){ host.innerHTML = `<div class="empty-note">No party contacts recorded.</div>`; return; }
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
// MONSTER LOG (Tower bestiary)
// ================================================================
// ── ANOMALY LOG (player view) ──
// Player sees TWO sections:
//   1. FILED — anomalies granted to their character (view-only)
//   2. AVAILABLE — catalog entries NOT yet granted, each with a purchase
//      button that costs HALF the threat grade's bounty in Points.
// Legacy no-op — creation is now DM-only via the catalog manager
// ================================================================
// ABILITIES / TALENTS
// ================================================================
const TALENT_TYPES = ['Active','Passive','Combat','Utility','Ultimate','Ritual'];
function renderAbilities(){
  const c = getChar();
  const host = el('abilitiesList'); if(!host) return;
  if(!Array.isArray(c.abilities)) c.abilities=[];
  const cnt = el('talentCount'); if(cnt) cnt.textContent = `${c.abilities.length} LEARNED`;
  if(!c.abilities.length){
    host.innerHTML = `<div class="empty-note big">✶<br>NO SKILLS LEARNED<br><span>Gain skills by receiving a class at Level 10 or by absorbing Skill Stones.</span></div>`;
    return;
  }
  host.innerHTML = c.abilities.map((a,i)=>{
    const type = a.type||'Active';
    return `
    <div class="talent-card type-${type.toLowerCase()}">
      <div class="talent-head">
        <span class="talent-type-badge">${esc(type)}</span>
        <input class="ab-name" data-i="${i}" value="${esc(a.name||'')}" placeholder="Skill name">
        <button class="ab-del" data-i="${i}" title="Remove">✕</button>
      </div>
      <div class="talent-meta">
        <label><span>Type</span>
          <select class="ab-type" data-i="${i}">${TALENT_TYPES.map(t=>`<option ${a.type===t?'selected':''}>${t}</option>`).join('')}</select>
        </label>
        <label><span>Cost</span><input class="ab-cost" data-i="${i}" value="${esc(a.cost||'')}" placeholder="e.g. 30 MP"></label>
        <label><span>Cooldown</span><input class="ab-cooldown" data-i="${i}" value="${esc(a.cooldown||'')}" placeholder="e.g. 3 rounds"></label>
      </div>
      <textarea class="ab-desc" data-i="${i}" placeholder="What it does, how it works…">${esc(a.desc||'')}</textarea>
    </div>`;
  }).join('');
  // text fields: live-update state on input, FLUSH to server on blur (prevents data loss on leave)
  const wire = (sel,key)=> host.querySelectorAll(sel).forEach(inp=>{
    inp.addEventListener('input',()=>{ c.abilities[+inp.dataset.i][key]=inp.value; pushState(); });
    inp.addEventListener('blur', flushPendingPush);
  });
  wire('.ab-name','name'); wire('.ab-cost','cost'); wire('.ab-cooldown','cooldown'); wire('.ab-desc','desc');
  host.querySelectorAll('.ab-type').forEach(s=> s.addEventListener('change',()=>{ c.abilities[+s.dataset.i].type=s.value; pushState(true); renderAbilities(); }));
  host.querySelectorAll('.ab-del').forEach(b=> b.addEventListener('click',()=>{ if(confirm('Remove this talent?')){ c.abilities.splice(+b.dataset.i,1); pushState(true); renderAbilities(); } }));
}
function addAbility(){ const c=getChar(); if(!Array.isArray(c.abilities))c.abilities=[]; c.abilities.push({name:'',type:'Talent',cost:'',cooldown:'',desc:''}); pushState(true); renderAbilities(); }

// ================================================================
// DM PANEL
// ================================================================
// Target picker in the DM console header — shows every character,
// active selection glows, click switches the DM's focus.
function renderDmTargetPicker(){
  const sel = el('dmTargetPicker'); if(!sel) return;
  const cur = state.selectedCharacter;
  sel.innerHTML = state.characters.map((c,i) => {
    const rk = rankOf(c);
    const st = c.state === 'dead' ? ' · Dead' : c.state === 'reserve' ? ' · Reserve' : '';
    return `<option value="${i}" ${i===cur?'selected':''}>${esc(c.name || `Player ${i+1}`)} — ${rk.id}${st}</option>`;
  }).join('');
  // Rebind handler each call — sel.onchange doesn't stack
  sel.onchange = e => {
    state.selectedCharacter = Number(e.target.value) || 0;
    pushState(true);
    render();
  };
}

// Focus guard: don't re-render the DM roster while the DM is typing in it.
// This prevents Firebase snapshots from yanking focus out of input fields.
let _dmFocused = false;

function renderDmPanel(){
  if(!dmUnlocked) return;
  if(_dmFocused) return;
  const roster = el('dmRoster');
  if(!roster){ console.warn('renderDmPanel: dmRoster not found'); return; }
  const chars = state.characters;
  if(!chars || !chars.length){ roster.innerHTML = '<div class="dm-empty">No characters. Click + Player to add one.</div>'; return; }
  if(roster){
    roster.innerHTML = state.characters.map((c,i)=>{
      const rk = rankOf(c);
      const st = c.state||'active';
      return `
      <div class="dm-agent state-${st} ${i===state.selectedCharacter?'sel':''}">
        <div class="dm-agent-top">
          <button class="dm-agent-pick" data-i="${i}">${esc(c.name||`Player ${i+1}`)}</button>
          <span class="dm-agent-rank" style="color:${rk.color}">${rk.tier} · ${rk.title}</span>
          <span class="dm-agent-state-tag ${st}">${st==='active'?'ACTIVE':st==='reserve'?'RESERVE':'DEAD'}</span>
        </div>
        <div class="dm-agent-controls">
          <label class="dm-mini"><span>Rank</span>
            <select class="dm-rank" data-i="${i}">${RANKS.map(r=>`<option value="${r.id}" ${c.rank===r.id?'selected':''}>${r.id} · ${r.title}</option>`).join('')}</select>
          </label>
          <label class="dm-mini"><span>Class ${(Number(c.systemLevel)||1)<10?'(Sys.10)':''}</span>
            <select class="dm-class" data-i="${i}" ${(Number(c.systemLevel)||1)<10?'disabled':''}>
              <option value="none" ${c.playerClass==='none'?'selected':''}>— No Class —</option>
              <optgroup label="Base Classes">
                ${PLAYER_CLASSES.filter(pc=>!pc.hidden).map(pc=>`<option value="${pc.id}" ${c.playerClass===pc.id?'selected':''}>${pc.icon} ${pc.label}</option>`).join('')}
              </optgroup>
              <optgroup label="★ Advanced Classes">
                ${PLAYER_CLASSES.filter(pc=>pc.hidden).map(pc=>`<option value="${pc.id}" ${c.playerClass===pc.id?'selected':''}>${pc.icon} ${pc.label}</option>`).join('')}
              </optgroup>
              ${(state.customClasses||[]).length ? `<optgroup label="✦ Custom Classes">
                ${(state.customClasses||[]).map(pc=>`<option value="${pc.id}" ${c.playerClass===pc.id?'selected':''}>${pc.icon||'✦'} ${pc.label}</option>`).join('')}
              </optgroup>` : ''}
            </select>
          </label>
          <label class="dm-mini"><span>Gold</span>
            <input class="dm-points" data-i="${i}" type="number" value="${c.points||0}">
          </label>
          <label class="dm-mini"><span>Stat Pts</span>
            <input class="dm-basepts" data-i="${i}" type="number" value="${c.baseStatPoints||9}" min="0">
          </label>
          <label class="dm-mini"><span>Status</span>
            <select class="dm-state" data-i="${i}">
              <option value="active" ${st==='active'?'selected':''}>Active</option>
              <option value="reserve" ${st==='reserve'?'selected':''}>Reserve</option>
              <option value="dead" ${st==='dead'?'selected':''}>Dead</option>
            </select>
          </label>
        </div>
        <div class="dm-agent-actions">
          <span class="dm-pts-display">${fmtGold(c.points)} gold</span>
          <button class="dm-agent-reserve" data-i="${i}" title="Toggle reserve">${st==='reserve'?'⟲ Reinstate':'⇩ To Reserve'}</button>
          <button class="dm-agent-del" data-i="${i}" title="Terminate record">✕ Delete</button>
        </div>
      </div>`;
    }).join('');
    roster.querySelectorAll('.dm-agent-pick').forEach(b=> b.addEventListener('click',()=>{ state.selectedCharacter=+b.dataset.i; render(); }));
    roster.querySelectorAll('.dm-rank').forEach(s=> s.addEventListener('change',()=>{ state.characters[+s.dataset.i].rank=s.value; pushState(true); render(); }));
    roster.querySelectorAll('.dm-class').forEach(s=> s.addEventListener('change',()=>{
      const c = state.characters[+s.dataset.i];
      const oldClass = c.playerClass;
      c.playerClass = s.value;
      // Auto-grant basic class skills when assigned for the first time
      if(s.value !== 'none' && oldClass === 'none'){
        const basics = CLASS_BASIC_SKILLS[s.value] || [];
        basics.forEach(skill => {
          // Only add if they don't already have a skill with this name
          const exists = c.abilities.some(a => a.name === skill.name);
          if(!exists){
            c.abilities.push({
              name: skill.name,
              type: skill.type,
              cost: skill.cost,
              cooldown: skill.cooldown,
              desc: skill.desc + ' [Class Skill]'
            });
          }
        });
        const cls = getClassDef(s.value);
        showToast(`${c.name||'Player'} is now a ${cls?.label||s.value}! Granted: ${basics.map(b=>b.name).join(', ')}`, 'buy');
      } else if(s.value !== 'none' && oldClass !== 'none'){
        showToast(`${c.name||'Player'}'s class changed to ${getClassDef(s.value)?.label||s.value}`, 'info');
      }
      pushState(true); render();
    }));
    roster.querySelectorAll('.dm-points').forEach(inp=> inp.addEventListener('input',()=>{ state.characters[+inp.dataset.i].points=Math.max(0,Number(inp.value)||0); pushState(); renderHeader(); }));
    roster.querySelectorAll('.dm-basepts').forEach(inp=> inp.addEventListener('input',()=>{
      state.characters[+inp.dataset.i].baseStatPoints = Math.max(0, Number(inp.value)||0);
      pushState(); render();
    }));
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
        <span class="grade-pts">${fmtGold(t.points)}${t.grade==='S'?'+':''}</span>
        <span class="grade-label">${t.label}</span>
      </button>`).join('');
    award.querySelectorAll('.grade-btn').forEach(b=> b.addEventListener('click',()=> awardMissionPoints(b.dataset.grade)));
  }

  // Shop management

  // New systems
  try{ renderDmCommendations(); }catch(e){}
  try{ renderDmRequests(); }catch(e){}
  try{ syncSiteAlertButtons(); }catch(e){}

  try{ renderDmSites(); }catch(e){}


  try{ renderDmDiagnostics(); }catch(e){}
  el('dmAddSiteBtn')?.addEventListener('click', addSite);
  el('dmAddCaseBtn')?.addEventListener('click', addCase);
}

// ═════════════════════════════════════════════════════════════════
// DM ANOMALY CATALOG — master list, grants access to specific agents
// Players see granted files in their Anomaly Log tab, and can purchase
// ungranted ones at half the threat grade's bounty.
// ═════════════════════════════════════════════════════════════════
// ═════════════════════════════════════════════════════════════════
// SCENE BANNER — current site indicator at top of every terminal
// ═════════════════════════════════════════════════════════════════
// ═════════════════════════════════════════════════════════════════
// DM · SITE LOCATOR
// ═════════════════════════════════════════════════════════════════
let _dmSiteSelectedId = null;
function dmActiveSite(){
  const list = state.sites || [];
  if (!list.length) return null;
  let s = list.find(x => x.id === _dmSiteSelectedId);
  if (!s) { s = list[0]; _dmSiteSelectedId = s.id; }
  return s;
}
function addSite(){
  if(!Array.isArray(state.sites)) state.sites = [];
  const s = {
    id: 'site-' + Date.now(),
    name: 'New Site', designation: '', region: 'urban',
    description: '', atmosphere: '', contaminated: false,
    dmNotes: '', current: false
  };
  state.sites.push(s);
  _dmSiteSelectedId = s.id;
  pushState(true); renderDmSites();
}
function renderDmSites(){
  const host = el('dmSitesRoot'); if(!host) return;
  const list = state.sites || [];
  const cur = dmActiveSite();

  host.innerHTML = `
    <div class="dm-site-shell">
      <aside class="dm-site-side">
        ${list.length ? list.map(s => {
          const on = cur && s.id === cur.id;
          return `<button type="button" class="dm-site-row ${on?'active':''} ${s.current?'scene':''}" data-siteid="${esc(s.id)}">
            <span class="dm-site-dot ${s.current?'on':''}"></span>
            <span class="dm-site-info">
              <span class="dm-site-name">${esc(s.name)}</span>
              <span class="dm-site-sub">${esc(s.region)}${s.current?' · <b>CURRENT</b>':''}</span>
            </span>
          </button>`;
        }).join('') : '<div class="dm-empty" style="padding:1rem">No sites registered.</div>'}
      </aside>
      <div class="dm-site-main">
        ${cur ? `
          <div class="dm-site-head">
            <label class="dm-site-field" style="flex:1"><span>Name</span>
              <input type="text" id="dmSiteName" value="${esc(cur.name)}" placeholder="Site name">
            </label>
            <label class="dm-site-field" style="width:140px"><span>Designation</span>
              <input type="text" id="dmSiteDesig" value="${esc(cur.designation)}" placeholder="SITE-██">
            </label>
            <label class="dm-site-field" style="width:130px"><span>Region</span>
              <select id="dmSiteRegion">
                ${['urban','rural','forest','coastal','underground','industrial','remote','anomalous'].map(r =>
                  `<option value="${r}" ${cur.region===r?'selected':''}>${r.charAt(0).toUpperCase()+r.slice(1)}</option>`
                ).join('')}
              </select>
            </label>
            <div class="dm-site-actions">
              <button class="dt-btn small ${cur.current?'':'ghost'}" id="dmSiteScene">
                ${cur.current?'✓ Current Scene':'Set as Scene'}
              </button>
              <button class="dt-btn ghost small" id="dmSiteDel">🗑</button>
            </div>
          </div>
          <label class="dm-site-field">
            <span>Description (players see this)</span>
            <textarea id="dmSiteDesc" placeholder="What is this place? What history does it have?">${esc(cur.description)}</textarea>
          </label>
          <label class="dm-site-field">
            <span>Atmosphere (banner tagline)</span>
            <input type="text" id="dmSiteAtmos" value="${esc(cur.atmosphere)}" placeholder="e.g. thick fog, distant screams, sterile silence">
          </label>
          <label class="dm-site-toggle ${cur.contaminated?'on':''}">
            <input type="checkbox" id="dmSiteContam" ${cur.contaminated?'checked':''}>
            <span class="dm-site-toggle-icon">⚠</span>
            <span class="dm-site-toggle-text">
              <b>Contamination Alert</b>
              <em>Marks the site with a warning stripe on all agent terminals</em>
            </span>
          </label>
          <label class="dm-site-field">
            <span>DM notes (private)</span>
            <textarea id="dmSiteNotes" class="dm-site-private" placeholder="Only DMs see this. Secrets, encounters lurking here, plot hooks…">${esc(cur.dmNotes)}</textarea>
          </label>
        ` : `<div class="dm-empty" style="padding:2rem">Register a site to begin.</div>`}
      </div>
    </div>
  `;

  host.querySelectorAll('.dm-site-row').forEach(r => r.addEventListener('click', () => {
    _dmSiteSelectedId = r.dataset.siteid; renderDmSites();
  }));
  el('dmSiteScene')?.addEventListener('click', () => {
    const c = dmActiveSite(); if(!c) return;
    const wasCurrent = c.current;
    state.sites.forEach(s => s.current = false);
    c.current = !wasCurrent;
    showToast(c.current ? `Scene: ${c.name}` : 'No current scene', 'success');
  });
  el('dmSiteDel')?.addEventListener('click', () => {
    const c = dmActiveSite(); if(!c) return;
    if (!confirm(`Remove site "${c.name}"?`)) return;
    state.sites = state.sites.filter(x => x.id !== c.id);
    _dmSiteSelectedId = null;
  });
  el('dmSiteContam')?.addEventListener('change', e => {
    const c = dmActiveSite(); if(!c) return;
    c.contaminated = e.target.checked;
  });
  const bind = (id, field) => el(id)?.addEventListener('input', e => {
    const c = dmActiveSite(); if(!c) return;
    c[field] = e.target.value; pushState();
    if (['name','region','contaminated'].includes(field)) renderDmSites();
  });
  bind('dmSiteName','name'); bind('dmSiteDesig','designation');
  bind('dmSiteDesc','description'); bind('dmSiteAtmos','atmosphere');
  bind('dmSiteNotes','dmNotes');
  el('dmSiteRegion')?.addEventListener('change', e => {
    const c = dmActiveSite(); if(!c) return;
  });
}

// ═════════════════════════════════════════════════════════════════
// DM · INVESTIGATION CASES
// ═════════════════════════════════════════════════════════════════
let _dmCaseSelectedId = null;
// ═════════════════════════════════════════════════════════════════
// QUEST LOG — player-side quest display
// ═════════════════════════════════════════════════════════════════
function renderQuestLog(){
  const c = getChar(); if(!c) return;
  const host = el('questList'); if(!host) return;
  const quests = (state.cases || []).filter(q =>
    q.status !== 'completed' && q.status !== 'failed'
  );

  const statsEl = el('questStats');
  if(statsEl){
    const active = (state.cases||[]).filter(q=>q.status==='active').length;
    const available = (state.cases||[]).filter(q=>q.status==='available').length;
    const completed = (state.cases||[]).filter(q=>q.status==='completed').length;
    statsEl.innerHTML = `<span class="qstat"><strong>${active}</strong> Active</span><span class="qstat"><strong>${available}</strong> Available</span><span class="qstat completed"><strong>${completed}</strong> Completed</span>`;
  }

  const filterEl = el('questFilters');
  if(filterEl){
    filterEl.innerHTML = `<button class="quest-type-filter active" data-qtype="all">All</button>` +
      Object.entries(QUEST_TYPES).map(([k,v])=>`<button class="quest-type-filter" data-qtype="${k}" style="--qt-c:${v.color}">${v.icon} ${v.label}</button>`).join('');
    filterEl.querySelectorAll('.quest-type-filter').forEach(btn=>{
      btn.addEventListener('click',()=>{
        filterEl.querySelectorAll('.quest-type-filter').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        const t = btn.dataset.qtype;
        host.querySelectorAll('.quest-card').forEach(card=>{ card.style.display = (t==='all'||card.dataset.qtype===t)?'':'none'; });
      });
    });
  }

  if(!quests.length){
    host.innerHTML = `<div class="empty-note big">📜<br>NO ACTIVE QUESTS<br><span>The Game Master assigns quests from the GM Console.</span></div>`;
    return;
  }

  const rankOrder = {S:0,A:1,B:2,C:3,D:4,E:5};
  quests.sort((a,b)=>{ if(a.status==='active'&&b.status!=='active')return-1; if(b.status==='active'&&a.status!=='active')return 1; return(rankOrder[a.rank]||5)-(rankOrder[b.rank]||5); });

  host.innerHTML = quests.map(q=>{
    const qt = QUEST_TYPES[q.type] || QUEST_TYPES.side;
    const rk = RANK_BY_ID[q.rank] || RANKS[0];
    const doneCt = (q.objectives||[]).filter(o=>o.done).length;
    const totCt = (q.objectives||[]).length;
    const pct = totCt > 0 ? Math.round(doneCt/totCt*100) : 0;
    return `
    <div class="quest-card ${q.status}" data-qtype="${q.type}" style="--qt-c:${qt.color};--qr-c:${rk.color}">
      <div class="qc-head">
        <span class="qc-type" style="color:${qt.color}">${qt.icon}</span>
        <span class="qc-name">${esc(q.name)}</span>
        <span class="qc-rank" style="color:${rk.color};border-color:${rk.color}">${rk.id}</span>
        <span class="qc-status-tag ${q.status}">${q.status.toUpperCase()}</span>
      </div>
      ${q.desc?`<div class="qc-desc">${esc(q.desc)}</div>`:''}
      ${totCt?`
        <div class="qc-progress"><div class="qc-progress-bar"><div class="qc-progress-fill" style="width:${pct}%"></div></div><span class="qc-progress-text">${doneCt}/${totCt}</span></div>
        <div class="qc-objectives">${q.objectives.map(o=>`<div class="qc-obj ${o.done?'done':''}"><span class="qc-obj-check">${o.done?'✓':'○'}</span><span>${esc(o.text)}</span></div>`).join('')}</div>
      `:''}
      ${(q.rewards.exp||q.rewards.gold||(q.rewards.items||[]).length)?`
        <div class="qc-rewards"><span class="qc-rewards-label">REWARDS:</span>
          ${q.rewards.exp?`<span class="qc-reward exp">✦ ${fmtGold(q.rewards.exp)} EXP</span>`:''}
          ${q.rewards.gold?`<span class="qc-reward gold">◆ ${fmtGold(q.rewards.gold)} Gold</span>`:''}
          ${(q.rewards.items||[]).map(it=>`<span class="qc-reward item">📦 ${esc(it)}</span>`).join('')}
        </div>`:''}
      ${q.timeLimit?`<div class="qc-time">⏱ ${esc(q.timeLimit)}</div>`:''}
    </div>`;
  }).join('');

  el('questShowCompleted')?.addEventListener('click',()=>{
    const list = el('questCompletedList'); if(!list) return;
    const showing = list.style.display !== 'none';
    list.style.display = showing ? 'none' : '';
    el('questShowCompleted').textContent = showing ? 'Show Completed' : 'Hide Completed';
    if(!showing){
      const completed = (state.cases||[]).filter(q=>q.status==='completed'||q.status==='failed');
      list.innerHTML = completed.length ? completed.map(q=>{
        const qt = QUEST_TYPES[q.type]||QUEST_TYPES.side;
        return `<div class="quest-card completed-card ${q.status}"><div class="qc-head"><span class="qc-type" style="color:${qt.color}">${qt.icon}</span><span class="qc-name">${esc(q.name)}</span><span class="qc-status-tag ${q.status}">${q.status.toUpperCase()}</span></div></div>`;
      }).join('') : '<div class="empty-note">No completed quests yet.</div>';
    }
  });
}

// ═════════════════════════════════════════════════════════════════
// DM · QUEST LIST RENDERER (used in GM Console → Quests tab)
// ═════════════════════════════════════════════════════════════════
function renderDmQuestList(){
  const host = el('dmQuestList'); if(!host) return;
  const quests = state.cases || [];
  if(!quests.length){ host.innerHTML='<div class="dm-empty">No quests created yet.</div>'; return; }

  host.innerHTML = quests.map((q,i) => {
    const qt = QUEST_TYPES[q.type] || QUEST_TYPES.side;
    const rk = RANK_BY_ID[q.rank] || RANKS[0];
    const doneCt = (q.objectives||[]).filter(o=>o.done).length;
    const totCt = (q.objectives||[]).length;
    const pct = totCt > 0 ? Math.round(doneCt/totCt*100) : 0;
    return `
    <div class="dm-quest-row" style="--qt-c:${qt.color}">
      <div class="dm-quest-top">
        <span style="color:${qt.color};font-size:1rem">${qt.icon}</span>
        <strong>${esc(q.name)}</strong>
        <span class="dm-quest-rank" style="color:${rk.color}">${rk.id}</span>
        <select class="dm-quest-status" data-qi="${i}">
          <option value="available" ${q.status==='available'?'selected':''}>Available</option>
          <option value="active" ${q.status==='active'?'selected':''}>Active</option>
          <option value="completed" ${q.status==='completed'?'selected':''}>Completed</option>
          <option value="failed" ${q.status==='failed'?'selected':''}>Failed</option>
        </select>
        <button class="dm-quest-del" data-qi="${i}" title="Delete">✕</button>
      </div>
      ${q.desc ? `<div style="font-size:.72rem;color:var(--text-dim);margin:.3rem 0 .2rem;padding-left:1.5rem">${esc(q.desc)}</div>` : ''}
      ${totCt ? `
        <div style="display:flex;align-items:center;gap:.5rem;margin:.3rem 0 .2rem;padding-left:1.5rem">
          <div style="flex:1;height:4px;background:rgba(0,0,0,.4);border-radius:2px;overflow:hidden">
            <div style="width:${pct}%;height:100%;background:${qt.color};border-radius:2px;transition:width .3s"></div>
          </div>
          <span style="font-family:var(--F4);font-size:.48rem;color:var(--text-dim)">${doneCt}/${totCt}</span>
        </div>
        <div class="dm-quest-objs">${q.objectives.map((o,oi)=>`
          <label class="dm-quest-obj"><input type="checkbox" ${o.done?'checked':''} data-qi="${i}" data-oi="${oi}"> ${esc(o.text)}</label>
        `).join('')}</div>
      ` : ''}
      ${(q.rewards.exp||q.rewards.gold||q.rewards.items?.length) ? `
        <div class="dm-quest-rewards">
          Rewards: ${q.rewards.exp?`✦ ${fmtGold(q.rewards.exp)} EXP `:''}${q.rewards.gold?`◆ ${fmtGold(q.rewards.gold)} Gold `:''}${(q.rewards.items||[]).map(it=>`📦 ${esc(it)}`).join(' ')}
        </div>
      ` : ''}
    </div>`;
  }).join('');

  // Wire status changes
  host.querySelectorAll('.dm-quest-status').forEach(sel=>sel.addEventListener('change',()=>{
    const q = state.cases[+sel.dataset.qi]; if(!q) return;
    const oldStatus = q.status;
    q.status = sel.value;
    // Auto-grant rewards on completion
    if(sel.value === 'completed' && oldStatus !== 'completed'){
      const targets = state.characters.filter(c=>c.state==='active');
      targets.forEach(c=>{
        if(q.rewards.exp) gainExp(c, q.rewards.exp);
        if(q.rewards.gold) c.points = (c.points||0) + q.rewards.gold;
      });
      if(q.rewards.exp || q.rewards.gold){
        showToast(`Quest "${q.name}" completed! Rewards: ${q.rewards.exp?fmtGold(q.rewards.exp)+' EXP ':''}${q.rewards.gold?fmtGold(q.rewards.gold)+' Gold':''}`, 'buy');
      }
    }
    pushState(true); render(); renderDmQuestList();
  }));

  // Wire objective checkboxes
  host.querySelectorAll('.dm-quest-obj input').forEach(cb=>cb.addEventListener('change',()=>{
    const q = state.cases[+cb.dataset.qi]; if(!q) return;
    const obj = q.objectives[+cb.dataset.oi]; if(!obj) return;
    obj.done = cb.checked;
    pushState(true); renderDmQuestList();
  }));

  // Wire delete
  host.querySelectorAll('.dm-quest-del').forEach(btn=>btn.addEventListener('click',()=>{
    const q = state.cases[+btn.dataset.qi];
    if(!confirm(`Delete quest "${q?.name||'Untitled'}"?`)) return;
    state.cases.splice(+btn.dataset.qi, 1);
    pushState(true); renderDmQuestList();
    showToast('Quest deleted','info');
  }));
}

// ── DM CHARACTER MANAGEMENT ──
function dmDeleteAgent(i){
  const c = state.characters[i]; if(!c) return;
  if(state.characters.length<=1){ showToast('Cannot delete the last player','warn'); return; }
  if(!confirm(`DELETE player record for ${c.name||`Player ${i+1}`}?\n\nThis permanently deletes the character for everyone.`)) return;
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
  showToast('New player created (Reserve)','buy');
}

// ================================================================
// RESOURCE ADJUST (HP / Mana / Points quick buttons)
// ================================================================
function adjustResource(resource, amt){
  const c = getChar();
  if(resource==='hp'){ c.hp.current = clamp((c.hp.current||0)+amt, 0, c.hp.max); }
  else if(resource==='mana'){ c.mana.current = clamp((c.mana.current||0)+amt, 0, c.mana.max); }
  else if(resource==='points'){ c.points = Math.max(0,(Number(c.points)||0)+amt); }
  ensureClamp(c); pushState(true); renderMainFields(); renderHeader();
  if(resource==='mana') applyManaDamage();
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
  try { await setDoc(doc(db,'dt-meta','broadcast'), { msg, ts:Date.now(), cleared:false }); }
  catch(e){ console.error(e); }
}
async function clearBroadcast(){
  try { await setDoc(doc(db,'dt-meta','broadcast'), { msg:'', ts:Date.now(), cleared:true }); }
  catch(e){ console.error(e); }
}
function startBroadcastListener(){
  if(_broadcastUnsub) _broadcastUnsub();
  const _loadTime = Date.now();
  _broadcastUnsub = onSnapshot(doc(db,'dt-meta','broadcast'), snap=>{
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
          <span class="bcs-channel">DUNGEON TOWER · SYSTEM BROADCAST</span>
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
    dmUnlocked = true; sessionStorage.setItem('dt-dm','1');
    render();
    // re-render the broadcast screen so DM controls now appear
    showBroadcastScreen(el('bcsMessage')?.textContent || msg);
    showToast('Administrator access granted','buy');
  });
}

// ================================================================
// SOUND DESIGN — subtle terminal SFX (Web Audio, no asset files)
// ================================================================
let _audioCtx = null;
let _sfxEnabled = localStorage.getItem('dt-sfx') !== '0';
function _ac(){
  if(_sfxEnabled===false) return null;
  if(!_audioCtx){ try{ _audioCtx = new (window.AudioContext||window.webkitAudioContext)(); }catch(e){ return null; } }
  if(_audioCtx.state==='suspended') _audioCtx.resume().catch(()=>{});
  return _audioCtx;
}
// generic tone
function _tone(freq, dur, type='square', vol=0.04, when=0){
  const ac=_ac(); if(!ac) return;
  const t=ac.currentTime+when;
  const o=ac.createOscillator(), g=ac.createGain();
  o.type=type; o.frequency.value=freq;
  g.gain.setValueAtTime(0,t);
  g.gain.linearRampToValueAtTime(vol,t+0.005);
  g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  o.connect(g); g.connect(ac.destination);
  o.start(t); o.stop(t+dur+0.02);
}
const SFX = {
  key(){ _tone(420+Math.random()*120, 0.03, 'square', 0.018); },      // typewriter keystroke
  click(){ _tone(880, 0.04, 'square', 0.03); _tone(1320,0.03,'square',0.015,0.01); },
  tab(){ _tone(600, 0.05, 'triangle', 0.03); },
  confirm(){ _tone(660,0.06,'square',0.035); _tone(990,0.08,'square',0.03,0.06); },
  warn(){ _tone(220,0.12,'sawtooth',0.04); _tone(180,0.18,'sawtooth',0.035,0.08); },
  alarm(){ const ac=_ac(); if(!ac) return; for(let i=0;i<3;i++){ _tone(740,0.18,'square',0.05,i*0.42); _tone(560,0.18,'square',0.05,i*0.42+0.2);} },
  hum(){ _tone(70,1.4,'sine',0.06); _tone(105,1.4,'sine',0.03); },
  buy(){ _tone(523,0.05,'square',0.03); _tone(784,0.06,'square',0.03,0.05); _tone(1046,0.1,'square',0.03,0.11); }
};
function toggleSfx(){
  _sfxEnabled = !_sfxEnabled;
  localStorage.setItem('dt-sfx', _sfxEnabled?'1':'0');
  const b=el('sfxToggle'); if(b){ b.classList.toggle('off',!_sfxEnabled); b.textContent = _sfxEnabled?'♪ SFX':'♪ SFX OFF'; }
  if(_sfxEnabled){ SFX.click(); startAmbient(); } else { stopAmbient(); }
  showToast(_sfxEnabled?'Audio enabled':'Audio muted','info');
}

let _ambient = null;
function startAmbient(){
  const ac = _ac(); if(!ac) return;
  if(_ambient) return;
  const master = ac.createGain(); master.gain.value = 0.0; master.connect(ac.destination);
  const oscA = ac.createOscillator(); oscA.type='sine'; oscA.frequency.value=55;
  const oscB = ac.createOscillator(); oscB.type='sine'; oscB.frequency.value=82.5;
  const oscC = ac.createOscillator(); oscC.type='triangle'; oscC.frequency.value=110;
  const gA = ac.createGain(); gA.gain.value=0.5;
  const gB = ac.createGain(); gB.gain.value=0.3;
  const gC = ac.createGain(); gC.gain.value=0.0;
  const lfo = ac.createOscillator(); lfo.type='sine'; lfo.frequency.value=0.08;
  const lfoGain = ac.createGain(); lfoGain.gain.value=6;
  lfo.connect(lfoGain); lfoGain.connect(oscA.frequency);
  oscA.connect(gA); oscB.connect(gB); oscC.connect(gC);
  gA.connect(master); gB.connect(master); gC.connect(master);
  oscA.start(); oscB.start(); oscC.start(); lfo.start();
  master.gain.linearRampToValueAtTime(0.05, ac.currentTime+3);
  _ambient = { master, oscA, oscB, oscC, gC, lfo, ac };
  updateAmbient();
}
function stopAmbient(){
  if(!_ambient) return;
  const { master, oscA, oscB, oscC, lfo, ac } = _ambient;
  try {
    master.gain.cancelScheduledValues(ac.currentTime);
    master.gain.linearRampToValueAtTime(0.0001, ac.currentTime+1.2);
    [oscA,oscB,oscC,lfo].forEach(o=>{ try{ o.stop(ac.currentTime+1.3); }catch(e){} });
  } catch(e){}
  _ambient = null;
}
function updateAmbient(){
  if(!_ambient) return;
  const c = getChar();
  const hpPct = c.hp.max>0 ? c.hp.current/c.hp.max : 1;
  const sanPct = c.mana.max>0 ? c.mana.current/c.mana.max : 1;
  const low = Math.min(hpPct, sanPct);
  const ac = _ambient.ac;
  const tension = 1 - low;
  try {
    _ambient.gC.gain.linearRampToValueAtTime(0.04 + tension*0.16, ac.currentTime+1.5);
    _ambient.lfo.frequency.linearRampToValueAtTime(0.08 + tension*0.5, ac.currentTime+1.5);
    const dissonance = state.siteAlert==='uncontained' ? 4 : (state.siteAlert==='lockdown' ? 2 : 0);
    _ambient.oscB.frequency.linearRampToValueAtTime(82.5 + dissonance, ac.currentTime+1.5);
  } catch(e){}
}

let _heartbeat = null;
function applyHeartbeat(){
  const c = getChar();
  const hpPct = c.hp.max>0 ? c.hp.current/c.hp.max : 1;
  const critical = c.hp.max>0 && hpPct>0 && hpPct<=0.25;
  if(critical && !_heartbeat){
    document.body.classList.add('heartbeat-active');
    const beat = ()=>{
      pulseHeartbeatVisual();
      if(_sfxEnabled) heartbeatSound();
      const rate = hpPctRate();
      _heartbeat = setTimeout(beat, rate);
    };
    beat();
  } else if(!critical && _heartbeat){
    clearTimeout(_heartbeat); _heartbeat=null;
    document.body.classList.remove('heartbeat-active');
  }
}
function hpPctRate(){
  const c = getChar();
  const hpPct = c.hp.max>0 ? c.hp.current/c.hp.max : 1;
  return 600 + Math.max(0, hpPct/0.25) * 600;
}
function pulseHeartbeatVisual(){
  let o = el('heartbeatOverlay');
  if(!o){ o=document.createElement('div'); o.id='heartbeatOverlay'; document.body.appendChild(o); }
  o.classList.remove('thump'); void o.offsetWidth; o.classList.add('thump');
}
function heartbeatSound(){
  const ac=_ac(); if(!ac) return;
  const t=ac.currentTime;
  const thump=(when)=>{
    const o=ac.createOscillator(), g=ac.createGain();
    o.type='sine'; o.frequency.setValueAtTime(64,when); o.frequency.exponentialRampToValueAtTime(36,when+0.12);
    g.gain.setValueAtTime(0.0,when); g.gain.linearRampToValueAtTime(0.09,when+0.01); g.gain.exponentialRampToValueAtTime(0.0001,when+0.18);
    o.connect(g); g.connect(ac.destination); o.start(when); o.stop(when+0.2);
  };
  thump(t); thump(t+0.16);
}

let _knockUnsub = null;
let _knockLoadTs = Date.now();
async function sendKnock(){
  const c = getChar();
  const who = c.name || 'An agent';
  try {
    await setDoc(doc(db,'dt-meta','knock'), { by:who, ts:Date.now() });
    SFX.confirm();
    showToast('Signal sent to the Administrator','info');
  } catch(e){ showToast('Could not send signal','warn'); }
}
function startKnockListener(){
  if(_knockUnsub) _knockUnsub();
  _knockUnsub = onSnapshot(doc(db,'dt-meta','knock'), snap=>{
    if(!snap.exists()) return;
    const d = snap.data();
    if(!d.ts || d.ts <= _knockLoadTs) return;
    _knockLoadTs = d.ts;
    if(dmUnlocked) showKnockAlert(d.by||'An agent');
  }, ()=>{});
}
function showKnockAlert(who){
  const a=document.createElement('div');
  a.className='knock-alert';
  a.innerHTML=`<span class="knock-icon">✋</span><span class="knock-text"><strong>${esc(who)}</strong> is requesting your attention</span>`;
  document.body.appendChild(a);
  if(_sfxEnabled){ SFX.tab(); setTimeout(()=>SFX.tab(),180); }
  setTimeout(()=>{ a.classList.add('out'); setTimeout(()=>a.remove(),400); }, 5000);
}

// ================================================================
// DYNAMIC SITE STATE — normal / lockdown / uncontained
// ================================================================
function setSiteAlert(level){
  if(!dmUnlocked) return;
  state.siteAlert = level;
  showToast(`Site status: ${level.toUpperCase()}`, level==='normal'?'info':'warn');
}

// ================================================================
// IDLE CORRUPTION — subtle glitches creep in when the sheet sits idle
// ================================================================
let _idleTimer = null;
let _corruptionLevel = 0;
let _corruptionTick = null;
function resetIdle(){
  _corruptionLevel = 0;
  document.body.classList.remove('corrupt-1','corrupt-2','corrupt-3');
  el('corruptionOverlay')?.classList.remove('active');
  clearTimeout(_idleTimer);
  clearInterval(_corruptionTick);
  _idleTimer = setTimeout(beginCorruption, 90000); // 90s of inactivity
}
function beginCorruption(){
  if(!el('corruptionOverlay')){
    const o=document.createElement('div'); o.id='corruptionOverlay'; o.innerHTML='<div class="corrupt-scan"></div><div class="corrupt-glitch"></div>';
    document.body.appendChild(o);
  }
  el('corruptionOverlay').classList.add('active');
  _corruptionTick = setInterval(()=>{
    _corruptionLevel = Math.min(3, _corruptionLevel+1);
    document.body.classList.remove('corrupt-1','corrupt-2','corrupt-3');
    document.body.classList.add('corrupt-'+_corruptionLevel);
    if(_corruptionLevel>=2 && Math.random()<0.5) SFX.hum();
  }, 45000); // deepens every 45s of continued idle
}

// ================================================================
// LOW-SANITY SCREEN DAMAGE — the whole screen degrades as mana falls
// Tied to the character you're viewing/controlling. Four bands:
//   >50% none · 50-30% level1 · 30-15% level2 · <15% level3 (critical)
// ================================================================
let _manaBand = 0;
let _manaWhisperTimer = null;
function applyManaDamage(){
  const c = getChar();
  const max = Number(c?.mana?.max)||0;
  const cur = Number(c?.mana?.current)||0;
  const pct = max>0 ? (cur/max)*100 : 100;   // no max set = treat as stable
  let band = 0;
  if(max>0){
    if(pct<=15) band = 3;
    else if(pct<=30) band = 2;
    else if(pct<=50) band = 1;
  }
  if(band === _manaBand){ ensureManaOverlay(band); return; }
  const rising = band > _manaBand;
  _manaBand = band;
  document.body.classList.remove('mana-1','mana-2','mana-3');
  ensureManaOverlay(band);
  if(band>0){
    document.body.classList.add('mana-'+band);
    if(rising){
      // sensory sting when it gets worse
      if(band>=2) SFX?.warn?.();
      if(band>=3){ SFX?.alarm?.(); startManaWhispers(); }
    }
  }
  if(band<3) stopManaWhispers();
}
function ensureManaOverlay(band){
  let o = el('manaOverlay');
  if(band<=0){ o?.remove(); return; }
  if(!o){
    o = document.createElement('div');
    o.id = 'manaOverlay';
    o.innerHTML = `
      <div class="san-vignette"></div>
      <div class="san-grain"></div>
      <div class="san-scan"></div>
      <div class="san-rgb"></div>
      <div class="san-cracks"></div>
      <div class="san-pulse"></div>`;
    document.body.appendChild(o);
  }
  o.className = 'san-band-'+band;
}
// faint distorted "whispers" at critical mana (synthesized, no audio files)
function startManaWhispers(){
  if(_sfxEnabled===false) return;
  stopManaWhispers();
  const whisper = ()=>{
    const ac = _ac(); if(!ac){ return; }
    // breathy noise burst through a bandpass — sounds like a distant voice
    const dur = 0.5 + Math.random()*0.6;
    const buf = ac.createBuffer(1, ac.sampleRate*dur, ac.sampleRate);
    const d = buf.getChannelData(0);
    for(let i=0;i<d.length;i++){ d[i] = (Math.random()*2-1) * Math.pow(1-i/d.length, 1.5); }
    const src = ac.createBufferSource(); src.buffer = buf;
    const bp = ac.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=600+Math.random()*700; bp.Q.value=6;
    const g = ac.createGain(); g.gain.value=0.05;
    src.connect(bp); bp.connect(g); g.connect(ac.destination);
    src.start();
  };
  _manaWhisperTimer = setInterval(()=>{ if(Math.random()<0.6) whisper(); }, 4000);
}
function stopManaWhispers(){ clearInterval(_manaWhisperTimer); _manaWhisperTimer=null; }

// ================================================================
// COMMENDATIONS / ACHIEVEMENTS
// ================================================================
// ═════════════════════════════════════════════════════════════════
// SKILL STONES — items that can be absorbed into permanent skills
// DM creates and awards them. Players can absorb or transfer.
// ═════════════════════════════════════════════════════════════════
function renderSkillStones(){
  const host = el('skillStonesList'); if(!host) return;
  const c = getChar();
  const stones = c.skillStones || [];
  if(!stones.length){
    host.innerHTML = `<div class="empty-note">No Skill Stones held. The Game Master awards these as dungeon rewards.</div>`;
    return;
  }
  const otherPlayers = state.characters.filter(x => x.id !== c.id && x.state === 'active' && x.name);
  host.innerHTML = stones.map((s, i) => `
    <div class="ss-card" style="--ss-color:${s.element ? getElementColor(s.element) : 'var(--accent)'}">
      <div class="ss-head">
        <span class="ss-gem">💎</span>
        <span class="ss-name">${esc(s.name)}</span>
        <span class="ss-type-badge">${esc(s.type)}</span>
        ${s.element ? `<span class="ss-element">${esc(s.element)}</span>` : ''}
      </div>
      <div class="ss-meta">
        ${s.cost && s.cost !== '—' ? `<span>Cost: ${esc(s.cost)}</span>` : ''}
        ${s.cooldown && s.cooldown !== '—' ? `<span>CD: ${esc(s.cooldown)}</span>` : ''}
        ${s.fromDm ? '<span class="ss-from">From: GM</span>' : ''}
        ${s.fromPlayer ? `<span class="ss-from">From: ${esc(s.fromPlayer)}</span>` : ''}
      </div>
      ${s.desc ? `<div class="ss-desc">${esc(s.desc)}</div>` : ''}
      <div class="ss-actions">
        <button class="maw-btn small ss-absorb" data-si="${i}" title="Absorb this stone — permanently learn the skill">✦ ABSORB</button>
        ${otherPlayers.length ? `
          <select class="ss-transfer-target" data-si="${i}">
            <option value="">Transfer to…</option>
            ${otherPlayers.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}
          </select>
          <button class="maw-btn ghost small ss-transfer" data-si="${i}" title="Send this stone to another player">↷ Send</button>
        ` : ''}
      </div>
    </div>
  `).join('');

  // Absorb handler
  host.querySelectorAll('.ss-absorb').forEach(btn => btn.addEventListener('click', ()=>{
    const i = Number(btn.dataset.si);
    const stone = c.skillStones[i]; if(!stone) return;
    if(!confirm(`Absorb "${stone.name}"? This will permanently add it to your skills and destroy the stone.`)) return;
    // Add to abilities
    c.abilities.push({
      name: stone.name,
      type: stone.type || 'Active',
      cost: stone.cost || '—',
      cooldown: stone.cooldown || '—',
      desc: (stone.desc || '') + (stone.element ? ` [${stone.element}]` : '') + ' [Skill Stone]'
    });
    // Remove stone
    c.skillStones.splice(i, 1);
    pushState(true); render();
    showToast(`✦ ${stone.name} absorbed! Skill permanently learned.`, 'buy');
  }));

  // Transfer handler
  host.querySelectorAll('.ss-transfer').forEach(btn => btn.addEventListener('click', ()=>{
    const i = Number(btn.dataset.si);
    const stone = c.skillStones[i]; if(!stone) return;
    const sel = host.querySelector(`.ss-transfer-target[data-si="${i}"]`);
    const targetId = sel?.value; if(!targetId){ showToast('Select a player to send to','warn'); return; }
    const target = state.characters.find(x => x.id === targetId);
    if(!target){ showToast('Target not found','warn'); return; }
    if(!confirm(`Send "${stone.name}" to ${target.name}? You will lose the stone.`)) return;
    // Move stone to target
    const transferred = { ...stone, fromPlayer: c.name || 'Unknown', fromDm: false };
    if(!Array.isArray(target.skillStones)) target.skillStones = [];
    target.skillStones.push(transferred);
    c.skillStones.splice(i, 1);
    pushState(true); render();
    showToast(`💎 ${stone.name} sent to ${target.name}!`, 'info');
  }));
}

function getElementColor(element){
  const map = {
    fire:'#d94f4f', ice:'#5aa8f5', cold:'#5aa8f5', lightning:'#e8a72c',
    water:'#3a8ac0', wind:'#5ad17a', earth:'#a08040', light:'#ffd460',
    dark:'#8a5ad1', radiant:'#ffd460', necrotic:'#8a5ad1', poison:'#5a9a78',
    force:'#a462d3', thunder:'#e0802a', arcane:'#a462d3', holy:'#ffd460'
  };
  return map[(element||'').toLowerCase()] || 'var(--accent)';
}

function renderDmCommendations(){
  const host = el('dmCommendList'); if(!host) return;
  const targetSel = el('dmCommendTarget');
  if(targetSel){
    const cur = targetSel.value;
    targetSel.innerHTML = state.characters.map((c,i)=>`<option value="${i}">${esc(c.name||`Player ${i+1}`)}</option>`).join('');
    if(cur) targetSel.value = cur;
  }
  host.innerHTML = COMMENDATIONS.map(m=>`
    <button class="dm-commend-card" data-id="${m.id}" title="${esc(m.desc)}">
      <span class="dm-commend-icon">${m.icon}</span>
      <span class="dm-commend-name">${esc(m.name)}</span>
      <span class="dm-commend-desc">${esc(m.desc)}</span>
    </button>`).join('');
  host.querySelectorAll('.dm-commend-card').forEach(b=> b.addEventListener('click', ()=> grantCommendation(b.dataset.id)));
}
function grantCommendation(id){
  if(!dmUnlocked) return;
  const idx = parseInt(el('dmCommendTarget')?.value);
  const c = state.characters[idx]; if(!c) return;
  if(!Array.isArray(c.commendations)) c.commendations=[];
  const m = COMMENDATION_BY_ID[id];
  if(c.commendations.includes(id)){
    c.commendations = c.commendations.filter(x=>x!==id);
    pushState(true); render();
    showToast(`Revoked: ${m.name} from ${c.name||'agent'}`,'warn');
  } else {
    c.commendations.push(id);
    pushState(true); render();
    SFX.confirm();
    showToast(`✦ ${c.name||'Agent'} awarded: ${m.name}`,'buy');
  }
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
      <div class="welcome-logo"><span class="welcome-diamond">◆</span></div>
      <div class="welcome-title">DUNGEON<span>TOWER</span></div>
      <div class="welcome-sub">PLAYER IDENTIFICATION REQUIRED</div>
      <div class="welcome-charlist" id="welcomeCharList"></div>
      <div class="welcome-actions">
        <button class="dt-btn ghost" id="welcomeSkipBtn">I'm just watching</button>
        <button class="dt-btn dm" id="welcomeDmBtn">⚿ Administrator Access</button>
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
  el('welcomeSkipBtn')?.addEventListener('click', ()=>{ spectator=true; sessionStorage.setItem('dt-spectator','1'); el('welcomeOverlay')?.remove(); applySpectatorMode(); render(); });
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
function releaseMyClaim(silent){
  let released = false;
  state.characters.forEach(c => {
    if (c.claimedBy === MY_PRESENCE_ID) {
      c.claimedBy = '';
      released = true;
    }
  });
  if (released && !silent) pushState(true);
  return released;
}

function claimCharacter(realIdx){
  const c = state.characters[realIdx]; if(!c) return;
  state.characters.forEach(ch=>{ if(ch.claimedBy===MY_PRESENCE_ID) ch.claimedBy=''; });
  c.claimedBy = MY_PRESENCE_ID;
  state.selectedCharacter = realIdx;
  localStorage.setItem('dt-my-idx', realIdx);
  pushState(true); pushPresence(); render();
  renderIdentityBar();
}

// Small persistent bar showing your claimed identity + a release/switch control.
function renderIdentityBar(){
  // Only for players (not DM, not spectator) who currently hold a character.
  const existing = el('identityBar');
  const mine = (!dmUnlocked && !spectator) ? getMyCharacter() : null;
  if(!mine){ existing?.remove(); return; }
  let bar = existing;
  if(!bar){
    bar = document.createElement('div');
    bar.id = 'identityBar'; bar.className = 'identity-bar';
    document.body.appendChild(bar);
  }
  bar.innerHTML = `<span class="idb-label">IDENTITY</span><span class="idb-name">${esc(mine.name||'Agent')}</span><button id="idbRelease" title="Free this character so you (or someone else) can pick another">⮌ Switch / Release</button>`;
  el('idbRelease')?.addEventListener('click', ()=>{
    if(!confirm(`Release ${mine.name||'this agent'}? You'll return to the identification screen and the character will be free for anyone.`)) return;
    releaseMyCharacter();
    el('identityBar')?.remove();
    _welcomeShown = false;
    checkWelcome();
    SFX?.click?.();
  });
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
    el('spectatorExit')?.addEventListener('click', ()=>{ spectator=false; sessionStorage.removeItem('dt-spectator'); document.body.classList.remove('spectator-mode'); b.remove(); checkWelcome(); });
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
  const content = el('dmContent'); if(!content) return;
  ov.classList.remove('hidden');

  if(dmUnlocked){
    buildDmPanelHtml();
    renderDmPanel();
    return;
  }

  content.innerHTML = `
    <div class="dm-login-card" id="dmLoginPanel">
      <div class="dm-card-title">⚔ GAME MASTER LOGIN</div>
      <div class="dm-card-body" style="text-align:center">
        <input type="password" id="dmPasswordInput" class="dm-pass-input" placeholder="Enter GM password" autocomplete="off">
        <button type="button" class="maw-btn" id="dmUnlockBtn" style="margin-top:.8rem;width:100%">UNLOCK</button>
      </div>
    </div>
  `;
  el('dmUnlockBtn')?.addEventListener('click', unlockDm);
  el('dmPasswordInput')?.addEventListener('keydown', e => { if(e.key==='Enter') unlockDm(); });
  el('dmPasswordInput')?.focus();
}

function buildDmPanelHtml(){
  const content = el('dmContent'); if(!content) return;
  const activeChars = state.characters.filter(c=>c.state==='active');
  const charOpts = activeChars.map((c,i)=>`<option value="${i}">${esc(c.name||'P'+(i+1))}</option>`).join('');
  const charOptsAll = `<option value="all">All</option>` + charOpts;

  content.innerHTML = `
    <div class="dm-full-panel" id="dmFullPanel">
      <div class="dm-head">
        <h2 class="dm-head-title">⚔ GAME MASTER</h2>
        <div class="dm-head-actions">
          <button class="maw-btn small" id="dmAddCharBtn">＋ Player</button>
          <button class="maw-btn ghost small" id="dmLockBtn">🔒</button>
          <button class="maw-btn ghost small" id="dmCloseBtn">✕</button>
        </div>
      </div>
      <div class="dm-tabs">
        <button class="dm-tab active" data-dmtab="roster">◆ Roster</button>
        <button class="dm-tab" data-dmtab="rewards">✦ Rewards</button>
        <button class="dm-tab" data-dmtab="quests">📜 Quests</button>
        <button class="dm-tab" data-dmtab="skills">💎 Skills</button>
        <button class="dm-tab" data-dmtab="classes">🏷 Classes</button>
        <button class="dm-tab" data-dmtab="world">🌐 World</button>
      </div>
      <div class="dm-tab-content active" data-dmtab="roster">
        <div class="dm-card"><div class="dm-card-title">◆ Player Roster</div><div class="dm-card-body dm-roster-compact" id="dmRoster"></div></div>
        <div class="dm-card"><div class="dm-card-title">⚡ Quick Actions</div><div class="dm-card-body">
          <div class="dm-qa-row">
            <select id="dmActionTarget">${state.characters.map((c,i)=>`<option value="${i}">${esc(c.name||'Player '+(i+1))}</option>`).join('')}</select>
            <select id="dmActionType"><option value="hp-dmg">HP −</option><option value="hp-heal">HP +</option><option value="hp-full">HP Full</option><option value="mp-dmg">MP −</option><option value="mp-heal">MP +</option><option value="mp-full">MP Full</option><option value="full-rest">★ Full Rest</option></select>
            <input type="number" id="dmActionAmount" value="10" min="0">
            <button class="maw-btn small" id="dmActionBtn">GO</button>
          </div>
        </div></div>
      </div>
      <div class="dm-tab-content" data-dmtab="rewards">
        <div class="dm-card"><div class="dm-card-title">✦ EXP Awards</div><div class="dm-card-body">
          <div class="dm-qa-row"><select id="dmExpTarget">${charOptsAll}</select><input type="number" id="dmExpAmount" value="100" min="1"><button class="maw-btn small" id="dmExpBtn">+ Award</button><button class="maw-btn ghost small" id="dmExpTakeBtn">− Take</button></div>
          <div class="dm-preset-row">${[50,100,250,500,1000,5000].map(n=>`<button class="dm-preset dm-exp-preset" data-exp="${n}">${n>=1000?String(n/1000)+'k':n}</button>`).join('')}</div>
          <div id="dmExpStatus" class="dm-exp-status"></div>
        </div></div>
        <div class="dm-card"><div class="dm-card-title">💰 Gold Awards</div><div class="dm-card-body">
          <div class="dm-qa-row"><select id="dmGoldTarget">${charOptsAll}</select><input type="number" id="dmGoldAmount" value="100" min="0" placeholder="Gold amount"><button class="maw-btn small" id="dmGoldBtn">+ Award</button><button class="maw-btn ghost small" id="dmGoldTakeBtn">− Take</button></div>
          <div class="dm-preset-row">${[50,100,250,500,1000,5000].map(n=>`<button class="dm-preset dm-gold-preset" data-gold="${n}">${n>=1000?(n/1000)+'k':n}</button>`).join('')}</div>
        </div></div>
      </div>
      <div class="dm-tab-content" data-dmtab="quests">
        <div class="dm-card"><div class="dm-card-title">📜 Create Quest</div><div class="dm-card-body">
          <input type="text" id="dmQuestName" placeholder="Quest name" style="margin-bottom:.3rem">
          <div class="dm-ss-form-row"><select id="dmQuestType"><option value="main">Main</option><option value="side">Side</option><option value="daily">Daily</option><option value="emergency">Emergency</option><option value="hunt">Hunt</option></select><select id="dmQuestRank">${RANKS.map(r=>`<option value="${r.id}">${r.id}</option>`).join('')}</select></div>
          <textarea id="dmQuestDesc" placeholder="Description" rows="2" style="margin-top:.3rem"></textarea>
          <div class="dm-mini-label" style="margin-top:.4rem">Objectives (one per line)</div>
          <textarea id="dmQuestObjectives" placeholder="Kill the boss&#10;Find the key" rows="3"></textarea>
          <div class="dm-mini-label" style="margin-top:.4rem">Rewards</div>
          <div class="dm-ss-form-row"><input type="number" id="dmQuestExp" placeholder="EXP"><input type="number" id="dmQuestGold" placeholder="Gold"><input type="text" id="dmQuestItems" placeholder="Items"></div>
          <div class="dm-ss-form-row" style="margin-top:.4rem"><select id="dmQuestAssign"><option value="all">All</option>${activeChars.map(c=>`<option value="${c.id}">${esc(c.name||'Player')}</option>`).join('')}</select><input type="text" id="dmQuestTimeLimit" placeholder="Time limit"><button class="maw-btn small" id="dmQuestCreateBtn">📜 Create</button></div>
        </div></div>
        <div class="dm-card"><div class="dm-card-title">📋 Active Quests</div><div class="dm-card-body" id="dmQuestList"></div></div>
      </div>
      <div class="dm-tab-content" data-dmtab="skills">
        <div class="dm-card"><div class="dm-card-title">💎 Create Skill Stone</div><div class="dm-card-body"><div class="dm-ss-form">
          <input type="text" id="dmSSName" placeholder="Skill name">
          <div class="dm-ss-form-row"><select id="dmSSType"><option>Active</option><option>Passive</option><option>Ultimate</option></select><input type="text" id="dmSSCost" placeholder="MP cost"><input type="text" id="dmSSCooldown" placeholder="Cooldown"><input type="text" id="dmSSElement" placeholder="Element"></div>
          <textarea id="dmSSDesc" placeholder="Description" rows="2"></textarea>
          <div class="dm-ss-form-row"><select id="dmSSTarget">${charOpts}</select><button class="maw-btn small" id="dmSSAwardBtn">💎 Award</button></div>
        </div></div></div>
        <div class="dm-card"><div class="dm-card-title">📦 Inventories</div><div class="dm-card-body" id="dmSSInventories"></div></div>
      </div>
      <div class="dm-tab-content" data-dmtab="classes">
        <div class="dm-card"><div class="dm-card-title">🏷 Create Class</div><div class="dm-card-body">
          <div class="dm-ss-form-row"><input type="text" id="dmCCName" placeholder="Name"><input type="text" id="dmCCIcon" placeholder="Icon" value="✦" style="max-width:60px"><input type="color" id="dmCCColor" value="#5aa8f5" style="max-width:40px"></div>
          <div class="dm-ss-form-row" style="margin-top:.3rem"><select id="dmCCPrimary">${STATS.map(s=>`<option value="${s}">${s}</option>`).join('')}</select><select id="dmCCHitDie"><option value="6">d6</option><option value="8" selected>d8</option><option value="10">d10</option><option value="12">d12</option></select><label style="font-size:.55rem;color:var(--text-dim);display:flex;align-items:center;gap:.2rem"><input type="checkbox" id="dmCCHidden">Hidden</label></div>
          <textarea id="dmCCDesc" placeholder="Description" rows="2" style="margin-top:.3rem"></textarea>
          <div class="dm-mini-label" style="margin-top:.4rem">Stat Bonuses</div>
          <div class="dm-cc-bonuses">${STATS.map(s=>`<label class="dm-cc-bonus-field"><span>${s}</span><input type="number" id="dmCCBonus${s}" value="0" min="0" max="10"></label>`).join('')}</div>
          <div class="dm-mini-label" style="margin-top:.4rem">Basic Skills</div>
          <div class="dm-ss-form-row"><input type="text" id="dmCCSkill1Name" placeholder="Skill 1"><input type="text" id="dmCCSkill1Cost" placeholder="Cost"></div>
          <textarea id="dmCCSkill1Desc" placeholder="Skill 1 desc" rows="1" style="margin-top:.2rem"></textarea>
          <div class="dm-ss-form-row" style="margin-top:.3rem"><input type="text" id="dmCCSkill2Name" placeholder="Skill 2"><input type="text" id="dmCCSkill2Cost" placeholder="Cost"></div>
          <textarea id="dmCCSkill2Desc" placeholder="Skill 2 desc" rows="1" style="margin-top:.2rem"></textarea>
          <button class="maw-btn small" id="dmCCCreateBtn" style="margin-top:.5rem">🏷 Create</button>
        </div></div>
        <div class="dm-card"><div class="dm-card-title">📋 Classes</div><div class="dm-card-body" id="dmCCList"></div></div>
      </div>
      <div class="dm-tab-content" data-dmtab="world">
        <div class="dm-card"><div class="dm-card-title">🏪 Shop</div><div class="dm-card-body">
          <div class="dm-qa-row" style="margin-bottom:.5rem"><button class="maw-btn small" id="dmLoadDefaultShop">Load Catalog</button><button class="maw-btn ghost small" id="dmClearShop">Clear</button><span style="font-size:.55rem;color:var(--text-dim);margin-left:auto">${(state.shop||[]).length} items</span></div>
          <input type="text" id="dmShopItemName" placeholder="Custom item" style="margin-bottom:.3rem">
          <div class="dm-qa-row"><input type="number" id="dmShopItemPrice" placeholder="Price"><select id="dmShopItemTier"><option value="1">T1</option><option value="2">T2</option><option value="3">T3</option><option value="4">T4</option></select><select id="dmShopItemCat">${SHOP_CATEGORIES.map(c=>`<option>${c}</option>`).join('')}</select><button class="maw-btn small" id="dmShopAddBtn">＋</button></div>
          <textarea id="dmShopItemDesc" placeholder="Description" rows="1" style="margin-top:.3rem"></textarea>
        </div></div>
        <div class="dm-card"><div class="dm-card-title">📡 Broadcast</div><div class="dm-card-body">
          <input type="text" id="dmSceneName" placeholder="Scene / Floor" value="${esc(state.sceneName||'')}" style="margin-bottom:.4rem">
          <textarea id="dmBroadcast" rows="2" placeholder="System announcement…">${esc(state.broadcast||'')}</textarea>
          <button class="maw-btn small" id="dmBroadcastBtn" style="margin-top:.4rem">Send</button>
        </div></div>
      </div>
    </div>
  `;

  // Wire DM tab switching
  content.querySelectorAll('.dm-tab').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      content.querySelectorAll('.dm-tab').forEach(b=>b.classList.remove('active'));
      content.querySelectorAll('.dm-tab-content').forEach(c=>c.classList.remove('active'));
      btn.classList.add('active');
      content.querySelector(`.dm-tab-content[data-dmtab="${btn.dataset.dmtab}"]`)?.classList.add('active');
    });
  });

  // Focus guard — prevent re-render while DM is typing
  const dmPanel = el('dmFullPanel');
  if(dmPanel){
    dmPanel.addEventListener('focusin', ()=>{ _dmFocused = true; });
    dmPanel.addEventListener('focusout', ()=>{ setTimeout(()=>{ _dmFocused = false; }, 150); });
  }

  // Wire DM head buttons
  el('dmCloseBtn')?.addEventListener('click', closeDmOverlay);
  el('dmLockBtn')?.addEventListener('click', lockDm);
  el('dmAddCharBtn')?.addEventListener('click', ()=>{
    state.characters.push(blankChar(state.characters.length));
    pushState(true); render(); buildDmPanelHtml(); renderDmPanel();
  });

  // Quick actions
  el('dmActionBtn')?.addEventListener('click', ()=>{
    const idx = Number(el('dmActionTarget')?.value)||0;
    const c = state.characters[idx]; if(!c) return;
    const type = el('dmActionType')?.value;
    const amt = Math.max(0, Number(el('dmActionAmount')?.value)||0);
    switch(type){
      case 'hp-dmg':  c.hp.current = clamp((c.hp.current||0)-amt,0,c.hp.max); break;
      case 'hp-heal': c.hp.current = clamp((c.hp.current||0)+amt,0,c.hp.max); break;
      case 'hp-full': c.hp.current = c.hp.max; break;
      case 'mp-dmg':  c.mana.current = clamp((c.mana.current||0)-amt,0,c.mana.max); break;
      case 'mp-heal': c.mana.current = clamp((c.mana.current||0)+amt,0,c.mana.max); break;
      case 'mp-full': c.mana.current = c.mana.max; break;
    }
    ensureClamp(c); pushState(true); render(); renderDmPanel();
    showToast(`${type.replace('-',' ')} applied to ${c.name||'Player'}`, 'info');
  });

  // Shop management
  el('dmLoadDefaultShop')?.addEventListener('click', ()=>{
    const catalog = window.MAW_DEFAULT_SHOP;
    if(!catalog || !catalog.length){ showToast('Shop catalog not found','warn'); return; }
    if(state.shop.length && !confirm(`Add ${catalog.length} items to shop? (Current: ${state.shop.length} items)`)) return;
    // Merge — add items not already in shop (by name)
    const existing = new Set((state.shop||[]).map(it=>it.name));
    let added = 0;
    catalog.forEach(it => {
      if(!existing.has(it.name)){
        state.shop.push({...it});
        added++;
      }
    });
    pushState(true);
    // Don't call full render() — just update shop display
    if(state.activeTab === 'shop') renderShop();
    showToast(`Added ${added} new items (${existing.size} already existed). Shop: ${state.shop.length} total.`, 'buy');
  });
  el('dmClearShop')?.addEventListener('click', ()=>{
    if(!confirm('Clear all shop items?')) return;
    state.shop = []; pushState(true);
    if(state.activeTab === 'shop') renderShop();
    showToast('Shop cleared', 'info');
  });
  el('dmShopAddBtn')?.addEventListener('click', ()=>{
    const name = el('dmShopItemName')?.value?.trim(); if(!name) return;
    state.shop.push({
      tier: Number(el('dmShopItemTier')?.value)||1,
      name, category: el('dmShopItemCat')?.value||'Consumables',
      price: Math.max(0, Number(el('dmShopItemPrice')?.value)||0),
      desc: el('dmShopItemDesc')?.value||'', stock:null
    });
    pushState(true); render();
    if(el('dmShopItemName')) el('dmShopItemName').value='';
    if(el('dmShopItemDesc')) el('dmShopItemDesc').value='';
    showToast(`Added "${name}" to shop`, 'buy');
  });

  // Gold awards
  el('dmGoldBtn')?.addEventListener('click', ()=>{
    const target = el('dmGoldTarget')?.value;
    const amount = Math.max(0, Number(el('dmGoldAmount')?.value) || 0);
    if(!amount){ showToast('Enter a gold amount','warn'); return; }
    if(target === 'all'){
      state.characters.filter(c=>c.state==='active').forEach(c=>{ c.points = (c.points||0)+amount; });
      showToast(`+${fmtGold(amount)} gold to all players`, 'info');
    } else {
      const c = state.characters[Number(target)]; if(!c) return;
      c.points = (c.points||0)+amount;
      showToast(`+${fmtGold(amount)} gold to ${c.name||'Player'}`, 'info');
    }
    pushState(true); render(); renderDmPanel();
  });
  el('dmGoldTakeBtn')?.addEventListener('click', ()=>{
    const target = el('dmGoldTarget')?.value;
    const amount = Math.max(0, Number(el('dmGoldAmount')?.value) || 0);
    if(!amount){ showToast('Enter a gold amount','warn'); return; }
    if(target === 'all'){
      state.characters.filter(c=>c.state==='active').forEach(c=>{ c.points = Math.max(0,(c.points||0)-amount); });
      showToast(`\u2212${fmtGold(amount)} gold from all players`, 'warn');
    } else {
      const c = state.characters[Number(target)]; if(!c) return;
      c.points = Math.max(0,(c.points||0)-amount);
      showToast(`\u2212${fmtGold(amount)} gold from ${c.name||'Player'}`, 'warn');
    }
    pushState(true); render(); renderDmPanel();
  });
  content.querySelectorAll('.dm-gold-preset').forEach(btn=>btn.addEventListener('click',()=>{
    const e = el('dmGoldAmount'); if(e) e.value = btn.dataset.gold;
  }));

  // EXP awards
  function awardExpFromDm(take=false){
    const target = el('dmExpTarget')?.value;
    const raw = Number(el('dmExpAmount')?.value) || 0;
    if(!raw){ showToast('Enter an EXP amount','warn'); return; }
    const amount = take ? -Math.abs(raw) : Math.abs(raw);
    const targets = target === 'all'
      ? state.characters.filter(c=>c.state==='active')
      : [state.characters[Number(target)]].filter(Boolean);
    targets.forEach(c => {
      if(amount > 0){
        const oldLvl = c.systemLevel || 1;
        const levelsGained = gainExp(c, amount);
        if(levelsGained > 0){
          showToast(`✦ ${c.name||'Player'} leveled up! System Lv.${oldLvl} → ${c.systemLevel}${c.level !== dndLevelFromSystem(oldLvl) ? ` (DnD Lv.${c.level}!)` : ''}`, 'buy');
        }
      } else {
        // Take EXP — reduce but don't go below 0
        c.exp = Math.max(0, (c.exp||0) + amount);
      }
    });
    const verb = amount > 0 ? `+${fmtGold(amount)}` : `${fmtGold(amount)}`;
    showToast(`${verb} EXP to ${target==='all'?'all players':targets[0]?.name||'Player'}`, amount>0?'info':'warn');
    pushState(true); render(); renderDmExpStatus();
  }
  el('dmExpBtn')?.addEventListener('click', ()=>awardExpFromDm(false));
  el('dmExpTakeBtn')?.addEventListener('click', ()=>awardExpFromDm(true));
  // Presets fill the amount input then award
  document.querySelectorAll('.dm-exp-preset').forEach(btn => btn.addEventListener('click', ()=>{
    const inp = el('dmExpAmount'); if(inp) inp.value = btn.dataset.exp;
    awardExpFromDm();
  }));
  renderDmExpStatus();

  // Scene + broadcast
  el('dmSceneName')?.addEventListener('input', e=>{ state.sceneName = e.target.value; pushState(); });
  el('dmBroadcastBtn')?.addEventListener('click', ()=>{
    state.broadcast = el('dmBroadcast')?.value||'';
    pushState(true); render();
    showToast('Broadcast sent', 'info');
  });

  // Skill Stone award
  el('dmSSAwardBtn')?.addEventListener('click', ()=>{
    const name = el('dmSSName')?.value?.trim(); if(!name){ showToast('Give the skill a name','warn'); return; }
    const targetIdx = Number(el('dmSSTarget')?.value);
    const c = state.characters[targetIdx]; if(!c){ showToast('Invalid target','warn'); return; }
    const stone = {
      id: 'ss-' + Date.now() + '-' + Math.random().toString(16).slice(2,6),
      name,
      type: el('dmSSType')?.value || 'Active',
      cost: el('dmSSCost')?.value || '—',
      cooldown: el('dmSSCooldown')?.value || '—',
      desc: el('dmSSDesc')?.value || '',
      element: el('dmSSElement')?.value || '',
      fromDm: true,
      fromPlayer: ''
    };
    if(!Array.isArray(c.skillStones)) c.skillStones = [];
    c.skillStones.push(stone);
    pushState(true);
    showToast(`💎 Skill Stone "${name}" awarded to ${c.name||'Player'}!`, 'buy');
    // Clear form
    ['dmSSName','dmSSCost','dmSSCooldown','dmSSElement','dmSSDesc'].forEach(id=>{ const e=el(id); if(e) e.value=''; });
    renderDmSkillStoneInventories();
  });

  renderDmSkillStoneInventories();

  // Custom Class creation
  el('dmCCCreateBtn')?.addEventListener('click', ()=>{
    const name = el('dmCCName')?.value?.trim();
    if(!name){ showToast('Give the class a name','warn'); return; }
    const id = 'custom_' + name.toLowerCase().replace(/[^a-z0-9]/g,'_').slice(0,20) + '_' + Date.now().toString(36);
    const bonuses = {};
    STATS.forEach(s => {
      const v = Number(el('dmCCBonus'+s)?.value) || 0;
      if(v > 0) bonuses[s] = v;
    });
    const skills = [];
    const sk1Name = el('dmCCSkill1Name')?.value?.trim();
    if(sk1Name) skills.push({ name:sk1Name, type:'Active', cost:el('dmCCSkill1Cost')?.value||'—', cooldown:'—', desc:el('dmCCSkill1Desc')?.value||'' });
    const sk2Name = el('dmCCSkill2Name')?.value?.trim();
    if(sk2Name) skills.push({ name:sk2Name, type:'Active', cost:el('dmCCSkill2Cost')?.value||'—', cooldown:'—', desc:el('dmCCSkill2Desc')?.value||'' });

    const newClass = {
      id, label: name,
      icon: el('dmCCIcon')?.value || '✦',
      color: el('dmCCColor')?.value || '#5aa8f5',
      primary: el('dmCCPrimary')?.value || 'STR',
      desc: el('dmCCDesc')?.value || '',
      bonuses,
      hitDie: Number(el('dmCCHitDie')?.value) || 8,
      hidden: el('dmCCHidden')?.checked || false,
      custom: true
    };
    if(!Array.isArray(state.customClasses)) state.customClasses = [];
    state.customClasses.push(newClass);
    if(skills.length) CLASS_BASIC_SKILLS[id] = skills;
    pushState(true);
    showToast(`🏷 Custom class "${name}" created!`, 'buy');
    ['dmCCName','dmCCDesc','dmCCSkill1Name','dmCCSkill1Cost','dmCCSkill1Desc','dmCCSkill2Name','dmCCSkill2Cost','dmCCSkill2Desc'].forEach(fid=>{ const e=el(fid); if(e) e.value=''; });
    STATS.forEach(s=>{ const e=el('dmCCBonus'+s); if(e) e.value='0'; });
    renderDmCustomClasses();
    buildDmPanelHtml(); renderDmPanel();
  });
  renderDmCustomClasses();

  // Quest creation
  el('dmQuestCreateBtn')?.addEventListener('click', ()=>{
    const name = el('dmQuestName')?.value?.trim();
    if(!name){ showToast('Give the quest a name','warn'); return; }
    const objText = (el('dmQuestObjectives')?.value||'').split('\n').filter(l=>l.trim());
    const itemsText = (el('dmQuestItems')?.value||'').split(',').map(s=>s.trim()).filter(Boolean);
    const quest = {
      id: 'quest-' + Date.now() + '-' + Math.random().toString(16).slice(2,6),
      name,
      type: el('dmQuestType')?.value || 'side',
      rank: el('dmQuestRank')?.value || 'E',
      status: 'available',
      desc: el('dmQuestDesc')?.value || '',
      objectives: objText.map(text => ({
        id: 'obj-' + Math.random().toString(16).slice(2,6),
        text, done: false
      })),
      rewards: {
        exp: Math.max(0, Number(el('dmQuestExp')?.value) || 0),
        gold: Math.max(0, Number(el('dmQuestGold')?.value) || 0),
        items: itemsText
      },
      assignedTo: el('dmQuestAssign')?.value === 'all' ? 'all' : [el('dmQuestAssign')?.value],
      timeLimit: el('dmQuestTimeLimit')?.value || '',
      dmNotes: '',
      completedBy: [],
      created: Date.now()
    };
    if(!Array.isArray(state.cases)) state.cases = [];
    state.cases.push(quest);
    pushState(true);
    showToast(`📜 Quest "${name}" created!`, 'buy');
    ['dmQuestName','dmQuestDesc','dmQuestObjectives','dmQuestExp','dmQuestGold','dmQuestItems','dmQuestTimeLimit'].forEach(id=>{
      const e = el(id); if(e) e.value = '';
    });
    renderDmQuestList();
  });
  renderDmQuestList();
}

function renderDmCustomClasses(){
  const host = el('dmCCList'); if(!host) return;
  const customs = state.customClasses || [];
  if(!customs.length){ host.innerHTML='<div class="dm-empty">No custom classes. Built-in classes are always available.</div>'; return; }
  host.innerHTML = customs.map((cc,i) => {
    const bonusStr = Object.entries(cc.bonuses||{}).filter(([,v])=>v>0).map(([k,v])=>`+${v} ${k}`).join(', ') || 'None';
    return `
    <div class="dm-cc-row" style="border-left-color:${cc.color}">
      <div class="dm-cc-top">
        <span style="font-size:1rem">${cc.icon}</span>
        <strong style="color:${cc.color}">${esc(cc.label)}</strong>
        <span class="dm-cc-meta">d${cc.hitDie} · ${cc.primary} · ${cc.hidden?'Hidden':'Visible'}</span>
        <button class="dm-quest-del" data-cci="${i}" title="Delete class">✕</button>
      </div>
      <div class="dm-cc-info">${esc(cc.desc||'No description')}</div>
      <div class="dm-cc-bonuses-display">Bonuses: ${bonusStr}</div>
    </div>`;
  }).join('');
  host.querySelectorAll('[data-cci]').forEach(btn=>btn.addEventListener('click',()=>{
    if(!confirm('Delete this custom class?')) return;
    state.customClasses.splice(+btn.dataset.cci, 1);
    pushState(true); renderDmCustomClasses();
    showToast('Custom class deleted','info');
  }));
}

function renderDmExpStatus(){
  const host = el('dmExpStatus'); if(!host) return;
  const chars = state.characters.filter(c => c.state === 'active');
  host.innerHTML = chars.map(c => {
    const sysLvl = c.systemLevel || 1;
    const expCur = expIntoCurrentLevel(c);
    const expNeed = expNeededForNextLevel(c);
    const pct = expNeed > 0 ? Math.min(100, (expCur / expNeed) * 100) : 0;
    return `
      <div class="dm-exp-row">
        <span class="dm-exp-name">${esc(c.name||'Unnamed')}</span>
        <span class="dm-exp-lvl">Sys.${sysLvl} <span style="color:var(--text-dim)">(DnD ${c.level||1})</span></span>
        <div class="dm-exp-bar"><div class="dm-exp-bar-fill" style="width:${pct}%"></div></div>
        <span class="dm-exp-nums">${fmtGold(expCur)} / ${fmtGold(expNeed)}</span>
      </div>`;
  }).join('') || '<div class="dm-empty">No active players.</div>';
}

function renderDmSkillStoneInventories(){
  const host = el('dmSSInventories'); if(!host) return;
  const chars = state.characters.filter(c => c.state === 'active');
  if(!chars.length){ host.innerHTML = '<div class="dm-empty">No active players.</div>'; return; }
  host.innerHTML = chars.map(c => {
    const stones = c.skillStones || [];
    return `
      <div class="dm-ss-player">
        <div class="dm-ss-player-name">${esc(c.name||'Unnamed')} <span class="dm-ss-count">${stones.length} stone${stones.length===1?'':'s'}</span></div>
        ${stones.length ? stones.map(s => `
          <div class="dm-ss-stone">
            <span class="dm-ss-stone-name">💎 ${esc(s.name)}</span>
            <span class="dm-ss-stone-type">${esc(s.type)}</span>
            ${s.element ? `<span class="dm-ss-stone-elem">${esc(s.element)}</span>` : ''}
            <button class="dm-ss-revoke" data-cid="${esc(c.id)}" data-sid="${esc(s.id)}" title="Revoke this stone">✕</button>
          </div>
        `).join('') : '<div class="dm-empty" style="padding:.3rem 0">No stones held.</div>'}
      </div>`;
  }).join('');
  host.querySelectorAll('.dm-ss-revoke').forEach(btn => btn.addEventListener('click', ()=>{
    const c = state.characters.find(x => x.id === btn.dataset.cid); if(!c) return;
    c.skillStones = (c.skillStones||[]).filter(s => s.id !== btn.dataset.sid);
    pushState(true); renderDmSkillStoneInventories();
    showToast('Skill stone revoked','info');
  }));
}

function unlockDm(){
  if(el('dmPasswordInput')?.value !== DM_PASS){ showToast('Access denied','warn'); return; }
  dmUnlocked = true; sessionStorage.setItem('dt-dm','1');
  buildDmPanelHtml();
  renderDmPanel();
  render();
}
function lockDm(){ dmUnlocked=false; sessionStorage.removeItem('dt-dm'); el('dmOverlay')?.classList.add('hidden'); render(); }
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
  const map = { currentHp:'hp.current', maxHp:'hp.max', currentMana:'mana.current', maxMana:'mana.max' };
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
  // GLOBAL SAFETY NET: whenever any field loses focus, push pending edits to the server
  // immediately so nothing is lost when leaving the page mid-edit.
  document.addEventListener('focusout', e=>{
    if(e.target && (e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA'||e.target.tagName==='SELECT'||e.target.isContentEditable)){
      flushPendingPush();
    }
  });
  ii('charName','name'); ii('charCodename','title');
  ii('charAge','age');
  ii('charBackground','background');
  ii('charSpeed','speed'); ii('charArmor','armor'); ii('charTempHp','tempHp');
  ii('currentHp','currentHp'); ii('maxHp','maxHp');
  ii('currentMana','currentMana'); ii('maxMana','maxMana');
  ii('notesArea','notesText');

  // Rank dropdown
  el('charClearance')?.addEventListener('change', e=>{ getChar().rank=e.target.value; pushState(true); render(); });

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
  el('addAbilityBtn')?.addEventListener('click', addAbility);

  // tab nav
  document.querySelectorAll('.tab-btn[data-tab]').forEach(b=> b.addEventListener('click', ()=>{ state.activeTab=b.dataset.tab; SFX.tab(); renderTabs(); }));

  // Auto-set HP/MP buttons
  el('autoSetHp')?.addEventListener('click', ()=>{
    const c = getChar();
    const suggested = calcSuggestedMaxHp(c);
    c.hp.max = suggested; c.hp.current = suggested;
    pushState(true); renderMainFields(); renderHeader(); renderStatusWindow();
    showToast(`Max HP set to ${suggested}`, 'info');
  });
  el('autoSetMp')?.addEventListener('click', ()=>{
    const c = getChar();
    const suggested = calcSuggestedMaxMana(c);
    c.mana.max = suggested; c.mana.current = suggested;
    pushState(true); renderMainFields(); renderHeader(); renderStatusWindow();
    showToast(`Max MP set to ${suggested}`, 'info');
  });

  // Keyboard shortcuts: Alt+1-9 for tabs
  document.addEventListener('keydown', e=>{
    if(!e.altKey || e.ctrlKey || e.metaKey) return;
    const ae = document.activeElement;
    if(ae && (ae.tagName==='INPUT'||ae.tagName==='TEXTAREA'||ae.tagName==='SELECT')) return;
    const tabs = ['profile','status','skills','loadout','abilities','cases','relations','shop','notes'];
    const idx = Number(e.key) - 1;
    if(idx >= 0 && idx < tabs.length){ e.preventDefault(); state.activeTab = tabs[idx]; renderTabs(); }
  });
  // DM nav (sub-tabs inside DM panel)
  document.querySelectorAll('.dm-nav-btn[data-dm]').forEach(b=> b.addEventListener('click', ()=>{
    document.querySelectorAll('.dm-nav-btn').forEach(x=>x.classList.remove('active'));
    document.querySelectorAll('.dm-section').forEach(x=>x.classList.remove('active'));
    b.classList.add('active'); SFX.tab();
    document.querySelector(`.dm-section[data-dm="${b.dataset.dm}"]`)?.classList.add('active');
  }));

  // DM controls
  el('dmTriggerBtn')?.addEventListener('click', openDmLogin);
  el('dmUnlockBtn')?.addEventListener('click', unlockDm);
  el('dmPasswordInput')?.addEventListener('keydown', e=>{ if(e.key==='Enter') unlockDm(); });
  el('dmCloseBtn')?.addEventListener('click', closeDmOverlay);
  el('dmCloseBtn2')?.addEventListener('click', closeDmOverlay);
  el('dmLockBtn')?.addEventListener('click', lockDm);
  el('addShopItemBtn')?.addEventListener('click', addShopItem);
  el('dmAddAgentBtn')?.addEventListener('click', dmAddAgent);
  el('dmBroadcastSendBtn')?.addEventListener('click', ()=>{
    const msg = el('dmBroadcastInput')?.value.trim();
    if(!msg){ showToast('Enter a broadcast message','warn'); return; }
    sendBroadcast(msg);
    if(el('dmBroadcastInput')) el('dmBroadcastInput').value='';
    showToast('Broadcast transmitted to all terminals','info');
  });
  el('dmBroadcastClearBtn')?.addEventListener('click', ()=>{ clearBroadcast(); removeBroadcastScreen(); });
  // live typing SFX on the broadcast composer (terminal feel)
  el('dmBroadcastInput')?.addEventListener('keydown', e=>{ if(e.key.length===1||e.key==='Backspace') SFX.key(); });

  // New feature bindings
  el('sfxToggle')?.addEventListener('click', toggleSfx);
  el('knockBtn')?.addEventListener('click', sendKnock);
  document.querySelectorAll('.site-alert-btn[data-alert]').forEach(b=> b.addEventListener('click', ()=> setSiteAlert(b.dataset.alert)));
  el('dmCommendTarget')?.addEventListener('change', ()=>{});
  document.querySelectorAll('.bulk-btn[data-bulk]').forEach(b=> b.addEventListener('click', ()=> bulkApply(b.dataset.bulk)));
  el('reqSubmitBtn')?.addEventListener('click', submitRequest);
  el('reqItemName')?.addEventListener('keydown', e=>{ if(e.key==='Enter') submitRequest(); });
  el('dmClearRequestsBtn')?.addEventListener('click', clearResolvedRequests);

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
      // Doc exists. Start listening.
      startListener();
      return;
    }
    // No doc yet — create a blank one. Don't auto-load shop (DM does it manually).
    const pushData = { ...state };
    delete pushData.activeTab;
    delete pushData.selectedCharacter;
    await setDoc(doc(db,'campaigns',DOC), { data: JSON.stringify(pushData) });
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

// New systems init
// reflect saved SFX preference on the toggle
(function(){ const b=el('sfxToggle'); if(b && !_sfxEnabled){ b.classList.add('off'); b.textContent='♪ SFX OFF'; } })();
// idle corruption: any interaction resets the timer
['mousemove','keydown','click','touchstart','scroll'].forEach(ev=> document.addEventListener(ev, resetIdle, {passive:true}));
resetIdle();
document.addEventListener('click', ()=>{ _ac(); if(_sfxEnabled) startAmbient(); }, { once:true });
startKnockListener();

// ═══════════════════════════════════════════════════════════════════
// TOOLTIP SYSTEM — global, delegated, system-UI styling
// Any element with data-tt="text" gets a floating tooltip on hover.
// ═══════════════════════════════════════════════════════════════════
(function initTooltips(){
  const tt = document.createElement('div');
  tt.className = 'dt-tooltip';
  tt.setAttribute('aria-hidden','true');
  document.body.appendChild(tt);

  let showTimer = null;
  let currentTarget = null;

  function position(target){
    const r = target.getBoundingClientRect();
    // Prefer above the target, centered
    const ttR = tt.getBoundingClientRect();
    let left = r.left + r.width/2 - ttR.width/2;
    let top  = r.top - ttR.height - 10;
    let side = 'top';
    // Flip below if there isn't room above
    if (top < 8) {
      top = r.bottom + 10;
      side = 'bottom';
    }
    // Clamp horizontally
    const pad = 10;
    if (left < pad) left = pad;
    if (left + ttR.width > window.innerWidth - pad) left = window.innerWidth - pad - ttR.width;
    tt.style.left = left + 'px';
    tt.style.top  = top + 'px';
    tt.dataset.side = side;
  }

  document.addEventListener('mouseover', e => {
    const target = e.target.closest?.('[data-tt]');
    if (!target || target === currentTarget) return;
    const text = target.dataset.tt;
    if (!text) return;
    currentTarget = target;
    clearTimeout(showTimer);
    showTimer = setTimeout(() => {
      tt.textContent = text;
      tt.classList.add('show');
      // Position AFTER text is set so the size is correct
      requestAnimationFrame(() => position(target));
    }, 320);
  });

  document.addEventListener('mouseout', e => {
    const target = e.target.closest?.('[data-tt]');
    if (!target || target !== currentTarget) return;
    // Only hide if we're leaving the tooltip-owner element entirely
    if (e.relatedTarget && target.contains(e.relatedTarget)) return;
    clearTimeout(showTimer);
    currentTarget = null;
    tt.classList.remove('show');
  });

  // Hide on scroll or click (prevents stale tooltips)
  document.addEventListener('scroll', () => { tt.classList.remove('show'); currentTarget = null; }, {capture:true, passive:true});
  document.addEventListener('mousedown', () => { tt.classList.remove('show'); currentTarget = null; });
})();
