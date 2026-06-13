import Phaser from 'phaser';
import { EventBus } from '../EventBus';

export interface AIState {
    pattern: string;
    speed: number;
    squadronId?: string;
    splitRole?: 'base' | 'player';
    target?: Phaser.Physics.Arcade.Sprite;
    [key: string]: any;
}

export class EnemyPatternDB {
    static execute(
        enemy: Phaser.Physics.Arcade.Sprite,
        scene: Phaser.Scene,
        time: number,
        base: Phaser.Physics.Arcade.Sprite,
        player: Phaser.Physics.Arcade.Sprite
    ) {
        const aiState = enemy.getData('aiState') as AIState;
        if (!aiState) return;

        switch (aiState.pattern) {
            case 'rush_base':
                this.rushBase(enemy, scene, aiState, base);
                break;
            case 'rush_target':
                this.rushTarget(enemy, scene, aiState, base, player, time);
                break;
            case 'circling_split':
                this.circlingSplit(enemy, scene, aiState, base, player);
                break;
            case 'single_rush':
                this.single_rush(enemy, scene, aiState, base, time);
                break;
            case 'squadron_circle':
                this.squadron_circle(enemy, scene, aiState, base, player, time);
                break;
            case 'single_circle':
                this.single_circle(enemy, scene, aiState, base, player, time);
                break;
            case 'squadron_split_target':
                this.squadron_split_target(enemy, scene, aiState, base, player, time);
                break;
            case 'suicide_rush':
                this.suicideRush(enemy, scene, aiState, base);
                break;
            case 'guard_suicide':
                this.guardSuicide(enemy, scene, aiState, base, player, time);
                break;
            case 'standard_orbit_attack':
                this.standardOrbitAttack(enemy, scene, aiState, base);
                break;
            case 'outpost':
                // 固定砲台など動かない場合は何もしない
                enemy.setVelocity(0, 0);
                break;
            default:
                // デフォルトは基地へ直進
                this.rushBase(enemy, scene, aiState, base);
                break;
        }
    }

    private static rushBase(enemy: Phaser.Physics.Arcade.Sprite, scene: Phaser.Scene, aiState: AIState, base: Phaser.Physics.Arcade.Sprite) {
        const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, base.x, base.y);
        // ゆっくり回転させる (0.02ラジアンずつ)
        enemy.rotation = Phaser.Math.Angle.RotateTo(enemy.rotation, angle + Math.PI / 2, 0.02);
        
