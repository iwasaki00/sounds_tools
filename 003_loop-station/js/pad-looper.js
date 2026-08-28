import { SoundEngine } from './sound-engine.js';

export const PAD_STATES = Object.freeze({ READY:'PAD_READY', COUNT_IN:'PAD_COUNT_IN', RECORDING:'PAD_RECORDING', PLAYING:'PAD_PLAYING', OVERDUB_ARMED:'PAD_OVERDUB_ARMED', OVERDUB_RECORDING:'PAD_OVERDUB_RECORDING', OVERDUB_ENDING:'PAD_OVERDUB_ENDING', STOPPED:'PAD_STOPPED' });

export class PadLooper extends EventTarget {
  constructor(context, outputNode, tempo, log = () => {}) {
    super(); Object.assign(this, { context, tempo, log });
    this.soundEngine = new SoundEngine(context, outputNode);
    this.state = PAD_STATES.READY; this.loopBars = 4; this.loopLength = 0;
    this.recordingStartTime = null; this.recordingEndTime = null; this.playbackOrigin = null;
    this.layers = []; this.layerSequence = 0; this.pendingLayer = null;
    this.overdubStartTime = null; this.overdubEndTime = null; this.nextLoopIndex = 0; this.loopCount = 0;
    this.schedulerLookahead = 25; this.schedulerAhead = .25; this.schedulerTimer = null; this.nextScheduledEventTime = null;
    this.scheduledKeys = new Set(); this.scheduledVoices = new Set(); this.actionTimers = new Set();
    this.log('PAD MODE ready');
  }

  setLoopBars(bars) { const value = Number(bars); if (this.state === PAD_STATES.READY && [1,2,4,8].includes(value)) this.loopBars = value; this.emit('change', this.getDebugInfo()); }
  playPad(soundId) {
    const when = this.context.currentTime; this.soundEngine.play(soundId, when);
    if (this.state === PAD_STATES.RECORDING) this.recordPadEvent(soundId, when, this.layers[0]);
    if (this.state === PAD_STATES.OVERDUB_RECORDING) this.recordPadEvent(soundId, when, this.pendingLayer);
    this.emit('padhit', { soundId, time: when });
  }

  startRecording() {
    if (this.state !== PAD_STATES.READY) return;
    this.clearLoopData(); this.log('PAD REC requested');
    const startTime = this.tempo.beginCountIn();
    this.loopLength = this.loopBars * this.tempo.getBarDuration();
    this.recordingStartTime = startTime; this.recordingEndTime = startTime + this.loopLength;
    this.layers = [this.createLayer('PAD FIRST LOOP')]; this.setState(PAD_STATES.COUNT_IN);
    this.scheduleActionAt(startTime, () => { if (this.state !== PAD_STATES.COUNT_IN) return; this.tempo.finishCountIn(); this.log('PAD recording started'); this.setState(PAD_STATES.RECORDING); });
    this.scheduleActionAt(this.recordingEndTime, () => this.finishFirstRecording());
  }

  finishFirstRecording() {
    if (this.state !== PAD_STATES.RECORDING) return;
    this.playbackOrigin = this.recordingEndTime; this.nextLoopIndex = 1; this.loopCount = 1; this.startScheduler();
    this.log(`PAD recording finished; Events=${this.getEventCount()}`); this.log('Loop playback started immediately');
    this.setState(PAD_STATES.PLAYING); this.emit('layerschange', { layers: this.getLayers() });
  }

  recordPadEvent(soundId, when, layer) {
    if (!layer || !this.loopLength) return;
    const reference = this.state === PAD_STATES.RECORDING ? this.recordingStartTime : this.overdubStartTime;
    const offset = (((when - reference) % this.loopLength) + this.loopLength) % this.loopLength;
    const event = { soundId, offset }; layer.events.push(event); layer.events.sort((a,b) => a.offset - b.offset);
    const currentCycle = this.state === PAD_STATES.RECORDING ? -1 : Math.floor((when - this.playbackOrigin) / this.loopLength);
    const nextCycle = currentCycle + 1;
    const recurrence = this.state === PAD_STATES.RECORDING ? this.recordingEndTime + offset : this.playbackOrigin + nextCycle * this.loopLength + offset;
    this.scheduleEvent(layer, event, recurrence, nextCycle);
    this.log(`${soundId.toUpperCase()} offset=${offset.toFixed(3)}`); this.emit('eventschange', { events: this.getEvents() });
  }

