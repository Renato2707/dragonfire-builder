import { EFFECTS_CATALOG } from './effects.js';

export function applyExtraStatuses() {
  if (EFFECTS_CATALOG.SOLAR_FLARE) return;
  EFFECTS_CATALOG.SOLAR_FLARE = {
    id: 'solar_flare',
    name: 'Solar Flare',
    category: 'negative',
    description: 'Starshower mark',
    duration: 99,
    stackable: false,
    stackCap: 1,
    combatLong: true
  };
  EFFECTS_CATALOG.PROTECT = {
    id: 'protect',
    name: 'Protect',
    category: 'positive',
    description: 'Vermithor protect',
    duration: 2,
    stackable: false,
    stackCap: 1
  };
}
