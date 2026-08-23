export class PCMRecorder {
  constructor(audioContext, sourceNode, log = () => {}) {
    this.context = audioContext;
    this.sourceNode = sourceNode;
    this.log = log;
    this.node = null;
    this.silentGain = null;
    this.chunks = [];
    this.recordingId = 0;
    this.active = false;
    this.startFrame = null;
    this.stopFrame = null;
    this.stopResolver = null;
    this.mode = 'uninitialized';
  }

  async initialize() {
    this.silentGain = this.context.createGain();
    this.silentGain.gain.value = 0;
    this.silentGain.connect(this.context.destination);

    if (this.context.audioWorklet) {
      try {
        await this.context.audioWorklet.addModule(new URL('../worklets/recorder-worklet.js', import.meta.url));
        this.node = new AudioWorkletNode(this.context, 'live-looper-recorder', {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [1],
        });
        this.node.port.onmessage = (event) => this.handleWorkletMessage(event.data);
        this.sourceNode.connect(this.node);
        this.node.connect(this.silentGain);
        this.mode = 'AudioWorklet';
        this.log('Recorder initialized (AudioWorklet)');
        return;
      } catch (error) {
        this.log(`AudioWorklet unavailable; fallback: ${error.name || 'Error'}`);
      }
    }

    const createProcessor = this.context.createScriptProcessor?.bind(this.context);
    if (!createProcessor) throw new Error('PCM recording is not supported by this browser.');
    this.node = createProcessor(2048, 1, 1);
    this.node.onaudioprocess = (event) => {
      if (!this.active) return;
      this.chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
    };
    this.sourceNode.connect(this.node);
    this.node.connect(this.silentGain);
    this.mode = 'ScriptProcessor fallback';
    this.log('Recorder initialized (ScriptProcessor fallback)');
  }

  handleWorkletMessage(message) {
    if (message.id !== this.recordingId) return;
    if (message.type === 'started') this.startFrame = message.frame;
    if (message.type === 'data' && this.active) this.chunks.push(message.samples);
    if (message.type === 'stopped' || message.type === 'cancelled') {
      this.stopFrame = message.frame;
      this.stopResolver?.();
      this.stopResolver = null;
    }
  }

  start() {
    if (this.active) throw new Error('Recorder is already active.');
    this.active = true;
    this.chunks = [];
    this.startFrame = null;
    this.stopFrame = null;
    this.recordingId += 1;
    if (this.mode === 'AudioWorklet') {
      this.node.port.postMessage({ type: 'start', id: this.recordingId });
    } else {
      this.startFrame = Math.round(this.context.currentTime * this.context.sampleRate);
    }
    return this.context.currentTime;
  }

  async stop() {
    if (!this.active) throw new Error('Recorder is not active.');
    if (this.mode === 'AudioWorklet') {
      const stopped = new Promise((resolve) => { this.stopResolver = resolve; });
      this.node.port.postMessage({ type: 'stop', id: this.recordingId });
      await Promise.race([stopped, new Promise((resolve) => setTimeout(resolve, 250))]);
    } else {
      this.stopFrame = Math.round(this.context.currentTime * this.context.sampleRate);
    }
    this.active = false;
    const samples = this.mergeChunks(this.chunks);
    const startTime = (this.startFrame ?? Math.round(this.context.currentTime * this.context.sampleRate) - samples.length) / this.context.sampleRate;
    const endTime = (this.stopFrame ?? this.startFrame + samples.length) / this.context.sampleRate;
    return { samples, startTime, endTime };
  }

  cancel() {
    if (!this.active) return;
    this.active = false;
    this.chunks = [];
    this.node?.port?.postMessage({ type: 'cancel', id: this.recordingId });
  }

  mergeChunks(chunks) {
    const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Float32Array(length);
    let offset = 0;
    chunks.forEach((chunk) => {
      result.set(chunk, offset);
      offset += chunk.length;
    });
    return result;
  }

  destroy() {
    this.cancel();
    if (this.node) {
      if ('onaudioprocess' in this.node) this.node.onaudioprocess = null;
      this.node.disconnect();
    }
    this.silentGain?.disconnect();
  }
}
