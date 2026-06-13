import { useEffect, useRef } from 'react';
import { EventBus } from '../game/EventBus';

interface RadarEntity {
    x: number;
    y: number;
}

interface VisionCircle {
    x: number;
    y: number;
    range: number;
}

interface RadarData {
    player: { x: number; y: number; rotation: number };
    base: RadarEntity;
    camera?: { x: number; y: number; width: number; height: number };
    turrets: RadarEntity[];
    relays: RadarEntity[];
    enemies: RadarEntity[];
    motherships: RadarEntity[];
    outposts: RadarEntity[];
    allies: RadarEntity[];
    visionCircles: VisionCircle[];
    transportShip?: RadarEntity | null;
}

interface RadarUIProps {
  radarDebugMode?: boolean;
}

const mapSize = 6000; // Phaserのワールドサイズ (6000pxに対応)
const radarSize = 160; // レーダーUIの描画サイズ (px)
const scale = radarSize / mapSize; // 変換倍率 (160 / 2000 = 0.08)

export default function RadarUI({ radarDebugMode = false }: RadarUIProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 高解像度ディスプレイ対応 (Retina等)
    const dpr = window.devicePixelRatio || 1;
    canvas.width = radarSize * dpr;
    canvas.height = radarSize * dpr;
    ctx.scale(dpr, dpr);

    const handleRadarUpdate = (data: RadarData) => {
      // 1. キャンバスクリア
      ctx.clearRect(0, 0, radarSize, radarSize);

      // 円形のレーダー枠にクリップ
      ctx.save();
      ctx.beginPath();
      ctx.arc(radarSize / 2, radarSize / 2, radarSize / 2 - 2, 0, Math.PI * 2);
      ctx.clip();

      // 2. レーダー背景グリッドの描画
      ctx.fillStyle = '#050a12';
      ctx.fillRect(0, 0, radarSize, radarSize);

      ctx.strokeStyle = 'rgba(0, 200, 255, 0.06)';
      ctx.lineWidth = 1;
      
      // グリッド線
      const gridSize = 32 * scale;
      for (let x = 0; x < radarSize; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, radarSize);
        ctx.stroke();
      }
      for (let y = 0; y < radarSize; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(radarSize, y);
        ctx.stroke();
      }

      // 同心円ガイド線
      ctx.beginPath();
      ctx.arc(radarSize / 2, radarSize / 2, radarSize / 4, 0, Math.PI * 2);
      ctx.arc(radarSize / 2, radarSize / 2, radarSize / 2 - 10, 0, Math.PI * 2);
      ctx.stroke();

      // 3. 【戦霧 (Fog of War) マスク】の描画
      if (!radarDebugMode) {
        ctx.fillStyle = 'rgba(2, 4, 8, 0.82)'; // 未索敵エリアは暗い闇
      ctx.fillRect(0, 0, radarSize, radarSize);

      // destination-out で索敵サークル部分をクリア（視界をくり抜く）
      ctx.globalCompositeOperation = 'destination-out';
      
      data.visionCircles.forEach((circle) => {
        const cx = circle.x * scale;
        const cy = circle.y * scale;
        const cr = circle.range * scale;

        // グラデーションを用いて視界の境界を柔らかくぼかす
        const gradient = ctx.createRadialGradient(cx, cy, cr * 0.4, cx, cy, cr);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
        gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.8)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(cx, cy, cr, 0, Math.PI * 2);
        ctx.fill();
      });

      // 通常合成に戻す
      ctx.globalCompositeOperation = 'source-over';
      }

      // 4. オブジェクトのプロット (明るいエリア内でのみ視覚化されるように設定)
      
      // A. 本部基地 (常に表示され、索敵範囲も広い。視認性を大幅に向上)
      if (data.base) {
        const bx = data.base.x * scale;
        const by = data.base.y * scale;
        
        // 基地の外郭を表す明るい青の円
        ctx.fillStyle = 'rgba(0, 150, 255, 0.45)';
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(bx, by, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // 基地のコア（中心ドット）を白に近いシアンで描画して、一目で基地の位置がわかるようにする
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(bx, by, 2, 0, Math.PI * 2);
        ctx.fill();
      }

      // B. 敵の前線基地 (マゼンタの頑強な四角、スキャン時のみ表示)
      data.outposts.forEach((outpost) => {
        const ox = outpost.x * scale;
        const oy = outpost.y * scale;
        ctx.fillStyle = 'rgba(255, 0, 255, 0.25)';
        ctx.strokeStyle = '#ff00ff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.rect(ox - 3.5, oy - 3.5, 7, 7);
        ctx.fill();
        ctx.stroke();
      });

      // C. タレット (白いドット)
      data.turrets.forEach((turret) => {
        const tx = turret.x * scale;
        const ty = turret.y * scale;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(tx, ty, 2, 0, Math.PI * 2);
        ctx.fill();
      });

      // D. 中継レーダー (水色のアンテナマーク)
      data.relays.forEach((relay) => {
        const rx = relay.x * scale;
        const ry = relay.y * scale;
        ctx.fillStyle = 'rgba(0, 255, 255, 0.3)';
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(rx, ry, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // アンテナシンボルの中心点
        ctx.fillStyle = '#00ffff';
        ctx.beginPath();
        ctx.arc(rx, ry, 1, 0, Math.PI * 2);
        ctx.fill();
      });

      // E. 味方機 (黄緑の三角)
      data.allies.forEach((ally) => {
        const ax = ally.x * scale;
        const ay = ally.y * scale;
        ctx.fillStyle = '#00ffaa';
        ctx.beginPath();
        ctx.moveTo(ax, ay - 3);
        ctx.lineTo(ax + 2.5, ay + 2);
        ctx.lineTo(ax - 2.5, ay + 2);
        ctx.closePath();
        ctx.fill();
      });

      // J. 輸送船 (黄色の大型ダイヤマーク)
      if (data.transportShip) {
        const tx = data.transportShip.x * scale;
        const ty = data.transportShip.y * scale;
        ctx.fillStyle = 'rgba(255, 230, 0, 0.45)';
        ctx.strokeStyle = '#ffee00';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(tx, ty - 5);
        ctx.lineTo(tx + 4, ty);
        ctx.lineTo(tx, ty + 5);
        ctx.lineTo(tx - 4, ty);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // コア
        ctx.fillStyle = '#ffee00';
        ctx.beginPath();
        ctx.arc(tx, ty, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // F. 敵戦闘機 (赤いドット)
      data.enemies.forEach((enemy) => {
        const ex = enemy.x * scale;
        const ey = enemy.y * scale;
        ctx.fillStyle = '#ff3333';
        ctx.shadowColor = '#ff3333';
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.arc(ex, ey, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0; // シャドウリセット
      });

      // G. 敵巨大母船 (赤い大円)
      data.motherships.forEach((mothership) => {
        const mx = mothership.x * scale;
        const my = mothership.y * scale;
        ctx.fillStyle = 'rgba(255, 50, 50, 0.2)';
        ctx.strokeStyle = '#ff3333';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(mx, my, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });

      // H. 画面表示範囲 (カメラ視野枠。薄いシアンの枠)
      if (data.camera) {
        const cx = data.camera.x * scale;
        const cy = data.camera.y * scale;
        const cw = data.camera.width * scale;
        const ch = data.camera.height * scale;

        ctx.strokeStyle = 'rgba(0, 255, 255, 0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.rect(cx, cy, cw, ch);
        ctx.stroke();

        ctx.fillStyle = 'rgba(0, 255, 255, 0.03)';
        ctx.fillRect(cx, cy, cw, ch);
      }

      // I. 自機 (緑の自機シンボル。矢印形状で回転方向も反映)
      const px = data.player.x * scale;
      const py = data.player.y * scale;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(data.player.rotation);
      ctx.fillStyle = '#00ffaa';
      ctx.strokeStyle = '#00ffaa';
      ctx.lineWidth = 1;
      ctx.shadowColor = '#00ffaa';
      ctx.shadowBlur = 4;
      
      ctx.beginPath();
      ctx.moveTo(0, -4.5); // 正面先端
      ctx.lineTo(3.5, 3.5); // 右後ろ
      ctx.lineTo(0, 1.5);   // お尻の内側
      ctx.lineTo(-3.5, 3.5); // 左後ろ
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      
      ctx.restore();

      ctx.restore(); // クリップとセーブ状態の解除
    };

    EventBus.on('radar-update', handleRadarUpdate);

    return () => {
      EventBus.off('radar-update', handleRadarUpdate);
    };
  }, [radarDebugMode]);

  return (
    <div className="radar-panel">
      <div className="radar-container">
        {/* スキャンキャンバス */}
        <canvas ref={canvasRef} className="radar-canvas" />
        
        {/* SFレーダースイープ（走査線）エフェクト */}
        <div className="radar-sweep" />
        
        {/* レーダー方位マーク */}
        <div className="radar-ring" />
        <span className="radar-dir dir-n">N</span>
        <span className="radar-dir dir-e">E</span>
        <span className="radar-dir dir-s">S</span>
        <span className="radar-dir dir-w">W</span>
      </div>
      <div className="radar-label">TACTICAL RADAR</div>
    </div>
  );
}
