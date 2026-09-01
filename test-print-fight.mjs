import fs from 'fs';
import { Character } from './character.js';
import { Battle } from './battle.js';
import { applyEngineHooks } from './hook-engine.js';
import { applyPreparations } from './hook-preparations.js';
import { loadDragonHabitsSync, loadCommandSync } from './habitParser.js';

applyEngineHooks(Battle);

const db = JSON.parse(fs.readFileSync('./data/dragons.json', 'utf8'));
const byId = Object.fromEntries((db.dragons || db).map(d => [d.id, d]));

function loadKit(character) {
  const habitPath = `./data/${character.id}_habits.json`;
  const cmdPath = `./data/${character.id}_vanguard_command.json`;
  if (fs.existsSync(habitPath)) {
    character.setHabits(loadDragonHabitsSync(JSON.parse(fs.readFileSync(habitPath, 'utf8')), character.id));
  }
  if (fs.existsSync(cmdPath)) {
    const kit = loadCommandSync(JSON.parse(fs.readFileSync(cmdPath, 'utf8')), character.id);
    character.commandName = kit.name;
    character.setCommandKit(kit.command);
    character.setVanguardKit(kit.vanguard);
  }
}

function make(id, team, slot, stars, habitRank, habitRanks) {
  const data = byId[id];
  if (!data) throw new Error('missing ' + id);
  const c = new Character(data, team, slot, { level: 50, stars, habitRank, habitRanks });
  loadKit(c);
  return c;
}

const teamA = [
  make('rhysarion', 0, 0, 4, 1, { 'Ebbing Fury': 4, 'Sharp Resolve': 1 }),
  make('malachite', 0, 1, 1, 1),
  make('vhagar', 0, 2, 1, 1)
];
teamA.forEach(c => c.setTroopType('shieldbearers'));

const teamB = [
  make('syrax', 1, 0, 5, 1),
  make('vaeldra', 1, 1, 7, 1),
  make('daemoros', 1, 2, 4, 1)
];
teamB.forEach(c => c.setTroopType('archers'));

const prepA = ` [ Champion: Damage ] (4.623%)
[ All Breeds: Strength ] (34.37%)
[ Shieldbearers: Incoming Damage ] (-16%)
[ All Breeds: Intelligence ] (34.37%)
[ Champion: Incoming Damage ] (-17.793%)
[ Shieldbearers: Damage ] (21%)
[ All Breeds: Initiative ] (43.13%)
[ All Breeds: Instinct ] (40.37%)
[ Sentinel: Damage ] (4.623%)
[ Sentinel: Incoming Damage ] (-20.289%)
[ Warrior: Damage ] (7.781%)
[ Warrior: Incoming Damage ] (-15.793%) `;

const prepB = ` [ All Breeds: Strength ] (40%)
[ Archers: Damage ] (16%)
[ Sentinel: Damage ] (28.476%)
[ All Breeds: Intelligence ] (40%)
[ Archers: Incoming Damage ] (-16%)
[ Sentinel: Incoming Damage ] (-18.789%)
[ All Breeds: Initiative ] (40%)
[ All Breeds: Instinct ] (40%)
[ Warrior: Damage ] (28.476%)
[ Warrior: Incoming Damage ] (-23.265%) `;

applyPreparations(teamA, prepA);
applyPreparations(teamB, prepB);

const battle = new Battle(teamA, teamB, {
  verbose: false,
  defendingTeam: 1,
  teamTroop: ['shieldbearers', 'archers']
});
battle.start();
while (battle.isActive && !battle.isFinished) battle.runRound();

const log = battle.getLog();
const syrax = (log.match(/Deals (\d+) Tactical Damage[\s\S]{0,40}Rhysarion/) || [])[1];
const dawn = [...log.matchAll(/Deals (\d+) Physical Damage[\s\S]{0,40}Syrax/g)].map(m => m[1]);
const rally = [...log.matchAll(/\+(\d+) Troop Capacity/g)].map(m => Number(m[1]));
const maxRally = rally.length ? Math.max(...rally) : 0;

function line(team) {
  return team.map(c => `${c.name}:${Math.round(c.currentHealth)}/${Math.round(c.maxHealth)}`).join(' ');
}
const tot = t => t.reduce((s, c) => s + c.currentHealth, 0);
const cap = t => t.reduce((s, c) => s + c.maxHealth, 0);
const aLost = 1 - tot(teamA) / cap(teamA);
const bLost = 1 - tot(teamB) / cap(teamB);

console.log('winner', battle.winner || 'draw', battle.endReason);
console.log('A', line(teamA), 'lost', (aLost * 100).toFixed(1) + '%');
console.log('B', line(teamB), 'lost', (bLost * 100).toFixed(1) + '%');
console.log('syraxHit', syrax || 'n/a');
console.log('dawnsongHits', dawn.join(',') || 'n/a');
console.log('maxRally', maxRally);
