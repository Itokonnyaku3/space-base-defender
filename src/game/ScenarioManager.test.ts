import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ScenarioManager } from './ScenarioManager';
import type { ScenarioData, ScenarioEvent } from './ScenarioManager';
import { EventBus } from './EventBus';

// テスト用の最小シナリオ（wave2 開始 → wave3）。
function baseScenario(events: ScenarioEvent[] = []): ScenarioData {
  return {
    waves: {
      wave2: {
        id: 'wave2', name: 'W2',
        rules: { allowTurretPlacement: false, allowRelayPlacement: true, allowBoost: true },
        clearConditions: { transportShipReachedBase: true },
      },
      wave3: {
        id: 'wave3', name: 'W3',
        rules: { allowTurretPlacement: true, allowRelayPlacement: true, allowBoost: true },
        clearConditions: { destroyAllOutposts: true },
      },
    },
    events,
    dynamicEvents: {},
  };
}

function evt(partial: Partial<ScenarioEvent> & Pick<ScenarioEvent, 'id' | 'triggerType' | 'triggerValue'>): ScenarioEvent {
  return {
    hasTriggered: false,
    sender: 'operator', senderName: 'OP', message: 'msg', avatarType: 'wave',
    ...partial,
  };
}

describe('ScenarioManager', () => {
  // 非同期 emit（setTimeout）を抑え、同期ロジックを検証する
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    EventBus.removeAll('wave-changed');
  });

  it('forceSetWave が現在 Wave を変更し wave-changed を発火する', () => {
    const sm = new ScenarioManager();
    sm.loadScenario(baseScenario());
    const spy = vi.fn();
    EventBus.on('wave-changed', spy);

    sm.forceSetWave('wave3');

    expect(sm.getCurrentWaveId()).toBe('wave3');
    expect(spy).toHaveBeenCalledWith('wave3');
  });

  it('クリア条件を満たすと次の Wave に進行する', () => {
    const sm = new ScenarioManager();
    sm.loadScenario(baseScenario()); // wave2 開始
    const spy = vi.fn();
    EventBus.on('wave-changed', spy);

    sm.setWaveProgress('transportShipReached', 1); // wave2 のクリア条件

    expect(spy).toHaveBeenCalledWith('wave3');
    expect(sm.getCurrentWaveId()).toBe('wave3');
  });

  it('時間トリガーは閾値を超えると発火する', () => {
    const sm = new ScenarioManager();
    sm.loadScenario(baseScenario([evt({ id: 'e1', triggerType: 'time', triggerValue: 5000 })]));

    sm.update(4000, 0, 100);
    expect(sm.getEvents().find((e) => e.id === 'e1')?.hasTriggered).toBe(false);

    sm.update(6000, 0, 100);
    expect(sm.getEvents().find((e) => e.id === 'e1')?.hasTriggered).toBe(true);
  });

  it('ポイントトリガーは閾値に達すると発火する', () => {
    const sm = new ScenarioManager();
    sm.loadScenario(baseScenario([evt({ id: 'p1', triggerType: 'points', triggerValue: 50 })]));

    sm.update(1000, 10, 100);
    expect(sm.getEvents().find((e) => e.id === 'p1')?.hasTriggered).toBe(false);

    sm.update(1000, 60, 100);
    expect(sm.getEvents().find((e) => e.id === 'p1')?.hasTriggered).toBe(true);
  });

  it('targetWave が現在 Wave と異なるイベントは発火しない', () => {
    const sm = new ScenarioManager();
    sm.loadScenario(baseScenario([
      evt({ id: 'w3only', targetWave: 'wave3', triggerType: 'time', triggerValue: 1000 }),
    ])); // 現在 wave2

    sm.update(5000, 0, 100);
    expect(sm.getEvents().find((e) => e.id === 'w3only')?.hasTriggered).toBe(false);
  });
});
