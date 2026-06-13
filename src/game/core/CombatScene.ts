import type Phaser from 'phaser';
import type { ScenarioManager } from '../ScenarioManager';

/**
 * EnemyPatternDB / EnemySpawnManager が MainScene から必要とするフィールドを
 * 型として明示するインターフェース。これにより `(scene as any).X` を撲滅する
 * （ARCHITECTURE_REVIEW.md §2.5）。MainScene がこれを implements する。
 */
export interface CombatScene extends Phaser.Scene {
    enemies: Phaser.Physics.Arcade.Group;
    turretBullets: Phaser.Physics.Arcade.Group;
    transportShip: Phaser.Physics.Arcade.Sprite | null;
    scenarioManager: ScenarioManager;
}
