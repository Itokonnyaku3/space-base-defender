import { describe, it, expect } from 'vitest';
import { BattleshipState } from './BattleshipState';
import { BOSS_CONFIG } from '../configs/BossConfig';

const cfg = BOSS_CONFIG.battleship;

describe('BattleshipState', () => {
  it('初期は advancing・機関全数・速度フル', () => {
    const s = new BattleshipState(cfg);
    expect(s.phase).toBe('advancing');
    expect(s.enginesAlive).toBe(cfg.engineCount);
    expect(s.currentSpeed()).toBe(cfg.baseAdvanceSpeed);
  });

  it('機関破壊で速度が比例して下がる', () => {
    const s = new BattleshipState(cfg);
    s.destroyEngine();
    expect(s.enginesAlive).toBe(3);
    expect(s.currentSpeed()).toBeCloseTo(cfg.baseAdvanceSpeed * 0.75);
    expect(s.phase).toBe('advancing');
  });

  it('全機関破壊で停止し waveCannon へ移行', () => {
    const s = new BattleshipState(cfg);
    for (let i = 0; i < cfg.engineCount; i++) s.destroyEngine();
    expect(s.currentSpeed()).toBe(0);
    expect(s.phase).toBe('waveCannon');
  });

  it('advancing 中はチャージしない', () => {
    const s = new BattleshipState(cfg);
    expect(s.tickCharge(1000)).toBeNull();
    expect(s.chargeProgress()).toBe(0);
  });

  it('waveCannon でチャージ完了すると fire を返し、ループする', () => {
    const s = new BattleshipState(cfg);
    for (let i = 0; i < cfg.engineCount; i++) s.destroyEngine();
    expect(s.tickCharge(cfg.cannon.chargeMs - 100)).toBeNull();
    expect(s.tickCharge(100)).toBe('fire');
    expect(s.chargeProgress()).toBe(0);
  });

  it('波動砲は露出中(waveCannon)のみ命中が蓄積し、4発で撃破。fireでリセットしない', () => {
    const s = new BattleshipState(cfg);
    s.hitCannon();
    expect(s.cannonHits).toBe(0);
    for (let i = 0; i < cfg.engineCount; i++) s.destroyEngine();
    s.hitCannon(); s.hitCannon();
    s.tickCharge(cfg.cannon.chargeMs);
    s.hitCannon(); s.hitCannon();
    expect(s.cannonHits).toBe(4);
    expect(s.isDefeated()).toBe(true);
  });

  it('bays: 設定数だけ生成され、防壁全破壊で発射台が破壊可能・破壊で射出停止', () => {
    const s = new BattleshipState(cfg);
    expect(s.bayCount()).toBe(cfg.launch.bayCount);
    expect(s.bayVulnerable(0)).toBe(false);
    s.damageWall(0, 0, cfg.launch.wallHp);
    s.damageWall(0, 1, cfg.launch.wallHp);
    expect(s.bayVulnerable(0)).toBe(true);
    s.damageBay(0, cfg.launch.bayHp);
    expect(s.isBayAlive(0)).toBe(false);
  });

  it('tickLaunches: 間隔到達で各生存発射台の射出指示を返す', () => {
    const s = new BattleshipState(cfg);
    expect(s.tickLaunches(cfg.launch.intervalMs)).toEqual([
      { bayIndex: 0, kind: 'interceptor' },
      { bayIndex: 1, kind: 'interceptor' },
    ]);
  });
});
