import { PCMRecorder } from './audio-recorder.js';
import { TempoClock } from './tempo-clock.js';

export const STATES = Object.freeze({
  IDLE: 'IDLE',
  COUNT_IN: 'COUNT_IN',
  FIRST_RECORDING: 'FIRST_RECORDING',
  FIRST_RECORDING_ENDING: 'FIRST_RECORDING_ENDING',
  PLAYING: 'PLAYING',
  OVERDUB_PENDING: 'OVERDUB_PENDING',
  OVERDUB_RECORDING: 'OVERDUB_RECORDING',
  OVERDUB_ENDING: 'OVERDUB_ENDING',
  STOPPED: 'STOPPED',
  ERROR: 'ERROR',
});

export const RECORD_END_MODES = Object.freeze({
  SMART: 'SMART',
  NEXT_BAR: 'NEXT_BAR',
  FREE: 'FREE',
});

export const SMART_END_THRESHOLD = 0.5;

const REQUESTED_CONSTRAINTS = Object.freeze({
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
});

export class LooperEngine extends EventTarget {
  constructor() {
    super();
    this.state = STATES.IDLE;
    this.context = null;
    this.stream = null;
    this.micSource = null;
    this.recorder = null;
    this.inputAnalyser = null;
    this.outputAnalyser = null;
    this.masterGain = null;
    this.monitorGain = null;
    this.tempo = null;
    this.layers = [];
    this.loopLength = 0;
    this.playbackOrigin = null;
    this.nextCycleIndex = 0;
    this.schedulerTimer = null;
    this.schedulerAhead = 0.25;
    this.schedulerInterval = 25;
    this.activeSources = new Set();
    this.recordingStartedAt = null;
    this.firstRecordingStartTime = null;
    this.firstRecordingEndTime = null;
    this.playbackStartDifference = null;
    this.lastOverdubStart = null;
    this.lastOverdubEnd = null;
    this.monitorEnabled = false;
    this.loopCount = 0;
    this.lastReportedLoop = 0;
    this.layerSequence = 0;
    this.requestedConstraints = REQUESTED_CONSTRAINTS;
    this.meterBuffers = new WeakMap();
    this.recordEndMode = RECORD_END_MODES.SMART;
    this.smartEndThreshold = SMART_END_THRESHOLD;
    this.quantizedOverdub = true;
    this.pendingRecordingStart = null;
    this.pendingRecordingStop = null;
    this.actionTimers = new Set();
    this.recordingEndDebug = this.createEmptyRecordingEndDebug();
  }

