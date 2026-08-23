class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.recording = false;
    this.armed = false;
    this.recordingId = 0;
    this.startAtFrame = null;
    this.stopAtFrame = null;

    this.port.onmessage = (event) => {
      const { type, id } = event.data || {};
      if (type === 'start') {
        this.recordingId = id;
        this.startAtFrame = Number.isFinite(event.data.atFrame) ? Math.max(currentFrame, event.data.atFrame) : currentFrame;
        this.stopAtFrame = null;
        this.recording = false;
        this.armed = true;
        this.port.postMessage({ type: 'scheduled-start', id, frame: this.startAtFrame });
      }
      if (type === 'stop' && id === this.recordingId) {
        this.stopAtFrame = Number.isFinite(event.data.atFrame) ? Math.max(currentFrame, event.data.atFrame) : currentFrame;
      }
      if (type === 'cancel') {
        this.recording = false;
        this.armed = false;
        this.port.postMessage({ type: 'cancelled', id: this.recordingId, frame: currentFrame });
      }
    };
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;
    const blockStart = currentFrame;
    const blockEnd = blockStart + input.length;
    let from = 0;

    if (this.armed && !this.recording) {
      if (this.startAtFrame >= blockEnd) return true;
      from = Math.max(0, Math.round(this.startAtFrame - blockStart));
      this.recording = true;
      this.armed = false;
      this.port.postMessage({ type: 'started', id: this.recordingId, frame: blockStart + from });
    }

    if (this.recording) {
      let to = input.length;
      if (Number.isFinite(this.stopAtFrame) && this.stopAtFrame < blockEnd) {
        to = Math.max(from, Math.min(input.length, Math.round(this.stopAtFrame - blockStart)));
      }
      if (to > from) {
        const copy = new Float32Array(input.subarray(from, to));
        this.port.postMessage({ type: 'data', id: this.recordingId, samples: copy }, [copy.buffer]);
      }
      if (Number.isFinite(this.stopAtFrame) && this.stopAtFrame <= blockEnd) {
        const stoppedFrame = Math.max(blockStart, Math.min(blockEnd, this.stopAtFrame));
        this.recording = false;
        this.stopAtFrame = null;
        this.port.postMessage({ type: 'stopped', id: this.recordingId, frame: stoppedFrame });
      }
    }
    return true;
  }
}

registerProcessor('live-looper-recorder', RecorderProcessor);
