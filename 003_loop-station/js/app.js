import { LooperEngine, STATES } from './looper-engine.js';
import { drawWaveform } from './waveform.js';

const engine = new LooperEngine();
const logs = [];
let animationFrame = null;
let lastDebugRender = 0;
let goUntil = 0;
let tapTimes = [];

const $ = (selector) => document.querySelector(selector);
const elements = {
  startButton: $('#startAudioButton'),
  startScreen: $('#startScreen'),
  looperScreen: $('#looperScreen'),
  loopButton: $('#loopButton'),
  loopAction: $('#loopAction'),
  loopHint: $('#loopHint'),
  undoButton: $('#undoButton'),
  stopButton: $('#stopButton'),
  clearButton: $('#clearButton'),
  loopLength: $('#loopLength'),
  loopPosition: $('#loopPosition'),
  loopEnd: $('#loopEnd'),
  loopCount: $('#loopCount'),
  progressFill: $('#progressFill'),
  progressHead: $('#progressHead'),
  inputMeter: $('#inputMeter'),
  outputMeter: $('#outputMeter'),
  clipLabel: $('#clipLabel'),
  masterVolume: $('#masterVolume'),
  masterVolumeValue: $('#masterVolumeValue'),
  monitorButton: $('#monitorButton'),
  statusMic: $('#statusMic'),
  statusAudio: $('#statusAudio'),
  statusRecorder: $('#statusRecorder'),
  statusFirstLoop: $('#statusFirstLoop'),
  statusLayers: $('#statusLayers'),
  statusLoopCount: $('#statusLoopCount'),
  statusMonitor: $('#statusMonitor'),
  layerCount: $('#layerCount'),
  layersList: $('#layersList'),
  waveform: $('#waveformCanvas'),
  engineBadge: $('#engineBadge'),
  notice: $('#notice'),
  noticeTitle: $('#noticeTitle'),
  noticeMessage: $('#noticeMessage'),
  resumeButton: $('#resumeAudioButton'),
  debugPanel: $('#debugPanel'),
  audioDebug: $('#audioDebug'),
  micDebug: $('#micDebug'),
  constraintsDebug: $('#constraintsDebug'),
  timingDebug: $('#timingDebug'),
  deviceDebug: $('#deviceDebug'),
  eventLog: $('#eventLog'),
  copyLogButton: $('#copyLogButton'),
  logFallback: $('#logFallback'),
  latencyButton: $('#latencyTestButton'),
  latencyResult: $('#latencyResult'),
  exportButton: $('#exportButton'),
  testSoundButton: $('#testSoundButton'),
  bpmValue: $('#bpmValue'),
  tempoLockStatus: $('#tempoLockStatus'),
  tapTempoButton: $('#tapTempoButton'),
  bpmButtons: [...document.querySelectorAll('[data-bpm-delta]')],
  timeSignature: $('#timeSignature'),
  barNumber: $('#barNumber'),
  beatDots: [...document.querySelectorAll('[data-beat]')],
  recordingIndicator: $('#recordingIndicator'),
  countdownOverlay: $('#countdownOverlay'),
  countdownLabel: $('#countdownLabel'),
  countdownNumber: $('#countdownNumber'),
  countdownSubtext: $('#countdownSubtext'),
  countInSelect: $('#countInSelect'),
  metronomeSelect: $('#metronomeSelect'),
  recordEndSelect: $('#recordEndSelect'),
  overdubQuantizeButton: $('#overdubQuantizeButton'),
  tempoDebug: $('#tempoDebug'),
  recordingProgress: $('#recordingProgress'),
  recBarLabel: $('#recBarLabel'),
  completedBarsLabel: $('#completedBarsLabel'),
};

const stateView = {
  [STATES.IDLE]: { action: 'REC', hint: 'FIRST LOOP' },
  [STATES.COUNT_IN]: { action: 'COUNT IN', hint: 'GET READY' },
  [STATES.FIRST_RECORDING]: { action: 'STOP & LOOP', hint: 'RECORDING' },
  [STATES.FIRST_RECORDING_ENDING]: { action: 'ENDING…', hint: 'NEXT BAR' },
  [STATES.PLAYING]: { action: 'OVERDUB', hint: 'LOOP PLAYING' },
  [STATES.OVERDUB_PENDING]: { action: 'STARTING…', hint: 'NEXT BAR' },
  [STATES.OVERDUB_RECORDING]: { action: 'END OVERDUB', hint: 'LAYER RECORDING' },
  [STATES.OVERDUB_ENDING]: { action: 'ENDING…', hint: 'NEXT BAR' },
  [STATES.STOPPED]: { action: 'PLAY', hint: 'LOOP STOPPED' },
  [STATES.ERROR]: { action: 'ERROR', hint: 'CHECK DEBUG' },
};

