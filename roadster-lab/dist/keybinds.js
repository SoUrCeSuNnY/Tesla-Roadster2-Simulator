export const DEFAULT_BINDINGS = Object.freeze({
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
  pitchDown: 'KeyW', pitchUp: 'KeyS', rollLeft: 'KeyQ', rollRight: 'KeyE',
  lift: 'Space', boost: 'ShiftLeft', reset: 'KeyR', camera: 'KeyC'
});

export const DEFAULT_INVERSIONS = Object.freeze({pitch:false,yaw:false,roll:false});

export const ACTIONS = Object.freeze([
  {id: 'forward', label: 'Forward', context: 'Ground'},
  {id: 'back', label: 'Reverse', context: 'Ground'},
  {id: 'left', label: 'Steer / yaw left', context: 'Shared'},
  {id: 'right', label: 'Steer / yaw right', context: 'Shared'},
  {id: 'pitchDown', label: 'Pitch down', context: 'Flight'},
  {id: 'pitchUp', label: 'Pitch up', context: 'Flight'},
  {id: 'rollLeft', label: 'Roll left', context: 'Flight'},
  {id: 'rollRight', label: 'Roll right', context: 'Flight'},
  {id: 'lift', label: 'Lift', context: 'Shared'},
  {id: 'boost', label: 'Boost', context: 'Shared'},
  {id: 'reset', label: 'Reset', context: 'Shared'},
  {id: 'camera', label: 'Camera', context: 'Shared'}
].map(action => Object.freeze(action)));

const STORAGE_KEY = 'roadster.keybinds.v1';
const CODE_PATTERN = /^(?:Key[A-Z]|Digit[0-9]|F(?:[1-9]|1[0-9]|2[0-4])|Arrow(?:Up|Down|Left|Right)|(?:Shift|Control|Alt|Meta)(?:Left|Right)|Numpad(?:[0-9]|Add|Subtract|Multiply|Divide|Decimal|Enter|Equal|Comma|ParenLeft|ParenRight|Backspace|Clear|ClearEntry|Hash|Star|MemoryAdd|MemoryClear|MemoryRecall|MemoryStore|MemorySubtract)|Space|Enter|Backspace|Delete|Insert|Home|End|PageUp|PageDown|CapsLock|NumLock|ScrollLock|PrintScreen|Pause|ContextMenu|Backquote|Backslash|BracketLeft|BracketRight|Comma|Equal|Minus|Period|Quote|Semicolon|Slash|IntlBackslash|IntlRo|IntlYen|Convert|NonConvert|KanaMode|Lang[1-5]|Help|Again|Copy|Cut|Find|Open|Paste|Props|Select|Undo|AudioVolume(?:Up|Down|Mute)|Media(?:PlayPause|Stop|TrackNext|TrackPrevious|Select)|Browser(?:Back|Forward|Refresh|Stop|Search|Favorites|Home)|Launch(?:Mail|App1|App2)|Eject|Power|Sleep|WakeUp)$/;
const validCode = code => typeof code === 'string' && CODE_PATTERN.test(code);
const validAction = action => typeof action === 'string' &&
  Object.prototype.hasOwnProperty.call(DEFAULT_BINDINGS, action);

// Modifiers are deliberately side-independent: binding ShiftRight stores ShiftLeft,
// and either physical Shift triggers it. Control, Alt and Meta follow the same rule.
const normalize = code => code.replace(/^(Shift|Control|Alt|Meta)Right$/, '$1Left');

function defaultStorage() {
  try { return globalThis.localStorage; } catch { return null; }
}

export function formatKey(code) {
  if (!validCode(code)) return '';
  code = normalize(code);
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  const labels = {
    ShiftLeft: 'Shift', ControlLeft: 'Ctrl', AltLeft: 'Alt', MetaLeft: 'Meta',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
    Backquote: '`', Backslash: '\\', BracketLeft: '[', BracketRight: ']',
    Comma: ',', Equal: '=', Minus: '-', Period: '.', Quote: "'",
    Semicolon: ';', Slash: '/'
  };
  if (Object.prototype.hasOwnProperty.call(labels, code)) return labels[code];
  return code.replace(/^Numpad/, 'Numpad ').replace(/([a-z])([A-Z])/g, '$1 $2');
}

