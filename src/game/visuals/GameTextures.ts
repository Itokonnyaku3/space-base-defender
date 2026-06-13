import Phaser from 'phaser';

export function createGameTextures(scene: Phaser.Scene) {
    const graphics = scene.add.graphics();
    
    // Player - 32x32px のシャープなSF戦闘機デザイン
    graphics.fillStyle(0x0e2440, 1); // 胴体 (ダークブルー)
    graphics.beginPath();
    graphics.moveTo(16, 2);  // 先端
    graphics.lineTo(11, 26); // 左後ろ
    graphics.lineTo(16, 22); // お尻の凹み
    graphics.lineTo(21, 26); // 右後ろ
    graphics.closePath();
    graphics.fill();

    graphics.fillStyle(0x0088ff, 1); // 主翼 (ネオンブルー)
    graphics.beginPath();
    graphics.moveTo(11, 14); // 翼付け根前方
    graphics.lineTo(2, 28);  // 翼端後方
    graphics.lineTo(10, 26); // 翼後方
    graphics.closePath();
    graphics.fill();

    graphics.beginPath();
    graphics.moveTo(21, 14); // 翼付け根前方
    graphics.lineTo(30, 28); // 翼端後方
    graphics.lineTo(22, 26); // 翼後方
    graphics.closePath();
    graphics.fill();

    graphics.fillStyle(0xffd700, 1); // コックピットキャノピー (ゴールド)
    graphics.fillEllipse(16, 12, 3, 6);

    graphics.fillStyle(0x555555, 1); // スラスターノズル (グレー)
    graphics.fillRect(11, 25, 3, 3);
    graphics.fillRect(18, 25, 3, 3);

    graphics.generateTexture('player', 32, 32);
    graphics.clear();

    // Bullet
    graphics.fillStyle(0xffff00, 1);
    graphics.fillCircle(4, 4, 4);
    graphics.generateTexture('bullet', 8, 8);
    graphics.clear();

    // Enemy & Base Textures
    scene.load.image('enemy', 'assets/sprites/enemy.png');
    scene.load.image('base', 'assets/sprites/base.png');

    // Turret
    scene.load.image('turret', 'assets/sprites/turret.png');

    // Ally
    scene.load.image('ally', 'assets/sprites/ally.png');

    // Transport Ship (輸送船) - 緑色の大型宇宙船デザイン
    graphics.fillStyle(0x0e3a1f, 1); // 胴体 (ダークグリーン)
    graphics.beginPath();
    graphics.moveTo(24, 4);   // 先端
    graphics.lineTo(8, 40);   // 左後ろ
    graphics.lineTo(24, 32);  // お尻
    graphics.lineTo(40, 40);  // 右後ろ
    graphics.closePath();
    graphics.fill();

    graphics.fillStyle(0x00ff66, 1); // 主翼 (ネオングリーン)
    graphics.beginPath();
    graphics.moveTo(8, 24);
    graphics.lineTo(0, 36);
    graphics.lineTo(8, 36);
    graphics.closePath();
    graphics.fill();

    graphics.beginPath();
    graphics.moveTo(40, 24);
    graphics.lineTo(48, 36);
    graphics.lineTo(40, 36);
    graphics.closePath();
    graphics.fill();

    graphics.fillStyle(0x00ffff, 1); // コックピット窓 (水色)
    graphics.fillEllipse(24, 16, 4, 8);

    graphics.generateTexture('transport_ship', 48, 48);
    graphics.clear();

    // Suicide Bomber (自爆機/敵輸送機) - 黄色のずんぐりした大型機体デザイン
    graphics.fillStyle(0x554400, 1); // 胴体 (ダークイエロー/ブラウン)
    graphics.beginPath();
    graphics.moveTo(24, 6);
    graphics.lineTo(12, 38);
    graphics.lineTo(24, 32);
    graphics.lineTo(36, 38);
    graphics.closePath();
    graphics.fill();

    graphics.fillStyle(0xffff00, 1); // 主翼・ネオンイエロー
    graphics.beginPath();
    graphics.moveTo(12, 20);
    graphics.lineTo(2, 32);
    graphics.lineTo(12, 30);
    graphics.closePath();
    graphics.fill();

    graphics.beginPath();
    graphics.moveTo(36, 20);
    graphics.lineTo(46, 32);
    graphics.lineTo(36, 30);
    graphics.closePath();
    graphics.fill();

    graphics.fillStyle(0xff3333, 1); // コックピット窓 (赤)
    graphics.fillEllipse(24, 16, 4, 6);

    graphics.generateTexture('suicide_bomber', 48, 48);
    graphics.clear();



    // Mothership
    graphics.fillStyle(0xff3333, 1);
    graphics.fillCircle(32, 32, 32);
    graphics.fillStyle(0xff8888, 1);
    graphics.fillCircle(32, 32, 16);
    graphics.generateTexture('mothership', 64, 64);
    graphics.clear();

    // Outpost (敵前線基地)
    graphics.fillStyle(0xff00ff, 1);
    graphics.fillRect(0, 0, 48, 48);
    graphics.fillStyle(0xaa00aa, 1);
    graphics.fillRect(8, 8, 32, 32);
    graphics.generateTexture('outpost', 48, 48);
    graphics.clear();

    // Relay (中継基地)
    graphics.fillStyle(0x00ffff, 0.25);
    graphics.lineStyle(1.5, 0x00ffff, 1);
    graphics.fillCircle(12, 12, 11);
    graphics.strokeCircle(12, 12, 11);
    graphics.fillStyle(0x00ffff, 1);
    graphics.fillCircle(12, 12, 3);
    graphics.generateTexture('relay', 24, 24);
    graphics.destroy();
}