elements.startButton.addEventListener('click', initializeAudio);
elements.loopButton.addEventListener('click', handleMainAction);
elements.undoButton.addEventListener('click', () => engine.undo());
elements.stopButton.addEventListener('click', () => {
  if (engine.state === STATES.STOPPED) engine.resumePlayback();
  else engine.stopPlayback();
});
elements.clearButton.addEventListener('click', () => {
  if (window.confirm('すべてのループとオーバーダブを削除しますか？')) {
    engine.clear();
    drawWaveform(elements.waveform, null);
    hideNotice();
  }
});
elements.masterVolume.addEventListener('input', () => {
  elements.masterVolumeValue.value = `${elements.masterVolume.value}%`;
  engine.setMasterVolume(Number(elements.masterVolume.value) / 100);
});
elements.monitorButton.addEventListener('click', () => engine.setMonitor(!engine.monitorEnabled));
elements.resumeButton.addEventListener('click', resumeAudio);
elements.testSoundButton.addEventListener('click', () => runSafely(() => engine.createTestLoop()));
elements.latencyButton.addEventListener('click', showLatencyReference);
elements.exportButton.addEventListener('click', exportTest);
elements.copyLogButton.addEventListener('click', copyLog);
elements.bpmButtons.forEach((button) => button.addEventListener('click', () => {
  setBpm(engine.tempo.bpm + Number(button.dataset.bpmDelta));
}));
elements.tapTempoButton.addEventListener('click', tapTempo);
elements.countInSelect.addEventListener('change', () => engine.setCountInBars(Number(elements.countInSelect.value)));
elements.metronomeSelect.addEventListener('change', () => engine.setMetronomeMode(elements.metronomeSelect.value));
elements.recordEndSelect.addEventListener('change', () => engine.setRecordEndMode(elements.recordEndSelect.value));
elements.overdubQuantizeButton.addEventListener('click', () => {
  engine.setQuantizedOverdub(!engine.quantizedOverdub);
  renderSettingToggles();
});

engine.addEventListener('statechange', ({ detail }) => renderState(detail.state));
engine.addEventListener('layerschange', () => renderLayers());
engine.addEventListener('monitorchange', ({ detail }) => {
  elements.monitorButton.setAttribute('aria-pressed', String(detail.enabled));
  elements.monitorButton.querySelector('strong').textContent = detail.enabled ? 'ON' : 'OFF';
  elements.statusMonitor.textContent = detail.enabled ? 'ON' : 'OFF';
});
engine.addEventListener('log', ({ detail }) => addLog(detail.message, detail.time));
engine.addEventListener('contextstate', ({ detail }) => {
  if (detail.state === 'suspended' || detail.state === 'interrupted') {
    showNotice('WARNING', `AudioContext ${detail.state}. Tap RESUME AUDIO.`, true);
  } else if (detail.state === 'running') {
    hideNotice();
  }
});
engine.addEventListener('error', ({ detail }) => showError(detail.error));
engine.addEventListener('recordingstart', () => {
  goUntil = performance.now() + 420;
});
engine.addEventListener('recordingendplan', ({ detail }) => renderEndPlan(detail));

document.addEventListener('visibilitychange', () => {
  addLog(`Visibility state: ${document.visibilityState}`);
  if (document.visibilityState === 'visible' && engine.context && engine.context.state !== 'running') {
    showNotice('WARNING', `AudioContext ${engine.context.state}. Tap RESUME AUDIO.`, true);
  }
});
window.addEventListener('pagehide', (event) => {
  if (!event.persisted) engine.destroy();
});

async function initializeAudio() {
  elements.startButton.disabled = true;
  elements.startButton.querySelector('span:nth-child(2)').textContent = '初期化中…';
  try {
    await engine.initialize();
    elements.startScreen.hidden = true;
    elements.looperScreen.hidden = false;
    renderState(STATES.IDLE);
    renderLayers();
    drawWaveform(elements.waveform, null);
    renderTempoSettings();
    startAnimation();
  } catch (error) {
    engine.destroy();
    elements.startButton.disabled = false;
    elements.startButton.querySelector('span:nth-child(2)').textContent = 'もう一度試す';
    showStartError(error);
  }
}

