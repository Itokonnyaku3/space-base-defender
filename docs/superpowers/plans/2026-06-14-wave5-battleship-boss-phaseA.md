# Wave 5 ボス（巨大戦列艦）Phase A 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wave 5 に「進軍を機関破壊で止め、露出した波動砲を長距離弾4発で撃ち抜く」巨大戦列艦ボスの本体ループを実装する（発射台はPhase B）。

**Architecture:** 純ロジック（フェーズ遷移・速度・チャージ・撃破判定）を Phaser 非依存の `BattleshipState` に分離して vitest でテスト。Phaser 側 `Battleship` が船体＋機関4＋波動砲のスプライトを生成・移動・当たり判定・描画し、状態は `BattleshipState` に委譲。MainScene は Wave 5 開始時に生成し毎フレーム update を回すだけ。既存戦闘コードには触れない追加実装。

**Tech Stack:** TypeScript, Phaser 4 (Arcade Physics), Vitest, 既存の `EventBus`/`ENEMY_CONFIGS`/`triggerExplosion`/`SoundEffects`。

**設計書:** [docs/superpowers/specs/2026-06-14-wave5-battleship-boss-design.md](../specs/2026-06-14-wave5-battleship-boss-design.md)

---

## ファイル構成

- **Create** `src/game/configs/BossConfig.ts` — ボスの全調整値（HP・速度・時間・ダメージ）の単一情報源。
- **Create** `src/game/bosses/BattleshipState.ts` — Phaser 非依存の純粋な状態機械（フェーズ・機関数→速度・チャージ・波動砲命中・撃破）。
- **Create** `src/game/bosses/BattleshipState.test.ts` — 上記の vitest テスト。
- **Create** `src/game/bosses/Battleship.ts` — Phaser 実体（スプライト生成・移動・当たり判定・チャージ演出・ビーム・爆発）。`BattleshipState` を内包。
- **Modify** `src/game/MainScene.ts` — Wave 5 開始処理で `Battleship` を生成、update で tick、撃破/基地被弾を反映。旧 `spawn_mothership` 経路を Wave5 では使わない。
- **Modify** `src/game/EventBus.ts` — 必要なら新イベント（後述）を `GameEventMap` に追加。
- **Modify** `public/assets/data/default_scenario.json` — Wave 5 の誘導通信を更新。

---

## Task 1: BossConfig.ts（調整値の単一情報源）

**Files:**
- Create: `src/game/configs/BossConfig.ts`

- [ ] **Step 1: 実装**

```typescript
// 巨大戦列艦ボスの単一情報源。挙動を変えたいときはここを編集する（ハードコード禁止）。
export interface WaveCannonConfig {
    chargeMs: number;               // チャージ時間
    baseDamage: number;             // 砲撃が基地に与えるダメージ
    longRangeHitsToDestroy: number; // 破壊に必要な長距離弾の命中数
}

export interface BattleshipConfig {
    baseAdvanceSpeed: number; // 全機関生存時の進軍速度 (px/frame)
    engineCount: number;
    engineHp: number;         // 機関1基あたり
    cannon: WaveCannonConfig;
    reachBaseDamage: number;  // 戦艦が基地に到達した場合の大ダメージ
}

export const BOSS_CONFIG: { battleship: BattleshipConfig } = {
    battleship: {
        baseAdvanceSpeed: 8,
        engineCount: 4,
        engineHp: 50,
        cannon: {
            chargeMs: 30000,
            baseDamage: 40,
            longRangeHitsToDestroy: 4,
        },
        reachBaseDamage: 100, // 到達=実質敗北
    },
};
```

- [ ] **Step 2: 型チェック**

Run: `npm.cmd run build`
Expected: `built in` 表示・`error TS` なし。

- [ ] **Step 3: コミット**

```bash
git add src/game/configs/BossConfig.ts
git commit -m "feat(boss): BossConfig を追加（Wave5戦列艦の調整値）"
```

---

## Task 2: BattleshipState（純ロジック・TDD）

**Files:**
- Create: `src/game/bosses/BattleshipState.ts`
- Test: `src/game/bosses/BattleshipState.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

```typescript
import { describe, it, expect } from 'vitest';
import { BattleshipState } from './BattleshipState';
import { BOSS_CONFIG } from '../configs/BossConfig';

