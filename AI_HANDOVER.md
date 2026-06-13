# 宇宙基地防衛シューティング AI引継ぎドキュメント

## プロジェクト概要
- **ジャンル**: 見下ろし型全方位スクロールシューティング ＋ タワーディフェンス要素
- **プラットフォーム**: Webブラウザ
- **技術スタック**: React + Vite + TypeScript (フロントエンド/UI) + Phaser.js (ゲームエンジン部分)

## 要件・仕様メモ
1. **コアゲームプレイ**: 
   - プレイヤーは宇宙基地に所属。本国の援軍が来るまで基地を防衛する。
   - ボスコニアンのような全方位スクロール。
   - **移動方式**: アステロイド方式（慣性移動）。A/Dで旋回、Wで前進加速、Sで減速。全体の動作スピードは遅め。
   - **武器**: マウス方向に撃つ武器と、機体の進行方向に撃つ武器を切り替え可能。
   - **射撃操作**: マウスクリックだけでなく、キーボードの **Zキー** または **Jキー** でも連射可能。
   - 基地周辺に自動迎撃装置（タレット）を設置可能。
   - タレットや武器（ホーミング等）、レーダー機能の追加条件（ストーリー進行かポイント購入か）は未定。
   - **入力方式**: ゲーム操作に集中できるよう、IME（日本語入力）の自動無効化処理を適用済み。
2. **ストーリー・通信要素**:
   - リアルタイムで進行する通信UI（スターフォックス風）。
   - 途中で救難信号などを受信し、プレイヤーの選択（助ける/助けない）によって状況が変化するフラグ管理。

## 現在の進捗・決定事項
- 【2026/05/31】: プロジェクト企画案を承認。Web版として開発を進めることを決定。
- React + Vite + Phaser.js のプロジェクト初期化が完了。
- Phase 1 & 2 の基礎防衛シューティング要素を実装済み。
- ユーザーフィードバックに基づく最終チューニング（超低速化、Drag 10による無重力ドリフト、Z/Jキーによるキーボード射撃、compositionstart を用いた完璧なブラウザIME抑止）を適用。
- **Phase 3 (通信UIとストーリー選択) 完了**:
  - `EventBus` による Phaser ⇄ React 連携の構築。
  - `ScenarioManager` によるデータ駆動型シナリオ処理（味方機・敵母船のアクション対応）の実装。配列内の順序変更だけでイベントの流れを自在に入れ替え可能。
  - `CommunicationUI` によるスターフォックス風のSF透過ダイアログ（ガラスモルフィズム、音声波形アニメーション、Y/Nキー選択、タイピング効果）の実装。
  - **即時アクション発火 & 日本語化対応の徹底**:
    - ユーザーが選択肢を押した **「その瞬間」に即座にスポーンアクションが実行される** ように変更し、出現ラグ問題を完全に解決。
    - シナリオの通信セリフ、選択肢、キャラクター名、およびゲーム内UI表示（武器・ポイント・タレット配置案内など）をすべて緊迫感溢れるSF風の **「日本語」** に統一。
  - （※当時の記録。その後の追加開発でビルド・Lintは破綻しており、2026/06/13 の Phase 0 でビルドのみ復旧。Lintは未解消。下記「Phase 0」参照）

- **Phase 4 (データ駆動オブジェクト化 ＆ 敵前線基地システム) 完了**:
  - **完全オブジェクトデータ化 (No Hard-coding)**:
    - 自機武器 (`WeaponConfig.ts`)、タレット性能 (`TurretConfig.ts`)、一般敵・母船・前線基地の性能 (`EnemyConfig.ts`) を新規作成し、すべてのパラメータを完全に外出し管理。
  - **敵前線基地 (Enemy Outposts) システム**:
    - 広大なマップの四隅にマゼンタ色の高耐久インフラ「前線基地 (HP 250, 撃破200pt)」を物理実体化。
    - 各前線基地は生存している間、定期的に敵戦闘機ウェーブを生産・進軍させる（間隔は `configs/SpawnConfig.ts` 参照）。
  - **前哨基地破壊による敵攻勢のリアルタイム弱体化**:
    - 生存している前線基地の数に応じて、敵全体の湧き間隔を動的に緩和。四隅の基地を強襲・制圧することで戦局を有利にする戦術性を再現。**具体的な間隔値は `configs/SpawnConfig.ts`（単一情報源）を参照**（※以前ここに記載していた「2.0秒〜」等の数値は実装と食い違っていたため削除）。

