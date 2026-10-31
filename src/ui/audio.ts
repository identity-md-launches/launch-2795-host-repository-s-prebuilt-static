export interface Relay {
  readonly enabled: boolean;
  setEnabled(on: boolean): void;
  /** One cycle: the relay closes. */
  clack(): void;
  /** One rung passing the pawl. Quieter, and only ever from the crank. */
  tick(): void;
}

export function createRelay(): Relay {
  let context: AudioContext | null = null;
  let noise: AudioBuffer | null = null;
  let enabled = false;

  const ready = (): AudioContext | null => {
    if (!enabled) return null;
    if (!context) {
      context = new AudioContext();
      const samples = Math.floor(context.sampleRate * 0.05);
      noise = context.createBuffer(1, samples, context.sampleRate);
      const channel = noise.getChannelData(0);
      for (let i = 0; i < samples; i++) channel[i] = Math.random() * 2 - 1;
    }
    if (context.state === 'suspended') void context.resume();
    return context;
  };

  const strike = (gain: number, frequency: number, thump: number): void => {
    const audio = ready();
    if (!audio || !noise) return;
    const now = audio.currentTime;

    const click = audio.createBufferSource();
    click.buffer = noise;
    const band = audio.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = frequency;
    band.Q.value = 2.2;
    const clickGain = audio.createGain();
    clickGain.gain.setValueAtTime(gain, now);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.022);
    click.connect(band).connect(clickGain).connect(audio.destination);
    click.start(now);
    click.stop(now + 0.04);

    if (thump > 0) {
      const body = audio.createOscillator();
      body.type = 'sine';
      body.frequency.setValueAtTime(190, now);
      body.frequency.exponentialRampToValueAtTime(70, now + 0.05);
      const bodyGain = audio.createGain();
      bodyGain.gain.setValueAtTime(thump, now);
      bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
      body.connect(bodyGain).connect(audio.destination);
      body.start(now);
      body.stop(now + 0.07);
    }
  };

  return {
    get enabled() {
      return enabled;
    },
    setEnabled(on) {
      enabled = on;
      if (on) ready();
      else if (context) void context.suspend();
    },
    clack: () => strike(0.34, 1900, 0.22),
    tick: () => strike(0.07, 3400, 0),
  };
}
