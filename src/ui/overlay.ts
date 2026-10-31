import { TURING_WHEEL_ADDRESS } from '../chain/config';
import { HOUSE_ROM } from '../machine/presets';
import { h, prefersReducedMotion } from './dom';
import { createMachine } from './machine';
import { createLedWall } from './led/wall';

/** The wall on nothing, for OBS. Same machine, same clock, no chrome. */
export function mountOverlay(root: HTMLElement, sim: boolean): void {
  document.documentElement.dataset['overlay'] = 'true';
  const canvas = h('canvas', { class: 'overlay__wall', role: 'img', 'aria-label': 'Turing Wheel LED wall' });
  root.append(canvas);
  if (sim) root.append(h('span', { class: 'chip chip--sim overlay__badge' }, 'SIMULATED'));

  const wall = createLedWall(canvas, { transparent: true });
  const fit = (): void => void wall.fit(window.innerWidth, window.innerHeight);
  fit();
  window.addEventListener('resize', fit);

  const machine = createMachine({
    wall,
    house: HOUSE_ROM,
    reduced: prefersReducedMotion(),
    beforeFrame: () => undefined,
    afterFrame: () => undefined,
    onWake: () => undefined,
    onHalt: () => undefined,
    onCycle: () => undefined,
  });

  void import('../chain').then((chain) => {
    machine.setClock(sim ? chain.createSimClock() : chain.createHamsterClock({ scheduleUrl: null }));
    if (!TURING_WHEEL_ADDRESS) return;
    const reader = chain.createQueueReader();
    machine.setQueue(reader.list());
    reader.subscribe((programs) => machine.setQueue(programs));
  });
}