async function handleMainAction() {
  elements.loopButton.disabled = true;
  await runSafely(async () => {
    const actions = {
      [STATES.IDLE]: () => engine.startFirstRecording(),
      [STATES.FIRST_RECORDING]: async () => {
        await engine.finishFirstRecording();
        drawWaveform(elements.waveform, engine.layers[0]?.buffer);
      },
      [STATES.PLAYING]: () => engine.startOverdub(),
      [STATES.OVERDUB_RECORDING]: () => engine.finishOverdub(),
      [STATES.STOPPED]: () => engine.resumePlayback(),
    };
    await actions[engine.state]?.();
  });
  renderState(engine.state);
}

async function runSafely(action) {
  try {
    await action();
  } catch (error) {
    showError(error);
  }
}

function renderState(state) {
  const view = stateView[state] || stateView[STATES.ERROR];
  elements.loopAction.textContent = view.action;
  elements.loopHint.textContent = view.hint;
  elements.loopButton.dataset.state = state;
  elements.engineBadge.querySelector('span').textContent = state;
  elements.engineBadge.classList.toggle('error', state === STATES.ERROR);
  const hasLayers = engine.layers.length > 0;
  const recording = [STATES.FIRST_RECORDING, STATES.FIRST_RECORDING_ENDING, STATES.OVERDUB_RECORDING, STATES.OVERDUB_ENDING].includes(state);
  const pending = [STATES.COUNT_IN, STATES.FIRST_RECORDING_ENDING, STATES.OVERDUB_PENDING, STATES.OVERDUB_ENDING].includes(state);
  elements.undoButton.disabled = engine.layers.length <= 1 || recording || pending;
  elements.stopButton.disabled = !hasLayers || recording || state === STATES.OVERDUB_PENDING;
  elements.stopButton.textContent = state === STATES.STOPPED ? 'PLAY' : 'STOP';
  elements.clearButton.disabled = !hasLayers && state === STATES.IDLE;
  elements.testSoundButton.disabled = state !== STATES.IDLE;
  elements.loopButton.disabled = pending || state === STATES.ERROR;
  const tempoLocked = state !== STATES.IDLE || hasLayers;
  elements.bpmButtons.forEach((button) => { button.disabled = tempoLocked; });
  elements.tapTempoButton.disabled = tempoLocked;
  elements.tempoLockStatus.hidden = !tempoLocked;
  elements.countInSelect.disabled = state !== STATES.IDLE;
  elements.recordEndSelect.disabled = state !== STATES.IDLE;
  elements.overdubQuantizeButton.disabled = ![STATES.IDLE, STATES.PLAYING, STATES.STOPPED].includes(state);
  elements.statusAudio.textContent = engine.context?.state?.toUpperCase() || 'N/A';
  elements.statusRecorder.textContent = recording ? 'RECORDING' : (pending ? 'ARMED' : (engine.recorder?.mode || 'N/A').toUpperCase());
  renderRecordingIndicator(state);
  if ([STATES.FIRST_RECORDING_ENDING, STATES.OVERDUB_ENDING].includes(state)) {
    showNotice('ENDING', 'Loop ends at next bar.', false);
  } else if (state === STATES.OVERDUB_PENDING) {
    showNotice('STARTING', 'Overdub starts at next bar.', false);
  } else if (['ENDING', 'STARTING', 'FINISHING…', 'STOP REQUESTED'].includes(elements.noticeTitle.textContent)) {
    hideNotice();
  }
  renderLayers();
}

