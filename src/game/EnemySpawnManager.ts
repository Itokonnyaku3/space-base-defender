import Phaser from 'phaser';
import { ENEMY_CONFIGS } from './configs/EnemyConfig';
import type { AIState } from './ai/EnemyPatternDB';
import { EventBus } from './EventBus';

/**
 * 敵の出現（スポーン）条件や座標計算、湧きルールを専門に管理するクラスです。
 * 日本語コメントにより、どういった仕組みで敵が湧くのかを明確に定義しています。
 * 
 * 【開発規約：外だし設定（Source of Truth）の一貫性ルール】
 * - ゲーム内に出現するすべての敵キャラクターは、必ず EnemyConfig.ts に定義されたキャラクターIDのいずれかに属していなければなりません。
 * - プログラム側（Phaser / スポーン処理等）で、特定の敵IDに対して手動でHPや速度などのパラメータを上書き・つぎはぎ設定するコードの記述を一切禁止します。
 * - すべての敵は、設定ファイルに定義された hp, speed, aiPattern をそのまま読み込んで適用しなければなりません。
 */
export class EnemySpawnManager {
    private scene: Phaser.Scene;
    private base: Phaser.Physics.Arcade.Sprite;
    private outposts: Phaser.Physics.Arcade.Group;
    private enemies: Phaser.Physics.Arcade.Group;

    constructor(
        scene: Phaser.Scene,
        base: Phaser.Physics.Arcade.Sprite,
        outposts: Phaser.Physics.Arcade.Group,
        enemies: Phaser.Physics.Arcade.Group
    ) {
        this.scene = scene;
        this.base = base;
        this.outposts = outposts;
        this.enemies = enemies;
    }

    /**
     * 指定された出現元（spawnSource）に基づいて、スポーン座標 (x, y) を算出します。
     * 
     * 1. 'outpost': 生存している敵前線基地の座標からランダムに選びます。
     *              Wave 1では本部を公転している1機の前線基地、Wave 2では四隅に配置された前線基地のいずれかになります。
     *              生存している前線基地がない場合は、安全のため画面外からスポーンさせます。
     * 2. 'screen_edge': 画面（カメラ）のすぐ外側（マージン100px）から出現させます。
     *                  これにより、スポーン後即座にプレイヤーの視界へ入ってくるようになります。
     * 3. 'base': プレイヤーの拠点である本部基地（base）の周囲（半径450px）のランダムな円周上の座標から出現させます。
     */
    public getSpawnCoordinates(spawnSource: 'outpost' | 'screen_edge' | 'base'): { x: number; y: number } {
        let x = 3000;
        let y = 3000;

        if (spawnSource === 'outpost') {
            // 生存している敵前哨基地リストを取得
            const activeOutposts = this.outposts.getChildren().filter(o => o.active) as Phaser.Physics.Arcade.Sprite[];
            if (activeOutposts.length > 0) {
                // 生存基地のいずれかの位置から湧かせる
                const op = activeOutposts[Math.floor(Math.random() * activeOutposts.length)];
                x = op.x;
                y = op.y;
            } else {
                // 前線基地が全滅している場合は、画面外から出現
                return this.getSpawnCoordinates('screen_edge');
            }
        } else if (spawnSource === 'base') {
            // 本部基地の近く (半径450pxの円周上のランダムな角度)
            const angle = Math.random() * Math.PI * 2;
            const dist = 450;
            x = this.base.x + Math.cos(angle) * dist;
            y = this.base.y + Math.sin(angle) * dist;
        } else {
            // 画面外 (カメラの視界の外側100pxマージン)
            const cam = this.scene.cameras.main;
            const margin = 100;
            if (Math.random() > 0.5) {
                x = Math.random() > 0.5 ? cam.scrollX - margin : cam.scrollX + cam.width + margin;
                y = cam.scrollY + Math.random() * cam.height;
            } else {
                x = cam.scrollX + Math.random() * cam.width;
                y = Math.random() > 0.5 ? cam.scrollY - margin : cam.scrollY + cam.height + margin;
            }
        }

        // マップの境界線 (0〜6000px) を超えないようにクランプ処理
        x = Phaser.Math.Clamp(x, 50, 5950);
        y = Phaser.Math.Clamp(y, 50, 5950);

        return { x, y };
    }

