import type { BattleshipConfig } from '../configs/BossConfig';
import { LaunchBay, type LaunchKind } from './LaunchBay';

export type BossPhase = 'advancing' | 'waveCannon' | 'defeated';

export class BattleshipState {
    phase: BossPhase = 'advancing';
    enginesAlive: number;
    cannonHits = 0;
    chargeMs = 0;
    readonly bays: LaunchBay[];
    private readonly cfg: BattleshipConfig;

    constructor(cfg: BattleshipConfig) {
        this.cfg = cfg;
        this.enginesAlive = cfg.engineCount;
        this.bays = Array.from({ length: cfg.launch.bayCount }, () =>
            new LaunchBay({
                bayHp: cfg.launch.bayHp,
                wallHp: cfg.launch.wallHp,
                wallsPerBay: cfg.launch.wallsPerBay,
                intervalMs: cfg.launch.intervalMs,
            }),
        );
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

    // ===== 発射台（bays）への委譲 =====
    bayCount(): number { return this.bays.length; }
    isWallAlive(bi: number, wi: number): boolean { return this.bays[bi]?.isWallAlive(wi) ?? false; }
    damageWall(bi: number, wi: number, dmg: number): void { this.bays[bi]?.damageWall(wi, dmg); }
    bayVulnerable(bi: number): boolean { return this.bays[bi]?.isVulnerable() ?? false; }
    damageBay(bi: number, dmg: number): void { this.bays[bi]?.damageBay(dmg); }
    isBayAlive(bi: number): boolean { return this.bays[bi]?.isBayAlive() ?? false; }

    /** 全発射台の射出タイマーを進め、射出すべき {発射台index, 種別} を返す。撃破後は射出しない。 */
    tickLaunches(deltaMs: number): { bayIndex: number; kind: LaunchKind }[] {
        if (this.isDefeated()) return [];
        const out: { bayIndex: number; kind: LaunchKind }[] = [];
        this.bays.forEach((bay, bayIndex) => {
            const kind = bay.tickLaunch(deltaMs);
            if (kind) out.push({ bayIndex, kind });
        });
        return out;
    }
}
