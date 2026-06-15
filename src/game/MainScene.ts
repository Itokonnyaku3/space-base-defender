import Phaser from 'phaser';
import { ScenarioManager } from './ScenarioManager';
import type { ScenarioAction } from './ScenarioManager';
import { EventBus } from './EventBus';
import { WEAPON_CONFIGS } from './configs/WeaponConfig';
import { TURRET_CONFIGS } from './configs/TurretConfig';
import { SPAWN_CONFIG } from './configs/SpawnConfig';
import { Battleship } from './bosses/Battleship';
import { BOSS_CONFIG } from './configs/BossConfig';
import { ENEMY_CONFIGS } from './configs/EnemyConfig';
import { EnemyPatternDB, type AIState } from './ai/EnemyPatternDB';
import { EnemySpawnManager } from './EnemySpawnManager';
import type { CombatScene } from './core/CombatScene';
import { SoundEffects } from './audio/SoundEffects';
import { MusicSynthesizer } from './audio/MusicSynthesizer';
import { createGameTextures } from './visuals/GameTextures';
import { createStarfield } from './visuals/Starfield';
import { WORLD_SIZE, WORLD_CENTER } from './core/constants';

export default class MainScene extends Phaser.Scene implements CombatScene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasdKeys!: Record<string, Phaser.Input.Keyboard.Key>;
  private numKeys!: Record<string, Phaser.Input.Keyboard.Key>;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private shootKeys!: Record<string, Phaser.Input.Keyboard.Key>;
  private rKey!: Phaser.Input.Keyboard.Key; // 中継レーダー設置キー
  
  private bullets!: Phaser.Physics.Arcade.Group;
  enemies!: Phaser.Physics.Arcade.Group;
  private turrets!: Phaser.Physics.Arcade.Group;
  turretBullets!: Phaser.Physics.Arcade.Group;
  private allies!: Phaser.Physics.Arcade.Group;
  private motherships!: Phaser.Physics.Arcade.Group;
  private allyBullets!: Phaser.Physics.Arcade.Group;
  private outposts!: Phaser.Physics.Arcade.Group;
  private relays!: Phaser.Physics.Arcade.Group; // 中継レーダーグループ
  private thrusterParticles!: Phaser.Physics.Arcade.Group; // 姿勢制御スラスター用
  
  transportShip: Phaser.Physics.Arcade.Sprite | null = null;
  private transportShipGroup!: Phaser.Physics.Arcade.Group;
  private transportHpGraphics!: Phaser.GameObjects.Graphics;
  private base!: Phaser.Physics.Arcade.Sprite;
  private baseHp: number = 100;
  private playerHp: number = 100;
  private points: number = 0;

  private waveText!: Phaser.GameObjects.Text;
  private baseHpText!: Phaser.GameObjects.Text;
  private playerHpText!: Phaser.GameObjects.Text;
  private pointsText!: Phaser.GameObjects.Text;
  private explosionEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;

  private lastFired: number = 0;
  private lastFiredLong: number = 0;
  private lastFiredMachine: number = 0;
  private currentWeapon: 'long_range' | 'machinegun' = 'long_range';

  private spawnEvent!: Phaser.Time.TimerEvent;
  private spawnManager!: EnemySpawnManager;
  scenarioManager!: ScenarioManager;
  private radarDebugMode: boolean = false;
  private targetMoveAngle: number | null = null;
  private aKey!: Phaser.Input.Keyboard.Key;
  private sceneStartTime: number = 0;
  private cooldownGraphics!: Phaser.GameObjects.Graphics;
  private qKey!: Phaser.Input.Keyboard.Key;
  private allyTargetPos: { x: number; y: number } | null = null;
  private allyTargetSetTime: number = 0;
  private allyTargetMarker!: Phaser.GameObjects.Graphics;
  private repairTimer: number = 0;
  private lastOutpostSpawn: number = 0;
  private sKey!: Phaser.Input.Keyboard.Key;
  private dKey!: Phaser.Input.Keyboard.Key;
  private wKey!: Phaser.Input.Keyboard.Key;
  private boostCharges: number = 3;
  private isBoosting: boolean = false;
  private boostEndTime: number = 0;
  private nextBoostRegenTime: number = 0;
  private boostText!: Phaser.GameObjects.Text;
  private weaponTextLong!: Phaser.GameObjects.Text;
  private weaponTextMachine!: Phaser.GameObjects.Text;
  private weaponSwitchPrompt!: Phaser.GameObjects.Text;
  private indicatorGraphics!: Phaser.GameObjects.Graphics;
  private cooldownWeaponText!: Phaser.GameObjects.Text;
  private isPointsEnabled: boolean = false;
  private currentWave: number = 1;
  private activeOutpostAngle: number = 0;

  // Wave 5 ボス（巨大戦列艦）
  private battleship: Battleship | null = null;
  // spawnBattleship が登録するコライダー。撤去漏れ（Wave再入場での多重登録）を防ぐため保持する
  private battleshipColliders: Phaser.Physics.Arcade.Collider[] = [];

  // ポーズ制御
  private isPaused: boolean = false;
  private isGameOver: boolean = false;
  private pauseOverlay!: Phaser.GameObjects.Container;
  private gameOverOverlay!: Phaser.GameObjects.Container;
  private pauseKeyHandler?: (e: KeyboardEvent) => void;

  constructor() {
    super('MainScene');
  }

  preload() {
    createGameTextures(this);
  }

  create() {
    this.physics.world.setBounds(0, 0, WORLD_SIZE, WORLD_SIZE);
    createStarfield(this);

    // Base
    this.base = this.physics.add.sprite(WORLD_CENTER, WORLD_CENTER, 'base');
    this.base.setScale(0.15); // 元のサイズ
    this.base.setBlendMode(Phaser.BlendModes.SCREEN); // 暗い背景を透過させる
    this.base.setImmovable(true);

    // Player
    this.player = this.physics.add.sprite(WORLD_CENTER, WORLD_CENTER + 100, 'player'); 
    this.player.setCollideWorldBounds(true);
    this.player.setMaxVelocity(30); // 元の速度に戻す
    this.player.setDrag(5); // 元の減衰に戻す

    this.cameras.main.setBounds(0, 0, WORLD_SIZE, WORLD_SIZE);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.setZoom(1.5); // 視野を2/3に狭めてレーダーの重要性を向上

    if (this.input.keyboard) {
        this.aKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
        this.cursors = this.input.keyboard.createCursorKeys();
        this.wasdKeys = this.input.keyboard.addKeys({
            up: Phaser.Input.Keyboard.KeyCodes.W,
            down: Phaser.Input.Keyboard.KeyCodes.S,
            left: Phaser.Input.Keyboard.KeyCodes.A,
            right: Phaser.Input.Keyboard.KeyCodes.D
        }) as Record<string, Phaser.Input.Keyboard.Key>;
        this.numKeys = this.input.keyboard.addKeys({
            one: Phaser.Input.Keyboard.KeyCodes.ONE,
            two: Phaser.Input.Keyboard.KeyCodes.TWO,
            three: Phaser.Input.Keyboard.KeyCodes.THREE,
            four: Phaser.Input.Keyboard.KeyCodes.FOUR,
            five: Phaser.Input.Keyboard.KeyCodes.FIVE,
            six: Phaser.Input.Keyboard.KeyCodes.SIX,
            zero: Phaser.Input.Keyboard.KeyCodes.ZERO
        }) as Record<string, Phaser.Input.Keyboard.Key>;
        this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
        this.rKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
        this.qKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
        this.sKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
        this.dKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
        this.wKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
        this.shootKeys = this.input.keyboard.addKeys({
            z: Phaser.Input.Keyboard.KeyCodes.Z,
            j: Phaser.Input.Keyboard.KeyCodes.J
        }) as Record<string, Phaser.Input.Keyboard.Key>;

        // IMEやブラウザのスクロール等を防止するキーキャプチャ
        this.input.keyboard.addCapture([
            Phaser.Input.Keyboard.KeyCodes.SPACE,
            Phaser.Input.Keyboard.KeyCodes.R,
            Phaser.Input.Keyboard.KeyCodes.Q,
            Phaser.Input.Keyboard.KeyCodes.A,
            Phaser.Input.Keyboard.KeyCodes.W,
            Phaser.Input.Keyboard.KeyCodes.S,
            Phaser.Input.Keyboard.KeyCodes.D,
            Phaser.Input.Keyboard.KeyCodes.UP,
            Phaser.Input.Keyboard.KeyCodes.DOWN,
            Phaser.Input.Keyboard.KeyCodes.LEFT,
            Phaser.Input.Keyboard.KeyCodes.RIGHT
        ]);
    }



    // マウスクリックによる移動先（方角）指定
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        // クリックした地点への「角度」を記録（通り過ぎてもその方向へ進み続けるため）
        this.targetMoveAngle = Phaser.Math.Angle.Between(this.player.x, this.player.y, worldPoint.x, worldPoint.y) + Math.PI / 2;
    });

    // Groups
    this.bullets = this.physics.add.group({ defaultKey: 'bullet', maxSize: 100 });
    this.enemies = this.physics.add.group();
    this.turrets = this.physics.add.group();
    this.turretBullets = this.physics.add.group({ defaultKey: 'bullet', maxSize: 200 });
    this.allies = this.physics.add.group();
    this.motherships = this.physics.add.group();
    this.allyBullets = this.physics.add.group({ defaultKey: 'bullet', maxSize: 100 });
    this.outposts = this.physics.add.group();
    this.relays = this.physics.add.group();
    this.thrusterParticles = this.physics.add.group();
    this.transportShipGroup = this.physics.add.group();
    this.transportHpGraphics = this.add.graphics().setDepth(15);

    // Collisions
    this.physics.add.collider(this.bullets, this.enemies, this.hitEnemy, undefined, this);
    this.physics.add.collider(this.turretBullets, this.enemies, this.hitEnemy, this.checkEnemyBulletHit, this);
    this.physics.add.collider(this.player, this.enemies, this.hitPlayer, undefined, this);
    this.physics.add.collider(this.base, this.enemies, this.hitBase, undefined, this);
    this.physics.add.collider(this.turretBullets, this.base, this.hitBaseBullet, this.checkEnemyBulletHit, this);
    this.physics.add.collider(this.player, this.base, this.onPlayerHitBase, undefined, this);
    this.physics.add.collider(this.player, this.turrets);
    this.physics.add.collider(this.player, this.relays);
    this.physics.add.collider(this.enemies, this.turrets, this.hitTurretEnemy, undefined, this);
    this.physics.add.collider(this.transportShipGroup, this.enemies, this.hitTransportEnemy, undefined, this);
    this.physics.add.collider(this.transportShipGroup, this.turretBullets, this.hitTransportBullet, undefined, this);

    // Allies and Motherships Collisions
    this.physics.add.collider(this.allyBullets, this.enemies, this.hitEnemy, undefined, this);
    this.physics.add.collider(this.bullets, this.motherships, this.hitMothership, undefined, this);
    this.physics.add.collider(this.turretBullets, this.motherships, this.hitMothership, this.checkEnemyBulletHit, this);
    this.physics.add.collider(this.allyBullets, this.motherships, this.hitMothership, undefined, this);
    this.physics.add.collider(this.bullets, this.outposts, this.hitOutpost, undefined, this);
    this.physics.add.collider(this.turretBullets, this.outposts, this.hitOutpost, this.checkEnemyBulletHit, this);
    this.physics.add.collider(this.allyBullets, this.outposts, this.hitOutpost, undefined, this);
    this.physics.add.collider(this.player, this.motherships);
    this.physics.add.collider(this.player, this.outposts);
    this.physics.add.collider(this.allies, this.enemies, this.hitAllyEnemy, undefined, this);
    this.physics.add.collider(this.turretBullets, this.allies, this.hitAllyBullet, undefined, this);
    this.physics.add.collider(this.turretBullets, this.player, this.hitPlayerBullet, undefined, this);

    // Relays Collisions (敵や敵の弾が当たったときのダメージ処理)
    this.physics.add.collider(this.enemies, this.relays, this.hitRelayEnemy, undefined, this);
    this.physics.add.collider(this.turretBullets, this.relays, this.hitRelayBullet, undefined, this);
    this.physics.add.collider(this.motherships, this.relays, this.hitRelayMothership, undefined, this);

    // 初期Wave 1用：自基地の周囲を公転する初期周回基地を1つだけ生成 (HPは外だし設定から取得)
    // マップ拡張に伴い、初期座標を (3900, 3000) に配置 (公転半径 900 に適合)
    if (this.currentWave === 1) {
        const outpost = this.physics.add.sprite(3900, 3000, 'outpost');
        if (outpost) {
            this.outposts.add(outpost);
            outpost.setData('hp', ENEMY_CONFIGS.outpost_weak.hp);
            outpost.setImmovable(true);
        }
    }

    // Spawner (初期前線基地数に応じた湧きディレイ設定)
    this.spawnManager = new EnemySpawnManager(this, this.base, this.outposts, this.enemies);
    this.updateEnemySpawnRate();

    // Scenario & Action Handling
    this.scenarioManager = new ScenarioManager();
    EventBus.removeAll('scenario-action-execute');
    EventBus.on('scenario-action-execute', (action: ScenarioAction) => {
        this.handleScenarioAction(action);
    });

    EventBus.removeAll('wave-changed');
    EventBus.on('wave-changed', (nextWaveId: string) => {
        this.handleWaveTransition(nextWaveId);
    });

    EventBus.removeAll('toggle-radar-debug');
    EventBus.on('toggle-radar-debug', (enabled: boolean) => {
        this.radarDebugMode = enabled;
    });

    EventBus.removeAll('view-change');
    EventBus.on('view-change', (view: 'game' | 'editor') => {
        if (this.input && this.input.keyboard) {
            this.input.keyboard.enabled = (view === 'game');
        }
    });
    
    // Particles
    this.explosionEmitter = this.add.particles(0, 0, 'bullet', {
        lifespan: 400,
        speed: { min: 50, max: 200 },
        scale: { start: 0.8, end: 0 },
        alpha: { start: 1, end: 0 },
        blendMode: 'ADD',
        emitting: false
    });
    this.explosionEmitter.setDepth(20);

    // UI (ズーム 1.5倍の影響を相殺するため、カメラ中央からの距離をズーム倍率で逆算した座標に配置)
    const cam = this.cameras.main;
    const Z = cam.zoom; // 1.5
    const uiScale = 1 / Z;
    const cX = cam.width / 2; // 960
    const cY = cam.height / 2; // 540

    const getUIX = (targetX: number) => cX + (targetX - cX) * uiScale;
    const getUIY = (targetY: number) => cY + (targetY - cY) * uiScale;

    // ヘルプ、HP、ポイントのUIテキストを作成
    const helpText = this.add.text(getUIX(10), getUIY(10), '操作: [左クリック] 移動  [A]エイム＆射撃  [3][4][5][6][0]BGM切替', { color: '#ffffff', fontSize: '14px' });
    helpText.setScrollFactor(0).setScale(uiScale);

    this.waveText = this.add.text(getUIX(10), getUIY(40), `現在のWave: Wave ${this.currentWave}`, { color: '#ffffff', fontSize: '14px', fontStyle: 'bold' });
    this.waveText.setScrollFactor(0).setScale(uiScale);

    this.baseHpText = this.add.text(getUIX(10), getUIY(70), `基地耐久値: ${this.baseHp}`, { color: '#00ff00', fontSize: '14px' });
    this.baseHpText.setScrollFactor(0).setScale(uiScale);

    this.playerHpText = this.add.text(getUIX(10), getUIY(100), `自機HP: ${this.playerHp}`, { color: '#00ffff', fontSize: '14px' });
    this.playerHpText.setScrollFactor(0).setScale(uiScale);

    this.pointsText = this.add.text(getUIX(10), getUIY(130), `ポイント: ${this.points} (タレット: ${TURRET_CONFIGS.standard.cost} [SPACE] / 中継レーダー: 10 [R])`, { color: '#ffff00', fontSize: '14px' });
    this.pointsText.setScrollFactor(0).setScale(uiScale);

    this.boostText = this.add.text(getUIX(10), getUIY(160), `ブースト回数: ${this.boostCharges}/3 (Wキー)`, { color: '#ff00ff', fontSize: '14px' });
    this.boostText.setScrollFactor(0).setScale(uiScale);
    
    this.sceneStartTime = this.time.now;
    this.cooldownGraphics = this.add.graphics();
    this.cooldownGraphics.setScrollFactor(0);
    this.cooldownGraphics.setDepth(100);
    this.allyTargetMarker = this.add.graphics();
    this.allyTargetMarker.setDepth(10);

    this.indicatorGraphics = this.add.graphics().setScrollFactor(0).setDepth(100);
    
    this.weaponTextLong = this.add.text(getUIX(cX - 110), getUIY(20), '長距離弾', {
        fontSize: '13px',
        fontFamily: 'Inter, Roboto, Arial'
    }).setScrollFactor(0).setDepth(101).setOrigin(0.5, 0.5).setScale(uiScale);

    this.weaponTextMachine = this.add.text(getUIX(cX + 110), getUIY(20), '短距離マシンガン', {
        fontSize: '13px',
        fontFamily: 'Inter, Roboto, Arial'
    }).setScrollFactor(0).setDepth(101).setOrigin(0.5, 0.5).setScale(uiScale);

    this.weaponSwitchPrompt = this.add.text(getUIX(cX), getUIY(20), 'Dキーで切替', {
        fontSize: '9px',
        color: '#64748b',
        fontFamily: 'Inter, Roboto, Arial'
    }).setScrollFactor(0).setDepth(101).setOrigin(0.5, 0.5).setScale(uiScale);

    this.cooldownWeaponText = this.add.text(0, 0, '', {
        fontSize: '11px',
        fontStyle: 'bold',
        fontFamily: 'Inter, Roboto, Arial'
    }).setScrollFactor(0).setDepth(101).setOrigin(1, 0.5).setScale(uiScale);

    this.drawWeaponIndicator();

    // ポーズ機能のセットアップ（オーバーレイ生成・入力リスナー登録）
    this.setupPauseControls();
  }

  // ===== ポーズ機能 =====

  private setupPauseControls() {
    const cam = this.cameras.main;
    const Z = cam.zoom;
    const cX = cam.width / 2;
    const cY = cam.height / 2;

    // 画面全体を覆う半透明オーバーレイ＋中央テキスト。
    // ポーズ中もシーンの描画は継続するため、表示/非表示の切り替えだけで機能する。
    const dark = this.add.rectangle(0, 0, WORLD_SIZE, WORLD_SIZE, 0x02040a, 0.72);
    const title = this.add.text(0, -28, '一時停止  /  PAUSED', {
        fontSize: '40px', color: '#e2e8f0', fontStyle: 'bold', fontFamily: 'Inter, Roboto, Arial'
    }).setOrigin(0.5);
    const hint = this.add.text(0, 30, 'P キー または 画面右上のボタンで再開', {
        fontSize: '16px', color: '#94a3b8', fontFamily: 'Inter, Roboto, Arial'
    }).setOrigin(0.5);

    this.pauseOverlay = this.add.container(cX, cY, [dark, title, hint]);
    this.pauseOverlay.setScrollFactor(0).setDepth(2000).setScale(1 / Z).setVisible(false);

    // ゲームオーバー用オーバーレイ（具体的な原因は既存の HUD テキストが表示するため、ここは汎用表示）
    const goRect = this.add.rectangle(0, 0, WORLD_SIZE, WORLD_SIZE, 0x1a0205, 0.8);
    const goTitle = this.add.text(0, -34, 'GAME OVER', {
        fontSize: '52px', color: '#ff5555', fontStyle: 'bold', fontFamily: 'Inter, Roboto, Arial'
    }).setOrigin(0.5);
    const goHint = this.add.text(0, 34, 'Enter キー または 画面右上のリスタートボタンで最初から', {
        fontSize: '15px', color: '#fca5a5', fontFamily: 'Inter, Roboto, Arial'
    }).setOrigin(0.5);
    this.gameOverOverlay = this.add.container(cX, cY, [goRect, goTitle, goHint]);
    this.gameOverOverlay.setScrollFactor(0).setDepth(2001).setScale(1 / Z).setVisible(false);

    // ポーズ中/ゲームオーバー中は scene.update が止まるため、キーは window で直接拾う
    this.pauseKeyHandler = (e: KeyboardEvent) => {
        if (this.isGameOver) {
            // ゲームオーバー中は Enter で死亡した Wave からやり直す
            if (e.key === 'Enter') this.restartGame();
            return;
        }
        if (e.key === 'p' || e.key === 'P') this.togglePause();
    };
    window.addEventListener('keydown', this.pauseKeyHandler);

    // React 側のポーズ/リスタートボタンからの要求（EventBus コールバックはシーン停止中も発火する）
    EventBus.removeAll('toggle-pause');
    EventBus.on('toggle-pause', () => this.togglePause());
    EventBus.removeAll('restart-game');
    EventBus.on('restart-game', () => this.restartGame());

    // シーン破棄時に window リスナーを解除（リーク防止）
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanupPauseControls, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanupPauseControls, this);
  }

  private cleanupPauseControls() {
    if (this.pauseKeyHandler) {
        window.removeEventListener('keydown', this.pauseKeyHandler);
        this.pauseKeyHandler = undefined;
    }
    EventBus.removeAll('toggle-pause');
    EventBus.removeAll('restart-game');
  }

  // ゲームオーバーから、死亡した Wave を保存して全リロードでやり直す。
  // （全リロードにより Phaser/React/各種状態を確実にリセットしつつ、Wave だけ復元する）
  private restartGame() {
    if (!this.isGameOver) return;
    try {
      sessionStorage.setItem('sbd_restart_wave', this.scenarioManager.getCurrentWaveId());
    } catch (e) {
      console.warn('[MainScene] sessionStorage への保存に失敗。Wave 1 から再開します:', e);
    }
    window.location.reload();
  }

  private togglePause() {
    if (this.isGameOver) return;          // ゲームオーバー中は復帰させない
    if (this.isPaused) this.resumeGame();
    else this.pauseGame();
  }

  private pauseGame() {
    if (this.isPaused || this.isGameOver) return;
    this.isPaused = true;
    this.pauseOverlay.setVisible(true);
    MusicSynthesizer.pausePlayback();
    EventBus.emit('pause-state-changed', true);
    this.scene.pause();   // 以降このシーンの update/physics/timer はすべて凍結
  }

  private resumeGame() {
    if (!this.isPaused) return;
    this.isPaused = false;
    this.scene.resume();
    this.pauseOverlay.setVisible(false);
    MusicSynthesizer.resumePlayback();
    EventBus.emit('pause-state-changed', false);
  }

  // ゲームオーバー時の共通処理。フラグを立て、オーバーレイ表示・BGM停止・シーン停止を行う。
  // ポーズ機能がこの状態を誤って解除しないよう isGameOver を使う。
  private triggerGameOver() {
    if (this.isGameOver) return; // 同フレーム多重発火の防止
    this.isGameOver = true;
    this.gameOverOverlay.setVisible(true);
    MusicSynthesizer.stop();
    EventBus.emit('game-over-changed', true);
    this.scene.pause();
  }

  update(time: number) {
    // Dキーで武器トグル切り替え、または1, 2キー
    if (Phaser.Input.Keyboard.JustDown(this.dKey)) {
        const nextWeapon = this.currentWeapon === 'long_range' ? 'machinegun' : 'long_range';
        this.switchWeapon(nextWeapon);
    } else if (Phaser.Input.Keyboard.JustDown(this.numKeys.one)) {
        this.switchWeapon('long_range');
    } else if (Phaser.Input.Keyboard.JustDown(this.numKeys.two)) {
        this.switchWeapon('machinegun');
    } else if (Phaser.Input.Keyboard.JustDown(this.numKeys.three)) {
        MusicSynthesizer.selectPattern(1);
        EventBus.emit('debug-log-add', {
            type: 'system',
            message: 'BGM：サンプルA（アンビエント）を再生中。切り替えは [3] [4] [5] [6] [0] キー'
        });
    } else if (Phaser.Input.Keyboard.JustDown(this.numKeys.four)) {
        MusicSynthesizer.selectPattern(2);
        EventBus.emit('debug-log-add', {
            type: 'system',
            message: 'BGM：サンプルB（レトロ・テクノ）を再生中。切り替えは [3] [4] [5] [6] [0] キー'
        });
    } else if (Phaser.Input.Keyboard.JustDown(this.numKeys.five)) {
        MusicSynthesizer.selectPattern(3);
        EventBus.emit('debug-log-add', {
            type: 'system',
            message: 'BGM：サンプルC（不穏なミニマル）を再生中。切り替えは [3] [4] [5] [6] [0] キー'
        });
    } else if (Phaser.Input.Keyboard.JustDown(this.numKeys.six)) {
        MusicSynthesizer.selectPattern(4);
        EventBus.emit('debug-log-add', {
            type: 'system',
            message: 'BGM：サンプルD（荘厳なスペースオペラ）を再生中。切り替えは [3] [4] [5] [6] [0] キー'
        });
    } else if (Phaser.Input.Keyboard.JustDown(this.numKeys.zero)) {
        MusicSynthesizer.selectPattern(0);
        EventBus.emit('debug-log-add', {
            type: 'system',
            message: 'BGMを停止しました'
        });
    }

    // Wキーでブースト発動（10秒間、回数制限3回）。Wave の allowBoost ルールで許可制御
    if (Phaser.Input.Keyboard.JustDown(this.wKey)) {
        const allowBoost = this.scenarioManager.getCurrentWaveConfig()?.rules.allowBoost ?? true;
        if (allowBoost && !this.isBoosting && this.boostCharges > 0) {
            this.isBoosting = true;
            this.boostEndTime = time + 10000;
            this.boostCharges--;
            this.updateUI();
            SoundEffects.playBoost();
            
            EventBus.emit('debug-log-add', {
                type: 'system',
                message: `[Boost] スピード倍増！ 残り回数: ${this.boostCharges}/3`
            });
        }
    }

    // ブースト効果時間の監視
    if (this.isBoosting && time > this.boostEndTime) {
        this.isBoosting = false;
        this.updateUI();
        EventBus.emit('debug-log-add', {
            type: 'system',
            message: `[Boost] スピード倍増効果が終了しました`
        });
    }

    // ブーストの時間経過自動回復（15秒ごとに1チャージ自動回復）
    if (this.boostCharges < 3) {
        if (this.nextBoostRegenTime === 0) {
            this.nextBoostRegenTime = time + 15000;
        } else if (time > this.nextBoostRegenTime) {
            this.boostCharges++;
            this.updateUI();
            
            EventBus.emit('debug-log-add', {
                type: 'system',
                message: `[Boost] 回数が自動回復しました。現在: ${this.boostCharges}/3`
            });

            if (this.boostCharges < 3) {
                this.nextBoostRegenTime = time + 15000;
            } else {
                this.nextBoostRegenTime = 0;
            }
        }
    } else {
        this.nextBoostRegenTime = 0;
    }

    // 自基地ドック（接触＆静止）での自機HP回復機能。Wave の dockRepair ルールで許可制御
    // （未設定時は従来どおり Wave 3 以降）
    const distToBase = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.base.x, this.base.y);
    const isTouchingBase = distToBase < 150;
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    const isStopped = playerBody ? playerBody.velocity.length() < 0.1 : false;
    const dockRepair = this.scenarioManager.getCurrentWaveConfig()?.rules.dockRepair ?? (this.currentWave >= 3);

    if (dockRepair && isTouchingBase && isStopped && this.playerHp < 100) {
        const lastHpRegen = this.player.getData('lastHpRegenTime') as number || 0;
        if (time > lastHpRegen + 1000) { // 1秒ごと
            this.playerHp = Math.min(100, this.playerHp + 2); // 2回復
            this.player.setData('lastHpRegenTime', time);
            this.updateUI();
            
            EventBus.emit('debug-log-add', {
                type: 'system',
                message: `[System] 基地のドックにて自機HPが回復中。現在HP: ${this.playerHp}/100`
            });
            
            // 回復中のエフェクト（緑色の小さな火花）
            this.triggerExplosion(this.player.x, this.player.y, 3, 0x00ffaa);
        }
    }

    // Qキーで味方機の作戦目標座標を指示
    if (Phaser.Input.Keyboard.JustDown(this.qKey)) {
        const pointer = this.input.activePointer;
        const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        this.allyTargetPos = { x: worldPoint.x, y: worldPoint.y };
        this.allyTargetSetTime = time;
    }

    // 15秒経過したら目的地をクリア
    if (this.allyTargetPos && time > this.allyTargetSetTime + 15000) {
        this.allyTargetPos = null;
    }

    this.handleWeaponSwitch();
    this.handlePlayerMovement();
    this.handleShooting(time);
    this.handleTurretPlacement();
    this.handleRelayPlacement(); // 中継レーダーの設置検知
    this.updateEnemies(time);
    this.updateBullets(this.bullets);
    this.updateBullets(this.turretBullets, 250);
    this.updateBullets(this.allyBullets, 250);
    this.updateTurrets(time);
    this.updateThrusterParticles(); // スラスターパーティクルの寿命管理

    // 輸送船の現在のHPを取得（存在しない場合は 100）
    const transportHp = this.transportShip && this.transportShip.active 
        ? (this.transportShip.getData('hp') ?? 100)
        : 100;

    // Scenario & Autonomous Units Update
    this.scenarioManager.update(time - this.sceneStartTime, this.points, transportHp);
    this.updateAllies(time);
    this.updateMotherships(time);
    this.updateOutpostsSpawn(time);
    if (this.battleship) this.battleship.update(this.game.loop.delta);

    // Wave 1 の場合、敵基地（前哨基地）を本部の周りで公転移動させる (半径 900px の近距離に変更)
    if (this.currentWave === 1) {
        this.outposts.getChildren().forEach((child) => {
            const outpost = child as Phaser.Physics.Arcade.Sprite;
            if (outpost.active) {
                this.activeOutpostAngle += 0.0005; // ゆっくり回転
                const radius = 900;
                const newX = 3000 + Math.cos(this.activeOutpostAngle) * radius;
                const newY = 3000 + Math.sin(this.activeOutpostAngle) * radius;
                outpost.setPosition(newX, newY);
                const body = outpost.body as Phaser.Physics.Arcade.Body;
                if (body) {
                    body.reset(newX, newY);
                }
            }
        });
    }

    // 輸送船の移動およびドッキングクリア判定
    if (this.transportShip && this.transportShip.active) {
        // 毎フレーム、自基地へ向かう速度を再設定（コライダーの衡突で速度がリセットされるのを防止）
        const shipSpeed = this.transportShip.getData('speed') || 9;
        const angleToBase = Phaser.Math.Angle.Between(this.transportShip.x, this.transportShip.y, this.base.x, this.base.y);
        this.transportShip.rotation = angleToBase + Math.PI / 2;
        
        const vx = Math.cos(angleToBase) * shipSpeed;
        const vy = Math.sin(angleToBase) * shipSpeed;
        this.transportShip.setVelocity(vx, vy);

        const dist = Phaser.Math.Distance.Between(this.transportShip.x, this.transportShip.y, this.base.x, this.base.y);
        if (dist <= 100) {
            EventBus.emit('debug-log-add', {
                type: 'scenario',
                message: '[Scenario] 輸送船が自基地にドッキングしました！ 護衛完了。'
            });
            this.triggerExplosion(this.transportShip.x, this.transportShip.y, 20, 0x00ff00);
            this.transportShip.destroy();
            this.transportShip = null;
            
            // 進捗を ScenarioManager に伝える
            this.scenarioManager.setWaveProgress('transportShipReached', 1);
        }
    }

    // 輸送船のHPバー描画
    if (this.transportHpGraphics) {
        this.transportHpGraphics.clear();
        if (this.transportShip && this.transportShip.active) {
            const hp = this.transportShip.getData('hp') || 0;
            const maxHp = this.transportShip.getData('maxHp') || 100;
            const progress = Phaser.Math.Clamp(hp / maxHp, 0, 1);
            
            this.transportHpGraphics.fillStyle(0x000000, 0.5);
            this.transportHpGraphics.fillRect(this.transportShip.x - 24, this.transportShip.y - 32, 48, 6);
            
            this.transportHpGraphics.fillStyle(0x00ff66, 1);
            this.transportHpGraphics.fillRect(this.transportShip.x - 24, this.transportShip.y - 32, 48 * progress, 6);
            
            this.transportHpGraphics.lineStyle(1, 0x1e293b, 1);
            this.transportHpGraphics.strokeRect(this.transportShip.x - 24, this.transportShip.y - 32, 48, 6);
        }
    }

    // 射撃クールダウンゲージの描画
    this.drawCooldownGauge(time);
    
    // 指令マーカーの描画
    this.drawAllyTargetMarker(time);

    // 戦術レーダー用データ集計と送信
    this.sendRadarData();
  }

  private handleWeaponSwitch() {
      // 武器切り替え機能は一旦オミット（Aキーでの固定エイム射撃に統一）
  }

  private handlePlayerMovement() {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    if (!body) return;

    const pointer = this.input.activePointer;
    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);

    const baseAccel = 90;
    const baseMaxVelocity = 30;

    // ブースト中なら推進加速と最高速度を1.5倍にする
    const accel = this.isBoosting ? baseAccel * 1.5 : baseAccel;
    const maxVel = this.isBoosting ? baseMaxVelocity * 1.5 : baseMaxVelocity;
 
    const isSKeyDown = this.sKey.isDown || this.wasdKeys.down.isDown;
    const speedLimit = this.isBoosting ? 22.5 : 15; // 最高速度の半分 (ブースト中: 45/2=22.5)
 
    if (isSKeyDown) {
        this.player.setMaxVelocity(speedLimit);
        // 現在の速度が制限値を超えている場合は徐々に減速させる
        const currentSpeed = body.velocity.length();
        if (currentSpeed > speedLimit) {
            body.setVelocity(body.velocity.x * 0.95, body.velocity.y * 0.95);
        }
    } else {
        this.player.setMaxVelocity(maxVel);
    }
 
    // 旋回速度を固定値 0.025 にする（スピード連動の廃止）
    const rotSpeed = 0.025;
 
    // 常に自機はマウスカーソルの方向を向く
    const targetAngle = Phaser.Math.Angle.Between(this.player.x, this.player.y, worldPoint.x, worldPoint.y) + Math.PI / 2;
    this.player.rotation = Phaser.Math.Angle.RotateTo(this.player.rotation, targetAngle, rotSpeed);

    if (this.targetMoveAngle !== null) {
        // クリックしたターゲット方向へ加速（自機の向きに関わらずスライド移動）
        this.physics.velocityFromRotation(this.targetMoveAngle - Math.PI / 2, accel, body.acceleration);
        
        // スラスターのパーティクル生成（機体の向きに合わせて後ろから噴射）
        const px = this.player.x - Math.sin(this.player.rotation) * 14;
        const py = this.player.y + Math.cos(this.player.rotation) * 14;
        // ブースト中はスラスターの噴射も激しく
        const thrusterSpeed = this.isBoosting ? 260 : 160;
        const thrusterTint = this.isBoosting ? 0x00ffff : 0xffaa00;
        this.spawnThrusterParticle(px, py, this.player.rotation + Math.PI / 2, thrusterSpeed, thrusterTint);
    } else {
        this.player.setAcceleration(0);
    }
  }

  private handleShooting(time: number) {
    if (this.aKey && this.aKey.isDown && time > this.lastFired) {
      const bullet = this.bullets.get(this.player.x, this.player.y) as Phaser.Physics.Arcade.Sprite;
      
      if (bullet) {
        bullet.setActive(true);
        bullet.setVisible(true);
        if (bullet.body) bullet.body.enable = true; // 物理ボディを有効化
        bullet.setData('startX', this.player.x);
        bullet.setData('startY', this.player.y);
        
        const angle = this.player.rotation - Math.PI / 2;
        const weapon = WEAPON_CONFIGS[this.currentWeapon];

        bullet.setTint(weapon.bulletTint);
        bullet.setData('maxRange', weapon.maxRange);
        bullet.setData('damage', weapon.damage);
        bullet.setData('weaponType', this.currentWeapon);
        // 加速する武器（長距離弾）は段階加速のため発射時刻と角度を記録する
        if (weapon.accel) {
            bullet.setData('spawnTime', time);
            bullet.setData('fireAngle', angle);
        }
        const speed = weapon.speed;
        this.lastFired = time + weapon.cooldownMs;
        if (weapon.sound === 'laser') {
            SoundEffects.playLaser();
        } else {
            SoundEffects.playMachinegun();
        }
        
        // 常に機首が向いている方向に弾を飛ばす
        this.physics.velocityFromRotation(angle, speed, bullet.body!.velocity);
      }
    }
  }

  private handleTurretPlacement() {
    if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
        const waveConfig = this.scenarioManager.getCurrentWaveConfig();
        if (waveConfig && !waveConfig.rules.allowTurretPlacement) {
            EventBus.emit('debug-log-add', {
                type: 'system',
                message: `現在のWaveではタレットを設置できません`
            });
            return;
        }

        const maxTurrets = waveConfig?.rules.maxTurrets;
        if (maxTurrets !== undefined && this.turrets.getChildren().filter(t => t.active).length >= maxTurrets) {
            EventBus.emit('debug-log-add', {
                type: 'system',
                message: `タレットの設置上限（${maxTurrets}基）に達しています`
            });
            return;
        }

        if (this.points >= TURRET_CONFIGS.standard.cost) {
            this.points -= TURRET_CONFIGS.standard.cost;
            this.updateUI();
            SoundEffects.playPlace();
            
            const turret = this.turrets.create(this.player.x, this.player.y, 'turret') as Phaser.Physics.Arcade.Sprite;
            if (turret) {
                turret.setScale(0.06);
                turret.setBlendMode(Phaser.BlendModes.SCREEN);
                turret.setImmovable(true);
                turret.setData('lastFired', 0); 
                turret.setData('hits', TURRET_CONFIGS.standard.maxHits);
                
                // デバッグログ通知
                EventBus.emit('debug-log-add', {
                    type: 'system',
                    message: `[System] プレイヤーが防衛タレットを (X: ${Math.round(this.player.x)}, Y: ${Math.round(this.player.y)}) に設置。消費: ${TURRET_CONFIGS.standard.cost}pt、残り: ${this.points}pt`
                });
            }
        }
    }
  }

  private handleRelayPlacement() {
    if (Phaser.Input.Keyboard.JustDown(this.rKey)) {
        const waveConfig = this.scenarioManager.getCurrentWaveConfig();
        if (waveConfig && !waveConfig.rules.allowRelayPlacement) {
            EventBus.emit('debug-log-add', {
                type: 'system',
                message: `現在のWaveでは中継レーダーを設置できません`
            });
            return;
        }

        const maxRelays = waveConfig?.rules.maxRelays;
        if (maxRelays !== undefined && this.relays.getChildren().filter(r => r.active).length >= maxRelays) {
            EventBus.emit('debug-log-add', {
                type: 'system',
                message: `中継レーダーの設置上限（${maxRelays}基）に達しています`
            });
            return;
        }

        const relayCost = 10;
        if (this.points >= relayCost) {
            this.points -= relayCost;
            this.updateUI();
            SoundEffects.playPlace();
            
            const relay = this.relays.create(this.player.x, this.player.y, 'relay') as Phaser.Physics.Arcade.Sprite;
            if (relay) {
                relay.setImmovable(true);
                relay.setData('hp', 50); // 中継基地の耐久値HP: 50
                
                // デバッグログ通知
                EventBus.emit('debug-log-add', {
                    type: 'system',
                    message: `[System] プレイヤーが中継レーダーを (X: ${Math.round(this.player.x)}, Y: ${Math.round(this.player.y)}) に設置。消費: ${relayCost}pt、残り: ${this.points}pt`
                });

                // 管制官よりオンライン通信
                this.scenarioManager.triggerDynamicEvent('relay_placed');
            }
        }
    }
  }

  private spawnEnemy() {
      this.spawnManager.spawnPeriodicEnemy(this.currentWave);
  }

  private updateEnemies(time: number) {
    this.enemies.getChildren().forEach((child) => {
      const enemy = child as Phaser.Physics.Arcade.Sprite;
      if (enemy.active) {
        EnemyPatternDB.execute(enemy, this, time, this.base, this.player);
      }
    });
  }

  private updateTurrets(time: number) {
    this.turrets.getChildren().forEach((child) => {
        const turret = child as Phaser.Physics.Arcade.Sprite;
        
        let closestEnemy: Phaser.Physics.Arcade.Sprite | null = null;
        let closestDist = TURRET_CONFIGS.standard.range; // 射程（外だし設定）

        const enemyChildren = this.enemies.getChildren() as Phaser.Physics.Arcade.Sprite[];
        for (const enemy of enemyChildren) {
            if (enemy.active) {
                const dist = Phaser.Math.Distance.Between(turret.x, turret.y, enemy.x, enemy.y);
                if (dist < closestDist) {
                    closestDist = dist;
                    closestEnemy = enemy;
                }
            }
        }

        if (closestEnemy) {
            // 敵の方向を向く (元の旋回速度に近い値)
            const targetRotation = Phaser.Math.Angle.Between(turret.x, turret.y, closestEnemy.x, closestEnemy.y) + Math.PI / 2;
            turret.rotation = Phaser.Math.Angle.RotateTo(turret.rotation, targetRotation, 0.05);

            const turretLastFired = turret.getData('lastFired') as number || 0;
            // 角度差をラジアンで正確に計算
            const angleDiff = Math.abs(Phaser.Math.Angle.Wrap(turret.rotation - targetRotation));

            // 向きが合っていて（誤差約10度: 0.17rad以内）、リロード完了時のみ発射
            if (time > turretLastFired && angleDiff < TURRET_CONFIGS.standard.aimToleranceRad) {
                const bullet = this.turretBullets.get(turret.x, turret.y) as Phaser.Physics.Arcade.Sprite;
                if (bullet) {
                    bullet.setActive(true);
                    bullet.setVisible(true);
                    if (bullet.body) bullet.body.enable = true; // 物理ボディを有効化
                    bullet.setTint(TURRET_CONFIGS.standard.bulletTint); // 水色
                    bullet.setData('startX', turret.x);
                    bullet.setData('startY', turret.y);
                    bullet.setData('isEnemyBullet', false);
                    
                    const fireAngle = turret.rotation - Math.PI / 2;
                    this.physics.velocityFromRotation(fireAngle, TURRET_CONFIGS.standard.bulletSpeed, bullet.body!.velocity);
                    turret.setData('lastFired', time + TURRET_CONFIGS.standard.fireRateMs);
                }
            }
        }
    });
  }

  private updateBullets(group: Phaser.Physics.Arcade.Group, defaultMaxRange?: number) {
    const time = this.time.now;
    group.getChildren().forEach((child) => {
        const bullet = child as Phaser.Physics.Arcade.Sprite;
        if (bullet.active) {
            // 加速する武器（長距離弾）の段階的加速を WeaponConfig から適用
            const weaponType = bullet.getData('weaponType') as keyof typeof WEAPON_CONFIGS | undefined;
            const accel = weaponType ? WEAPON_CONFIGS[weaponType].accel : undefined;
            if (accel && weaponType) {
                const baseSpeed = WEAPON_CONFIGS[weaponType].speed;
                const spawnTime = bullet.getData('spawnTime') as number || 0;
                const elapsed = time - spawnTime;
                const progress = Phaser.Math.Clamp(elapsed / accel.durationMs, 0, 1);
                const currentSpeed = Phaser.Math.Linear(baseSpeed, accel.maxSpeed, progress);
                const fireAngle = bullet.getData('fireAngle') as number || 0;

                this.physics.velocityFromRotation(fireAngle, currentSpeed, bullet.body!.velocity);
            }

            let outOfRange = false;
            const maxRange = bullet.getData('maxRange') as number ?? defaultMaxRange;
            if (maxRange) {
                const startX = bullet.getData('startX') as number ?? bullet.x;
                const startY = bullet.getData('startY') as number ?? bullet.y;
                const dist = Phaser.Math.Distance.Between(bullet.x, bullet.y, startX, startY);
                if (dist > maxRange) {
                    outOfRange = true;
                }
            }
            if (outOfRange || bullet.x < 0 || bullet.x > WORLD_SIZE || bullet.y < 0 || bullet.y > WORLD_SIZE) {
                bullet.setActive(false);
                bullet.setVisible(false);
                if (bullet.body) {
                    bullet.body.stop();
                    bullet.body.enable = false; // 物理ボディを無効化
                }
            }
        }
    });
  }

  private triggerExplosion(x: number, y: number, count: number, tint: number) {
      this.explosionEmitter.setParticleTint(tint);
      this.explosionEmitter.explode(count, x, y);
  }

  private checkEnemyBulletHit(bullet: unknown, _target: unknown): boolean {
    const b = bullet as Phaser.Physics.Arcade.Sprite;
    return b.getData('isEnemyBullet') !== true;
  }

  // 弾を非アクティブ化して物理ボディを止める共通処理（衝突ハンドラ間の重複を解消）。
  private consumeBullet(b: Phaser.Physics.Arcade.Sprite) {
    b.setActive(false);
    b.setVisible(false);
    if (b.body) {
        b.body.stop();
        b.body.enable = false;
    }
  }

  private hitEnemy(
    bullet: unknown,
    enemy: unknown
  ) {
    const b = bullet as Phaser.Physics.Arcade.Sprite;
    const e = enemy as Phaser.Physics.Arcade.Sprite;
    
    if (!b.active) return;
    this.consumeBullet(b);
    
    const damage = b.getData('damage') as number ?? 10;
    let hp = e.getData('hp') as number ?? ENEMY_CONFIGS.standard.hp;
    hp -= damage;
    e.setData('hp', hp);
    
    if (hp <= 0) {
        this.triggerExplosion(e.x, e.y, 15, 0xff5500); // オレンジの爆発
        SoundEffects.playExplosion();
        
        const enemyId = e.getData('enemyId') as string || 'standard';
        const config = ENEMY_CONFIGS[enemyId as keyof typeof ENEMY_CONFIGS];
        const enemyName = config ? config.name : '戦闘機';

        // スコードロンの全滅判定
        const aiState = e.getData('aiState') as AIState | undefined;
        if (aiState && aiState.squadronId) {
            const squadId = aiState.squadronId;
            const activeSiblings = this.enemies.getChildren().filter((child) => {
                const sib = child as Phaser.Physics.Arcade.Sprite;
                if (sib === e || !sib.active) return false;
                const sibState = sib.getData('aiState') as AIState | undefined;
                return sibState && sibState.squadronId === squadId;
            });
            
            EventBus.emit('debug-log-add', {
                type: 'system',
                message: `[AI] スコードロン "${squadId}" の残存機数: ${activeSiblings.length}`
            });

            if (activeSiblings.length === 0) {
                EventBus.emit('debug-log-add', {
                    type: 'system',
                    message: `[AI] スコードロン "${squadId}" が全滅しました`
                });

                if (squadId === 'squad_wave1_2') {
                    this.scenarioManager.triggerDynamicEvent('wave1_outpost_hint');
                }
            }
        }

        this.checkAndSplitNextEnemy(e);
        e.destroy();
        
        // デバッグログ通知
        EventBus.emit('debug-log-add', {
            type: 'damage',
            message: `[Damage] 敵の ${enemyName} を撃破！`
        });

        // 撃破数をインクリメントして進行管理にセット
        const currentKills = this.scenarioManager.getWaveProgress().turretKills;
        this.scenarioManager.setWaveProgress('turretKills', currentKills + 1);

        if (this.isPointsEnabled) {
            this.points += 5;
        }
        this.updateUI();
    } else {
        this.triggerExplosion(e.x, e.y, 4, 0xffaa00);
        SoundEffects.playHit();
        e.setTint(0xff0000);
        this.time.delayedCall(100, () => {
            if (e.active) e.clearTint();
        });
    }
  }

  private hitPlayer(
    _player: unknown,
    enemy: unknown
  ) {
    const e = enemy as Phaser.Physics.Arcade.Sprite;
    if (!e.active) return;
    
    const enemyId = e.getData('enemyId') as string || 'standard';
    const config = ENEMY_CONFIGS[enemyId as keyof typeof ENEMY_CONFIGS];
    const enemyName = config ? config.name : '戦闘機';

    this.triggerExplosion(e.x, e.y, 15, 0xff5500);
    e.destroy();
    
    this.playerHp -= 10;
    this.updateUI();
    SoundEffects.playHit();

    // デバッグログ通知
    EventBus.emit('debug-log-add', {
        type: 'damage',
        message: `[Damage] 自機が敵の ${enemyName} と衝突！ 10ダメージ受ける（残りHP: ${this.playerHp}）`
    });
    
    if (this.playerHp <= 0) {
        this.playerHpText.setText('自機大破 (GAME OVER)');
        this.playerHpText.setColor('#ff0000');
        this.triggerExplosion(this.player.x, this.player.y, 40, 0x00ffff);
        this.player.setVisible(false);
        this.triggerGameOver();
    } else {
        this.player.setTint(0xff0000);
        this.time.delayedCall(100, () => {
          this.player.clearTint();
        });
    }
  }

  private hitBaseBullet(
    _base: unknown,
    bullet: unknown
  ) {
    const b = bullet as Phaser.Physics.Arcade.Sprite;
    if (!b.active) return;

    b.destroy();
    this.baseHp = Math.max(0, this.baseHp - 1);
    this.updateUI();

    EventBus.emit('debug-log-add', {
        type: 'damage',
        message: `[Damage] 自基地が敵の銃撃を被弾！ 1ダメージ受ける（耐久値: ${this.baseHp}）`
    });

    SoundEffects.playHit();

    if (this.baseHp <= 0) {
        this.baseHpText.setText('基地崩壊 (GAME OVER)');
        this.baseHpText.setColor('#ff0000');
        this.triggerGameOver();
    } else {
        this.base.setTint(0xff0000);
        this.time.delayedCall(100, () => {
            if (this.base && this.base.active) {
                this.base.clearTint();
            }
        });
    }
  }

  private hitBase(
    _base: unknown,
    enemy: unknown
  ) {
    const e = enemy as Phaser.Physics.Arcade.Sprite;
    if (!e.active) return;

    const enemyId = e.getData('enemyId') as string || 'standard';
    const config = ENEMY_CONFIGS[enemyId as keyof typeof ENEMY_CONFIGS];
    const enemyName = config ? config.name : '戦闘機';

    this.triggerExplosion(e.x, e.y, 15, 0xff5500);
    e.destroy();
    
    // 自爆機は 10 ダメージ、その他は 5 ダメージ
    const damage = enemyId === 'suicide_bomber' ? 10 : 5;
    this.baseHp = Math.max(0, this.baseHp - damage);

    SoundEffects.playHit();
    
    // デバッグログ通知
    EventBus.emit('debug-log-add', {
        type: 'damage',
        message: `[Damage] 自基地が敵の ${enemyName} から特攻！ 10ダメージ受ける（耐久値: ${this.baseHp}）`
    });

    if (this.baseHp <= 0) {
        this.baseHpText.setText('基地崩壊 (GAME OVER)');
        this.baseHpText.setColor('#ff0000');
        this.triggerGameOver();
    } else {
        this.updateUI();
        this.base.setTint(0xff0000);
        this.time.delayedCall(100, () => {
            this.base.clearTint();
        });
    }
  }

  private onPlayerHitBase(player: unknown, _base: unknown) {
      const p = player as Phaser.Physics.Arcade.Sprite;
      const pBody = p.body as Phaser.Physics.Arcade.Body;
      if (pBody) {
          pBody.setVelocity(0, 0);
          pBody.setAcceleration(0);
      }
      this.targetMoveAngle = null;
  }

  // 中継基地が敵戦闘機と衝突した際の処理（体当たりによるダメージ）
  private hitRelayEnemy(enemy: unknown, relay: unknown) {
      const e = enemy as Phaser.Physics.Arcade.Sprite;
      const r = relay as Phaser.Physics.Arcade.Sprite;
      if (!e.active || !r.active) return;
      
      const enemyId = e.getData('enemyId') as string || 'standard';
      const config = ENEMY_CONFIGS[enemyId as keyof typeof ENEMY_CONFIGS];
      const enemyName = config ? config.name : '戦闘機';

      this.triggerExplosion(e.x, e.y, 15, 0xff5500);
      e.destroy(); // 敵は爆発
      
      const currentHp = (r.getData('hp') as number || 50) - 15;
      r.setData('hp', currentHp);

      EventBus.emit('debug-log-add', {
          type: 'damage',
          message: `[Damage] 中継レーダーが敵の ${enemyName} と衝突！ 15ダメージ受ける（残りHP: ${currentHp}）`
      });

      r.setTint(0xff3333);
      this.time.delayedCall(100, () => {
          if (r.active) r.clearTint();
      });

      if (currentHp <= 0) {
          r.destroy();
          EventBus.emit('debug-log-add', {
              type: 'system',
              message: `[System] 中継レーダーが破壊されました！`
          });
          // 管制官/味方の割り込み日本語警告通信を発動！
          this.scenarioManager.triggerDynamicEvent('relay_destroyed');
      }
  }

  // 中継基地が弾と衝突した際の処理 (敵巨大母船の赤い弾のみ判定)
  private hitRelayBullet(bullet: unknown, relay: unknown) {
      const b = bullet as Phaser.Physics.Arcade.Sprite;
      const r = relay as Phaser.Physics.Arcade.Sprite;
      if (!b.active || !r.active) return;
      
      // 敵弾のみが中継基地にダメージを与える（陣営はデータフラグで判定。色には依存しない）
      if (b.getData('isEnemyBullet') === true) {
          this.consumeBullet(b);
          
          this.triggerExplosion(b.x, b.y, 5, 0xffaa00);
          
          const currentHp = (r.getData('hp') as number || 50) - 10;
          r.setData('hp', currentHp);

          EventBus.emit('debug-log-add', {
              type: 'damage',
              message: `[Damage] 中継レーダーが敵巨大母船の弾に被弾！ 10ダメージ受ける（残りHP: ${currentHp}）`
          });

          r.setTint(0xff3333);
          this.time.delayedCall(100, () => {
              if (r.active) r.clearTint();
          });

          if (currentHp <= 0) {
              r.destroy();
              EventBus.emit('debug-log-add', {
                  type: 'system',
                  message: `[System] 中継レーダーが破壊されました！`
              });
              // 警告通信発動
              this.scenarioManager.triggerDynamicEvent('relay_destroyed');
          }
      }
  }

  // 中継基地が敵巨大母船と衝突した際の処理（踏みつぶしによる大ダメージ）
  private hitRelayMothership(_mothership: unknown, relay: unknown) {
      const r = relay as Phaser.Physics.Arcade.Sprite;
      
      const currentHp = (r.getData('hp') as number || 50) - 30;
      r.setData('hp', currentHp);
      r.setTint(0xff3333);
      this.time.delayedCall(100, () => {
          if (r.active) r.clearTint();
      });

      if (currentHp <= 0) {
          r.destroy();
          this.scenarioManager.triggerDynamicEvent('relay_destroyed');
      }
  }

  private hitAllyEnemy(ally: unknown, enemy: unknown) {
      const a = ally as Phaser.Physics.Arcade.Sprite;
      const e = enemy as Phaser.Physics.Arcade.Sprite;
      if (!a.active || !e.active) return;
      
      this.triggerExplosion(e.x, e.y, 15, 0xff5500);
      e.destroy();
      
      const currentHp = (a.getData('hp') as number || 50) - 10;
      a.setData('hp', currentHp);
      a.setTint(0xff0000);
      this.time.delayedCall(100, () => {
          if (a.active && a.getData('state') !== 'retreat') a.setTint(0x00ffaa);
      });
      
      if (currentHp <= 0 && a.getData('state') !== 'retreat') {
          a.setData('state', 'retreat');
          this.triggerExplosion(a.x, a.y, 10, 0xaaaaaa); // 煙のエフェクト
      }
  }

  private hitAllyBullet(bullet: unknown, ally: unknown) {
      const b = bullet as Phaser.Physics.Arcade.Sprite;
      const a = ally as Phaser.Physics.Arcade.Sprite;
      if (!b.active || !a.active) return;
      
      if (b.getData('isEnemyBullet') === true) {
          this.consumeBullet(b);
          this.triggerExplosion(b.x, b.y, 5, 0xffaa00);
          
          const currentHp = (a.getData('hp') as number || 50) - 10;
          a.setData('hp', currentHp);
          a.setTint(0xff0000);
          this.time.delayedCall(100, () => {
              if (a.active && a.getData('state') !== 'retreat') a.setTint(0x00ffaa);
          });
          
          if (currentHp <= 0 && a.getData('state') !== 'retreat') {
              a.setData('state', 'retreat');
              this.triggerExplosion(a.x, a.y, 10, 0xaaaaaa);
          }
      }
  }

  private hitPlayerBullet(player: unknown, bullet: unknown) {
      const b = bullet as Phaser.Physics.Arcade.Sprite;
      if (!b.active) return;
      
      if (b.getData('isEnemyBullet') === true) {
          this.consumeBullet(b);
          this.triggerExplosion(b.x, b.y, 10, 0xffaa00);
          SoundEffects.playExplosion();
          
          this.playerHp -= 10;
          this.updateUI();
          SoundEffects.playHit();

          EventBus.emit('debug-log-add', {
              type: 'damage',
              message: `[Damage] 自機が敵巨大母船の弾に被弾！ 10ダメージ受ける（残りHP: ${this.playerHp}）`
          });

          if (this.playerHp <= 0) {
              this.playerHpText.setText('自機大破 (GAME OVER)');
              this.playerHpText.setColor('#ff0000');
              this.triggerExplosion(this.player.x, this.player.y, 40, 0x00ffff);
              this.player.setVisible(false);
              this.triggerGameOver();
          } else {
              this.player.setTint(0xff0000);
              this.time.delayedCall(100, () => {
                  this.player.clearTint();
              });
          }
      }
  }

  private hitTurretEnemy(
    turret: unknown,
    enemy: unknown
  ) {
    const t = turret as Phaser.Physics.Arcade.Sprite;
    const e = enemy as Phaser.Physics.Arcade.Sprite;
    if (!t.active || !e.active) return;
    
    const enemyId = e.getData('enemyId') as string || 'standard';
    const config = ENEMY_CONFIGS[enemyId as keyof typeof ENEMY_CONFIGS];
    const enemyName = config ? config.name : '戦闘機';

    this.triggerExplosion(e.x, e.y, 15, 0xff5500);
    e.destroy();
    
    const currentHits = (t.getData('hits') as number ?? TURRET_CONFIGS.standard.maxHits) - 1;
    t.setData('hits', currentHits);

    EventBus.emit('debug-log-add', {
        type: 'damage',
        message: `[Damage] 防衛タレットが敵の ${enemyName} と衝突！ 耐久度: ${currentHits}/${TURRET_CONFIGS.standard.maxHits}`
    });
    
    t.setTint(0xff3333);
    this.time.delayedCall(100, () => {
        if (t.active) t.clearTint();
    });
    
    if (currentHits <= 0) {
        this.triggerExplosion(t.x, t.y, 40, 0x00ffff);
        t.destroy();
        EventBus.emit('debug-log-add', {
            type: 'system',
            message: `[System] 防衛タレットが破壊されました！`
        });
    }
  }

  private updateUI() {
    if (this.waveText) {
        const waveConfig = this.scenarioManager.getCurrentWaveConfig();
        const waveName = waveConfig ? waveConfig.name : `Wave ${this.currentWave}`;
        this.waveText.setText(`現在のWave: ${waveName}`);
    }
    if (this.baseHp > 0) {
        this.baseHpText.setText(`基地耐久値: ${this.baseHp}`);
    }
    if (this.playerHp > 0) {
        this.playerHpText.setText(`自機HP: ${this.playerHp}`);
    }
    const weaponName = WEAPON_CONFIGS[this.currentWeapon].name;
    this.pointsText.setText(`武器: ${weaponName} ([D]キーで切替)  ポイント: ${this.points} (タレット: ${TURRET_CONFIGS.standard.cost} [SPACE] / 中継レーダー: 10 [R])`);

    if (this.boostText) {
        let regenStatus = '';
        if (this.nextBoostRegenTime > 0 && this.boostCharges < 3) {
            regenStatus = ' [チャージ中...]';
        }
        this.boostText.setText(`ブースト回数: ${this.boostCharges}/3 (Wキー) ${this.isBoosting ? '[ブースト中!]' : ''}${regenStatus}`);
    }
  }

  private switchWeapon(toWeapon: 'long_range' | 'machinegun') {
    if (this.currentWeapon === toWeapon) return;

    // 現在の武器の状態を保存
    if (this.currentWeapon === 'long_range') {
        this.lastFiredLong = this.lastFired;
    } else {
        this.lastFiredMachine = this.lastFired;
    }

    this.currentWeapon = toWeapon;

    // 切り替え先の武器の状態を復元
    if (this.currentWeapon === 'long_range') {
        this.lastFired = this.lastFiredLong;
    } else {
        this.lastFired = this.lastFiredMachine;
    }

    this.updateUI();
    this.drawWeaponIndicator();
  }

  private handleScenarioAction(action: ScenarioAction) {
    try {
      switch (action.type) {
          case 'spawn_transport_ship': {
              const ship = this.spawnManager.spawnTransportShip();
              if (ship) {
                  this.transportShip = ship;
                  this.transportShipGroup.add(ship);
              }
              break;
          }

          case 'spawn_enemy': {
              const count = action.params.count || 1;
              const enemyType = action.params.enemyType || 'standard';
              const spawnSource = action.params.spawnSource || 'outpost';
              const squadronId = action.params.squadronId;

              this.spawnManager.spawnScenarioEnemy(count, enemyType, spawnSource, squadronId);
              break;
          }
          case 'spawn_ally': {
              const count = action.params.count || 1;
              for (let i = 0; i < count; i++) {
                  const x = this.base.x;
                  const y = this.base.y;
                  const ally = this.physics.add.sprite(x, y, 'ally');
                  if (ally) {
                      this.allies.add(ally);
                      ally.setScale(0.05);
                      ally.setBlendMode(Phaser.BlendModes.SCREEN);
                      ally.setData('lastFired', 0);
                      ally.setData('hp', 50);
                      ally.setData('state', 'combat');
                      ally.setTint(0x00ffaa);
                  }
              }
              EventBus.emit('debug-log-add', {
                  type: 'spawn',
                  message: `[Spawn] 味方援護機 x${count} が出現`
              });
              break;
          }
          case 'spawn_mothership': {
              const { x, y } = this.spawnManager.getMothershipSpawnCoordinates();
              const mothership = this.physics.add.sprite(x, y, 'mothership');
              if (mothership) {
                  this.motherships.add(mothership);
                  mothership.setData('hp', ENEMY_CONFIGS.mothership.hp);
                  mothership.setData('lastFired', 0);
                  mothership.setImmovable(true);
              }
              EventBus.emit('debug-log-add', {
                  type: 'spawn',
                  message: `[Spawn] 敵巨大母船が出現しました！`
              });
              break;
          }
          case 'add_points': {
              this.points += action.params.points || 0;
              this.updateUI();
              break;
          }
          case 'change_spawn_rate': {
              const newRate = action.params.rate || 2000;
              if (this.spawnEvent) {
                  this.spawnEvent.destroy();
              }
              this.spawnEvent = this.time.addEvent({
                  delay: newRate,
                  callback: this.spawnEnemy,
                  callbackScope: this,
                  loop: true
              });
              break;
          }
      }
    } catch (err) {
      console.error("Error executing scenario action:", err);
    }
  }

  private updateAllies(time: number) {
    this.allies.getChildren().forEach((child, index) => {
        const ally = child as Phaser.Physics.Arcade.Sprite;
        if (!ally.active) return;
        
        const state = ally.getData('state') as string;
        
        if (state === 'retreat') {
            this.physics.moveToObject(ally, this.base, 80);
            const targetRotation = Phaser.Math.Angle.Between(ally.x, ally.y, this.base.x, this.base.y);
            ally.rotation = Phaser.Math.Angle.RotateTo(ally.rotation, targetRotation, 0.025);
            ally.setTint(0x555555);
            
            const dist = Phaser.Math.Distance.Between(ally.x, ally.y, this.base.x, this.base.y);
            if (dist < 50) {
                ally.destroy();
                 this.time.delayedCall(30000, () => {
                     EventBus.emit('scenario-action-execute', { type: 'spawn_ally', params: { count: 1 } });
                 });
            }
            return;
        }

        // 敵との衝突回避ベクトル計算 (80px以内)
        let avoidX = 0;
        let avoidY = 0;
        this.enemies.getChildren().forEach(eChild => {
            const enemy = eChild as Phaser.Physics.Arcade.Sprite;
            if (enemy.active) {
                const dist = Phaser.Math.Distance.Between(ally.x, ally.y, enemy.x, enemy.y);
                if (dist < 80) {
                    const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, ally.x, ally.y);
                    const force = (80 - dist) * 1.5;
                    avoidX += Math.cos(angle) * force;
                    avoidY += Math.sin(angle) * force;
                }
            }
        });
        
        // 敵の索敵 (中距離 250px)
        let closestEnemy: Phaser.Physics.Arcade.Sprite | null = null;
        let closestDist = 250;

        const enemyChildren = this.enemies.getChildren() as Phaser.Physics.Arcade.Sprite[];
        for (const enemy of enemyChildren) {
            if (enemy.active) {
                const dist = Phaser.Math.Distance.Between(ally.x, ally.y, enemy.x, enemy.y);
                if (dist < closestDist) {
                    closestDist = dist;
                    closestEnemy = enemy;
                }
            }
        }

        // タレット修理接岸判定
        let targetTurret: Phaser.Physics.Arcade.Sprite | null = null;
        if (this.allyTargetPos) {
            const turretChildren = this.turrets.getChildren() as Phaser.Physics.Arcade.Sprite[];
            for (const turret of turretChildren) {
                if (turret.active) {
                    const distToTarget = Phaser.Math.Distance.Between(this.allyTargetPos.x, this.allyTargetPos.y, turret.x, turret.y);
                    if (distToTarget < 40) {
                        const distToAlly = Phaser.Math.Distance.Between(ally.x, ally.y, turret.x, turret.y);
                        if (distToAlly < 40) {
                            targetTurret = turret;
                            break;
                        }
                    }
                }
            }
        }

        // 移動および旋回ロジック
        if (targetTurret) {
            ally.body!.velocity.set(0, 0);
            
            this.allyTargetMarker.lineStyle(1.5, 0x00ffaa, 1.0);
            this.allyTargetMarker.lineBetween(ally.x, ally.y, targetTurret.x, targetTurret.y);

            const lastRepaired = ally.getData('lastRepaired') as number || 0;
            if (time > lastRepaired + 5000) {
                const currentHits = targetTurret.getData('hits') as number ?? TURRET_CONFIGS.standard.maxHits;
                if (currentHits < TURRET_CONFIGS.standard.maxHits) {
                    targetTurret.setData('hits', currentHits + 1);
                    this.triggerExplosion(targetTurret.x, targetTurret.y, 8, 0x00ffaa);
                }
                ally.setData('lastRepaired', time);
            }

            const targetRotation = Phaser.Math.Angle.Between(ally.x, ally.y, targetTurret.x, targetTurret.y);
            ally.rotation = Phaser.Math.Angle.RotateTo(ally.rotation, targetRotation, 0.025);

        } else if (this.allyTargetPos) {
            const distToTarget = Phaser.Math.Distance.Between(ally.x, ally.y, this.allyTargetPos.x, this.allyTargetPos.y);
            if (distToTarget > 50) {
                this.physics.moveToObject(ally, this.allyTargetPos, 35);
            } else {
                const angle = time * 0.002 + index * Math.PI;
                const targetX = this.allyTargetPos.x + Math.cos(angle) * 60;
                const targetY = this.allyTargetPos.y + Math.sin(angle) * 60;
                this.physics.moveTo(ally, targetX, targetY, 35);
            }

            if (avoidX !== 0 || avoidY !== 0) {
                ally.body!.velocity.x += avoidX * 0.3;
                ally.body!.velocity.y += avoidY * 0.3;
            }

            if (closestEnemy) {
                const targetRotation = Phaser.Math.Angle.Between(ally.x, ally.y, closestEnemy.x, closestEnemy.y);
                ally.rotation = Phaser.Math.Angle.RotateTo(ally.rotation, targetRotation, 0.025);
            } else {
                const moveAngle = Math.atan2(ally.body!.velocity.y, ally.body!.velocity.x);
                ally.rotation = Phaser.Math.Angle.RotateTo(ally.rotation, moveAngle, 0.025);
            }

        } else {
            const distToPlayer = Phaser.Math.Distance.Between(ally.x, ally.y, this.player.x, this.player.y);
            if (distToPlayer > 100) {
                this.physics.moveToObject(ally, this.player, 30);
                
                if (avoidX !== 0 || avoidY !== 0) {
                    ally.body!.velocity.x += avoidX * 0.3;
                    ally.body!.velocity.y += avoidY * 0.3;
                }

                if (closestEnemy) {
                    const targetRotation = Phaser.Math.Angle.Between(ally.x, ally.y, closestEnemy.x, closestEnemy.y);
                    ally.rotation = Phaser.Math.Angle.RotateTo(ally.rotation, targetRotation, 0.025);
                } else {
                    const targetRotation = Phaser.Math.Angle.Between(ally.x, ally.y, this.player.x, this.player.y);
                    ally.rotation = Phaser.Math.Angle.RotateTo(ally.rotation, targetRotation, 0.025);
                }
            } else {
                ally.body?.stop();
                
                if (avoidX !== 0 || avoidY !== 0) {
                    ally.body!.velocity.x += avoidX * 0.3;
                    ally.body!.velocity.y += avoidY * 0.3;
                }

                if (closestEnemy) {
                    const targetRotation = Phaser.Math.Angle.Between(ally.x, ally.y, closestEnemy.x, closestEnemy.y);
                    ally.rotation = Phaser.Math.Angle.RotateTo(ally.rotation, targetRotation, 0.025);
                } else {
                    ally.rotation = Phaser.Math.Angle.RotateTo(ally.rotation, this.player.rotation, 0.025);
                }
            }
        }

        if (closestEnemy) {
            const targetRotation = Phaser.Math.Angle.Between(ally.x, ally.y, closestEnemy.x, closestEnemy.y);
            const allyLastFired = ally.getData('lastFired') as number || 0;
            const angleDiff = Math.abs(Phaser.Math.Angle.Wrap(ally.rotation - targetRotation));

            if (time > allyLastFired && angleDiff < 0.17) {
                const bullet = this.allyBullets.get(ally.x, ally.y) as Phaser.Physics.Arcade.Sprite;
                if (bullet) {
                    bullet.setActive(true);
                    bullet.setVisible(true);
                    if (bullet.body) bullet.body.enable = true; // 物理ボディを有効化
                    bullet.setTint(0x00ffaa);
                    bullet.setData('startX', ally.x);
                    bullet.setData('startY', ally.y);
                    
                    const fireAngle = ally.rotation;
                    this.physics.velocityFromRotation(fireAngle, 200, bullet.body!.velocity);
                    ally.setData('lastFired', time + 5000);
                }
            }
        }
    });
  }

  private updateMotherships(time: number) {
    this.motherships.getChildren().forEach((child) => {
        const mothership = child as Phaser.Physics.Arcade.Sprite;
        
        this.physics.moveToObject(mothership, this.base, 8);
        
        const lastFired = mothership.getData('lastFired') as number || 0;
        if (time > lastFired) {
            const bullet = this.turretBullets.get(mothership.x, mothership.y) as Phaser.Physics.Arcade.Sprite;
            if (bullet) {
                bullet.setActive(true);
                bullet.setVisible(true);
                if (bullet.body) bullet.body.enable = true; // 物理ボディを有効化
                bullet.setTint(0xff3333);
                bullet.setData('isEnemyBullet', true);
                const angle = Phaser.Math.Angle.Between(mothership.x, mothership.y, this.base.x, this.base.y);
                this.physics.velocityFromRotation(angle, 75, bullet.body!.velocity); // 弾速半分(150->75)
                mothership.setData('lastFired', time + 2000);
            }
        }
    });
  }

  private hitMothership(bullet: unknown, mothership: unknown) {
    const b = bullet as Phaser.Physics.Arcade.Sprite;
    const m = mothership as Phaser.Physics.Arcade.Sprite;
    
    if (!b.active || !m.active) return;
    this.consumeBullet(b);
    this.triggerExplosion(b.x, b.y, 5, 0xffaa00);
    
    const hp = (m.getData('hp') as number || ENEMY_CONFIGS.mothership.hp) - 10;
    m.setData('hp', hp);
    m.setTint(0xff5555);
    this.time.delayedCall(100, () => {
        m.clearTint();
    });
    
    if (hp <= 0) {
        m.destroy();
        SoundEffects.playExplosion();
        this.scenarioManager.setWaveProgress('mothershipDestroyed', 1);
        this.points += ENEMY_CONFIGS.mothership.scoreValue;
        this.updateUI();
    } else {
        SoundEffects.playHit();
    }
  }

  private updateEnemySpawnRate() {
      const delay = this.spawnManager.getSpawnDelay();
      
      if (this.spawnEvent) {
          this.spawnEvent.destroy();
      }
      this.spawnEvent = this.time.addEvent({
          delay: delay,
          callback: this.spawnEnemy,
          callbackScope: this,
          loop: true
      });
  }

  private updateOutpostsSpawn(time: number) {
      // 生存している前線基地から定期的に敵戦闘機をスポーンさせる（間隔は SpawnConfig 参照）
      const spawnInterval = SPAWN_CONFIG.outpostSpawnIntervalMs;
      if (time > this.lastOutpostSpawn) {
          this.outposts.getChildren().forEach((child) => {
              const outpost = child as Phaser.Physics.Arcade.Sprite;
              if (outpost.active) {
                  this.spawnManager.spawnEnemyFromOutpost(outpost);
              }
          });
          this.lastOutpostSpawn = time + spawnInterval;
      }
  }

  private hitOutpost(bullet: unknown, outpost: unknown) {
      const b = bullet as Phaser.Physics.Arcade.Sprite;
      const o = outpost as Phaser.Physics.Arcade.Sprite;
      
      if (!b.active || !o.active) return;
      this.consumeBullet(b);
      this.triggerExplosion(b.x, b.y, 5, 0xffaa00);
      
      const isWeak = o.getData('hp') <= ENEMY_CONFIGS.outpost_weak.hp;
      const name = isWeak ? '初期周回基地' : '敵前線基地';
      const defaultHp = isWeak ? ENEMY_CONFIGS.outpost_weak.hp : ENEMY_CONFIGS.outpost.hp;

      const currentHp = (o.getData('hp') as number || defaultHp) - 10;
      o.setData('hp', currentHp);
      o.setTint(0xff55ff);
      this.time.delayedCall(100, () => {
          if (o.active) o.clearTint();
      });
      
      if (currentHp <= 0) {
          o.destroy(); // 基地オブジェクトを破棄
          SoundEffects.playExplosion();

          EventBus.emit('debug-log-add', {
              type: 'scenario',
              message: `[Scenario] ${name} を破壊しました！`
          });
          
          if (this.currentWave === 1) {
              // 初期周回基地の残存機数を集計し、進行状況を更新
              const remainingWeak = this.outposts.getChildren().filter(child => {
                  const op = child as Phaser.Physics.Arcade.Sprite;
                  return op.active && op.getData('hp') <= ENEMY_CONFIGS.outpost_weak.hp;
              }).length;
              this.scenarioManager.setWaveProgress('outpostsWeakCount', remainingWeak);
          } else {
              // 通常の基地撃破ポイント
              if (this.isPointsEnabled) {
                  this.points += ENEMY_CONFIGS.outpost.scoreValue;
              }
              this.updateUI();
              this.updateEnemySpawnRate();
              
              if (this.currentWave === 3) {
                  const remainingOutposts = this.outposts.getChildren().filter(child => {
                      const op = child as Phaser.Physics.Arcade.Sprite;
                      return op.active && op.getData('hp') > ENEMY_CONFIGS.outpost_weak.hp;
                  }).length;
                  this.scenarioManager.setWaveProgress('outpostsCount', remainingOutposts);
              }

              // 動的撃破通信をトリガー！
              this.scenarioManager.triggerDynamicEvent('outpost_destroyed');
          }
      } else {
          SoundEffects.playHit();
          EventBus.emit('debug-log-add', {
              type: 'damage',
              message: `[Damage] ${name} に被弾！ 残りHP: ${currentHp}`
          });
      }
  }

  private handleWaveTransition(nextWaveId: string) {
      // どのWaveに移行する時でも、デバッグ整合性維持のため一律クリーンアップを実行
      this.enemies.clear(true, true);
      this.motherships.clear(true, true);
      this.allies.clear(true, true);
      this.bullets.clear(true, true);
      this.turretBullets.clear(true, true);
      this.allyBullets.clear(true, true);
      
      this.outposts.clear(true, true);
      this.relays.clear(true, true);
      this.turrets.clear(true, true);

      if (this.transportShip) {
          this.transportShip.destroy();
          this.transportShip = null;
      }

      if (this.battleship) {
          this.clearBattleshipColliders();
          this.battleship.destroy();
          this.battleship = null;
      }

      this.playerHp = 100;
      this.baseHp = 100;

      if (nextWaveId === 'wave1') {
          this.currentWave = 1;
          this.isPointsEnabled = false;
          // 初期周回基地を1基リスポーン (3900, 3000 に配置、公転半径 900 に適合)
          const outpost = this.physics.add.sprite(3900, 3000, 'outpost');
          if (outpost) {
              this.outposts.add(outpost);
              outpost.setData('hp', ENEMY_CONFIGS.outpost_weak.hp);
              outpost.setImmovable(true);
          }
          this.updateUI();
      } else if (nextWaveId === 'wave2') {
          this.currentWave = 2;
          this.isPointsEnabled = true;
          this.points += 100; // タレット設置用に 100pt 付与
          
          // 輸送船をスポーン
          this.transportShip = this.spawnManager.spawnTransportShip();
          
          this.updateUI();
          this.scenarioManager.triggerDynamicEvent('wave1_cleared');
      } else if (nextWaveId === 'wave3') {
          this.currentWave = 3;
          this.isPointsEnabled = true;
          this.spawnFullOutposts();
          this.scenarioManager.setWaveProgress('outpostsCount', 4);
          this.updateUI();
      } else if (nextWaveId === 'wave4') {
          this.currentWave = 4;
          this.isPointsEnabled = true;
          this.scenarioManager.setWaveProgress('turretKills', 0);
          this.updateUI();
      } else if (nextWaveId === 'wave5') {
          this.currentWave = 5;
          this.isPointsEnabled = true;
          this.scenarioManager.setWaveProgress('mothershipDestroyed', 0);
          this.spawnBattleship();
          this.updateUI();
      }
  }

  // 四隅の前哨基地を本格スポーンさせる
  private spawnFullOutposts() {
      // マップ拡張に伴い、四隅の座標を 3倍 に広げる
      const outpostPositions = [
          { x: 600, y: 600 },
          { x: 5400, y: 600 },
          { x: 600, y: 5400 },
          { x: 5400, y: 5400 }
      ];
      outpostPositions.forEach((pos) => {
          const outpost = this.physics.add.sprite(pos.x, pos.y, 'outpost');
          if (outpost) {
              this.outposts.add(outpost);
              outpost.setData('hp', ENEMY_CONFIGS.outpost.hp);
              outpost.setImmovable(true);
          }
      });
      this.updateEnemySpawnRate();
  }

  // ===== Wave 5 ボス（巨大戦列艦） =====

  private spawnBattleship() {
      // 基地の北 約1500px に出現し、基地へ進軍する
      const boss = new Battleship(this, this.base, (x, y, n, tint) => this.triggerExplosion(x, y, n, tint));
      boss.spawn(this.base.x, this.base.y - 1500);
      this.battleship = boss;

      // 砲撃完了 → 基地ダメージ＋ビーム即死判定
      boss.onCannonFire = () => this.onBattleshipCannonFire(boss);
      // 進軍を止められず基地へ到達 → 大ダメージ
      boss.onReachBase = () => {
          this.baseHp = Math.max(0, this.baseHp - BOSS_CONFIG.battleship.reachBaseDamage);
          this.updateUI();
          if (this.baseHp <= 0) {
              this.baseHpText.setText('基地崩壊 (GAME OVER)');
              this.baseHpText.setColor('#ff0000');
              this.triggerGameOver();
          }
      };
      // 波動砲破壊で撃破 → Wave5 クリア（既存の destroyCarrierMothership 条件を流用）
      // destroyShip() 側で既にスプライト破棄済み。ここでは MainScene 側のコライダー撤去と参照解放のみ行う
      boss.onDefeated = () => {
          SoundEffects.playExplosion();
          this.scenarioManager.setWaveProgress('mothershipDestroyed', 1);
          this.clearBattleshipColliders();
          this.battleship = null;
      };
      // 発射台からの敵射出 → 既存スポーン経路で単機生成
      boss.onLaunch = (x, y, kind) => this.spawnManager.spawnFromLaunchBay(x, y, kind);

      this.battleshipColliders = [
          // 自機は巨大戦艦の船体を通り抜けられない（ダメージなしの物理ブロック。母船/前哨と同じ扱い）
          this.physics.add.collider(this.player, boss.hull),
          // 機関は全武器で破壊可（敵弾は checkEnemyBulletHit で除外）
          this.physics.add.collider(this.bullets, boss.engines, (b, e) => this.onBulletHitEngine(boss, b, e), this.checkEnemyBulletHit, this),
          this.physics.add.collider(this.turretBullets, boss.engines, (b, e) => this.onBulletHitEngine(boss, b, e), this.checkEnemyBulletHit, this),
          this.physics.add.collider(this.allyBullets, boss.engines, (b, e) => this.onBulletHitEngine(boss, b, e), undefined, this),
          // 波動砲は自機の長距離弾のみ・露出(チャージ)中のみ（process で限定）
          this.physics.add.collider(
              this.bullets, boss.cannonGroup,
              (b) => this.onBulletHitCannon(boss, b),
              (b) => (b as Phaser.Physics.Arcade.Sprite).getData('weaponType') === 'long_range' && boss.getState().isCharging(),
              this,
          ),
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
      ];
  }

  /** spawnBattleship で登録したコライダーを撤去する（Wave遷移・撃破時に呼ぶ）。 */
  private clearBattleshipColliders() {
      for (const c of this.battleshipColliders) {
          c.destroy();
      }
      this.battleshipColliders = [];
  }

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
      // コライダーの process でも限定しているが、誤接続に備えて防御的に再確認
      if (b.getData('weaponType') !== 'long_range' || !boss.getState().isCharging()) return;
      this.consumeBullet(b);
      this.triggerExplosion(b.x, b.y, 8, 0x00ffff);
      boss.hitCannonByLongRange();
  }

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

  // 波動砲チャージ完了：ビーム経路に自機がいれば即死、そうでなければ基地に大ダメージ
  private onBattleshipCannonFire(boss: Battleship) {
      const c = boss.cannon;
      const d = this.distToSegment(this.player.x, this.player.y, c.x, c.y, this.base.x, this.base.y);
      if (d < 40) {
          this.triggerExplosion(this.player.x, this.player.y, 40, 0x00ffff);
          this.player.setVisible(false);
          this.playerHpText.setText('自機大破 (GAME OVER)');
          this.playerHpText.setColor('#ff0000');
          this.triggerGameOver();
          return;
      }
      this.baseHp = Math.max(0, this.baseHp - BOSS_CONFIG.battleship.cannon.baseDamage);
      this.updateUI();
      SoundEffects.playExplosion();
      if (this.baseHp <= 0) {
          this.baseHpText.setText('基地崩壊 (GAME OVER)');
          this.baseHpText.setColor('#ff0000');
          this.triggerGameOver();
      }
  }

  // 点(px,py)と線分(ax,ay)-(bx,by)の距離
  private distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
      const dx = bx - ax, dy = by - ay;
      const len2 = dx * dx + dy * dy;
      let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      const cx = ax + t * dx, cy = ay + t * dy;
      return Math.hypot(px - cx, py - cy);
  }

  // 索敵サークルを合算し、スキャン成功した敵のみをReactのRadarUIに非同期送信
  private sendRadarData() {
      // 1. 索敵サークル（Vision Circles）の集計
      const visionCircles: { x: number; y: number; range: number }[] = [];
      
      // 自機: 範囲 150px
      visionCircles.push({ x: this.player.x, y: this.player.y, range: 150 });
      
      // 本部: 範囲 300px
      visionCircles.push({ x: this.base.x, y: this.base.y, range: 300 });
      
      // タレット: 範囲 100px
      this.turrets.getChildren().forEach((child) => {
          const t = child as Phaser.Physics.Arcade.Sprite;
          if (t.active) {
              visionCircles.push({ x: t.x, y: t.y, range: 100 });
          }
      });
      
      // 中継器: 範囲 250px
      this.relays.getChildren().forEach((child) => {
          const r = child as Phaser.Physics.Arcade.Sprite;
          if (r.active) {
              visionCircles.push({ x: r.x, y: r.y, range: 250 });
          }
      });

      // 補助関数: ある座標がいずれかの索敵サークル内にあるか判定
      const isInVision = (x: number, y: number): boolean => {
          if (this.radarDebugMode) return true;
          for (const circle of visionCircles) {
              const dist = Phaser.Math.Distance.Between(x, y, circle.x, circle.y);
              if (dist <= circle.range) {
                  return true;
              }
          }
          return false;
      };

      // 2. 敵オブジェクトのスキャン（Wave 1〜3では常時表示、それ以外は見えている敵のみ）
      const radarEnemies: { x: number; y: number }[] = [];
      this.enemies.getChildren().forEach((child) => {
          const e = child as Phaser.Physics.Arcade.Sprite;
          const isAlwaysVisible = this.scenarioManager.getCurrentWaveConfig()?.rules.radarAlwaysVisible ?? (this.currentWave <= 3);
          if (e.active && (isAlwaysVisible || isInVision(e.x, e.y))) {
              radarEnemies.push({ x: e.x, y: e.y });
          }
      });

      const radarMotherships: { x: number; y: number }[] = [];
      this.motherships.getChildren().forEach((child) => {
          const m = child as Phaser.Physics.Arcade.Sprite;
          if (m.active && isInVision(m.x, m.y)) {
              radarMotherships.push({ x: m.x, y: m.y });
          }
      });

      // Wave5 ボス：巨大戦列艦は常時レーダー表示（巨大な脅威のため）。船体＋残存機関をプロット
      if (this.battleship && this.battleship.hull && this.battleship.hull.active) {
          radarMotherships.push({ x: this.battleship.hull.x, y: this.battleship.hull.y });
          this.battleship.engines.getChildren().forEach((child) => {
              const e = child as Phaser.Physics.Arcade.Sprite;
              if (e.active) radarMotherships.push({ x: e.x, y: e.y });
          });
      }

      const radarOutposts: { x: number; y: number }[] = [];
      this.outposts.getChildren().forEach((child) => {
          const o = child as Phaser.Physics.Arcade.Sprite;
          if (o.active && isInVision(o.x, o.y)) {
              radarOutposts.push({ x: o.x, y: o.y });
          }
      });

      // 3. 味方・インフラ（これらは最初から位置がわかっている、または見えている前提）
      const radarTurrets = this.turrets.getChildren()
          .filter(t => t.active)
          .map(t => ({ x: (t as Phaser.Physics.Arcade.Sprite).x, y: (t as Phaser.Physics.Arcade.Sprite).y }));

      const radarRelays = this.relays.getChildren()
          .filter(r => r.active)
          .map(r => ({ x: (r as Phaser.Physics.Arcade.Sprite).x, y: (r as Phaser.Physics.Arcade.Sprite).y }));

      const radarAllies = this.allies.getChildren()
          .filter(a => a.active)
          .map(a => ({ x: (a as Phaser.Physics.Arcade.Sprite).x, y: (a as Phaser.Physics.Arcade.Sprite).y }));

      const radarTransportShip = this.transportShip && this.transportShip.active
          ? { x: this.transportShip.x, y: this.transportShip.y }
          : null;

      const radarData = {
          player: {
              x: this.player.x,
              y: this.player.y,
              rotation: this.player.rotation
          },
          base: {
              x: this.base.x,
              y: this.base.y
          },
          camera: {
              x: this.cameras.main.worldView.x,
              y: this.cameras.main.worldView.y,
              width: this.cameras.main.worldView.width,
              height: this.cameras.main.worldView.height
          },
          turrets: radarTurrets,
          relays: radarRelays,
          enemies: radarEnemies,
          motherships: radarMotherships,
          outposts: radarOutposts,
          allies: radarAllies,
          visionCircles: visionCircles,
          transportShip: radarTransportShip
      };

      // 非同期・例外安全でEventBus送信
      setTimeout(() => {
          try {
              EventBus.emit('radar-update', radarData);
          } catch (err) {
              console.error("Radar data emission error:", err);
          }
      }, 0);
  }

  // 極小スラスターパーティクルの動的生成
  private spawnThrusterParticle(x: number, y: number, angle: number, speed: number, tint: number) {
      const p = this.thrusterParticles.create(x, y, 'bullet') as Phaser.Physics.Arcade.Sprite;
      if (p) {
          p.setScale(Phaser.Math.FloatBetween(0.15, 0.3));
          p.setTint(tint);
          p.setAlpha(1);
          
          // 微少なばらつきを持たせる
          const finalAngle = angle + Phaser.Math.FloatBetween(-0.15, 0.15);
          const finalSpeed = speed * Phaser.Math.FloatBetween(0.7, 1.3);
          
          this.physics.velocityFromRotation(finalAngle, finalSpeed, p.body!.velocity);
          
          // 寿命（ミリ秒）
          p.setData('life', Phaser.Math.Between(150, 300));
      }
  }

  // 毎フレームのパーティクル状態更新 (縮小・透明化・寿命消滅)
  private updateThrusterParticles() {
      this.thrusterParticles.getChildren().forEach((child) => {
          const p = child as Phaser.Physics.Arcade.Sprite;
          if (p.active) {
              let life = p.getData('life') as number || 0;
              life -= 16.6; // 1フレーム約16.6ms
              p.setData('life', life);
              
              p.setScale(p.scaleX * 0.94);
              p.setAlpha(Math.max(0, life / 300));
              
              if (life <= 0) {
                  p.destroy();
              }
          }
      });
  }

  // 画面下部に射撃クールダウンチャージゲージを描画
  private drawCooldownGauge(time: number) {
    this.cooldownGraphics.clear();

    const cam = this.cameras.main;
    const Z = cam.zoom;
    const uiScale = 1 / Z;
    const cX = cam.width / 2;
    const cY = cam.height / 2;
    
    // 画面下部中央付近に表示 (X_target = cX - 200, Y_target = 1040)
    const barW = 400 * uiScale; 
    const barH = 12 * uiScale; 
    const barX = cX - 200 * uiScale;
    const barY = cY + (1040 - cY) * uiScale; 

    // クールダウン計算
    const cooldownDuration = WEAPON_CONFIGS[this.currentWeapon].cooldownMs;
    const elapsedSinceLastFire = time - (this.lastFired - cooldownDuration);
    const progress = Phaser.Math.Clamp(elapsedSinceLastFire / cooldownDuration, 0, 1);

    // バーの左側にテキストを表示・更新 (X_target = 750, Y_target = 1046)
    const textX = cX + (750 - cX) * uiScale;
    const textY = cY + (1046 - cY) * uiScale;
    this.cooldownWeaponText.setPosition(textX, textY);
    if (this.currentWeapon === 'long_range') {
        this.cooldownWeaponText.setText('長距離弾');
        this.cooldownWeaponText.setColor('#00ffff');
    } else {
        this.cooldownWeaponText.setText('マシンガン');
        this.cooldownWeaponText.setColor('#ffaa00');
    }

    // 枠線の背景 (ダークネイビー透過)
    this.cooldownGraphics.fillStyle(0x0a0f1d, 0.7);
    this.cooldownGraphics.fillRect(barX, barY, barW, barH);

    // チャージの進捗バー (選択している武器によってバーの色を変える)
    if (progress < 1) {
      // チャージ中 (長距離弾はダークシアン、マシンガンはダークオレンジ)
      const chargeColor = this.currentWeapon === 'long_range' ? 0x083344 : 0x451a03; 
      this.cooldownGraphics.fillStyle(chargeColor, 1); 
      this.cooldownGraphics.fillRect(barX, barY, barW * progress, barH);
    } else {
      // チャージ完了 (長距離弾は明るいシアン、マシンガンは明るいオレンジ)
      const readyColor = this.currentWeapon === 'long_range' ? 0x06b6d4 : 0xffaa00; 
      this.cooldownGraphics.fillStyle(readyColor, 1); 
      this.cooldownGraphics.fillRect(barX, barY, barW, barH);
      
      // 発射可能時の外枠発光エフェクト (武器に応じたネオンカラー)
      const glowColor = this.currentWeapon === 'long_range' ? 0x22d3ee : 0xffd700;
      this.cooldownGraphics.lineStyle(2 * uiScale, glowColor, 1);
      this.cooldownGraphics.strokeRect(barX - 2 * uiScale, barY - 2 * uiScale, barW + 4 * uiScale, barH + 4 * uiScale);
    }

    // 外枠の細い線
    this.cooldownGraphics.lineStyle(1.5 * uiScale, 0x1e293b, 1);
    this.cooldownGraphics.strokeRect(barX, barY, barW, barH);
  }

  // 味方機の指令マーカーを描画
  private drawAllyTargetMarker(time: number) {
    this.allyTargetMarker.clear();
    if (this.allyTargetPos) {
      const remainingTime = 15000 - (time - this.allyTargetSetTime);
      if (remainingTime > 0) {
        // パルス（点滅）アニメーション用の半径
        const pulse = 8 + Math.sin(time * 0.015) * 3;
        
        // ターゲット円を描画 (ネオングリーン)
        this.allyTargetMarker.lineStyle(1.5, 0x00ffaa, 0.8);
        this.allyTargetMarker.strokeCircle(this.allyTargetPos.x, this.allyTargetPos.y, pulse);
        
        this.allyTargetMarker.fillStyle(0x00ffaa, 0.4);
        this.allyTargetMarker.fillCircle(this.allyTargetPos.x, this.allyTargetPos.y, 3);

        // 指令の有効期限インジケータ（縮小する外枠リング）
        const outerRadius = 16 * (remainingTime / 15000);
        this.allyTargetMarker.lineStyle(1, 0x00ffaa, 0.3);
        this.allyTargetMarker.strokeCircle(this.allyTargetPos.x, this.allyTargetPos.y, outerRadius);
      }
    }
  }

  // 画面上部中央に現在の武器インジケータを描画
  private drawWeaponIndicator() {
    this.indicatorGraphics.clear();
    const cam = this.cameras.main;
    const Z = cam.zoom;
    const uiScale = 1 / Z;
    const cX = cam.width / 2;
    const cY = cam.height / 2;

    // パネル全体の背景 (X_target = cX - 210, Y_target = 2)
    const panelWidth = 420 * uiScale;
    const panelHeight = 36 * uiScale;
    const px = cX - 210 * uiScale;
    const py = cY + (2 - cY) * uiScale;

    this.indicatorGraphics.fillStyle(0x0a0f1d, 0.8);
    this.indicatorGraphics.lineStyle(1.5 * uiScale, 0x1e293b, 1);
    this.indicatorGraphics.fillRoundedRect(px, py, panelWidth, panelHeight, 8 * uiScale);
    this.indicatorGraphics.strokeRoundedRect(px, py, panelWidth, panelHeight, 8 * uiScale);

    // 仕切り線
    this.indicatorGraphics.lineStyle(1 * uiScale, 0x1e293b, 1);
    this.indicatorGraphics.lineBetween(cX, py, cX, py + panelHeight);

    // 選択されている側のハイライト枠を描画 (Y_target = 8)
    const itemWidth = 175 * uiScale;
    const itemHeight = 24 * uiScale;
    const itemY = cY + (8 - cY) * uiScale;

    if (this.currentWeapon === 'long_range') {
        // 長距離弾のアクティブ枠
        const itemX = cX - 200 * uiScale;
        this.indicatorGraphics.fillStyle(0x00ffff, 0.15);
        this.indicatorGraphics.lineStyle(2 * uiScale, 0x00ffff, 1);
        this.indicatorGraphics.fillRoundedRect(itemX, itemY, itemWidth, itemHeight, 4 * uiScale);
        this.indicatorGraphics.strokeRoundedRect(itemX, itemY, itemWidth, itemHeight, 4 * uiScale);

        // テキストカラーの更新
        this.weaponTextLong.setColor('#00ffff');
        this.weaponTextMachine.setColor('#64748b');
    } else {
        // 短距離マシンガンのアクティブ枠
        const itemX = cX + 25 * uiScale;
        this.indicatorGraphics.fillStyle(0xffaa00, 0.15);
        this.indicatorGraphics.lineStyle(2 * uiScale, 0xffaa00, 1);
        this.indicatorGraphics.fillRoundedRect(itemX, itemY, itemWidth, itemHeight, 4 * uiScale);
        this.indicatorGraphics.strokeRoundedRect(itemX, itemY, itemWidth, itemHeight, 4 * uiScale);

        // テキストカラーの更新
        this.weaponTextLong.setColor('#64748b');
        this.weaponTextMachine.setColor('#ffaa00');
    }
  }

  private hitTransportEnemy(transportShip: unknown, enemy: unknown) {
      const ship = transportShip as Phaser.Physics.Arcade.Sprite;
      const e = enemy as Phaser.Physics.Arcade.Sprite;
      if (!ship.active || !e.active) return;

      const enemyId = e.getData('enemyId') as string || 'standard';
      const config = ENEMY_CONFIGS[enemyId as keyof typeof ENEMY_CONFIGS];
      const enemyName = config ? config.name : '戦闘機';

      this.triggerExplosion(e.x, e.y, 15, 0xff5500);
      this.checkAndSplitNextEnemy(e);
      e.destroy();

      const currentHp = (ship.getData('hp') as number || 100) - 10;
      ship.setData('hp', currentHp);

      EventBus.emit('debug-log-add', {
          type: 'damage',
          message: `[Damage] 輸送船が敵の ${enemyName} から特攻！ 10ダメージ受ける（残りHP: ${currentHp}）`
      });

      ship.setTint(0xff3333);
      this.time.delayedCall(100, () => {
          if (ship.active) ship.clearTint();
      });

      if (currentHp <= 0) {
          this.triggerExplosion(ship.x, ship.y, 40, 0x00ff66);
          ship.destroy();
          this.transportShip = null;
          
          EventBus.emit('debug-log-add', {
              type: 'system',
              message: '[System] 輸送船が大破しました！ (GAME OVER)'
          });
          
          this.playerHpText.setText('輸送船大破 (GAME OVER)');
          this.playerHpText.setColor('#ff0000');
          this.triggerGameOver();
      }
  }

  private hitTransportBullet(transportShip: unknown, bullet: unknown) {
      const ship = transportShip as Phaser.Physics.Arcade.Sprite;
      const b = bullet as Phaser.Physics.Arcade.Sprite;
      if (!ship.active || !b.active) return;

      if (b.getData('isEnemyBullet') === true) {
          this.consumeBullet(b);
          this.triggerExplosion(b.x, b.y, 5, 0xffaa00);

          const currentHp = (ship.getData('hp') as number || 100) - 5;
          ship.setData('hp', currentHp);

          EventBus.emit('debug-log-add', {
              type: 'damage',
              message: `[Damage] 輸送船が敵の弾に被弾！ 5ダメージ受ける（残りHP: ${currentHp}）`
          });

          ship.setTint(0xff3333);
          this.time.delayedCall(100, () => {
              if (ship.active) ship.clearTint();
          });

          if (currentHp <= 0) {
              this.triggerExplosion(ship.x, ship.y, 40, 0x00ff66);
              ship.destroy();
              this.transportShip = null;
              
              EventBus.emit('debug-log-add', {
                  type: 'system',
                  message: '[System] 輸送船が大破しました！ (GAME OVER)'
              });
              
              this.playerHpText.setText('輸送船大破 (GAME OVER)');
              this.playerHpText.setColor('#ff0000');
              this.triggerGameOver();
          }
      }
  }

  private checkAndSplitNextEnemy(e: Phaser.Physics.Arcade.Sprite) {
      const aiState = e.getData('aiState');
      if (aiState && aiState.squadronId && aiState.pattern === 'rush_target') {
          const squadId = aiState.squadronId;
          
          const siblings = this.enemies.getChildren().filter((child) => {
              const sib = child as Phaser.Physics.Arcade.Sprite;
              if (sib === e || !sib.active) return false;
              const sibState = sib.getData('aiState');
              return sibState && sibState.squadronId === squadId;
          }) as Phaser.Physics.Arcade.Sprite[];

          const alreadyTracking = siblings.some(sib => {
              const sibState = sib.getData('aiState');
              return sibState && sibState.pattern === 'rush_target';
          });

          if (!alreadyTracking && siblings.length > 0) {
              const nextLeader = siblings.find(sib => {
                  const sibState = sib.getData('aiState');
                  return sibState && sibState.pattern !== 'rush_target';
              });

              if (nextLeader) {
                  const nextState = nextLeader.getData('aiState');
                  nextState.pattern = 'rush_target';
                  nextState.target = this.player;
                  nextState.speed = (nextState.speed || 25) * 1.4;
                  nextLeader.setData('aiState', nextState);

                  EventBus.emit('debug-log-add', {
                      type: 'system',
                      message: `[AI] 編隊 "${squadId}" の追尾機が撃破されたため、次の1機が自機迎撃へスプリットしました`
                  });
              }
          }
      }
  }

}