    /**
     * 前線基地の生存数に基づいて、自動湧きの発生間隔ディレイ（ミリ秒）を算出します。
     * 基地が多いほど猛攻になり、壊すごとに湧きペースが穏やかになります。
     * 
     * - 基地4つ生存: 6秒 (6000ms)
     * - 基地3つ生存: 8秒 (8000ms)
     * - 基地2つ生存: 11秒 (11000ms)
     * - 基地1つ生存: 15秒 (15000ms)
     * - 基地0個（全滅）: 20秒 (20000ms)
     */
    public getSpawnDelay(): number {
        const activeOutpostsCount = this.outposts.getChildren().filter(o => o.active).length;
        const currentWave = (this.scene as any).scenarioManager?.getCurrentWaveId() || 'wave1';

        // Wave 2 は輸送船護衛のため、自動湧き間隔を長め（14秒）に設定
        if (currentWave === 'wave2') {
            return 14000;
        }
        
        if (activeOutpostsCount === 4) return 9000;
        if (activeOutpostsCount === 3) return 12000;
        if (activeOutpostsCount === 2) return 16000;
        if (activeOutpostsCount === 1) return 22000;
        return 28000; // 0個のときは28秒間隔
    }

    /**
     * 一定時間ごとに呼び出される自動湧き（定期敵発生）のメイン処理です。
     * Wave 1中か、それ以降かで出現位置のルールを切り替えます。
     * 
     * - Wave 1中: 敵前線基地（outpost）の近くから湧きます（プレイヤーに敵の出所を気づかせるため）。
     * - Wave 2以降: 画面外（screen_edge）から湧きます（四方八方からの襲撃を表現するため）。
     * 
     * また、25%の確率で4機編隊 (squadron_attacker)、75%の確率で単機 (standard) をスポーンさせます。
     * 
     * @param currentWave 現在のWave番号 (1 or 2)
     */
    public spawnPeriodicEnemy(currentWave: number) {
        if (currentWave === 2) {
            // Wave 2 は常に 3機編隊で、輸送船の後方からスポーンさせる
            // （spawnScenarioEnemy 内部で wave2 用の後方座標を再計算するため、ここで座標を渡す必要はない）
            this.spawnScenarioEnemy(3, 'squadron_split_target', 'screen_edge', 'squad_auto_' + Date.now());
            return;
        }

        // Wave 1 も自動湧きは 3機編隊（squadron_attacker）に統一する
        const spawnSource = 'outpost';
        const { x, y } = this.getSpawnCoordinates(spawnSource);
        this.spawnSquadron(x, y);
    }

    /**
     * シナリオイベントや自動湧きから、指定編成数（通常は3機）のグループ（編隊）をスポーンさせます。
     * 
     * @param x スポーン基準X座標
     * @param y スポーン基準Y座標
     * @param squadronId 指定のスコードロンID（省略時は自動生成）
     */
    public spawnSquadron(x: number, y: number, squadronId?: string) {
        const squadId = squadronId || 'squad_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
        const config = ENEMY_CONFIGS.squadron_attacker;
        const count = config.defaultSpawnCount || 3;

        for (let i = 0; i < count; i++) {
            // 編隊が綺麗にバラけるように少しずらす
            const offsetX = (Math.random() - 0.5) * 150;
            const offsetY = (Math.random() - 0.5) * 150;
            
            const enemy = this.enemies.create(x + offsetX, y + offsetY, 'enemy') as Phaser.Physics.Arcade.Sprite;
            if (enemy) {
                enemy.setScale(0.04);
                enemy.setBlendMode(Phaser.BlendModes.SCREEN);
                enemy.setData('enemyId', 'squadron_attacker');
                enemy.setData('hp', config.hp); // HP: 10
                enemy.setData('aiState', {
                    pattern: config.aiPattern, // squadron_circle (らせん旋回)
                    speed: config.speed,
                    squadronId: squadId,
                    splitRole: (i % 2 === 0) ? 'base' : 'player' // スプリット時の目標分担
                } as AIState);
            }
        }

        EventBus.emit('debug-log-add', {
            type: 'spawn',
            message: `[Spawn] 敵編隊 ${count}機 (編隊ID: ${squadId}) が出現`
        });
    }

