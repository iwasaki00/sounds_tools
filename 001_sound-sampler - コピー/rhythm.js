"use strict";

window.RHYTHM_PATTERNS = {
  simple4: { name: "シンプル4ビート", stepsPerBeat: 2, length: 8, kick: [1,0,0,0,1,0,0,0], snare: [0,0,1,0,0,0,1,0], hihat: [1,1,1,1,1,1,1,1], clap: [], bass: [1,0,0,0,1,0,0,0], metronome: [] },
  eight: { name: "8ビート", stepsPerBeat: 2, length: 8, kick: [1,0,0,1,1,0,0,0], snare: [0,0,1,0,0,0,1,0], hihat: [1,1,1,1,1,1,1,1], clap: [], bass: [1,0,0,0,1,0,0,1], metronome: [] },
  rock: { name: "ロック", stepsPerBeat: 2, length: 8, kick: [1,0,0,1,1,0,1,0], snare: [0,0,1,0,0,0,1,0], hihat: [1,1,1,1,1,1,1,1], clap: [], bass: [1,0,0,1,1,0,0,0], metronome: [] },
  dance: { name: "ダンス", stepsPerBeat: 2, length: 8, kick: [1,0,1,0,1,0,1,0], snare: [0,0,1,0,0,0,1,0], hihat: [0,1,0,1,0,1,0,1], clap: [0,0,1,0,0,0,1,0], bass: [1,0,1,0,1,0,1,0], metronome: [] },
  hiphop: { name: "ヒップホップ", stepsPerBeat: 4, length: 16, kick: [1,0,0,0,0,0,1,0,1,0,0,1,0,0,0,0], snare: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0], hihat: [1,0,1,0,1,0,1,0,1,0,1,0,1,1,1,0], clap: [], bass: [1,0,0,0,0,0,1,0,1,0,0,0,0,0,0,0], metronome: [] },
  funk: { name: "ファンク", stepsPerBeat: 4, length: 16, kick: [1,0,0,1,0,0,1,0,1,0,0,0,0,1,0,0], snare: [0,0,0,0,1,0,0,1,0,0,0,0,1,0,1,0], hihat: [1,0,1,1,1,0,1,0,1,1,1,0,1,0,1,1], clap: [], bass: [1,0,0,1,0,0,1,0,1,0,1,0,0,1,0,0], metronome: [] },
  metronome: { name: "メトロノーム", stepsPerBeat: 2, length: 8, kick: [], snare: [], hihat: [], clap: [], bass: [], metronome: [1,0,1,0,1,0,1,0] },
  bassOnly: { name: "ベースのみ", stepsPerBeat: 2, length: 8, kick: [], snare: [], hihat: [], clap: [], bass: [1,0,1,0,1,0,1,0], metronome: [] },
  drumOnly: { name: "ドラムのみ", stepsPerBeat: 2, length: 8, kick: [1,0,0,0,1,0,0,0], snare: [0,0,1,0,0,0,1,0], hihat: [1,1,1,1,1,1,1,1], clap: [], bass: [], metronome: [] },
  custom: { name: "ユーザーカスタム", stepsPerBeat: 4, length: 16, kick: [1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0], snare: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0], hihat: [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0], clap: Array(16).fill(0), bass: [1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0], metronome: [] }
};

