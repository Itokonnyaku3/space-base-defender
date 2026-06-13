# アーキテクチャ調査レポート＆リファクタリング計画

- **作成日**: 2026-06-13
- **作成者**: Claude (シニアゲームプログラマー視点でのコードレビュー)
- **対象**: space-base-defender 全ソースコード
- **読者**: 開発者本人、および並行開発する AI エージェント（Antigravity / Claude）

> このドキュメントは「何を・なぜ・どの順番で」直すかの合意文書です。
> 実装に着手する AI は、必ず該当 Phase の「受け入れ条件」を満たしてから完了を宣言してください。

---

## 1. 検証結果サマリー（2026-06-13 時点の事実）

| 項目 | 結果 | 詳細 |
|---|---|---|
| `npm run build` | **失敗** | TypeScript エラー 5件（下記 2.1） |
| `npm run lint` | **失敗** | 55 エラー |
| Git リポジトリ | **未初期化** | バージョン管理が存在しない（OneDrive 同期のみ） |
| 自動テスト | なし | テストランナー未導入 |
| `tsconfig` strict | **無効** | `strict: true` が設定されていない |
| AI_HANDOVER.md | **実態と乖離** | 「型検証エラーフリーで完全パス」と記載されているが実際は失敗する |

**重要**: `vite dev` は型チェックを行わない（esbuild が型を無視して変換する）ため、開発中は壊れたコードでも動いてしまう。これが「気づかないデグレ」の主因。

### 1.1 現状のモジュール構成

```
src/
  App.tsx                     (163行)  画面切替・デバッグUI
  components/
    PhaserGame.tsx            (45行)   Phaser起動・IME抑止
    CommunicationUI.tsx       (193行)  通信ダイアログ (React)
    RadarUI.tsx               (273行)  戦術レーダー (canvas)
    DebugLogUI.tsx            (162行)  イベントログ (React)
    ScenarioEditor.tsx        (1816行) シナリオエディタ
  game/
    MainScene.ts              (2855行) ★神クラス。後述の問題の中心
    ScenarioManager.ts        (408行)  シナリオ進行・Wave管理
    EnemySpawnManager.ts      (351行)  敵スポーン
    EventBus.ts               (2行)    Phaser.Events.EventEmitter
    ai/EnemyPatternDB.ts      (428行)  敵AIパターン (static switch)
    configs/                  Enemy/Turret/Weapon 設定
```

React UI 層（CommunicationUI / RadarUI / DebugLogUI）は EventBus 購読の解除も正しく、**健全**。
問題は `game/` 配下、特に `MainScene.ts` に集中している。

---

## 2. 発見した問題（重要度順）

### 2.1 【P0】ビルドが壊れている（即修正可能）

`npm run build` で発生する 5 エラー:

1. **`src/game/MainScene.ts:1095-1096, 1131-1132`** — `this.soundEffects` という存在しないプロパティを参照。
   `SoundEffects` は static クラスなので、正しくは `SoundEffects.playHit()`。
   **現状の実害**: `if (this.soundEffects)` が常に false → **基地被弾時の効果音が一切鳴っていない**（サイレント機能欠落）。
2. **`src/game/EnemySpawnManager.ts:126`** — `spawnScenarioEnemy()`（4引数）に 6 引数を渡している。
   125行目で計算した「輸送船後方の座標」は**渡しても使われない死に値**。wave2 分岐が内部で座標を再計算するため偶然動いているだけ。余剰引数 `x, y` を削除すれば解決。

同種の**型システムをすり抜けている同じバグ**:

3. **`src/game/ai/EnemyPatternDB.ts:511-512`** — `(scene as any).soundEffects` は常に undefined →
   **敵の射撃音が一切鳴っていない**。`as any` のせいで tsc も検出できない。

### 2.2 【P0】バージョン管理が存在しない

`git init` されていない。`.gitignore` は存在するのに使われていない。
**デグレ防止の最重要インフラが欠けている**。差分レビューも巻き戻しもできず、AI が壊した変更を特定する手段がない。