export class Keybinds {
  #bindings = {...DEFAULT_BINDINGS};
  #inversions = {...DEFAULT_INVERSIONS};
  #storage;
  #listeners = new Set();

  constructor(storage = defaultStorage()) {
    this.#storage = storage;
    try {
      const saved = JSON.parse(storage?.getItem(STORAGE_KEY));
      if (saved?.version !== 1 || !saved.bindings ||
          typeof saved.bindings !== 'object' || Array.isArray(saved.bindings)) return;
      for (const axis of Object.keys(DEFAULT_INVERSIONS)) {
        if (typeof saved.inversions?.[axis] === 'boolean') this.#inversions[axis] = saved.inversions[axis];
      }
      for (const action of Object.keys(DEFAULT_BINDINGS)) {
        if (Object.prototype.hasOwnProperty.call(saved.bindings, action) &&
            validCode(saved.bindings[action])) {
          this.#bindings[action] = normalize(saved.bindings[action]);
        }
      }
    } catch { /* Missing, blocked or malformed storage leaves defaults intact. */ }
  }

  get bindings() { return {...this.#bindings}; }
  get inversions() { return {...this.#inversions}; }
  setInversion(axis, value) {
    if (!Object.hasOwn(DEFAULT_INVERSIONS,axis) || typeof value !== 'boolean') return false;
    if (this.#inversions[axis] !== value) {
      this.#inversions[axis]=value; this.#save(); this.#notify();
    }
    return true;
  }

  set(action, code) {
    if (!validAction(action) || !validCode(code)) return false;
    code = normalize(code);
    if (this.#bindings[action] !== code) {
      this.#bindings[action] = code;
      this.#save();
      this.#notify();
    }
    return true;
  }

  reset() {
    const changed = Object.keys(DEFAULT_BINDINGS).some(action =>
      this.#bindings[action] !== DEFAULT_BINDINGS[action]) ||
      Object.keys(DEFAULT_INVERSIONS).some(axis => this.#inversions[axis]);
    this.#bindings = {...DEFAULT_BINDINGS};
    this.#inversions = {...DEFAULT_INVERSIONS};
    this.#save();
    if (changed) this.#notify();
  }

  matches(action, code) {
    return validAction(action) && validCode(code) &&
      this.#bindings[action] === normalize(code);
  }

  /** Accepts a Set of KeyboardEvent.code strings, an array, or a boolean key map. */
  input(keys, mode) {
    const pressed = action => {
      const code = this.#bindings[action];
      const has = key => {
        if (typeof keys?.has === 'function') return !!keys.has(key);
        if (Array.isArray(keys)) return keys.includes(key);
        return !!keys && Object.prototype.hasOwnProperty.call(keys, key) && !!keys[key];
      };
      return has(code) || (/^(Shift|Control|Alt|Meta)Left$/.test(code) &&
        has(code.replace(/Left$/, 'Right')));
    };
    const result = {
      forward: pressed(mode === 'FLIGHT' ? 'pitchDown' : 'forward'),
      back: pressed(mode === 'FLIGHT' ? 'pitchUp' : 'back'),
      left: pressed('left'), right: pressed('right'),
      rollLeft: pressed('rollLeft'), rollRight: pressed('rollRight'),
      lift: pressed('lift'), boost: pressed('boost')
    };
    // Apply exactly once, to pilot flight commands only, never ground steering.
    if (mode === 'FLIGHT') {
      for (const [axis,a,b] of [['pitch','forward','back'],['yaw','left','right'],['roll','rollLeft','rollRight']]) {
        if (this.#inversions[axis]) [result[a],result[b]]=[result[b],result[a]];
      }
    }
    return result;
  }

  /** Listeners receive an independent bindings snapshot after each actual change. */
  subscribe(callback) {
    if (typeof callback !== 'function') throw new TypeError('Expected a callback');
    this.#listeners.add(callback);
    return () => this.#listeners.delete(callback);
  }

  #save() {
    try {
      this.#storage?.setItem(STORAGE_KEY, JSON.stringify({version: 1, bindings: this.#bindings, inversions: this.#inversions}));
    } catch { /* In-memory bindings remain usable when persistence is unavailable. */ }
  }

  #notify() {
    for (const callback of [...this.#listeners]) {
      try { callback(this.bindings); } catch { /* One subscriber must not block others. */ }
    }
  }
}
