// data.js
// Responsabilidade: Carregar, validar e expor os dados dos dragões

let dragonsDatabase = null;

async function loadDragons() {
  const paths = [
    './data/dragons.json',
    './dragons.json',
    '../data/dragons.json'
  ];

  for (let path of paths) {
    try {
      const response = await fetch(path);
      if (!response.ok) continue;
      
      dragonsDatabase = await response.json();
      console.log(`✓ ${dragonsDatabase.dragons.length} dragões carregados de ${path}`);
      return dragonsDatabase;
    } catch (error) {
      console.log(`Tentando próximo caminho... (falhou: ${path})`);
      continue;
    }
  }

  console.error('Falha ao carregar dragons.json de qualquer caminho');
  return null;
}

function getDragon(dragonId) {
  if (!dragonsDatabase || !dragonsDatabase.dragons) {
    console.error('Base de dragões não carregada');
    return null;
  }
  return dragonsDatabase.dragons.find(d => d.id === dragonId);
}

function getAllDragons() {
  if (!dragonsDatabase || !dragonsDatabase.dragons) {
    console.error('Base de dragões não carregada');
    return [];
  }
  return dragonsDatabase.dragons;
}

function getDragonsByRarity(rarity) {
  const all = getAllDragons();
  return all.filter(d => d.rarity === rarity);
}

function getDragonsByBreed(breed) {
  const all = getAllDragons();
  return all.filter(d => d.breed === breed);
}

function validateDragon(dragon) {
  const required = ['id', 'name', 'stats', 'habits', 'vanguardText', 'commandText'];
  for (let field of required) {
    if (!dragon[field]) {
      console.warn(`Dragão ${dragon.name} falta campo: ${field}`);
      return false;
    }
  }
  const statsRequired = ['str', 'inst', 'int', 'init'];
  for (let stat of statsRequired) {
    if (typeof dragon.stats[stat] !== 'number') {
      console.warn(`Dragão ${dragon.name} stat inválido: ${stat}`);
      return false;
    }
  }
  return true;
}

export { loadDragons, getDragon, getAllDragons, getDragonsByRarity, getDragonsByBreed, validateDragon };