    /**
     * シナリオイベントに基づいて指定の敵（standard, single_circle, squadron_attacker）をスポーンさせます。
     * 唯一の真実のソース（Source of Truth）設計に従い、渡された敵キャラクターIDのパラメータをそのまま適用します。
     * 
     * @param count スポーンさせる数
     * @param enemyId 敵キャラクターID（'standard' | 'single_circle' | 'squadron_attacker'）
     * @param spawnSource 出現元（'outpost' | 'screen_edge' | 'base'）
     * @param squadronId 指定のスコードロンID（編隊時のみ使用）
     */
    public spawnScenarioEnemy(
        count: number,
        enemyId: 'standard' | 'single_circle' | 'squadron_attacker' | 'squadron_split_target' | 'suicide_bomber',
        spawnSource: 'outpost' | 'screen_edge' | 'base',
        squadronId?: string
    ) {
        const currentWave = (this.scene as any).scenarioManager?.getCurrentWaveId() || 'wave1';
        let targetCount = count;
        let targetEnemyId = enemyId;
        let spawnX: number;
        let spawnY: number;

        if (targetEnemyId === 'suicide_bomber') {
            // 自爆機がシナリオから指定された場合、特別3機編成（自爆1機+護衛2機）としてスポーン
            const coords = this.getSpawnCoordinates(spawnSource);
            this.spawnSuicideSquadron(coords.x, coords.y, squadronId);
            return;
        }

        if (currentWave === 'wave2') {
            // Wave 2では、出現機数を強制的に3に、敵種別をsquadron_split_targetに、スポーン座標を後方に強制上書き
            targetCount = 3;
            targetEnemyId = 'squadron_split_target';
            const behindCoords = this.getTransportBehindSpawnCoordinates();
            spawnX = behindCoords.x;
            spawnY = behindCoords.y;
        } else {
            const coords = this.getSpawnCoordinates(spawnSource);
            spawnX = coords.x;
            spawnY = coords.y;
        }

        const config = ENEMY_CONFIGS[targetEnemyId];
        if (!config) return;

        if (targetEnemyId === 'squadron_attacker' || targetEnemyId === 'squadron_split_target') {
            // 編隊攻撃機の場合は、3機（あるいは指定数）が等間隔で斜めに並ぶスコードロン編成として特別にスポーン
            const squadId = squadronId || 'squad_' + Date.now();

            for (let i = 0; i < targetCount; i++) {
                const randX = Phaser.Math.FloatBetween(-25, 25);
                const randY = Phaser.Math.FloatBetween(-25, 25);
                const offsetX = (i - (targetCount - 1) / 2) * 50 + randX;
                const offsetY = (i - (targetCount - 1) / 2) * 50 + randY;
                
                const enemy = this.enemies.create(spawnX + offsetX, spawnY + offsetY, 'enemy') as Phaser.Physics.Arcade.Sprite;
                if (enemy) {
                    enemy.setScale(0.04);
                    enemy.setBlendMode(Phaser.BlendModes.SCREEN);
                    enemy.setData('enemyId', targetEnemyId);
                    enemy.setData('hp', config.hp);
                    enemy.setData('aiState', {
                        pattern: config.aiPattern, // squadron_circle
                        speed: config.speed,
                        squadronId: squadId,
                        splitRole: (i % 2 === 0) ? 'base' : 'player' // スプリット時の目標分担
                    } as AIState);
                }
            }
            EventBus.emit('debug-log-add', {
                type: 'spawn',
                message: `[Spawn] 敵機 ${config.name} ${targetCount}機編成 (${squadId}) が出現`
            });
        } else {
            // 単機（standard や single_circle）の場合は、共通 of ジェネリックスポーン
            for (let i = 0; i < targetCount; i++) {
                const offsetX = (Math.random() - 0.5) * 60;
                const offsetY = (Math.random() - 0.5) * 60;
                
                const enemy = this.enemies.create(spawnX + offsetX, spawnY + offsetY, 'enemy') as Phaser.Physics.Arcade.Sprite;
                if (enemy) {
                    enemy.setScale(0.04);
                    enemy.setBlendMode(Phaser.BlendModes.SCREEN);
                    enemy.setData('enemyId', targetEnemyId);
                    enemy.setData('hp', config.hp); // 外だし設定からHPを取得
                    enemy.setData('aiState', {
                        pattern: config.aiPattern, // 外だし設定からAIパターンを取得
                        speed: config.speed // 外だし設定から速度を取得
                    } as AIState);
                }
            }
            EventBus.emit('debug-log-add', {
                type: 'spawn',
                message: `[Spawn] 敵機 ${config.name} x${targetCount} が出現`
            });
        }
    }

