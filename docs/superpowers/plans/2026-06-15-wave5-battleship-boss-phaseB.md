# Wave 5 ボス Phase B 実装計画：発射台＋防壁＋射出敵

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development または superpowers:executing-plans でタスク単位に実装する。各ステップは `- [ ]` チェックボックス。

**Goal:** Wave5 巨大戦列艦の側面に「発射台×2」を追加し、各発射台を「防壁×2」がガード。防壁を両方壊すと発射台が破壊可能になり、破壊するとその発射台からの敵射出が止まる。発射台は一定間隔で迎撃機/爆撃機を交互に射出する。

**Architecture:** 純ロジックは `LaunchBay`（Phaser非依存・vitestでテスト）に切り出し、`BattleshipState` が `bays: LaunchBay[]` を保持。Phaser 実体（発射台/防壁スプライト・追従・射出タイミング・破壊演出）は `Battleship` が担当し、射出は `onLaunch(x,y,kind)` コールバックで MainScene に通知。MainScene は既存 `EnemySpawnManager` に単機射出メソッドを足して敵を生成し、弾×発射台/防壁のコライダーを追加する。すべて Phase A の機関/波動砲と同じパターンの**追加実装**（既存戦闘・デグレ低リスク）。

**Tech Stack:** TypeScript 6 / Phaser 4.1 (Arcade) / Vitest 4 / 既存 ENEMY_CONFIGS（`single_circle`＝迎撃機, `suicide_bomber`＝爆撃機）

---

## File Structure

- **Create** `src/game/bosses/LaunchBay.ts` — 1発射台＋防壁の純ロジック（HP・脆弱判定・射出タイマー・交互種別）
- **Create** `src/game/bosses/LaunchBay.test.ts` — LaunchBay の vitest
- **Modify** `src/game/configs/BossConfig.ts` — `launch` 設定（数・HP・間隔・敵ID）を追加
- **Modify** `src/game/bosses/BattleshipState.ts` — `bays: LaunchBay[]` 保持＋委譲メソッド
- **Modify** `src/game/bosses/BattleshipState.test.ts` — bays 関連テスト追記
- **Modify** `src/game/visuals/GameTextures.ts` — `battleship_bay`（赤）・`battleship_wall`（鋼色）テクスチャ
- **Modify** `src/game/bosses/Battleship.ts` — 発射台/防壁スプライト・追従・射出tick・破壊・teardown・`onLaunch`
- **Modify** `src/game/EnemySpawnManager.ts` — `spawnFromLaunchBay(x,y,kind)` 単機射出
- **Modify** `src/game/MainScene.ts` — `onLaunch` 配線・弾×発射台/防壁コライダー・被弾ハンドラ・コライダー撤去
- **Modify** `public/assets/data/default_scenario.json` — 発射台を説明する通信（任意・データ駆動）

---

## Task B1: BossConfig に launch 設定を追加

**Files:** Modify `src/game/configs/BossConfig.ts`

- [ ] **Step 1: 型と値を追加**

`BattleshipConfig` の上に追記し、`BattleshipConfig` に `launch` を追加、`BOSS_CONFIG` に値を追加する。

```ts
export interface LaunchConfig {
    bayCount: number;        // 発射台の数（左右で2）
    wallsPerBay: number;     // 1発射台あたりの防壁枚数
    bayHp: number;           // 発射台のHP（防壁全破壊後のみ有効）
    wallHp: number;          // 防壁1枚あたりのHP
    intervalMs: number;      // 各発射台の射出間隔
    interceptorId: 'single_circle';  // 迎撃機（自機追尾）= 既存ENEMY_CONFIGS
    bomberId: 'suicide_bomber';      // 爆撃機（基地突撃）= 既存ENEMY_CONFIGS
}
```

`BattleshipConfig` に1行追加:
```ts
    cannon: WaveCannonConfig;
    launch: LaunchConfig;            // ← 追加
    reachBaseDamage: number;
```

