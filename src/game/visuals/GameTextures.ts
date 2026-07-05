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

    // Enemy Texture
    scene.load.image('enemy', 'assets/sprites/enemy.png');

    // Base (自基地) - 256x256 の六角形スペース要塞をプロシージャル生成（旧 base.png を置き換え・大型化）
    {
      const bcx = 128, bcy = 128;
      const hex = (r: number, rot = -Math.PI / 2) => {
        const pts: Phaser.Math.Vector2[] = [];
        for (let i = 0; i < 6; i++) {
          const a = rot + i * Math.PI / 3;
          pts.push(new Phaser.Math.Vector2(bcx + Math.cos(a) * r, bcy + Math.sin(a) * r));
        }
        return pts;
      };
      // 外殻ハル
      graphics.fillStyle(0x0e2440, 1);
      graphics.fillPoints(hex(112), true);
      // ハル縁のネオンライン
      graphics.lineStyle(4, 0x0088ff, 0.9);
      graphics.strokePoints(hex(112), true);
      // 内側プレート
      graphics.fillStyle(0x14304f, 1);
      graphics.fillPoints(hex(86), true);
      // 放射状の構造フレーム（6本）
      graphics.lineStyle(7, 0x33507a, 1);
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 3;
        graphics.beginPath();
        graphics.moveTo(bcx, bcy);
        graphics.lineTo(bcx + Math.cos(a) * 104, bcy + Math.sin(a) * 104);
        graphics.strokePath();
      }
      // 各頂点の防御タレット
      for (const v of hex(112)) {
        graphics.fillStyle(0x1b2a3a, 1); graphics.fillCircle(v.x, v.y, 13);
        graphics.fillStyle(0x8899aa, 1); graphics.fillCircle(v.x, v.y, 8);
        graphics.fillStyle(0x66ccff, 1); graphics.fillCircle(v.x, v.y, 3);
      }
      // 中央リング
      graphics.lineStyle(6, 0x0088ff, 0.8);
      graphics.strokeCircle(bcx, bcy, 58);
      // リングのセグメント灯（金/シアン交互）
      for (let i = 0; i < 12; i++) {
        const a = i * Math.PI / 6;
        graphics.fillStyle(i % 2 ? 0x00ffff : 0xffd700, 1);
        graphics.fillCircle(bcx + Math.cos(a) * 58, bcy + Math.sin(a) * 58, 3.5);
      }
      // 中央コア（発光する原子炉）
      graphics.fillStyle(0x1a3a5a, 1); graphics.fillCircle(bcx, bcy, 40);
      graphics.fillStyle(0xffd700, 0.9); graphics.fillCircle(bcx, bcy, 25);
      graphics.fillStyle(0x66ccff, 0.9); graphics.fillCircle(bcx, bcy, 15);
      graphics.fillStyle(0xffffff, 1); graphics.fillCircle(bcx, bcy, 7);
      graphics.generateTexture('base', 256, 256);
      graphics.clear();
    }

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

    // Wave 5 ボス（巨大戦列艦）の暫定テクスチャ（最終アセットは後日差し替え）
    if (!scene.textures.exists('battleship_hull')) {
        const bg = scene.add.graphics();
        bg.fillStyle(0x2a3550, 1); bg.fillRoundedRect(0, 0, 320, 110, 14);
        bg.fillStyle(0x3d4a6b, 1); bg.fillRoundedRect(8, 8, 304, 94, 10);
        bg.generateTexture('battleship_hull', 320, 110); bg.clear();
        bg.fillStyle(0xff8800, 1); bg.fillRoundedRect(0, 0, 34, 26, 4);
        bg.generateTexture('battleship_engine', 34, 26); bg.clear();
        bg.fillStyle(0x00e5ff, 1); bg.fillCircle(22, 22, 22);
        bg.fillStyle(0xffffff, 1); bg.fillCircle(22, 22, 8);
        bg.generateTexture('battleship_cannon', 44, 44); bg.clear();
        // 発射台（赤・射出口つき）と防壁（鋼色の装甲板）。機関=橙と色で区別する
        bg.fillStyle(0xdd2222, 1); bg.fillRoundedRect(0, 0, 30, 40, 5);
        bg.fillStyle(0xff6644, 1); bg.fillRoundedRect(6, 14, 18, 12, 3);
        bg.generateTexture('battleship_bay', 30, 40); bg.clear();
        bg.fillStyle(0x8896aa, 1); bg.fillRoundedRect(0, 0, 22, 40, 3);
        bg.fillStyle(0xb8c4d8, 1); bg.fillRect(4, 4, 14, 32);
        bg.generateTexture('battleship_wall', 22, 40);
        bg.destroy();
    }
}
