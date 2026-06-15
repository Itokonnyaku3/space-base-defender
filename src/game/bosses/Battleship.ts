import Phaser from 'phaser';
import type { CombatScene } from '../core/CombatScene';
import { BattleshipState } from './BattleshipState';
import type { LaunchKind } from './LaunchBay';
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
    bays!: Phaser.Physics.Arcade.Group;
    walls!: Phaser.Physics.Arcade.Group;
    private gfx!: Phaser.GameObjects.Graphics;
    private beamFlashMs = 0; // 発射閃光の残り時間（>0 の間だけ本物のビームを描画）
    private animMs = 0;       // 演出用の時間アキュムレータ（予告線の点滅）

    // MainScene が接続するコールバック
    onCannonFire?: () => void;   // 波動砲チャージ完了（基地ダメージ＋即死判定は MainScene 側）
    onReachBase?: () => void;    // 戦艦が基地へ到達
    onDefeated?: () => void;     // 波動砲破壊→撃破
    onLaunch?: (x: number, y: number, kind: LaunchKind) => void; // 発射台からの敵射出

    private reachedBase = false;

    // 推進機関の船体相対オフセット（船体の前方=+x方向 / 後方=-x に4基を横一列で配置）。
    // 画面上で重ならず4基を数えられるよう、船幅(local y, ±55)に等間隔で並べる。
    private readonly engineOffsets = [
        { x: -140, y: -54 }, { x: -140, y: -18 },
        { x: -140, y: 18 }, { x: -140, y: 54 },
    ];

    // 発射台（左右側面の中央）と、それを前後に挟む防壁2枚ずつ
    private readonly bayLayout = [
        { bay: { x: 0, y: 70 }, walls: [{ x: -45, y: 70 }, { x: 45, y: 70 }] },
        { bay: { x: 0, y: -70 }, walls: [{ x: -45, y: -70 }, { x: 45, y: -70 }] },
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
        // テクスチャは横長(320x110)だが船首を基地へ向けて約90°回転するため、
        // 自機との物理判定が見た目と一致するよう当たり判定を縦横入替（110x320）して補正する。
        // （本ボスは常に真北から基地へ直進＝回転はほぼ π/2 固定）
        const hullBody = this.hull.body as Phaser.Physics.Arcade.Body | null;
        if (hullBody) hullBody.setSize(this.hull.height, this.hull.width);

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

        // 発射台×2＋防壁×4（左右側面）。HP は純ロジック側（BattleshipState.bays）が管理
        this.bays = this.scene.physics.add.group();
        this.walls = this.scene.physics.add.group();
        this.bayLayout.forEach((layout, bayIndex) => {
            const bay = this.bays.create(x, y, 'battleship_bay') as Phaser.Physics.Arcade.Sprite;
            bay.setImmovable(true);
            bay.setData('bayIndex', bayIndex);
            bay.setData('offX', layout.bay.x);
            bay.setData('offY', layout.bay.y);
            layout.walls.forEach((w, wallIndex) => {
                const wall = this.walls.create(x, y, 'battleship_wall') as Phaser.Physics.Arcade.Sprite;
                wall.setImmovable(true);
                wall.setData('bayIndex', bayIndex);
                wall.setData('wallIndex', wallIndex);
                wall.setData('offX', w.x);
                wall.setData('offY', w.y);
            });
        });

        this.gfx = this.scene.add.graphics().setDepth(25);
    }

    update(deltaMs: number): void {
        if (this.state.isDefeated()) return;

        const speed = this.state.currentSpeed(); // px/秒
        const ang = Phaser.Math.Angle.Between(this.hull.x, this.hull.y, this.base.x, this.base.y);
        if (speed > 0) {
            // フレームレート非依存にするため deltaMs でスケール
            const step = speed * (deltaMs / 1000);
            this.hull.x += Math.cos(ang) * step;
            this.hull.y += Math.sin(ang) * step;
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

        // 演出タイマー更新（点滅・閃光の減衰）
        this.animMs += deltaMs;
        if (this.beamFlashMs > 0) this.beamFlashMs -= deltaMs;

        // チャージ完了 → 発射（本物のビーム閃光を焚いてから砲撃通知）
        if (this.state.tickCharge(deltaMs) === 'fire') {
            this.beamFlashMs = 350;
            this.onCannonFire?.();
        }

        // 発射台・防壁を船体に追従
        const follow = (s: Phaser.Physics.Arcade.Sprite) => {
            if (!s.active) return;
            const ox = s.getData('offX') as number;
            const oy = s.getData('offY') as number;
            s.x = this.hull.x + Math.cos(ang) * ox - Math.sin(ang) * oy;
            s.y = this.hull.y + Math.sin(ang) * ox + Math.cos(ang) * oy;
            const body = s.body as Phaser.Physics.Arcade.Body | null;
            if (body) body.reset(s.x, s.y);
        };
        this.bays.getChildren().forEach((c) => follow(c as Phaser.Physics.Arcade.Sprite));
        this.walls.getChildren().forEach((c) => follow(c as Phaser.Physics.Arcade.Sprite));

        // 射出タイミング → MainScene に通知（生存発射台のみ）
        for (const { bayIndex, kind } of this.state.tickLaunches(deltaMs)) {
            const bay = this.findBaySprite(bayIndex);
            if (bay && bay.active) this.onLaunch?.(bay.x, bay.y, kind);
        }

        this.drawCharge();
    }

    private findBaySprite(bayIndex: number): Phaser.Physics.Arcade.Sprite | undefined {
        return this.bays.getChildren().find(
            (c) => (c as Phaser.Physics.Arcade.Sprite).getData('bayIndex') === bayIndex,
        ) as Phaser.Physics.Arcade.Sprite | undefined;
    }

    private drawCharge(): void {
        this.gfx.clear();
        const c = this.cannon;

        // 発射の瞬間だけ描く「本物のビーム」：太い白芯＋赤グロー（予告線とは明確に別物）
        if (this.beamFlashMs > 0) {
            const a = Math.max(0, this.beamFlashMs / 350);
            this.gfx.lineStyle(24, 0xff2233, 0.5 * a);
            this.gfx.lineBetween(c.x, c.y, this.base.x, this.base.y);
            this.gfx.lineStyle(8, 0xffffff, 0.9 * a);
            this.gfx.lineBetween(c.x, c.y, this.base.x, this.base.y);
        }

        if (!this.state.isCharging()) return;
        const p = this.state.chargeProgress();

        // チャージ中の「予告線」：細い破線＋点滅。まだ発射していないことを示す（ビームと誤認させない）
        const blink = 0.2 + 0.3 * (0.5 + 0.5 * Math.sin(this.animMs / 90));
        this.gfx.lineStyle(1.5, 0xff5566, blink);
        this.drawDashedLine(c.x, c.y, this.base.x, this.base.y, 16, 14);

        // チャージゲージ（砲口リング）：進捗で満ちる
        this.gfx.lineStyle(4, 0x002233, 1);
        this.gfx.strokeCircle(c.x, c.y, 30);
        this.gfx.lineStyle(4, 0x00e5ff, 1);
        this.gfx.beginPath();
        this.gfx.arc(c.x, c.y, 30, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p);
        this.gfx.strokePath();

        // 砲口グロー：完成が近いほど明るく＝危険の予兆
        this.gfx.fillStyle(0xff3344, 0.15 + 0.5 * p);
        this.gfx.fillCircle(c.x, c.y, 10 + 16 * p);
    }

    /** 破線を引く（チャージ予告線を本物のビームと視覚的に区別するため）。 */
    private drawDashedLine(x1: number, y1: number, x2: number, y2: number, dash: number, gap: number): void {
        const dx = x2 - x1, dy = y2 - y1;
        const len = Math.hypot(dx, dy);
        if (len === 0) return;
        const ux = dx / len, uy = dy / len;
        for (let d = 0; d < len; d += dash + gap) {
            const e = Math.min(d + dash, len);
            this.gfx.lineBetween(x1 + ux * d, y1 + uy * d, x1 + ux * e, y1 + uy * e);
        }
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

    /** 防壁への被弾（全武器）。HP は純ロジック側で管理。破壊でスプライト除去。 */
    damageWall(wall: Phaser.Physics.Arcade.Sprite, damage: number): void {
        const bi = wall.getData('bayIndex') as number;
        const wi = wall.getData('wallIndex') as number;
        this.state.damageWall(bi, wi, damage);
        if (!this.state.isWallAlive(bi, wi)) {
            this.explode(wall.x, wall.y, 8, 0xb8c4d8);
            wall.destroy();
        }
    }

    /** 発射台への被弾（脆弱時のみ。呼び出し側が脆弱性を保証）。破壊で射出停止＋スプライト除去。 */
    damageBay(bay: Phaser.Physics.Arcade.Sprite, damage: number): void {
        const bi = bay.getData('bayIndex') as number;
        this.state.damageBay(bi, damage);
        if (!this.state.isBayAlive(bi)) {
            this.explode(bay.x, bay.y, 16, 0xff5522);
            bay.destroy();
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
        this.bays.getChildren().forEach((c) => boom(c as Phaser.Physics.Arcade.Sprite));
        this.walls.getChildren().forEach((c) => boom(c as Phaser.Physics.Arcade.Sprite));
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
        if (this.bays) this.bays.clear(true, true);
        if (this.walls) this.walls.clear(true, true);
        if (this.hull && this.hull.active) this.hull.destroy();
        if (this.gfx) this.gfx.destroy();
    }

    getState(): BattleshipState { return this.state; }
}
