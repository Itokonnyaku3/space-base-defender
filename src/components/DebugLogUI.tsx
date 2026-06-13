import React, { useEffect, useState, useRef } from 'react';
import { EventBus } from '../game/EventBus';

interface LogItem {
  id: string;
  timestamp: string;
  type: 'spawn' | 'damage' | 'scenario' | 'system' | 'default';
  message: string;
}

export default function DebugLogUI() {
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [isOpen, setIsOpen] = useState<boolean>(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleAddLog = (data: { type: string; message: string }) => {
      const typeStr = data.type as LogItem['type'];
      const now = new Date();
      const timeStr = now.toTimeString().split(' ')[0] + '.' + String(now.getMilliseconds()).padStart(3, '0');

      const newItem: LogItem = {
        id: Math.random().toString(36).substring(2, 9),
        timestamp: timeStr,
        type: ['spawn', 'damage', 'scenario', 'system'].includes(typeStr) ? typeStr : 'default',
        message: data.message
      };

      setLogs((prev) => {
        const updated = [...prev, newItem];
        if (updated.length > 100) {
          return updated.slice(updated.length - 100);
        }
        return updated;
      });
    };

    EventBus.on('debug-log-add', handleAddLog);

    return () => {
      EventBus.off('debug-log-add', handleAddLog);
    };
  }, []);

  // ログが追加されたら自動スクロール
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, isOpen]);

  const getLogColor = (type: LogItem['type']) => {
    switch (type) {
      case 'spawn':
        return '#34d399'; // 明るいグリーン
      case 'damage':
        return '#f87171'; // 赤
      case 'scenario':
        return '#c084fc'; // 紫
      case 'system':
        return '#38bdf8'; // 水色
      default:
        return '#e2e8f0'; // 白
    }
  };

  const clearLogs = () => {
    setLogs([]);
  };

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '12px',
        right: '12px',
        width: '320px',
        zIndex: 999,
        fontFamily: 'Consolas, Monaco, "Courier New", monospace',
        fontSize: '11px',
        color: '#e2e8f0',
        display: 'flex',
        flexDirection: 'column',
        pointerEvents: 'auto'
      }}
    >
      {/* トグルヘッダー */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '6px 10px',
          backgroundColor: 'rgba(15, 23, 42, 0.9)',
          border: '1px solid #1e293b',
          borderBottom: isOpen ? 'none' : '1px solid #1e293b',
          borderRadius: isOpen ? '6px 6px 0 0' : '6px',
          cursor: 'pointer',
          userSelect: 'none',
          backdropFilter: 'blur(4px)',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)'
        }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span style={{ fontWeight: 'bold', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10b981', animation: 'pulse 2s infinite' }}></span>
          EVENT LOG PANEL
        </span>
        <div style={{ display: 'flex', gap: '8px' }}>
          {isOpen && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                clearLogs();
              }}
              style={{
                color: '#64748b',
                fontSize: '10px',
                cursor: 'pointer',
                padding: '0 4px',
                borderRadius: '3px',
                border: '1px solid #334155'
              }}
              onMouseOver={(e) => (e.currentTarget.style.color = '#f87171')}
              onMouseOut={(e) => (e.currentTarget.style.color = '#64748b')}
            >
              CLEAR
            </span>
          )}
          <span style={{ color: '#64748b' }}>{isOpen ? '▼' : '▲'}</span>
        </div>
      </div>

      {/* ログコンテナ */}
      {isOpen && (
        <div
          ref={scrollRef}
          style={{
            height: '480px',
            backgroundColor: 'rgba(10, 15, 30, 0.85)',
            border: '1px solid #1e293b',
            borderRadius: '0 0 6px 6px',
            padding: '8px',
            overflowY: 'auto',
            backdropFilter: 'blur(4px)',
            boxShadow: 'inset 0 0 12px rgba(0, 0, 0, 0.5)'
          }}
        >
          {logs.length === 0 ? (
            <div style={{ color: '#475569', textAlign: 'center', padding: '20px' }}>
              No events recorded.
            </div>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                style={{
                  marginBottom: '6px',
                  lineHeight: '1.4',
                  borderBottom: '1px solid rgba(30, 41, 59, 0.3)',
                  paddingBottom: '3px',
                  wordBreak: 'break-all'
                }}
              >
                <span style={{ color: '#475569', marginRight: '6px' }}>[{log.timestamp}]</span>
                <span style={{ color: getLogColor(log.type) }}>{log.message}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
