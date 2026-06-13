export interface WeaponTypeConfig {
    id: string;
    name: string;
    bulletSpeed: number;
    fireRate: number; // 連射間隔 (ms)
    bulletTint: number | null;
    description: string;
}

export const WEAPON_CONFIGS: Record<'forward' | 'mouse', WeaponTypeConfig> = {
    forward: {
        id: 'forward',
        name: '正面レーザー',
        bulletSpeed: 240,
        fireRate: 150,
        bulletTint: null,
        description: '機体の正面方向に発射する高出力レーザー。'
    },
    mouse: {
        id: 'mouse',
        name: 'エイムレーザー',
        bulletSpeed: 160,
        fireRate: 250,
        bulletTint: 0x00ff00, // 緑
        description: 'マウスのポインターがある方向へ旋回・発射する精密レーザー。'
    }
};
