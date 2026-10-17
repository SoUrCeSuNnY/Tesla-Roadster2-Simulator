"""Offline file:// smoke test of the single-HTML deliverable; no HTTP server.

From any directory: python3 /path/to/roadster-lab/scripts/test-standalone.py
Optional test dependency: python3 -m pip install playwright
Install the browser once: python3 -m playwright install chromium
Build first with: npm --prefix roadster-lab run build:single
"""
import argparse
import json
from pathlib import Path
import re
import shutil
import tempfile
import time


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_BINDINGS = {
    'forward': 'KeyW', 'back': 'KeyS', 'left': 'KeyA', 'right': 'KeyD',
    'pitchDown': 'KeyW', 'pitchUp': 'KeyS', 'rollLeft': 'KeyQ', 'rollRight': 'KeyE',
    'lift': 'Space', 'boost': 'ShiftLeft', 'reset': 'KeyR', 'camera': 'KeyC',
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--html', type=Path,
                        default=ROOT / 'dist' / 'roadster-rocket-standalone.html',
                        help='built standalone HTML (default: %(default)s)')
    args = parser.parse_args()
    source = args.html.expanduser().resolve()
    if not source.is_file():
        parser.error(f'HTML not found: {source}\nBuild it with: npm --prefix "{ROOT}" run build:single')
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        parser.error('Optional test dependency missing. Run: python3 -m pip install playwright\n'
                     'Then: python3 -m playwright install chromium')

    started = time.monotonic()
    checks, errors, failed, secondary, http_requests, blocked = [], [], [], [], [], []
    # Copy exactly one artifact: no source modules, assets, or neighboring dist files.
    with tempfile.TemporaryDirectory(prefix='roadster offline 雪 ') as directory:
        target = Path(directory) / 'roadster rocket 独立.html'
        shutil.copyfile(source, target)
        assert list(Path(directory).iterdir()) == [target], 'fixture must contain only the HTML'
        modules = re.findall(r'^// ([\w./-]+\.js)$', target.read_text(encoding='utf-8'), re.MULTILINE)
        url = target.as_uri()
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
            context = browser.new_context(
                viewport={'width': 1280, 'height': 900}, offline=True, service_workers='block')
            context.set_default_timeout(8000)
            context.on('pageerror', lambda error: errors.append(str(error)))
            context.on('requestfailed', lambda request: failed.append({
                'url': request.url, 'failure': request.failure}))

            def record_request(request):
                if request.url.startswith(('http://', 'https://')):
                    http_requests.append(request.url)
                if request.url != url and not request.url.startswith(('data:', 'blob:')):
                    secondary.append(request.url)

            def abort_http(route):
                blocked.append(route.request.url)
                route.abort()

            context.on('request', record_request)
            context.route(re.compile(r'^https?://', re.IGNORECASE), abort_http)
            page = context.new_page()

            def check(name, expression, prerequisite=True):
                assert prerequisite and page.evaluate(expression), name
                checks.append(name)
                print(f'PASS: {name}', flush=True)

            def wait_sim(seconds):
                # Software WebGL can be slow: wait on the fixed-step clock, not wall time.
                end = page.evaluate('rocketLab.time') + seconds
                page.wait_for_function('end => rocketLab.time >= end', arg=end)

            def close_keybinds():
                page.locator('#sim-keybind-done').click()
                page.wait_for_function('''!document.querySelector('#sim-keybind-dialog').open &&
                    document.activeElement.id === 'viewport' ''')

            try:
                print(f'Opening offline, isolated artifact: {url}', flush=True)
                page.goto(url, wait_until='load')
                page.wait_for_function('!!window.rocketLab && rocketLab.frame > 2')
                # Preserve CSS size while reducing the software renderer's work after init.
                page.evaluate('''() => { rocketLab.scene.onBeforeRender = renderer => {
                    if (renderer.getPixelRatio() !== .5) renderer.setPixelRatio(.5);
                }; }''')
                page.wait_for_function('''document.querySelector('#viewport canvas').width === innerWidth / 2''')
                check('isolated file URL renders a live WebGL canvas', '''() => {
                    const canvas = document.querySelector('#viewport canvas');
                    return location.protocol === 'file:' && document.body.contains(canvas) &&
                        canvas.width > 0 && canvas.height > 0 && rocketLab.frame > 2;
                }''')
                check('14 bundled modules initialize physics, world, UI, effects and audio', '''() => {
                    const lab = rocketLab;
                    return !!(lab.body && lab.controller && lab.model.car && lab.scene && lab.world &&
                        lab.npcs && lab.audio && lab.ui && lab.keybindPanel && lab.pitchLock) &&
                        lab.body.throttles.length === 10 && Number.isFinite(lab.body.mass);
                }''', prerequisite=len(modules) == 14 and len(set(modules)) == 14)
                check('initial telemetry reports ground and 80 MPa', '''
                    rocketLab.body.mode === 'GROUND' && rocketLab.body.pressure === 80000000 &&
                    document.querySelector('#sim-pressure').textContent === '80.0' &&
                    document.querySelector('#sim-pressure-meter').getAttribute('aria-valuenow') === '80' &&
                    document.querySelectorAll('.sim-thruster').length === 10''')

                page.locator('#viewport').focus()
                page.keyboard.down('w')
                wait_sim(.5)
                page.wait_for_function("Number(document.querySelector('#sim-speed').textContent) > 0")
                check('real W input accelerates the body and speed HUD', '''
                    rocketLab.input().forward && rocketLab.body.v.x > .5 &&
                    Number(document.querySelector('#sim-speed').textContent) > 0''')
                page.keyboard.up('w')
                page.keyboard.down('Shift')
                wait_sim(.25)
                page.wait_for_function("document.querySelectorAll('.sim-thruster.sim-firing').length >= 4")
                check('real Shift fires rear thrusters and consumes pressure', '''
                    rocketLab.input().boost && rocketLab.body.throttles.slice(0,4).every(x => x > .9) &&
                    rocketLab.body.pressure < 80000000 &&
                    Number(document.querySelector('#sim-pressure').textContent) < 80''')
                page.keyboard.up('Shift')
                # Seed an actual pending touchdown to test clearing, not just hiding a report.
                page.evaluate('''() => {
                    const b = rocketLab.body;
                    b.reset(); b.p.y = .79499; b.v.y = -1; b.flightArmed = true; b.mode = 'FLIGHT';
                    b.step(1/60);
                    if (!b.pending) throw new Error('Expected pending touchdown');
                    b.crashed = true; rocketLab.ui.landing({grade:'CRASH'});
                }''')
                page.keyboard.press('r')
                wait_sim(.2)
                check('real R resets pressure, motion, controls and pending crash/report', '''
                    !rocketLab.body.crashed && !rocketLab.body.pending && !rocketLab.body.events.length &&
                    rocketLab.body.mode === 'GROUND' && rocketLab.body.pressure === 80000000 &&
                    Math.abs(rocketLab.body.v.x) < .01 && rocketLab.keys.size === 0 &&
                    !Object.values(rocketLab.input()).some(Boolean) &&
                    document.querySelector('#sim-landing').hidden''')

                page.keyboard.down('w')
                page.locator('#sim-keybinds').click()
                check('keybind modal opens with 12 actions and suppresses held controls', '''
                    document.querySelector('#sim-keybind-dialog').matches(':modal') &&
                    document.querySelectorAll('#sim-keybind-dialog button[data-bind]').length === 12 &&
                    rocketLab.keys.size === 0 && !Object.values(rocketLab.input()).some(Boolean)''')
                page.keyboard.up('w')
                page.locator('button[data-bind="forward"]').click()
                page.keyboard.press('i')
                check('ground I rebind updates panel and HUD without changing flight W', '''
                    rocketLab.keybinds.bindings.forward === 'KeyI' &&
                    rocketLab.keybinds.bindings.pitchDown === 'KeyW' &&
                    document.querySelector('[data-bind="forward"]').textContent === 'I' &&
                    document.querySelector('[data-key-action="forward"]').textContent === 'I' ''')
                close_keybinds()
                page.keyboard.down('w')
                old_w_inactive = page.evaluate('!rocketLab.input().forward')
                page.keyboard.up('w')
                page.keyboard.down('i')
                check('closing modal restores focus; I drives and old W does not', '''
                    document.activeElement.id === 'viewport' && rocketLab.input().forward''',
                    prerequisite=old_w_inactive)
                page.keyboard.up('i')
                page.locator('#sim-keybinds').click()
                page.locator('#sim-invert-pitch').check()
                check('pitch inversion swaps flight commands only, never ground throttle', '''() => {
                    const binds = rocketLab.keybinds;
                    const ground = binds.input(new Set(['KeyI']), 'GROUND');
                    const flight = binds.input(new Set(['KeyW']), 'FLIGHT');
                    return binds.inversions.pitch && document.querySelector('#sim-invert-pitch').checked &&
                        ground.forward && !ground.back && flight.back && !flight.forward;
                }''')
                page.locator('#sim-keybind-defaults').click()
                check('Restore Defaults resets all bindings, inversions and HUD', f'''() => {{
                    const expected = {json.dumps(DEFAULT_BINDINGS)};
                    const label = code => code === 'ShiftLeft' ? 'Shift' : code.replace(/^Key/, '');
                    return Object.entries(expected).every(([action,code]) =>
                        rocketLab.keybinds.bindings[action] === code &&
                        document.querySelector(`[data-bind="${{action}}"]`).textContent === label(code) &&
                        [...document.querySelectorAll(`[data-key-action="${{action}}"]`)]
                            .every(node => node.textContent === label(code))) &&
                        ['pitch','yaw','roll'].every(axis => !rocketLab.keybinds.inversions[axis] &&
                            !document.querySelector(`#sim-invert-${{axis}}`).checked);
                }}''')
                close_keybinds()
                page.keyboard.press('r')
                page.keyboard.down('w')
                page.keyboard.down('Space')
                page.wait_for_function('''rocketLab.body.mode === 'FLIGHT' && rocketLab.pitchLock.locked &&
                    !document.querySelector('#sim-pitch-warning').hidden''')
                check('real Space liftoff with held W locks pitch and names the physical key', '''
                    rocketLab.body.mode === 'FLIGHT' && rocketLab.pitchLock.locked &&
                    rocketLab.input().lift && !rocketLab.input().forward && !rocketLab.input().back &&
                    document.querySelector('#sim-pitch-warning').textContent === 'RELEASE [W] TO ENGAGE PITCH' ''')
                page.keyboard.up('w')
                check('physical W keyup releases takeoff lock and hides warning', '''
                    !rocketLab.pitchLock.locked && document.querySelector('#sim-pitch-warning').hidden''')
                page.keyboard.up('Space')
                # Synthetic descent, real animation/controller/HUD path (not fabricated UI state).
                page.evaluate('''() => {
                    rocketLab.reset();
                    const b = rocketLab.body;
                    b.mode = 'FLIGHT'; b.flightArmed = true; b.p.y = 6.8;
                    b.altitude = 6; b.v.set(0,-3,0);
                }''')
                page.wait_for_function("document.querySelector('#sim-assist-status').textContent === 'LANDING ASSIST'")
                check('simulated descent activates real LANDING controller and HUD', '''
                    rocketLab.controller.mode === 'LANDING' && rocketLab.controller.assistActive &&
                    document.querySelector('#sim-assist-status').textContent === 'LANDING ASSIST' &&
                    document.querySelector('#sim-mode').textContent === 'FLIGHT' ''')
                if page.evaluate('!!(window.AudioContext || window.webkitAudioContext)'):
                    page.wait_for_function("rocketLab.audio.context?.state === 'running'")
                    check('AudioSystem unlocks from real user gestures offline', '''
                        rocketLab.audio.context.state === 'running' && rocketLab.audio.sources.length > 0''')
                else:
                    print('SKIP: Web Audio unavailable in this browser', flush=True)
                page.keyboard.press('r')
                wait_sim(.1)
                check('no HTTP, secondary requests, page errors or request failures', 'true',
                      prerequisite=not (http_requests or blocked or secondary or errors or failed))
            finally:
                # Always expose boundary failures, including when an earlier assertion times out.
                print(json.dumps({'pageerrors': errors, 'requestfailed': failed,
                                  'http_requests': http_requests, 'blocked_http': blocked,
                                  'secondary_requests': secondary}, ensure_ascii=False), flush=True)
                context.close()
                browser.close()
    print(f'{len(checks)} standalone file/offline checks passed in {time.monotonic() - started:.1f}s', flush=True)


if __name__ == '__main__':
    main()
