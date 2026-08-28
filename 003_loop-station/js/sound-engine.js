export const PAD_SOUNDS = Object.freeze([
  ['kick', 'KICK'], ['snare', 'SNARE'], ['closed-hat', 'CLOSED HAT'], ['open-hat', 'OPEN HAT'],
  ['clap', 'CLAP'], ['rim', 'RIM'], ['bass', 'BASS'], ['synth', 'SYNTH'],
].map(([id, label], index) => ({ id, label, key: String(index + 1) })));

export class SoundEngine {
  constructor(context, outputNode) {
    this.context = context;
    this.outputNode = outputNode;
    this.sourceMode = 'SYNTH';
    this.samples = new Map();
    this.noiseBuffer = this.createNoiseBuffer();
  }

  setSourceMode(mode) { this.sourceMode = mode === 'SAMPLE' ? 'SAMPLE' : 'SYNTH'; }
  setSample(soundId, buffer) { if (buffer) this.samples.set(soundId, buffer); }

  play(soundId, when = this.context.currentTime, velocity = 1) {
    const sample = this.samples.get(soundId);
    if (this.sourceMode === 'SAMPLE' && sample) return this.sample(sample, when, velocity);
    const players = {
      kick: () => this.kick(when, velocity), snare: () => this.snare(when, velocity),
      'closed-hat': () => this.hat(when, .055, velocity), 'open-hat': () => this.hat(when, .42, velocity),
      clap: () => this.clap(when, velocity), rim: () => this.rim(when, velocity),
      bass: () => this.tonal(when, 65.41, 'sawtooth', .28, .26 * velocity),
      synth: () => this.tonal(when, 329.63, 'square', .2, .16 * velocity, 659.25),
    };
    return (players[soundId] || players.rim)();
  }

  sample(buffer, when, velocity) {
    const source = this.context.createBufferSource(), gain = this.context.createGain();
    source.buffer = buffer; gain.gain.setValueAtTime(velocity, when);
    source.connect(gain); gain.connect(this.outputNode); source.start(when);
    return this.voice([source], [source, gain]);
  }

  kick(when, velocity) {
    const oscillator = this.context.createOscillator(), gain = this.context.createGain();
    oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(150, when);
    oscillator.frequency.exponentialRampToValueAtTime(50, when + .09);
    gain.gain.setValueAtTime(.75 * velocity, when); gain.gain.exponentialRampToValueAtTime(.0001, when + .34);
    oscillator.connect(gain); gain.connect(this.outputNode); oscillator.start(when); oscillator.stop(when + .36);
    return this.voice([oscillator], [oscillator, gain]);
  }

  snare(when, velocity) {
    const noise = this.noise(when, .16, 1500, .32 * velocity);
    return this.combine([noise, this.tonal(when, 190, 'triangle', .11, .22 * velocity)]);
  }

  hat(when, duration, velocity) { return this.noise(when, duration, 6500, .18 * velocity, 'highpass'); }
  clap(when, velocity) { return this.combine([0, .026, .052].map((delay, i) => this.noise(when + delay, i === 2 ? .13 : .045, 1100, .2 * velocity, 'bandpass'))); }
  rim(when, velocity) { return this.combine([this.tonal(when, 920, 'square', .045, .13 * velocity), this.tonal(when, 510, 'triangle', .055, .12 * velocity)]); }

  tonal(when, frequency, type, duration, level, endFrequency = null) {
    const oscillator = this.context.createOscillator(), gain = this.context.createGain();
    oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, when);
    if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, when + duration);
    gain.gain.setValueAtTime(level, when); gain.gain.exponentialRampToValueAtTime(.0001, when + duration);
    oscillator.connect(gain); gain.connect(this.outputNode); oscillator.start(when); oscillator.stop(when + duration + .01);
    return this.voice([oscillator], [oscillator, gain]);
  }

  noise(when, duration, frequency, level, type = 'highpass') {
    const source = this.context.createBufferSource(), filter = this.context.createBiquadFilter(), gain = this.context.createGain();
    source.buffer = this.noiseBuffer; filter.type = type; filter.frequency.setValueAtTime(frequency, when);
    gain.gain.setValueAtTime(level, when); gain.gain.exponentialRampToValueAtTime(.0001, when + duration);
    source.connect(filter); filter.connect(gain); gain.connect(this.outputNode); source.start(when); source.stop(when + duration + .01);
    return this.voice([source], [source, filter, gain]);
  }

  createNoiseBuffer() {
    const length = Math.max(1, Math.round(this.context.sampleRate));
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate), data = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1;
    return buffer;
  }

  voice(stoppables, disconnectables) {
    return { stop: () => {
      stoppables.forEach((node) => { try { node.stop(); } catch (_) { /* ended */ } });
      disconnectables.forEach((node) => { try { node.disconnect(); } catch (_) { /* disconnected */ } });
    } };
  }
  combine(voices) { return { stop: () => voices.forEach((voice) => voice?.stop()) }; }
}
