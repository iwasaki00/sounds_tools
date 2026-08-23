class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.recording = false;
    this.recordingId = 0;

    this.port.onmessage = (event) => {
      const { type, id } = event.data || {};
      if (type === 'start') {
        this.recordingId = id;
        this.recording = true;
        this.port.postMessage({ type: 'started', id, frame: currentFrame });
      }
      if (type === 'stop' && id === this.recordingId) {
        this.recording = false;
        this.port.postMessage({ type: 'stopped', id, frame: currentFrame });
      }
      if (type === 'cancel') {
        this.recording = false;
        this.port.postMessage({ type: 'cancelled', id: this.recordingId, frame: currentFrame });
      }
    };
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (this.recording && input) {
      const copy = new Float32Array(input);
      this.port.postMessage({ type: 'data', id: this.recordingId, samples: copy }, [copy.buffer]);
    }
    return true;
  }
}

registerProcessor('live-looper-recorder', RecorderProcessor);
