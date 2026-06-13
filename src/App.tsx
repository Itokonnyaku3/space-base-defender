import { useState } from 'react';
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
  };

  return (
    <div className="app-container" style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', backgroundColor: '#000', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ position: 'relative', width: '100%', height: '100%', maxWidth: 'min(177.78vh, 1920px)', maxHeight: 'min(56.25vw, 1080px)', aspectRatio: '16/9' }}>
        
        {/* ゲーム画面グループ (エディタ表示中は非表示にするが、アンマウントしない。ScenarioManagerのEventBusリスナーを維持するため) */}
        <div style={{ width: '100%', height: '100%', display: view === 'game' ? 'block' : 'none' }}>
          <PhaserGame />
          <CommunicationUI />
          <RadarUI radarDebugMode={debugMode} />
          {debugMode && <DebugLogUI />}
          
          {/* Wave選択セレクトボックス（デバッグモードON時のみ表示） */}
          {debugMode && (
            <div style={{
              position: 'absolute',
              top: '12px',
              right: '340px',
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
