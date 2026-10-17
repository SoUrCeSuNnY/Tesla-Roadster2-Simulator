"""Real-browser simulator regression checks (focus, reset, keybinds, flight and viewer).
Run the static server first, then: python3 scripts/test-browser.py
Requires the optional Python playwright package and its Chromium installation.
"""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

URL = os.environ.get('ROADSTER_URL', 'http://127.0.0.1:8080/')
checks = []
errors = []
default_bindings = {
    'forward': 'KeyW', 'back': 'KeyS', 'left': 'KeyA', 'right': 'KeyD',
    'pitchDown': 'KeyW', 'pitchUp': 'KeyS', 'rollLeft': 'KeyQ', 'rollRight': 'KeyE',
    'lift': 'Space', 'boost': 'ShiftLeft', 'reset': 'KeyR', 'camera': 'KeyC',
}

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(
        headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    page.set_default_timeout(10000)
    page.on('pageerror', lambda error: errors.append(str(error)))
    print(f'Opening simulator: {URL}', flush=True)
    page.goto(URL)
    page.wait_for_function('!!window.rocketLab && window.rocketLab.frame > 2')
    # Keep software-WebGL regression affordable; retain CSS viewport dimensions.
    page.evaluate('''() => { rocketLab.scene.onBeforeRender = renderer => {
      if(renderer.getPixelRatio() !== .5) renderer.setPixelRatio(.5);
    }; }''')

    def check(name, expression):
        assert page.evaluate(expression), name
        checks.append(name)
        print(f'PASS: {name}', flush=True)

    def wait_for_driving_focus():
        page.wait_for_function('''!document.querySelector('#sim-keybind-dialog').open &&
            document.activeElement.id === 'viewport' ''')

    def rebind(action, key):
        page.locator(f'button[data-bind="{action}"]').click()
        page.keyboard.press(key)

    def takeoff_with_key(key, label):
        print(f'Lifting off with held {label}...', flush=True)
        page.evaluate('rocketLab.reset()')
        page.keyboard.down(key)
        page.keyboard.down('Space')
        page.wait_for_function('''rocketLab.body.mode === 'FLIGHT' &&
            rocketLab.pitchLock.locked && !document.querySelector('#sim-pitch-warning').hidden''')
        check(f'actual liftoff with {label} locks both pitch directions and shows physical key', f'''() => {{
          const input = rocketLab.input(), warning = document.querySelector('#sim-pitch-warning');
          return rocketLab.body.mode === 'FLIGHT' && rocketLab.pitchLock.locked &&
            !input.forward && !input.back && input.lift && !warning.hidden &&
            warning.textContent === 'RELEASE [{label}] TO ENGAGE PITCH';
        }}''')

    check('WebGL renderer running', "document.querySelector('#viewport canvas') !== null")
    page.locator('#viewport').focus()
    page.keyboard.down('w')
    check('driving key is active', 'rocketLab.input().forward')
    page.locator('#sim-rate').focus()
    check('HUD focus clears held controls', '!rocketLab.input().forward')
    page.evaluate("rocketLab.keys.add('KeyW')")
    page.keyboard.up('w')
    check('captured release clears key even over HUD input', '!rocketLab.input().forward')
    page.keyboard.press('ArrowRight')
    check('range keyboard default remains usable', 'rocketLab.settings.rate === 190')

    page.locator('#sim-direct').focus()
    page.keyboard.press('Space')
    check('Space activates DIRECT without firing lift', '!rocketLab.settings.assisted && !rocketLab.input().lift')
    page.locator('#sim-assisted').focus()
    page.keyboard.press('Space')
    check('Space activates ASSISTED', 'rocketLab.settings.assisted')
    page.evaluate('rocketLab.body.gas = 10; rocketLab.body.pressure = 1000000')
    page.locator('#sim-refill').focus()
    page.keyboard.press('Space')
    check('Space activates REFILL', 'rocketLab.body.gas > 400 && rocketLab.body.pressure === 80000000')

    page.evaluate("rocketLab.ui.landing({grade:'CRASH',title:'CRASHED'})")
    page.locator('#sim-landing-close').focus()
    page.keyboard.press('Space')
    check('Space dismisses report', "document.querySelector('#sim-landing').hidden")
    page.evaluate("rocketLab.body.crashed = true; rocketLab.ui.landing({grade:'CRASH'})")
    page.locator('#sim-reset').focus()
    page.keyboard.press('Space')
    check('Space RESET clears crash and report', "!rocketLab.body.crashed && !rocketLab.body.pending && !rocketLab.body.events.length && document.querySelector('#sim-landing').hidden")
    check('RESET returns focus to driving viewport', "document.activeElement.id === 'viewport'")

    page.evaluate('''() => {
      const b = rocketLab.body;
      b.reset(); b.p.y = .79499; b.v.y = -1; b.flightArmed = true; b.mode = 'FLIGHT';
      b.step(1/60);
      if (!b.pending) throw new Error('Expected real pending touchdown');
      rocketLab.ui.landing({grade:'A'});
    }''')
    page.keyboard.press('r')
    check('R clears real pending touchdown and report', "!rocketLab.body.pending && !rocketLab.body.events.length && document.querySelector('#sim-landing').hidden")
    page.wait_for_timeout(350)
    check('reset does not resurrect stale report', "document.querySelector('#sim-landing').hidden")

    page.keyboard.down('w')
    # Dispatch explicitly: this checks the registered loss-of-focus handler,
    # not operating-system focus switching in a headless browser.
    page.evaluate("window.dispatchEvent(new Event('blur'))")
    check('dispatched blur clears controls', '!rocketLab.input().forward')
    page.keyboard.up('w')
    page.keyboard.down('Shift')
    page.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
    check('dispatched visibilitychange clears controls', '!rocketLab.input().boost')
    page.keyboard.up('Shift')
    page.locator('#sim-direct').focus()
    page.keyboard.press('Escape')
    check('Escape restores driving focus', "document.activeElement.id === 'viewport'")

    check('focus clearing cannot bypass physical takeoff lock with auto-repeat', '''() => {
      const lab=rocketLab, host=document.querySelector('#viewport');
      lab.reset();
      host.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW',key:'w',bubbles:true}));
      lab.body.mode='FLIGHT'; lab.input();
      document.querySelector('#sim-rate').focus();
      lab.input(); host.focus();
      host.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW',key:'w',repeat:true,bubbles:true}));
      const safe=lab.pitchLock.locked && !lab.input().forward && !lab.keys.has('KeyW');
      host.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyW',key:'w',bubbles:true}));
      const released=!lab.pitchLock.locked;
      lab.reset(); return safe&&released;
    }''')
    screenshot = Path(__file__).resolve().parents[1] / 'docs' / 'simulator-regression.png'
    page.screenshot(path=str(screenshot), full_page=True)

    takeoff_with_key('w', 'W')
    # Observe inside keyup, before any animation frame can hide the warning.
    page.evaluate('''() => {
      window.addEventListener('keyup', () => {
        window.__pitchRelease = !rocketLab.pitchLock.locked &&
          document.querySelector('#sim-pitch-warning').hidden;
      }, {capture:true, once:true});
    }''')
    page.keyboard.up('w')
    check('W release immediately unlocks pitch and hides warning in keyup', 'window.__pitchRelease')
    page.keyboard.down('w')
    check('fresh W press enables pitch after takeoff lock', '''
        rocketLab.body.mode === 'FLIGHT' && !rocketLab.pitchLock.locked &&
        rocketLab.input().forward && !rocketLab.input().back''')
    page.keyboard.up('w')
    page.keyboard.up('Space')
    page.evaluate('rocketLab.reset(); delete window.__pitchRelease')

    page.keyboard.down('w')
    check('held driving key before keybinds', 'rocketLab.input().forward')
    page.locator('#sim-keybinds').click()
    page.wait_for_function("document.querySelector('#sim-keybind-dialog').open")
    check('keybind entry opens modal with all 12 actions', '''
        document.querySelector('#sim-keybind-dialog').matches(':modal') &&
        document.querySelectorAll('#sim-keybind-dialog button[data-bind]').length === 12''')
    check('opening keybinds clears held controls', '''
        rocketLab.keys.size === 0 && !Object.values(rocketLab.input()).some(Boolean)''')
    page.keyboard.up('w')
    # Space must not activate the initially focused close button.
    page.locator('#sim-keybind-dialog').focus()
    for key in ['w', 'Space', 'Shift', 'r', 'c']:
        page.keyboard.down(key)
    check('real keyboard controls are inactive in modal', '''
        document.querySelector('#sim-keybind-dialog').open &&
        rocketLab.keys.size === 0 && !Object.values(rocketLab.input()).some(Boolean)''')
    for key in ['w', 'Space', 'Shift', 'r', 'c']:
        page.keyboard.up(key)

    # Observe the renderer's actual camera without expanding the diagnostic API.
    page.evaluate('''() => {
      const scene = rocketLab.scene, previous = scene.onBeforeRender;
      scene.onBeforeRender = function(renderer, renderedScene, camera, ...rest) {
        window.__keybindTestCamera = camera;
        scene.onBeforeRender = previous;
        previous.call(this, renderer, renderedScene, camera, ...rest);
      };
    }''')
    page.wait_for_function('!!window.__keybindTestCamera')
    check('modal blocks input, reset and camera even for viewport-targeted events', '''() => {
      const lab = rocketLab, b = lab.body, camera = window.__keybindTestCamera;
      const position = camera.position.clone(), rotation = camera.quaternion.clone();
      const crashed = b.crashed, gas = b.gas;
      try {
        b.crashed = true; b.gas = 10;
        lab.ui.landing({grade:'CRASH'});
        for (const code of ['KeyW', 'Space', 'ShiftLeft']) lab.keys.add(code);
        const inactive = !Object.values(lab.input()).some(Boolean);
        // Bypass button focus filtering to exercise the modal guard itself.
        for (const [key, code] of [['r', 'KeyR'], ['c', 'KeyC']]) {
          for (const type of ['keydown', 'keyup']) {
            document.querySelector('#viewport').dispatchEvent(
              new KeyboardEvent(type, {key, code, bubbles:true, cancelable:true}));
          }
        }
        return inactive && b.crashed && b.gas === 10 &&
          !document.querySelector('#sim-landing').hidden &&
          camera.position.equals(position) && camera.quaternion.equals(rotation);
      } finally {
        b.crashed = crashed; b.gas = gas; lab.keys.clear(); lab.ui.dismissLanding();
        delete window.__keybindTestCamera;
      }
    }''')

    rebind('forward', 'i')
    check('forward UI binding saves KeyI and updates HUD', '''() => {
      const saved = JSON.parse(localStorage.getItem('roadster.keybinds.v1'));
      return rocketLab.keybinds.bindings.forward === 'KeyI' &&
        saved.version === 1 && saved.bindings.forward === 'KeyI' &&
        document.querySelector('button[data-bind="forward"]').textContent === 'I' &&
        document.querySelector('[data-key-action="forward"]').textContent === 'I';
    }''')
    page.locator('#sim-keybind-done').click()
    wait_for_driving_focus()
    check('Done restores viewport focus without stuck controls', '''
        rocketLab.keys.size === 0 && !Object.values(rocketLab.input()).some(Boolean)''')
    page.keyboard.down('w')
    check('old W no longer drives ground throttle', '!rocketLab.input().forward')
    page.keyboard.up('w')
    page.keyboard.down('i')
    check('new I drives ground throttle', 'rocketLab.input().forward')
    page.keyboard.up('i')

    page.locator('#sim-keybinds').click()
    rebind('pitchDown', 'k')
    rebind('reset', 't')
    check('flight and reset actions bind independently via UI', '''
        rocketLab.keybinds.bindings.forward === 'KeyI' &&
        rocketLab.keybinds.bindings.pitchDown === 'KeyK' &&
        rocketLab.keybinds.bindings.reset === 'KeyT' &&
        document.querySelector('[data-key-action="pitchDown"]').textContent === 'K' &&
        [...document.querySelectorAll('[data-key-action="reset"]')].every(n => n.textContent === 'T')''')
    saved_bindings = page.evaluate('rocketLab.keybinds.bindings')
    page.locator('button[data-bind="forward"]').click()
    page.keyboard.press('Escape')
    check('Escape cancels capture without closing or changing bindings', f'''() => {{
      const expected = {json.dumps(saved_bindings)};
      const saved = JSON.parse(localStorage.getItem('roadster.keybinds.v1'));
      return document.querySelector('#sim-keybind-dialog').open &&
        !document.querySelector('[data-bind="forward"]').classList.contains('sim-bind-capturing') &&
        Object.entries(expected).every(([action, code]) =>
          rocketLab.keybinds.bindings[action] === code && saved.bindings[action] === code);
    }}''')
    page.keyboard.press('Escape')
    wait_for_driving_focus()
    checks.append('Escape while idle closes keybinds and restores driving focus')

    for key, ground, flight in [('w', False, False), ('i', True, False), ('k', False, True)]:
        page.keyboard.down(key)
        # Test mapping only: a synthetic transition must not exercise the takeoff lock.
        check(f'{key.upper()} has independent ground/flight mapping', f'''() => {{
          const b = rocketLab.body, previous = b.mode;
          try {{
            b.mode = 'GROUND'; const ground = rocketLab.keybinds.input(rocketLab.keys, b.mode).forward;
            b.mode = 'FLIGHT'; const flight = rocketLab.keybinds.input(rocketLab.keys, b.mode).forward;
            return ground === {json.dumps(ground)} && flight === {json.dumps(flight)};
          }} finally {{ b.mode = previous; rocketLab.pitchLock.reset(); }}
        }}''')
        page.keyboard.up(key)

    page.evaluate('''() => {
      const b = rocketLab.body;
      b.reset(); b.p.y = .79499; b.v.y = -1; b.flightArmed = true; b.mode = 'FLIGHT';
      b.step(1/60);
      if (!b.pending) throw new Error('Expected real pending touchdown for rebound reset');
      b.crashed = true;
      rocketLab.ui.landing({grade:'CRASH'});
    }''')
    page.keyboard.press('r')
    check('old R no longer resets crash or report', '''
        rocketLab.body.crashed && !document.querySelector('#sim-landing').hidden''')
    page.keyboard.press('t')
    check('real T resets crash, pending touchdown, events and report', '''
        !rocketLab.body.crashed && !rocketLab.body.pending && !rocketLab.body.events.length &&
        document.querySelector('#sim-landing').hidden && document.activeElement.id === 'viewport' &&
        rocketLab.keys.size === 0 && !Object.values(rocketLab.input()).some(Boolean)''')
    reset_frame = page.evaluate('rocketLab.frame')
    page.wait_for_function(f'rocketLab.frame > {reset_frame + 4}')
    check('rebound reset does not resurrect stale report', "document.querySelector('#sim-landing').hidden")

    page.reload()
    page.wait_for_function('!!window.rocketLab && window.rocketLab.frame > 2')
    # Keep software-WebGL regression affordable; retain CSS viewport dimensions.
    page.evaluate('''() => { rocketLab.scene.onBeforeRender = renderer => {
      if(renderer.getPixelRatio() !== .5) renderer.setPixelRatio(.5);
    }; }''')
    check('custom bindings and HUD survive reload', '''
        rocketLab.keybinds.bindings.forward === 'KeyI' &&
        rocketLab.keybinds.bindings.pitchDown === 'KeyK' && rocketLab.keybinds.bindings.reset === 'KeyT' &&
        document.querySelector('[data-key-action="forward"]').textContent === 'I' &&
        document.querySelector('[data-key-action="pitchDown"]').textContent === 'K' &&
        [...document.querySelectorAll('[data-key-action="reset"]')].every(n => n.textContent === 'T')''')
    page.locator('#viewport').focus()
    page.keyboard.down('i')
    check('persisted I still drives after reload', 'rocketLab.input().forward')
    page.keyboard.up('i')
    page.locator('#sim-keybinds').click()
    check('reopened panel displays persisted bindings', '''
        document.querySelector('[data-bind="forward"]').textContent === 'I' &&
        document.querySelector('[data-bind="pitchDown"]').textContent === 'K' &&
        document.querySelector('[data-bind="reset"]').textContent === 'T' ''')
    check('all three inversion checkboxes default to false', '''
        document.querySelectorAll('#sim-keybind-dialog [data-invert]').length === 3 &&
        ['pitch','yaw','roll'].every(axis => !rocketLab.keybinds.inversions[axis] &&
          !document.querySelector(`#sim-invert-${axis}`).checked)''')
    for axis in ['pitch', 'yaw', 'roll']:
        page.locator(f'#sim-invert-{axis}').check()
    check('modal checkbox UI saves all three flight inversions', '''() => {
      const saved = JSON.parse(localStorage.getItem('roadster.keybinds.v1'));
      return ['pitch','yaw','roll'].every(axis => rocketLab.keybinds.inversions[axis] &&
        saved.inversions[axis] && document.querySelector(`#sim-invert-${axis}`).checked);
    }''')
    page.locator('#sim-keybind-done').click()
    wait_for_driving_focus()

    takeoff_with_key('i', 'I')
    page.keyboard.down('k')
    check('pitch inversion cannot bypass custom forward takeoff lock', '''() => {
      const raw = rocketLab.keybinds.input(rocketLab.keys, 'FLIGHT'), input = rocketLab.input();
      return raw.back && !raw.forward && rocketLab.pitchLock.locked &&
        !input.forward && !input.back &&
        document.querySelector('#sim-pitch-warning').textContent === 'RELEASE [I] TO ENGAGE PITCH';
    }''')
    page.keyboard.up('i')
    check('releasing physical I unlocks inverted K pitch and hides warning', '''
        !rocketLab.pitchLock.locked && document.querySelector('#sim-pitch-warning').hidden &&
        rocketLab.input().back && !rocketLab.input().forward''')
    page.keyboard.up('k')
    page.keyboard.up('Space')
    takeoff_with_key('k', 'K')
    page.keyboard.up('k')
    check('custom K release hides dynamic warning', '''
        !rocketLab.pitchLock.locked && document.querySelector('#sim-pitch-warning').hidden''')
    page.keyboard.up('Space')
    page.evaluate('rocketLab.reset()')

    page.reload()
    page.wait_for_function('!!window.rocketLab && window.rocketLab.frame > 2')
    # Keep software-WebGL regression affordable; retain CSS viewport dimensions.
    page.evaluate('''() => { rocketLab.scene.onBeforeRender = renderer => {
      if(renderer.getPixelRatio() !== .5) renderer.setPixelRatio(.5);
    }; }''')
    page.locator('#sim-keybinds').click()
    check('all inversions and custom bindings persist through reload', '''
        ['pitch','yaw','roll'].every(axis => rocketLab.keybinds.inversions[axis] &&
          document.querySelector(`#sim-invert-${axis}`).checked) &&
        rocketLab.keybinds.bindings.forward === 'KeyI' && rocketLab.keybinds.bindings.pitchDown === 'KeyK' ''')
    page.locator('#sim-keybind-done').click()
    wait_for_driving_focus()
    page.keyboard.down('i')
    page.keyboard.down('a')
    check('flight inversions do not invert ground throttle or steering', '''() => {
      const input = rocketLab.input();
      return rocketLab.body.mode === 'GROUND' && input.forward && !input.back && input.left && !input.right;
    }''')
    page.keyboard.up('i')
    page.keyboard.up('a')
    # Establish neutral flight before keydown, excluding takeoff-lock and landing effects.
    page.evaluate('''() => {
      rocketLab.reset();
      const b = rocketLab.body;
      b.mode = 'FLIGHT'; b.p.y = 30; b.altitude = 29; b.v.set(0,0,0);
      rocketLab.input();
    }''')
    for key, axis, index, sign, enabled, disabled in [
        ('k', 'pitch', 2, 1, 'back', 'forward'),
        ('a', 'yaw', 1, 1, 'right', 'left'),
        ('q', 'roll', 0, 1, 'rollRight', 'rollLeft'),
    ]:
        page.keyboard.down(key)
        # Synchronous controller update avoids races between keyboard and physics frames.
        check(f'inverted {axis} reaches the controller exactly once', f'''() => {{
          const lab = rocketLab, input = lab.input();
          lab.controller.reset();
          lab.controller.update(1/60, lab.body, input, lab.settings);
          return !lab.pitchLock.locked && input.{enabled} && !input.{disabled} &&
            lab.controller.mode === 'RATE' && lab.controller.targetRates[{index}] * {sign} > 0;
        }}''')
        page.keyboard.up(key)
    page.evaluate('rocketLab.reset()')
    page.locator('#sim-keybinds').click()
    keybind_screenshot = screenshot.with_name('simulator-keybinds.png')
    page.screenshot(path=str(keybind_screenshot), full_page=True)
    page.locator('#sim-keybind-defaults').click()
    check('defaults restore every action, HUD label and stored binding', f'''() => {{
      const expected = {json.dumps(default_bindings)};
      const saved = JSON.parse(localStorage.getItem('roadster.keybinds.v1'));
      const label = code => code === 'ShiftLeft' ? 'Shift' : code.replace(/^Key/, '');
      return saved.version === 1 && Object.entries(expected).every(([action, code]) =>
        rocketLab.keybinds.bindings[action] === code && saved.bindings[action] === code &&
        document.querySelector(`[data-bind="${{action}}"]`).textContent === label(code) &&
        [...document.querySelectorAll(`[data-key-action="${{action}}"]`)].every(n => n.textContent === label(code)));
    }}''')
    check('defaults reset all inversion checkboxes and persisted values to false', '''() => {
      const saved = JSON.parse(localStorage.getItem('roadster.keybinds.v1'));
      return ['pitch','yaw','roll'].every(axis => rocketLab.keybinds.inversions[axis] === false &&
        saved.inversions[axis] === false && !document.querySelector(`#sim-invert-${axis}`).checked);
    }''')
    page.locator('#sim-keybind-done').click()
    wait_for_driving_focus()
    page.keyboard.down('w')
    check('default W drives again', 'rocketLab.input().forward')
    page.keyboard.up('w')
    page.keyboard.down('i')
    check('defaults remove custom I throttle', '!rocketLab.input().forward')
    page.keyboard.up('i')

    for width, height, close in [(390, 844, '#sim-keybind-close'), (844, 390, '#sim-keybind-done')]:
        page.set_viewport_size({'width': width, 'height': height})
        check(f'{width}x{height} keybind entry is visible and unobstructed', '''() => {
          const button = document.querySelector('#sim-keybinds'), r = button.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && r.left >= 0 && r.right <= innerWidth &&
            r.top >= 0 && r.bottom <= innerHeight &&
            button.contains(document.elementFromPoint(r.x + r.width/2, r.y + r.height/2));
        }''')
        page.locator('#sim-keybinds').click(timeout=10000)
        page.wait_for_function("document.querySelector('#sim-keybind-dialog').open")
        check(f'{width}x{height} modal fits without horizontal overflow', '''() => {
          const dialog = document.querySelector('#sim-keybind-dialog'), r = dialog.getBoundingClientRect();
          return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight &&
            dialog.scrollWidth <= dialog.clientWidth &&
            document.documentElement.scrollWidth <= innerWidth;
        }''')
        page.locator(close).scroll_into_view_if_needed()
        check(f'{width}x{height} close control is accessible', f'''() => {{
          const button = document.querySelector('{close}'), r = button.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && r.left >= 0 && r.right <= innerWidth &&
            r.top >= 0 && r.bottom <= innerHeight &&
            button.contains(document.elementFromPoint(r.x + r.width/2, r.y + r.height/2));
        }}''')
        page.locator(close).click(timeout=10000)
        wait_for_driving_focus()
    page.set_viewport_size({'width': 1440, 'height': 1000})

    print('Checking landing assist through real animation frames...', flush=True)
    page.evaluate('''() => {
      rocketLab.reset();
      const b = rocketLab.body;
      b.mode = 'FLIGHT'; b.p.y = 5; b.altitude = 4; b.v.set(0,-1,0);
      // Moderate combined bank/pitch, using existing THREE objects without imports.
      const axis = b.p.clone().set(1,0,1).normalize();
      b.q.setFromAxisAngle(axis, .3);
      window.__landingStartFrame = rocketLab.frame;
    }''')
    page.wait_for_function('''rocketLab.frame > window.__landingStartFrame + 2 &&
        rocketLab.controller.mode === 'LANDING' &&
        document.querySelector('#sim-assist-status').textContent === 'LANDING ASSIST' ''')
    check('actual descending tilted flight shows LANDING ASSIST with level restorative targets', '''() => {
      const lab = rocketLab, controller = lab.controller, attitude = lab.body.getAttitude();
      return lab.keys.size === 0 && lab.body.mode === 'FLIGHT' &&
        controller.mode === 'LANDING' && controller.landingActive && controller.assistActive &&
        controller.targetAngles.roll === 0 && controller.targetAngles.pitch === 0 &&
        controller.targetRates[0] * attitude.roll < 0 &&
        controller.targetRates[2] * attitude.pitch < 0 &&
        document.querySelector('#sim-assist-status').textContent === 'LANDING ASSIST';
    }''')
    page.evaluate('rocketLab.reset(); delete window.__landingStartFrame')

    page.goto(URL.rstrip('/') + '/viewer.html')
    page.wait_for_function("document.querySelectorAll('#nozzle-list [data-nozzle]').length === 10")
    page.locator('[data-mode="xray"]').click()
    check('real-browser viewer entry and mode switch', "document.querySelector('#view-label').textContent === '02 / INSIDE'")
    assert not errors, errors
    checks.append('no JavaScript page errors on simulator or viewer')
    browser.close()

print(json.dumps({'status': 'PASS', 'checks': checks, 'screenshot': str(screenshot),
                  'keybind_screenshot': str(keybind_screenshot),
                  'limitations': ['Blur and visibilitychange are dispatched events, not OS-level transitions.',
                                  'Modal shortcut isolation also uses synchronous viewport-targeted events.',
                                  'Landing initial conditions and neutral inversion flight are seeded through diagnostics.']}, indent=2))