function renderLayers() {
  const layers = engine.getLayers();
  const playing = [STATES.PLAYING, STATES.OVERDUB_PENDING, STATES.OVERDUB_RECORDING, STATES.OVERDUB_ENDING].includes(engine.state);
  elements.statusLayers.textContent = String(layers.length);
  elements.layerCount.textContent = `${layers.length} ${layers.length === 1 ? 'TRACK' : 'TRACKS'}`;
  const layerChangeLocked = [
    STATES.COUNT_IN,
    STATES.FIRST_RECORDING,
    STATES.FIRST_RECORDING_ENDING,
    STATES.OVERDUB_PENDING,
    STATES.OVERDUB_RECORDING,
    STATES.OVERDUB_ENDING,
  ].includes(engine.state);
  elements.undoButton.disabled = layers.length <= 1 || layerChangeLocked;
  if (!layers.length) {
    elements.layersList.className = 'empty-state';
    elements.layersList.textContent = '最初のループを録音してください';
    return;
  }
  elements.layersList.className = 'layers-list';
  elements.layersList.innerHTML = layers.map((layer, index) => `
    <div class="layer-row ${index ? 'overdub' : ''} ${playing ? 'is-playing' : ''}">
      <span class="layer-index">${index + 1}</span>
      <div>${escapeHtml(layer.type)}<span>${index ? 'ADDITIONAL LAYER' : 'MASTER TIMING'}</span></div>
      <time>${layer.duration.toFixed(3)} sec</time>
    </div>`).join('');
}

function startAnimation() {
  const frame = () => {
    updateMeters();
    updateTransport();
    updateTempoDisplay();
    if (elements.debugPanel.open && performance.now() - lastDebugRender > 250) {
      renderDebug();
      lastDebugRender = performance.now();
    }
    animationFrame = requestAnimationFrame(frame);
  };
  cancelAnimationFrame(animationFrame);
  frame();
}

function updateMeters() {
  const input = engine.getInputLevel();
  const output = engine.getOutputLevel();
  const inputPercent = Math.min(100, Math.max(2, (input.rms || 0) * 320));
  const outputPercent = Math.min(100, Math.max(2, (output.rms || 0) * 260));
  elements.inputMeter.style.width = `${inputPercent}%`;
  elements.outputMeter.style.width = `${outputPercent}%`;
  const clipping = (input.peak || 0) > 0.96;
  elements.clipLabel.textContent = clipping ? 'CLIP!' : 'OK';
  elements.clipLabel.style.color = clipping ? 'var(--red)' : 'var(--green)';
}

function updateTransport() {
  const length = engine.getLoopLength();
  const active = [STATES.PLAYING, STATES.OVERDUB_RECORDING].includes(engine.state);
  const position = active ? engine.getCurrentPosition() : 0;
  const percent = length ? Math.min(100, (position / length) * 100) : 0;
  elements.loopLength.textContent = length ? `${length.toFixed(3)} sec` : '—.— — sec';
  elements.loopEnd.textContent = length ? length.toFixed(1) : '—.—';
  elements.loopPosition.textContent = length ? `${position.toFixed(2)} sec` : (engine.state === STATES.IDLE ? 'READY' : engine.state);
  elements.progressFill.style.width = `${percent}%`;
  elements.progressHead.style.left = `${percent}%`;
  const count = active ? engine.updateLoopCount() : engine.loopCount;
  elements.loopCount.textContent = String(count || 0);
  elements.statusLoopCount.textContent = String(count || 0);
  elements.statusFirstLoop.textContent = length ? `${length.toFixed(3)} sec` : 'N/A';
  elements.statusMic.textContent = engine.stream?.active ? 'OK' : 'N/A';
  elements.statusAudio.textContent = engine.context?.state?.toUpperCase() || 'N/A';
}

function updateTempoDisplay() {
  if (!engine.tempo) return;
  const tempo = engine.tempo;
  const position = tempo.getPosition();
  elements.bpmValue.textContent = String(tempo.bpm);
  elements.timeSignature.textContent = `${tempo.beatsPerBar} / ${tempo.beatUnit}`;
  const firstRecording = [STATES.FIRST_RECORDING, STATES.FIRST_RECORDING_ENDING].includes(engine.state);
  const displayBar = firstRecording ? Math.max(1, position.bar - tempo.countInBars) : position.bar;
  elements.barNumber.textContent = displayBar > 0 ? String(displayBar) : '—';
  elements.beatDots.forEach((dot, index) => dot.classList.toggle('is-active', position.beat === index + 1));
  const firstRecordingActive = [STATES.FIRST_RECORDING, STATES.FIRST_RECORDING_ENDING].includes(engine.state);
  elements.recordingProgress.hidden = !firstRecordingActive;
  if (firstRecordingActive) {
    const elapsed = Math.max(0, engine.context.currentTime - engine.firstRecordingStartTime);
    const rawBars = elapsed / tempo.getBarDuration();
    elements.recBarLabel.textContent = `REC BAR ${Math.floor(rawBars) + 1}`;
    elements.completedBarsLabel.textContent = `Completed Bars: ${Math.floor(rawBars)}`;
  }

  if (engine.state === STATES.COUNT_IN) {
    elements.countdownOverlay.hidden = false;
    elements.countdownOverlay.classList.remove('is-go');
    elements.countdownLabel.textContent = 'COUNT IN';
    elements.countdownNumber.textContent = position.beat || '…';
    const countBar = position.bar || 1;
    const lastBeat = countBar === tempo.countInBars && position.beat === tempo.beatsPerBar;
    elements.countdownSubtext.textContent = lastBeat ? 'READY' : `BAR ${countBar} / ${tempo.countInBars}`;
  } else if (performance.now() < goUntil) {
    elements.countdownOverlay.hidden = false;
    elements.countdownOverlay.classList.add('is-go');
    elements.countdownLabel.textContent = 'RECORD';
    elements.countdownNumber.textContent = 'GO!';
    elements.countdownSubtext.textContent = 'ON THE BEAT';
  } else {
    elements.countdownOverlay.hidden = true;
    elements.countdownOverlay.classList.remove('is-go');
  }
}

