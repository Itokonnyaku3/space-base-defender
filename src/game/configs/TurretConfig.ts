export interface TurretTypeConfig {
    id: string;
    name: string;
    cost: number;
    hp: number;
    range: number;
    fireRate: number; // 連射間隔 (ms)
    bulletColor: number;
    bulletSpeed: number;
    description: string;
}

export const TURRET_CONFIGS: Record<'standard', TurretTypeConfig> = {
    standard: {
        id: 'standard',
        name: '自動迎撃タレット',
        cost: 100,
        hp: 100,
        range: 250,
        fireRate: 500,
        bulletColor: 0x00ffff, // 水色
        bulletSpeed: 400,
        description: '射程内に入った最も近い敵を自動で追尾し迎撃する。'
    }
};
