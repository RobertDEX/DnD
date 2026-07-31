window.MAW_DEFAULT_SHOP = [
  // ───────────────── CONSUMABLES ─────────────────
  {tier:1,category:'Consumables',name:'Minor Health Potion',price:50,desc:'Restores 2d4+2 HP. A staple of any adventurer\'s kit.',icon:'🧪',rarity:'common'},
  {tier:1,category:'Consumables',name:'Minor Mana Potion',price:75,desc:'Restores 15 Mana. Tastes like lightning and blueberries.',icon:'🧪',rarity:'common'},
  {tier:1,category:'Consumables',name:'Stamina Draught',price:40,desc:'Removes the Exhaustion condition. Bitter but effective.',icon:'🧪',rarity:'common'},
  {tier:1,category:'Consumables',name:'Antidote Vial',price:60,desc:'Cures Poison. Carry several in serpent-infested floors.',icon:'🧪',rarity:'common'},
  {tier:2,category:'Consumables',name:'Health Potion',price:200,desc:'Restores 4d4+4 HP. Standard-grade alchemical healing.',icon:'🧪',rarity:'uncommon'},
  {tier:2,category:'Consumables',name:'Mana Potion',price:250,desc:'Restores 40 Mana. Essential for long dungeon runs.',icon:'🧪',rarity:'uncommon'},
  {tier:2,category:'Consumables',name:'Elixir of Clarity',price:350,desc:'Grants advantage on INT-based checks for 1 hour.',icon:'✨',rarity:'uncommon'},
  {tier:3,category:'Consumables',name:'Greater Health Potion',price:800,desc:'Restores 8d4+8 HP. Top-shelf restoration.',icon:'🧪',rarity:'rare'},
  {tier:3,category:'Consumables',name:'Greater Mana Potion',price:900,desc:'Restores 80 Mana. Liquid starlight.',icon:'🧪',rarity:'rare'},
  {tier:3,category:'Consumables',name:'Phoenix Down',price:2000,desc:'Revives a fallen ally with 1 HP. Single use. Irreplaceable.',icon:'🪶',rarity:'rare'},
  {tier:4,category:'Consumables',name:'Elixir of Life',price:5000,desc:'Fully restores HP and Mana. Removes all conditions.',icon:'💎',rarity:'epic'},

  // ───────────────── WEAPONS ─────────────────
  {tier:1,category:'Weapons',name:'Iron Shortsword',price:100,desc:'+1 to attack rolls. A reliable starter blade.',icon:'⚔',rarity:'common',stats:'+1 ATK'},
  {tier:1,category:'Weapons',name:'Wooden Staff',price:80,desc:'+1 to spell attack rolls. A conduit for mana.',icon:'🪄',rarity:'common',stats:'+1 Spell ATK'},
  {tier:1,category:'Weapons',name:'Hunting Bow',price:120,desc:'Range 80/320. +1 to ranged attack rolls.',icon:'🏹',rarity:'common',stats:'+1 ATK'},
  {tier:2,category:'Weapons',name:'Steel Longsword',price:500,desc:'+2 to attack rolls. 1d10 slashing.',icon:'⚔',rarity:'uncommon',stats:'+2 ATK'},
  {tier:2,category:'Weapons',name:'Mage\'s Focus Crystal',price:600,desc:'+2 to spell attacks and spell save DC.',icon:'🔮',rarity:'uncommon',stats:'+2 Spell ATK'},
  {tier:2,category:'Weapons',name:'Knight Killer',price:750,desc:'Dagger. +3 to attack vs armored targets. Ignores 2 AC.',icon:'🗡',rarity:'uncommon',stats:'+3 vs Heavy Armor'},
  {tier:3,category:'Weapons',name:'Flamebrand',price:2500,desc:'+3 to attack. +1d6 fire damage. Sheds bright light 40ft.',icon:'🔥',rarity:'rare',stats:'+3 ATK +1d6 fire'},
  {tier:3,category:'Weapons',name:'Frostbite Bow',price:2800,desc:'+3 ranged. +1d6 cold damage. Slows target on hit.',icon:'❄',rarity:'rare',stats:'+3 ATK +1d6 cold'},
  {tier:3,category:'Weapons',name:'Staff of the Archmage',price:3500,desc:'+3 spell attacks. Reduces spell mana cost by 20%.',icon:'🪄',rarity:'rare',stats:'+3 Spell, -20% Mana cost'},
  {tier:4,category:'Weapons',name:'Excalibur',price:15000,desc:'+5 to attack. +2d6 radiant damage. Only the worthy may wield it.',icon:'⚔',rarity:'epic',stats:'+5 ATK +2d6 radiant'},
  {tier:4,category:'Weapons',name:'Shadow Monarch\'s Dagger',price:20000,desc:'+5 to attack. Grants invisibility for 6 seconds after a kill.',icon:'🗡',rarity:'legendary',stats:'+5 ATK, Stealth Kill'},

  // ───────────────── ARMOR ─────────────────
  {tier:1,category:'Armor',name:'Leather Armor',price:100,desc:'AC 11 + DEX mod. Light and flexible.',icon:'🛡',rarity:'common',stats:'AC 11+DEX'},
  {tier:1,category:'Armor',name:'Cloth Robes',price:80,desc:'AC 10 + INT mod. +5 max Mana.',icon:'👘',rarity:'common',stats:'AC 10+INT, +5 Mana'},
  {tier:2,category:'Armor',name:'Chainmail',price:400,desc:'AC 16. Heavy. Disadvantage on Stealth.',icon:'🛡',rarity:'uncommon',stats:'AC 16'},
  {tier:2,category:'Armor',name:'Enchanted Robes',price:500,desc:'AC 12 + INT mod. +15 max Mana. Mana regen +2/turn.',icon:'👘',rarity:'uncommon',stats:'AC 12+INT, +15 Mana'},
  {tier:3,category:'Armor',name:'Mithril Plate',price:3000,desc:'AC 18. No Stealth disadvantage. Featherlight.',icon:'🛡',rarity:'rare',stats:'AC 18'},
  {tier:3,category:'Armor',name:'Archmage\'s Vestments',price:3200,desc:'AC 14 + INT mod. +30 max Mana. Spell resistance.',icon:'👘',rarity:'rare',stats:'AC 14+INT, +30 Mana'},
  {tier:4,category:'Armor',name:'Dragon Scale Armor',price:12000,desc:'AC 20. Fire/Cold resistance. Legendary heirloom.',icon:'🛡',rarity:'epic',stats:'AC 20, Fire/Cold Resist'},

  // ───────────────── ACCESSORIES ─────────────────
  {tier:1,category:'Accessories',name:'Ring of Minor Protection',price:150,desc:'+1 AC. A simple warding ring.',icon:'💍',rarity:'common',stats:'+1 AC'},
  {tier:1,category:'Accessories',name:'Amulet of Health',price:200,desc:'+5 max HP.',icon:'📿',rarity:'common',stats:'+5 HP'},
  {tier:2,category:'Accessories',name:'Ring of Mana',price:400,desc:'+20 max Mana.',icon:'💍',rarity:'uncommon',stats:'+20 Mana'},
  {tier:2,category:'Accessories',name:'Boots of Swiftness',price:500,desc:'+10ft movement speed. Advantage on DEX saves.',icon:'👢',rarity:'uncommon',stats:'+10ft Speed'},
  {tier:3,category:'Accessories',name:'Cloak of Shadows',price:2000,desc:'+2 AC in dim light. Advantage on Stealth.',icon:'🧥',rarity:'rare',stats:'+2 AC (dim), Stealth Adv'},
  {tier:3,category:'Accessories',name:'Crown of Intellect',price:2500,desc:'INT becomes 19 if lower. +10 max Mana.',icon:'👑',rarity:'rare',stats:'INT 19, +10 Mana'},
  {tier:4,category:'Accessories',name:'Ring of the Monarch',price:10000,desc:'+3 to all saves. +30 HP. +30 Mana.',icon:'💍',rarity:'legendary',stats:'+3 saves, +30 HP/MP'},

  // ───────────────── SKILL STONES ─────────────────
  {tier:2,category:'Skill Stones',name:'Skill Stone: Fireball',price:1500,desc:'Teaches the Fireball spell. 8d6 fire damage in a 20ft sphere. Costs 30 Mana.',icon:'🔴',rarity:'rare',stats:'30 MP, 8d6 fire'},
  {tier:2,category:'Skill Stones',name:'Skill Stone: Heal',price:1200,desc:'Teaches the Heal spell. Restores 4d8+WIS HP to one target. Costs 25 Mana.',icon:'🟢',rarity:'rare',stats:'25 MP, 4d8+WIS HP'},
  {tier:2,category:'Skill Stones',name:'Skill Stone: Shield Bash',price:800,desc:'Teaches Shield Bash. Stuns target for 1 round. Costs 15 Mana.',icon:'🔵',rarity:'uncommon',stats:'15 MP, Stun 1rd'},
  {tier:3,category:'Skill Stones',name:'Skill Stone: Meteor Strike',price:5000,desc:'Teaches Meteor Strike. 12d6 fire damage in 40ft. Costs 60 Mana.',icon:'🔴',rarity:'epic',stats:'60 MP, 12d6 fire'},
  {tier:3,category:'Skill Stones',name:'Skill Stone: Resurrection',price:6000,desc:'Teaches Resurrection. Revives a dead ally to full HP. Costs 100 Mana.',icon:'🟡',rarity:'epic',stats:'100 MP, Full revive'},
  {tier:3,category:'Skill Stones',name:'Skill Stone: Shadow Step',price:3000,desc:'Teaches Shadow Step. Teleport up to 60ft to an unoccupied space. Costs 20 Mana.',icon:'⚫',rarity:'rare',stats:'20 MP, 60ft teleport'},
  {tier:4,category:'Skill Stones',name:'Skill Stone: Ruler\'s Authority',price:25000,desc:'Teaches Ruler\'s Authority. Telekinesis — move any object/creature up to 300lbs. Costs 40 Mana per use.',icon:'👁',rarity:'legendary',stats:'40 MP, Telekinesis'},

  // ───────────────── LOOT BOXES ─────────────────
  {tier:2,category:'Loot Boxes',name:'Blessed Random Box',price:1000,desc:'Obtain an item you WANT. The System reads your desires and manifests accordingly. Contents scale to your level.',icon:'📦',rarity:'rare'},
  {tier:3,category:'Loot Boxes',name:'Cursed Random Box',price:500,desc:'Obtain an item you NEED. The System sees what you lack and provides — whether you like it or not. Results can be... unexpected.',icon:'📦',rarity:'uncommon'},
  {tier:4,category:'Loot Boxes',name:'Monarch\'s Chest',price:10000,desc:'Guaranteed Legendary-tier item. Equipment, weapon, or skill stone. The rarest drops in the System.',icon:'👑',rarity:'legendary'},
];