## フェーズとタスク状況
### Phase 1: 基礎プロトタイプ (完了)
- [x] プロジェクト初期化
- [x] 自機の移動と射撃
- [x] 敵機の生成と当たり判定

### Phase 1.5: 操作系・武器の改修 (完了)
- [x] 移動を慣性＋旋回方式に変更
- [x] ゲームスピードの低下調整
- [x] 武器切り替えと2種類の射撃方式の実装

### Phase 2: 基地防衛要素 (完了)
- [x] 宇宙基地の配置とHP設定
- [x] 敵が基地を狙うAIの実装
- [x] 防衛タレットの配置機能とコスト・自動迎撃の実装

### Phase 2.5: フィードバック反映 & チューニング (完了)
- [x] ゲームスピードの更なる低下（プレイヤー最大速度 70、敵速度 18、弾速等もマイルドに）
- [x] 基本動きっぱなしの無重力ドリフト（Drag 10に設定）
- [x] ZキーおよびJキーによる射撃の追加（キーボードのみでの操作に対応）
- [x] `compositionstart` の `preventDefault()` 阻止、HTML属性、CSS等によるIME無効化

### Phase 3: 通信UIとストーリー選択 (完了)
- [x] 通信UI（管制官や宇宙船船長との会話ウィンドウ）の作成
- [x] リアルタイムストーリー分岐、フラグ管理の実装
- [x] シナリオのデータ駆動化、味方機や敵母船のスポーンアクション対応の設計

### Phase 4: データ駆動オブジェクト化 ＆ 敵前線基地システム (完了)
- [x] 自機武器、タレット性能、敵ステータスをConfigオブジェクトに完全移行
- [x] 4箇所の敵前哨基地の配置および10秒ごとの敵生産機能の実装
- [x] 基地破壊に伴う敵通常出現ペースの動的緩和・弱体化アルゴリズムの実装

### Phase 5: 戦術ミニマップ（レーダー）と中継器の防衛 (完了)
- [x] 画面上へのリアルタイムミニマップ（レーダーUI）の追加
- [x] 中継基地・前哨基地・自機・敵機の位置プロット
- [x] 索敵範囲（戦霧 - Fog of War）の導入と中継インフラ防衛ミッションの構築

## 【2026/06/13】アーキテクチャ調査・改善計画の策定（Claude による全コードレビュー）
- **必読**: 調査結果と段階的リファクタリング計画 → `docs/ARCHITECTURE_REVIEW.md`
- **必読**: ゲーム性向上のアイデア提案と推奨着手順 → `docs/GAME_DESIGN_IDEAS.md`
- **注意**: 本ドキュメント内の具体的な数値（湧き間隔など）はコードと食い違っているものがある。パラメータの真実は `src/game/configs/` とコードを参照すること（詳細は ARCHITECTURE_REVIEW.md §2.3）。

## 【2026/06/13】Phase 0: 安全網の構築 完了
> リファクタリング計画（ARCHITECTURE_REVIEW.md §4）の最初のステップを実施。
- **Git 管理を開始**: `git init`（main ブランチ）。まず修正前の現状をベースラインとしてコミット、続いて下記の修正を別コミットで記録。
  - ※ 本プロジェクトは OneDrive 配下のため、`.git` の同期競合・破損リスクに注意（理想は OneDrive 外への移動 ＋ GitHub private へのバックアップ）。
