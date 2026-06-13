import { describe, it, expect, vi } from 'vitest';
import { EventBus } from './EventBus';

// Phaser 非依存の TypedEventBus（MiniEventEmitter）のセマンティクスを固定するテスト。
describe('EventBus (typed, Phaser非依存)', () => {
  it('on で登録したハンドラに emit のペイロードが届く', () => {
    const fn = vi.fn();
    EventBus.on('pause-state-changed', fn);
    EventBus.emit('pause-state-changed', true);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(true);
    EventBus.removeAll('pause-state-changed');
  });

  it('off は指定したハンドラだけを解除する', () => {
    const keep = vi.fn();
    const drop = vi.fn();
    EventBus.on('pause-state-changed', keep);
    EventBus.on('pause-state-changed', drop);
    EventBus.off('pause-state-changed', drop);
    EventBus.emit('pause-state-changed', false);
    expect(keep).toHaveBeenCalledTimes(1);
    expect(drop).not.toHaveBeenCalled();
    EventBus.removeAll('pause-state-changed');
  });

  it('removeAll はそのイベントの全ハンドラを解除する', () => {
    const a = vi.fn();
    const b = vi.fn();
    EventBus.on('toggle-pause', a);
    EventBus.on('toggle-pause', b);
    EventBus.removeAll('toggle-pause');
    EventBus.emit('toggle-pause');
    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
  });

  it('once は一度だけ発火する', () => {
    const fn = vi.fn();
    EventBus.once('all-waves-cleared', fn);
    EventBus.emit('all-waves-cleared');
    EventBus.emit('all-waves-cleared');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('void イベントは引数なしで emit できる', () => {
    const fn = vi.fn();
    EventBus.on('toggle-pause', fn);
    EventBus.emit('toggle-pause');
    expect(fn).toHaveBeenCalledTimes(1);
    EventBus.removeAll('toggle-pause');
  });
});
