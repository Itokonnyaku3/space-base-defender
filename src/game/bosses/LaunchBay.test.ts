import { describe, it, expect } from 'vitest';
import { LaunchBay } from './LaunchBay';

const cfg = { bayHp: 60, wallHp: 40, wallsPerBay: 2, intervalMs: 13000 };

describe('LaunchBay', () => {
    it('初期状態：防壁は生存・発射台は脆弱でない・生存', () => {
        const b = new LaunchBay(cfg);
        expect(b.isWallAlive(0)).toBe(true);
        expect(b.isWallAlive(1)).toBe(true);
        expect(b.isVulnerable()).toBe(false);
        expect(b.isBayAlive()).toBe(true);
    });

    it('防壁は個別HPで破壊。全破壊で発射台が脆弱化', () => {
        const b = new LaunchBay(cfg);
        b.damageWall(0, 40); // 0番破壊
        expect(b.isWallAlive(0)).toBe(false);
        expect(b.isVulnerable()).toBe(false); // まだ1番が生存
        b.damageWall(1, 20); // 部分ダメージ
        expect(b.isWallAlive(1)).toBe(true);
        b.damageWall(1, 20); // 残り20で破壊
        expect(b.isWallAlive(1)).toBe(false);
        expect(b.isVulnerable()).toBe(true);
    });

    it('発射台は脆弱化前は無敵、脆弱化後にHP0で破壊', () => {
        const b = new LaunchBay(cfg);
        b.damageBay(60);
        expect(b.isBayAlive()).toBe(true); // 防壁が残るので無効
        b.damageWall(0, 40); b.damageWall(1, 40);
        b.damageBay(59);
        expect(b.isBayAlive()).toBe(true);
        b.damageBay(1);
        expect(b.isBayAlive()).toBe(false);
    });

    it('射出タイマー：間隔到達で迎撃→爆撃を交互に返し、生存中のみ', () => {
        const b = new LaunchBay(cfg);
        expect(b.tickLaunch(12999)).toBeNull();
        expect(b.tickLaunch(1)).toBe('interceptor'); // 13000到達
        expect(b.tickLaunch(13000)).toBe('bomber');
        expect(b.tickLaunch(13000)).toBe('interceptor');
        // 破壊後は射出しない
        b.damageWall(0, 40); b.damageWall(1, 40); b.damageBay(60);
        expect(b.isBayAlive()).toBe(false);
        expect(b.tickLaunch(99999)).toBeNull();
    });
});
