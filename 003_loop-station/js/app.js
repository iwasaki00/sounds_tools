import { LooperEngine, STATES } from './looper-engine.js';
import { drawWaveform } from './waveform.js';

const engine = new LooperEngine();
const logs = [];
let animationFrame = null;
let lastDebugRender = 0;

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
};

const stateView = {
  [STATES.IDLE]: { action: 'REC', hint: 'FIRST LOOP' },
  [STATES.FIRST_RECORDING]: { action: 'STOP & LOOP', hint: 'RECORDING' },
  [STATES.PLAYING]: { action: 'OVERDUB', hint: 'LOOP PLAYING' },
  [STATES.OVERDUB_RECORDING]: { action: 'END OVERDUB', hint: 'LAYER RECORDING' },
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
  elements.loopButton.disabled = false;
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
  const recording = state === STATES.FIRST_RECORDING || state === STATES.OVERDUB_RECORDING;
  elements.undoButton.disabled = engine.layers.length <= 1 || recording;
  elements.stopButton.disabled = !hasLayers || recording;
  elements.stopButton.textContent = state === STATES.STOPPED ? 'PLAY' : 'STOP';
  elements.clearButton.disabled = !hasLayers && state === STATES.IDLE;
  elements.testSoundButton.disabled = state !== STATES.IDLE;
  elements.statusAudio.textContent = engine.context?.state?.toUpperCase() || 'N/A';
  elements.statusRecorder.textContent = recording ? 'RECORDING' : (engine.recorder?.mode || 'N/A').toUpperCase();
  renderLayers();
}

function renderLayers() {
  const layers = engine.getLayers();
  const playing = [STATES.PLAYING, STATES.OVERDUB_RECORDING].includes(engine.state);
  elements.statusLayers.textContent = String(layers.length);
  elements.layerCount.textContent = `${layers.length} ${layers.length === 1 ? 'TRACK' : 'TRACKS'}`;
  elements.undoButton.disabled = layers.length <= 1 || engine.state === STATES.OVERDUB_RECORDING;
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
    'Master Loop Length': formatSeconds(info.timing.loopLength),
    'Current Loop Number': info.timing.loopNumber,
    'Current Loop Position': formatSeconds(info.timing.loopPosition),
    'First Recording Start': formatSeconds(info.timing.firstRecordingStart),
    'First Recording End': formatSeconds(info.timing.firstRecordingEnd),
    'Playback Start': formatSeconds(info.timing.playbackStart),
    'Last Overdub Start': formatSeconds(info.timing.lastOverdubStart),
    'Last Overdub End': formatSeconds(info.timing.lastOverdubEnd),
    'Scheduling Ahead': formatSeconds(info.timing.schedulingAhead),
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

function valueOrNA(value) {
  if (value === undefined || value === null || value === '') return 'N/A';
  return String(value);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  })[character]);
}
