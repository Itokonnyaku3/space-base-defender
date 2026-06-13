export interface TurretTypeConfig {
    id: string;
    name: string;
    cost: number;
    maxHits: number;          // 体当たり耐久（敵の接触でこの回数まで耐える）
    range: number;            // 索敵・射程 (px)
    fireRateMs: number;       // 発射間隔 (ms)
    bulletSpeed: number;      // 弾速 (px/frame)
    bulletTint: number;
    aimToleranceRad: number;  // 照準誤差がこの値以内になると発射 (rad)
    description: string;
}

/**
 * 防衛タレットの単一情報源。MainScene はここから cost/射程/連射/弾速/耐久を読み込む。
 * ここの数値を変えるだけでタレットの挙動が変わる（ハードコード禁止）。
 */
export const TURRET_CONFIGS: Record<'standard', TurretTypeConfig> = {
    standard: {
        id: 'standard',
        name: '自動迎撃タレット',
        cost: 100,
        maxHits: 5,
        range: 250,
        fireRateMs: 5000,
        bulletSpeed: 200,
        bulletTint: 0x00ffff,   // 水色
        aimToleranceRad: 0.17,  // 約10度
        description: '射程内に入った最も近い敵を自動で追尾し迎撃する。'
    }
};
