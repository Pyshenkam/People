class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sourceBuffer = [];
    this.sourceLength = 0;
    this.targetSampleRate = 16000;
    this.targetChunkSamples = 320;
    this.speakingHoldFrames = 0;
    this.threshold = 0.018;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) {
      return true;
    }

    const mono = input[0];
    const copy = new Float32Array(mono.length);
    copy.set(mono);
    this.sourceBuffer.push(copy);
    this.sourceLength += copy.length;

    const sourceChunkSize = Math.max(1, Math.round(sampleRate * 0.02));
    while (this.sourceLength >= sourceChunkSize) {
      const frame = this.readChunk(sourceChunkSize);
      const rms = this.computeRms(frame);
      const speaking = rms > this.threshold || this.speakingHoldFrames > 0;
      this.speakingHoldFrames = rms > this.threshold ? 3 : Math.max(0, this.speakingHoldFrames - 1);
      const resampled = this.resample(frame, this.targetChunkSamples);
      const pcm16 = new Int16Array(resampled.length);
      for (let index = 0; index < resampled.length; index += 1) {
        const sample = Math.max(-1, Math.min(1, resampled[index]));
        pcm16[index] = sample < 0 ? sample * 32768 : sample * 32767;
      }
      this.port.postMessage({ type: "vad", level: rms, speaking });
      this.port.postMessage({ type: "audio", buffer: pcm16.buffer }, [pcm16.buffer]);
    }
    return true;
  }

  readChunk(length) {
    const result = new Float32Array(length);
    let offset = 0;
    while (offset < length && this.sourceBuffer.length > 0) {
      const head = this.sourceBuffer[0];
      const remaining = length - offset;
      const amount = Math.min(remaining, head.length);
      result.set(head.subarray(0, amount), offset);
      offset += amount;
      if (amount === head.length) {
        this.sourceBuffer.shift();
      } else {
        this.sourceBuffer[0] = head.subarray(amount);
      }
      this.sourceLength -= amount;
    }
    return result;
  }

  computeRms(frame) {
    let sum = 0;
    for (let index = 0; index < frame.length; index += 1) {
      sum += frame[index] * frame[index];
    }
    return Math.sqrt(sum / frame.length);
  }

  resample(frame, targetLength) {
    if (frame.length === targetLength) {
      return frame;
    }
    const output = new Float32Array(targetLength);
    const ratio = (frame.length - 1) / Math.max(1, targetLength - 1);
    for (let index = 0; index < targetLength; index += 1) {
      const position = index * ratio;
      const before = Math.floor(position);
      const after = Math.min(frame.length - 1, before + 1);
      const fraction = position - before;
      output[index] = frame[before] * (1 - fraction) + frame[after] * fraction;
    }
    return output;
  }
}

registerProcessor("capture-processor", CaptureProcessor);
