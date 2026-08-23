export const METRONOME_MODES = Object.freeze({
  OFF: 'OFF',
  COUNT_IN_ONLY: 'COUNT_IN_ONLY',
  ALWAYS: 'ALWAYS',
});

export class TempoClock extends EventTarget {
  constructor(audioContext, outputNode, log = () => {}) {
    super();
    this.context = audioContext;
    this.outputNode = outputNode;
    this.log = log;
    this.bpm = 100;
    this.beatsPerBar = 4;
    this.beatUnit = 4;
    this.origin = null;
    this.nextBeatIndex = 0;
    this.schedulerAhead = 0.25;
    this.schedulerInterval = 25;
    this.schedulerTimer = null;
    this.metronomeMode = METRONOME_MODES.COUNT_IN_ONLY;
    this.countInBars = 1;
    this.countInStart = null;
    this.countInEnd = null;
    this.countInActive = false;
    this.activeClicks = new Set();
    this.pendingLogTimers = new Set();
    this.nextScheduledBeat = null;
    this.state = 'STOPPED';
  }

  start(startTime = this.context.currentTime + 0.08) {
    if (this.schedulerTimer) window.clearInterval(this.schedulerTimer);
    this.reanchor(startTime);
    this.state = 'RUNNING';
    this.schedulerTimer = window.setInterval(() => this.scheduleAhead(), this.schedulerInterval);
    this.scheduleAhead();
    this.log(`TempoClock started at ${startTime.toFixed(3)}`);
    this.emit('change', this.getDebugInfo());
  }

  stop({ log = true } = {}) {
    if (this.schedulerTimer) window.clearInterval(this.schedulerTimer);
    this.schedulerTimer = null;
    this.stopClicks();
    this.clearPendingLogTimers();
    this.origin = null;
    this.nextBeatIndex = 0;
    this.nextScheduledBeat = null;
    this.countInStart = null;
    this.countInEnd = null;
    this.countInActive = false;
    this.state = 'STOPPED';
    if (log) this.log('TempoClock stopped');
    this.emit('change', this.getDebugInfo());
  }

  setBpm(value) {
    this.bpm = Math.max(40, Math.min(200, Math.round(Number(value))));
    if (this.state === 'RUNNING') this.reanchor(this.context.currentTime + 0.08);
    this.log(`BPM = ${this.bpm}`);
    this.emit('change', this.getDebugInfo());
    return this.bpm;
  }

  setCountInBars(bars) {
    this.countInBars = [0, 1, 2].includes(Number(bars)) ? Number(bars) : 1;
    this.log(`Count-in = ${this.countInBars ? `${this.countInBars} bar` : 'OFF'}`);
    this.emit('change', this.getDebugInfo());
  }

  setMetronomeMode(mode) {
    if (!Object.values(METRONOME_MODES).includes(mode)) return;
    this.stopClicks();
    this.metronomeMode = mode;
    if (Number.isFinite(this.origin)) {
      this.nextBeatIndex = Math.max(0, Math.ceil((this.context.currentTime - this.origin) / this.getSecondsPerBeat()));
      this.scheduleAhead();
    }
    this.log(`Metronome = ${mode}`);
    this.emit('change', this.getDebugInfo());
  }

  beginCountIn() {
    const startTime = this.context.currentTime + (this.countInBars > 0 ? 0.12 : 0.02);
    this.countInStart = startTime;
    this.countInEnd = startTime + this.countInBars * this.getBarDuration();
    this.countInActive = this.countInBars > 0;
    this.start(startTime);
    this.scheduleCountInLogs();
    this.log(this.countInActive ? 'Count-in started' : 'Count-in OFF');
    return this.countInEnd;
  }

  finishCountIn() {
    this.countInActive = false;
  }

  alignTo(time) {
    this.countInActive = false;
    this.countInStart = null;
    this.countInEnd = null;
    this.start(time);
  }

  reanchor(time) {
    this.stopClicks();
    this.clearPendingLogTimers();
    this.origin = time;
    this.nextBeatIndex = 0;
    this.nextScheduledBeat = time;
  }

