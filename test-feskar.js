import fs from 'fs';
import { formatBattleReport } from './reportFormat.js';
import { applyEffect, hasEffect, getEffect } from './effects.js';
import { getDealerType } from './positionSystem.js';
import { VANGUARD_NAMES } from './vanguardNames.js';
import { dummy, loadKit, setup, dumpEngine, check, checks, rN, rFmt } from './test-feskar-harness.js';


const kitCmd = JSON.parse(fs.readFileSync('./data/feskar_vanguard_command.json', 'utf8'));
const kitHab = JSON.parse(fs.readFileSync('./data/feskar_habits.json', 'utf8'));

check('JSON command name Calculated Assault', kitCmd.name === 'Calculated Assault');
check('JSON no Emerald Inferno on command', !JSON.stringify(kitCmd.command).includes('fire') && !JSON.stringify(kitCmd.command).includes('Emerald'));
check('JSON vanguard STR/INT/INST fixed 15', kitCmd.vanguard[0].actions[0].mods.every(m => m.fixed === 15) && kitCmd.vanguard[0].actions[0].mods.map(m => m.stat).join() === 'str,int,inst');
check('JSON vanguard right flank slot 2 -8%', kitCmd.vanguard[0].actions[1].mods[0].stat === 'dmg_received' && kitCmd.vanguard[0].actions[1].mods[0].pct === -8 && kitCmd.vanguard[0].actions[1].tgt.slot === 2);
check('JSON shred highest_str -12% 20% 2r excludeBasic', kitCmd.command[0].actions[0].mods[0].stat === 'physical_dealt' && kitCmd.command[0].actions[0].mods[0].pct === -12 && kitCmd.command[0].actions[0].chance === 20 && kitCmd.command[0].actions[0].dur === 2 && kitCmd.command[0].actions[0].excludeBasic === true && kitCmd.command[0].actions[0].tgt.select === 'highest_str');
check('JSON tactical 100% lowest_troops R2,4,7,9', kitCmd.command[1].rounds.join() === '2,4,7,9' && kitCmd.command[1].actions[0].dt === 'tactical' && kitCmd.command[1].actions[0].pct === 100 && kitCmd.command[1].actions[0].tgt.select === 'lowest_troops');
check('JSON Resilient Bond table -6.5 not prose -7', kitHab.habits[0].scaling[0].values[0] === -6.5 && kitHab.habits[0].structured[0].actions[0].mods[0].pct[0] === -6.5);
check('JSON Resilient Bond linkedRetreated', kitHab.habits[0].structured[1].requires.linkedRetreated === 'resilient_bond_ally');
check('JSON Insightful Allies scaleStat inst 3 allies', kitHab.habits[1].structured[0].actions[0].scaleStat === 'inst' && kitHab.habits[1].structured[0].actions[0].tgt.count === 3);
check('JSON Emerald Inferno habit-mod fire 1.5x burn dealer:physical', kitHab.habits[2].name === 'Emerald Inferno' && kitHab.habits[2].structured[0].requires.command === 'Calculated Assault' && kitHab.habits[2].structured[0].rounds.join() === '3,5,8,10' && kitHab.habits[2].structured[0].actions[0].dt === 'fire' && kitHab.habits[2].structured[0].actions[0].ifBonus.mult === 1.5 && kitHab.habits[2].structured[0].actions[0].tgt.select === 'dealer:physical');
check('JSON Quick-Witted INT INIT 16%', kitHab.habits[3].structured[0].actions[0].mods[0].stat === 'int' && kitHab.habits[3].structured[0].actions[0].mods[1].stat === 'init' && kitHab.habits[3].structured[0].actions[0].mods[0].pct[0] === 16);
check('JSON Unyielding Grasp 10% stagger 3r prefer warrior', kitHab.habits[4].structured[0].actions[0].st === 'stagger' && kitHab.habits[4].structured[0].actions[0].dur === 3 && kitHab.habits[4].structured[0].actions[0].chance[0] === 10 && kitHab.habits[4].structured[0].actions[0].tgt.select === 'prefer_class:warrior');
check('vanguardNames Feskar Champion\'s Brilliance', VANGUARD_NAMES.feskar === "Champion's Brilliance");
