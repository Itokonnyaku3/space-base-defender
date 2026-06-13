import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import MainScene from '../game/MainScene';

export default function PhaserGame() {
  const gameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!gameRef.current) return;

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: 1920,
        height: 1080
      },
      parent: gameRef.current,
      physics: {
        default: 'arcade',
        arcade: {
          gravity: { x: 0, y: 0 },
          debug: false
        }
      },
      scene: [MainScene]
    };

    const game = new Phaser.Game(config);

    const preventComposition = (e: CompositionEvent) => {
      e.preventDefault();
    };
    window.addEventListener('compositionstart', preventComposition, { passive: false });

    return () => {
      window.removeEventListener('compositionstart', preventComposition);
      game.destroy(true);
    };
  }, []);

  return (
    <div 
      ref={gameRef} 
      style={{ width: '100%', height: '100%', overflow: 'hidden' }} 
      tabIndex={0}
      inputMode="none"
      autoCorrect="off"
    />
  );
}