function renderDebug() {
  const info = engine.getDebugInfo();
  const settings = info.microphone.settings;
  fillDebugList(elements.audioDebug, {
    'AudioContext State': info.context.state,
    'Sample Rate': formatHz(info.context.sampleRate),
    'Base Latency': formatSeconds(info.context.baseLatency),
    'Output Latency': formatSeconds(info.context.outputLatency),
    'Current Time': formatSeconds(info.context.currentTime),
    'Recorder': info.recorder,
  });
  fillDebugList(elements.micDebug, {
    'Device Label': info.microphone.label,
    'Sample Rate': formatHz(settings.sampleRate),
    'Channel Count': valueOrNA(settings.channelCount),
    'Echo Cancellation': valueOrNA(settings.echoCancellation),
    'Noise Suppression': valueOrNA(settings.noiseSuppression),
    'Auto Gain Control': valueOrNA(settings.autoGainControl),
  });
  fillDebugList(elements.constraintsDebug, {
    'Requested Echo Cancellation': false,
    'Requested Noise Suppression': false,
    'Requested Auto Gain Control': false,
    'Actual Echo Cancellation': valueOrNA(settings.echoCancellation),
    'Actual Noise Suppression': valueOrNA(settings.noiseSuppression),
    'Actual Auto Gain Control': valueOrNA(settings.autoGainControl),
  });
  fillDebugList(elements.timingDebug, {
    'Looper State': info.timing.looperState,
    'Master Loop Length': formatSeconds(info.timing.loopLength),
    'Current Loop Number': info.timing.loopNumber,
    'Current Loop Position': formatSeconds(info.timing.loopPosition),
    'Recording Start Time': formatSeconds(info.timing.firstRecordingStart),
    'Recording End Time': formatSeconds(info.timing.firstRecordingEnd),
    'Calculated Loop Length': formatSeconds(info.timing.loopLength),
    'Playback Start Time': formatSeconds(info.timing.playbackStart),
    'PlaybackStart - RecordingEnd': formatSeconds(info.timing.playbackStartDifference),
    'Next Loop Time': formatSeconds(info.timing.nextLoopTime),
    'Loop Index': info.timing.loopIndex,
    'Scheduled Loop Index': info.timing.scheduledLoopIndex,
    'Last Overdub Start': formatSeconds(info.timing.lastOverdubStart),
    'Last Overdub End': formatSeconds(info.timing.lastOverdubEnd),
    'Scheduling Ahead': formatSeconds(info.timing.schedulingAhead),
  });
  fillDebugList(elements.tempoDebug, {
    'TempoClock State': info.tempo.state,
    'BPM': info.tempo.bpm,
    'Seconds Per Beat': formatSeconds(info.tempo.secondsPerBeat),
    'Beats Per Bar': info.tempo.beatsPerBar,
    'Current Beat': info.tempo.currentBeat,
    'Current Bar': info.tempo.currentBar,
    'TempoClock Start Time': formatSeconds(info.tempo.metronomeStartTime),
    'Next Scheduled Beat': formatSeconds(info.tempo.nextScheduledBeat),
    'Count-In Bars': info.tempo.countInBars,
    'Metronome Mode': info.tempo.metronomeMode,
    'Quantize Mode': info.tempo.quantizeMode,
    'Quantized Overdub': info.tempo.quantizedOverdub,
    'Pending Recording Start': formatSeconds(info.tempo.pendingRecordingStart),
    'Pending Recording Stop': formatSeconds(info.tempo.pendingRecordingStop),
    'Record End Mode': info.recordingEnd.mode,
    'Recording Start Time': formatSeconds(info.recordingEnd.recordingStartTime),
    'Stop Request Time': formatSeconds(info.recordingEnd.stopRequestTime),
    'Elapsed Recording Time': formatSeconds(info.recordingEnd.elapsedRecordingTime),
    'Seconds Per Bar': formatSeconds(info.recordingEnd.secondsPerBar),
    'Raw Bar Position': formatDecimal(info.recordingEnd.rawBarPosition),
    'Completed Bars': valueOrNA(info.recordingEnd.completedBars),
    'Bar Progress': formatDecimal(info.recordingEnd.barProgress),
    'Smart End Threshold': formatDecimal(info.recordingEnd.smartEndThreshold),
    'Calculated Target Bars': formatDecimal(info.recordingEnd.calculatedTargetBars),
    'Calculated Loop Length': formatSeconds(info.recordingEnd.calculatedLoopLength),
    'Actual Recorded Buffer Length': formatSeconds(info.recordingEnd.actualRecordedBufferLength),
    'Final Trimmed Buffer Length': formatSeconds(info.recordingEnd.finalTrimmedBufferLength),
  });
  fillDebugList(elements.deviceDebug, {
    'User Agent': navigator.userAgent,
    'Screen Size': `${screen.width} × ${screen.height}`,
    'Viewport': `${window.innerWidth} × ${window.innerHeight}`,
    'Device Pixel Ratio': window.devicePixelRatio,
    'Visibility State': document.visibilityState,
    'Device Memory': navigator.deviceMemory ? `${navigator.deviceMemory} GB (estimate)` : 'N/A',
  });
}

