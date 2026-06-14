export class MusicSynthesizer {
  private static ctx: AudioContext | null = null;
  private static timerId: ReturnType<typeof setTimeout> | null = null;
  private static currentPattern: number = 0; // 0: OFF, 1: Ambient, 2: Techno, 3: Minimal, 4: Space Opera
  
  private static currentBeat: number = 0;
  private static currentMeasure: number = 0;
  private static isPlaying: boolean = false;
  private static nextNoteTime: number = 0.0;
  private static lookahead: number = 25.0; // ms
  private static scheduleAheadTime: number = 0.1; // seconds
  private static bpm: number = 120;

  private static getContext(): AudioContext {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioContextClass();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx!;
  }

  public static selectPattern(pattern: number) {
    this.currentPattern = pattern;
    if (pattern === 0) {
      this.stop();
    } else {
      if (pattern === 1) this.bpm = 80;
      if (pattern === 2) this.bpm = 128;
      if (pattern === 3) this.bpm = 110;
      if (pattern === 4) this.bpm = 75;
      this.start();
    }
  }

  private static start() {
    if (this.isPlaying) return;
    const ctx = this.getContext();
    this.isPlaying = true;
    this.currentBeat = 0;
    this.currentMeasure = 0;
    this.nextNoteTime = ctx.currentTime;
    this.scheduler();
  }

  public static stop() {
    this.isPlaying = false;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  // ゲームのポーズ用: 再生中ならBGMを一時停止し、再生中だったことを覚えておく。
  private static wasPlayingBeforePause: boolean = false;

  public static pausePlayback() {
    this.wasPlayingBeforePause = this.isPlaying;
    if (this.isPlaying) {
      this.stop();
    }
  }

  // ポーズ解除時: ポーズ前に再生中だったパターンを頭から再開する。
  public static resumePlayback() {
    if (this.wasPlayingBeforePause) {
      this.wasPlayingBeforePause = false;
      this.selectPattern(this.currentPattern);
    }
  }

  private static scheduler() {
    if (!this.isPlaying) return;
    const ctx = this.getContext();
    while (this.nextNoteTime < ctx.currentTime + this.scheduleAheadTime) {
      this.scheduleNote(this.currentBeat, this.nextNoteTime);
      this.advanceNote();
    }
    this.timerId = setTimeout(() => this.scheduler(), this.lookahead);
  }

  private static advanceNote() {
    const secondsPerBeat = 60.0 / this.bpm;
    const secondsPerNote = 0.25 * secondsPerBeat;
    this.nextNoteTime += secondsPerNote;
    this.currentBeat = (this.currentBeat + 1) % 16;
    if (this.currentBeat === 0) {
      this.currentMeasure = (this.currentMeasure + 1) % 4;
    }
  }

  private static mtof(midi: number): number {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  private static scheduleNote(beat: number, time: number) {
    if (this.currentPattern === 1) {
      // サンプルA：アンビエント
      if (beat === 0) {
        this.playTone(36, 'sine', 0.15, time, 1.2);
      }
      if (beat === 8) {
        this.playTone(43, 'sine', 0.15, time, 1.2);
      }
      const notes = [60, 64, 67, 71, 67, 64, 62, 67, 71, 74, 71, 67, 60, 64, 67, 71];
      if (beat % 4 === 0) {
        this.playTone(notes[beat], 'sine', 0.05, time, 0.8);
      }
    } 
    else if (this.currentPattern === 2) {
      // サンプルB：テクノ
      const bassline = [36, 36, 48, 36, 39, 39, 51, 39, 43, 43, 55, 43, 41, 41, 53, 41];
      this.playTone(bassline[beat], 'sawtooth', 0.08, time, 0.15);

      const melody = [0, 0, 72, 0, 75, 0, 72, 79, 0, 0, 74, 0, 77, 0, 74, 81];
      if (melody[beat] > 0) {
        this.playTone(melody[beat], 'triangle', 0.04, time, 0.15);
      }

      if (beat % 4 === 2) {
        this.playHat(0.04, time, 0.04);
      }
    } 
    else if (this.currentPattern === 3) {
      // サンプルC：ミニマル
      const bass = [36, 36, 36, 36, 36, 36, 36, 36, 35, 35, 35, 35, 35, 35, 35, 35];
      this.playTone(bass[beat], 'triangle', 0.1, time, 0.12);

      const riff = [72, 73, 72, 0, 75, 72, 73, 0, 72, 73, 72, 0, 78, 77, 73, 0];
      if (riff[beat] > 0 && Math.random() > 0.1) {
        this.playTone(riff[beat], 'sine', 0.06, time, 0.18);
      }
    }
    else if (this.currentPattern === 4) {
      // サンプルD：荘厳なスペースオペラ
      const chordNotes = [
        [50, 57, 62, 65, 69], // Dm (D3, A3, D4, F4, A4)
        [46, 53, 58, 62, 65], // Bb (Bb2, F3, Bb3, D4, F4)
        [48, 55, 60, 64, 67], // C (C3, G3, C4, E4, G4)
        [45, 52, 57, 60, 64]  // Am (A2, E3, A3, C4, E4)
      ];
      
      const currentChord = chordNotes[this.currentMeasure];
      const stepDuration = (60.0 / this.bpm) * 0.25;
      const chordDuration = stepDuration * 16; // 1小節分

      // 和音 (1小節の頭で鳴らす、厚みを出すためデチューンした音を重ねる)
      if (beat === 0) {
        currentChord.forEach(note => {
          this.playSlowTone(note, 'sawtooth', 0.018, time, chordDuration, -6);
          this.playSlowTone(note, 'sawtooth', 0.018, time, chordDuration, 6);
        });
      }

      // ティンパニ (拍の頭で鳴らす)
      if (beat % 4 === 0) {
        this.playTimpani(0.12, time);
      }

      // メロディ (ゆったり歌うストリングス/ブラス風の三角波)
      let melodyNote = 0;
      let melodyLen = 0;

      if (this.currentMeasure === 0) {
        if (beat === 0) { melodyNote = 77; melodyLen = 4; } // F5
        else if (beat === 4) { melodyNote = 81; melodyLen = 4; } // A5
        else if (beat === 8) { melodyNote = 79; melodyLen = 4; } // G5
        else if (beat === 12) { melodyNote = 77; melodyLen = 4; } // F5
      } else if (this.currentMeasure === 1) {
        if (beat === 0) { melodyNote = 77; melodyLen = 6; } // F5
        else if (beat === 6) { melodyNote = 74; melodyLen = 2; } // D5
        else if (beat === 8) { melodyNote = 77; melodyLen = 8; } // F5
      } else if (this.currentMeasure === 2) {
        if (beat === 0) { melodyNote = 79; melodyLen = 4; } // G5
        else if (beat === 4) { melodyNote = 84; melodyLen = 4; } // C6
        else if (beat === 8) { melodyNote = 83; melodyLen = 4; } // B5
        else if (beat === 12) { melodyNote = 79; melodyLen = 4; } // G5
      } else if (this.currentMeasure === 3) {
        if (beat === 0) { melodyNote = 76; melodyLen = 8; } // E5
        else if (beat === 8) { melodyNote = 81; melodyLen = 8; } // A5
      }

      if (melodyNote > 0) {
        this.playSlowTone(melodyNote, 'triangle', 0.05, time, stepDuration * melodyLen, 0);
      }
    }
  }

  private static playSlowTone(midi: number, type: OscillatorType, volume: number, time: number, duration: number, detune: number = 0) {
    try {
      const ctx = this.getContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = type;
      osc.frequency.setValueAtTime(this.mtof(midi), time);
      osc.detune.setValueAtTime(detune, time);
      
      // アタック 0.3秒、リリース 0.8秒のフェード
      gain.gain.setValueAtTime(0.001, time);
      gain.gain.linearRampToValueAtTime(volume, time + 0.3);
      gain.gain.setValueAtTime(volume, time + duration - 0.8);
      gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(time);
      osc.stop(time + duration);
    } catch {
      // ignore
    }
  }

  private static playTimpani(volume: number, time: number) {
    try {
      const ctx = this.getContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(55, time); // A1 (55Hz)
      osc.frequency.exponentialRampToValueAtTime(30, time + 0.4);
      
      gain.gain.setValueAtTime(volume, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.5);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(time);
      osc.stop(time + 0.5);
    } catch {
      // ignore
    }
  }

  private static playTone(midi: number, type: OscillatorType, volume: number, time: number, duration: number) {
    try {
      const ctx = this.getContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = type;
      osc.frequency.setValueAtTime(this.mtof(midi), time);
      
      gain.gain.setValueAtTime(volume, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(time);
      osc.stop(time + duration);
    } catch {
      // ignore
    }
  }

  private static playHat(volume: number, time: number, duration: number) {
    try {
      const ctx = this.getContext();
      const bufferSize = ctx.sampleRate * duration;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(8000, time);
      
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(volume, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
      
      source.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      
      source.start(time);
      source.stop(time + duration);
    } catch {
      // ignore
    }
  }
}