- **ビルドを復旧**（`npm run build` が成功するようになった）:
  - `MainScene.ts`: 存在しない `this.soundEffects` 参照4件を `SoundEffects.playHit()`（static）へ修正。**これにより今まで鳴っていなかった基地被弾音が復活**。
  - `EnemySpawnManager.ts:126`: `spawnScenarioEnemy()` への引数過多（余剰な x, y）を削除（内部で再計算されるため挙動は不変）。
  - `EnemyPatternDB.ts`: 常に undefined だった `(scene as any).soundEffects` の死にコードを除去（敵の発射音は元々無音だった）。
    - **TODO（Phase 1へ持ち越し）**: `SoundEffects` を `audio/` へ独立モジュール化した後、循環参照なしに import して**敵の発射音を本来あるべき形で復元**する。
- **`npm run check`** スクリプトを追加（`tsc -b && eslint .`）。今後はコミット前にこれを実行する運用。
- **既知の残課題**:
  - `npm run lint` は **53 エラー**（Phase 0 着手前の 55 から、`as any` 除去で 2 減）。内訳は `no-explicit-any`・未使用変数など既存のもの。**Lint と TypeScript strict 化は Phase 2 で対応予定**。
  - `npm run check` は上記 Lint エラーのため現状レッド（ビルドステップは成功、Lint ステップで失敗する状態）。

## 【2026/06/13】Phase 1: 機械的ファイル分割（挙動不変） 完了
> MainScene 神クラスから、ゲームロジックと無関係な関心事を独立モジュールへ切り出した。すべて挙動保存の移動。
- **新規モジュール**:
  - `src/game/audio/SoundEffects.ts` … 効果音（旧 MainScene 末尾の static クラスを移設）
  - `src/game/audio/MusicSynthesizer.ts` … BGMシーケンサ（同上）
  - `src/game/visuals/GameTextures.ts` … `createGameTextures(scene)`（旧 preload のテクスチャ生成）
  - `src/game/visuals/Starfield.ts` … `createStarfield(scene)`（星空生成）
  - `src/game/core/constants.ts` … `WORLD_SIZE`(6000) / `WORLD_CENTER`(3000)
- **MainScene**: 上記を import して呼び出すだけに。**2855 → 2206行（-23%）**。`6000`/基地・自機座標`3000` を定数へ置換。
- **敵の発射音を復元**（Phase 0 持ち越し分）: `EnemyPatternDB` が `audio/SoundEffects` を循環参照なしに import し `playMachinegun()` を発火。
- **検証**: `npm run build` グリーン。dev サーバーで Phaser 正常起動・コンソールエラーゼロを確認（描画スクショは WebGL canvas のため取得不可＝ツール制約。簡単な実機プレイ確認を推奨）。Lint は 53 のまま（新規ファイルはエラーゼロ）。
- **次のステップ**: Phase 2（型付きイベント `core/GameEvents.ts`・`EntityData` アクセサ・TypeScript strict 化 + Lint 一掃）。`MainScene` の 2000行未満化は HUD の UIScene 化を行う Phase 3 で達成予定。

## 【2026/06/13】ポーズ機能を追加（リファクタとは独立した機能追加）
- **操作**: `P`キー、または画面右上の「⏸ 一時停止 / ▶ 再開」ボタン（App.tsx）でトグル。
- **挙動**: `MainScene` で `this.scene.pause()/resume()`（update・物理・タイマーを凍結）＋ `MusicSynthesizer.pausePlayback()/resumePlayback()` でBGM停止/再開 ＋ 中央に半透明オーバーレイ表示。
- **設計上の要点**:
  - ポーズ中は `scene.update` が止まるため、**復帰キーは window の keydown リスナーで拾う**（`setupPauseControls`）。React ボタンは EventBus `toggle-pause` 経由（EventBus コールバックはシーン停止中も発火する）。
  - ゲームオーバー処理を `triggerGameOver()` に集約（`isGameOver` フラグ）し、**ゲームオーバー中は P を無効化**して誤復帰を防止。
  - Phaser↔React の状態同期は `pause-state-changed` イベント（Pキー操作でもボタン表示が追従）。
