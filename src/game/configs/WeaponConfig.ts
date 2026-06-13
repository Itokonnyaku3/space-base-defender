export interface WeaponAccel {
    /** 加速後の最高速度 */
    maxSpeed: number;
    /** 初速から最高速度まで到達する時間 (ms) */
    durationMs: number;
}

export interface WeaponTypeConfig {
    id: string;
    name: string;
    damage: number;
    maxRange: number;       // 弾の最大飛距離 (px)
    cooldownMs: number;     // 連射間隔（クールダウン, ms）
    speed: number;          // 初速 (px/frame)。等速武器は終始この速度
    accel?: WeaponAccel;    // 指定すると初速→maxSpeed へ線形加速。省略時は等速
    bulletTint: number;
    sound: 'laser' | 'machinegun';
}

/**
 * 自機武器の単一情報源。MainScene はここから CT・威力・射程・弾速・加速を読み込む。
 * ここの数値を変えるだけで武器の挙動が変わる（ハードコード禁止）。
 */
export const WEAPON_CONFIGS: Record<'long_range' | 'machinegun', WeaponTypeConfig> = {
    long_range: {
        id: 'long_range',
        name: '長距離弾',
        damage: 10,
        maxRange: 4000,
        cooldownMs: 5000,
        speed: 25,                              // 初速
        accel: { maxSpeed: 350, durationMs: 2000 }, // 2秒かけて 25→350 へ加速
        bulletTint: 0x00ffff,
        sound: 'laser',
    },
    machinegun: {
        id: 'machinegun',
        name: '短距離マシンガン',
        damage: 5,
        maxRange: 150,
        cooldownMs: 500,
        speed: 350,                             // 等速
        bulletTint: 0xffaa00,
        sound: 'machinegun',
    },
};
