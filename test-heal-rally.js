import { Character } from './character.js';
import { Battle } from './battle.js';
import { applyEngineHooks } from './hook-engine.js';
import { loadCommandSync } from './habitParser.js';
import fs from 'fs';

applyEngineHooks(Battle);

const cmd = JSON.parse(fs.readFileSync('./data/malachite_vanguard_command.json', 'utf8'));
const mal = new Character({
  id: 'malachite', name: 'Malachite', breed: 'Sentinel', rarity: 'Legendary',
  stats: { str: 52, inst: 61, int: 48, init: 55 }, affinity: [], weaknesses: []
}, 0, 1, { level: 50, stars: 1, habitRank: 1 });
mal.setTroopType('shieldbearers');
const kit = loadCommandSync(cmd, 'malachite');
mal.setCommandKit(kit.command);
mal.setVanguardKit(kit.vanguard);

const dummy = new Character({
  id: 'rhys', name: 'Rhysarion', breed: 'Champion', rarity: 'Legendary',
  stats: { str: 50, inst: 50, int: 50, init: 40 }, affinity: [], weaknesses: []
}, 0, 0, { level: 50, stars: 4, habitRank: 1 });
dummy.setTroopType('shieldbearers');

const foe = new Character({
  id: 'syrax', name: 'Syrax', breed: 'Sentinel', rarity: 'Legendary',
  stats: { str: 40, inst: 40, int: 60, init: 50 }, affinity: [], weaknesses: []
}, 1, 0, { level: 50, stars: 5, habitRank: 1 });
foe.setTroopType('archers');

mal.maxHealth = 5000; mal.currentHealth = 2000;
dummy.maxHealth = 6000; dummy.currentHealth = 3000;
foe.maxHealth = 6500; foe.currentHealth = 6500;

const battle = new Battle([dummy, mal], [foe], { verbose: false, defendingTeam: 1 });
battle.currentRound = 3;
mal.habitRank = 1;
battle.executeKit(mal, mal.commandKit, 'turn', 3, "Warden's Rally");

const healedMal = mal.currentHealth - 2000;
const healedAlly = dummy.currentHealth - 3000;
const okMal = healedMal > 0 && healedMal < 800;
const okAlly = healedAlly > 0 && healedAlly < 800;
const notFull = mal.currentHealth < mal.maxHealth && dummy.currentHealth < dummy.maxHealth;

console.log('mal', mal.currentHealth + '/' + mal.maxHealth, 'gained', healedMal);
console.log('ally', dummy.currentHealth + '/' + dummy.maxHealth, 'gained', healedAlly);
console.log(okMal && okAlly && notFull ? 'PASS rally-does-not-fill-cap' : 'FAIL rally-does-not-fill-cap');
process.exit(okMal && okAlly && notFull ? 0 : 1);
