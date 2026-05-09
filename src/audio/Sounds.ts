import { settings } from '../state/settings';

/**
 * 별도 오디오 에셋 없이 Web Audio API 로 절차적 사운드를 생성.
 * 외부 의존성 없이 가벼우며, 추후 실제 음원으로 교체할 때는
 * play(name) 호출 인터페이스만 유지하면 됨.
 */
class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      return this.ctx;
    } catch {
      return null;
    }
  }

  /** 사용자 첫 입력 후 호출해서 모바일 자동재생 정책 회피 */
  resume(): void {
    const ctx = this.ensure();
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  private isMuted(): boolean {
    return settings.get().muted;
  }

  setMuted(m: boolean): void {
    if (!this.master || !this.ctx) return;
    this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.05);
  }

  private envelope(gain: GainNode, t0: number, attack: number, peak: number, decay: number, sustain: number, release: number, dur: number): void {
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(peak, t0 + attack);
    gain.gain.linearRampToValueAtTime(sustain, t0 + attack + decay);
    gain.gain.setValueAtTime(sustain, t0 + dur - release);
    gain.gain.linearRampToValueAtTime(0, t0 + dur);
  }

  private tone(freq: number, dur: number, type: OscillatorType = 'sine', peak = 0.4): void {
    if (this.isMuted()) return;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    this.envelope(g, t, 0.005, peak, 0.05, peak * 0.5, 0.05, dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private chirp(from: number, to: number, dur: number, type: OscillatorType = 'sine', peak = 0.35): void {
    if (this.isMuted()) return;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    this.envelope(g, t, 0.005, peak, 0.05, peak * 0.6, 0.05, dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private noise(dur: number, peak = 0.25, hp = 200): void {
    if (this.isMuted()) return;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / ch.length);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = hp;
    const g = ctx.createGain();
    this.envelope(g, t, 0.002, peak, 0.05, peak * 0.4, 0.05, dur);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  click(): void { this.tone(880, 0.06, 'square', 0.18); }
  tap():   void { this.tone(540, 0.04, 'triangle', 0.15); }
  motor(): void { this.chirp(220, 140, 0.35, 'sawtooth', 0.18); }
  close(): void { this.tone(180, 0.18, 'sawtooth', 0.22); this.noise(0.08, 0.12, 600); }
  success(): void {
    // 도(C5) → 미(E5) → 솔(G5) 빠른 아르페지오
    this.tone(523, 0.12, 'triangle', 0.4);
    setTimeout(() => this.tone(659, 0.12, 'triangle', 0.4), 90);
    setTimeout(() => this.tone(784, 0.22, 'triangle', 0.45), 180);
  }
  fail(): void {
    this.chirp(330, 110, 0.35, 'square', 0.3);
  }
  drop(): void { this.tone(120, 0.18, 'sine', 0.4); this.noise(0.1, 0.15); }
  collect(): void { this.tone(1320, 0.08, 'sine', 0.3); setTimeout(() => this.tone(1760, 0.1, 'sine', 0.35), 70); }
}

export const sounds = new SoundEngine();
