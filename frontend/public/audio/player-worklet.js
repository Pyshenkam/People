class PlayerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = [];
    this.headOffset = 0;
    this.queuedSamples = 0;
    this.started = false;
    this.currentGain = 1;
    this.fadeActive = false;
    this.startThreshold = Math.round(sampleRate * 0.18);
    this.underrunResetSamples = Math.round(sampleRate * 0.24);
    this.underrunSamples = 0;
    this.didReportStart = false;
    this.lastReportedQueuedSamples = -1;

    this.port.onmessage = (event) => {
      const payload = event.data;
      if (payload.type === "enqueue") {
        const samples = payload.samples;
        if (!(samples instanceof Float32Array) || samples.length === 0) {
          return;
        }
        this.queue.push(samples);
        this.queuedSamples += samples.length;
        this.underrunSamples = 0;
        this.postQueueDepth();
      } else if (payload.type === "clear") {
        this.resetState();
        this.postQueueDepth(true);
      } else if (payload.type === "fade_down") {
        this.fadeActive = true;
      } else if (payload.type === "reset_gain") {
        this.currentGain = 1;
        this.fadeActive = false;
      }
    };
  }

  resetState() {
    this.queue = [];
    this.headOffset = 0;
    this.queuedSamples = 0;
    this.started = false;
    this.currentGain = 1;
    this.fadeActive = false;
    this.underrunSamples = 0;
    this.didReportStart = false;
    this.lastReportedQueuedSamples = -1;
  }

  postQueueDepth(force = false) {
    if (!force && this.lastReportedQueuedSamples === this.queuedSamples) {
      return;
    }
    this.lastReportedQueuedSamples = this.queuedSamples;
    this.port.postMessage({ type: "queue_depth", queuedSamples: this.queuedSamples });
  }

  shiftEmptyHead() {
    while (this.queue.length > 0) {
      const head = this.queue[0];
      if (this.headOffset < head.length) {
        return;
      }
      this.queue.shift();
      this.headOffset = 0;
    }
  }

  process(_, outputs) {
    const output = outputs[0];
    const channel = output[0];

    if (!this.started && this.queuedSamples >= this.startThreshold) {
      this.started = true;
      if (!this.didReportStart) {
        this.didReportStart = true;
        this.port.postMessage({ type: "player_started" });
      }
    }

    for (let index = 0; index < channel.length; index += 1) {
      if (!this.started) {
        channel[index] = 0;
        continue;
      }

      if (this.queue.length === 0) {
        channel[index] = 0;
        this.underrunSamples += 1;
        if (this.underrunSamples >= this.underrunResetSamples) {
          this.started = false;
          this.didReportStart = false;
          this.underrunSamples = 0;
          this.currentGain = this.fadeActive ? this.currentGain : 1;
        }
        continue;
      }

      const head = this.queue[0];
      this.underrunSamples = 0;
      channel[index] = head[this.headOffset] * this.currentGain;
      this.headOffset += 1;
      this.queuedSamples -= 1;
      this.shiftEmptyHead();

      if (this.fadeActive) {
        this.currentGain = Math.max(0, this.currentGain - 0.025);
      }
    }

    if (this.queuedSamples <= 0) {
      this.queue = [];
      this.headOffset = 0;
      this.postQueueDepth();
    }
    return true;
  }
}

registerProcessor("player-processor", PlayerProcessor);