function fillDebugList(element, values) {
  element.innerHTML = Object.entries(values).map(([label, value]) =>
    `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(valueOrNA(value))}</dd></div>`).join('');
}

function setBpm(value) {
  const bpm = engine.setBpm(value);
  elements.bpmValue.textContent = String(bpm);
}

function tapTempo() {
  const now = performance.now();
  if (tapTimes.length && now - tapTimes[tapTimes.length - 1] > 2000) tapTimes = [];
  tapTimes.push(now);
  if (tapTimes.length > 8) tapTimes.shift();
  if (tapTimes.length < 2) {
    addLog('Tap tempo started');
    return;
  }
  const intervals = tapTimes.slice(1).map((time, index) => time - tapTimes[index]);
  const average = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
  const bpm = Math.round(60000 / average);
  if (bpm >= 40 && bpm <= 200) setBpm(bpm);
}

function renderTempoSettings() {
  elements.bpmValue.textContent = String(engine.tempo.bpm);
  elements.countInSelect.value = String(engine.tempo.countInBars);
  elements.metronomeSelect.value = engine.tempo.metronomeMode;
  elements.recordEndSelect.value = engine.recordEndMode;
  renderSettingToggles();
}

function renderSettingToggles() {
  const apply = (button, enabled) => {
    button.setAttribute('aria-pressed', String(enabled));
    button.textContent = enabled ? 'ON' : 'OFF';
  };
  apply(elements.overdubQuantizeButton, engine.quantizedOverdub);
}

function renderEndPlan(plan) {
  const bars = Number.isInteger(plan.calculatedTargetBars)
    ? String(plan.calculatedTargetBars)
    : plan.calculatedTargetBars.toFixed(2);
  const title = plan.shouldContinueRecording ? 'FINISHING…' : 'STOP REQUESTED';
  const message = plan.mode === 'FREE'
    ? `SAVE FREE LENGTH (${plan.calculatedLoopLength.toFixed(3)} sec)`
    : `SAVE AS ${bars} ${bars === '1' ? 'BAR' : 'BARS'}`;
  showNotice(title, message, false);
  if (plan.shouldContinueRecording) {
    elements.loopAction.textContent = `FINISHING BAR ${bars}…`;
  }
}

