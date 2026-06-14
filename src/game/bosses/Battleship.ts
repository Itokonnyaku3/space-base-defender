import Phaser from 'phaser';
import type { CombatScene } from '../core/CombatScene';
import { BattleshipState } from './BattleshipState';
import { BOSS_CONFIG } from '../configs/BossConfig';

/**
 * Wave 5 ボス：巨大戦列艦（Phaser 実体）。
 * 純ロジックは BattleshipState に委譲し、本クラスはスプライト生成・移動・追従・演出を担う。
 * MainScene が生成し、毎フレーム update() を呼び、各コールバックを接続する。
 */
export class Battleship {
    private readonly scene: CombatScene;
    private readonly base: Phaser.Physics.Arcade.Sprite;
    private readonly state = new BattleshipState(BOSS_CONFIG.battleship);
    private readonly explode: (x: number, y: number, count: number, tint: number) => void;

    hull!: Phaser.Physics.Arcade.Sprite;
    engines!: Phaser.Physics.Arcade.Group;
    cannon!: Phaser.Physics.Arcade.Sprite;
    cannonGroup!: Phaser.Physics.Arcade.Group;
    private gfx!: Phaser.GameObjects.Graphics;

    // MainScene が接続するコールバック
    onCannonFire?: () => void;   // 波動砲チャージ完了（基地ダメージ＋即死判定は MainScene 側）
    onReachBase?: () => void;    // 戦艦が基地へ到達
    onDefeated?: () => void;     // 波動砲破壊→撃破

    private reachedBase = false;

    // 部位の船体相対オフセット（船体の前方=+x方向）
    private readonly engineOffsets = [
        { x: -120, y: -40 }, { x: -120, y: 40 },
        { x: -150, y: -15 }, { x: -150, y: 15 },
    ];

    constructor(
        scene: CombatScene,
        base: Phaser.Physics.Arcade.Sprite,
        explode: (x: number, y: number, count: number, tint: number) => void,
    ) {
        this.scene = scene;
        this.base = base;
        this.explode = explode;
    }

    spawn(x: number, y: number): void {
        this.hull = this.scene.physics.add.sprite(x, y, 'battleship_hull');
        this.hull.setImmovable(true);
        this.hull.rotation = Phaser.Math.Angle.Between(x, y, this.base.x, this.base.y);

        this.engines = this.scene.physics.add.group();
        for (const off of this.engineOffsets) {
            const e = this.engines.create(x, y, 'battleship_engine') as Phaser.Physics.Arcade.Sprite;
            e.setImmovable(true);
            e.setData('hp', BOSS_CONFIG.battleship.engineHp);
            e.setData('offX', off.x);
            e.setData('offY', off.y);
        }

        this.cannon = this.scene.physics.add.sprite(x, y, 'battleship_cannon');
        this.cannon.setImmovable(true);
        this.cannon.setVisible(false);
        if (this.cannon.body) this.cannon.body.enable = false;
        this.cannonGroup = this.scene.physics.add.group();
        this.cannonGroup.add(this.cannon);

        this.gfx = this.scene.add.graphics().setDepth(25);
    }

    update(deltaMs: number): void {
        if (this.state.isDefeated()) return;

        const speed = this.state.currentSpeed();
        const ang = Phaser.Math.Angle.Between(this.hull.x, this.hull.y, this.base.x, this.base.y);
        if (speed > 0) {
            this.hull.x += Math.cos(ang) * speed;
            this.hull.y += Math.sin(ang) * speed;
        }
        this.hull.rotation = ang;

        // 基地到達（進軍中のみ・一度だけ）
        if (this.state.phase === 'advancing' && !this.reachedBase &&
            Phaser.Math.Distance.Between(this.hull.x, this.hull.y, this.base.x, this.base.y) < 120) {
            this.reachedBase = true;
            this.onReachBase?.();
        }

        // 機関を船体に追従
        this.engines.getChildren().forEach((child) => {
            const e = child as Phaser.Physics.Arcade.Sprite;
            if (!e.active) return;
            const ox = e.getData('offX') as number;
            const oy = e.getData('offY') as number;
            e.x = this.hull.x + Math.cos(ang) * ox - Math.sin(ang) * oy;
            e.y = this.hull.y + Math.sin(ang) * ox + Math.cos(ang) * oy;
            const body = e.body as Phaser.Physics.Arcade.Body | null;
            if (body) body.reset(e.x, e.y);
        });

        // 波動砲を前方に配置
        const cannonOffX = 150;
        this.cannon.x = this.hull.x + Math.cos(ang) * cannonOffX;
        this.cannon.y = this.hull.y + Math.sin(ang) * cannonOffX;
        const cBody = this.cannon.body as Phaser.Physics.Arcade.Body | null;
        if (cBody) cBody.reset(this.cannon.x, this.cannon.y);

        // フェーズ2移行時に波動砲を露出
        if (this.state.isCharging() && !this.cannon.visible) {
            this.cannon.setVisible(true);
            if (this.cannon.body) this.cannon.body.enable = true;
        }

        // チャージ進行→完了で砲撃通知
        if (this.state.tickCharge(deltaMs) === 'fire') {
            this.onCannonFire?.();
        }

        this.drawCharge();
    }

    private drawCharge(): void {
        this.gfx.clear();
        if (!this.state.isCharging()) return;
        const c = this.cannon;
        const p = this.state.chargeProgress();
        // ビーム予告線（波動砲→基地）。進捗で赤みと太さが増す
        this.gfx.lineStyle(2 + p * 4, 0xff3344, 0.3 + p * 0.5);
        this.gfx.lineBetween(c.x, c.y, this.base.x, this.base.y);
        // チャージゲージ（波動砲周囲のリング）
        this.gfx.lineStyle(4, 0x002233, 1);
        this.gfx.strokeCircle(c.x, c.y, 30);
        this.gfx.lineStyle(4, 0x00e5ff, 1);
        this.gfx.beginPath();
        this.gfx.arc(c.x, c.y, 30, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p);
        this.gfx.strokePath();
    }

    /** 機関への被弾（全武器）。HP を減らし、0 で破壊→減速。 */
    damageEngine(engine: Phaser.Physics.Arcade.Sprite, damage: number): void {
        const hp = (engine.getData('hp') as number) - damage;
        engine.setData('hp', hp);
        if (hp <= 0) {
            engine.destroy();
            this.state.destroyEngine();
        }
    }

    /** 波動砲への長距離弾命中（露出中のみ有効。呼び出し側が長距離弾＋露出を保証）。 */
    hitCannonByLongRange(): void {
        this.state.hitCannon();
        if (this.state.isDefeated()) {
            this.destroyShip();
        }
    }

    private destroyShip(): void {
        const boom = (s: Phaser.Physics.Arcade.Sprite) => { if (s.active) this.explode(s.x, s.y, 20, 0xff6600); };
        this.engines.getChildren().forEach((c) => boom(c as Phaser.Physics.Arcade.Sprite));
        boom(this.cannon);
        boom(this.hull);
        this.explode(this.hull.x, this.hull.y, 60, 0x00e5ff);
        this.teardown();
        this.onDefeated?.();
    }

    /** 外部（Wave 遷移など）からの破棄。爆発もコールバックも伴わない。 */
    destroy(): void {
        this.teardown();
    }

    private teardown(): void {
        if (this.engines) this.engines.clear(true, true);
        if (this.cannonGroup) this.cannonGroup.clear(true, true);
        if (this.hull && this.hull.active) this.hull.destroy();
        if (this.gfx) this.gfx.destroy();
    }

    getState(): BattleshipState { return this.state; }
}
