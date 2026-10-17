const clamp = (value, min, max) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

/** Procedural vehicle audio. Call unlock() directly inside a user gesture. */
export class AudioSystem {
  constructor() {
    this.context = null;
    this.disposed = false;
    this.state = {speed: 0, thrust: 0, slip: 0};
    this.sources = [];
    this.voices = new Set();
    this.nodes = [];
    this.lastImpact = -Infinity;
  }

  async unlock() {
    if (this.disposed) return false;
    const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Context) return false;
    try {
      if (!this.context) {
        this.context = new Context({latencyHint: 'interactive'});
        this._build();
      }
      if (this.context.state === 'suspended' || this.context.state === 'interrupted') {
        await this.context.resume();
      }
      if (this.disposed || this.context?.state !== 'running') return false;
      this.update(this.state);
      return true;
    } catch {
      // Audio is optional: unsupported devices and denied autoplay stay silent.
      if (this.context && !this.master) {
        this.sources.forEach(source => { try { source.stop(); } catch {} });
        this.nodes.forEach(node => node.disconnect());
        this.context.close().catch(() => {});
        this.context = null;
        this.sources = [];
        this.nodes = [];
      }
      return false;
    }
  }

  _build() {
    const ctx = this.context;
    const node = value => { this.nodes.push(value); return value; };
    const gain = value => {
      const result = node(ctx.createGain());
      result.gain.value = value;
      return result;
    };
    const filter = (type, frequency, q = 0.7) => {
      const result = node(ctx.createBiquadFilter());
      result.type = type;
      result.frequency.value = frequency;
      result.Q.value = q;
      return result;
    };
    const compressor = node(ctx.createDynamicsCompressor());
    compressor.threshold.value = -15;
    compressor.knee.value = 12;
    compressor.ratio.value = 5;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.18;
    const master = gain(0.42);
    master.connect(compressor);
    compressor.connect(ctx.destination);

    // One long, shared noise buffer feeds independently filtered jet/tire voices.
    this.noiseBuffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 3), ctx.sampleRate);
    const samples = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    const noise = () => {
      const source = node(ctx.createBufferSource());
      source.buffer = this.noiseBuffer;
      source.loop = true;
      this.sources.push(source);
      return source;
    };
    const oscillator = (type, frequency) => {
      const source = node(ctx.createOscillator());
      source.type = type;
      source.frequency.value = frequency;
      this.sources.push(source);
      return source;
    };

    this.jetGain = gain(0);
    this.jetFilter = filter('lowpass', 1800);
    const jetHighpass = filter('highpass', 160);
    const jet = noise();
    jet.connect(jetHighpass).connect(this.jetFilter).connect(this.jetGain).connect(master);

    this.motorGain = gain(0);
    const motorFilter = filter('lowpass', 2200);
    this.motor = oscillator('sine', 65);
    this.motorHarmonic = oscillator('triangle', 130);
    const harmonicGain = gain(0.15);
    this.motor.connect(motorFilter);
    this.motorHarmonic.connect(harmonicGain).connect(motorFilter);
    motorFilter.connect(this.motorGain).connect(master);

    this.tireGain = gain(0);
    this.tireFilter = filter('bandpass', 1700, 2.8);
    const tire = noise();
    tire.connect(this.tireFilter).connect(this.tireGain).connect(master);
    this.squeal = oscillator('sine', 1250);
    this.squealGain = gain(0);
    this.squeal.connect(this.squealGain).connect(master);

    this.windGain = gain(0);
    const wind = noise();
    wind.connect(filter('lowpass', 700)).connect(this.windGain).connect(master);
    this.sources.forEach(source => source.start());
    // Only mark initialization complete after every node has been created.
    this.master = master;
  }

  update(state = {}) {
    if (this.disposed) return;
    const speed = clamp(Math.abs(state.speed ?? 0), 0, 250);
    const thrust = clamp(state.thrust, 0, 1);
    const slip = clamp(state.slip, 0, 1);
    this.state = {speed, thrust, slip};
    const ctx = this.context;
    if (!ctx || ctx.state !== 'running' || !this.master) return;
    const time = ctx.currentTime;
    const set = (param, value, smoothing = 0.09) => param.setTargetAtTime(value, time, smoothing);
    const movement = Math.min(speed / 35, 1);
    const tireLoad = slip * Math.min(speed / 6, 1);
    set(this.jetGain.gain, Math.pow(thrust, 0.8) * 0.48, 0.055);
    set(this.jetFilter.frequency, 1300 + thrust * 4300);
    set(this.motor.frequency, 48 + speed * 5.2);
    set(this.motorHarmonic.frequency, 96 + speed * 10.4);
    set(this.motorGain.gain, movement * (0.075 + thrust * 0.055));
    set(this.tireGain.gain, tireLoad * 0.17, 0.07);
    set(this.tireFilter.frequency, 1100 + slip * 1600 + movement * 300);
    set(this.squeal.frequency, 850 + slip * 500 + movement * 350);
    set(this.squealGain.gain, tireLoad * 0.045, 0.07);
    set(this.windGain.gain, Math.pow(Math.min(speed / 100, 1), 1.5) * 0.14, 0.2);
  }

  impact(strength = 0.5) {
    const ctx = this.context;
    if (this.disposed || !this.master || ctx?.state !== 'running') return;
    const amount = clamp(strength, 0, 1);
    const time = ctx.currentTime;
    if (amount === 0 || time - this.lastImpact < 0.055) return;
    this.lastImpact = time;
    const duration = 0.16 + amount * 0.28;
    const tone = ctx.createOscillator();
    const toneGain = ctx.createGain();
    tone.type = 'sine';
    tone.frequency.setValueAtTime(110 + amount * 35, time);
    tone.frequency.exponentialRampToValueAtTime(32, time + duration);
    toneGain.gain.setValueAtTime(0.0001, time);
    toneGain.gain.exponentialRampToValueAtTime(0.15 + amount * 0.5, time + 0.006);
    toneGain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    tone.connect(toneGain).connect(this.master);
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 450 + amount * 1700;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.0001, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.12 + amount * 0.3, time + 0.003);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, time + duration * 0.7);
    noise.connect(filter).connect(noiseGain).connect(this.master);
    const voice = {sources: [tone, noise], nodes: [tone, toneGain, noise, filter, noiseGain]};
    this.voices.add(voice);
    tone.onended = () => {
      voice.nodes.forEach(node => node.disconnect());
      this.voices.delete(voice);
    };
    tone.start(time);
    noise.start(time);
    tone.stop(time + duration + 0.02);
    noise.stop(time + duration);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const voice of this.voices) {
      voice.sources.forEach(source => { try { source.stop(); } catch {} });
      voice.nodes.forEach(node => node.disconnect());
    }
    this.voices.clear();
    this.sources.forEach(source => { try { source.stop(); } catch {} });
    this.nodes.forEach(node => node.disconnect());
    if (this.context && this.context.state !== 'closed') this.context.close().catch(() => {});
    this.context = null;
    this.master = null;
    this.noiseBuffer = null;
    this.sources = [];
    this.nodes = [];
  }
}