window.RhythmManager = class RhythmManager {
  constructor(audio, callbacks = {}) {
    this.audio = audio; this.callbacks = callbacks; this.buffers = {}; this.sources = new Set(); this.trackGains = {};
    this.timer = 0; this.playing = false; this.step = 0; this.nextStepTime = 0; this.uiTimers = new Set();
    this.config = { pattern: "simple4", bpm: 120, volume: .7, drumVolume: .85, bassVolume: .7, drumEnabled: true, bassEnabled: true, countIn: false, ducking: false, bassNote: "C", trackVolumes: { kick: 1, snare: .8, hihat: .45, clap: .7, bass: 1, metronome: .7 }, trackEnabled: { kick: true, snare: true, hihat: true, clap: true, bass: true, metronome: true }, customPattern: null };
  }
  async init(config = {}) {
    this.applyConfig(config);
    const context = this.audio.context;
    this.rhythmGain = context.createGain(); this.drumGain = context.createGain(); this.bassGain = context.createGain();
    this.drumGain.connect(this.rhythmGain); this.bassGain.connect(this.rhythmGain); this.rhythmGain.connect(this.audio.master);
    for (const track of ["kick", "snare", "hihat", "clap", "bass", "metronome"]) {
      const gain = context.createGain(); gain.connect(track === "bass" ? this.bassGain : this.drumGain); this.trackGains[track] = gain;
    }
    this.updateGains();
    const failed = [];
    await Promise.all(["kick", "snare", "hihat", "clap", "bass", "metronome"].map(async (track) => {
      try {
        const response = await fetch(`assets/sounds/rhythm/${track}.wav`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        this.buffers[track] = await this.audio.decode(await response.arrayBuffer());
      } catch (error) { console.warn(`リズム音源 ${track}.wav を読み込めないため内蔵音を使用します`, error); failed.push(track); this.buffers[track] = this.synthesize(track); }
    }));
    return { fallback: failed };
  }
  applyConfig(config) {
    this.config = { ...this.config, ...config, trackVolumes: { ...this.config.trackVolumes, ...(config.trackVolumes || {}) }, trackEnabled: { ...this.config.trackEnabled, ...(config.trackEnabled || {}) } };
    if (config.customPattern) window.RHYTHM_PATTERNS.custom = config.customPattern;
    this.updateGains();
  }
  updateGains() {
    if (!this.rhythmGain) return;
    const now = this.audio.context.currentTime;
    this.rhythmGain.gain.setValueAtTime(this.config.volume, now); this.drumGain.gain.setValueAtTime(this.config.drumVolume, now); this.bassGain.gain.setValueAtTime(this.config.bassVolume, now);
    Object.entries(this.trackGains).forEach(([track, gain]) => gain.gain.setValueAtTime(this.config.trackVolumes[track] ?? 1, now));
  }
  synthesize(track) {
    const context = this.audio.context, rate = context.sampleRate;
    const duration = track === "bass" ? .38 : track === "kick" ? .28 : .16;
    const buffer = context.createBuffer(1, Math.ceil(rate * duration), rate), data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const t = i / rate, fade = Math.exp(-t * (track === "bass" ? 7 : 18));
      if (track === "kick") data[i] = Math.sin(2 * Math.PI * (95 - 65 * t / duration) * t) * fade;
      else if (track === "bass") data[i] = (Math.sin(2 * Math.PI * 65.41 * t) + .25 * Math.sin(2 * Math.PI * 130.82 * t)) * fade * .7;
      else if (track === "metronome") data[i] = Math.sin(2 * Math.PI * 1200 * t) * Math.exp(-t * 45) * .55;
      else if (track === "hihat") data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 45) * .35;
      else if (track === "clap") data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 22) * (Math.sin(t * 120) > -.2 ? .45 : .1);
      else data[i] = ((Math.random() * 2 - 1) * .7 + Math.sin(2 * Math.PI * 180 * t) * .3) * fade * .55;
    }
    return buffer;
  }
  pattern() { return window.RHYTHM_PATTERNS[this.config.pattern] || window.RHYTHM_PATTERNS.simple4; }
  async start() {
    if (this.playing) return;
    await this.audio.resume(); this.playing = true; this.step = 0;
    const now = this.audio.context.currentTime, beatLength = 60 / this.config.bpm;
    this.nextStepTime = now + .08 + (this.config.countIn ? beatLength * 4 : 0);
    if (this.config.countIn) for (let beat = 0; beat < 4; beat++) { const time = now + .08 + beat * beatLength; this.playTrack("metronome", time, true); this.deferUI(time, () => this.callbacks.onBeat?.(beat)); }
    this.timer = window.setInterval(() => this.scheduler(), 25); this.scheduler(); this.callbacks.onState?.(true);
  }
  stop() {
    clearInterval(this.timer); this.playing = false; for (const timer of this.uiTimers) clearTimeout(timer); this.uiTimers.clear();
    for (const source of this.sources) { try { source.stop(); } catch (_) {} }
    this.sources.clear(); this.step = 0; this.callbacks.onState?.(false); this.callbacks.onBeat?.(-1); this.callbacks.onStep?.(-1);
  }
  scheduler() {
    if (!this.playing) return;
    const pattern = this.pattern();
    while (this.nextStepTime < this.audio.context.currentTime + .1) {
      this.scheduleStep(pattern, this.step, this.nextStepTime);
      this.nextStepTime += (60 / this.config.bpm) / pattern.stepsPerBeat;
      this.step = (this.step + 1) % pattern.length;
    }
  }
  scheduleStep(pattern, step, time) {
    ["kick", "snare", "hihat", "clap", "bass", "metronome"].forEach((track) => { if (pattern[track]?.[step]) this.playTrack(track, time); });
    const beat = Math.floor(step / pattern.stepsPerBeat) % 4;
    this.deferUI(time, () => { this.callbacks.onBeat?.(beat); this.callbacks.onStep?.(step); });
  }
  playTrack(track, time, force = false) {
    if (!this.buffers[track]) return;
    if (!force && this.config.trackEnabled[track] === false) return;
    const isBass = track === "bass";
    if (!force && ((isBass && !this.config.bassEnabled) || (!isBass && track !== "metronome" && !this.config.drumEnabled))) return;
    const source = this.audio.context.createBufferSource(); source.buffer = this.buffers[track];
    if (isBass) { const semitones = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }; source.playbackRate.value = Math.pow(2, (semitones[this.config.bassNote] || 0) / 12); }
    source.connect(this.trackGains[track]); this.sources.add(source); source.addEventListener("ended", () => this.sources.delete(source), { once: true }); source.start(time);
  }
  deferUI(time, callback) { const timer = setTimeout(() => { this.uiTimers.delete(timer); if (this.playing) callback(); }, Math.max(0, (time - this.audio.context.currentTime) * 1000)); this.uiTimers.add(timer); }
  duck() {
    if (!this.config.ducking || !this.playing) return;
    const gain = this.rhythmGain.gain, now = this.audio.context.currentTime, value = this.config.volume;
    gain.cancelScheduledValues(now); gain.setValueAtTime(gain.value, now); gain.linearRampToValueAtTime(value * .7, now + .02); gain.linearRampToValueAtTime(value, now + .4);
  }
};