  async initialize() {
    if (!window.AudioContext && !window.webkitAudioContext) {
      throw new Error('Web Audio API is not supported.');
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Microphone input is not supported. Use HTTPS on iPhone Safari.');
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    try {
      this.context = new AudioContextClass({ latencyHint: 'interactive' });
    } catch (_) {
      this.context = new AudioContextClass();
    }
    this.log('AudioContext created');
    await this.context.resume();

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: REQUESTED_CONSTRAINTS });
      this.log('Microphone permission granted');
    } catch (firstError) {
      this.log(`Requested constraints failed: ${firstError.name}`);
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.log('Microphone permission granted (fallback constraints)');
    }

    this.micSource = this.context.createMediaStreamSource(this.stream);
    this.inputAnalyser = this.context.createAnalyser();
    this.inputAnalyser.fftSize = 1024;
    this.inputAnalyser.smoothingTimeConstant = 0.72;
    this.outputAnalyser = this.context.createAnalyser();
    this.outputAnalyser.fftSize = 1024;
    this.outputAnalyser.smoothingTimeConstant = 0.76;
    this.masterGain = this.context.createGain();
    this.monitorGain = this.context.createGain();
    this.monitorGain.gain.value = 0;

    this.micSource.connect(this.inputAnalyser);
    this.micSource.connect(this.monitorGain);
    this.monitorGain.connect(this.masterGain);
    this.masterGain.connect(this.outputAnalyser);
    this.outputAnalyser.connect(this.context.destination);

    this.recorder = new PCMRecorder(this.context, this.micSource, (message) => this.log(message));
    await this.recorder.initialize();
    this.tempo = new TempoClock(this.context, this.masterGain, (message) => this.log(message));
    this.setMasterVolume(0.82);
    this.installLifecycleListeners();
    this.emit('initialized', this.getDebugInfo());
    this.setState(STATES.IDLE);
    return this.getDebugInfo();
  }

  installLifecycleListeners() {
    this.context.addEventListener('statechange', () => {
      this.log(`AudioContext state: ${this.context.state}`);
      this.emit('contextstate', { state: this.context.state });
    });
    this.stream.getAudioTracks().forEach((track) => {
      track.addEventListener('ended', () => {
        this.fail(new Error('Microphone was disconnected.'));
      });
    });
  }

  setState(state) {
    this.state = state;
    this.emit('statechange', { state });
  }

  async startFirstRecording() {
    this.assertState(STATES.IDLE);
    this.log('REC requested');
    const startTime = this.tempo.beginCountIn();
    this.pendingRecordingStart = startTime;
    this.recordingStartedAt = this.recorder.startAt(startTime);
    this.firstRecordingStartTime = startTime;
    if (this.tempo.countInBars > 0) {
      this.setState(STATES.COUNT_IN);
    } else {
      this.setState(STATES.FIRST_RECORDING);
    }
    this.scheduleActionAt(startTime, () => {
      if (![STATES.COUNT_IN, STATES.FIRST_RECORDING].includes(this.state)) return;
      this.tempo.finishCountIn();
      this.pendingRecordingStart = null;
      this.log(this.tempo.countInBars ? 'Recording started at bar boundary' : 'First recording start');
      this.setState(STATES.FIRST_RECORDING);
      this.emit('recordingstart', { type: 'first', time: startTime });
    });
    return startTime;
  }

  async finishFirstRecording() {
    this.assertState(STATES.FIRST_RECORDING);
    const stopRequestTime = this.context.currentTime;
    const plan = this.calculateFirstRecordingEnd(stopRequestTime);
    this.recordingEndDebug = { ...plan };
    this.log('STOP requested');
    this.log(`Raw position = ${plan.rawBarPosition.toFixed(3)} bars`);
    this.log(`Completed bars = ${plan.completedBars}`);
    this.log(`Bar progress = ${plan.barProgress.toFixed(3)}`);
    this.log(`${plan.mode === RECORD_END_MODES.SMART ? 'Smart target' : 'Target'} = ${formatBars(plan.calculatedTargetBars)} bars`);
    if (plan.shouldContinueRecording) {
      this.log(`Continue recording until bar ${plan.calculatedTargetBars} end`);
    } else if (plan.mode !== RECORD_END_MODES.FREE) {
      this.log(`Trimming recording to ${plan.calculatedTargetBars} bars`);
    }
    this.pendingRecordingStop = plan.captureStopTime;
    this.setState(STATES.FIRST_RECORDING_ENDING);
    this.emit('recordingendplan', { type: 'first', ...plan });
    const capture = await this.recorder.stopAt(plan.captureStopTime);
    this.pendingRecordingStop = null;
    if (capture.samples.length < this.context.sampleRate * 0.2) {
      this.tempo.stop();
      this.setState(STATES.IDLE);
      throw new Error('Recording is too short. Record at least 0.2 seconds.');
    }
    const finalSamples = this.trimCaptureToPlan(capture.samples, plan);
    this.recordingEndDebug.actualRecordedBufferLength = capture.samples.length / this.context.sampleRate;
    this.recordingEndDebug.finalTrimmedBufferLength = finalSamples.length / this.context.sampleRate;
    this.firstRecordingStartTime = this.firstRecordingStartTime ?? capture.startTime;
    this.firstRecordingEndTime = this.firstRecordingStartTime + finalSamples.length / this.context.sampleRate;
    const buffer = this.createBuffer(finalSamples);
    this.loopLength = buffer.duration;
    this.layers = [this.createLayer('FIRST LOOP', buffer)];
    this.log(`Recording finalized at ${formatBars(plan.calculatedTargetBars)} bars`);
    this.log(`Loop length = ${this.loopLength.toFixed(3)} sec`);
    this.startPlayback({ requestedStartTime: this.firstRecordingEndTime, reason: 'first loop' });
    this.emit('layerschange', { layers: this.getLayers() });
    return this.layers[0];
  }

  startPlayback({ requestedStartTime = null, reason = 'play' } = {}) {
    if (!this.layers.length) return;
    this.stopScheduledSources();
    const safeStartTime = this.context.currentTime + 0.03;
    this.playbackOrigin = Number.isFinite(requestedStartTime)
      ? Math.max(requestedStartTime, safeStartTime)
      : safeStartTime;
    this.playbackStartDifference = Number.isFinite(requestedStartTime) && Number.isFinite(this.firstRecordingEndTime)
      ? this.playbackOrigin - this.firstRecordingEndTime
      : null;
    this.tempo.alignTo(this.playbackOrigin);
    this.nextCycleIndex = 0;
    this.loopCount = 0;
    this.lastReportedLoop = 0;
    this.schedulerTimer = window.setInterval(() => this.scheduleAhead(), this.schedulerInterval);
    this.setState(STATES.PLAYING);
    this.scheduleAhead();
    this.log(`Playback scheduled (${reason}) at ${this.playbackOrigin.toFixed(3)}`);
    if (Number.isFinite(this.playbackStartDifference)) {
      this.log(`Playback scheduled ${this.playbackStartDifference >= 0 ? '+' : ''}${this.playbackStartDifference.toFixed(3)} sec after recording end`);
    }
    this.scheduleActionAt(this.playbackOrigin, () => this.log('Playback started'));
  }

  scheduleAhead() {
    if (!this.context || !this.loopLength || this.state === STATES.STOPPED || this.state === STATES.IDLE) return;
    const horizon = this.context.currentTime + this.schedulerAhead;
    while (this.playbackOrigin + this.nextCycleIndex * this.loopLength <= horizon) {
      const cycleTime = this.playbackOrigin + this.nextCycleIndex * this.loopLength;
      if (cycleTime >= this.context.currentTime - 0.01) this.scheduleCycle(cycleTime, this.nextCycleIndex);
      this.nextCycleIndex += 1;
    }
  }

  scheduleCycle(when, cycleIndex) {
    // JavaScriptタイマーは先読みのきっかけにだけ使い、実際の発音時刻はAudioContextへ予約する。
    this.layers.forEach((layer) => this.scheduleLayerAt(layer, when, cycleIndex));
  }

  scheduleLayerAt(layer, when, cycleIndex, offset = 0) {
    const alreadyScheduled = [...this.activeSources]
      .some((entry) => entry.layerId === layer.id && entry.cycleIndex === cycleIndex);
    if (alreadyScheduled) return;
    const source = this.context.createBufferSource();
    source.buffer = layer.buffer;
    source.connect(this.masterGain);
    const entry = { source, layerId: layer.id, cycleIndex };
    this.activeSources.add(entry);
    source.onended = () => {
      this.activeSources.delete(entry);
      source.disconnect();
    };
    source.start(when, offset);
  }

  scheduleNewLayerWithoutLoopWait(layer) {
    if (!this.playbackOrigin || !this.loopLength) return;
    const when = this.context.currentTime + 0.03;
    if (when < this.playbackOrigin) {
      this.scheduleLayerAt(layer, this.playbackOrigin, 0);
      return;
    }
    const cycleIndex = Math.floor((when - this.playbackOrigin) / this.loopLength);
    const cycleStart = this.playbackOrigin + cycleIndex * this.loopLength;
    const offset = Math.max(0, when - cycleStart);
    this.scheduleLayerAt(layer, when, cycleIndex, offset);
    for (let index = cycleIndex + 1; index < this.nextCycleIndex; index += 1) {
      const cycleTime = this.playbackOrigin + index * this.loopLength;
      if (cycleTime >= this.context.currentTime) this.scheduleLayerAt(layer, cycleTime, index);
    }
    this.log(`Overdub playback scheduled without loop wait (cycle ${cycleIndex + 1}, offset ${offset.toFixed(3)} sec)`);
  }

  stopPlayback() {
    if (![STATES.PLAYING, STATES.OVERDUB_RECORDING].includes(this.state)) return;
    if (this.state === STATES.OVERDUB_RECORDING) this.recorder.cancel();
    this.clearScheduler();
    this.stopScheduledSources();
    this.tempo.stop();
    this.log('Playback stopped');
    this.setState(STATES.STOPPED);
  }

  resumePlayback() {
    this.assertState(STATES.STOPPED);
    this.startPlayback();
  }

  async startOverdub() {
    this.assertState(STATES.PLAYING);
    this.log('Overdub requested');
    const startTime = this.quantizedOverdub
      ? this.tempo.getNextBarTime(this.context.currentTime + 0.08)
      : this.context.currentTime;
    this.pendingRecordingStart = startTime;
    this.recordingStartedAt = this.recorder.startAt(startTime);
    this.lastOverdubStart = startTime;
    if (this.quantizedOverdub) {
      this.log(`Overdub starts at next bar @ ${startTime.toFixed(3)}`);
      this.setState(STATES.OVERDUB_PENDING);
    } else {
      this.setState(STATES.OVERDUB_RECORDING);
    }
    this.scheduleActionAt(startTime, () => {
      if (![STATES.OVERDUB_PENDING, STATES.OVERDUB_RECORDING].includes(this.state)) return;
      this.pendingRecordingStart = null;
      this.log('Overdub recording started');
      this.setState(STATES.OVERDUB_RECORDING);
      this.emit('recordingstart', { type: 'overdub', time: startTime });
    });
    return startTime;
  }

  async finishOverdub() {
    this.assertState(STATES.OVERDUB_RECORDING);
    const stopRequestTime = this.context.currentTime;
    const plan = this.calculateOverdubEnd(stopRequestTime);
    this.recordingEndDebug = { ...plan };
    this.log('Overdub STOP requested');
    this.log(`Overdub raw position = ${plan.rawBarPosition.toFixed(3)} bars`);
    this.log(`Overdub target = ${formatBars(plan.calculatedTargetBars)} bars`);
    this.pendingRecordingStop = plan.captureStopTime;
    this.setState(STATES.OVERDUB_ENDING);
    this.emit('recordingendplan', { type: 'overdub', ...plan });
    const capture = await this.recorder.stopAt(plan.captureStopTime);
    this.pendingRecordingStop = null;
    this.lastOverdubStart = capture.startTime;
    this.lastOverdubEnd = capture.endTime;
    const finalCaptureSamples = this.trimCaptureToPlan(capture.samples, plan);
    this.recordingEndDebug.actualRecordedBufferLength = capture.samples.length / this.context.sampleRate;
    this.recordingEndDebug.finalTrimmedBufferLength = finalCaptureSamples.length / this.context.sampleRate;
    if (!finalCaptureSamples.length) {
      this.setState(STATES.PLAYING);
      throw new Error('No overdub audio was captured.');
    }

    const loopSamples = Math.max(1, Math.round(this.loopLength * this.context.sampleRate));
    const aligned = new Float32Array(loopSamples);
    const phase = this.getPhaseAt(capture.startTime);
    const startOffset = Math.round(phase * this.context.sampleRate) % loopSamples;
    // 録音開始位置をループ内の位相へ戻し、周回をまたいでも同じ長さのレイヤーへ配置する。
    for (let index = 0; index < finalCaptureSamples.length; index += 1) {
      const target = (startOffset + index) % loopSamples;
      const fadeSamples = Math.min(Math.round(this.context.sampleRate * 0.008), Math.floor(finalCaptureSamples.length / 2));
      const edgeGain = Math.min(1, index / Math.max(1, fadeSamples), (finalCaptureSamples.length - 1 - index) / Math.max(1, fadeSamples));
      aligned[target] = Math.max(-1, Math.min(1, aligned[target] + finalCaptureSamples[index] * edgeGain));
    }
    const layer = this.createLayer('OVERDUB', this.createBuffer(aligned));
    this.layers.push(layer);
    this.scheduleNewLayerWithoutLoopWait(layer);
    this.log(`Overdub added (Layer ${this.layers.length})`);
    this.setState(STATES.PLAYING);
    this.emit('layerschange', { layers: this.getLayers() });
    return layer;
  }

  undo() {
    if (this.layers.length <= 1 || this.state === STATES.OVERDUB_RECORDING) return false;
    const removed = this.layers.pop();
    this.activeSources.forEach((entry) => {
      if (entry.layerId === removed.id) {
        try { entry.source.stop(); } catch (_) { /* already stopped */ }
      }
    });
    this.log(`Undo: removed Layer ${this.layers.length + 1}`);
    this.emit('layerschange', { layers: this.getLayers() });
    return true;
  }

  clear() {
    this.clearPendingActions();
    this.recorder?.cancel();
    this.clearScheduler();
    this.stopScheduledSources();
    this.layers = [];
    this.loopLength = 0;
    this.playbackOrigin = null;
    this.loopCount = 0;
    this.firstRecordingStartTime = null;
    this.firstRecordingEndTime = null;
    this.playbackStartDifference = null;
    this.lastOverdubStart = null;
    this.lastOverdubEnd = null;
    this.pendingRecordingStart = null;
    this.pendingRecordingStop = null;
    this.recordingEndDebug = this.createEmptyRecordingEndDebug();
    this.tempo?.stop();
    this.log('All loop data cleared');
    this.setState(STATES.IDLE);
    this.emit('layerschange', { layers: [] });
  }

  createTestLoop() {
    if (this.state !== STATES.IDLE) throw new Error('Clear the current loop before starting test mode.');
    const duration = this.tempo.getBarDuration();
    const length = Math.round(this.context.sampleRate * duration);
    const samples = new Float32Array(length);
    for (let beat = 0; beat < this.tempo.beatsPerBar; beat += 1) {
      const start = Math.round(beat * this.tempo.getSecondsPerBeat() * this.context.sampleRate);
      const frequency = beat === 0 ? 1320 : 880;
      const clickLength = Math.round(this.context.sampleRate * 0.035);
      for (let i = 0; i < clickLength; i += 1) {
        samples[start + i] = Math.sin(2 * Math.PI * frequency * i / this.context.sampleRate) * Math.exp(-i / (this.context.sampleRate * 0.008)) * 0.55;
      }
    }
    const testBuffer = this.createBuffer(samples);
    this.loopLength = testBuffer.duration;
    this.layers = [this.createLayer('TEST CLICK', testBuffer)];
    this.firstRecordingStartTime = this.context.currentTime;
    this.firstRecordingEndTime = this.context.currentTime + duration;
    this.log(`Loop test mode: ${duration.toFixed(3)} sec / ${this.tempo.bpm} BPM click loop created`);
    this.emit('layerschange', { layers: this.getLayers() });
    this.startPlayback();
  }

  createBuffer(samples) {
    const buffer = this.context.createBuffer(1, samples.length, this.context.sampleRate);
    buffer.copyToChannel(samples, 0);
    return buffer;
  }

  createLayer(type, buffer) {
    this.layerSequence += 1;
    return { id: this.layerSequence, type, buffer, duration: buffer.duration, createdAt: this.context.currentTime };
  }

  getPhaseAt(time = this.context?.currentTime ?? 0) {
    if (!this.playbackOrigin || !this.loopLength || time < this.playbackOrigin) return 0;
    return (time - this.playbackOrigin) % this.loopLength;
  }

  getCurrentPosition() {
    return this.getPhaseAt();
  }

  getCurrentLoopNumber() {
    if (!this.playbackOrigin || !this.loopLength || this.context.currentTime < this.playbackOrigin) return 0;
    return Math.floor((this.context.currentTime - this.playbackOrigin) / this.loopLength) + 1;
  }

  updateLoopCount() {
    const count = this.getCurrentLoopNumber();
    this.loopCount = count;
    if (count > 0 && count !== this.lastReportedLoop) {
      this.lastReportedLoop = count;
      this.log(`Loop #${count}`);
      this.emit('loop', { count });
    }
    return count;
  }

  getLoopLength() { return this.loopLength; }
  getLayers() { return this.layers.map(({ id, type, duration }) => ({ id, type, duration })); }

  setMasterVolume(value) {
    const normalized = Math.max(0, Math.min(1, Number(value)));
    if (this.masterGain && this.context) {
      this.masterGain.gain.setTargetAtTime(normalized, this.context.currentTime, 0.01);
    }
  }

  setMonitor(enabled) {
    this.monitorEnabled = Boolean(enabled);
    if (this.monitorGain && this.context) {
      this.monitorGain.gain.setTargetAtTime(this.monitorEnabled ? 1 : 0, this.context.currentTime, 0.01);
    }
    this.log(`Mic monitor ${this.monitorEnabled ? 'ON' : 'OFF'}`);
    this.emit('monitorchange', { enabled: this.monitorEnabled });
  }

  setBpm(value) {
    if (this.layers.length || this.state !== STATES.IDLE) return this.tempo.bpm;
    return this.tempo.setBpm(value);
  }

  setCountInBars(bars) {
    if (this.state !== STATES.IDLE) return;
    this.tempo.setCountInBars(bars);
  }

  setMetronomeMode(mode) {
    this.tempo.setMetronomeMode(mode);
  }

  setRecordEndMode(mode) {
    if (!Object.values(RECORD_END_MODES).includes(mode)) return;
    this.recordEndMode = mode;
    this.recordingEndDebug.mode = mode;
    this.log(`Record end mode = ${mode}`);
  }

  setBarQuantize(enabled) {
    this.setRecordEndMode(enabled ? RECORD_END_MODES.NEXT_BAR : RECORD_END_MODES.FREE);
  }

  setQuantizedOverdub(enabled) {
    this.quantizedOverdub = Boolean(enabled);
    this.log(`Quantized overdub ${this.quantizedOverdub ? 'ON' : 'OFF'}`);
  }

  async resumeAudio() {
    await this.context.resume();
    this.log('AudioContext resume requested by user');
    return this.context.state;
  }

  getMeterLevel(analyser) {
    if (!analyser) return { rms: 0, peak: 0 };
    let data = this.meterBuffers.get(analyser);
    if (!data || data.length !== analyser.fftSize) {
      data = new Float32Array(analyser.fftSize);
      this.meterBuffers.set(analyser, data);
    }
    analyser.getFloatTimeDomainData(data);
    let sum = 0;
    let peak = 0;
    for (const sample of data) {
      sum += sample * sample;
      peak = Math.max(peak, Math.abs(sample));
    }
    return { rms: Math.sqrt(sum / data.length), peak };
  }

  getInputLevel() { return this.getMeterLevel(this.inputAnalyser); }
  getOutputLevel() { return this.getMeterLevel(this.outputAnalyser); }

  getDebugInfo() {
    const track = this.stream?.getAudioTracks?.()[0];
    return {
      context: {
        state: this.context?.state ?? 'N/A',
        sampleRate: this.context?.sampleRate ?? 'N/A',
        baseLatency: this.context?.baseLatency ?? 'N/A',
        outputLatency: this.context?.outputLatency ?? 'N/A',
        currentTime: this.context?.currentTime ?? 0,
      },
      microphone: {
        label: track?.label || 'N/A',
        settings: track?.getSettings?.() || {},
        requested: REQUESTED_CONSTRAINTS,
      },
      recorder: this.recorder?.mode ?? 'N/A',
      timing: {
        looperState: this.state,
        loopLength: this.loopLength,
        loopNumber: this.getCurrentLoopNumber(),
        loopPosition: this.getCurrentPosition(),
        firstRecordingStart: this.firstRecordingStartTime,
        firstRecordingEnd: this.firstRecordingEndTime,
        playbackStart: this.playbackOrigin,
        playbackStartDifference: this.playbackStartDifference,
        nextLoopTime: this.getNextPlaybackBoundary(),
        loopIndex: Math.max(0, this.getCurrentLoopNumber() - 1),
        scheduledLoopIndex: Math.max(0, this.nextCycleIndex - 1),
        lastOverdubStart: this.lastOverdubStart,
        lastOverdubEnd: this.lastOverdubEnd,
        schedulingAhead: this.schedulerAhead,
      },
      tempo: {
        ...this.tempo?.getDebugInfo(),
        quantizeMode: this.recordEndMode,
        quantizedOverdub: this.quantizedOverdub,
        pendingRecordingStart: this.pendingRecordingStart,
        pendingRecordingStop: this.pendingRecordingStop,
      },
      recordingEnd: { ...this.recordingEndDebug },
    };
  }

  exportWav() {
    if (!this.layers.length) throw new Error('No loop data to export.');
    const length = Math.max(...this.layers.map((layer) => layer.buffer.length));
    const mixed = new Float32Array(length);
    this.layers.forEach((layer) => {
      const data = layer.buffer.getChannelData(0);
      for (let index = 0; index < Math.min(length, data.length); index += 1) mixed[index] += data[index];
    });
    let peak = 1;
    mixed.forEach((sample) => { peak = Math.max(peak, Math.abs(sample)); });
    const buffer = new ArrayBuffer(44 + length * 2);
    const view = new DataView(buffer);
    const write = (offset, text) => [...text].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
    write(0, 'RIFF'); view.setUint32(4, 36 + length * 2, true); write(8, 'WAVE'); write(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, this.context.sampleRate, true); view.setUint32(28, this.context.sampleRate * 2, true);
    view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, 'data'); view.setUint32(40, length * 2, true);
    for (let index = 0; index < length; index += 1) {
      const sample = Math.max(-1, Math.min(1, mixed[index] / peak));
      view.setInt16(44 + index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    }
    return new Blob([view], { type: 'audio/wav' });
  }

  clearScheduler() {
    if (this.schedulerTimer) window.clearInterval(this.schedulerTimer);
    this.schedulerTimer = null;
  }

  stopScheduledSources() {
    this.activeSources.forEach(({ source }) => {
      source.onended = null;
      try { source.stop(); } catch (_) { /* source may already be stopped */ }
      source.disconnect();
    });
    this.activeSources.clear();
  }

  assertState(...allowed) {
    if (!allowed.includes(this.state)) throw new Error(`Invalid state: ${this.state}`);
  }

  fail(error) {
    this.clearScheduler();
    this.stopScheduledSources();
    this.tempo?.stop();
    this.setState(STATES.ERROR);
    this.emit('error', { error });
  }

  log(message) {
    this.emit('log', { message, time: new Date() });
  }

  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  calculateFirstRecordingEnd(stopRequestTime) {
    return this.calculateRecordingEndPlan({
      recordingStartTime: this.firstRecordingStartTime,
      stopRequestTime,
      unitDuration: this.tempo.getBarDuration(),
      mode: this.recordEndMode,
      unitBars: 1,
    });
  }

  calculateOverdubEnd(stopRequestTime) {
    if (!this.quantizedOverdub) {
      return this.calculateRecordingEndPlan({
        recordingStartTime: this.lastOverdubStart,
        stopRequestTime,
        unitDuration: this.tempo.getBarDuration(),
        mode: RECORD_END_MODES.FREE,
        unitBars: 1,
      });
    }
    const secondsPerBar = this.tempo.getBarDuration();
    const masterBars = Math.max(1, Math.round(this.loopLength / secondsPerBar));
    return this.calculateRecordingEndPlan({
      recordingStartTime: this.lastOverdubStart,
      stopRequestTime,
      unitDuration: this.loopLength,
      mode: RECORD_END_MODES.SMART,
      unitBars: masterBars,
    });
  }

  calculateRecordingEndPlan({ recordingStartTime, stopRequestTime, unitDuration, mode, unitBars }) {
    const secondsPerBar = this.tempo.getBarDuration();
    const elapsedRecordingTime = Math.max(0, stopRequestTime - recordingStartTime);
    const rawBarPosition = elapsedRecordingTime / secondsPerBar;
    const rawUnitPosition = elapsedRecordingTime / unitDuration;
    const completedUnits = Math.floor(rawUnitPosition);
    const unitProgress = rawUnitPosition - completedUnits;
    let targetUnits = null;
    if (mode === RECORD_END_MODES.SMART) {
      // AudioContext時刻の浮動小数点誤差で、ちょうど50%が49.999...%扱いにならないよう微小誤差だけ吸収する。
      const reachesSmartThreshold = unitProgress >= this.smartEndThreshold - 1e-9;
      targetUnits = Math.max(1, completedUnits + (reachesSmartThreshold ? 1 : 0));
    } else if (mode === RECORD_END_MODES.NEXT_BAR) {
      targetUnits = Math.max(1, completedUnits + 1);
    }
    const calculatedTargetBars = targetUnits === null ? rawBarPosition : targetUnits * unitBars;
    const calculatedLoopLength = targetUnits === null ? elapsedRecordingTime : targetUnits * unitDuration;
    const targetStopTime = recordingStartTime + calculatedLoopLength;
    const shouldContinueRecording = mode !== RECORD_END_MODES.FREE
      && targetStopTime > stopRequestTime + 1 / this.context.sampleRate;
    return {
      mode,
      recordingStartTime,
      stopRequestTime,
      elapsedRecordingTime,
      secondsPerBar,
      rawBarPosition,
      completedBars: Math.floor(rawBarPosition),
      barProgress: rawBarPosition - Math.floor(rawBarPosition),
      smartEndThreshold: this.smartEndThreshold,
      calculatedTargetBars,
      calculatedLoopLength,
      targetStopTime,
      captureStopTime: shouldContinueRecording ? targetStopTime : stopRequestTime,
      shouldContinueRecording,
      actualRecordedBufferLength: null,
      finalTrimmedBufferLength: null,
    };
  }

  trimCaptureToPlan(samples, plan) {
    if (plan.mode === RECORD_END_MODES.FREE) return samples;
    const targetLength = Math.max(1, Math.round(plan.calculatedLoopLength * this.context.sampleRate));
    const result = new Float32Array(targetLength);
    result.set(samples.subarray(0, targetLength));
    return result;
  }

  createEmptyRecordingEndDebug() {
    return {
      mode: this.recordEndMode,
      recordingStartTime: null,
      stopRequestTime: null,
      elapsedRecordingTime: null,
      secondsPerBar: null,
      rawBarPosition: null,
      completedBars: null,
      barProgress: null,
      smartEndThreshold: this.smartEndThreshold,
      calculatedTargetBars: null,
      calculatedLoopLength: null,
      actualRecordedBufferLength: null,
      finalTrimmedBufferLength: null,
    };
  }

  getNextPlaybackBoundary() {
    if (!this.playbackOrigin || !this.loopLength || !this.context) return null;
    if (this.context.currentTime < this.playbackOrigin) return this.playbackOrigin;
    const nextIndex = Math.floor((this.context.currentTime - this.playbackOrigin) / this.loopLength) + 1;
    return this.playbackOrigin + nextIndex * this.loopLength;
  }

  scheduleActionAt(audioTime, callback) {
    const delay = Math.max(0, (audioTime - this.context.currentTime) * 1000);
    const timer = window.setTimeout(() => {
      this.actionTimers.delete(timer);
      callback();
    }, delay);
    this.actionTimers.add(timer);
    return timer;
  }

  clearPendingActions() {
    this.actionTimers.forEach((timer) => window.clearTimeout(timer));
    this.actionTimers.clear();
  }

  destroy() {
    this.clearPendingActions();
    this.clearScheduler();
    this.stopScheduledSources();
    this.recorder?.destroy();
    this.tempo?.destroy();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.context?.close();
  }
}

function formatBars(value) {
  if (!Number.isFinite(value)) return 'N/A';
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