    /**
     * 巨大母船ボスの出現座標を算出します。
     * 本部から800px離れたランダムな角度の位置になります。
     */
    public getMothershipSpawnCoordinates(): { x: number; y: number } {
        const angle = Math.random() * Math.PI * 2;
        const dist = 800;
        
        let x = this.base.x + Math.cos(angle) * dist;
        let y = this.base.y + Math.sin(angle) * dist;

        x = Phaser.Math.Clamp(x, 100, 5900);
        y = Phaser.Math.Clamp(y, 100, 5900);

        return { x, y };
    }

    /**
     * 前線基地（outpost）の位置から standard 敵を1機スポーンさせます。
     */
    public spawnEnemyFromOutpost(outpost: Phaser.Physics.Arcade.Sprite) {
        const enemy = this.enemies.create(outpost.x, outpost.y, 'enemy') as Phaser.Physics.Arcade.Sprite;
        if (enemy) {
            enemy.setScale(0.04);
            enemy.setBlendMode(Phaser.BlendModes.SCREEN);
            enemy.setData('enemyId', 'standard');
            enemy.setData('hp', ENEMY_CONFIGS.standard.hp); // HP: 10
            enemy.setData('aiState', {
                pattern: ENEMY_CONFIGS.standard.aiPattern, // rush_base
                speed: ENEMY_CONFIGS.standard.speed
            } as AIState);
        }
    }
    /**
     * 輸送船を画面外の特定位置からスポーンさせます。
     */
    public spawnTransportShip(): Phaser.Physics.Arcade.Sprite {
        // 自基地 (3000, 3000) から離れた画面外 (例: 1000, 1000 付近) に配置
        const x = 1000;
        const y = 1000;
        
        const ship = this.scene.physics.add.sprite(x, y, 'transport_ship');
        if (ship) {
            ship.setScale(1.0);
            ship.setBlendMode(Phaser.BlendModes.SCREEN);
            ship.setData('hp', 100);
            ship.setData('maxHp', 100);
            ship.setData('speed', 9);
            
            // 物理ボディのサイズやオフセットを調整
            ship.setCircle(20, 4, 4);
            
            // 最初は自基地へ向かせるため、進行方向の速度を設定
            const angle = Phaser.Math.Angle.Between(ship.x, ship.y, this.base.x, this.base.y);
            ship.rotation = angle + Math.PI / 2;
            
            const vx = Math.cos(angle) * 9;
            const vy = Math.sin(angle) * 9;
            ship.setVelocity(vx, vy);
            
            EventBus.emit('debug-log-add', {
                type: 'spawn',
                message: `[Spawn] 輸送船が (X: ${x}, Y: ${y}) に出現。自基地に向けて移動開始。`
            });
        }
        return ship;
    }