  toggleOverdub() { if (this.state === PAD_STATES.PLAYING) this.armOverdub(); else if (this.state === PAD_STATES.OVERDUB_RECORDING) this.endOverdub(); }
  armOverdub() {
    const boundary = this.getNextLoopBoundary(this.context.currentTime + .05);
    this.pendingLayer = this.createLayer('PAD OVERDUB'); this.overdubStartTime = boundary;
    this.log(`PAD OVERDUB armed for ${boundary.toFixed(3)}`); this.setState(PAD_STATES.OVERDUB_ARMED);
    this.scheduleActionAt(boundary, () => { if (this.state !== PAD_STATES.OVERDUB_ARMED) return; this.log('PAD OVERDUB recording started'); this.setState(PAD_STATES.OVERDUB_RECORDING); });
  }
  endOverdub() {
    const boundary = this.getNextLoopBoundary(this.context.currentTime + .05); this.overdubEndTime = boundary;
    const loopIndex = Math.round((boundary - this.playbackOrigin) / this.loopLength);
    this.pendingLayer?.events.forEach(event => this.scheduleEvent(this.pendingLayer, event, boundary + event.offset, loopIndex));
    this.log(`PAD OVERDUB ends at next loop ${boundary.toFixed(3)}`); this.setState(PAD_STATES.OVERDUB_ENDING);
    this.scheduleActionAt(boundary, () => { if (this.state !== PAD_STATES.OVERDUB_ENDING) return; const count = this.pendingLayer?.events.length || 0; if (count) this.layers.push(this.pendingLayer); this.log(`PAD OVERDUB finished; Events=${count}`); this.pendingLayer = null; this.setState(PAD_STATES.PLAYING); this.emit('layerschange', { layers:this.getLayers() }); });
  }

  createDemoBeat(testClick = false) {
    if (this.state !== PAD_STATES.READY) return;
    this.clearLoopData(); this.loopBars = 1; this.loopLength = this.tempo.getBarDuration();
    const beat = this.tempo.getSecondsPerBeat(), layer = this.createLayer(testClick ? 'TEST CLICK' : 'DEMO BEAT');
    layer.events = testClick ? [0,1,2,3].map(i => ({ soundId:'rim', offset:i*beat })) : [
      {soundId:'kick',offset:0},{soundId:'kick',offset:beat*2},{soundId:'snare',offset:beat},{soundId:'snare',offset:beat*3},
      ...Array.from({length:8},(_,i)=>({soundId:'closed-hat',offset:i*beat/2})) ];
    this.layers = [layer]; this.startPlayback(testClick ? 'TEST CLICK' : 'DEMO BEAT'); this.emit('layerschange', { layers:this.getLayers() });
  }

  startPlayback(reason = 'PAD LOOP') {
    this.clearScheduledVoices(); this.playbackOrigin = this.context.currentTime + .08; this.nextLoopIndex = 0; this.loopCount = 0;
    this.tempo.alignTo(this.playbackOrigin); this.startScheduler(); this.setState(PAD_STATES.PLAYING); this.scheduleAhead();
    this.log(`${reason} playback scheduled at ${this.playbackOrigin.toFixed(3)}`);
  }
  stop() { if (![PAD_STATES.PLAYING,PAD_STATES.OVERDUB_ARMED,PAD_STATES.OVERDUB_RECORDING,PAD_STATES.OVERDUB_ENDING].includes(this.state)) return; this.clearActions(); this.stopScheduler(); this.clearScheduledVoices(); this.pendingLayer = null; this.tempo.stop(); this.setState(PAD_STATES.STOPPED); this.log('PAD LOOP stopped'); }
  resume() { if (this.state === PAD_STATES.STOPPED) this.startPlayback('PAD LOOP resume'); }
  undo() { if (this.layers.length <= 1 || this.state !== PAD_STATES.PLAYING) return false; const removed=this.layers.pop(); this.scheduledVoices.forEach(entry=>{if(entry.layerId===removed.id){entry.voice?.stop();this.scheduledVoices.delete(entry);}}); [...this.scheduledKeys].filter(key=>key.startsWith(`${removed.id}:`)).forEach(key=>this.scheduledKeys.delete(key)); this.log(`PAD UNDO Layer ${removed.id}`); this.emit('layerschange',{layers:this.getLayers()}); return true; }
  clear() { this.clearActions(); this.stopScheduler(); this.clearScheduledVoices(); this.tempo.stop(); this.clearLoopData(); this.setState(PAD_STATES.READY); this.log('PAD LOOPER cleared'); this.emit('layerschange',{layers:[]}); }
  clearLoopData() { this.layers=[]; this.pendingLayer=null; this.loopLength=0; this.recordingStartTime=null; this.recordingEndTime=null; this.playbackOrigin=null; this.overdubStartTime=null; this.overdubEndTime=null; this.nextLoopIndex=0; this.loopCount=0; this.nextScheduledEventTime=null; this.scheduledKeys.clear(); }