        // 向いている方向(rotation - PI/2)に進む
        scene.physics.velocityFromRotation(enemy.rotation - Math.PI / 2, aiState.speed || 18, enemy.body!.velocity);
    }

    private static rushTarget(enemy: Phaser.Physics.Arcade.Sprite, scene: Phaser.Scene, aiState: AIState, base: Phaser.Physics.Arcade.Sprite, player: Phaser.Physics.Arcade.Sprite, time: number) {
        const target = aiState.target || base;
        const angleToTarget = Phaser.Math.Angle.Between(enemy.x, enemy.y, target.x, target.y);
        
        // ターゲットに向かう際の回転スピードを半分(0.015)程度に制限
        enemy.rotation = Phaser.Math.Angle.RotateTo(enemy.rotation, angleToTarget + Math.PI / 2, 0.015);
        
        // 向いている方向(rotation - PI/2)に進む
        scene.physics.velocityFromRotation(enemy.rotation - Math.PI / 2, aiState.speed || 18, enemy.body!.velocity);

        // 追尾中も一定間隔（例: 3秒ごと）でターゲットに向けて射撃
        const lastFired = enemy.getData('lastFired') as number || 0;
        if (time > lastFired + 3000) {
            enemy.setData('lastFired', time);
            this.fireEnemyBullet(enemy, scene, angleToTarget);
        }
    }

    private static circlingSplit(enemy: Phaser.Physics.Arcade.Sprite, scene: Phaser.Scene, aiState: AIState, base: Phaser.Physics.Arcade.Sprite, player: Phaser.Physics.Arcade.Sprite) {
        const distToBase = Phaser.Math.Distance.Between(enemy.x, enemy.y, base.x, base.y);
        const distToPlayer = Phaser.Math.Distance.Between(enemy.x, enemy.y, player.x, player.y);

        // トリガー：基地に300px以内、または自機に200px以内に近づいたらスプリット発動
        if (distToBase < 300 || distToPlayer < 200) {
            // 同一スコードロンの全機体にスプリット指示を出す
            if (aiState.squadronId) {
                const enemiesGroup = (scene as any).enemies as Phaser.Physics.Arcade.Group;
                if (enemiesGroup) {
                    enemiesGroup.getChildren().forEach((child) => {
                        const sibling = child as Phaser.Physics.Arcade.Sprite;
                        if (sibling.active) {
                            const sibState = sibling.getData('aiState') as AIState;
                            if (sibState && sibState.squadronId === aiState.squadronId && sibState.pattern === 'circling_split') {
                                sibState.pattern = 'rush_target';
                                sibState.target = sibState.splitRole === 'player' ? player : base;
                                // 突撃時はスピードを上げる
                                sibState.speed = (sibState.speed || 25) * 1.5;
                                sibling.setData('aiState', sibState);
                            }
                        }
                    });
                }
            } else {
                // スコードロンIDが無い単機の場合のフォールバック
                aiState.pattern = 'rush_target';
                aiState.target = Math.random() > 0.5 ? player : base;
                enemy.setData('aiState', aiState);
            }
            return;
        }

        // 旋回接近軌道の計算
        // 基地に対する角度を取得し、そこにオフセットを加えて「斜め前」に進ませることで螺旋を描く
        const angleToBase = Phaser.Math.Angle.Between(enemy.x, enemy.y, base.x, base.y);
        
        // 旋回の方向（時計回りか反時計回りか）は squadronId のハッシュなどで決めることもできるが、固定でズラす
        const spiralAngle = angleToBase + Math.PI / 3.0; // 約60度ズラして大きな螺旋を描く

        const speed = aiState.speed || 25;
        scene.physics.velocityFromRotation(spiralAngle, speed, enemy.body!.velocity);

        // 機首の方向は移動方向に向ける
        enemy.rotation = spiralAngle + Math.PI / 2;
    }

    private static single_rush(
        enemy: Phaser.Physics.Arcade.Sprite,
        scene: Phaser.Scene,
        aiState: AIState,
        base: Phaser.Physics.Arcade.Sprite,
        time: number
    ) {
        // 本部へ向かう角度
        const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, base.x, base.y);
        enemy.rotation = Phaser.Math.Angle.RotateTo(enemy.rotation, angle + Math.PI / 2, 0.02);
        
        // 移動
        scene.physics.velocityFromRotation(enemy.rotation - Math.PI / 2, aiState.speed || 18, enemy.body!.velocity);

        // 一定間隔で射撃 (例: 2.5秒ごと)
        const lastFired = enemy.getData('lastFired') as number || 0;
        if (time > lastFired + 2500) {
            enemy.setData('lastFired', time);
            this.fireEnemyBullet(enemy, scene, angle);
        }
    }

    private static squadron_circle(
        enemy: Phaser.Physics.Arcade.Sprite,
        scene: Phaser.Scene,
        aiState: AIState,
        base: Phaser.Physics.Arcade.Sprite,
        player: Phaser.Physics.Arcade.Sprite,
        time: number
    ) {
        const distToPlayer = Phaser.Math.Distance.Between(enemy.x, enemy.y, player.x, player.y);

        // プレイヤーが 250px 以内に接近した場合、スコードロン内の先頭1機のみがプレイヤーをターゲットにする
        if (distToPlayer < 250 && aiState.squadronId) {
            const enemiesGroup = (scene as any).enemies as Phaser.Physics.Arcade.Group;
            if (enemiesGroup) {
                // 同じスコードロンの生存機リストを取得
                const siblings = enemiesGroup.getChildren()
                    .filter((child) => {
                        const sib = child as Phaser.Physics.Arcade.Sprite;
                        if (!sib.active) return false;
                        const sibState = sib.getData('aiState') as AIState;
                        return sibState && sibState.squadronId === aiState.squadronId;
                    }) as Phaser.Physics.Arcade.Sprite[];

                // 既にプレイヤーを追従している機体がいないか確認
                const alreadyTracking = siblings.some(sib => {
                    const sibState = sib.getData('aiState') as AIState;
                    return sibState.pattern === 'rush_target' && sibState.target === player;
                });

                if (!alreadyTracking && siblings.length > 0) {
                    const leader = siblings[0];
                    const leaderState = leader.getData('aiState') as AIState;
                    
                    leaderState.pattern = 'rush_target';
                    leaderState.target = player;
                    leaderState.speed = (leaderState.speed || 18) * 1.4; // スピードアップ
                    leader.setData('aiState', leaderState);

                    // デバッグログ送信
                    EventBus.emit('debug-log-add', {
                        type: 'system',
                        message: `[AI] 3機編成 "${aiState.squadronId}" の先頭機がプレイヤー迎撃へスプリットしました`
                    });
                }
            }
        }

        // 旋回接近軌道
        const angleToBase = Phaser.Math.Angle.Between(enemy.x, enemy.y, base.x, base.y);
        
        // らせん軌道の計算 (接線から大きく内側を向く角度にして接近を早める)
        const spiralAngle = angleToBase + Math.PI / 2.8;
        enemy.rotation = spiralAngle + Math.PI / 2;

        const speed = aiState.speed || 15; // 旋回はゆっくり
        scene.physics.velocityFromRotation(spiralAngle, speed, enemy.body!.velocity);
    }

    private static single_circle(
        enemy: Phaser.Physics.Arcade.Sprite,
        scene: Phaser.Scene,
        aiState: AIState,
        base: Phaser.Physics.Arcade.Sprite,
        player: Phaser.Physics.Arcade.Sprite,
        time: number
    ) {
        const distToPlayer = Phaser.Math.Distance.Between(enemy.x, enemy.y, player.x, player.y);

        // プレイヤーが 250px 以内に接近した場合、自身がプレイヤーをターゲットにする
        if (distToPlayer < 250) {
            aiState.pattern = 'rush_target';
            aiState.target = player;
            aiState.speed = (aiState.speed || 18) * 1.4; // スピードアップ
            enemy.setData('aiState', aiState);

            // デバッグログ送信
            EventBus.emit('debug-log-add', {
                type: 'system',
                message: `[AI] 単独旋回接近機がプレイヤー迎撃のため追従突撃へ移行しました`
            });
            return;
        }

        // 旋回接近軌道
        const angleToBase = Phaser.Math.Angle.Between(enemy.x, enemy.y, base.x, base.y);
        
        // らせん軌道の計算 (接線から大きく内側を向く角度にして接近を早める)
        const spiralAngle = angleToBase + Math.PI / 3.0;
        enemy.rotation = spiralAngle + Math.PI / 2;

        const speed = aiState.speed || 15; // 旋回はゆっくり
        scene.physics.velocityFromRotation(spiralAngle, speed, enemy.body!.velocity);
    }

    private static squadron_split_target(
        enemy: Phaser.Physics.Arcade.Sprite,
        scene: Phaser.Scene,
        aiState: AIState,
        base: Phaser.Physics.Arcade.Sprite,
        player: Phaser.Physics.Arcade.Sprite,
        time: number
    ) {
        // 輸送船 (scene.transportShip) をターゲットとする
        const transportShip = (scene as any).transportShip as Phaser.Physics.Arcade.Sprite | null;
        const targetShip = transportShip && transportShip.active ? transportShip : base;

        const distToPlayer = Phaser.Math.Distance.Between(enemy.x, enemy.y, player.x, player.y);

        // 自機が 250px 以内に接近した場合、スコードロン内で自機を追従している機体がいなければ、1機だけ自機ターゲットに切り替える
        if (distToPlayer < 250 && aiState.squadronId) {
            const enemiesGroup = (scene as any).enemies as Phaser.Physics.Arcade.Group;
            if (enemiesGroup) {
                // 同じスコードロンの生存機リストを取得
                const siblings = enemiesGroup.getChildren()
                    .filter((child) => {
                        const sib = child as Phaser.Physics.Arcade.Sprite;
                        if (!sib.active) return false;
                        const sibState = sib.getData('aiState') as AIState;
                        return sibState && sibState.squadronId === aiState.squadronId;
                    }) as Phaser.Physics.Arcade.Sprite[];

                // 既にプレイヤーを追従している機体（rush_target）がいないか確認
                const alreadyTracking = siblings.some(sib => {
                    const sibState = sib.getData('aiState') as AIState;
                    return sibState.pattern === 'rush_target';
                });

                if (!alreadyTracking && siblings.length > 0) {
                    // 生存機リストの先頭が自分自身（enemy）である場合のみ追従に切り替える（複数同時切り替えの競合を防ぐ）
                    if (siblings[0] === enemy) {
                        aiState.pattern = 'rush_target';
                        aiState.target = player;
                        aiState.speed = (aiState.speed || 25) * 1.4; // 突撃時はスピードアップ
                        enemy.setData('aiState', aiState);

                        EventBus.emit('debug-log-add', {
                            type: 'system',
                            message: `[AI] 輸送船襲撃編隊 "${aiState.squadronId}" の1機が自機迎撃へスプリットしました`
                        });
                        
                        // 状態を rush_target の挙動に移行させるため、即座に終了して突撃処理を行う
                        this.rushTarget(enemy, scene, aiState, base, player, time);
                        return;
                    }
                }
            }
        }

        // ターゲット（輸送船または自基地）との距離を計算
        const distToTarget = Phaser.Math.Distance.Between(enemy.x, enemy.y, targetShip.x, targetShip.y);
        const angleToTarget = Phaser.Math.Angle.Between(enemy.x, enemy.y, targetShip.x, targetShip.y);

        // 楕円的な接近・離脱の往復処理
        if (!aiState.phase) {
            aiState.phase = 'approach';
        }
        if (!aiState.orbitDir) {
            aiState.orbitDir = Math.random() > 0.5 ? 1 : -1;
        }

        let targetAngle = 0;
        let speed = aiState.speed || 25;

        if (aiState.phase === 'approach') {
            // ターゲットに向かって少し斜め（オフセット角 Math.PI/4）に進んで楕円的に近づく
            targetAngle = angleToTarget + (Math.PI / 4) * aiState.orbitDir;

            // 近づいたら（150px 未満）、ターゲットへ向けて1発弾を撃ち、離脱フェーズへ
            if (distToTarget < 150) {
                this.fireEnemyBullet(enemy, scene, angleToTarget);
                aiState.phase = 'retreat';
                enemy.setData('aiState', aiState);
            }
        } else {
            // 離脱中：遠ざかる（ここでも少し斜め外を向くことで、きれいな曲線で離れていく）
            targetAngle = angleToTarget + Math.PI - (Math.PI / 4) * aiState.orbitDir;
            speed = (aiState.speed || 25) * 1.1; // 離脱時は少し素早く動く

            // 十分に離れたら（350px 以上）、再びアプローチ開始
            if (distToTarget > 350) {
                aiState.phase = 'approach';
                enemy.setData('aiState', aiState);
            }
        }

        // 目標の向き（targetAngle + Math.PI/2）に向けてゆっくり回転させる（0.02ラジアンずつ）
        enemy.rotation = Phaser.Math.Angle.RotateTo(enemy.rotation, targetAngle + Math.PI / 2, 0.02);

        // 現在向いている方向（rotation - PI/2）に進む
        scene.physics.velocityFromRotation(enemy.rotation - Math.PI / 2, speed, enemy.body!.velocity);
    }

    private static suicideRush(
        enemy: Phaser.Physics.Arcade.Sprite,
        scene: Phaser.Scene,
        aiState: AIState,
        base: Phaser.Physics.Arcade.Sprite
    ) {
        const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, base.x, base.y);
        // ゆっくり機首を合わせる
        enemy.rotation = Phaser.Math.Angle.RotateTo(enemy.rotation, angle + Math.PI / 2, 0.015);
        scene.physics.velocityFromRotation(enemy.rotation - Math.PI / 2, aiState.speed || 10, enemy.body!.velocity);
    }

    private static standardOrbitAttack(
        enemy: Phaser.Physics.Arcade.Sprite,
        scene: Phaser.Scene,
        aiState: AIState,
        base: Phaser.Physics.Arcade.Sprite
    ) {
        const distToBase = Phaser.Math.Distance.Between(enemy.x, enemy.y, base.x, base.y);
        const angleToBase = Phaser.Math.Angle.Between(enemy.x, enemy.y, base.x, base.y);

        if (!aiState.phase) {
            aiState.phase = 'approach';
        }
        if (!aiState.orbitDir) {
            // 時計回りか反時計回りかをランダムで決定
            aiState.orbitDir = Math.random() > 0.5 ? 1 : -1;
            enemy.setData('aiState', aiState);
        }

        let targetAngle = 0;
        let speed = aiState.speed || 18;

        if (aiState.phase === 'approach') {
            // ターゲットに向かって少し斜め（オフセット角 Math.PI/4）に進んで楕円的に近づく
            targetAngle = angleToBase + (Math.PI / 4) * aiState.orbitDir;

            // 近づいたら（150px 未満）、ターゲットへ向けて1発弾を撃ち、離脱フェーズへ
            if (distToBase < 150) {
                this.fireEnemyBullet(enemy, scene, angleToBase);
                aiState.phase = 'retreat';
                enemy.setData('aiState', aiState);
            }
        } else {
            // 離脱中：遠ざかる（ここでも少し斜め外を向くことで、きれいな曲線で離れていく）
            targetAngle = angleToBase + Math.PI - (Math.PI / 4) * aiState.orbitDir;
            speed = (aiState.speed || 18) * 1.1; // 離脱時は少し素早く動く

            // 十分に離れたら（350px 以上）、再びアプローチ開始
            if (distToBase > 350) {
                aiState.phase = 'approach';
                enemy.setData('aiState', aiState);
            }
        }

        // ゆっくり方向転換（0.02ラジアンずつ）
        enemy.rotation = Phaser.Math.Angle.RotateTo(enemy.rotation, targetAngle + Math.PI / 2, 0.02);

        // 現在向いている方向に進む
        scene.physics.velocityFromRotation(enemy.rotation - Math.PI / 2, speed, enemy.body!.velocity);
    }

    private static guardSuicide(
        enemy: Phaser.Physics.Arcade.Sprite,
        scene: Phaser.Scene,
        aiState: AIState,
        base: Phaser.Physics.Arcade.Sprite,
        player: Phaser.Physics.Arcade.Sprite,
        time: number
    ) {
        const distToPlayer = Phaser.Math.Distance.Between(enemy.x, enemy.y, player.x, player.y);

        // 自機が 250px 以内に接近した場合、自機を迎撃するように行動変更
        if (distToPlayer < 250) {
            aiState.pattern = 'rush_target';
            aiState.target = player;
            aiState.speed = (aiState.speed || 15) * 1.5; // 加速
            enemy.setData('aiState', aiState);

            EventBus.emit('debug-log-add', {
                type: 'system',
                message: `[AI] 自爆機の護衛迎撃機が自機への迎撃突撃に移行しました`
            });
            this.rushTarget(enemy, scene, aiState, base, player, time);
            return;
        }

        // 自爆機の検索
        let leader: Phaser.Physics.Arcade.Sprite | null = null;
        if (aiState.squadronId) {
            const enemiesGroup = (scene as any).enemies as Phaser.Physics.Arcade.Group;
            if (enemiesGroup) {
                const siblings = enemiesGroup.getChildren() as Phaser.Physics.Arcade.Sprite[];
                for (const sib of siblings) {
                    if (sib.active) {
                        const sibId = sib.getData('enemyId');
                        const sibState = sib.getData('aiState') as AIState;
                        if (sibId === 'suicide_bomber' && sibState && sibState.squadronId === aiState.squadronId) {
                            leader = sib;
                            break;
                        }
                    }
                }
            }
        }

        if (leader) {
            // 自爆機（リーダー）の進行方向角度
            const leaderAngle = leader.rotation - Math.PI / 2; // 実際の進行方向ラジアン
            
            // 自爆機の「前方」に横並びで飛ぶための位置計算
            if (aiState.side === undefined) {
                aiState.side = Math.random() > 0.5 ? 1 : -1;
                enemy.setData('aiState', aiState);
            }

            const forwardDist = 80;
            const sideDist = 60 * aiState.side;

            const targetX = leader.x + Math.cos(leaderAngle) * forwardDist + Math.cos(leaderAngle + Math.PI / 2) * sideDist;
            const targetY = leader.y + Math.sin(leaderAngle) * forwardDist + Math.sin(leaderAngle + Math.PI / 2) * sideDist;

            // 目標座標へ向けてゆっくり回転・移動
            const angleToTarget = Phaser.Math.Angle.Between(enemy.x, enemy.y, targetX, targetY);
            enemy.rotation = Phaser.Math.Angle.RotateTo(enemy.rotation, angleToTarget + Math.PI / 2, 0.05);

            const distToTarget = Phaser.Math.Distance.Between(enemy.x, enemy.y, targetX, targetY);
            let speed = aiState.speed || 15;
            if (distToTarget > 150) {
                speed = speed * 1.5; // リーダーから離れすぎた場合は急いで追従
            }

            scene.physics.velocityFromRotation(enemy.rotation - Math.PI / 2, speed, enemy.body!.velocity);
        } else {
            // リーダーがいない場合は、代わりに基地に向けて直進
            const angleToBase = Phaser.Math.Angle.Between(enemy.x, enemy.y, base.x, base.y);
            enemy.rotation = Phaser.Math.Angle.RotateTo(enemy.rotation, angleToBase + Math.PI / 2, 0.02);
            scene.physics.velocityFromRotation(enemy.rotation - Math.PI / 2, aiState.speed || 15, enemy.body!.velocity);
        }
    }

    private static fireEnemyBullet(enemy: Phaser.Physics.Arcade.Sprite, scene: Phaser.Scene, angle: number) {
        const turretBullets = (scene as any).turretBullets as Phaser.Physics.Arcade.Group;
        if (turretBullets) {
            const bullet = turretBullets.get(enemy.x, enemy.y) as Phaser.Physics.Arcade.Sprite;
            if (bullet) {
                bullet.setActive(true);
                bullet.setVisible(true);
                if (bullet.body) bullet.body.enable = true;
                bullet.setTint(0xff3333); // 敵の赤い弾
                bullet.setData('startX', enemy.x);
                bullet.setData('startY', enemy.y);
                bullet.setData('isEnemyBullet', true);
                
                scene.physics.velocityFromRotation(angle, 70, bullet.body!.velocity);

                // 射撃音: scene.soundEffects は存在しないため従来は常に無音だった（死にコードを除去）。
                // SoundEffects を audio/ へ独立モジュール化する Phase 1 で、clean import により本来の発射音を復元する。
            }
        }
    }
}
