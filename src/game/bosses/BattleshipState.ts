import type { BattleshipConfig } from '../configs/BossConfig';

export type BossPhase = 'advancing' | 'waveCannon' | 'defeated';

export class BattleshipState {
    phase: BossPhase = 'advancing';
    enginesAlive: number;
    cannonHits = 0;
    chargeMs = 0;
    private readonly cfg: BattleshipConfig;

    constructor(cfg: BattleshipConfig) {
        this.cfg = cfg;
        this.enginesAlive = cfg.engineCount;
    }

    currentSpeed(): number {
        return this.cfg.baseAdvanceSpeed * (this.enginesAlive / this.cfg.engineCount);
    }

    destroyEngine(): void {
        if (this.enginesAlive > 0) this.enginesAlive--;
        if (this.enginesAlive === 0 && this.phase === 'advancing') {
            this.phase = 'waveCannon';
            this.chargeMs = 0;
        }
    }

    tickCharge(deltaMs: number): 'fire' | null {
        if (this.phase !== 'waveCannon') return null;
        this.chargeMs += deltaMs;
        if (this.chargeMs >= this.cfg.cannon.chargeMs) {
            this.chargeMs = 0;
            return 'fire';
        }
        return null;
    }

    chargeProgress(): number {
        if (this.phase !== 'waveCannon') return 0;
        return Math.min(1, this.chargeMs / this.cfg.cannon.chargeMs);
    }

    hitCannon(): void {
        if (this.phase !== 'waveCannon') return;
        this.cannonHits++;
        if (this.cannonHits >= this.cfg.cannon.longRangeHitsToDestroy) {
            this.phase = 'defeated';
        }
    }

    isCharging(): boolean { return this.phase === 'waveCannon'; }
    isDefeated(): boolean { return this.phase === 'defeated'; }
}
