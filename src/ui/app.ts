import { SEPOLIA_EXPLORER_URL, TURING_WHEEL_ADDRESS } from '../chain/config';
import type { QueuePreview } from '../chain/preview';
import type { QueueReaderHandle } from '../chain/queue';
import { WalletError, isUserRejection, sourceProblem } from '../chain/wallet-errors';
import { HOUSE_ROM, PRESETS } from '../machine/presets';
import { frameToCover } from '../machine/cover';
import type { Frame, HamsterClock, QueuedProgram, WalletSession } from '../types';
import { createRelay } from './audio';
import { copyText, helpTip, lamp, segmented, toastHost, type Segmented } from './chrome';
import { createCrankPanel } from './crank/panel';
import { createDatasheet } from './datasheet';
import { h, prefersReducedMotion, setData, setText } from './dom';
import { createEditorPanel, type EditorPanel } from './editor/panel';
import { createThumbPool } from './led/thumbs';
import { createLedWall } from './led/wall';
import { createLockup, createWheelMark } from './lockup';
import { createMachine, programFor, type ClockSource, type DisplayInfo, type Scene } from './machine';
import { createQueuePanel, type QueueSync } from './queue/panel';
import { describeTerms, queueTerms } from './queue/terms';
import { createRail } from './rail';
import { decodeProgramRoute, shareUrl } from './route';
import { createWalletControl } from './wallet';

const STARTER = 'sin(r*.45-t*.8+a*3)*cos(u*.12+t*.3)';
const WAKE_THEATRE_MS = 1600;
const FIRST_READ_GRACE_MS = 12000;
const PREVIEW_REFRESH_MS = 30000;
const GLOW_GAIN = 1.5;
const HAPTIC_MAX_HZ = 1.2;
const PHONE_LOCKUP_MAX = 116;
const PHONE_HEADLINE_WIDTH = 252;

function statusOf(info: DisplayInfo): { text: string; tone: string } {
  const everSeen = (info.reading?.observedAt ?? 0) > 0;
  const hamster = hamsterStatus(info.hamsterScene, everSeen);
  switch (info.source) {
    case 'hamster':
      return hamster;
    case 'crank':
      return { text: 'HAND CLOCK: YOU ARE THE CPU', tone: 'gold' };
    case 'bench':
      return { text: 'BENCH CLOCK: LOCAL PREVIEW', tone: 'blue' };
    case 'replay':
      return { text: 'REPLAY: PURE FRAMES, NO HAMSTER', tone: 'blue' };
  }
}

function hamsterStatus(scene: Scene, everSeen: boolean): { text: string; tone: string } {
  switch (scene) {
    case 'live':
      return { text: 'RUNNING: LOCKED TO THE WHEEL', tone: 'green' };
    case 'halted':
      return { text: 'HALTED: CLOCK ASLEEP', tone: 'amber' };
    case 'lost':
      return { text: everSeen ? 'SIGNAL LOST: LAST CYCLE HELD' : 'SIGNAL LOST: NO TELEMETRY YET', tone: 'red' };
    case 'fault':
      return { text: 'FAULT: COUNTER NOT TRUSTED', tone: 'red' };
    case 'acquiring':
      return { text: 'ACQUIRING SIGNAL', tone: 'dim' };
  }
}

function navButton(text: string, target: () => HTMLElement): HTMLElement {
  return h(
    'button',
    {
      class: 'nav__link',
      type: 'button',
      onClick: () => target().scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' }),
    },
    text,
  );
}

