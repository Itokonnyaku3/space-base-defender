import type { ScenarioEvent, ScenarioAction, ScenarioData } from './ScenarioManager';

/**
 * Phaser ⇄ React 間およびゲーム内モジュール間の型付きイベントバス。
 *
 * 【設計意図 / ARCHITECTURE_REVIEW.md §2.9, §3.3】
 * - すべてのイベント名とペイロード型を GameEventMap に集約し、emit/on/off を型チェックする。
 *   → イベント名のタイポや不正なペイロードがコンパイルエラーになる。
 * - off() は「ハンドラ必須」にして、引数なしの「全リスナー消去」事故を防ぐ。
 *   意図的に全消ししたい場合のみ removeAll() を使う（リスナー登録前のクリーンアップ用途）。
 */

// ---- 共有ペイロード型 ----

export type LogType = 'spawn' | 'damage' | 'scenario' | 'system';

export interface DebugLogPayload {
    type: LogType;
    message: string;
}

export interface RadarEntity {
    x: number;
    y: number;
}

export interface VisionCircle {
    x: number;
    y: number;
    range: number;
}

export interface RadarData {
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

// ---- イベント名 → ペイロード型 のカタログ ----
// void のイベントはペイロードなしで emit する（emit('toggle-pause') のように）。

export interface GameEventMap {
    'toggle-radar-debug': boolean;
    'set-game-speed': number;
    'debug-log-add': DebugLogPayload;
    'toggle-pause': void;
    'pause-state-changed': boolean;
    'game-over-changed': boolean;
    'restart-game': void;
    'force-change-wave': string;
    'scenario-choice-selected': { eventId: string; choice: 'yes' | 'no' };
    'scenario-trigger': ScenarioEvent;
    'radar-update': RadarData;
    'scenario-inject': ScenarioData;
    'scenario-action-execute': ScenarioAction;
    'wave-changed': string;
    'view-change': 'game' | 'editor';
    'all-waves-cleared': void;
}

type EventKey = keyof GameEventMap;
type Handler<K extends EventKey> = (payload: GameEventMap[K]) => void;
// void イベントは引数なし、それ以外は [payload] を要求するための条件型
type EmitArgs<K extends EventKey> = GameEventMap[K] extends void ? [] : [GameEventMap[K]];

/**
 * Phaser 非依存の最小 EventEmitter。
 * これにより EventBus（と ScenarioManager 等の購読側）を Node 上で単体テストできる。
 * 使用する on/once/off(ハンドラ指定)/off(全消し)/emit のセマンティクスは Phaser.Events.EventEmitter と一致させている。
 */
interface MiniListener {
    fn: (...args: unknown[]) => void;
    context?: unknown;
    once: boolean;
}

class MiniEventEmitter {
    private readonly map = new Map<string, MiniListener[]>();

    private add(event: string, fn: (...args: unknown[]) => void, context: unknown, once: boolean): void {
        const arr = this.map.get(event) ?? [];
        arr.push({ fn, context, once });
        this.map.set(event, arr);
    }

    on(event: string, fn: (...args: unknown[]) => void, context?: unknown): void {
        this.add(event, fn, context, false);
    }

    once(event: string, fn: (...args: unknown[]) => void, context?: unknown): void {
        this.add(event, fn, context, true);
    }

    off(event: string, fn?: (...args: unknown[]) => void): void {
        if (!fn) {
            this.map.delete(event);
            return;
        }
        const arr = this.map.get(event);
        if (!arr) return;
        const next = arr.filter((l) => l.fn !== fn);
        if (next.length) this.map.set(event, next);
        else this.map.delete(event);
    }

    emit(event: string, ...args: unknown[]): void {
        const arr = this.map.get(event);
        if (!arr) return;
        // 実行中の登録/解除に備えてコピーを走査する
        for (const l of [...arr]) {
            l.fn.apply(l.context, args);
            if (l.once) this.off(event, l.fn);
        }
    }
}

class TypedEventBus {
    private readonly emitter = new MiniEventEmitter();

    emit<K extends EventKey>(event: K, ...args: EmitArgs<K>): void {
        this.emitter.emit(event, ...args);
    }

    on<K extends EventKey>(event: K, fn: Handler<K>, context?: unknown): void {
        this.emitter.on(event, fn as (...a: unknown[]) => void, context);
    }

    once<K extends EventKey>(event: K, fn: Handler<K>, context?: unknown): void {
        this.emitter.once(event, fn as (...a: unknown[]) => void, context);
    }

    /** 特定のハンドラだけを解除する（ハンドラ必須）。 */
    off<K extends EventKey>(event: K, fn: Handler<K>): void {
        this.emitter.off(event, fn as (...a: unknown[]) => void);
    }

    /** あるイベントの全リスナーを解除する。リスナー二重登録を防ぐ初期化用途に限定して使う。 */
    removeAll<K extends EventKey>(event: K): void {
        this.emitter.off(event);
    }
}

export const EventBus = new TypedEventBus();