  startScheduler() { this.stopScheduler(); this.schedulerTimer=window.setInterval(()=>this.scheduleAhead(),this.schedulerLookahead); }
  stopScheduler() { if(this.schedulerTimer) window.clearInterval(this.schedulerTimer); this.schedulerTimer=null; }
  scheduleAhead() {
    if(!this.playbackOrigin||!this.loopLength) return; const horizon=this.context.currentTime+this.schedulerAhead;
    while(this.playbackOrigin+this.nextLoopIndex*this.loopLength<=horizon){ const loopStart=this.playbackOrigin+this.nextLoopIndex*this.loopLength;
      this.layers.filter(layer=>!layer.muted).forEach(layer=>layer.events.forEach(event=>{ const when=loopStart+event.offset; if(when>=this.context.currentTime-.01)this.scheduleEvent(layer,event,when,this.nextLoopIndex); })); this.nextLoopIndex+=1; }
  }
  scheduleEvent(layer,event,when,loopIndex){ const key=`${layer.id}:${loopIndex}:${event.soundId}:${event.offset.toFixed(6)}`; if(this.scheduledKeys.has(key))return; this.scheduledKeys.add(key); const voice=this.soundEngine.play(event.soundId,when); this.scheduledVoices.add({voice,layerId:layer.id,when}); this.nextScheduledEventTime=when; }
  clearScheduledVoices(){ this.scheduledVoices.forEach(entry=>entry.voice?.stop()); this.scheduledVoices.clear(); this.scheduledKeys.clear(); }
  scheduleActionAt(time,callback){ const timer=window.setTimeout(()=>{this.actionTimers.delete(timer);callback();},Math.max(0,(time-this.context.currentTime)*1000)); this.actionTimers.add(timer); }
  clearActions(){this.actionTimers.forEach(timer=>window.clearTimeout(timer));this.actionTimers.clear();}
  getNextLoopBoundary(after=this.context.currentTime){if(!this.playbackOrigin||!this.loopLength||after<=this.playbackOrigin)return this.playbackOrigin;const index=Math.ceil((after-this.playbackOrigin)/this.loopLength-1e-9);return this.playbackOrigin+index*this.loopLength;}
  createLayer(type){return{id:++this.layerSequence,type,events:[],muted:false};}
  setState(state){this.state=state;this.emit('statechange',{state});}
  updateLoopCount(){if(!this.playbackOrigin||this.context.currentTime<this.playbackOrigin)return 0;this.loopCount=Math.floor((this.context.currentTime-this.playbackOrigin)/this.loopLength)+1;return this.loopCount;}
  getCurrentPosition(){if(!this.playbackOrigin||!this.loopLength||this.context.currentTime<this.playbackOrigin)return 0;return(this.context.currentTime-this.playbackOrigin)%this.loopLength;}
  getCurrentBar(){const ref=[PAD_STATES.COUNT_IN,PAD_STATES.RECORDING].includes(this.state)?this.recordingStartTime:this.playbackOrigin;if(!ref||this.context.currentTime<ref)return 0;return Math.floor((this.context.currentTime-ref)/this.tempo.getBarDuration())%this.loopBars+1;}
  getEventCount(){return this.layers.reduce((sum,layer)=>sum+layer.events.length,0);}
  getEvents(){return this.layers.flatMap(layer=>layer.events.map(event=>({...event,layerId:layer.id})));}
  getLayers(){return this.layers.map(layer=>({id:layer.id,type:layer.type,eventCount:layer.events.length}));}
  hasLoop(){return this.layers.length>0&&this.loopLength>0;}
  getDebugInfo(){const future=[...this.scheduledVoices].map(entry=>entry.when).filter(when=>when>=this.context.currentTime-.01);return{mode:'PAD LOOPER',state:this.state,loopLengthBars:this.loopBars,loopLengthSeconds:this.loopLength,recordingStartTime:this.recordingStartTime,recordingEndTime:this.recordingEndTime,currentLoopIndex:Math.max(0,this.updateLoopCount()-1),recordedEventCount:this.getEventCount(),layerCount:this.layers.length,nextScheduledEventTime:future.length?Math.min(...future):this.nextScheduledEventTime,schedulerLookahead:this.schedulerLookahead,schedulerAheadTime:this.schedulerAhead,events:this.getEvents()};}
  emit(type,detail){this.dispatchEvent(new CustomEvent(type,{detail}));}
  destroy(){this.clear();}
}