- **検証**: `npm run build` グリーン。dev サーバーで実機検証済み（Pキー双方向トグル・ボタン双方向トグル・状態同期・コンソールエラーゼロを DOM 操作で確認）。

## 【2026/06/13】Phase 2: 型基盤の導入（核は完了）
- **型付きイベント**: `EventBus.ts` を**型付きファサード**に置換（`core/GameEvents.ts` は新設せず、低チャーンで全呼び出し側をその場で型チェック）。
  - `GameEventMap` に全13イベントのペイロード型を集約。イベント名タイポ・不正ペイロードがコンパイルエラーに。
  - 共有型 `RadarData`/`RadarEntity`/`VisionCircle`/`DebugLogPayload`/`LogType` も `EventBus.ts` に集約（`RadarUI` は重複定義を削除して import）。
  - `off(event, fn)` はハンドラ必須化、意図的な全消しは `removeAll(event)` に分離（無ハンドラ off 9箇所を変換）。
- **strict 化**: `tsconfig.app.json` に `"strict": true`。エラー0件でビルド成功。
- **検証**: `npm run build` グリーン。dev サーバーでポーズ往復（React↔Phaser の emit/on）が新ファサード経由で成立・コンソールエラーゼロを確認。
- **Phase 3 へ移動した項目**: `EntityData` アクセサ（`getData('hp')` 置換）は戦闘コードへの高チャーン変更のため、Phase 3 の戦闘系分離・`CombatContext` 導入と同じ変更・同じ検証でまとめて行う。
- **既知の残課題**: Lint は 53 件のまま（主因は `ScenarioEditor` の React/any と `scene as any` 11箇所）。`scene as any` は Phase 3 の `CombatContext` で解消予定。

## 【2026/06/13】Phase 4: 設定の単一情報源化（チューニング値は完了）
- **武器**: `WeaponConfig.ts` を実装と一致するよう全面改訂（long_range/machinegun。CT・威力・射程・弾速・加速・tint・音）。MainScene の発射処理・加速処理・CTゲージ・UI名を config 参照に。
- **タレット**: `TurretConfig.ts` の嘘の値（fireRate 500→**5000**、bulletSpeed 400→**200**、hp→**maxHits 5**）を実装に合わせて是正。MainScene の射程・連射・弾速・耐久・照準誤差・tint を config 参照に。
- **湧き間隔**: `SpawnConfig.ts` を新設（基地数別 9/12/16/22/28秒・wave2=14秒・前哨射出25秒）。`EnemySpawnManager.getSpawnDelay` と `MainScene.updateOutpostsSpawn` が参照。
- **数値食い違いの是正**: コメント/ドキュメントの古い湧き間隔記述を削除し「config 参照」へ（実装・コメント・本書で3重に食い違っていた問題を解消）。
- **重要**: これらの値の真実は `src/game/configs/` です。挙動を変えたいときはコードではなく config を編集してください。値はすべて変更前と完全一致＝挙動不変。
- **検証**: `npm run build` グリーン。dev サーバーで起動・ポーズ往復・コンソールエラーゼロ。**発射感・湧きの実プレイ確認は推奨**。
- **Phase 4 後半（Wave ルール）完了**:
  - `WaveConfig.rules` を機能化: `allowBoost`（全Wave true=現状維持、将来 false で gating 可）、`maxTurrets`/`maxRelays`（未設定=無制限、設定で上限）。
  - Wave 固有挙動を rules フラグへ: `dockRepair`（旧 currentWave>=3）/`radarAlwaysVisible`（旧 currentWave<=3）。読み出しは `?? (currentWave 基準)` フォールバック付きで挙動完全一致。JSON も現状一致値に設定。
  - stale localStorage 対策: 鮮度判定に新フラグ有無チェックを追加（旧 allowBoost:false 等で挙動が変わるのを防止）。
  - **公転は flag 化見送り**（初期スポーンが scenarioManager 初期化前のため）。Wave1 専用機構として `currentWave === 1` 維持。
- **Phase 4 の唯一の残**: Wave ID の文字列統一（`currentWave: number` 廃止）。最も侵襲的（spawn/hitOutpost/遷移に分散）かつ自動検証困難のため、**Phase 5（テスト導入）後に実施予定**。