  scheduleAhead() {
    if (this.state !== 'RUNNING' || !Number.isFinite(this.origin)) return;
    const horizon = this.context.currentTime + this.schedulerAhead;
    while (this.origin + this.nextBeatIndex * this.getSecondsPerBeat() <= horizon) {
      const beatTime = this.origin + this.nextBeatIndex * this.getSecondsPerBeat();
      const beat = (this.nextBeatIndex % this.beatsPerBar) + 1;
      if (beatTime >= this.context.currentTime - 0.01 && this.shouldClick(beatTime)) {
        this.scheduleClick(beatTime, beat);
      }
      this.nextBeatIndex += 1;
      this.nextScheduledBeat = this.origin + this.nextBeatIndex * this.getSecondsPerBeat();
    }
  }

  shouldClick(beatTime) {
    if (this.metronomeMode === METRONOME_MODES.OFF) return false;
    if (this.metronomeMode === METRONOME_MODES.ALWAYS) return true;
    return this.countInActive && beatTime >= this.countInStart && beatTime < this.countInEnd - 0.0001;
  }

  scheduleClick(when, beat) {
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(beat === 1 ? 1320 : 820, when);
    gain.gain.setValueAtTime(beat === 1 ? 0.2 : 0.12, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.035);
    oscillator.connect(gain);
    gain.connect(this.outputNode);
    const entry = { oscillator, gain, when };
    this.activeClicks.add(entry);
    oscillator.onended = () => {
      this.activeClicks.delete(entry);
      oscillator.disconnect();
      gain.disconnect();
    };
    oscillator.start(when);
    oscillator.stop(when + 0.04);
  }

  scheduleCountInLogs() {
    if (!this.countInActive) return;
    const totalBeats = this.countInBars * this.beatsPerBar;
    for (let index = 0; index < totalBeats; index += 1) {
      const when = this.countInStart + index * this.getSecondsPerBeat();
      const delay = Math.max(0, (when - this.context.currentTime) * 1000);
      const timer = window.setTimeout(() => {
        this.pendingLogTimers.delete(timer);
        this.log(`Count-in beat ${index % this.beatsPerBar + 1} (bar ${Math.floor(index / this.beatsPerBar) + 1})`);
      }, delay);
      this.pendingLogTimers.add(timer);
    }
  }

  getPosition(time = this.context.currentTime) {
    if (!Number.isFinite(this.origin) || time < this.origin) {
      return { beat: 0, bar: 0, totalBeat: -1, beatPhase: 0 };
    }
    const elapsedBeats = (time - this.origin) / this.getSecondsPerBeat();
    const totalBeat = Math.floor(elapsedBeats);
    return {
      beat: (totalBeat % this.beatsPerBar) + 1,
      bar: Math.floor(totalBeat / this.beatsPerBar) + 1,
      totalBeat,
      beatPhase: elapsedBeats - totalBeat,
    };
  }

  getNextBarTime(afterTime = this.context.currentTime) {
    if (!Number.isFinite(this.origin) || afterTime <= this.origin) return this.origin ?? afterTime;
    const bars = Math.ceil((afterTime - this.origin) / this.getBarDuration() - 1e-9);
    return this.origin + bars * this.getBarDuration();
  }

  getSecondsPerBeat() { return 60 / this.bpm; }
  getBarDuration() { return this.getSecondsPerBeat() * this.beatsPerBar; }

  getDebugInfo() {
    const position = this.getPosition();
    return {
      state: this.state,
      bpm: this.bpm,
      secondsPerBeat: this.getSecondsPerBeat(),
      beatsPerBar: this.beatsPerBar,
      beatUnit: this.beatUnit,
      currentBeat: position.beat,
      currentBar: position.bar,
      metronomeStartTime: this.origin,
      nextScheduledBeat: this.nextScheduledBeat,
      countInBars: this.countInBars,
      metronomeMode: this.metronomeMode,
      countInActive: this.countInActive,
    };
  }

  stopClicks() {
    this.activeClicks.forEach(({ oscillator, gain }) => {
      oscillator.onended = null;
      try { oscillator.stop(); } catch (_) { /* already stopped */ }
      oscillator.disconnect();
      gain.disconnect();
    });
    this.activeClicks.clear();
  }

  clearPendingLogTimers() {
    this.pendingLogTimers.forEach((timer) => window.clearTimeout(timer));
    this.pendingLogTimers.clear();
  }

  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  destroy() {
    this.stop({ log: false });
  }
}