export function mountApp(root: HTMLElement, sim: boolean, forceCanvas2d: boolean): void {
  const reduced = prefersReducedMotion();
  const relay = createRelay();
  const toasts = toastHost();
  const pool = createThumbPool();
  const mark = createWheelMark();
  const lockup = createLockup();
  const queueOpen = TURING_WHEEL_ADDRESS !== null;

  let session: WalletSession | null = null;
  let reader: QueueReaderHandle | null = null;
  let preview: QueuePreview | null = null;
  let previewRequest = 0;
  let readPreview: ((account: WalletSession['address'] | null) => Promise<QueuePreview | null>) | null = null;
  let submitting = false;
  let editor: EditorPanel;
  const mountedAt = performance.now();

  const refreshQueueButton = (): void => {
    if (submitting) return;
    if (!queueOpen) {
      editor.setQueueState({ kind: 'closed' });
      return;
    }
    if (!session) {
      editor.setQueueState({ kind: 'connect' });
      return;
    }
    editor.setQueueState(preview?.heldUntil != null ? { kind: 'held' } : { kind: 'ready' });
  };

  const refreshPreview = async (): Promise<void> => {
    if (!readPreview || document.hidden) return;
    previewRequest += 1;
    const request = previewRequest;
    const next = await readPreview(session?.address ?? null).catch(() => null);
    // A slower answer for the previous account must not overwrite this one.
    if (request !== previewRequest) return;
    preview = next;
    refreshQueueButton();
  };

  const queueSync = (): QueueSync => {
    if (!queueOpen) return 'closed';
    if (reader?.lastSyncAt() != null) return 'live';
    return performance.now() - mountedAt < FIRST_READ_GRACE_MS ? 'reading' : 'unreachable';
  };

  const refreshTerms = (info: DisplayInfo): void => {
    if (!queueOpen) return;
    if (!preview) {
      editor.setTerms('THE CONTRACT SETS THE START CYCLE WHEN YOU SIGN.', false);
      return;
    }
    const known = (info.reading?.observedAt ?? 0) > 0;
    const terms = queueTerms(preview, known ? (info.reading?.work ?? null) : null);
    editor.setTerms(describeTerms(terms, info.reading), terms.kind === 'held');
  };

  /** Rejection is the viewer's own choice, so it gets no message. Everything else is told straight. */
  const reportWalletError = (error: unknown, fallback: string): void => {
    if (isUserRejection(error)) return;
    if (error instanceof WalletError) {
      if (error.kind === 'account-changed') {
        wallet.drop();
        toasts.show('Your wallet account changed. Connect again to continue.', 'amber');
        return;
      }
      const link = error.hash
        ? { href: `${SEPOLIA_EXPLORER_URL}/tx/${error.hash}`, text: 'View transaction' }
        : undefined;
      toasts.show(error.message, error.kind === 'pending' ? 'amber' : 'red', link);
      return;
    }
    toasts.show(error instanceof Error ? error.message : fallback, 'red');
  };

  const wallet = createWalletControl((next) => {
    session = next;
    preview = null;
    refreshQueueButton();
    void refreshPreview();
  }, toasts.show);

  const wallCanvas = h('canvas', {
    class: 'wall__led',
    role: 'img',
    'aria-label': 'LED wall, 64 by 36 cells, showing the running program',
  });
  const wallHost = h('div', { class: 'wall__stage' }, wallCanvas);
  const wall = createLedWall(wallCanvas, { forceCanvas2d });

  const crank = createCrankPanel({
    onEngage: () => {
      machine.engageCrank();
    },
    onTurn: (delta) => machine.turnCrank(delta),
    onDetent: () => {
      relay.tick();
      if (!reduced && crank.control.held && crank.control.hz < HAPTIC_MAX_HZ) navigator.vibrate?.(3);
    },
    onCycle: () => {
      relay.clack();
      rail.pulse();
    },
  }, sim);

  const rail = createRail(sim);

  const statusLamp = lamp('dim');
  const statusText = h('span', { class: 'bar__status-text', role: 'status' }, 'ACQUIRING SIGNAL');
  const glowGold = h('div', { class: 'wall-glow wall-glow--gold', 'aria-hidden': 'true' });
  const glowBlue = h('div', { class: 'wall-glow wall-glow--blue', 'aria-hidden': 'true' });
  const codeTag = h('span', { class: 'wall__tag' }, 'SOURCE');
  const codeLine = h('code', { class: 'wall__source' }, '');
  const codeOpen = h(
    'button',
    {
      class: 'wall__fork',
      type: 'button',
      onClick: () => {
        editor.load(machine.info.text);
        editor.element.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' });
      },
    },
    'Open in editor',
  );
  const liveNudge = h(
    'button',
    { class: 'nudge', type: 'button', hidden: true, onClick: () => selectSource('hamster') },
    'He is running. Watch live',
  );
  const sources: Segmented<ClockSource> = segmented<ClockSource>(
    'Clock source',
    [
      { value: 'hamster', text: 'Hamster' },
      { value: 'crank', text: 'Crank' },
      { value: 'bench', text: 'Bench' },
      { value: 'replay', text: 'Replay' },
    ],
    'hamster',
    (value) => selectSource(value),
  );
  sources.setDisabled('replay', true);

  const selectSource = (source: ClockSource): void => {
    if (source === 'bench') editor.load(editor.source());
    machine.select(source);
    sources.set(source);
    if (source !== 'replay') queue.setReplayActive(false);
  };

  const onAnimationFrame = (frame: Frame, info: DisplayInfo, now: number): void => {
    pool.tick(now);
    if (info.source !== shownSource) {
      shownSource = info.source;
      sources.set(info.source);
    }
    if (now - lastPanelUpdate < 66) return;
    lastPanelUpdate = now;
    paintGlow(frame, info);
    setText(codeLine, info.text || 'Nothing to show until the wheel reports in.');
    codeLine.title = info.text;
    setText(codeTag, info.segfault ? 'SEGFAULT' : 'SOURCE');
    setData(codeTag, 'fault', info.segfault ? 'true' : 'false');
    codeOpen.disabled = info.text.length === 0;
    const status = statusOf(info);
    setText(statusText, status.text);
    setData(statusLamp, 'tone', status.tone);
    setData(document.documentElement, 'scene', info.hamsterScene);
    rail.update(info, now);
    mark.setTurn(info.source === 'hamster' ? (info.reading?.work ?? 0) : info.cycle);
    crank.sync(info.reading, info.source === 'crank', now);
    crank.control.setInvite(info.hamsterScene !== 'live' && info.source === 'hamster');
    liveNudge.hidden = !(info.hamsterScene === 'live' && info.source !== 'hamster');
    queue.update(info.reading?.work ?? 0, (info.reading?.observedAt ?? 0) > 0);
    queue.setSync(queueSync());
    refreshTerms(info);
    editor.monitor(frame, info.title || 'OUTPUT');
    if (info.source === 'replay') queue.monitor(frame);
  };

  /** The panel sits in the light of its own display, so what runs on the wall lights the room. */
  const paintGlow = (frame: Frame, info: DisplayInfo): void => {
    let gold = 0;
    let blue = 0;
    for (let i = 0; i < frame.length; i++) {
      const level = frame[i] as number;
      if (level > 0) gold += level * level;
      else blue += level * level;
    }
    const lit = info.scene === 'live' ? 1 : 0.15;
    const full = frame.length * 16;
    glowGold.style.opacity = String(Math.min(1, Math.sqrt(gold / full) * GLOW_GAIN * lit).toFixed(3));
    glowBlue.style.opacity = String(Math.min(1, Math.sqrt(blue / full) * GLOW_GAIN * lit).toFixed(3));
  };

  let shownSource: ClockSource = 'hamster';
  let lastPanelUpdate = 0;

  const machine = createMachine({
    wall,
    house: HOUSE_ROM,
    reduced,
    beforeFrame: (dt, now) => {
      crank.control.update(dt, now);
      machine.setCrankRate(crank.control.hz);
    },
    afterFrame: (frame, info, _dt, now) => onAnimationFrame(frame, info, now),
    onWake: () => {
      if (reduced) return;
      document.documentElement.dataset['wake'] = 'true';
      relay.clack();
      window.setTimeout(() => delete document.documentElement.dataset['wake'], WAKE_THEATRE_MS);
    },
    onHalt: () => relay.clack(),
    onCycle: () => {
      relay.clack();
      rail.pulse();
    },
  });

  editor = createEditorPanel(PRESETS, pool, programFor, {
    onProgram: (program, source) => {
      machine.setEditorProgram(program, source);
    },
    onRun: () => {
      // Broken source runs too: this is exactly the SEGFAULT the chain would show.
      machine.setEditorProgram(programFor(editor.source()), editor.source());
      machine.select('bench');
      sources.set('bench');
      wallHost.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' });
    },
    onQueue: (source, compiled) => void submit(source, compiled),
    onShare: (source) => {
      void copyText(shareUrl(source)).then((ok) =>
        toasts.show(ok ? 'Link copied.' : 'Clipboard refused. Copy it from the address bar.', ok ? 'green' : 'amber'),
      );
      history.replaceState(null, '', shareUrl(source));
    },
    onCopyCover: () => {
      void copyText(frameToCover(machine.frame())).then((ok) =>
        toasts.show(ok ? 'Cover copied. 1152 chars, ready for the Code board.' : 'Clipboard refused.', ok ? 'green' : 'amber'),
      );
    },
    onBenchRate: (hz) => machine.setBenchRate(hz),
  });

  const queue = createQueuePanel(HOUSE_ROM, pool, programFor, {
    onReplay: (slice, t) => {
      const label = slice.slot.kind === 'queued' ? `PROGRAM #${slice.slot.program.id}` : `HOUSE ROM: ${slice.slot.name}`;
      machine.replay(programFor(slice.source), slice.source, label, t);
      sources.setDisabled('replay', false);
      sources.set('replay');
      wallHost.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' });
    },
    onScrub: (t) => machine.scrub(t),
    onLeaveReplay: () => {
      sources.setDisabled('replay', true);
      selectSource('hamster');
    },
    onSqueek: (id) => void squeek(id),
  });

  const submit = async (source: string, compiled: boolean): Promise<void> => {
    const problem = sourceProblem(source);
    if (problem) {
      toasts.show(problem, 'amber');
      return;
    }
    // Connect and stop: a hold is per wallet, so its terms must be on screen before anything is signed.
    const active = session;
    if (!active) {
      await wallet.connect();
      return;
    }
    submitting = true;
    editor.setQueueState({ kind: 'pending', text: compiled ? 'Sign, then wait for a block' : 'Sign your segfault' });
    try {
      const { programId, hash } = await active.submit(source);
      toasts.show(`Program #${programId} queued. 512 cycles are yours.`, 'green', {
        href: `${SEPOLIA_EXPLORER_URL}/tx/${hash}`,
        text: 'View transaction',
      });
    } catch (error) {
      reportWalletError(error, 'Transaction failed.');
    }
    submitting = false;
    await Promise.all([reader?.refresh(), refreshPreview()]);
    refreshQueueButton();
  };

  const squeek = async (id: number): Promise<void> => {
    const active = session ?? (await wallet.connect());
    if (!active) return;
    try {
      queue.setSqueeking(id, true);
      await active.squeek(id);
      queue.setSqueeked(id);
      toasts.show(`Squeeked #${id}.`);
    } catch (error) {
      reportWalletError(error, 'Squeek failed.');
    }
    queue.setSqueeking(id, false);
    await reader?.refresh();
  };

  const soundLabel = h('span', { class: 'switch__label' }, 'Sound off');
  const sound = h(
    'button',
    {
      class: 'switch',
      type: 'button',
      role: 'switch',
      'aria-checked': 'false',
      'aria-label': 'Relay sound',
      onClick: () => {
        relay.setEnabled(!relay.enabled);
        sound.setAttribute('aria-checked', String(relay.enabled));
        setText(soundLabel, relay.enabled ? 'Sound on' : 'Sound off');
        if (relay.enabled) relay.clack();
      },
    },
    h('i', { class: 'switch__track', 'aria-hidden': 'true' }, h('b')),
    soundLabel,
  );

  const topbar = h(
    'header',
    { class: 'top' },
    h('a', { class: 'top__brand', href: '#/', 'aria-label': 'Turing Wheel home' }, mark.element, h('span', { class: 'top__name' }, 'Turing Wheel')),
    h(
      'nav',
      { class: 'nav', 'aria-label': 'Sections' },
      navButton('Program', () => editor.element),
      navButton('Queue', () => queue.element),
      navButton('Datasheet', () => sheet),
    ),
    h('span', { class: 'top__spacer' }),
    sound,
    wallet.element,
  );

  const hero = h(
    'section',
    { class: 'panel hero', 'aria-label': 'Introduction' },
    lockup.element,
    h('h1', { class: 'hero__head' }, 'A computer clocked ', h('em', {}, 'by a hamster')),
    h('p', { class: 'hero__copy' }, 'One wheel pass is one clock cycle. When he sleeps, the machine halts.'),
  );

  const machinePanel = h(
    'section',
    { class: 'panel wall', 'aria-label': 'The Machine' },
    h(
      'header',
      { class: 'bar' },
      statusLamp,
      h('h2', { class: 'bar__title' }, 'The Machine'),
      statusText,
      liveNudge,
      h('span', { class: 'bar__spacer' }),
      sim ? h('span', { class: 'chip chip--sim' }, 'SIMULATED') : null,
      sources.element,
      helpTip(
        'About the machine',
        'A frame is a pure function of the program and the cycle count, so every screen shows the same thing. Hamster reads the real wheel. Crank is your hand. Bench is a local clock for testing.',
      ),
    ),
    wallHost,
    h('div', { class: 'wall__code' }, codeTag, codeLine, codeOpen),
  );

  const sheet = createDatasheet((pin) => {
    editor.load(`${editor.source()}${pin}`);
  });

  const footer = h(
    'footer',
    { class: 'foot' },
    h('span', {}, 'Community project. Not affiliated with the Squeekchain team.'),
    h('span', { class: 'foot__mid' }, 'One wheel pass, one cycle'),
    h('span', {}, 'Published telemetry only. Never invented.'),
  );

  root.append(
    h(
      'div',
      { class: 'page' },
      topbar,
      h(
        'main',
        { class: 'main' },
        h(
          'div',
          { class: 'stage' },
          h('div', { class: 'stage__wall' }, h('div', { class: 'wall-wrap' }, glowGold, glowBlue, machinePanel), rail.element),
          h('div', { class: 'stage__side' }, hero, crank.hero),
        ),
        editor.element,
        queue.element,
        sheet,
      ),
      footer,
    ),
    toasts.element,
  );

  const fitWall = (): void => {
    const box = wallHost.getBoundingClientRect();
    wall.fit(box.width, box.height);
  };
  const fitAll = (): void => {
    fitWall();
    crank.control.resize();
    const room = Math.min(PHONE_LOCKUP_MAX, hero.clientWidth - PHONE_HEADLINE_WIDTH);
    lockup.fit(window.innerWidth < 720 ? room : hero.clientWidth - 40);
  };
  const sizes = new ResizeObserver(fitAll);
  sizes.observe(wallHost);
  sizes.observe(hero);
  sizes.observe(crank.hero);
  fitAll();

  new IntersectionObserver(
    ([entry]) => machine.setOnScreen(entry?.isIntersecting ?? true),
    { threshold: 0 },
  ).observe(wallHost);

  const applyRoute = (): void => {
    const source = decodeProgramRoute(window.location.hash);
    if (source !== null) openShared(source);
  };
  const openShared = (source: string): void => {
    editor.load(source);
    machine.setEditorProgram(programFor(source), source);
  };
  const shared = decodeProgramRoute(window.location.hash);
  if (shared === null) {
    editor.load(STARTER);
    machine.select('hamster');
  } else {
    openShared(shared);
  }
  window.addEventListener('hashchange', applyRoute);
  refreshQueueButton();
  queue.setSync(queueSync());

  let clock: HamsterClock | null = null;
  void import('../chain')
    .then((chain) => {
      wallet.setApi(chain);
      const started = sim ? chain.createSimClock() : chain.createHamsterClock({ scheduleUrl: null });
      clock = started;
      machine.setClock(started);
      if (!queueOpen) return;
      const opened = chain.createQueueReader();
      reader = opened;
      readPreview = (account) => chain.previewQueue(account ? { account } : {});
      void refreshPreview();
      window.setInterval(() => void refreshPreview(), PREVIEW_REFRESH_MS);
      const accept = (next: readonly QueuedProgram[]): void => {
        machine.setQueue(next);
        queue.setPrograms(next);
        void refreshPreview();
      };
      accept(opened.list());
      opened.subscribe(accept);
    })
    .catch(() => toasts.show('Could not load the chain module. Crank still works.', 'red'));

  window.addEventListener('pagehide', () => {
    clock?.stop();
    reader?.stop();
  });
}