> 補足: OneDrive 配下での git は同期競合に注意（`.git` フォルダの同期は遅延・破損リスクがある）。
> 理想はプロジェクトを OneDrive 外（例: `C:\dev\`）へ移して git 管理し、リモート（GitHub private）をバックアップにする。
> 移動が難しければ OneDrive 内でも git init する方が「無し」より遥かに安全。

### 2.3 【P1】「データ駆動」の建前と実装の乖離（最大のデグレ温床）

AI_HANDOVER.md は「すべてのパラメータを完全に外出し管理 (No Hard-coding)」と宣言しているが、実態は以下の通り:

| 設定ファイル | 定義 | 実装の実態 |
|---|---|---|
| `WeaponConfig.ts` | `forward` / `mouse` の2武器 | **完全に未使用**（import されているだけ）。実際の武器は `long_range` / `machinegun` で、弾速 350/25・ダメージ 10/5・CT 5000/500ms・射程 4000/150px がすべて `MainScene.ts:754-771` に直書き |
| `TurretConfig.ts` | `fireRate: 500` / `bulletSpeed: 400` / `hp: 100` | 実装は 5000ms (`MainScene.ts:902`)・200 (`:901`)・hits 5 (`:801`)。**cost 以外ほぼ嘘の値** |
| `WaveConfig.rules` | `allowBoost` / `maxTurrets` / `maxRelays` | **どこにも実装がない**（grep で参照ゼロ）。シナリオ JSON は全 Wave `allowBoost: false` だがブーストは常に使える |
| `EnemySpawnManager.ts:86-94` のコメント | 湧き間隔 6/8/11/15/20 秒 | 実装は 9/12/16/22/28 秒（`:104-108`）。さらに AI_HANDOVER.md には 2.0〜7.0 秒と記載。**3つの異なる数字が併存** |

**なぜ致命的か**: AI エージェントは設定ファイルとコメントを「真実」として読む。
`TurretConfig.fireRate` を変更しても何も起きず、AI は「変更したのに効かない」状態から誤った推測で別の場所を壊し始める。**人間よりも AI 協働においてこそ、この乖離は危険**。

### 2.4 【P1】MainScene 神クラス（2855行・1ファイル3クラス）

`MainScene.ts` が抱えている責務:

入力処理 / プレイヤー移動・ブースト / 武器2種と弾道 / タレット設置・索敵・射撃 / 中継レーダー / 味方機AI（追従・指示・修理・撤退）/ 母船AI / 輸送船の移動・HPバー / 前哨基地の公転・湧き / 衝突ハンドラ15個 / Wave遷移 / HUD描画（ズーム逆算座標）/ レーダーデータ集計 / 星空生成 / 爆発エフェクト / 効果音(`SoundEffects`) / BGMシーケンサ(`MusicSynthesizer`)

→ 何を追加しても**このファイルを編集することになり**、コンフリクトとデグレの確率が要素数に比例して上がる。Claude と Antigravity が並行開発すると**ほぼ確実に同一ファイルを同時編集**することになる。

### 2.5 【P1】`as any` による裏口結合（11箇所）

`EnemyPatternDB` と `EnemySpawnManager` がシーンの private メンバへ型を欺いて侵入している:

- `(scene as any).enemies` — EnemyPatternDB.ts:101, 174, 272, 444
- `(scene as any).transportShip` — EnemyPatternDB.ts:265 / EnemySpawnManager.ts:344
- `(scene as any).turretBullets` — EnemyPatternDB.ts:496
- `(scene as any).soundEffects` — EnemyPatternDB.ts:511（2.1 の通り常に undefined）
- `(this.scene as any).scenarioManager` — EnemySpawnManager.ts:97, 189

→ MainScene 側のプロパティ名を変えると**コンパイルは通るのに実行時に静かに壊れる**。2.1 の「音が鳴らない」バグはまさにこのパターンの実害。

### 2.6 【P1】弾の陣営判定が「色」で行われている

- 全タレット弾・母船弾・敵機弾が**同一の `turretBullets` グループに同居**（MainScene.ts:1698, EnemyPatternDB.ts:496）
- 敵味方の識別が2方式併存:
  - `bullet.getData('isEnemyBullet')` フラグ（MainScene.ts:953-956）
  - **`bullet.tintTopLeft === 0xff3333`（色コード比較！）**（MainScene.ts:1210, 1288, 1315, 2267）

→ 弾の色を変えた瞬間に当たり判定ロジックが壊れる。「見た目」と「ロジック」が結合した典型的な事故ポイント。
さらに `updateBullets(turretBullets, 250)`（MainScene.ts:596）により、`maxRange` 未設定の母船弾は **250px で消える**。母船は基地から 800px に湧くため、実は接近するまで弾が届いていない（仕様かバグか不明な「暗黙の挙動」）。

### 2.7 【P1】ダメージ処理が15箇所にコピペ

`hitEnemy / hitPlayer / hitBase / hitBaseBullet / hitRelayEnemy / hitRelayBullet / hitRelayMothership / hitAllyEnemy / hitAllyBullet / hitPlayerBullet / hitTurretEnemy / hitMothership / hitOutpost / hitTransportEnemy / hitTransportBullet`

それぞれが「HP減算 → 赤フラッシュ → 爆発 → ログ → 死亡判定 → (個別処理)」をほぼ同じコードで再実装。
HP のデフォルト値も `|| 50` `?? 5` `|| 100` とバラバラ。ゲームオーバー処理も 6 箇所に重複（すべて `scene.pause()` のみで**リスタート不能**）。
→ 「ダメージ表示を追加したい」だけで15箇所の修正が必要になり、1箇所漏れる＝デグレ。

### 2.8 【P2】Wave 固有ロジックのハードコード

シナリオ JSON が Wave を定義しているのに、実際の挙動はコード内の数値分岐に散らばっている:

- `handleWaveTransition` の if/else 連鎖（MainScene.ts:1840-1904）
- `currentWave === 1` で前哨基地が公転（MainScene.ts:613-628）※`activeOutpostAngle` がグローバル共有のため、複数基地だと回転速度が基地数倍になる潜在バグあり
- `currentWave <= 3` でレーダー常時表示（MainScene.ts:1969）
- `currentWave >= 3` でドック回復解禁（MainScene.ts:559）
- Wave ID が **MainScene では数値（`currentWave: 2`）、ScenarioManager では文字列（`'wave2'`）の二重表現**。`advanceWave` は `'waveN'` という命名規則の parseInt に依存（ScenarioManager.ts:275）

→ Wave 6 を追加するには複数ファイルの分岐をすべて見つけて回る必要がある。

### 2.9 【P2】EventBus の運用リスク

- `EventBus.off('イベント名')` を**ハンドラ指定なし**で呼んでいる（MainScene.ts:367,372,377,382 / ScenarioManager.ts:116,122,128）。これは**そのイベントの全リスナーを消す**。現在は購読者が1つだから動いているだけで、購読者を増やした瞬間に「他人のリスナーを消す」事故になる。
- イベント名が裸の文字列、ペイロード型もない。タイポしても気づけない。
- 通信のロック解除が `setTimeout(5500)` 固定（ScenarioManager.ts:359,448）、一方 UI 側の表示は「タイピング30ms/文字 + 5000ms」（CommunicationUI.tsx:32,95）と**別ロジックで二重管理**。長文セリフだと UI が出ている間に次のイベントが詰まる。

### 2.10 【P2】その他

- `sendRadarData` が毎フレーム配列を再構築し `setTimeout(0)` で emit（MainScene.ts:2035）— GC 負荷。100ms スロットリングで十分
- スラスター粒子が毎フレーム `create/destroy`（MainScene.ts:2046）— プール化推奨
- `localStorage` シナリオの新旧判定が「wave3 があるか」という暗黙ルール（ScenarioManager.ts:141-149）— `schemaVersion` フィールドを持つべき
- `vite.config.ts` の `/api/save-scenario` が**無検証で** JSON をファイルへ書き込む — エディタのバグがそのまま「正」のシナリオを破壊し得る
- `dist/` 内の `default_scenario.json`(9.5KB) と `public/` の同名ファイル(15.1KB) が既に乖離 — ビルド成果物を管理対象から外す（git 導入時に `.gitignore` 済みなので自然解決）
- ワールドサイズ 6000 が MainScene / RadarUI / EnemySpawnManager に散在する直書き定数

---

## 3. 目標アーキテクチャ

### 3.1 設計原則（3つだけ）

1. **Single Source of Truth**: 数値は configs/ だけに存在する。コード直書き・コメント記載・ドキュメント転記を禁止し、「設定を変えれば必ず挙動が変わる」状態を保証する。
2. **システム分割**: MainScene は「組み立てと毎フレームの呼び出し順」だけを持つ。各機能は `systems/` の独立クラスにし、依存は**明示的な Context オブジェクト**経由でのみ渡す（`as any` 全廃）。
3. **イベントの型付け**: EventBus のイベント名とペイロードを1ファイルで定義し、emit/on をラップして型チェックを効かせる。

### 3.2 目標ディレクトリ構成

```
src/game/
  core/
    constants.ts        WORLD_SIZE, BASE_POS などの共有定数
    GameEvents.ts       イベント名とペイロード型のカタログ + 型付き emit/on/off
    EntityData.ts       sprite.getData の文字列キーを型付きアクセサに一元化
  audio/
    SoundEffects.ts     （MainScene.ts 末尾から移設）
    MusicSynthesizer.ts （同上）
  visuals/
    ProceduralTextures.ts  preload のテクスチャ生成を移設
    Starfield.ts           星空生成を移設
    Effects.ts             爆発・ヒットフラッシュ・シェイク
  systems/
    PlayerSystem.ts     移動・ブースト・射撃
    TurretSystem.ts     タレット索敵・射撃・設置
    AllySystem.ts       味方機AI・指示・修理
    HealthSystem.ts     ★ダメージ・死亡・ゲームオーバーの一元化
    BulletSystem.ts     ★陣営別の弾生成・寿命管理
    RadarSystem.ts      視界集計・radar-update 送信
  ai/
    EnemyPatternDB.ts   switch → パターン登録制(registry)へ
  scenario/
    ScenarioManager.ts
    ScenarioSchema.ts   zod による実行時バリデーション（エディタ保存/読込の両方で使用）
  configs/              （現行を実装と一致させる）
  scenes/
    MainScene.ts        組み立てのみ（目標: 300行以下）
    UIScene.ts          HUD専用シーン（ズーム逆算ハックの廃止）
    GameOverScene.ts    リスタート可能に
