import { useState, useEffect } from 'react';
import PhaserGame from './components/PhaserGame';
import CommunicationUI from './components/CommunicationUI';
import RadarUI from './components/RadarUI';
import ScenarioEditor from './components/ScenarioEditor';
import DebugLogUI from './components/DebugLogUI';
import { EventBus } from './game/EventBus';
import './App.css';

function App() {
  const [view, setView] = useState<'game' | 'editor'>('game');
  const [debugMode, setDebugMode] = useState<boolean>(false);
  const [speed3x, setSpeed3x] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isGameOver, setIsGameOver] = useState<boolean>(false);

  const handleSetView = (newView: 'game' | 'editor') => {
    setView(newView);
  };

  const handleToggleDebugMode = () => {
    const nextMode = !debugMode;
    setDebugMode(nextMode);
    EventBus.emit('toggle-radar-debug', nextMode);
    EventBus.emit('debug-log-add', {
      type: 'system',
      message: `デバッグモードを ${nextMode ? '有効' : '無効'} にしました`
    });
    // デバッグモードを切ったら速度倍率も通常(1倍)へ戻す
    if (!nextMode && speed3x) {
      setSpeed3x(false);
      EventBus.emit('set-game-speed', 1);
    }
  };

  const handleToggleSpeed = () => {
    const next = !speed3x;
    setSpeed3x(next);
    EventBus.emit('set-game-speed', next ? 3 : 1);
  };

  const handleTogglePause = () => {
    EventBus.emit('toggle-pause');
  };

  // Phaser 側のポーズ状態（Pキー操作を含む）をボタン表示に同期
  useEffect(() => {
    const onPauseChange = (paused: boolean) => setIsPaused(paused);
    EventBus.on('pause-state-changed', onPauseChange);
    return () => {
      EventBus.off('pause-state-changed', onPauseChange);
    };
  }, []);

  // Phaser 側のゲームオーバー状態を受け取り、リスタートUIを表示する
  useEffect(() => {
    const onGameOver = (over: boolean) => setIsGameOver(over);
    EventBus.on('game-over-changed', onGameOver);
    return () => {
      EventBus.off('game-over-changed', onGameOver);
    };
  }, []);

  return (
    <div className="app-container" style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', backgroundColor: '#000', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ position: 'relative', width: '100%', height: '100%', maxWidth: 'min(177.78vh, 1920px)', maxHeight: 'min(56.25vw, 1080px)', aspectRatio: '16/9' }}>
        
        {/* ゲーム画面グループ (エディタ表示中は非表示にするが、アンマウントしない。ScenarioManagerのEventBusリスナーを維持するため) */}
        <div style={{ width: '100%', height: '100%', display: view === 'game' ? 'block' : 'none' }}>
          <PhaserGame />
          <CommunicationUI />
          <RadarUI radarDebugMode={debugMode} />
          {debugMode && <DebugLogUI />}

          {/* ゲームオーバー時のリスタートボタン（全リロードで確実にリセット） */}
          {isGameOver && (
            <button
              onClick={() => EventBus.emit('restart-game')}
              style={{
                position: 'absolute',
                top: '58%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                zIndex: 2100,
                padding: '12px 32px',
                backgroundColor: 'rgba(239, 68, 68, 0.92)',
                border: '2px solid #fca5a5',
                color: '#fff',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: '18px',
                boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
              }}
            >
              ⟳ リスタート
            </button>
          )}

          {/* スピード3倍モード（デバッグモードON時のみ表示） */}
          {debugMode && (
            <button
              onClick={handleToggleSpeed}
              style={{
                position: 'absolute',
                top: '52px',
                right: '12px',
                zIndex: 1000,
                padding: '6px 14px',
                backgroundColor: speed3x ? 'rgba(245, 158, 11, 0.22)' : 'rgba(15, 23, 42, 0.85)',
                border: speed3x ? '1px solid #f59e0b' : '1px solid #1e293b',
                color: speed3x ? '#fbbf24' : '#94a3b8',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '13px',
                backdropFilter: 'blur(4px)',
                boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
                transition: 'all 0.2s',
              }}
            >
              ⏩ スピード{speed3x ? '3倍: ON' : '3倍: OFF'}
            </button>
          )}

          {/* Wave選択セレクトボックス（デバッグモードON時のみ表示） */}
          {debugMode && (
            <div style={{
              position: 'absolute',
              top: '12px',
              right: '490px',
              zIndex: 1000,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: 'rgba(15, 23, 42, 0.85)',
              border: '1px solid #1e293b',
              borderRadius: '6px',
              padding: '4px 12px',
              height: '34px',
              boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
              backdropFilter: 'blur(4px)',
            }}>
              <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 600 }}>デバッグWave移行:</span>
              <select
                onChange={(e) => {
                  EventBus.emit('force-change-wave', e.target.value);
                }}
                defaultValue=""
                style={{
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  color: '#f8fafc',
                  borderRadius: '4px',
                  padding: '2px 8px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                <option value="" disabled>選択...</option>
                <option value="wave1">Wave 1: 防衛網偵察任務</option>
                <option value="wave2">Wave 2: 輸送船護衛指令</option>
                <option value="wave3">Wave 3: 前哨基地攻略指令</option>
                <option value="wave4">Wave 4: 拠点防衛指令</option>
                <option value="wave5">Wave 5: 敵母船殲滅指令</option>
              </select>
            </div>
          )}

          {/* ポーズ／再開ボタン（常時表示） */}
          <button
            onClick={handleTogglePause}
            style={{
              position: 'absolute',
              top: '12px',
              right: '345px',
              zIndex: 1000,
              padding: '8px 16px',
              backgroundColor: isPaused ? 'rgba(34, 197, 94, 0.2)' : 'rgba(15, 23, 42, 0.85)',
              border: isPaused ? '1px solid #22c55e' : '1px solid #1e293b',
              color: isPaused ? '#4ade80' : '#cbd5e1',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '13px',
              backdropFilter: 'blur(4px)',
              boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
              transition: 'all 0.2s'
            }}
          >
            {isPaused ? '▶ 再開' : '⏸ 一時停止'}
          </button>

          {/* デバッグモードトグルボタン */}
          <button
            onClick={handleToggleDebugMode}
            style={{
              position: 'absolute',
              top: '12px',
              right: '185px',
              zIndex: 1000,
              padding: '8px 16px',
              backgroundColor: debugMode ? 'rgba(239, 68, 68, 0.2)' : 'rgba(15, 23, 42, 0.85)',
              border: debugMode ? '1px solid #ef4444' : '1px solid #1e293b',
              color: debugMode ? '#f87171' : '#94a3b8',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '13px',
              backdropFilter: 'blur(4px)',
              boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = debugMode ? 'rgba(239, 68, 68, 0.3)' : 'rgba(30, 41, 59, 0.9)';
              if (!debugMode) e.currentTarget.style.color = '#fff';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = debugMode ? 'rgba(239, 68, 68, 0.2)' : 'rgba(15, 23, 42, 0.85)';
              e.currentTarget.style.color = debugMode ? '#f87171' : '#94a3b8';
            }}
          >
            <span style={{
              display: 'inline-block',
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: debugMode ? '#ef4444' : '#64748b',
              boxShadow: debugMode ? '0 0 8px #ef4444' : 'none'
            }} />
            デバッグモード: {debugMode ? 'ON' : 'OFF'}
          </button>
          
          {/* エディタへの切り替えボタン */}
          <button 
            onClick={() => handleSetView('editor')}
            style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              zIndex: 1000,
              padding: '8px 16px',
              backgroundColor: 'rgba(15, 23, 42, 0.85)',
              border: '1px solid #1e293b',
              color: '#38bdf8',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '13px',
              backdropFilter: 'blur(4px)',
              boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(30, 41, 59, 0.9)';
              e.currentTarget.style.color = '#fff';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(15, 23, 42, 0.85)';
              e.currentTarget.style.color = '#38bdf8';
            }}
          >
            シナリオエディタを開く
          </button>
        </div>

        {/* エディタ画面 */}
        {view === 'editor' && (
          <div style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, zIndex: 1001 }}>
            <ScenarioEditor onBackToGame={() => handleSetView('game')} />
          </div>
        )}

      </div>
    </div>
  );
}

export default App;
