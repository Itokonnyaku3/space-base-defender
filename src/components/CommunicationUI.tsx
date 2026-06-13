import { useEffect, useState, useRef, useCallback } from 'react';
import { EventBus } from '../game/EventBus';
import type { ScenarioEvent } from '../game/ScenarioManager';

export default function CommunicationUI() {
  const [activeEvent, setActiveEvent] = useState<ScenarioEvent | null>(null);
  const [displayedText, setDisplayedText] = useState('');
  const [showChoices, setShowChoices] = useState(false);
  const [isResponding, setIsResponding] = useState(false);
  
  const typingTimerRef = useRef<number | null>(null);
  const autoCloseTimerRef = useRef<number | null>(null);
  const typingSessionRef = useRef<number>(0);

  const closeCommunication = useCallback(() => {
    setActiveEvent(null);
    setDisplayedText('');
    setShowChoices(false);
    setIsResponding(false);
  }, []);

  const startTyping = useCallback((text: string, onComplete: () => void) => {
    const sessionId = ++typingSessionRef.current;
    let index = 0;
    setDisplayedText('');

    const tick = () => {
      if (typingSessionRef.current !== sessionId) return;
      if (index < text.length) {
        setDisplayedText((prev) => prev + text.charAt(index));
        index++;
        typingTimerRef.current = window.setTimeout(tick, 30); // 30msごとに1文字
      } else {
        onComplete();
      }
    };

    tick();
  }, []);

  const selectChoice = useCallback((choice: 'yes' | 'no') => {
    if (!activeEvent || !activeEvent.choices) return;

    setShowChoices(false);
    setIsResponding(true);

    const eventId = activeEvent.id;

    // 非同期かつ try-catch で発火させることで、Phaser側のいかなる処理エラーもReact UIをフリーズさせないように隔離する
    window.setTimeout(() => {
      try {
        EventBus.emit('scenario-choice-selected', {
          eventId: eventId,
          choice: choice
        });
      } catch (err) {
        console.error("Phaser scenario choice emission error:", err);
      }
    }, 0);

    const choiceData = choice === 'yes' ? activeEvent.choices.yes : activeEvent.choices.no;

    // 応答メッセージのタイピング開始
    if (typingTimerRef.current) {
      window.clearTimeout(typingTimerRef.current);
    }
    
    startTyping(choiceData.message, () => {
      autoCloseTimerRef.current = window.setTimeout(() => {
        closeCommunication();
      }, 3500);
    });
  }, [activeEvent, startTyping, closeCommunication]);

  useEffect(() => {
    // Phaser側からのシナリオイベント発火イベントをキャッチ
    const handleTrigger = (event: ScenarioEvent) => {
      // 既存のタイマーをクリア
      if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
      if (autoCloseTimerRef.current) window.clearTimeout(autoCloseTimerRef.current);

      setActiveEvent(event);
      setDisplayedText('');
      setShowChoices(false);
      setIsResponding(false);

      // タイピング効果の開始
      startTyping(event.message, () => {
        if (event.choices) {
          setShowChoices(true);
        } else {
          // 選択肢がない通信は5秒後に自動クローズ
          autoCloseTimerRef.current = window.setTimeout(() => {
            closeCommunication();
          }, 5000);
        }
      });
    };

    EventBus.on('scenario-trigger', handleTrigger);

    return () => {
      EventBus.off('scenario-trigger', handleTrigger);
      if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
      if (autoCloseTimerRef.current) window.clearTimeout(autoCloseTimerRef.current);
    };
  }, [startTyping, closeCommunication]);

  // キーボードショートカット (Y / Nキー)
  useEffect(() => {
    if (!showChoices || !activeEvent) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'y' || e.key === 'Y') {
        selectChoice('yes');
      } else if (e.key === 'n' || e.key === 'N') {
        selectChoice('no');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showChoices, activeEvent, selectChoice]);

  // アバターカラーと送信者カラーの決定
  const getSenderStyles = (event: ScenarioEvent) => {
    switch (event.sender) {
      case 'captain':
        return {
          color: '#ffaa00', // オレンジ
          avatarClass: 'avatar-captain',
          holoColor: 'rgba(255, 170, 0, 0.2)'
        };
      case 'operator':
        return {
          color: '#00ccff', // 水色
          avatarClass: 'avatar-operator',
          holoColor: 'rgba(0, 204, 255, 0.2)'
        };
      default:
        return {
          color: '#00ffaa', // 黄緑
          avatarClass: 'avatar-unknown',
          holoColor: 'rgba(0, 255, 170, 0.2)'
        };
    }
  };

  const getAvatarImageSrc = (event: ScenarioEvent) => {
    let prefix = 'base';
    if (event.sender === 'operator') prefix = 'operator';
    if (event.sender === 'captain') prefix = 'mechanic';
    
    const expression = event.expression || 'normal';
    return `/assets/avatars/${prefix}_${expression}.png`;
  };

  if (!activeEvent) return null;

  const senderStyles = getSenderStyles(activeEvent);

  return (
    <div className="comms-overlay">
      <div className="comms-panel" style={{ borderLeft: `4px solid ${senderStyles.color}` }}>
        {/* アバター枠 */}
        <div className={`avatar-container ${senderStyles.avatarClass}`} style={{ overflow: 'hidden', position: 'relative' }}>
          {/* 顔グラフィック画像 (クリアに表示) */}
          <img 
            src={getAvatarImageSrc(activeEvent)} 
            alt="avatar"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center 10%', // 顔周辺にフォーカス
              position: 'absolute',
              top: 0,
              left: 0,
              opacity: 1
            }}
          />
          
          <div className="avatar-tag" style={{ color: senderStyles.color, zIndex: 4, position: 'relative' }}>HOLO-LINK</div>
        </div>

        {/* テキストと内容 */}
        <div className="comms-content">
          <div className="comms-header">
            <span className="comms-title" style={{ color: senderStyles.color }}>【 通信受信中 】</span>
            <span className="comms-sender" style={{ textShadow: `0 0 8px ${senderStyles.color}` }}>
              {activeEvent.senderName}
            </span>
          </div>

          <div className="comms-body">
            <p className="comms-text">{displayedText}</p>
          </div>

          {/* 選択肢ボタン */}
          {showChoices && activeEvent.choices && (
            <div className="comms-choices">
              <button 
                className="comms-btn yes-btn" 
                onClick={() => selectChoice('yes')}
                style={{ borderColor: senderStyles.color, color: senderStyles.color }}
              >
                <span className="btn-key">[Y]</span> {activeEvent.choices.yes.text}
              </button>
              <button 
                className="comms-btn no-btn" 
                onClick={() => selectChoice('no')}
              >
                <span className="btn-key">[N]</span> {activeEvent.choices.no.text}
              </button>
            </div>
          )}

          {isResponding && (
            <div className="comms-status" style={{ color: senderStyles.color }}>
              「 応答送信中... 」
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
