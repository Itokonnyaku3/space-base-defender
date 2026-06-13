import React, { useState, useEffect, useRef } from 'react';
import { EventBus } from '../game/EventBus';
import type { ScenarioData, ScenarioEvent, ScenarioAction, DynamicEventDialogue } from '../game/ScenarioManager';
import { ENEMY_CONFIGS } from '../game/configs/EnemyConfig';

interface ScenarioEditorProps {
  onBackToGame: () => void;
}

const DEFAULT_EVENT: ScenarioEvent = {
  id: 'new_event',
  triggerType: 'time',
  triggerValue: 5000,
  hasTriggered: false,
  sender: 'operator',
  senderName: 'オペレーター',
  message: '新規メッセージ内容',
  avatarType: 'wave',
  expression: 'normal'
};

export default function ScenarioEditor({ onBackToGame }: ScenarioEditorProps) {
  const [scenarioData, setScenarioData] = useState<ScenarioData>({
    events: [],
    dynamicEvents: {
      relay_destroyed: [],
      outpost_destroyed: [],
      relay_placed: []
    }
  });

  const [activeTab, setActiveTab] = useState<'edit' | 'graph' | 'json'>('graph');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [jsonText, setJsonText] = useState('');
  const [selectedDetailEnemyConfig, setSelectedDetailEnemyConfig] = useState<any>(null);

  const draggedIndexRef = useRef<number | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    draggedIndexRef.current = index;
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    const sourceIndex = draggedIndexRef.current;
    if (sourceIndex === null || sourceIndex === targetIndex) return;

    const eventsCopy = [...scenarioData.events];
    const [draggedEvent] = eventsCopy.splice(sourceIndex, 1);
    eventsCopy.splice(targetIndex, 0, draggedEvent);

    const updated = {
      ...scenarioData,
      events: eventsCopy
    };
    updateScenarioData(updated);
    draggedIndexRef.current = null;
  };
  
  // マウント時にデフォルトデータを読み込む
  useEffect(() => {
    loadDefault();
  }, []);

  const loadDefault = async () => {
    try {
      // localStorageに保存されている編集データを優先する
      const localData = localStorage.getItem('space_base_defender_scenario');
      if (localData) {
        try {
          const data = JSON.parse(localData);
          if (data.events) {
            data.events = data.events.map((e: any, idx: number) => ({
              ...e,
              uid: e.uid || `evt_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 9)}`
            }));
          }
          setScenarioData(data);
          setJsonText(JSON.stringify(data, null, 2));
          if (data.events && data.events.length > 0) {
            setSelectedEventId(data.events[0].id);
          }
          console.log("Loaded scenario from localStorage in Editor");
          return;
        } catch (e) {
          console.error("Failed to parse localStorage scenario in Editor:", e);
        }
      }

      const response = await fetch(`assets/data/default_scenario.json?t=${Date.now()}`, {
        cache: 'no-store',
        headers: {
          'Pragma': 'no-cache',
          'Cache-Control': 'no-cache'
        }
      });
      if (response.ok) {
        const data = await response.json();
        if (data.events) {
          data.events = data.events.map((e: any, idx: number) => ({
            ...e,
            uid: e.uid || `evt_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 9)}`
          }));
        }
        setScenarioData(data);
        setJsonText(JSON.stringify(data, null, 2));
        if (data.events && data.events.length > 0) {
          setSelectedEventId(data.events[0].id);
        }
      }
    } catch (e) {
      console.error("Failed to fetch default scenario:", e);
    }
  };

  // データの自動保存とゲームへの即時反映
  const updateScenarioData = (newData: ScenarioData) => {
    setScenarioData(newData);
    setJsonText(JSON.stringify(newData, null, 2));
    localStorage.setItem('space_base_defender_scenario', JSON.stringify(newData));
    // Phaserシーンにリアルタイム注入（編集内容を即座に反映）
    EventBus.emit('scenario-inject', newData);
  };

  // ローカルJSONファイルへ書き込み保存
  const handleSaveToFile = async () => {
    try {
      const response = await fetch('/api/save-scenario', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(scenarioData)
      });
      if (response.ok) {
        const resData = await response.json();
        if (resData.status === 'ok') {
          alert('ローカルの default_scenario.json ファイルに上書き保存しました。');
        } else {
          alert('保存に失敗しました: ' + resData.message);
        }
      } else {
        alert('サーバーとの通信に失敗しました。');
      }
    } catch (err: any) {
      console.error(err);
      alert('保存中にエラーが発生しました: ' + err.message);
    }
  };

  // テストプレイ開始
  const handleTestPlay = () => {
    // Phaserシーンにデータを注入
    EventBus.emit('scenario-inject', scenarioData);
    // ゲーム画面に戻る
    onBackToGame();
  };

  // イベント追加
  const handleAddEvent = () => {
    const newId = `event_${Date.now()}`;
    const newEvent: ScenarioEvent & { uid?: string } = {
      ...DEFAULT_EVENT,
      id: newId,
      uid: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      triggerValue: scenarioData.events.length > 0 
        ? Math.max(...scenarioData.events.map(e => e.triggerValue)) + 10000 
        : 5000
    };
    const updated = {
      ...scenarioData,
      events: [...scenarioData.events, newEvent]
    };
    updateScenarioData(updated);
    setSelectedEventId(newId);
  };

  // イベント削除
  const handleDeleteEvent = (id: string) => {
    const filtered = scenarioData.events.filter(e => e.id !== id);
    const updated = {
      ...scenarioData,
      events: filtered
    };
    updateScenarioData(updated);
    if (selectedEventId === id) {
      setSelectedEventId(filtered.length > 0 ? filtered[0].id : null);
    }
  };

  // イベント複製
  const handleCloneEvent = (event: ScenarioEvent) => {
    const newId = `${event.id}_copy_${Math.floor(Math.random() * 100)}`;
    const cloned: ScenarioEvent & { uid?: string } = {
      ...JSON.parse(JSON.stringify(event)),
      id: newId,
      uid: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
    const updated = {
      ...scenarioData,
      events: [...scenarioData.events, cloned]
    };
    updateScenarioData(updated);
    setSelectedEventId(newId);
  };

  const selectedEvent = scenarioData.events.find(e => e.id === selectedEventId);

  // イベントフィールド更新
  const handleUpdateEventField = (key: keyof ScenarioEvent, value: any) => {
    if (!selectedEventId) return;
    const updatedEvents = scenarioData.events.map(e => {
      if (e.id === selectedEventId) {
        return { ...e, [key]: value };
      }
      return e;
    });
    updateScenarioData({
      ...scenarioData,
      events: updatedEvents
    });

    if (key === 'id') {
      setSelectedEventId(value);
    }
  };

  // アクション更新用ヘルパー
  const handleUpdateChoicesActions = (choiceType: 'yes' | 'no', actionIndex: number, actionField: keyof ScenarioAction | 'params', value: any) => {
    if (!selectedEvent || !selectedEvent.choices) return;
    const choices = { ...selectedEvent.choices };
    const targetChoice = choices[choiceType];
    
    if (actionField === 'params') {
      targetChoice.actions[actionIndex].params = {
        ...targetChoice.actions[actionIndex].params,
        ...value
      };
    } else {
      (targetChoice.actions[actionIndex] as any)[actionField] = value;
    }

    handleUpdateEventField('choices', choices);
  };

  const handleAddChoiceAction = (choiceType: 'yes' | 'no') => {
    if (!selectedEvent) return;
    const choices = selectedEvent.choices ? { ...selectedEvent.choices } : {
      yes: { text: 'はい', message: '応答メッセージ', actions: [] },
      no: { text: 'いいえ', message: '応答メッセージ', actions: [] }
    };
    
    choices[choiceType].actions.push({
      type: 'spawn_enemy',
      params: { count: 1 }
    });

    handleUpdateEventField('choices', choices);
  };

  const handleRemoveChoiceAction = (choiceType: 'yes' | 'no', index: number) => {
    if (!selectedEvent || !selectedEvent.choices) return;
    const choices = { ...selectedEvent.choices };
    choices[choiceType].actions.splice(index, 1);
    handleUpdateEventField('choices', choices);
  };

  const handleUpdateEventActions = (actionIndex: number, actionField: keyof ScenarioAction | 'params', value: any) => {
    if (!selectedEvent) return;
    const actions = selectedEvent.actions ? [...selectedEvent.actions] : [];
    
    if (actionField === 'params') {
      actions[actionIndex].params = {
        ...actions[actionIndex].params,
        ...value
      };
    } else {
      (actions[actionIndex] as any)[actionField] = value;
    }

    handleUpdateEventField('actions', actions);
  };

  const handleAddEventAction = () => {
    if (!selectedEvent) return;
    const actions = selectedEvent.actions ? [...selectedEvent.actions] : [];
    actions.push({
      type: 'spawn_enemy',
      params: { count: 1, enemyType: 'standard', spawnSource: 'outpost' }
    });
    handleUpdateEventField('actions', actions);
  };

  const handleRemoveEventAction = (actionIndex: number) => {
    if (!selectedEvent || !selectedEvent.actions) return;
    const actions = selectedEvent.actions.filter((_, idx) => idx !== actionIndex);
    handleUpdateEventField('actions', actions.length > 0 ? actions : undefined);
  };

  // ダイナミックイベントのセリフ追加・編集
  const handleUpdateDynamicEvent = (type: 'relay_destroyed' | 'outpost_destroyed' | 'relay_placed', index: number, field: keyof DynamicEventDialogue | 'flag', value: any) => {
    const events = scenarioData.dynamicEvents[type] ? [...scenarioData.dynamicEvents[type]!] : [];
    if (!events[index]) return;

    if (field === 'flag') {
      events[index].flagCondition = value ? { flag: 'allyRescued', value } : undefined;
    } else {
      (events[index] as any)[field] = value;
    }

    updateScenarioData({
      ...scenarioData,
      dynamicEvents: {
        ...scenarioData.dynamicEvents,
        [type]: events
      }
    });
  };

  const handleAddDynamicEvent = (type: 'relay_destroyed' | 'outpost_destroyed' | 'relay_placed') => {
    const events = scenarioData.dynamicEvents[type] ? [...scenarioData.dynamicEvents[type]!] : [];
    events.push({
      sender: 'operator',
      senderName: 'アルバイトのオペレーター',
      message: '新規の割り込み警告セリフ',
      avatarType: 'wave',
      expression: 'normal'
    });
    updateScenarioData({
      ...scenarioData,
      dynamicEvents: {
        ...scenarioData.dynamicEvents,
        [type]: events
      }
    });
  };

  const handleRemoveDynamicEvent = (type: 'relay_destroyed' | 'outpost_destroyed' | 'relay_placed', index: number) => {
    const events = scenarioData.dynamicEvents[type] ? [...scenarioData.dynamicEvents[type]!] : [];
    events.splice(index, 1);
    updateScenarioData({
      ...scenarioData,
      dynamicEvents: {
        ...scenarioData.dynamicEvents,
        [type]: events
      }
    });
  };

  // JSONインポート
  const handleImportJson = () => {
    try {
      const parsed = JSON.parse(jsonText);
      if (parsed.events && Array.isArray(parsed.events)) {
        updateScenarioData(parsed);
        if (parsed.events.length > 0) {
          setSelectedEventId(parsed.events[0].id);
        }
        alert('シナリオデータを正常にインポートしました！');
      } else {
        alert('無効なシナリオデータ形式です。');
      }
    } catch (e) {
      alert('JSONのパースに失敗しました。書式を確認してください。');
    }
  };

  // JSONファイルをダウンロード
  const handleDownloadJson = () => {
    const blob = new Blob([jsonText], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'scenario.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // 時系列（タイムライン）ソート済みのイベントリスト
  const sortedEvents = [...scenarioData.events].sort((a, b) => {
    const order: Record<string, number> = { time: 1, points: 2, transport_ship_hp: 3 };
    const valA = order[a.triggerType] || 99;
    const valB = order[b.triggerType] || 99;
    if (valA !== valB) {
      return valA - valB;
    }
    return a.triggerValue - b.triggerValue;
  });

  return (
    <div style={{
      width: '100%',
      height: '100%',
      backgroundColor: '#0a0f1d',
      color: '#e2e8f0',
      fontFamily: 'Inter, system-ui, sans-serif',
      display: 'flex',
      flexDirection: 'column',
      userSelect: 'none',
      border: '1px solid #1e293b',
      boxShadow: '0 20px 25px -5px rgba(0,0,0,0.7)',
      borderRadius: '12px',
      overflow: 'hidden'
    }}>
      {/* ヘッダーバー */}
      <div style={{
        padding: '12px 20px',
        background: 'linear-gradient(90deg, #0f172a 0%, #1e1b4b 100%)',
        borderBottom: '1px solid #1e293b',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            backgroundColor: '#06b6d4',
            boxShadow: '0 0 10px #06b6d4'
          }} />
          <span style={{ fontWeight: 700, fontSize: '18px', letterSpacing: '0.05em', color: '#f8fafc' }}>
            SPACE BASE DEFENDER - シナリオエディタ
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            onClick={async () => {
              if (window.confirm('編集内容をすべて破棄し、デフォルトのシナリオ設定に戻しますか？')) {
                localStorage.removeItem('space_base_defender_scenario');
                try {
                  const response = await fetch(`assets/data/default_scenario.json?t=${Date.now()}`, {
                    cache: 'no-store',
                    headers: {
                      'Pragma': 'no-cache',
                      'Cache-Control': 'no-cache'
                    }
                  });
                  if (response.ok) {
                    const data = await response.json();
                    if (data.events) {
                      data.events = data.events.map((e: any, idx: number) => ({
                        ...e,
                        uid: e.uid || `evt_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 9)}`
                      }));
                    }
                    setScenarioData(data);
                    setJsonText(JSON.stringify(data, null, 2));
                    if (data.events && data.events.length > 0) {
                      setSelectedEventId(data.events[0].id);
                    }
                    EventBus.emit('scenario-inject', data);
                    alert('デフォルト設定に戻しました。');
                  } else {
                    alert('デフォルト設定のロードに失敗しました。');
                  }
                } catch (err) {
                  console.error(err);
                  alert('デフォルト設定のロード中にエラーが発生しました。');
                }
              }
            }}
            style={{
              padding: '8px 16px',
              backgroundColor: '#374151',
              color: '#f8fafc',
              border: '1px solid #4b5563',
              borderRadius: '6px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#4b5563'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#374151'}
          >
            デフォルトに戻す
          </button>
          <button 
            onClick={handleSaveToFile}
            style={{
              padding: '8px 16px',
              backgroundColor: '#10b981',
              color: '#f8fafc',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.4)'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#059669'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#10b981'}
          >
            JSONファイルに保存
          </button>
          <button 
            onClick={handleTestPlay}
            style={{
              padding: '8px 16px',
              backgroundColor: '#06b6d4',
              color: '#0f172a',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: '0 4px 6px -1px rgba(6, 182, 212, 0.4)'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#22d3ee'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#06b6d4'}
          >
            テストプレイ開始
          </button>
          <button 
            onClick={onBackToGame}
            style={{
              padding: '8px 16px',
              backgroundColor: '#1e293b',
              color: '#f8fafc',
              border: '1px solid #334155',
              borderRadius: '6px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#334155'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#1e293b'}
          >
            ゲームに戻る
          </button>
        </div>
      </div>

      {/* タブ切り替え */}
      <div style={{
        display: 'flex',
        backgroundColor: '#0f172a',
        borderBottom: '1px solid #1e293b',
        padding: '0 12px'
      }}>
        {[
          { id: 'graph', label: 'ダッシュボード' },
          { id: 'edit', label: 'シナリオ詳細編集' },
          { id: 'json', label: 'JSON入出力' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            style={{
              padding: '14px 20px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid #06b6d4' : '2px solid transparent',
              color: activeTab === tab.id ? '#06b6d4' : '#94a3b8',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* メインエリア */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {activeTab === 'edit' && (
          <>
            {/* 左側: イベントリスト */}
            <div style={{
              width: '280px',
              borderRight: '1px solid #1e293b',
              backgroundColor: '#090d16',
              display: 'flex',
              flexDirection: 'column'
            }}>
              <div style={{ padding: '16px', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#94a3b8' }}>イベント一覧</span>
                <button 
                  onClick={handleAddEvent}
                  style={{
                    padding: '4px 10px',
                    backgroundColor: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '4px',
                    color: '#06b6d4',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  ＋ 追加
                </button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                {scenarioData.events.map((event, index) => (
                  <div 
                    key={(event as any).uid || event.id}
                    onClick={() => setSelectedEventId(event.id)}
                    draggable={true}
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDrop={(e) => handleDrop(e, index)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '6px',
                      backgroundColor: selectedEventId === event.id ? '#1e1b4b' : 'transparent',
                      border: selectedEventId === event.id ? '1px solid #4338ca' : '1px solid transparent',
                      cursor: 'grab',
                      marginBottom: '6px',
                      transition: 'all 0.15s'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 600, fontSize: '13px', color: selectedEventId === event.id ? '#f8fafc' : '#cbd5e1' }}>
                        {event.id}
                      </span>
                      <span style={{
                        fontSize: '10px',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        backgroundColor: '#1e293b',
                        color: '#38bdf8'
                      }}>
                        {event.triggerType === 'time' 
                          ? `${event.triggerValue / 1000}秒` 
                          : event.triggerType === 'points' 
                            ? `${event.triggerValue}pt` 
                            : `輸送船HP${event.triggerValue}%`}
                      </span>
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                      {event.senderName}: {event.message}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 右側: 詳細編集フォーム */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px', backgroundColor: '#0b0f19' }}>
              {selectedEvent ? (
                <div style={{ maxWidth: '800px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {/* 基本情報 */}
                  <div style={{ display: 'flex', gap: '16px', background: '#111827', padding: '16px', borderRadius: '8px', border: '1px solid #1f2937' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '6px', fontWeight: 600 }}>イベントID</label>
                      <input 
                        type="text" 
                        value={selectedEvent.id}
                        onChange={(e) => handleUpdateEventField('id', e.target.value)}
                        style={{ width: '90%', padding: '8px', borderRadius: '4px', backgroundColor: '#1f2937', border: '1px solid #374151', color: '#fff' }}
                      />
                    </div>
                    <div style={{ width: '120px' }}>
                      <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '6px', fontWeight: 600 }}>対象Wave</label>
                      <select 
                        value={selectedEvent.targetWave || 'none'}
                        onChange={(e) => handleUpdateEventField('targetWave', e.target.value === 'none' ? undefined : e.target.value)}
                        style={{ width: '100%', padding: '8px', borderRadius: '4px', backgroundColor: '#1f2937', border: '1px solid #374151', color: '#fff' }}
                      >
                        <option value="none">指定なし</option>
                        <option value="wave1">Wave 1</option>
                        <option value="wave2">Wave 2</option>
                        <option value="wave3">Wave 3</option>
                        <option value="wave4">Wave 4</option>
                        <option value="wave5">Wave 5</option>
                      </select>
                    </div>
                    <div style={{ width: '120px' }}>
                      <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '6px', fontWeight: 600 }}>トリガータイプ</label>
                      <select 
                        value={selectedEvent.triggerType}
                        onChange={(e) => {
                          const newType = e.target.value;
                          handleUpdateEventField('triggerType', newType);
                          if (newType === 'transport_ship_hp') {
                            handleUpdateEventField('triggerValue', 99);
                          }
                        }}
                        style={{ width: '100%', padding: '8px', borderRadius: '4px', backgroundColor: '#1f2937', border: '1px solid #374151', color: '#fff' }}
                      >
                        <option value="time">経過時間</option>
                        <option value="points">ポイント値</option>
                        <option value="transport_ship_hp">輸送船状態</option>
                      </select>
                    </div>
                    <div style={{ width: '150px' }}>
                      <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '6px', fontWeight: 600 }}>
                        {selectedEvent.triggerType === 'time' 
                          ? '発生時間 (ミリ秒)' 
                          : selectedEvent.triggerType === 'points' 
                            ? '必要スコア値' 
                            : 'トリガー閾値'}
                      </label>
                      {selectedEvent.triggerType === 'transport_ship_hp' ? (
                        <select 
                          value={selectedEvent.triggerValue}
                          onChange={(e) => handleUpdateEventField('triggerValue', parseInt(e.target.value) || 99)}
                          style={{ width: '100%', padding: '8px', borderRadius: '4px', backgroundColor: '#1f2937', border: '1px solid #374151', color: '#fff' }}
                        >
                          <option value="99">初めてダメージを受けた (HP 99%以下)</option>
                          <option value="50">ダメージ半分超 (HP 50%以下)</option>
                        </select>
                      ) : (
                        <input 
                          type="number" 
                          value={selectedEvent.triggerValue}
                          onChange={(e) => handleUpdateEventField('triggerValue', parseInt(e.target.value) || 0)}
                          style={{ width: '90%', padding: '8px', borderRadius: '4px', backgroundColor: '#1f2937', border: '1px solid #374151', color: '#fff' }}
                        />
                      )}
                    </div>
                  </div>

                  {/* 会話（セリフ）の編集 */}
                  <div style={{ background: '#111827', padding: '20px', borderRadius: '8px', border: '1px solid #1f2937', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <span style={{ fontWeight: 600, fontSize: '14px', color: '#38bdf8' }}>通信会話設定</span>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', fontSize: '11px', color: '#9ca3af', marginBottom: '4px' }}>発言者名</label>
                        <input 
                          type="text" 
                          value={selectedEvent.senderName}
                          onChange={(e) => handleUpdateEventField('senderName', e.target.value)}
                          style={{ width: '95%', padding: '8px', borderRadius: '4px', backgroundColor: '#1f2937', border: '1px solid #374151', color: '#fff' }}
                        />
                      </div>
                      <div style={{ width: '140px' }}>
                        <label style={{ display: 'block', fontSize: '11px', color: '#9ca3af', marginBottom: '4px' }}>アバター</label>
                        <select 
                          value={selectedEvent.avatarType}
                          onChange={(e) => handleUpdateEventField('avatarType', e.target.value)}
                          style={{ width: '100%', padding: '8px', borderRadius: '4px', backgroundColor: '#1f2937', border: '1px solid #374151', color: '#fff' }}
                        >
                          <option value="wave">オシロスコープ波形</option>
                          <option value="hologram">ホログラム</option>
                          <option value="mothership">敵巨大母船</option>
                          <option value="ally">味方船</option>
                        </select>
                      </div>
                      <div style={{ width: '120px' }}>
                        <label style={{ display: 'block', fontSize: '11px', color: '#9ca3af', marginBottom: '4px' }}>表情</label>
                        <select 
                          value={selectedEvent.expression || 'normal'}
                          onChange={(e) => handleUpdateEventField('expression', e.target.value)}
                          style={{ width: '100%', padding: '8px', borderRadius: '4px', backgroundColor: '#1f2937', border: '1px solid #374151', color: '#fff' }}
                        >
                          <option value="normal">通常</option>
                          <option value="joy">喜び</option>
                          <option value="anger">怒り</option>
                          <option value="sorrow">悲しみ</option>
                          <option value="fun">楽しげ</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: '#9ca3af', marginBottom: '4px' }}>セリフ内容</label>
                      <textarea 
                        rows={3}
                        value={selectedEvent.message}
                        onChange={(e) => handleUpdateEventField('message', e.target.value)}
                        style={{ width: '97%', padding: '8px', borderRadius: '4px', backgroundColor: '#1f2937', border: '1px solid #374151', color: '#fff', resize: 'none' }}
                      />
                    </div>
                  </div>

                  {/* 直接実行アクション（タイムライン発火時）の編集 */}
                  <div style={{ background: '#111827', padding: '20px', borderRadius: '8px', border: '1px solid #1f2937' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <span style={{ fontWeight: 600, fontSize: '14px', color: '#10b981' }}>イベント発生時アクション設定</span>
                      <button 
                        onClick={handleAddEventAction}
                        style={{
                          padding: '4px 10px',
                          backgroundColor: '#10b981',
                          border: 'none',
                          borderRadius: '4px',
                          color: '#fff',
                          fontSize: '11px',
                          cursor: 'pointer'
                        }}
                      >
                        ＋ アクション追加
                      </button>
                    </div>

                    {selectedEvent.actions && selectedEvent.actions.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {selectedEvent.actions.map((act, aIdx) => (
                          <div key={aIdx} style={{ backgroundColor: '#1e293b', padding: '10px', borderRadius: '6px', border: '1px solid #334155', display: 'flex', gap: '8px', flexDirection: 'column' }}>
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', justifyContent: 'space-between' }}>
                              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                <select 
                                  value={act.type}
                                  onChange={(e) => handleUpdateEventActions(aIdx, 'type', e.target.value)}
                                  style={{ backgroundColor: '#0f172a', color: '#fff', border: 'none', padding: '4px', borderRadius: '4px', fontSize: '12px' }}
                                >
                                  <option value="spawn_enemy">敵湧き</option>
                                  <option value="spawn_ally">味方船追加</option>
                                  <option value="spawn_mothership">巨大母船ボス湧き</option>
                                  <option value="add_points">ポイント加算</option>
                                  <option value="change_spawn_rate">湧きディレイ変更</option>
                                </select>
                              </div>
                              <button onClick={() => handleRemoveEventAction(aIdx)} style={{ border: 'none', color: '#ef4444', background: 'none', cursor: 'pointer', fontSize: '14px' }}>×</button>
                            </div>

                            {/* アクション詳細パラメータ */}
                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginTop: '4px', fontSize: '11px', color: '#94a3b8' }}>
                              {act.type === 'spawn_enemy' && (
                                <>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span>数:</span>
                                    <input 
                                      type="number"
                                      value={act.params.count || 1}
                                      onChange={(e) => handleUpdateEventActions(aIdx, 'params', { count: parseInt(e.target.value) || 1 })}
                                      style={{ width: '40px', backgroundColor: '#0f172a', color: '#fff', border: 'none', textAlign: 'center', padding: '2px', borderRadius: '2px' }}
                                    />
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span>敵機:</span>
                                    <select
                                      value={act.params.enemyType || 'standard'}
                                      onChange={(e) => handleUpdateEventActions(aIdx, 'params', { enemyType: e.target.value })}
                                      style={{ backgroundColor: '#0f172a', color: '#fff', border: 'none', padding: '2px', borderRadius: '2px' }}
                                    >
                                      <option value="standard">戦闘機 (standard)</option>
                                      <option value="single_circle">単独旋回機 (single_circle)</option>
                                      <option value="squadron_attacker">編隊攻撃機 (squadron_attacker)</option>
                                    </select>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span>出現元:</span>
                                    <select
                                      value={act.params.spawnSource || 'outpost'}
                                      onChange={(e) => handleUpdateEventActions(aIdx, 'params', { spawnSource: e.target.value })}
                                      style={{ backgroundColor: '#0f172a', color: '#fff', border: 'none', padding: '2px', borderRadius: '2px' }}
                                    >
                                      <option value="outpost">敵前線基地</option>
                                      <option value="screen_edge">画面端</option>
                                      <option value="base">本部基地の近く</option>
                                    </select>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span>編成ID:</span>
                                    <input 
                                      type="text"
                                      value={act.params.squadronId || ''}
                                      placeholder="任意"
                                      onChange={(e) => handleUpdateEventActions(aIdx, 'params', { squadronId: e.target.value || undefined })}
                                      style={{ width: '80px', backgroundColor: '#0f172a', color: '#fff', border: 'none', padding: '2px', borderRadius: '2px' }}
                                    />
                                  </div>
                                </>
                              )}

                              {act.type === 'spawn_ally' && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <span>数:</span>
                                  <input 
                                    type="number"
                                    value={act.params.count || 1}
                                    onChange={(e) => handleUpdateEventActions(aIdx, 'params', { count: parseInt(e.target.value) || 1 })}
                                    style={{ width: '40px', backgroundColor: '#0f172a', color: '#fff', border: 'none', textAlign: 'center', padding: '2px', borderRadius: '2px' }}
                                  />
                                </div>
                              )}

                              {act.type === 'spawn_mothership' && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <span>数:</span>
                                  <input 
                                    type="number"
                                    value={act.params.count || 1}
                                    onChange={(e) => handleUpdateEventActions(aIdx, 'params', { count: parseInt(e.target.value) || 1 })}
                                    style={{ width: '40px', backgroundColor: '#0f172a', color: '#fff', border: 'none', textAlign: 'center', padding: '2px', borderRadius: '2px' }}
                                  />
                                </div>
                              )}

                              {act.type === 'add_points' && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <span>加算ポイント数:</span>
                                  <input 
                                    type="number"
                                    value={act.params.points || 0}
                                    onChange={(e) => handleUpdateEventActions(aIdx, 'params', { points: parseInt(e.target.value) || 0 })}
                                    style={{ width: '60px', backgroundColor: '#0f172a', color: '#fff', border: 'none', textAlign: 'center', padding: '2px', borderRadius: '2px' }}
                                  />
                                </div>
                              )}

                              {act.type === 'change_spawn_rate' && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <span>湧き間隔 (ミリ秒):</span>
                                  <input 
                                    type="number"
                                    value={act.params.rate || 20000}
                                    onChange={(e) => handleUpdateEventActions(aIdx, 'params', { rate: parseInt(e.target.value) || 20000 })}
                                    style={{ width: '70px', backgroundColor: '#0f172a', color: '#fff', border: 'none', textAlign: 'center', padding: '2px', borderRadius: '2px' }}
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: '11px', color: '#4b5563', fontStyle: 'italic' }}>
                        このイベント発生時には何もアクションが実行されません。（会話のみ）
                      </div>
                    )}
                  </div>

                  {/* 選択肢/分岐の編集 */}
                  <div style={{ background: '#111827', padding: '20px', borderRadius: '8px', border: '1px solid #1f2937' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <span style={{ fontWeight: 600, fontSize: '14px', color: '#a855f7' }}>選択肢分岐設定 (Yes/No)</span>
                      <button 
                        onClick={() => {
                          if (selectedEvent.choices) {
                            handleUpdateEventField('choices', undefined);
                          } else {
                            handleUpdateEventField('choices', {
                              yes: { text: '受け入れる', message: '了解した、恩に着る！', actions: [] },
                              no: { text: '断る', message: '冷たい奴め...', actions: [] }
                            });
                          }
                        }}
                        style={{
                          padding: '4px 10px',
                          backgroundColor: selectedEvent.choices ? '#ef4444' : '#4f46e5',
                          border: 'none',
                          borderRadius: '4px',
                          color: '#fff',
                          fontSize: '11px',
                          cursor: 'pointer'
                        }}
                      >
                        {selectedEvent.choices ? '選択肢を削除' : '選択肢を追加する'}
                      </button>
                    </div>

                    {selectedEvent.choices && (
                      <div style={{ display: 'flex', gap: '16px' }}>
                        {/* YES選択肢 */}
                        <div style={{ flex: 1, backgroundColor: '#0f172a', padding: '12px', borderRadius: '6px', border: '1px solid #22c55e' }}>
                          <span style={{ color: '#22c55e', fontSize: '12px', fontWeight: 700 }}>選択肢 YES (肯定)</span>
                          <div style={{ margin: '8px 0' }}>
                            <label style={{ fontSize: '11px', color: '#94a3b8' }}>ボタンテキスト</label>
                            <input 
                              type="text"
                              value={selectedEvent.choices.yes.text}
                              onChange={(e) => {
                                const choices = { ...selectedEvent.choices! };
                                choices.yes.text = e.target.value;
                                handleUpdateEventField('choices', choices);
                              }}
                              style={{ width: '90%', padding: '6px', marginTop: '4px', borderRadius: '4px', backgroundColor: '#1e293b', border: '1px solid #334155', color: '#fff', fontSize: '12px' }}
                            />
                          </div>
                          <div style={{ margin: '8px 0' }}>
                            <label style={{ fontSize: '11px', color: '#94a3b8' }}>応答セリフ</label>
                            <textarea 
                              rows={2}
                              value={selectedEvent.choices.yes.message}
                              onChange={(e) => {
                                const choices = { ...selectedEvent.choices! };
                                choices.yes.message = e.target.value;
                                handleUpdateEventField('choices', choices);
                              }}
                              style={{ width: '90%', padding: '6px', marginTop: '4px', borderRadius: '4px', backgroundColor: '#1e293b', border: '1px solid #334155', color: '#fff', fontSize: '12px', resize: 'none' }}
                            />
                          </div>

                          {/* アクション一覧 */}
                          <div style={{ marginTop: '10px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                              <span style={{ fontSize: '11px', color: '#94a3b8' }}>実行アクション</span>
                              <button onClick={() => handleAddChoiceAction('yes')} style={{ fontSize: '10px', color: '#22c55e', background: 'none', border: 'none', cursor: 'pointer' }}>＋ アクション追加</button>
                            </div>
                            {selectedEvent.choices.yes.actions.map((act, aIdx) => (
                              <div key={aIdx} style={{ backgroundColor: '#1e293b', padding: '8px', borderRadius: '4px', marginBottom: '6px', border: '1px solid #334155', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <select 
                                    value={act.type}
                                    onChange={(e) => handleUpdateChoicesActions('yes', aIdx, 'type', e.target.value)}
                                    style={{ backgroundColor: '#0f172a', color: '#fff', border: 'none', fontSize: '11px', borderRadius: '2px', padding: '2px' }}
                                  >
                                    <option value="spawn_enemy">敵湧き</option>
                                    <option value="spawn_ally">味方船追加</option>
                                    <option value="spawn_mothership">巨大母船ボス湧き</option>
                                    <option value="add_points">ポイント加算</option>
                                    <option value="change_spawn_rate">湧きディレイ変更</option>
                                  </select>
                                  <button onClick={() => handleRemoveChoiceAction('yes', aIdx)} style={{ border: 'none', color: '#ef4444', background: 'none', cursor: 'pointer', fontSize: '12px' }}>×</button>
                                </div>
                                
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', fontSize: '10px', color: '#94a3b8' }}>
                                  {act.type === 'spawn_enemy' && (
                                    <>
                                      <span>数:</span>
                                      <input 
                                        type="number"
                                        value={act.params.count || 1}
                                        onChange={(e) => handleUpdateChoicesActions('yes', aIdx, 'params', { count: parseInt(e.target.value) || 1 })}
                                        style={{ width: '30px', backgroundColor: '#0f172a', color: '#fff', border: 'none', textAlign: 'center' }}
                                      />
                                      <span>敵機:</span>
                                      <select
                                        value={act.params.enemyType || 'standard'}
                                        onChange={(e) => handleUpdateChoicesActions('yes', aIdx, 'params', { enemyType: e.target.value })}
                                        style={{ backgroundColor: '#0f172a', color: '#fff', border: 'none' }}
                                      >
                                        <option value="standard">戦闘機 (standard)</option>
                                        <option value="single_circle">単独旋回機 (single_circle)</option>
                                        <option value="squadron_attacker">編隊攻撃機 (squadron_attacker)</option>
                                      </select>
                                      <span>出現元:</span>
                                      <select
                                        value={act.params.spawnSource || 'outpost'}
                                        onChange={(e) => handleUpdateChoicesActions('yes', aIdx, 'params', { spawnSource: e.target.value })}
                                        style={{ backgroundColor: '#0f172a', color: '#fff', border: 'none' }}
                                      >
                                        <option value="outpost">前線基地</option>
                                        <option value="screen_edge">画面端</option>
                                        <option value="base">本部基地の近く</option>
                                      </select>
                                    </>
                                  )}
                                  
                                  {act.type === 'spawn_ally' && (
                                    <>
                                      <span>数:</span>
                                      <input 
                                        type="number"
                                        value={act.params.count || 1}
                                        onChange={(e) => handleUpdateChoicesActions('yes', aIdx, 'params', { count: parseInt(e.target.value) || 1 })}
                                        style={{ width: '30px', backgroundColor: '#0f172a', color: '#fff', border: 'none', textAlign: 'center' }}
                                      />
                                    </>
                                  )}
                                  
                                  {act.type === 'spawn_mothership' && (
                                    <>
                                      <span>数:</span>
                                      <input 
                                        type="number"
                                        value={act.params.count || 1}
                                        onChange={(e) => handleUpdateChoicesActions('yes', aIdx, 'params', { count: parseInt(e.target.value) || 1 })}
                                        style={{ width: '30px', backgroundColor: '#0f172a', color: '#fff', border: 'none', textAlign: 'center' }}
                                      />
                                    </>
                                  )}

                                  {act.type === 'add_points' && (
                                    <>
                                      <span>ポイント:</span>
                                      <input 
                                        type="number"
                                        value={act.params.points || 0}
                                        onChange={(e) => handleUpdateChoicesActions('yes', aIdx, 'params', { points: parseInt(e.target.value) || 0 })}
                                        style={{ width: '50px', backgroundColor: '#0f172a', color: '#fff', border: 'none', textAlign: 'center' }}
                                      />
                                    </>
                                  )}

                                  {act.type === 'change_spawn_rate' && (
                                    <>
                                      <span>ミリ秒:</span>
                                      <input 
                                        type="number"
                                        value={act.params.rate || 20000}
                                        onChange={(e) => handleUpdateChoicesActions('yes', aIdx, 'params', { rate: parseInt(e.target.value) || 20000 })}
                                        style={{ width: '50px', backgroundColor: '#0f172a', color: '#fff', border: 'none', textAlign: 'center' }}
                                      />
                                    </>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
 
                        {/* NO選択肢 */}
                        <div style={{ flex: 1, backgroundColor: '#0f172a', padding: '12px', borderRadius: '6px', border: '1px solid #ef4444' }}>
                          <span style={{ color: '#ef4444', fontSize: '12px', fontWeight: 700 }}>選択肢 NO (否定)</span>
                          <div style={{ margin: '8px 0' }}>
                            <label style={{ fontSize: '11px', color: '#94a3b8' }}>ボタンテキスト</label>
                            <input 
                              type="text"
                              value={selectedEvent.choices.no.text}
                              onChange={(e) => {
                                const choices = { ...selectedEvent.choices! };
                                choices.no.text = e.target.value;
                                handleUpdateEventField('choices', choices);
                              }}
                              style={{ width: '90%', padding: '6px', marginTop: '4px', borderRadius: '4px', backgroundColor: '#1e293b', border: '1px solid #334155', color: '#fff', fontSize: '12px' }}
                            />
                          </div>
                          <div style={{ margin: '8px 0' }}>
                            <label style={{ fontSize: '11px', color: '#94a3b8' }}>応答セリフ</label>
                            <textarea 
                              rows={2}
                              value={selectedEvent.choices.no.message}
                              onChange={(e) => {
                                const choices = { ...selectedEvent.choices! };
                                choices.no.message = e.target.value;
                                handleUpdateEventField('choices', choices);
                              }}
                              style={{ width: '90%', padding: '6px', marginTop: '4px', borderRadius: '4px', backgroundColor: '#1e293b', border: '1px solid #334155', color: '#fff', fontSize: '12px', resize: 'none' }}
                            />
                          </div>
 
                          {/* アクション一覧 */}
                          <div style={{ marginTop: '10px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                              <span style={{ fontSize: '11px', color: '#94a3b8' }}>実行アクション</span>
                              <button onClick={() => handleAddChoiceAction('no')} style={{ fontSize: '10px', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>＋ アクション追加</button>
                            </div>
                            {selectedEvent.choices.no.actions.map((act, aIdx) => (
                              <div key={aIdx} style={{ backgroundColor: '#1e293b', padding: '8px', borderRadius: '4px', marginBottom: '6px', border: '1px solid #334155', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <select 
                                    value={act.type}
                                    onChange={(e) => handleUpdateChoicesActions('no', aIdx, 'type', e.target.value)}
                                    style={{ backgroundColor: '#0f172a', color: '#fff', border: 'none', fontSize: '11px', borderRadius: '2px', padding: '2px' }}
                                  >
                                    <option value="spawn_enemy">敵湧き</option>
                                    <option value="spawn_ally">味方船追加</option>
                                    <option value="spawn_mothership">巨大母船ボス湧き</option>
                                    <option value="add_points">ポイント加算</option>
                                    <option value="change_spawn_rate">湧きディレイ変更</option>
                                  </select>
                                  <button onClick={() => handleRemoveChoiceAction('no', aIdx)} style={{ border: 'none', color: '#ef4444', background: 'none', cursor: 'pointer', fontSize: '12px' }}>×</button>
                                </div>
                                
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', fontSize: '10px', color: '#94a3b8' }}>
                                  {act.type === 'spawn_enemy' && (
                                    <>
                                      <span>数:</span>
                                      <input 
                                        type="number"
                                        value={act.params.count || 1}
                                        onChange={(e) => handleUpdateChoicesActions('no', aIdx, 'params', { count: parseInt(e.target.value) || 1 })}
                                        style={{ width: '30px', backgroundColor: '#0f172a', color: '#fff', border: 'none', textAlign: 'center' }}
                                      />
                                      <span>敵機:</span>
                                      <select
                                        value={act.params.enemyType || 'standard'}
                                        onChange={(e) => handleUpdateChoicesActions('no', aIdx, 'params', { enemyType: e.target.value })}
                                        style={{ backgroundColor: '#0f172a', color: '#fff', border: 'none' }}
                                      >
                                        <option value="standard">戦闘機 (standard)</option>
                                        <option value="single_circle">単独旋回機 (single_circle)</option>
                                        <option value="squadron_attacker">編隊攻撃機 (squadron_attacker)</option>
                                      </select>
                                      <span>出現元:</span>
                                      <select
                                        value={act.params.spawnSource || 'outpost'}
                                        onChange={(e) => handleUpdateChoicesActions('no', aIdx, 'params', { spawnSource: e.target.value })}
                                        style={{ backgroundColor: '#0f172a', color: '#fff', border: 'none' }}
                                      >
                                        <option value="outpost">前線基地</option>
                                        <option value="screen_edge">画面端</option>
                                        <option value="base">本部基地の近く</option>
                                      </select>
                                    </>
                                  )}
                                  
                                  {act.type === 'spawn_ally' && (
                                    <>
                                      <span>数:</span>
                                      <input 
                                        type="number"
                                        value={act.params.count || 1}
                                        onChange={(e) => handleUpdateChoicesActions('no', aIdx, 'params', { count: parseInt(e.target.value) || 1 })}
                                        style={{ width: '30px', backgroundColor: '#0f172a', color: '#fff', border: 'none', textAlign: 'center' }}
                                      />
                                    </>
                                  )}
                                  
                                  {act.type === 'spawn_mothership' && (
                                    <>
                                      <span>数:</span>
                                      <input 
                                        type="number"
                                        value={act.params.count || 1}
                                        onChange={(e) => handleUpdateChoicesActions('no', aIdx, 'params', { count: parseInt(e.target.value) || 1 })}
                                        style={{ width: '30px', backgroundColor: '#0f172a', color: '#fff', border: 'none', textAlign: 'center' }}
                                      />
                                    </>
                                  )}

                                  {act.type === 'add_points' && (
                                    <>
                                      <span>ポイント:</span>
                                      <input 
                                        type="number"
                                        value={act.params.points || 0}
                                        onChange={(e) => handleUpdateChoicesActions('no', aIdx, 'params', { points: parseInt(e.target.value) || 0 })}
                                        style={{ width: '50px', backgroundColor: '#0f172a', color: '#fff', border: 'none', textAlign: 'center' }}
                                      />
                                    </>
                                  )}

                                  {act.type === 'change_spawn_rate' && (
                                    <>
                                      <span>ミリ秒:</span>
                                      <input 
                                        type="number"
                                        value={act.params.rate || 20000}
                                        onChange={(e) => handleUpdateChoicesActions('no', aIdx, 'params', { rate: parseInt(e.target.value) || 20000 })}
                                        style={{ width: '50px', backgroundColor: '#0f172a', color: '#fff', border: 'none', textAlign: 'center' }}
                                      />
                                    </>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 管理ボタン */}
                  <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                    <button 
                      onClick={() => handleCloneEvent(selectedEvent)}
                      style={{ padding: '8px 14px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}
                    >
                      イベントを複製
                    </button>
                    <button 
                      onClick={() => handleDeleteEvent(selectedEvent.id)}
                      style={{ padding: '8px 14px', backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}
                    >
                      イベントを削除
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ color: '#64748b', textAlign: 'center', padding: '40px' }}>
                  イベントを選択するか、新しいイベントを追加してください。
                </div>
              )}

              {/* ダイナミックイベント（割り込み警告）の編集エリア */}
              <div style={{ marginTop: '40px', borderTop: '1px solid #1e293b', paddingTop: '24px' }}>
                <span style={{ fontSize: '16px', fontWeight: 700, color: '#f8fafc', display: 'block', marginBottom: '16px' }}>
                  ダイナミック割り込みイベント編集
                </span>

                {(['relay_destroyed', 'outpost_destroyed', 'relay_placed'] as const).map(type => (
                  <div key={type} style={{ background: '#111827', padding: '16px', borderRadius: '8px', border: '1px solid #1f2937', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <span style={{ fontWeight: 600, fontSize: '14px', color: '#06b6d4' }}>
                        {type === 'relay_destroyed' ? '中継レーダー破壊時' : type === 'outpost_destroyed' ? '前線基地破壊時' : '中継レーダー設置時'}
                      </span>
                      <button 
                        onClick={() => handleAddDynamicEvent(type)}
                        style={{ padding: '2px 8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#06b6d4', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}
                      >
                        ＋ 条件分岐追加
                      </button>
                    </div>

                    {(scenarioData.dynamicEvents[type] || []).map((dlg, idx) => (
                      <div key={idx} style={{ backgroundColor: '#0f172a', padding: '12px', borderRadius: '6px', border: '1px solid #1e293b', marginBottom: '8px' }}>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                          <span style={{ fontSize: '11px', color: '#94a3b8' }}>発生条件:</span>
                          <select 
                            value={dlg.flagCondition ? (dlg.flagCondition.value ? 'rescued' : 'ignored') : 'none'}
                            onChange={(e) => {
                              const val = e.target.value;
                              handleUpdateDynamicEvent(type, idx, 'flag', val === 'none' ? null : val === 'rescued');
                            }}
                            style={{ backgroundColor: '#1e293b', color: '#fff', border: '1px solid #334155', padding: '4px', borderRadius: '4px', fontSize: '11px' }}
                          >
                            <option value="none">条件なし（常に発生）</option>
                            <option value="rescued">職人を救助済み（allyRescued = true）</option>
                            <option value="ignored">職人を救助せず（allyRescued = false）</option>
                          </select>
                          <div style={{ flex: 1 }} />
                          <button 
                            onClick={() => handleRemoveDynamicEvent(type, idx)}
                            style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '12px' }}
                          >
                            削除
                          </button>
                        </div>

                        <div style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
                          <input 
                            type="text" 
                            placeholder="発言者名"
                            value={dlg.senderName}
                            onChange={(e) => handleUpdateDynamicEvent(type, idx, 'senderName', e.target.value)}
                            style={{ width: '120px', padding: '6px', borderRadius: '4px', backgroundColor: '#1e293b', border: '1px solid #334155', color: '#fff', fontSize: '12px' }}
                          />
                          <select 
                            value={dlg.avatarType}
                            onChange={(e) => handleUpdateDynamicEvent(type, idx, 'avatarType', e.target.value)}
                            style={{ width: '100px', padding: '6px', borderRadius: '4px', backgroundColor: '#1e293b', border: '1px solid #334155', color: '#fff', fontSize: '12px' }}
                          >
                            <option value="wave">波形</option>
                            <option value="hologram">ホログラム</option>
                            <option value="mothership">母船</option>
                            <option value="ally">味方船</option>
                          </select>
                          <select 
                            value={dlg.expression || 'normal'}
                            onChange={(e) => handleUpdateDynamicEvent(type, idx, 'expression', e.target.value)}
                            style={{ width: '90px', padding: '6px', borderRadius: '4px', backgroundColor: '#1e293b', border: '1px solid #334155', color: '#fff', fontSize: '12px' }}
                          >
                            <option value="normal">通常</option>
                            <option value="joy">喜び</option>
                            <option value="anger">怒り</option>
                            <option value="sorrow">悲しみ</option>
                            <option value="fun">楽しげ</option>
                          </select>
                        </div>
                        <input 
                          type="text" 
                          placeholder="警告セリフ内容"
                          value={dlg.message}
                          onChange={(e) => handleUpdateDynamicEvent(type, idx, 'message', e.target.value)}
                          style={{ width: '95%', padding: '6px', borderRadius: '4px', backgroundColor: '#1e293b', border: '1px solid #334155', color: '#fff', fontSize: '12px' }}
                        />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ダッシュボード（タイムライン、分岐ツリー、敵設定） */}
        {activeTab === 'graph' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', backgroundColor: '#090d16', padding: '24px', gap: '32px' }}>
            
            {/* 1. タイムライン表示 */}
            <div style={{ padding: '20px', backgroundColor: '#0b1329', borderRadius: '12px', border: '1px solid #1e293b' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <span style={{ fontSize: '16px', fontWeight: 700, color: '#38bdf8', letterSpacing: '0.5px' }}>① シナリオタイムライン (発生順序)</span>
                <span style={{ fontSize: '11px', color: '#64748b' }}>アイコンをクリックすると該当イベントの編集画面に切り替わります</span>
              </div>
              <div style={{
                position: 'relative',
                height: '110px',
                backgroundColor: '#0f172a',
                borderRadius: '8px',
                border: '1px solid #1e293b',
                display: 'flex',
                alignItems: 'center',
                padding: '0 40px',
                overflowX: 'auto'
              }}>
                <div style={{
                  position: 'absolute',
                  left: '40px',
                  right: '40px',
                  height: '3px',
                  background: 'linear-gradient(90deg, #38bdf8, #a855f7)',
                  zIndex: 0
                }} />
                
                <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', zIndex: 1, position: 'relative', alignItems: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#64748b' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#64748b' }} />
                    <span style={{ fontSize: '9px', marginTop: '6px' }}>開始</span>
                  </div>

                  {sortedEvents.map((evt) => {
                    let iconText = '💬';
                    let hasEnemySpawn = false;
                    const actions = evt.actions || [];
                    if (evt.choices) {
                      const yesActions = evt.choices.yes.actions || [];
                      const noActions = evt.choices.no.actions || [];
                      hasEnemySpawn = yesActions.some(a => a.type === 'spawn_enemy') || noActions.some(a => a.type === 'spawn_enemy');
                    } else {
                      hasEnemySpawn = actions.some(a => a.type === 'spawn_enemy');
                    }

                    if (hasEnemySpawn) {
                      iconText = '⚔️';
                    }

                    return (
                      <div 
                        key={evt.id} 
                        onClick={() => { setSelectedEventId(evt.id); setActiveTab('edit'); }}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          cursor: 'pointer',
                          padding: '0 10px',
                          position: 'relative',
                          transition: 'all 0.2s',
                        }}
                      >
                        <div style={{
                          backgroundColor: 'rgba(30, 41, 59, 0.8)',
                          border: '1px solid #38bdf8',
                          borderRadius: '6px',
                          padding: '3px 6px',
                          fontSize: '10px',
                          color: '#38bdf8',
                          marginBottom: '8px',
                          whiteSpace: 'nowrap',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.5)'
                        }}>
                          {iconText} {evt.senderName.slice(0, 5)}
                        </div>
                        <div style={{
                          width: '20px',
                          height: '20px',
                          borderRadius: '50%',
                          backgroundColor: evt.triggerType === 'time' ? '#06b6d4' : evt.triggerType === 'points' ? '#eab308' : '#ec4899',
                          border: '3px solid #0f172a',
                          boxShadow: evt.triggerType === 'time' ? '0 0 10px #06b6d4' : evt.triggerType === 'points' ? '0 0 10px #eab308' : '0 0 10px #ec4899',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          zIndex: 2
                        }} />
                        <span style={{ fontSize: '11px', fontWeight: 700, marginTop: '6px', color: '#f8fafc', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {evt.id}
                        </span>
                        <span style={{ fontSize: '9px', color: '#94a3b8', marginTop: '2px' }}>
                          {evt.triggerType === 'time' 
                            ? `${evt.triggerValue / 1000}秒` 
                            : evt.triggerType === 'points' 
                              ? `${evt.triggerValue}pt` 
                              : `HP${evt.triggerValue}%`}
                        </span>
                      </div>
                    );
                  })}
                  
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#64748b' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#64748b' }} />
                    <span style={{ fontSize: '9px', marginTop: '6px' }}>終了</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. 分岐ツリー構造 */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <span style={{ fontSize: '16px', fontWeight: 700, color: '#a855f7', letterSpacing: '0.5px' }}>② シナリオ分岐・接続マップ</span>
                <span style={{ fontSize: '11px', color: '#64748b' }}>カードをクリックすると詳細編集へ移動します</span>
              </div>
              <div style={{
                maxHeight: '400px',
                overflowY: 'auto',
                border: '1px solid #1e293b',
                borderRadius: '12px',
                backgroundColor: '#070a13',
                padding: '24px'
              }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
                  {scenarioData.events.map(event => (
                    <div 
                      key={event.id}
                      onClick={() => { setSelectedEventId(event.id); setActiveTab('edit'); }}
                      style={{
                        width: '320px',
                        backgroundColor: '#0f172a',
                        border: '1px solid #1e293b',
                        borderRadius: '8px',
                        padding: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        boxShadow: '0 4px 6px rgba(0,0,0,0.2)'
                      }}
                    >
                      <div style={{ borderBottom: '1px solid #1e293b', paddingBottom: '6px', display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: 700, color: '#f8fafc', fontSize: '13px' }}>{event.id}</span>
                        <span style={{ fontSize: '10px', color: '#64748b' }}>
                          {event.triggerType === 'time' 
                            ? `${event.triggerValue / 1000}秒` 
                            : event.triggerType === 'points' 
                              ? `${event.triggerValue}pt` 
                              : `HP${event.triggerValue}%`}
                        </span>
                      </div>
                      <div style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic', background: '#090d16', padding: '6px', borderRadius: '4px' }}>
                        {event.senderName}: "{event.message}"
                      </div>

                      {event.choices ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
                          <div style={{ padding: '8px', borderRadius: '6px', backgroundColor: '#052e16', border: '1px solid #14532d' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                              <span style={{ color: '#4ade80', fontWeight: 600 }}>[選択肢 YES]: {event.choices.yes.text}</span>
                            </div>
                            <div style={{ fontSize: '9px', color: '#4ade80', display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                              {event.choices.yes.actions.map((act, aIdx) => {
                                let details: string = act.type;
                                if (act.type === 'spawn_enemy') {
                                  const enemyId = act.params.enemyType || 'standard';
                                  const config = ENEMY_CONFIGS[enemyId as keyof typeof ENEMY_CONFIGS];
                                  const enemyName = config ? config.name : enemyId;
                                  details = `${enemyName} x${act.params.count || 1}`;
                                } else if (act.type === 'spawn_ally') {
                                  details = `味方x${act.params.count || 1}`;
                                } else if (act.type === 'spawn_mothership') {
                                  details = `ボスx${act.params.count || 1}`;
                                } else if (act.type === 'add_points') {
                                  details = `+${act.params.points || 0}pt`;
                                } else if (act.type === 'change_spawn_rate') {
                                  details = `湧き${act.params.rate || 0}ms`;
                                }
                                return (
                                  <span key={aIdx} style={{ backgroundColor: '#14532d', padding: '1px 4px', borderRadius: '2px' }}>
                                    {details}
                                  </span>
                                );
                              })}
                            </div>
                          </div>

                          <div style={{ padding: '8px', borderRadius: '6px', backgroundColor: '#450a0a', border: '1px solid #7f1d1d' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                              <span style={{ color: '#fca5a5', fontWeight: 600 }}>[選択肢 NO]: {event.choices.no.text}</span>
                            </div>
                            <div style={{ fontSize: '9px', color: '#ef4444', display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                              {event.choices.no.actions.map((act, aIdx) => {
                                let details: string = act.type;
                                if (act.type === 'spawn_enemy') {
                                  const enemyId = act.params.enemyType || 'standard';
                                  const config = ENEMY_CONFIGS[enemyId as keyof typeof ENEMY_CONFIGS];
                                  const enemyName = config ? config.name : enemyId;
                                  details = `${enemyName} x${act.params.count || 1}`;
                                } else if (act.type === 'spawn_ally') {
                                  details = `味方x${act.params.count || 1}`;
                                } else if (act.type === 'spawn_mothership') {
                                  details = `ボスx${act.params.count || 1}`;
                                } else if (act.type === 'add_points') {
                                  details = `+${act.params.points || 0}pt`;
                                } else if (act.type === 'change_spawn_rate') {
                                  details = `湧き${act.params.rate || 0}ms`;
                                }
                                return (
                                  <span key={aIdx} style={{ backgroundColor: '#7f1d1d', padding: '1px 4px', borderRadius: '2px' }}>
                                    {details}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ color: '#64748b', fontSize: '11px', textAlign: 'center', border: '1px dashed #334155', padding: '6px', borderRadius: '4px' }}>
                            選択肢分岐なし (タイムライン順次実行)
                          </div>
                          {event.actions && event.actions.length > 0 && (
                            <div style={{ fontSize: '9px', color: '#10b981', display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '2px', alignItems: 'center' }}>
                              <span style={{ color: '#94a3b8' }}>発生時アクション:</span>
                              {event.actions.map((act, aIdx) => {
                                let details: string = act.type;
                                if (act.type === 'spawn_enemy') {
                                  const enemyId = act.params.enemyType || 'standard';
                                  const config = ENEMY_CONFIGS[enemyId as keyof typeof ENEMY_CONFIGS];
                                  const enemyName = config ? config.name : enemyId;
                                  details = `${enemyName} x${act.params.count || 1}`;
                                } else if (act.type === 'spawn_ally') {
                                  details = `味方x${act.params.count || 1}`;
                                } else if (act.type === 'spawn_mothership') {
                                  details = `ボスx${act.params.count || 1}`;
                                } else if (act.type === 'add_points') {
                                  details = `+${act.params.points || 0}pt`;
                                } else if (act.type === 'change_spawn_rate') {
                                  details = `湧き${act.params.rate || 0}ms`;
                                }
                                return (
                                  <span key={aIdx} style={{ backgroundColor: '#064e3b', padding: '1px 4px', borderRadius: '2px' }}>
                                    {details}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 3. 敵設定定義 */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '16px', fontWeight: 700, color: '#f43f5e', display: 'block', marginBottom: '16px', letterSpacing: '0.5px' }}>③ 敵機設定・動作定義リスト</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                {Object.values(ENEMY_CONFIGS).map(cfg => {
                  let aiDesc: string = cfg.aiPattern;
                  if (cfg.id === 'standard') aiDesc = '単体、直接基地に向かう (single_rush)';
                  else if (cfg.id === 'squadron_attacker') aiDesc = '3機編成螺旋接近 (squadron_circle)';
                  else if (cfg.id === 'single_circle') aiDesc = '単体らせん旋回接近 (single_circle)';
                  else if (cfg.id === 'mothership') aiDesc = '巨大ボス、基地へ直進射撃 (mothership)';
                  else if (cfg.id === 'outpost') aiDesc = '敵前哨基地、時間ごとに敵を射出 (outpost)';

                  return (
                    <div 
                      key={cfg.id}
                      onClick={() => setSelectedDetailEnemyConfig(cfg)}
                      style={{
                        backgroundColor: '#0f172a',
                        border: '1px solid #1e293b',
                        borderRadius: '8px',
                        padding: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        boxShadow: '0 4px 6px rgba(0,0,0,0.15)'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = '#' + cfg.tint.toString(16).padStart(6, '0');
                        e.currentTarget.style.transform = 'translateY(-2px)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = '#1e293b';
                        e.currentTarget.style.transform = 'translateY(0)';
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1e293b', paddingBottom: '6px' }}>
                        <span style={{ fontWeight: 700, color: '#f8fafc', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#' + cfg.tint.toString(16).padStart(6, '0') }}></span>
                          {cfg.name} ({cfg.id})
                        </span>
                      </div>
                      <div style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div>HP: <span style={{ color: '#f8fafc', fontWeight: 600 }}>{cfg.hp}</span></div>
                        <div>速度: <span style={{ color: '#f8fafc', fontWeight: 600 }}>{cfg.speed}</span></div>
                        <div>行動パターン: <span style={{ color: '#fca5a5', fontWeight: 600 }}>{aiDesc}</span></div>
                        <div>撃破ポイント: <span style={{ color: '#f8fafc', fontWeight: 600 }}>{cfg.scoreValue} pt</span></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        )}

        {/* JSON入出力 */}
        {activeTab === 'json' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#090d16', padding: '24px', overflow: 'hidden' }}>
            <span style={{ fontSize: '14px', fontWeight: 600, color: '#06b6d4', display: 'block', marginBottom: '8px' }}>
              シナリオ JSONデータ (エディタと双方向連動)
            </span>
            <p style={{ fontSize: '11px', color: '#64748b', marginBottom: '12px' }}>
              編集した内容はここにリアルタイムに出力されます。他のエディタで書いたJSONを貼り付けて「インポート」することも可能です。
            </p>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <textarea
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                style={{
                  flex: 1,
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  backgroundColor: '#0f172a',
                  color: '#38bdf8',
                  border: '1px solid #1e293b',
                  borderRadius: '6px',
                  padding: '16px',
                  resize: 'none'
                }}
              />
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={handleImportJson}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#10b981',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  インポートする
                </button>
                <button
                  onClick={handleDownloadJson}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#3b82f6',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  JSONファイルをダウンロード
                </button>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(jsonText);
                    alert('クリップボードにコピーしました！');
                  }}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#6b7280',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  JSONをコピー
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 敵機詳細モーダルポップアップ */}
      {selectedDetailEnemyConfig && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(2, 4, 8, 0.85)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 9999
        }}>
          <div style={{
            width: '560px',
            backgroundColor: '#0b0f19',
            border: `1.5px solid #${selectedDetailEnemyConfig.tint.toString(16).padStart(6, '0')}`,
            borderRadius: '12px',
            boxShadow: `0 0 20px rgba(${(selectedDetailEnemyConfig.tint >> 16) & 255}, ${(selectedDetailEnemyConfig.tint >> 8) & 255}, ${selectedDetailEnemyConfig.tint & 255}, 0.25)`,
            padding: '28px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            fontFamily: 'system-ui, -apple-system, sans-serif'
          }}>
            {/* ヘッダー */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottom: '1px solid #1e293b',
              paddingBottom: '12px'
            }}>
              <span style={{
                fontSize: '18px',
                fontWeight: 800,
                color: '#f8fafc',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span style={{
                  display: 'inline-block',
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  backgroundColor: '#' + selectedDetailEnemyConfig.tint.toString(16).padStart(6, '0'),
                  boxShadow: `0 0 8px #${selectedDetailEnemyConfig.tint.toString(16).padStart(6, '0')}`
                }}></span>
                {selectedDetailEnemyConfig.name} ({selectedDetailEnemyConfig.id})
              </span>
              <button 
                onClick={() => setSelectedDetailEnemyConfig(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#64748b',
                  fontSize: '20px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: '4px 8px',
                  transition: 'color 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#ef4444'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#64748b'}
              >
                ✕
              </button>
            </div>

            {/* パラメータグリッド */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '12px',
              backgroundColor: '#070a13',
              padding: '16px',
              borderRadius: '8px',
              border: '1px solid #1e293b'
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>耐久値 (HP)</span>
                <span style={{ fontSize: '18px', color: '#f8fafc', fontWeight: 700 }}>{selectedDetailEnemyConfig.hp}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>移動速度</span>
                <span style={{ fontSize: '18px', color: '#f8fafc', fontWeight: 700 }}>{selectedDetailEnemyConfig.speed}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>標準出現数</span>
                <span style={{ fontSize: '18px', color: '#38bdf8', fontWeight: 700 }}>{selectedDetailEnemyConfig.defaultSpawnCount} 機</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>撃破スコア</span>
                <span style={{ fontSize: '18px', color: '#f59e0b', fontWeight: 700 }}>{selectedDetailEnemyConfig.scoreValue} pt</span>
              </div>
            </div>

            {/* AI挙動（動きの定義） */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 700, letterSpacing: '0.5px' }}>■ 敵の動き（AIパターン）</span>
              <div style={{
                fontSize: '12px',
                color: '#f8fafc',
                lineHeight: '1.6',
                backgroundColor: '#0d1324',
                padding: '14px',
                borderRadius: '6px',
                borderLeft: `3px solid #${selectedDetailEnemyConfig.tint.toString(16).padStart(6, '0')}`
              }}>
                {selectedDetailEnemyConfig.aiDescription}
              </div>
            </div>

            {/* 出現方法とタイミング */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 700, letterSpacing: '0.5px' }}>■ 出現パターン定義</span>
              <div style={{
                fontSize: '12px',
                color: '#f8fafc',
                lineHeight: '1.6',
                backgroundColor: '#0d1324',
                padding: '14px',
                borderRadius: '6px',
                borderLeft: '3px solid #38bdf8'
              }}>
                {selectedDetailEnemyConfig.spawnDescription}
              </div>
            </div>

            {/* フッター閉じるボタン */}
            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              marginTop: '8px'
            }}>
              <button 
                onClick={() => setSelectedDetailEnemyConfig(null)}
                style={{
                  padding: '8px 20px',
                  backgroundColor: '#1e293b',
                  color: '#f8fafc',
                  border: '1px solid #334155',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#334155';
                  e.currentTarget.style.borderColor = '#475569';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#1e293b';
                  e.currentTarget.style.borderColor = '#334155';
                }}
              >
                閉じる (CLOSE)
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