function renderRecordingIndicator(state) {
  const recording = [STATES.FIRST_RECORDING, STATES.FIRST_RECORDING_ENDING, STATES.OVERDUB_RECORDING, STATES.OVERDUB_ENDING].includes(state);
  const pending = [STATES.COUNT_IN, STATES.OVERDUB_PENDING].includes(state);
  elements.recordingIndicator.classList.toggle('is-recording', recording);
  elements.recordingIndicator.classList.toggle('is-pending', pending);
  const label = recording ? 'RECORDING' : (pending ? 'ARMED' : (state === STATES.PLAYING ? 'PLAYING' : 'READY'));
  elements.recordingIndicator.querySelector('span').textContent = label;
}

function addLog(message, date = new Date()) {
  const time = date.toLocaleTimeString('ja-JP', { hour12: false });
  logs.push(`${time} ${message}`);
  if (logs.length > 150) logs.splice(0, logs.length - 150);
  elements.eventLog.textContent = logs.join('\n');
  elements.eventLog.scrollTop = elements.eventLog.scrollHeight;
}

async function copyLog() {
  const text = logs.join('\n');
  try {
    await navigator.clipboard.writeText(text);
    elements.copyLogButton.textContent = 'COPIED';
  } catch (_) {
    elements.logFallback.hidden = false;
    elements.logFallback.value = text;
    elements.logFallback.focus();
    elements.logFallback.select();
    try { document.execCommand('copy'); } catch (_) { /* selectable fallback remains visible */ }
    elements.copyLogButton.textContent = 'SELECT LOG';
  }
  setTimeout(() => { elements.copyLogButton.textContent = 'LOG COPY'; }, 1600);
}

function showLatencyReference() {
  const base = engine.context?.baseLatency;
  const output = engine.context?.outputLatency;
  const available = [base, output].filter((value) => Number.isFinite(value));
  const estimate = available.length ? available.reduce((sum, value) => sum + value, 0) : null;
  elements.latencyResult.textContent = estimate === null
    ? 'この端末ではレイテンシー値を取得できません。N/A（ブラウザAPIの制約）'
    : `API参考値: base ${formatSeconds(base)} + output ${formatSeconds(output)} = 約 ${(estimate * 1000).toFixed(1)} ms。往復遅延の実測値ではありません。`;
  addLog('Latency API reference displayed');
}

function exportTest() {
  runSafely(() => {
    const blob = engine.exportWav();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `live-looper-${Date.now()}.wav`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    addLog(`WAV export created (${Math.round(blob.size / 1024)} KB)`);
  });
}

async function resumeAudio() {
  await runSafely(async () => {
    const state = await engine.resumeAudio();
    if (state === 'running') hideNotice();
  });
}

function showStartError(error) {
  document.querySelector('.start-error')?.remove();
  const secureHint = !window.isSecureContext ? ' HTTPSまたはlocalhostで開いてください。' : '';
  const message = document.createElement('p');
  message.className = 'start-error';
  message.textContent = `${friendlyError(error)}${secureHint} (${error.name || 'Error'})`;
  elements.startButton.after(message);
}

function showError(error) {
  addLog(`ERROR: ${error.name || 'Error'} — ${error.message}`);
  showNotice('ERROR', `${friendlyError(error)} (${error.name || 'Error'})`, false);
}

function showNotice(title, message, resumable) {
  elements.notice.hidden = false;
  elements.noticeTitle.textContent = title;
  elements.noticeMessage.textContent = message;
  elements.resumeButton.hidden = !resumable;
}

function hideNotice() {
  elements.notice.hidden = true;
  elements.resumeButton.hidden = true;
}

function friendlyError(error) {
  if (error.name === 'NotAllowedError') return 'マイクの使用が許可されませんでした。Safariのサイト設定を確認してください。';
  if (error.name === 'NotFoundError') return '使用できるマイクが見つかりません。';
  if (/too short/i.test(error.message)) return '録音が短すぎます。0.2秒以上録音してください。';
  return error.message || 'オーディオ処理で問題が発生しました。';
}

function formatSeconds(value) {
  return Number.isFinite(value) ? `${Number(value).toFixed(3)} sec` : 'N/A';
}

function formatHz(value) {
  return Number.isFinite(value) ? `${value} Hz` : 'N/A';
}

function formatDecimal(value) {
  return Number.isFinite(value) ? Number(value).toFixed(3) : 'N/A';
}

function valueOrNA(value) {
  if (value === undefined || value === null || value === '') return 'N/A';
  return String(value);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  })[character]);
}
