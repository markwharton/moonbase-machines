// The speaker. The Apple II makes sound by clicking the speaker, a toggle at $C030, and the
// machine keeps the cycle of each click. `Speaker` turns a run of cycles into a square wave
// at the sound card's rate and plays it through a worklet, which keeps a queue of what it has
// been given and holds the last level when the queue runs dry. The queue keeps a quarter of a
// second at most, the oldest dropped: sound made faster than it plays (a machine catching up a
// hitch, a pause in a hidden tab) would otherwise put the sound behind the picture for good.
const CYCLES_PER_SECOND = 1020484;

const WORKLET = `
class SpeakerProcessor extends AudioWorkletProcessor {
  constructor() {
    super(); this.queue = []; this.at = 0; this.level = 0; this.queued = 0;
    this.port.onmessage = e => {
      this.queue.push(e.data); this.queued += e.data.length;
      while (this.queued > sampleRate / 4 && this.queue.length > 1) { this.queued -= this.queue[0].length - this.at; this.queue.shift(); this.at = 0; }
    };
  }
  process(inputs, outputs) {
    const out = outputs[0][0];
    for (let i = 0; i < out.length; i++) {
      while (this.queue.length && this.at >= this.queue[0].length) { this.queue.shift(); this.at = 0; }
      if (this.queue.length) { this.level = this.queue[0][this.at++]; this.queued--; }
      out[i] = this.level;
    }
    return true;
  }
}
registerProcessor('speaker', SpeakerProcessor);
`;

export class Speaker {
  constructor() { this.context = null; this.node = null; this.level = 0; this.from = null; }

  // start on a gesture, as browsers require
  async start() {
    if (this.context) return;
    this.context = new AudioContext();
    await this.context.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' })));
    this.node = new AudioWorkletNode(this.context, 'speaker');
    this.node.connect(this.context.destination);
    this.rate = this.context.sampleRate;
    if (this.context.state !== 'running') await this.context.resume();
  }

  // The wave for the cycles from the last call up to `cycles`, given the clicks in between. `unheard` are the spans of
  // cycles, [from, to], that take no time, as a Remake's drawing: the wave leaves them out.
  feed(clicks, cycles, unheard = []) {
    if (!this.node) return;
    if (this.from === null) this.from = cycles;   // from when the sound starts, not from the machine's first cycle
    const perSample = CYCLES_PER_SECOND / this.rate, parts = [];
    let ci = 0;
    const play = to => {
      const n = Math.floor((to - this.from) / perSample);
      if (n <= 0) return;
      const wave = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const t = this.from + (i + 1) * perSample;
        while (ci < clicks.length && clicks[ci] <= t) { this.level = this.level ? 0 : 0.25; ci++; }
        wave[i] = this.level;
      }
      this.from += n * perSample;
      parts.push(wave);
    };
    for (const [from, to] of unheard) {
      if (to <= this.from) continue;
      play(from);
      while (ci < clicks.length && clicks[ci] <= to) ci++;
      this.from = Math.max(this.from, to);
    }
    play(cycles);
    if (!parts.length) return;
    const wave = parts.length === 1 ? parts[0] : new Float32Array(parts.reduce((n, p) => n + p.length, 0));
    if (parts.length > 1) parts.reduce((at, p) => (wave.set(p, at), at + p.length), 0);
    this.node.port.postMessage(wave, [wave.buffer]);
  }
  // the cycles up to `cycles` not heard, as at a pace other than the original's: the sound goes on from there
  skip(cycles) { if (this.node) this.from = cycles; }
}
