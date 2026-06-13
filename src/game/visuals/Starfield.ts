import Phaser from 'phaser';
import { WORLD_SIZE } from '../core/constants';

export function createStarfield(scene: Phaser.Scene) {
      const starfield = scene.add.graphics();
      starfield.setDepth(-10); // 最背面

      // 1. 明るい星の描画 (2500個)
      const numBrightStars = 2500;
      for (let i = 0; i < numBrightStars; i++) {
          const x = Phaser.Math.Between(0, WORLD_SIZE);
          const y = Phaser.Math.Between(0, WORLD_SIZE);
          const size = Phaser.Math.FloatBetween(1.5, 2.5);
          const alpha = Phaser.Math.FloatBetween(0.6, 1.0);
          let color = 0xffffff;
          const colorRand = Math.random();
          if (colorRand < 0.15) {
              color = 0x87ceeb; // 薄い水色
          } else if (colorRand < 0.3) {
              color = 0xfffacd; // 薄いレモンイエロー
          }
          starfield.fillStyle(color, alpha);
          starfield.fillRect(x, y, size, size);
      }

      // 2. 暗い星の描画 (明るい星の3倍: 7500個)
      const numDimStars = 7500;
      for (let i = 0; i < numDimStars; i++) {
          const x = Phaser.Math.Between(0, WORLD_SIZE);
          const y = Phaser.Math.Between(0, WORLD_SIZE);
          const size = 1;
          const alpha = Phaser.Math.FloatBetween(0.1, 0.35);
          starfield.fillStyle(0xffffff, alpha);
          starfield.fillRect(x, y, size, size);
      }

      // 3. 星座 (Constellations) の描画 (35個)
      const numConstellations = 35;
      const constellationColors = [0x475569, 0x1e293b, 0x0891b2, 0x0369a1]; // 暗めのグレー、ブルー、シアン
      
      for (let c = 0; c < numConstellations; c++) {
          const centerX = Phaser.Math.Between(100, 5900);
          const centerY = Phaser.Math.Between(100, 5900);
          const numNodes = Phaser.Math.Between(3, 6);
          const nodes: { x: number; y: number }[] = [];
          const color = Phaser.Math.RND.pick(constellationColors);
          
          for (let n = 0; n < numNodes; n++) {
              const offsetX = Phaser.Math.Between(-80, 80);
              const offsetY = Phaser.Math.Between(-80, 80);
              const nodeX = centerX + offsetX;
              const nodeY = centerY + offsetY;
              nodes.push({ x: nodeX, y: nodeY });
              
              starfield.fillStyle(0xffffff, Phaser.Math.FloatBetween(0.6, 0.9));
              starfield.fillCircle(nodeX, nodeY, 1.5);
          }
          
          starfield.lineStyle(0.8, color, 0.15); // 非常に細く薄い線
          for (let i = 0; i < nodes.length; i++) {
              if (i < nodes.length - 1) {
                  starfield.lineBetween(nodes[i].x, nodes[i].y, nodes[i + 1].x, nodes[i + 1].y);
              } else if (Math.random() > 0.4) {
                  starfield.lineBetween(nodes[i].x, nodes[i].y, nodes[0].x, nodes[0].y);
              }
              
              if (Math.random() > 0.7 && i > 1) {
                  starfield.lineBetween(nodes[i].x, nodes[i].y, nodes[i - 2].x, nodes[i - 2].y);
              }
          }
      }
}
