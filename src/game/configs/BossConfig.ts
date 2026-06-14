// 巨大戦列艦ボスの単一情報源。挙動を変えたいときはここを編集する（ハードコード禁止）。
export interface WaveCannonConfig {
    chargeMs: number;               // チャージ時間
    baseDamage: number;             // 砲撃が基地に与えるダメージ
    longRangeHitsToDestroy: number; // 破壊に必要な長距離弾の命中数
}

export interface BattleshipConfig {
    baseAdvanceSpeed: number; // 全機関生存時の進軍速度 (px/秒・フレーム非依存)
    engineCount: number;
    engineHp: number;         // 機関1基あたり
    cannon: WaveCannonConfig;
    reachBaseDamage: number;  // 戦艦が基地に到達した場合の大ダメージ
}

export const BOSS_CONFIG: { battleship: BattleshipConfig } = {
    battleship: {
        baseAdvanceSpeed: 30,
        engineCount: 4,
        engineHp: 50,
        cannon: {
            chargeMs: 30000,
            baseDamage: 40,
            longRangeHitsToDestroy: 4,
        },
        reachBaseDamage: 100,
    },
};