const cfg = BOSS_CONFIG.battleship;

describe('BattleshipState', () => {
  it('初期は advancing・機関全数・速度フル', () => {
    const s = new BattleshipState(cfg);
    expect(s.phase).toBe('advancing');
    expect(s.enginesAlive).toBe(cfg.engineCount);
    expect(s.currentSpeed()).toBe(cfg.baseAdvanceSpeed);
  });

  it('機関破壊で速度が比例して下がる', () => {
    const s = new BattleshipState(cfg);
    s.destroyEngine();
    expect(s.enginesAlive).toBe(3);
    expect(s.currentSpeed()).toBeCloseTo(cfg.baseAdvanceSpeed * 0.75);
    expect(s.phase).toBe('advancing');
  });

  it('全機関破壊で停止し waveCannon へ移行', () => {
    const s = new BattleshipState(cfg);
    for (let i = 0; i < cfg.engineCount; i++) s.destroyEngine();
    expect(s.currentSpeed()).toBe(0);
    expect(s.phase).toBe('waveCannon');
  });

  it('advancing 中はチャージしない', () => {
    const s = new BattleshipState(cfg);
    expect(s.tickCharge(1000)).toBeNull();
    expect(s.chargeProgress()).toBe(0);
  });

  it('waveCannon でチャージ完了すると fire を返し、ループする', () => {
    const s = new BattleshipState(cfg);
    for (let i = 0; i < cfg.engineCount; i++) s.destroyEngine();
    expect(s.tickCharge(cfg.cannon.chargeMs - 100)).toBeNull();
    expect(s.tickCharge(100)).toBe('fire');
    expect(s.chargeProgress()).toBe(0); // 再チャージ
  });

  it('波動砲は露出中(waveCannon)のみ命中が蓄積し、4発で撃破。fireでリセットしない', () => {
    const s = new BattleshipState(cfg);
    s.hitCannon();                       // advancing 中は無効
    expect(s.cannonHits).toBe(0);
    for (let i = 0; i < cfg.engineCount; i++) s.destroyEngine();
    s.hitCannon(); s.hitCannon();
    s.tickCharge(cfg.cannon.chargeMs);   // 砲撃しても命中数は保持
    s.hitCannon(); s.hitCannon();
    expect(s.cannonHits).toBe(4);
    expect(s.isDefeated()).toBe(true);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm.cmd run test`
Expected: FAIL（`BattleshipState` 未定義）。

- [ ] **Step 3: 最小実装**

```typescript
import type { BattleshipConfig } from '../configs/BossConfig';

export type BossPhase = 'advancing' | 'waveCannon' | 'defeated';

export class BattleshipState {
    phase: BossPhase = 'advancing';
    enginesAlive: number;
    cannonHits = 0;
    chargeMs = 0;
    private readonly cfg: BattleshipConfig;

    constructor(cfg: BattleshipConfig) {
        this.cfg = cfg;
        this.enginesAlive = cfg.engineCount;
    }

    currentSpeed(): number {
        return this.cfg.baseAdvanceSpeed * (this.enginesAlive / this.cfg.engineCount);
    }

    destroyEngine(): void {
        if (this.enginesAlive > 0) this.enginesAlive--;
        if (this.enginesAlive === 0 && this.phase === 'advancing') {
            this.phase = 'waveCannon';
            this.chargeMs = 0;
        }
    }

    /** waveCannon 中のみ進行。チャージ完了で 'fire' を返し再チャージ。 */
    tickCharge(deltaMs: number): 'fire' | null {
        if (this.phase !== 'waveCannon') return null;
        this.chargeMs += deltaMs;
        if (this.chargeMs >= this.cfg.cannon.chargeMs) {
            this.chargeMs = 0;
            return 'fire';
        }
        return null;
    }

    chargeProgress(): number {
        if (this.phase !== 'waveCannon') return 0;
        return Math.min(1, this.chargeMs / this.cfg.cannon.chargeMs);
    }

    /** 波動砲への命中（呼び出し側で「長距離弾のみ」を保証する）。露出中のみ蓄積。 */
    hitCannon(): void {
        if (this.phase !== 'waveCannon') return;
        this.cannonHits++;
        if (this.cannonHits >= this.cfg.cannon.longRangeHitsToDestroy) {
            this.phase = 'defeated';
        }
    }

    isCharging(): boolean { return this.phase === 'waveCannon'; }
    isDefeated(): boolean { return this.phase === 'defeated'; }
}
```

- [ ] **Step 4: テスト成功を確認**

Run: `npm.cmd run test`
Expected: PASS（全テスト緑）。

- [ ] **Step 5: コミット**

```bash
git add src/game/bosses/BattleshipState.ts src/game/bosses/BattleshipState.test.ts
git commit -m "feat(boss): BattleshipState 純ロジック+テスト（機関→速度・チャージ・撃破）"
```

---

## Task 3: Battleship（Phaser）— 生成と部位

> ここから Phaser 層。ユニットテスト不可のため検証は `npm run check`（緑）＋実機プレイ。各部位は独立スプライト＋`setData('hp')`。船体は基地方向（固定向き）に進む。

**Files:**
- Create: `src/game/bosses/Battleship.ts`

- [ ] **Step 1: 実装（生成と部位）**

`Battleship` は `BattleshipState` を内包し、船体・機関4・波動砲を生成。MainScene から `enemies`/`turretBullets` 等のグループや base/player を受け取る（`CombatScene` を利用）。部位は専用グループ `engineGroup`/`cannonGroup` に入れ、毎フレーム船体位置に追従させる。

```typescript
import Phaser from 'phaser';
import type { CombatScene } from '../core/CombatScene';
import { BattleshipState } from './BattleshipState';
import { BOSS_CONFIG } from '../configs/BossConfig';

export class Battleship {
    private scene: CombatScene;
    private base: Phaser.Physics.Arcade.Sprite;
    private state = new BattleshipState(BOSS_CONFIG.battleship);

    hull!: Phaser.Physics.Arcade.Sprite;
    engines!: Phaser.Physics.Arcade.Group;   // 4基
    cannon!: Phaser.Physics.Arcade.Sprite;   // 波動砲（フェーズ2で表示）

    // 部位の船体相対オフセット（船体の向き=基地方向に対して 前方=+x方向 とする）
    private enginePartsOffsets = [
        { x: -120, y: -40 }, { x: -120, y: 40 },
        { x: -150, y: -15 }, { x: -150, y: 15 },
    ];

    constructor(scene: CombatScene, base: Phaser.Physics.Arcade.Sprite) {
        this.scene = scene;
        this.base = base;
    }

    spawn(x: number, y: number) {
        this.hull = this.scene.physics.add.sprite(x, y, 'battleship_hull');
        this.hull.setImmovable(true);
        // 基地方向を向く（前方=基地）
        const ang = Phaser.Math.Angle.Between(x, y, this.base.x, this.base.y);
        this.hull.rotation = ang; // 0=右向き想定のテクスチャ前提（描画はTask別途）

        this.engines = this.scene.physics.add.group();
        for (const off of this.enginePartsOffsets) {
            const e = this.engines.create(x, y, 'battleship_engine') as Phaser.Physics.Arcade.Sprite;
            e.setImmovable(true);
            e.setData('hp', BOSS_CONFIG.battleship.engineHp);
            e.setData('partKind', 'engine');
            e.setData('offX', off.x); e.setData('offY', off.y);
        }

        this.cannon = this.scene.physics.add.sprite(x, y, 'battleship_cannon');
        this.cannon.setImmovable(true);
        this.cannon.setData('partKind', 'cannon');
        this.cannon.setVisible(false);  // フェーズ2で露出
        if (this.cannon.body) this.cannon.body.enable = false;
        this.cannonGroup = this.scene.physics.add.group();
        this.cannonGroup.add(this.cannon);
    }

    cannonGroup!: Phaser.Physics.Arcade.Group;
}
```

（テクスチャ `battleship_hull`/`battleship_engine`/`battleship_cannon` は暫定で `visuals/GameTextures.ts` に矩形で生成しておく。最終アセットは後日差し替え。横長船体は例えば 300×100 px の矩形＋色。）

- [ ] **Step 2: 暫定テクスチャを追加**

`src/game/visuals/GameTextures.ts` の `createGameTextures(scene)` の末尾（`graphics.destroy()` の直前）に追加。`scene.textures.exists` ガードでリスタート時の二重生成を防ぐ。

```typescript
    if (!scene.textures.exists('battleship_hull')) {
        const g = scene.add.graphics();
        // 船体（横長・暗い鋼色）
        g.fillStyle(0x2a3550, 1); g.fillRoundedRect(0, 0, 320, 110, 14);
        g.fillStyle(0x3d4a6b, 1); g.fillRoundedRect(8, 8, 304, 94, 10);
        g.generateTexture('battleship_hull', 320, 110); g.clear();
        // 機関（橙の小矩形）
        g.fillStyle(0xff8800, 1); g.fillRoundedRect(0, 0, 34, 26, 4);
        g.generateTexture('battleship_engine', 34, 26); g.clear();
        // 波動砲（シアンの円・発光想定）
        g.fillStyle(0x00e5ff, 1); g.fillCircle(22, 22, 22);
        g.fillStyle(0xffffff, 1); g.fillCircle(22, 22, 8);
        g.generateTexture('battleship_cannon', 44, 44);
        g.destroy();
    }
```

- [ ] **Step 3: 型チェック**

Run: `npm.cmd run build`
Expected: `error TS` なし（まだ MainScene 未接続なので未使用警告が出る場合は次タスクで解消）。

- [ ] **Step 4: コミット**

```bash
git add src/game/bosses/Battleship.ts src/game/visuals/GameTextures.ts
git commit -m "feat(boss): Battleship 生成（船体・機関4・波動砲）と暫定テクスチャ"
```

---

## Task 4: Battleship — 毎フレーム更新（進軍＋部位追従＋チャージ）

**Files:**
- Modify: `src/game/bosses/Battleship.ts`

- [ ] **Step 1: update メソッドを実装**

```typescript
// Battleship クラスに追加
update(deltaMs: number) {
    if (this.state.isDefeated()) return;

    // 進軍（advancing のみ速度>0）。基地方向へ直進。
    const speed = this.state.currentSpeed();
    const ang = Phaser.Math.Angle.Between(this.hull.x, this.hull.y, this.base.x, this.base.y);
    if (speed > 0) {
        this.hull.x += Math.cos(ang) * speed;
        this.hull.y += Math.sin(ang) * speed;
    }
    this.hull.rotation = ang;

    // 基地到達（進軍中のみ・一度だけ）→ 大ダメージ（spec §5）
    if (this.state.phase === 'advancing' && !this.reachedBase &&
        Phaser.Math.Distance.Between(this.hull.x, this.hull.y, this.base.x, this.base.y) < 120) {
        this.reachedBase = true;
        this.onReachBase?.();
    }

    // 部位を船体に追従（船体の向き ang に合わせて回転オフセット）
    this.engines.getChildren().forEach((c) => {
        const e = c as Phaser.Physics.Arcade.Sprite;
        if (!e.active) return;
        const ox = e.getData('offX') as number, oy = e.getData('offY') as number;
        e.x = this.hull.x + Math.cos(ang) * ox - Math.sin(ang) * oy;
        e.y = this.hull.y + Math.sin(ang) * ox + Math.cos(ang) * oy;
        if (e.body) (e.body as Phaser.Physics.Arcade.Body).reset(e.x, e.y);
    });

    // 波動砲は前方(+x)に配置
    const cOffX = 150;
    this.cannon.x = this.hull.x + Math.cos(ang) * cOffX;
    this.cannon.y = this.hull.y + Math.sin(ang) * cOffX;
    if (this.cannon.body) (this.cannon.body as Phaser.Physics.Arcade.Body).reset(this.cannon.x, this.cannon.y);

    // フェーズ2移行時に波動砲を露出
    if (this.state.isCharging() && !this.cannon.visible) {
        this.cannon.setVisible(true);
        if (this.cannon.body) this.cannon.body.enable = true;
    }

    // チャージ進行 → 'fire' で基地ダメージ（呼び出し側にイベントで通知）
    const fired = this.state.tickCharge(deltaMs);
    if (fired === 'fire') {
        this.onCannonFire?.();
    }
}

onCannonFire?: () => void;
onReachBase?: () => void;   // 戦艦が基地に到達（進軍中に止められなかった）
private reachedBase = false;
getState(): BattleshipState { return this.state; }
```

MainScene 側で `boss.onReachBase = () => { this.baseHp = Math.max(0, this.baseHp - BOSS_CONFIG.battleship.reachBaseDamage); this.updateUI(); if (this.baseHp <= 0) { this.baseHpText.setText('基地崩壊 (GAME OVER)'); this.triggerGameOver(); } }` を接続する（Task 8）。

- [ ] **Step 2: 型チェック**

Run: `npm.cmd run build`
Expected: `error TS` なし。

- [ ] **Step 3: コミット**

```bash
git add src/game/bosses/Battleship.ts
git commit -m "feat(boss): Battleship 進軍・部位追従・波動砲露出・チャージ更新"
```

---

## Task 5: 当たり判定（機関＝全武器 / 波動砲＝長距離弾のみ）

**Files:**
- Modify: `src/game/bosses/Battleship.ts`
- Modify: `src/game/MainScene.ts`（コライダー登録）

- [ ] **Step 1: Battleship に被弾処理を追加**

```typescript
// 機関への被弾（全武器）。consumeBullet 相当は MainScene 側 helper を呼ぶ想定だが、
// ここでは弾の damage を読み、機関HPを減らす。撃破で destroyEngine。
damageEngine(engine: Phaser.Physics.Arcade.Sprite, damage: number) {
    const hp = (engine.getData('hp') as number) - damage;
    engine.setData('hp', hp);
    if (hp <= 0) {
        engine.destroy();
        this.state.destroyEngine();
    }
}

// 波動砲への被弾（長距離弾のみ・露出中のみ）。1命中=hitCannon 1回。
hitCannonByLongRange() {
    this.state.hitCannon();
}
```

- [ ] **Step 2: MainScene でコライダー登録**

Wave 5 で Battleship 生成後、`this.physics.add.collider` を登録する。`bullets`(自機)/`turretBullets`/`allyBullets` × `engines`、`bullets` × `cannonGroup`（process で長距離弾＋露出中のみ）。
弾の消費は既存 `consumeBullet` を流用。機関ダメージは弾の `getData('damage')`。波動砲は `weaponType === 'long_range'` のみ受理。

```typescript
// MainScene: Wave5 生成時
this.physics.add.collider(this.bullets, boss.engines, (b, e) => this.onBulletHitEngine(boss, b, e), this.checkEnemyBulletHit, this);
this.physics.add.collider(this.turretBullets, boss.engines, (b, e) => this.onBulletHitEngine(boss, b, e), this.checkEnemyBulletHit, this);
this.physics.add.collider(this.allyBullets, boss.engines, (b, e) => this.onBulletHitEngine(boss, b, e), undefined, this);
this.physics.add.collider(this.bullets, boss.cannonGroup, (b) => this.onBulletHitCannon(boss, b), undefined, this);

// MainScene のメソッド
private onBulletHitEngine(boss: Battleship, bullet: unknown, engine: unknown) {
  const b = bullet as Phaser.Physics.Arcade.Sprite;
  const e = engine as Phaser.Physics.Arcade.Sprite;
  if (!b.active || !e.active) return;
  const dmg = (b.getData('damage') as number) ?? 10;
  this.consumeBullet(b);
  this.triggerExplosion(b.x, b.y, 5, 0xffaa00);
  boss.damageEngine(e, dmg);
}
private onBulletHitCannon(boss: Battleship, bullet: unknown) {
  const b = bullet as Phaser.Physics.Arcade.Sprite;
  if (!b.active) return;
  if (b.getData('weaponType') !== 'long_range') return; // 長距離弾のみ
  if (!boss.getState().isCharging()) return;             // 露出中のみ
  this.consumeBullet(b);
  this.triggerExplosion(b.x, b.y, 8, 0x00ffff);
  boss.hitCannonByLongRange();
}
```

- [ ] **Step 3: 検証（ビルド＋実機）**

Run: `npm.cmd run check`（緑）。dev サーバーでデバッグ Wave5、機関に通常弾→破壊で減速、波動砲(フェーズ2)に長距離弾→蓄積を確認。

- [ ] **Step 4: コミット**

```bash
git add src/game/bosses/Battleship.ts src/game/MainScene.ts
git commit -m "feat(boss): 機関(全武器)/波動砲(長距離弾のみ)の当たり判定"
```

---

## Task 6: 波動砲の演出（チャージゲージ・ビーム予告線・即死・砲撃）

**Files:**
- Modify: `src/game/bosses/Battleship.ts`（描画用 Graphics）
- Modify: `src/game/MainScene.ts`（基地ダメージ・自機即死フック）

- [ ] **Step 1: チャージゲージ＋ビーム予告線の描画**

Battleship に `private gfx!: Phaser.GameObjects.Graphics`（spawn 時に `this.gfx = scene.add.graphics().setDepth(25)`）を持たせ、`update` 末尾で `drawCharge()` を呼ぶ。

```typescript
private drawCharge() {
    this.gfx.clear();
    if (!this.state.isCharging()) return;
    const c = this.cannon, p = this.state.chargeProgress();
    // ビーム予告線（波動砲→基地）。進捗で赤みと太さが増す
    this.gfx.lineStyle(2 + p * 4, 0xff3344, 0.3 + p * 0.5);
    this.gfx.lineBetween(c.x, c.y, this.base.x, this.base.y);
    // チャージゲージ（波動砲の周囲リング）
    this.gfx.lineStyle(4, 0x002233, 1);
    this.gfx.strokeCircle(c.x, c.y, 30);
    this.gfx.lineStyle(4, 0x00e5ff, 1);
    this.gfx.beginPath();
    this.gfx.arc(c.x, c.y, 30, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p);
    this.gfx.strokePath();
}
```
（撃破/破棄時に `this.gfx.destroy()` を忘れない。）

- [ ] **Step 2: 砲撃と即死判定**

`onCannonFire`（Task4 で発火）で MainScene が:
- 基地に `BOSS_CONFIG.battleship.cannon.baseDamage`(40) ダメージ（既存の基地ダメージ経路を流用）。
- ビーム線分（波動砲→基地）と自機の距離が一定以内なら自機即死（既存のゲームオーバー経路 `triggerGameOver()`）。ビーム発射の一瞬だけ判定＋ビーム描画フラッシュ。

```typescript
// MainScene: boss.onCannonFire = () => this.onBattleshipCannonFire(boss);
private onBattleshipCannonFire(boss: Battleship) {
  // 即死判定: 波動砲→基地の線分に自機が近いか
  const c = boss.cannon;
  const dist = this.distToSegment(this.player.x, this.player.y, c.x, c.y, this.base.x, this.base.y);
  if (dist < 40) { this.triggerExplosion(this.player.x, this.player.y, 40, 0x00ffff); this.player.setVisible(false); this.triggerGameOver(); return; }
  // 基地ダメージ
  this.baseHp = Math.max(0, this.baseHp - BOSS_CONFIG.battleship.cannon.baseDamage);
  this.updateUI();
  if (this.baseHp <= 0) { this.baseHpText.setText('基地崩壊 (GAME OVER)'); this.triggerGameOver(); }
}
// 点(px,py)と線分(ax,ay)-(bx,by)の距離（ヘルパー）
private distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}
```

- [ ] **Step 3: 検証（ビルド＋実機）**

Run: `npm.cmd run check`（緑）。実機: フェーズ2でゲージが進む、予告線が出る、砲撃で基地-40、ビーム上にいると即死、避ければ無傷。

- [ ] **Step 4: コミット**

```bash
git add src/game/bosses/Battleship.ts src/game/MainScene.ts
git commit -m "feat(boss): 波動砲チャージゲージ・ビーム予告線・砲撃(基地40/自機即死)"
```

---

## Task 7: 撃破（波動砲4発→戦艦爆発→Wave5クリア）

**Files:**
- Modify: `src/game/bosses/Battleship.ts`
- Modify: `src/game/MainScene.ts`

- [ ] **Step 1: 撃破処理**

`hitCannonByLongRange()` 内で命中後に `state.isDefeated()` なら `this.destroyShip()` を呼ぶ。`destroyShip` は MainScene の `triggerExplosion` を使うため、Battleship は spawn 時に `triggerExplosion` 関数参照を受け取るか、`scene` 経由で MainScene のメソッドを呼ぶ（`(scene as CombatScene)` には triggerExplosion は無いので、コールバック `private explode: (x,y,n,tint)=>void` を spawn 引数で渡すのが綺麗）。

```typescript
private destroyShip() {
    // 全部位を爆発
    const boom = (s: Phaser.Physics.Arcade.Sprite) => { if (s.active) this.explode(s.x, s.y, 20, 0xff6600); };
    this.engines.getChildren().forEach((c) => boom(c as Phaser.Physics.Arcade.Sprite));
    boom(this.cannon);
    boom(this.hull);
    this.explode(this.hull.x, this.hull.y, 60, 0x00e5ff); // 大爆発
    this.engines.clear(true, true);
    this.cannonGroup.clear(true, true);
    this.hull.destroy();
    this.gfx.destroy();
    this.onDefeated?.();
}
// フィールド: onDefeated?: () => void; private explode!: (x:number,y:number,n:number,tint:number)=>void;
// spawn 引数で this.explode = (x,y,n,t) => scene の triggerExplosion … を受け取る
```

MainScene は `boss.onDefeated = () => this.scenarioManager.setWaveProgress('mothershipDestroyed', 1)`（＝既存の `destroyCarrierMothership` クリア条件で Wave5 クリア）を接続。`explode` には MainScene の `triggerExplosion` を bind して渡す。

- [ ] **Step 2: 検証（ビルド＋実機）**

Run: `npm.cmd run check`（緑）。実機: 露出波動砲に長距離弾4発→戦艦爆発→Wave5クリア通信→次へ。

- [ ] **Step 3: コミット**

```bash
git add src/game/bosses/Battleship.ts src/game/MainScene.ts
git commit -m "feat(boss): 波動砲4発で戦艦撃破→Wave5クリア"
```

---

## Task 8: MainScene への Wave 5 統合

**Files:**
- Modify: `src/game/MainScene.ts`

- [ ] **Step 1: Wave5 開始で Battleship 生成**

`handleWaveTransition('wave5')` で旧 `spawn_mothership` の代わりに `this.battleship = new Battleship(this, this.base); this.battleship.spawn(x, y)`（基地から800px等の位置）。コールバック（onCannonFire/onDefeated）を接続。`update()` で `if (this.battleship) this.battleship.update(this.game.loop.delta)` を呼ぶ。`handleWaveTransition` のクリーンアップで前回の battleship を破棄。

- [ ] **Step 2: 旧母船スポーンの停止**

シナリオ wave5 の `spawn_mothership` アクションを削除（または Battleship 生成に置換）。`default_scenario.json` の wave5_start_2 の actions を調整。

- [ ] **Step 3: 検証（ビルド＋実機）**

Run: `npm.cmd run check`（緑）。実機: デバッグで Wave5 へ→戦艦出現→進軍→機関破壊→波動砲→撃破までの一連が通る。コンソールエラーゼロ。

- [ ] **Step 4: コミット**

```bash
git add src/game/MainScene.ts public/assets/data/default_scenario.json
git commit -m "feat(boss): Wave5 に Battleship を統合（旧母船スポーンを置換）"
```

---

## Task 9: 誘導通信（データ駆動）

**Files:**
- Modify: `public/assets/data/default_scenario.json`

- [ ] **Step 1: Wave5 通信を更新**

wave5 のイベント/動的イベントで、(1) 戦艦出現時「まず推進機関を潰して進軍を止めろ」、(2) 全機関破壊時「波動砲チャージ開始！ 長距離弾を当てて破壊しろ、ビームに当たるな」を表示。`validateScenario`(zod) を通る形式で記述。

- [ ] **Step 2: 検証**

Run: `npm.cmd run check`（緑＝zod スキーマ検証含む）。実機で通信が出る。

- [ ] **Step 3: コミット**

```bash
git add public/assets/data/default_scenario.json
git commit -m "feat(boss): Wave5 戦列艦の誘導通信を追加"
```

---

## 完了の定義（Phase A）

- `npm run check` 緑（型・Lint・vitest）。
- 実機（デバッグ Wave5）で: 戦艦が進軍→機関4破壊で停止→波動砲30秒チャージ→長距離弾4発で撃破→Wave5クリア。砲撃で基地-40・ビーム即死・回避可、が確認できる。
- 既存の他 Wave / ポーズ / リスタート / エディタにリグレッションなし。

## Phase B（別計画・Aの実機確認後）

発射台×2＋防壁×4＋射出敵（迎撃機/爆撃機）。Battleship に launchBay 部位と射出タイマーを追加。設計書 §2 フェーズ1 を参照。
