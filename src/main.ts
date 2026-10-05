import '@fontsource/lilita-one';
import '@fontsource-variable/atkinson-hyperlegible-next';
import './styles.css';

import * as THREE from 'three';
import { unlockAudio } from './audio/sfx';
import { initPwa } from './core/pwa';
import { watchForUpdates } from './core/update';
import { Game } from './game/game';
import { Input } from './input/input';
import { TouchControls } from './input/touch';
import { openKeyboard } from './ui/osk';
import { UI } from './ui/ui';
import { UpdateBanner } from './ui/update-banner';

const app = document.getElementById('app')!;

function fail(message: string): void {
  app.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'fatal';
  box.innerHTML = `<h1>Toyboxes</h1><p></p>`;
  box.querySelector('p')!.textContent = message;
  app.appendChild(box);
}

async function boot(): Promise<void> {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  } catch {
    fail("This browser can't show 3D graphics, so the town can't open here. Try another browser or device.");
    return;
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const canvas = renderer.domElement;
  canvas.className = 'stage';
  canvas.setAttribute('aria-label', 'Toyboxes town');
  app.appendChild(canvas);

  // Signs are painted with the display font, so wait for it briefly.
  await Promise.race([
    Promise.all([document.fonts.load('64px "Lilita One"'), document.fonts.load('32px "Atkinson Hyperlegible Next Variable"')]),
    new Promise((r) => setTimeout(r, 2000)),
  ]);

  const input = new Input(canvas);
  const touch = new TouchControls(input, app);
  const ui = new UI(app);
  ui.setDevice(input.device);
  const game = new Game(renderer, input, touch, ui);

  ui.openKeyboard = (el) => openKeyboard(ui, el);
  input.onMenu = (a) => ui.menu(a);
  input.onDevice = (d) => {
    ui.setDevice(d);
    game.updateTouchVisibility();
  };
  let syncBanner = () => {};
  ui.onStackChange = (open) => {
    input.menuMode = open;
    touch.setEnabled(!open);
    if (open) input.releaseAll();
    syncBanner();
  };

  const resize = () => {
    game.resize();
    const vv = window.visualViewport;
    document.documentElement.style.setProperty('--vvh', `${vv ? vv.height : innerHeight}px`);
    document.documentElement.style.setProperty('--vvtop', `${vv ? vv.offsetTop : 0}px`);
  };
  addEventListener('resize', resize);
  window.visualViewport?.addEventListener('resize', resize);
  window.visualViewport?.addEventListener('scroll', resize);
  resize();

  // Keep the play surface from scrolling, zooming or selecting.
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener(
    'touchmove',
    (e) => {
      const t = e.target as HTMLElement;
      if (!t.closest('.scroll, textarea, .book-spread, .card')) e.preventDefault();
    },
    { passive: false },
  );
  document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
  // Back (TV remote, Android gesture, browser button) opens the menu or closes
  // a dialog instead of leaving mid-game. The guard entry needs a user gesture
  // or browsers skip it.
  let guarded = false;
  const guard = () => {
    if (guarded) return;
    guarded = true;
    history.pushState({ toyboxes: 'guard' }, '');
  };
  addEventListener('popstate', () => {
    if (!guarded) return;
    history.pushState({ toyboxes: 'guard' }, '');
    if (ui.isOpen) ui.menu('back');
    else game.openPause();
  });
  const firstGesture = () => {
    unlockAudio();
    guard();
    removeEventListener('pointerdown', firstGesture);
    removeEventListener('keydown', firstGesture);
  };
  addEventListener('pointerdown', firstGesture);
  addEventListener('keydown', firstGesture);

  let last = performance.now();
  let running = true;
  const loop = (now: number) => {
    requestAnimationFrame(loop);
    if (!running) {
      last = now;
      return;
    }
    const frameMs = now - last;
    const dt = Math.min(0.1, Math.max(0, frameMs / 1000));
    last = now;
    game.frame(dt, now, frameMs);
  };
  requestAnimationFrame(loop);

  document.addEventListener('visibilitychange', () => {
    running = !document.hidden;
    game.onHidden(document.hidden);
  });
  addEventListener('pageshow', (e) => {
    if ((e as PageTransitionEvent).persisted) {
      running = true;
      game.restored();
    }
  });

  initPwa();
  const banner = new UpdateBanner(ui.hud, () => game.refreshForUpdate());
  watchForUpdates(() => {
    banner.show();
    game.setUpdateReady();
  });
  syncBanner = () => banner.sync(game.isCalm());
  setInterval(syncBanner, 500);

  document.body.classList.add('ready');
  (window as unknown as { toyboxes: Game }).toyboxes = game;
  await game.start();
}

void boot();
