class PlayerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = [];
    this.queuedSamples = 0;
    this.started = false;
    this.currentGain = 1;
    this.fadeActive = false;
    this.startThreshold = Math.round(sampleRate * 0.1);
    this.maxSamples = Math.round(sampleRate * 0.4);
    this.didReportStart = false;

    this.port.onmessage = (event) => {
      const payload = event.data;
      if (payload.type === "enqueue") {
        const samples = payload.samples;
        if (!(samples instanceof Float32Array) || samples.length === 0) {
          return;
        }
        this.queue.push(samples);
        this.queuedSamples += samples.length;
        this.port.postMessage({ type: "queue_depth", queuedSamples: this.queuedSamples });
        while (this.queuedSamples > this.maxSamples && this.queue.length > 0) {
          const dropped = this.queue.shift();
          this.queuedSamples -= dropped.length;
        }
      } else if (payload.type === "clear") {
        this.queue = [];
        this.queuedSamples = 0;
        this.started = false;
        this.currentGain = 1;
        this.fadeActive = false;
        this.didReportStart = false;
        this.port.postMessage({ type: "queue_depth", queuedSamples: 0 });
      } else if (payload.type === "fade_down") {
        this.fadeActive = true;
      } else if (payload.type === "reset_gain") {
        this.currentGain = 1;
        this.fadeActive = false;
      }
    };
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
      if (!this.started || this.queue.length === 0) {
        channel[index] = 0;
        continue;
      }
      const head = this.queue[0];
      channel[index] = head[0] * this.currentGain;
      if (head.length === 1) {
        this.queue.shift();
      } else {
        this.queue[0] = head.subarray(1);
      }
      this.queuedSamples -= 1;
      if (this.fadeActive) {
        this.currentGain = Math.max(0, this.currentGain - 0.025);
      }
    }

    if (this.queuedSamples <= 0) {
      this.queue = [];
      this.started = false;
      this.didReportStart = false;
      this.currentGain = this.fadeActive ? this.currentGain : 1;
      this.port.postMessage({ type: "queue_depth", queuedSamples: 0 });
    }
    return true;
  }
}

registerProcessor("player-processor", PlayerProcessor);
