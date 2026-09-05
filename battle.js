import { Battle } from './battle-engine.js';
import { applyEngineHooks } from './hook-engine.js';
import { applyVanguardLabel } from './hook-vanguard-label.js';

applyEngineHooks(Battle);
applyVanguardLabel(Battle);

export { Battle };
