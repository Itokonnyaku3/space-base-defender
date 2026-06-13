/**
 * 敵の自動湧き（スポーン）タイミングの単一情報源。
 * EnemySpawnManager / MainScene はここから間隔を読み込む（ハードコード禁止）。
 *
 * 設計意図: 前線基地が多いほど猛攻になり、壊すごとに湧きペースが穏やかになる。
 * 四隅の基地を制圧することで戦況を有利にする戦術性を表現する。
 */
export const SPAWN_CONFIG = {
    /** 生存している前線基地数 → 自動湧き間隔 (ms)。 */
    delayByOutpostCountMs: {
        4: 9000,
        3: 12000,
        2: 16000,
        1: 22000,
        0: 28000,
    } as Record<number, number>,

    /** 前線基地が全滅しているとき（上記キーに無いとき）のフォールバック間隔 (ms)。 */
    fallbackDelayMs: 28000,

    /** Wave 2（輸送船護衛）専用の自動湧き間隔 (ms)。護衛のため長め。 */
    wave2DelayMs: 14000,

    /** 各前線基地が定期的に戦闘機を射出する間隔 (ms)。 */
    outpostSpawnIntervalMs: 25000,
};