```

### 3.3 キーパターンのコード例

**(a) Context オブジェクト — `as any` の根絶**

```typescript
// core/CombatContext.ts
export interface CombatContext {
  readonly player: Phaser.Physics.Arcade.Sprite;
  readonly base: Phaser.Physics.Arcade.Sprite;
  readonly enemies: Phaser.Physics.Arcade.Group;
  readonly transportShip: Phaser.Physics.Arcade.Sprite | null;
  fireBullet(opts: { faction: Faction; x: number; y: number;
                     angle: number; speed: number; damage: number;
                     maxRange?: number; tint: number }): void;
}
// EnemyPatternDB.execute(enemy, ctx, time) — scene を渡すのをやめる
```

**(b) 陣営（Faction）モデル — 色判定の根絶**

```typescript
// core/EntityData.ts
export type Faction = 'player' | 'ally' | 'enemy';
export const setFaction = (s: Sprite, f: Faction) => s.setData('faction', f);
export const getFaction = (s: Sprite): Faction => s.getData('faction') ?? 'enemy';
// 衝突フィルタは getFaction() === 'enemy' で判定。tintTopLeft 比較は全削除
```

**(c) HealthSystem — 15箇所のコピペの集約先**

```typescript
// systems/HealthSystem.ts
export function applyDamage(target: Sprite, amount: number, opts?: { flashTint?: number }) {
  const hp = getHp(target) - amount;
  setHp(target, hp);
  flashAndLog(target, amount);          // フラッシュ・ログは1実装に
  if (hp <= 0) emit('entity-destroyed', { target, entityKind: getKind(target) });
}
// 死亡時の個別処理（スコア加算・Wave進捗・スコードロン分裂）は
// 'entity-destroyed' の購読側に書く。衝突ハンドラは「applyDamage を呼ぶだけ」になる
```

**(d) 型付きイベント — タイポと off() 事故の根絶**

```typescript
// core/GameEvents.ts
export interface GameEventMap {
  'radar-update': RadarData;
  'scenario-trigger': ScenarioEvent;
  'scenario-action-execute': ScenarioAction;
  'wave-changed': string;
  'debug-log-add': { type: LogType; message: string };
  // ... 全イベントをここに列挙
}
export function on<K extends keyof GameEventMap>(e: K, fn: (p: GameEventMap[K]) => void) { ... }
export function off<K extends keyof GameEventMap>(e: K, fn: (p: GameEventMap[K]) => void) { ... }
// off はハンドラ必須にして「全消し」をコンパイルエラーにする
```

**(e) AI パターンの登録制 — Open/Closed**

```typescript
// ai/patterns/suicideRush.ts
registerPattern('suicide_rush', (enemy, ctx, state, time) => { ... });
// 新パターン追加 = 新ファイル追加。既存ファイルに触れない
```

---

## 4. 段階的リファクタリング計画

> **鉄則**: 1 Phase = 1 コミット系列。各 Phase 完了時に必ず
> ① `npm run check` パス ② Wave1〜5 の通しプレイ確認 ③ 本ドキュメントの進捗欄更新
> を行ってから次へ進む。**Phase をまたいだ「ついで修正」を禁止**（デグレ検出が不能になるため）。

### Phase 0: 安全網の構築（最優先・半日）✅ 完了 2026-06-13
- [x] `git init`（main）→ ベースライン（修正前）と Phase 0 修正を別コミットで記録
- [x] ビルド修正（2.1 の5エラー）:
  - [x] `this.soundEffects` 4箇所 → `SoundEffects.playHit()`（static）へ。**基地被弾音が復活**
  - [x] `EnemySpawnManager.ts:126` の余剰引数 `x, y` を削除（内部で再計算されるため挙動不変）
  - [~] `EnemyPatternDB.ts:511-512` → 常に undefined の死にコードを**除去**。
        本来の発射音の復元は循環参照を避けるため **Phase 1（SoundEffects のモジュール化）へ持ち越し**
- [x] `package.json` に `"check": "tsc -b && eslint ."` を追加
- [x] AI_HANDOVER.md の虚偽記載（「エラーフリー」）を修正

**受け入れ条件**: `npm run build` 成功 / `git log` に履歴が存在 → **両方達成**
**残課題**: `npm run lint` は 53 エラー（着手前 55 から減）。Lint/strict 化は Phase 2 で対応。
従って現状 `npm run check` はビルド成功・Lint 失敗のレッド状態。

### Phase 1: 機械的なファイル分割（挙動不変）✅ 完了 2026-06-13
- [x] `SoundEffects` / `MusicSynthesizer` を `src/game/audio/` へ移設（計439行）
- [x] テクスチャ生成（preload 内）を `visuals/GameTextures.ts`、星空生成を `visuals/Starfield.ts` へ移設
- [x] `core/constants.ts` を作成（`WORLD_SIZE` / `WORLD_CENTER`）。MainScene の `6000` リテラル（境界・弾範囲）と基地/自機の初期座標 `3000` を定数化
- [x] **（Phase 0 持ち越し）敵の発射音を復元**: `EnemyPatternDB` が `audio/SoundEffects` を import（循環参照なし）し `playMachinegun()` を発火

**受け入れ条件と結果**:
- プレイ感が完全に不変 → ✅ すべて挙動保存の移動（コードは verbatim、`6000`/`3000` は同値の定数に置換）。`tsc` グリーン、dev サーバーで Phaser が正常起動・コンソールエラーゼロを確認。
- MainScene.ts 行数 → **2855 → 2206 行（-23%）**。当初目標「2000行未満」には未達だが、これは純粋に機械的・低リスクで切り出せる関心事（audio/visuals）を出し切った結果。残りの削減（HUD の `UIScene` 化・戦闘系の `systems/` 化）は**ロジック分離を伴うため Phase 3 で実施**し、2000行未満はその達成目標へ繰り下げる。
- 副次効果: `as any` を 2 件削減済み（Lint 55→53）。新規ファイル（GameTextures/Starfield/constants）は Lint エラーゼロ。

### Phase 2: 型基盤の導入 ✅ 核は完了 2026-06-13
- [x] **型付きイベント**: `core/GameEvents.ts` を新設する代わりに、**`EventBus.ts` 自体を型付きファサードに置換**（低チャーンで全呼び出し側をその場で型チェック）。`GameEventMap`（13イベント）でイベント名・ペイロードをカタログ化。`RadarData`/`DebugLogPayload` 等の共有型も集約し、`RadarUI` は重複定義を削除して import。
- [x] **off() の全消し事故を防止**: `off(event, fn)` をハンドラ必須にし、意図的な全消しは `removeAll(event)` に分離（§2.9/§3.3 の方針）。無ハンドラ off 9箇所を `removeAll` に変換。
- [x] **strict 化**: `tsconfig.app.json` に `"strict": true`。事前調査どおりエラー0件でビルド成功（既存コードが `!`/`as` で型を抑止していたため）。
- [ ] **`EntityData` アクセサ → Phase 3 へ移動**: `getData('hp')` 等の置換は、戦闘コード全体への高チャーン変更。これらの直書きは `as number` 等で Lint には影響せず、かつ本環境では戦闘全経路を実機自動検証できない。**Phase 3 の `CombatContext`/`systems` 分離と同じ変更・同じ検証でまとめて行う**方が安全なため移動。

**受け入れ条件と結果**:
- `EventBus.emit` の生文字列呼び出しが残存ゼロ → ✅ 全 emit/on/off が型付き `EventBus` 経由（イベント名は `GameEventMap` のキーで型チェック）。
- strict でビルド成功 → ✅ `npm run build` グリーン。
- 実機検証: dev サーバーでポーズ往復（React→Phaser→React の emit/on）が新ファサード経由で成立、コンソールエラーゼロ。
- 補足: Lint は 53 件のまま（型付きイベントは `as any` を使わない設計だが、既存の `as any` は別箇所＝`ScenarioEditor` の React/any と `scene as any` 11箇所。後者は Phase 3 の型付き Context 導入で解消、前者は別途 Lint 一掃タスクとする）。

### Phase 3: 戦闘系の統合（2〜4日）
- [ ] `core/EntityData.ts`（Phase 2 から移動）: hp/maxHp/faction/aiState/enemyId 等の型付きアクセサを導入し、`getData('hp')` 直書きを置換。戦闘系の分離と同時に行い、まとめて検証する
- [ ] `BulletSystem`: 陣営別グループ（friendlyBullets / enemyBullets）へ再編。`fireBullet()` ファクトリ一本化。tint 比較による判定を全廃
- [ ] `HealthSystem`: 15個の hit ハンドラを `applyDamage()` + `entity-destroyed` イベントへ集約
- [ ] `CombatContext`（型付き）を導入し、`EnemyPatternDB`/`EnemySpawnManager` の `scene as any` 11箇所を解消（→ Lint も大きく減る）
- [ ] 衝突登録を宣言的なテーブル（どのグループ×どのグループ→どの処理）に変換
- [ ] `GameOverScene` を追加し、`triggerGameOver()`（現状は `scene.pause()` のみ）を「game-over イベント発火」に統一（リスタート実装）

**受け入れ条件**: `tintTopLeft` の grep がゼロ / hit 系メソッドが3個以下 / `scene as any` がゼロ / ゲームオーバーからリスタート可能

### Phase 4: 設定とWaveの Single Source of Truth 化（2日）
- [ ] `WeaponConfig` を実装と一致させ（long_range / machinegun）、MainScene の直書きパラメータを移管
- [ ] `TurretConfig` の値を実装と一致させ、コードは config を参照
- [ ] `WaveConfig.rules` の未実装ルール（allowBoost / maxTurrets / maxRelays）を**実装するか削除するか決めて**どちらかに倒す
- [ ] Wave 固有挙動（公転 / レーダー常時表示 / ドック回復）を `WaveConfig.rules` のフラグへ移す
- [ ] Wave ID を文字列に統一（MainScene の `currentWave: number` を廃止）
- [ ] EnemySpawnManager のコメントと AI_HANDOVER の数値記載を削除し「config 参照」に書き換え

**受け入れ条件**: 「config の数値変更だけ」で武器CT・タレット連射・湧き間隔が変わることを実プレイで確認

### Phase 5: テスト導入（1〜2日）
- [ ] `vitest` を devDependencies に追加
- [ ] `EventBus` を Phaser 非依存の軽量 EventEmitter に差し替え（ScenarioManager を Node 単体でテスト可能にする）
- [ ] 優先テスト対象（純ロジックで費用対効果が高い順）:
  1. `ScenarioManager`: トリガー条件（time/points/hp）、Waveクリア条件、フラグ分岐、forceSetWave
  2. `EnemySpawnManager.getSpawnDelay` / スポーン座標クランプ
  3. `ScenarioSchema`（zod）: エディタ JSON の検証（壊れたデータを保存・読込の両方で弾く）

**受け入れ条件**: `npm test` がグリーン / シナリオ JSON を意図的に壊すとロード時に明確なエラーが出る

---

## 5. AI 協働開発（Claude × Antigravity）の運用ルール提案

並行開発で最も危険なのは「**2つの AI が異なる前提を信じる**」こと。以下を推奨する:

1. **`AGENTS.md` をリポジトリ直下に作成**し、両エージェント共通の規約を1箇所に置く（Antigravity・Claude Code とも読み取り対応）。`CLAUDE.md` は `@AGENTS.md` を参照するだけの薄いファイルにする。
   記載すべき規約:
   - 作業開始時: `git pull`（リモート導入後）→ `npm run check` で現状確認
   - 作業終了時: `npm run check` パス → コミット → AI_HANDOVER.md の「現在地」更新
   - **数値パラメータは configs/ 以外に書かない。コメントやドキュメントに具体値を転記しない**（参照先を書く）
   - 1機能1コミット。コミットメッセージが引き継ぎログを兼ねる
2. **AI_HANDOVER.md の役割を縮小**: 「現在地・次のタスク・既知の問題」だけにする。仕様の数値や挙動の説明は configs / 本ドキュメント / コードへのリンクで代替（今回の調査で、数値転記が3箇所で食い違う実害を確認済み）
3. **ドキュメントの鮮度ルール**: コードを変えたら同じコミットで関連ドキュメントを直す。直せない場合は該当記述を削除する（「古い正確なドキュメント」より「無いこと」の方が安全）

---

## 6. 進捗トラッキング

| Phase | 状態 | 完了日 | 担当 | 備考 |
|---|---|---|---|---|
| 0 安全網 | ✅ 完了 | 2026-06-13 | Claude | build 復旧・git 開始・check 追加。敵発射音の復元のみ Phase 1 へ |
| 1 ファイル分割 | ✅ 完了 | 2026-06-13 | Claude | audio/visuals/constants 分離。MainScene 2855→2206行。敵発射音を復元。2000行未満は Phase 3 へ |
| 2 型基盤 | ✅ 核は完了 | 2026-06-13 | Claude | 型付きEventBus(13イベント)+off安全化+strict化。EntityData は Phase 3 へ移動。Lint 53 据置 |
| 3 戦闘系統合 | 未着手 | - | - | EntityData アクセサ・CombatContext(scene as any 解消) を含む |
| 4 設定一元化 | 未着手 | - | - | |
| 5 テスト | 未着手 | - | - | |
