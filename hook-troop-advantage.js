// hook-troop-advantage.js — run once: node hook-troop-advantage.js
import { readFileSync, writeFileSync } from 'fs';

const path = 'utils.js';
let text = readFileSync(path, 'utf8');

const importLine = "import { troopAdvantageMultiplier } from './troopAdvantage.js';\n";
if (!text.includes("from './troopAdvantage.js'")) {
  if (text.startsWith('// utils.js')) {
    text = text.replace('// utils.js\n', '// utils.js\n\n' + importLine);
  } else {
    text = importLine + text;
  }
}

const hook = '  finalDamage *= troopAdvantageMultiplier(attacker, defender);\n';
if (!text.includes('troopAdvantageMultiplier(attacker, defender)')) {
  const needle = '  if (typeof defender.getReceivedMultiplier === \'function\') {\n    finalDamage *= defender.getReceivedMultiplier(damageType, flags);\n  }\n  return finalDamage;';
  const put = '  if (typeof defender.getReceivedMultiplier === \'function\') {\n    finalDamage *= defender.getReceivedMultiplier(damageType, flags);\n  }\n' + hook + '  return finalDamage;';
  if (!text.includes(needle)) {
    console.error('hook-troop-advantage: bloco applyDamageMultipliers nao encontrado');
    process.exit(1);
  }
  text = text.replace(needle, put);
}

writeFileSync(path, text);
console.log('hook-troop-advantage: utils.js atualizado');
