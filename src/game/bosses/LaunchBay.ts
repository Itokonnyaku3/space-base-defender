export type LaunchKind = 'interceptor' | 'bomber';

export interface LaunchBayParams {
    bayHp: number;
    wallHp: number;
    wallsPerBay: number;
    intervalMs: number;
}

/**
 * 戦艦の発射台1基＋それをガードする防壁群の純ロジック（Phaser非依存）。
 * 防壁を全破壊すると発射台が脆弱化し、破壊可能になる（破壊で射出停止）。
 * 生存中は intervalMs ごとに 迎撃機→爆撃機 を交互に射出する。
 */
export class LaunchBay {
    private bayAlive = true;
    private bayHpLeft: number;
    private readonly wallHpLeft: number[];
    private launchMs = 0;
    private launchCount = 0;
    private readonly params: LaunchBayParams;

    constructor(params: LaunchBayParams) {
        this.params = params;
        this.bayHpLeft = params.bayHp;
        this.wallHpLeft = Array.from({ length: params.wallsPerBay }, () => params.wallHp);
    }

    isWallAlive(index: number): boolean {
        return index >= 0 && index < this.wallHpLeft.length && this.wallHpLeft[index] > 0;
    }

    damageWall(index: number, dmg: number): void {
        if (!this.isWallAlive(index)) return;
        this.wallHpLeft[index] -= dmg;
    }

    /** 全防壁が破壊されると発射台が脆弱（破壊可能）になる。 */
    isVulnerable(): boolean {
        return this.wallHpLeft.every((hp) => hp <= 0);
    }

    damageBay(dmg: number): void {
        if (!this.bayAlive || !this.isVulnerable()) return;
        this.bayHpLeft -= dmg;
        if (this.bayHpLeft <= 0) this.bayAlive = false;
    }

    isBayAlive(): boolean {
        return this.bayAlive;
    }

    /** 生存中のみ。間隔到達で射出種別を返し、迎撃→爆撃を交互に切り替える。 */
    tickLaunch(deltaMs: number): LaunchKind | null {
        if (!this.bayAlive) return null;
        this.launchMs += deltaMs;
        if (this.launchMs >= this.params.intervalMs) {
            this.launchMs = 0;
            const kind: LaunchKind = this.launchCount % 2 === 0 ? 'interceptor' : 'bomber';
            this.launchCount++;
            return kind;
        }
        return null;
    }
}