`BOSS_CONFIG.battleship` に追加（`cannon` ブロックの後）:
```ts
        launch: {
            bayCount: 2,
            wallsPerBay: 2,
            bayHp: 60,
            wallHp: 40,
            intervalMs: 13000,
            interceptorId: 'single_circle',
            bomberId: 'suicide_bomber',
        },
```

- [ ] **Step 2: 型チェック**

Run: `npm.cmd run check`（tsc が通ること。テスト数は据え置き22）

---

## Task B2: LaunchBay 純ロジック（TDD）

**Files:** Create `src/game/bosses/LaunchBay.ts`, `src/game/bosses/LaunchBay.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`src/game/bosses/LaunchBay.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { LaunchBay } from './LaunchBay';

const cfg = { bayHp: 60, wallHp: 40, wallsPerBay: 2, intervalMs: 13000 };

describe('LaunchBay', () => {
    it('初期状態：防壁は生存・発射台は脆弱でない・生存', () => {
        const b = new LaunchBay(cfg);
        expect(b.isWallAlive(0)).toBe(true);
        expect(b.isWallAlive(1)).toBe(true);
        expect(b.isVulnerable()).toBe(false);
        expect(b.isBayAlive()).toBe(true);
    });

    it('防壁は個別HPで破壊。全破壊で発射台が脆弱化', () => {
        const b = new LaunchBay(cfg);
        b.damageWall(0, 40); // 0番破壊
        expect(b.isWallAlive(0)).toBe(false);
        expect(b.isVulnerable()).toBe(false); // まだ1番が生存
        b.damageWall(1, 20); // 部分ダメージ
        expect(b.isWallAlive(1)).toBe(true);
        b.damageWall(1, 20); // 残り20で破壊
        expect(b.isWallAlive(1)).toBe(false);
        expect(b.isVulnerable()).toBe(true);
    });

    it('発射台は脆弱化前は無敵、脆弱化後にHP0で破壊', () => {
        const b = new LaunchBay(cfg);
        b.damageBay(60);
        expect(b.isBayAlive()).toBe(true); // 防壁が残るので無効
        b.damageWall(0, 40); b.damageWall(1, 40);
        b.damageBay(59);
        expect(b.isBayAlive()).toBe(true);
        b.damageBay(1);
        expect(b.isBayAlive()).toBe(false);
    });

    it('射出タイマー：間隔到達で迎撃→爆撃を交互に返し、生存中のみ', () => {
        const b = new LaunchBay(cfg);
        expect(b.tickLaunch(12999)).toBeNull();
        expect(b.tickLaunch(1)).toBe('interceptor'); // 13000到達
        expect(b.tickLaunch(13000)).toBe('bomber');
        expect(b.tickLaunch(13000)).toBe('interceptor');
        // 破壊後は射出しない
        b.damageWall(0, 40); b.damageWall(1, 40); b.damageBay(60);
        expect(b.isBayAlive()).toBe(false);
        expect(b.tickLaunch(99999)).toBeNull();
    });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm.cmd test -- LaunchBay` → FAIL（モジュール未作成）

- [ ] **Step 3: 実装を書く**

`src/game/bosses/LaunchBay.ts`:
```ts
export type LaunchKind = 'interceptor' | 'bomber';

export interface LaunchBayParams {
    bayHp: number;
    wallHp: number;
    wallsPerBay: number;
    intervalMs: number;
}

/**
 * 戦艦の発射台1基＋それをガードする防壁群の純ロジック（Phaser非依存）。
 * 防壁を全破壊すると発射台が脆弱化し、破壊可能になる（破壊で射出停止）。
 * 生存中は intervalMs ごとに 迎撃機→爆撃機 を交互に射出する。
 */
export class LaunchBay {
    private bayAlive = true;
    private bayHpLeft: number;
    private readonly wallHpLeft: number[];
    private launchMs = 0;
    private launchCount = 0;
    private readonly params: LaunchBayParams;

    constructor(params: LaunchBayParams) {
        this.params = params;
        this.bayHpLeft = params.bayHp;
        this.wallHpLeft = Array.from({ length: params.wallsPerBay }, () => params.wallHp);
    }

    isWallAlive(index: number): boolean {
        return index >= 0 && index < this.wallHpLeft.length && this.wallHpLeft[index] > 0;
    }

    damageWall(index: number, dmg: number): void {
        if (!this.isWallAlive(index)) return;
        this.wallHpLeft[index] -= dmg;
    }

    /** 全防壁が破壊されると発射台が脆弱（破壊可能）になる。 */
    isVulnerable(): boolean {
        return this.wallHpLeft.every((hp) => hp <= 0);
    }

    damageBay(dmg: number): void {
        if (!this.bayAlive || !this.isVulnerable()) return;
        this.bayHpLeft -= dmg;
        if (this.bayHpLeft <= 0) this.bayAlive = false;
    }

    isBayAlive(): boolean {
        return this.bayAlive;
    }

    /** 生存中のみ。間隔到達で射出種別を返し、迎撃→爆撃を交互に切り替える。 */
    tickLaunch(deltaMs: number): LaunchKind | null {
        if (!this.bayAlive) return null;
        this.launchMs += deltaMs;
        if (this.launchMs >= this.params.intervalMs) {
            this.launchMs = 0;
            const kind: LaunchKind = this.launchCount % 2 === 0 ? 'interceptor' : 'bomber';
            this.launchCount++;
            return kind;
        }
        return null;
    }
}
```

- [ ] **Step 4: テスト通過を確認**

Run: `npm.cmd test -- LaunchBay` → PASS（5件）

- [ ] **Step 5: コミット**

```
git add src/game/bosses/LaunchBay.ts src/game/bosses/LaunchBay.test.ts src/game/configs/BossConfig.ts
git commit -m "feat(boss): LaunchBay 純ロジック+設定（防壁ガード/発射台破壊/交互射出）"
```

---

## Task B3: BattleshipState に bays を統合（TDD）

**Files:** Modify `src/game/bosses/BattleshipState.ts`, `src/game/bosses/BattleshipState.test.ts`

- [ ] **Step 1: 失敗するテストを追記**

`BattleshipState.test.ts` に追記（既存の import を流用。`cfg` は既存テストの BattleshipConfig を使う。launch を含むこと）:
```ts
it('bays: 設定数だけ生成され、防壁全破壊で発射台が破壊可能・破壊で射出停止', () => {
    const s = new BattleshipState(cfg); // cfg.launch = {bayCount:2, wallsPerBay:2, bayHp:60, wallHp:40, intervalMs:13000,...}
    expect(s.bayCount()).toBe(2);
    expect(s.bayVulnerable(0)).toBe(false);
    s.damageWall(0, 0, 40);
    s.damageWall(0, 1, 40);
    expect(s.bayVulnerable(0)).toBe(true);
    s.damageBay(0, 60);
    expect(s.isBayAlive(0)).toBe(false);
});

it('tickLaunches: 間隔到達で各生存発射台の射出指示を返す', () => {
    const s = new BattleshipState(cfg);
    expect(s.tickLaunches(13000)).toEqual([
        { bayIndex: 0, kind: 'interceptor' },
        { bayIndex: 1, kind: 'interceptor' },
    ]);
});
```

（注：既存 `BattleshipState.test.ts` は `const cfg = BOSS_CONFIG.battleship;` を参照しているため、B1 で `launch` を追加すれば自動的に含まれる。リテラルの手当ては不要。）

- [ ] **Step 2: 失敗を確認**

Run: `npm.cmd test -- BattleshipState` → FAIL（bayCount 等が未定義）

- [ ] **Step 3: 実装**

`BattleshipState.ts` の import 追加とフィールド/メソッド追加:
```ts
import { LaunchBay, type LaunchKind } from './LaunchBay';
```
クラス内（`private readonly cfg` の下）:
```ts
    readonly bays: LaunchBay[];
```
constructor 末尾:
```ts
        this.bays = Array.from({ length: cfg.launch.bayCount }, () =>
            new LaunchBay({
                bayHp: cfg.launch.bayHp,
                wallHp: cfg.launch.wallHp,
                wallsPerBay: cfg.launch.wallsPerBay,
                intervalMs: cfg.launch.intervalMs,
            }),
        );
```
メソッド追加:
```ts
    bayCount(): number { return this.bays.length; }
    isWallAlive(bi: number, wi: number): boolean { return this.bays[bi]?.isWallAlive(wi) ?? false; }
    damageWall(bi: number, wi: number, dmg: number): void { this.bays[bi]?.damageWall(wi, dmg); }
    bayVulnerable(bi: number): boolean { return this.bays[bi]?.isVulnerable() ?? false; }
    damageBay(bi: number, dmg: number): void { this.bays[bi]?.damageBay(dmg); }
    isBayAlive(bi: number): boolean { return this.bays[bi]?.isBayAlive() ?? false; }

    /** 全発射台の射出タイマーを進め、射出すべき {発射台index, 種別} を返す。撃破後は射出しない。 */
    tickLaunches(deltaMs: number): { bayIndex: number; kind: LaunchKind }[] {
        if (this.isDefeated()) return [];
        const out: { bayIndex: number; kind: LaunchKind }[] = [];
        this.bays.forEach((bay, bayIndex) => {
            const kind = bay.tickLaunch(deltaMs);
            if (kind) out.push({ bayIndex, kind });
        });
        return out;
    }
```

- [ ] **Step 4: 通過を確認**

Run: `npm.cmd test -- BattleshipState` → PASS（既存6＋新規2）

- [ ] **Step 5: コミット**

```
git add src/game/bosses/BattleshipState.ts src/game/bosses/BattleshipState.test.ts
git commit -m "feat(boss): BattleshipState に発射台群(bays)を統合＋テスト"
```

---

## Task B4: テクスチャ（発射台＝赤・防壁＝鋼色）

**Files:** Modify `src/game/visuals/GameTextures.ts`

- [ ] **Step 1: battleship_bay / battleship_wall を追加**

`battleship_cannon` 生成の直後（`bg.destroy()` の前）に追記。部位を色で区別する（機関=橙, 発射台=赤, 防壁=鋼色, 波動砲=シアン）:
```ts
        bg.clear();
        bg.fillStyle(0xdd2222, 1); bg.fillRoundedRect(0, 0, 30, 40, 5);
        bg.fillStyle(0xff6644, 1); bg.fillRoundedRect(6, 14, 18, 12, 3); // 射出口
        bg.generateTexture('battleship_bay', 30, 40); bg.clear();
        bg.fillStyle(0x8896aa, 1); bg.fillRoundedRect(0, 0, 22, 40, 3);
        bg.fillStyle(0xb8c4d8, 1); bg.fillRect(4, 4, 14, 32);
        bg.generateTexture('battleship_wall', 22, 40);
```
（`bg.destroy()` は既存のまま末尾に残す。生成は `if (!scene.textures.exists('battleship_hull'))` ブロック内＝Phase A と同じガード内に置くこと。）

- [ ] **Step 2: 型チェック**

Run: `npm.cmd run check`（緑のまま）

---

## Task B5: Battleship 実体に発射台/防壁を追加

**Files:** Modify `src/game/bosses/Battleship.ts`

- [ ] **Step 1: import / フィールド / オフセット / コールバック**

import に `LaunchKind` を追加:
```ts
import { BattleshipState } from './BattleshipState';
import type { LaunchKind } from './LaunchBay';
```
フィールド追加（`cannonGroup` の近く）:
```ts
    bays!: Phaser.Physics.Arcade.Group;
    walls!: Phaser.Physics.Arcade.Group;
```
コールバック追加（`onDefeated` の近く）:
```ts
    onLaunch?: (x: number, y: number, kind: LaunchKind) => void; // 発射台からの敵射出
```
部位オフセット追加（`engineOffsets` の下）。発射台は左右側面(±y)中央、防壁はその前後(±x)に配置:
```ts
    // 発射台（左右側面の中央）と、それを前後に挟む防壁2枚ずつ
    private readonly bayLayout = [
        { bay: { x: 0, y: 70 }, walls: [{ x: -45, y: 70 }, { x: 45, y: 70 }] },
        { bay: { x: 0, y: -70 }, walls: [{ x: -45, y: -70 }, { x: 45, y: -70 }] },
    ];
```

- [ ] **Step 2: spawn() で発射台/防壁スプライト生成**

`this.gfx = ...` の前に追記:
```ts
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
```

- [ ] **Step 3: update() で追従＋射出tick**

`this.drawCharge();` の直前に追記（機関追従と同じ回転式 `screenX = hull + cos*ox - sin*oy`, `screenY = hull + sin*ox + cos*oy`）:
```ts
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
```
ヘルパー追加（クラス内）:
```ts
    private findBaySprite(bayIndex: number): Phaser.Physics.Arcade.Sprite | undefined {
        return this.bays.getChildren().find(
            (c) => (c as Phaser.Physics.Arcade.Sprite).getData('bayIndex') === bayIndex,
        ) as Phaser.Physics.Arcade.Sprite | undefined;
    }
```

- [ ] **Step 4: 被弾メソッド（防壁・発射台）**

`damageEngine` の下に追記:
```ts
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

    /** 発射台への被弾（脆弱時のみ呼び出し側が保証）。破壊で射出停止＋スプライト除去。 */
    damageBay(bay: Phaser.Physics.Arcade.Sprite, damage: number): void {
        const bi = bay.getData('bayIndex') as number;
        this.state.damageBay(bi, damage);
        if (!this.state.isBayAlive(bi)) {
            this.explode(bay.x, bay.y, 16, 0xff5522);
            bay.destroy();
        }
    }
```

- [ ] **Step 5: destroyShip / teardown に発射台・防壁を含める**

`destroyShip()` の爆発列に追加（`boom(this.cannon);` の近く）:
```ts
        this.bays.getChildren().forEach((c) => boom(c as Phaser.Physics.Arcade.Sprite));
        this.walls.getChildren().forEach((c) => boom(c as Phaser.Physics.Arcade.Sprite));
```
`teardown()` に追加（機関の clear と同様）:
```ts
        if (this.bays) this.bays.clear(true, true);
        if (this.walls) this.walls.clear(true, true);
```

- [ ] **Step 6: 型チェック**

Run: `npm.cmd run check`（緑）

---

## Task B6: EnemySpawnManager に単機射出を追加

**Files:** Modify `src/game/EnemySpawnManager.ts`

- [ ] **Step 1: spawnFromLaunchBay を追加**

`spawnSuicideSquadron` の下に追記。SSOT に従い ENEMY_CONFIGS をそのまま適用（HP/速度/AIパターンを上書きしない）:
```ts
    /**
     * 戦艦の発射台から単機を射出する。
     * - interceptor: single_circle（自機追尾）
     * - bomber: suicide_bomber（基地突撃）
     * いずれも ENEMY_CONFIGS の値をそのまま適用する。
     */
    public spawnFromLaunchBay(x: number, y: number, kind: 'interceptor' | 'bomber'): void {
        const id = kind === 'interceptor' ? 'single_circle' : 'suicide_bomber';
        const config = ENEMY_CONFIGS[id];
        if (!config) return;
        const tex = kind === 'bomber' ? 'suicide_bomber' : 'enemy';
        const enemy = this.enemies.create(x, y, tex) as Phaser.Physics.Arcade.Sprite;
        if (!enemy) return;
        enemy.setScale(kind === 'bomber' ? 1.0 : 0.04);
        enemy.setBlendMode(Phaser.BlendModes.SCREEN);
        enemy.setData('enemyId', id);
        enemy.setData('hp', config.hp);
        enemy.setData('aiState', { pattern: config.aiPattern, speed: config.speed } as AIState);
        EventBus.emit('debug-log-add', {
            type: 'spawn',
            message: `[Spawn] 戦艦発射台から ${config.name} を射出`,
        });
    }
```

- [ ] **Step 2: 型チェック**

Run: `npm.cmd run check`（緑）

---

## Task B7: MainScene 統合（配線・コライダー・撤去）

**Files:** Modify `src/game/MainScene.ts`

- [ ] **Step 1: onLaunch を配線（spawnBattleship 内、onDefeated の近く）**

```ts
      boss.onLaunch = (x, y, kind) => this.spawnManager.spawnFromLaunchBay(x, y, kind);
```

- [ ] **Step 2: 発射台/防壁コライダーを battleshipColliders に追加**

`battleshipColliders` 配列（Phase A）の末尾に追加（cannonGroup コライダーの後）:
```ts
          // 防壁：全武器で破壊可（敵弾は除外）
          this.physics.add.collider(this.bullets, boss.walls, (b, w) => this.onBulletHitWall(boss, b, w), this.checkEnemyBulletHit, this),
          this.physics.add.collider(this.turretBullets, boss.walls, (b, w) => this.onBulletHitWall(boss, b, w), this.checkEnemyBulletHit, this),
          this.physics.add.collider(this.allyBullets, boss.walls, (b, w) => this.onBulletHitWall(boss, b, w), undefined, this),
          // 発射台：防壁全破壊後（脆弱時）のみダメージ（process で限定）。全武器可。
          this.physics.add.collider(this.bullets, boss.bays, (b, bay) => this.onBulletHitBay(boss, b, bay),
              (b, bay) => this.checkEnemyBulletHit(b, bay) && boss.getState().bayVulnerable((bay as Phaser.Physics.Arcade.Sprite).getData('bayIndex')), this),
          this.physics.add.collider(this.turretBullets, boss.bays, (b, bay) => this.onBulletHitBay(boss, b, bay),
              (b, bay) => this.checkEnemyBulletHit(b, bay) && boss.getState().bayVulnerable((bay as Phaser.Physics.Arcade.Sprite).getData('bayIndex')), this),
          this.physics.add.collider(this.allyBullets, boss.bays, (b, bay) => this.onBulletHitBay(boss, b, bay),
              (b, bay) => boss.getState().bayVulnerable((bay as Phaser.Physics.Arcade.Sprite).getData('bayIndex')), this),
```

- [ ] **Step 3: 被弾ハンドラを追加（onBulletHitCannon の下）**

```ts
  private onBulletHitWall(boss: Battleship, bullet: unknown, wall: unknown) {
      const b = bullet as Phaser.Physics.Arcade.Sprite;
      const w = wall as Phaser.Physics.Arcade.Sprite;
      if (!b.active || !w.active) return;
      const dmg = (b.getData('damage') as number) ?? 10;
      this.consumeBullet(b);
      this.triggerExplosion(b.x, b.y, 4, 0xb8c4d8);
      boss.damageWall(w, dmg);
  }

  private onBulletHitBay(boss: Battleship, bullet: unknown, bay: unknown) {
      const b = bullet as Phaser.Physics.Arcade.Sprite;
      const bs = bay as Phaser.Physics.Arcade.Sprite;
      if (!b.active || !bs.active) return;
      // process で脆弱性を確認済みだが、防御的に再確認
      if (!boss.getState().bayVulnerable(bs.getData('bayIndex') as number)) return;
      const dmg = (b.getData('damage') as number) ?? 10;
      this.consumeBullet(b);
      this.triggerExplosion(b.x, b.y, 6, 0xff5522);
      boss.damageBay(bs, dmg);
  }
```

- [ ] **Step 4: 型チェック＋テスト**

Run: `npm.cmd run check` → 緑（build+lint+テスト全通過）

- [ ] **Step 5: 実機スモーク（手動）**

dev サーバーでデバッグ→Wave5。期待: コンソールエラー0／戦艦側面に発射台2基＋防壁4枚が表示／約13秒ごとに敵が射出（迎撃機/爆撃機交互）。

- [ ] **Step 6: コミット**

```
git add src/game/visuals/GameTextures.ts src/game/bosses/Battleship.ts src/game/EnemySpawnManager.ts src/game/MainScene.ts
git commit -m "feat(boss): 発射台×2＋防壁×4＋射出敵(迎撃機/爆撃機)を統合"
```

---

## Task B8: 通信で発射台を誘導（任意・データ駆動）

**Files:** Modify `public/assets/data/default_scenario.json`

- [ ] **Step 1: wave5 の動的イベントか時間トリガーで1件追加**

既存 wave5 イベント（`wave5_start_2`）の後に、発射台に関する通信を1件追加（防壁→発射台の順序を案内）。`validateScenario`(zod) を通る形式（既存イベントと同じフィールド：id/targetWave/triggerType/triggerValue/hasTriggered/sender/senderName/message/avatarType/expression/uid）で記述する。例:
```json
{
  "id": "wave5_bays",
  "targetWave": "wave5",
  "triggerType": "time",
  "triggerValue": 12000,
  "hasTriggered": false,
  "sender": "operator",
  "senderName": "アルバイトのオペレーター",
  "message": "側面の発射台から増援が！ ガードの防壁を2枚とも壊せば発射台を潰せます。無視して機関を急ぐ手もありますが…！",
  "avatarType": "wave",
  "expression": "normal",
  "uid": "evt_phaseB_bays_0001"
}
```

- [ ] **Step 2: 検証**

Run: `npm.cmd run check`（JSON の zod 検証テストが通過すること）

- [ ] **Step 3: コミット**

```
git add public/assets/data/default_scenario.json
git commit -m "docs(boss): Wave5 発射台の誘導通信を追加（データ駆動）"
```

---

## 受け入れ条件
- `npm run check` 緑（build+lint+テスト。LaunchBay 5件＋BattleshipState 新規2件で合計29件前後）。
- 実機: 戦艦側面に発射台2基＋防壁4枚（色で機関と区別）。約13秒ごとに迎撃機/爆撃機を交互射出。防壁2枚破壊→発射台が破壊可能→破壊でその発射台の射出停止。Wave遷移/撃破でコライダー・スプライトが残らない（リーク無）。
- 既存戦闘（機関・波動砲・自機衝突・レーダー）に回帰なし。

## 実プレイ確認（必須・自動不可）
- 射出のテンポ（13秒×2基）が過剰でないか。
- 「防壁→発射台」の手順が直感的に分かるか（色・配置・通信）。
- 発射台を無視して機関→波動砲に直行する戦略が成立するか（増援に押し負けないか）。

## メモ / 既定判断
- 発射台はフェーズに関係なく**破壊されるまで射出継続**（「破壊で停止」のみ。波動砲フェーズでも増援が出る＝早期に潰す動機）。過剰なら intervalMs かフェーズ制限で調整。
- 爆撃機は単機（既存 spawnSuicideSquadron の護衛2機付き編隊ではなく、発射台射出は単機）。
- レーダーは現状の船体＋機関プロットのまま（発射台は船体ブリップ付近のため未追加。必要なら後日）。