    /**
     * 輸送船の現在位置および進行方向に基づいて、後方からスポーンする座標を算出します。
     * 若干の角度および距離のランダム要素を含みます。
     */
    public getTransportBehindSpawnCoordinates(): { x: number; y: number } {
        const transport = (this.scene as any).transportShip as Phaser.Physics.Arcade.Sprite | null;
        
        if (transport && transport.active) {
            // 輸送船から自基地（base）への角度
            const angleToBase = Phaser.Math.Angle.Between(transport.x, transport.y, this.base.x, this.base.y);
            // 真後ろの方向を基準とする
            const baseAngle = angleToBase + Math.PI;
            
            // 左右に最大30度（±Math.PI / 6ラジアン）のランダムなズレを付与
            const angleOffset = Phaser.Math.FloatBetween(-Math.PI / 6, Math.PI / 6);
            // 輸送船から 500px 〜 700px のランダムな距離
            const spawnDistance = Phaser.Math.FloatBetween(500, 700);
            
            const finalAngle = baseAngle + angleOffset;
            let x = transport.x + Math.cos(finalAngle) * spawnDistance;
            let y = transport.y + Math.sin(finalAngle) * spawnDistance;
            
            // マップ有効範囲でクランプ
            x = Phaser.Math.Clamp(x, 50, 5950);
            y = Phaser.Math.Clamp(y, 50, 5950);
            
            return { x, y };
        }
        
        // 輸送船が存在しない場合は画面端からスポーン
        return this.getSpawnCoordinates('screen_edge');
    }

    /**
     * 自爆機（1機）と、その前方に護衛迎撃機（2機）が並ぶ特別スコードロンを生成します。
     */
    public spawnSuicideSquadron(x: number, y: number, squadronId?: string) {
        const squadId = squadronId || 'suicide_squad_' + Date.now();
        const bomberConfig = ENEMY_CONFIGS.suicide_bomber;
        const guardConfig = ENEMY_CONFIGS.suicide_guard;

        // 1. 自爆機 (suicide_bomber) を生成
        const bomber = this.enemies.create(x, y, 'suicide_bomber') as Phaser.Physics.Arcade.Sprite;
        if (bomber) {
            bomber.setScale(1.0); // 自爆用輸送機の実寸サイズ
            bomber.setBlendMode(Phaser.BlendModes.SCREEN);
            bomber.setData('enemyId', 'suicide_bomber');
            bomber.setData('hp', bomberConfig.hp); // HP: 30
            bomber.setData('aiState', {
                pattern: bomberConfig.aiPattern, // suicide_rush
                speed: bomberConfig.speed,
                squadronId: squadId
            } as AIState);
        }

        // 2. 護衛機 (suicide_guard) を2機、自爆機の前方に横並びで生成
        const angleToBase = Phaser.Math.Angle.Between(x, y, this.base.x, this.base.y);
        const forwardDist = 80;
        const sideDist = 60;

        const guardPositions = [
            {
                x: x + Math.cos(angleToBase) * forwardDist + Math.cos(angleToBase + Math.PI / 2) * sideDist,
                y: y + Math.sin(angleToBase) * forwardDist + Math.sin(angleToBase + Math.PI / 2) * sideDist,
                side: 1
            },
            {
                x: x + Math.cos(angleToBase) * forwardDist + Math.cos(angleToBase - Math.PI / 2) * sideDist,
                y: y + Math.sin(angleToBase) * forwardDist + Math.sin(angleToBase - Math.PI / 2) * sideDist,
                side: -1
            }
        ];

        guardPositions.forEach((pos) => {
            const guard = this.enemies.create(pos.x, pos.y, 'enemy') as Phaser.Physics.Arcade.Sprite;
            if (guard) {
                guard.setScale(0.04);
                guard.setBlendMode(Phaser.BlendModes.SCREEN);
                guard.setTint(guardConfig.tint);
                guard.setData('enemyId', 'suicide_guard');
                guard.setData('hp', guardConfig.hp);
                guard.setData('aiState', {
                    pattern: guardConfig.aiPattern, // guard_suicide
                    speed: guardConfig.speed,
                    squadronId: squadId,
                    side: pos.side // 1: 右, -1: 左
                } as AIState);
            }
        });

        EventBus.emit('debug-log-add', {
            type: 'spawn',
            message: `[Spawn] 敵自爆特攻編隊（自爆機1機・護衛2機）が出現！`
        });
    }

}
