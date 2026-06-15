// 巨大戦列艦ボスの単一情報源。挙動を変えたいときはここを編集する（ハードコード禁止）。
export interface WaveCannonConfig {
    chargeMs: number;               // チャージ時間
    baseDamage: number;             // 砲撃が基地に与えるダメージ
    longRangeHitsToDestroy: number; // 破壊に必要な長距離弾の命中数
}

export interface LaunchConfig {
    bayCount: number;        // 発射台の数（左右で2）
    wallsPerBay: number;     // 1発射台あたりの防壁枚数
    bayHp: number;           // 発射台のHP（防壁全破壊後のみ有効）
    wallHp: number;          // 防壁1枚あたりのHP
    intervalMs: number;      // 各発射台の射出間隔
    interceptorId: 'single_circle';  // 迎撃機（自機追尾）= 既存ENEMY_CONFIGS
    bomberId: 'suicide_bomber';      // 爆撃機（基地突撃）= 既存ENEMY_CONFIGS
}

export interface BattleshipConfig {
    baseAdvanceSpeed: number; // 全機関生存時の進軍速度 (px/秒・フレーム非依存)
    engineCount: number;
    engineHp: number;         // 機関1基あたり
    cannon: WaveCannonConfig;
    launch: LaunchConfig;     // 発射台＋防壁＋射出敵
    reachBaseDamage: number;  // 戦艦が基地に到達した場合の大ダメージ
}

export const BOSS_CONFIG: { battleship: BattleshipConfig } = {
    battleship: {
        baseAdvanceSpeed: 6,
        engineCount: 4,
        engineHp: 50,
        cannon: {
            chargeMs: 30000,
            baseDamage: 40,
            longRangeHitsToDestroy: 4,
        },
        launch: {
            bayCount: 2,
            wallsPerBay: 2,
            bayHp: 60,
            wallHp: 40,
            intervalMs: 13000,
            interceptorId: 'single_circle',
            bomberId: 'suicide_bomber',
        },
        reachBaseDamage: 100,
    },
};