## 【2026/06/13】Phase 5: テスト導入 完了
- **vitest + jsdom + zod** を導入。`vitest.config.ts`(jsdom 環境)、`npm test`/`npm run test:watch`、`npm run check` は `tsc -b && eslint . && vitest run`。
- **EventBus を Phaser 非依存化**（`MiniEventEmitter`）＝ ScenarioManager 等を Node 単体テスト可能に。API・挙動は不変、実アプリでも検証済み。
- **テスト 16件**（`src/**/*.test.ts`）:
  - `ScenarioManager.test.ts`: トリガー条件(time/points)・Waveクリア・forceSetWave・targetWave ゲート。
  - `ScenarioSchema.test.ts`: zod 検証。不正データ検出＋**出荷 default_scenario.json の検証通過（回帰防止）**＋追加フィールド許容。
  - `EventBus.test.ts`: emitter セマンティクス。
- **`ScenarioSchema.ts`（zod）**: `loadScenario`/`updateScenarioEvents` に組み込み済み。壊れたシナリオはロード時に「パス: メッセージ」形式で console.error（最善努力で続行）。**テストの書き方の参考にすること**。
- **未実施**: `EnemySpawnManager.getSpawnDelay` のテスト（EnemySpawnManager が Phaser を直接 import するため、Phase 3 の CombatContext で Phaser 依存を切ってから追加が効率的）。
- 注: テストファイルが node 組み込みを使うため `tsconfig.app.json` の `types` に `"node"` を追加済み。

## 【2026/06/13】Phase 3 着手: CombatScene 型付け / ゲームオーバー＆リスタート / 開始Wave是正
- **`scene as any` 全廃**: `core/CombatScene.ts`（MainScene が implements）で `EnemyPatternDB`/`EnemySpawnManager` の scene を型付け（9箇所のキャスト除去）。型のみの変更で挙動不変。
- **ゲームオーバー画面＋リスタート**: `triggerGameOver()` が GAME OVER オーバーレイ表示＋BGM停止＋`game-over-changed` 発火。`Enter` キー / React「⟳ リスタート」ボタン → `restartGame()` が**死亡した Wave を sessionStorage(`sbd_restart_wave`) に保存して全リロード**し、`loadScenario` がその Wave から復元。
- **新規開始 Wave を Wave 1 に修正**: 開発用デフォルト（Wave 2 開始）を本来の Wave 1（チュートリアル）に。`MainScene.currentWave`=1、`ScenarioManager` 初期 currentWaveId='wave1'。`loadScenario` は sessionStorage の復元 Wave があればそれを、無ければ wave1 から開始。
- **自動検証済み**: 起動時 Wave1 通信表示 / sessionStorage='wave5' で Wave5 復元(wave5 通信確認) / ポーズ回帰なし / コンソールエラーゼロ / build・test(16)グリーン。
- **Phase 3 の残り（要・実機プレイ確認を伴う）**: BulletSystem（陣営判定の作り替え・`tintTopLeft` 廃止）、HealthSystem（15個の hit ハンドラを `applyDamage` に集約）、EntityData アクセサ、衝突登録の宣言的テーブル化。**これらは戦闘ロジックを変えるため、本環境では自動検証できず実機プレイ確認が必須**。

## 次のAI（アシスタント）への指示
- このファイルは、異なるPC間で開発を引き継ぐ際に、担当AIがプロジェクトの全体像と進行状況を理解するためのものです。
- **作業前に `npm test` と `npm run build` を実行**して現状を確認すること（テストが安全網）。
- 大きな開発ステップが完了するごとに、このドキュメントの「現在の進捗・決定事項」および要件・仕様の追記を行ってください。
- **型付きイベントの使い方**: 新しいイベントを足すときは `src/game/EventBus.ts` の `GameEventMap` にイベント名とペイロード型を追加してから emit/on する。全消しは `removeAll`、特定ハンドラ解除は `off(event, fn)`。
