import { EventBus } from './EventBus';

export interface ScenarioAction {
    type: 'spawn_enemy' | 'spawn_ally' | 'spawn_mothership' | 'add_points' | 'change_spawn_rate' | 'spawn_transport_ship';
    params: {
        count?: number;
        points?: number;
        rate?: number;
        enemyType?: 'standard' | 'single_circle' | 'squadron_attacker' | 'squadron_split_target';
        spawnSource?: 'outpost' | 'screen_edge' | 'base';
        squadronId?: string;
    };
}

export interface ScenarioEvent {
    id: string;
    targetWave?: string; // 特定のWaveでのみトリガーされるように制限するID
    triggerType: 'time' | 'points' | 'transport_ship_hp';
    triggerValue: number; // ミリ秒(time), ポイント数(points), またはHP閾値(transport_ship_hp)
    hasTriggered: boolean;
    sender: 'operator' | 'captain' | 'base' | 'unknown';
    senderName: string;
    message: string;
    avatarType: 'wave' | 'hologram' | 'mothership' | 'ally';
    expression?: 'normal' | 'joy' | 'anger' | 'sorrow' | 'fun';
    actions?: ScenarioAction[]; // 直接実行するアクション
    choices?: {
        yes: {
            text: string;
            message: string;
            expression?: 'normal' | 'joy' | 'anger' | 'sorrow' | 'fun';
            actions: ScenarioAction[];
        };
        no: {
            text: string;
            message: string;
            expression?: 'normal' | 'joy' | 'anger' | 'sorrow' | 'fun';
            actions: ScenarioAction[];
        };
    };
}

export interface DynamicEventDialogue {
    flagCondition?: { flag: string; value: boolean };
    sender: 'operator' | 'captain' | 'base' | 'unknown';
    senderName: string;
    message: string;
    avatarType: 'wave' | 'hologram' | 'mothership' | 'ally';
    expression?: 'normal' | 'joy' | 'anger' | 'sorrow' | 'fun';
}

export interface WaveConfig {
    id: string;
    name: string;
    rules: {
        allowTurretPlacement: boolean;
        allowRelayPlacement: boolean;
        allowBoost: boolean;
        maxTurrets?: number;
        maxRelays?: number;
    };
    clearConditions: {
        destroyAllOutpostsWeak?: boolean;
        transportShipReachedBase?: boolean;
        turretKills?: number;
        destroyAnyOutpost?: boolean;
        destroyAllOutposts?: boolean;
        destroyCarrierMothership?: boolean;
    };
}

export interface ScenarioData {
    waves?: Record<string, WaveConfig>;
    events: ScenarioEvent[];
    dynamicEvents: {
        relay_destroyed?: DynamicEventDialogue[];
        outpost_destroyed?: DynamicEventDialogue[];
        relay_placed?: DynamicEventDialogue[];
        wave1_cleared?: DynamicEventDialogue[];
        wave1_outpost_hint?: DynamicEventDialogue[];
    };
}

export class ScenarioManager {
    private waves: Record<string, WaveConfig> = {};
    private events: ScenarioEvent[] = [];
    private dynamicEvents: ScenarioData['dynamicEvents'] = {};

    private currentActiveEvent: ScenarioEvent | null = null;
    
    // ゲーム内の状態フラグ（動的セリフ分岐用）
    private stateFlags = {
        allyRescued: false
    };

    // 現在のWave進行状態
    private currentWaveId: string = 'wave2';
    private waveStartTimes: Record<string, number> = { wave2: 0 };
    private lastElapsedTime: number = 0;

    // Wave進捗カウンター
    private waveProgress = {
        outpostsWeakCount: 1, // 初期周回基地の残存数
        outpostsCount: 0,     // 敵前線基地の残存数
        outpostsDestroyedAtStart: 0,
        turretKills: 0,
        transportShipReached: 0,
        mothershipDestroyed: 0
    };

    constructor() {
        // デフォルトシナリオをロード
        this.loadDefaultScenario();

        // 多重登録を防止するため、既存リスナーを一度解除してから登録する
        EventBus.off('scenario-choice-selected');
        EventBus.on('scenario-choice-selected', (data: { eventId: string, choice: 'yes' | 'no' }) => {
            this.handleChoice(data.eventId, data.choice);
        });

        // エディタからのリアルタイム注入イベント（ゲーム進行状態をリセットせずイベントデータのみ更新）
        EventBus.off('scenario-inject');
        EventBus.on('scenario-inject', (data: ScenarioData) => {
            this.updateScenarioEvents(data);
        });

        // デバッグ用の強制Wave移行イベント登録
        EventBus.off('force-change-wave');
        EventBus.on('force-change-wave', (waveId: string) => {
            this.forceSetWave(waveId);
        });
    }

    private async loadDefaultScenario() {
        try {
            // localStorage に編集中のシナリオデータがあればそれを優先する
            const localData = localStorage.getItem('space_base_defender_scenario');
            if (localData) {
                try {
                    const data = JSON.parse(localData) as ScenarioData;
                    // 保存されているデータに wave3 の定義がない場合は、古いデータとみなして無視する
                    if (data.waves && data.waves.wave3) {
                        console.log("[ScenarioManager] Loaded scenario from localStorage");
                        this.loadScenario(data);
                        return;
                    } else {
                        console.log("[ScenarioManager] LocalStorage scenario is outdated (missing wave3). Falling back to default_scenario.json");
                        localStorage.removeItem('space_base_defender_scenario');
                    }
                } catch (e) {
                    console.error("Failed to parse local storage scenario:", e);
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
                const data = await response.json() as ScenarioData;
                this.loadScenario(data);
            } else {
                console.warn("Default scenario not found via HTTP fetch");
            }
        } catch (err) {
            console.error("Failed to load default scenario:", err);
        }
    }

    public loadScenario(data: ScenarioData) {
        this.waves = data.waves || {};
        // hasTriggeredをリセットしてディープコピー
        this.events = JSON.parse(JSON.stringify(data.events)).map((e: ScenarioEvent) => ({
            ...e,
            hasTriggered: false
        }));
        this.dynamicEvents = data.dynamicEvents || {};
        this.currentActiveEvent = null;
        this.stateFlags.allyRescued = false; // フラグも初期状態にリセット
        this.currentWaveId = 'wave2'; // Wave初期化
        this.waveStartTimes = { wave2: 0 };
        this.lastElapsedTime = 0;
        this.waveProgress = {
            outpostsWeakCount: 1,
            outpostsCount: 0,
            outpostsDestroyedAtStart: 0,
            turretKills: 0,
            transportShipReached: 0,
            mothershipDestroyed: 0
        };

        if (this.currentWaveId !== 'wave1') {
            setTimeout(() => {
                EventBus.emit('wave-changed', this.currentWaveId);
            }, 100);
        }
    }

    /**
     * エディタからのリアルタイム注入用。
     * ゲームの進行状態（Wave、プログレス等）をリセットせず、
     * イベントリスト・Wave定義・動的イベントのデータのみを更新する。
     */
    public updateScenarioEvents(data: ScenarioData) {
        this.waves = data.waves || {};
        // 未発火のイベントのみ更新（既に発火済みのイベントはそのまま保持）
        const triggeredIds = new Set(this.events.filter(e => e.hasTriggered).map(e => e.id));
        this.events = JSON.parse(JSON.stringify(data.events)).map((e: ScenarioEvent) => ({
            ...e,
            hasTriggered: triggeredIds.has(e.id) ? true : false
        }));
        this.dynamicEvents = data.dynamicEvents || {};

        console.log('[ScenarioManager] イベントデータをリアルタイム更新しました (ゲーム状態は維持)');
    }

    public setWaveProgress(key: keyof typeof this.waveProgress, value: number) {
        (this.waveProgress as any)[key] = value;
        this.checkWaveClearConditions();
    }

    public getWaveProgress() {
        return this.waveProgress;
    }

    public getCurrentWaveId(): string {
        return this.currentWaveId;
    }

    public getCurrentWaveConfig(): WaveConfig | null {
        return this.waves[this.currentWaveId] || null;
    }

    public checkWaveClearConditions() {
        const config = this.getCurrentWaveConfig();
        if (!config) return;

        let isCleared = false;
        const cond = config.clearConditions;

        // Wave 1 クリア判定：初期周回基地が全滅
        if (cond.destroyAllOutpostsWeak && this.waveProgress.outpostsWeakCount <= 0) {
            isCleared = true;
        }

        // Wave 2 クリア判定：輸送船が自基地にドッキング
        if (cond.transportShipReachedBase && this.waveProgress.transportShipReached >= 1) {
            isCleared = true;
        }

        // Wave 3 クリア判定：すべての敵前線基地を破壊
        if (cond.destroyAllOutposts && this.waveProgress.outpostsCount <= 0) {
            isCleared = true;
        }

        // Wave 4 クリア判定：敵の撃破数が一定値（例: 30機）に達した
        if (cond.turretKills && this.waveProgress.turretKills >= cond.turretKills) {
            isCleared = true;
        }

        // Wave 5 クリア判定：巨大母船を破壊
        if (cond.destroyCarrierMothership && this.waveProgress.mothershipDestroyed >= 1) {
            isCleared = true;
        }

        if (isCleared) {
            this.advanceWave();
        }
    }

    private advanceWave() {
        const currentWaveNum = parseInt(this.currentWaveId.replace('wave', '')) || 1;
        const nextWaveId = `wave${currentWaveNum + 1}`;
        
        if (this.waves[nextWaveId]) {
            this.currentWaveId = nextWaveId;
            this.waveStartTimes[nextWaveId] = this.lastElapsedTime;
            
            // デバッグログ通知
            EventBus.emit('debug-log-add', {
                type: 'scenario',
                message: `[Scenario] Waveクリア！ ${this.waves[nextWaveId].name} に移行します`
            });

            // Phaserシーンに通知
            EventBus.emit('wave-changed', nextWaveId);
        } else {
            // これ以上Waveがない場合（全クリアなど）
            EventBus.emit('debug-log-add', {
                type: 'scenario',
                message: `[Scenario] すべてのWaveをクリアしました！`
            });
            EventBus.emit('all-waves-cleared');
        }
    }

    public update(elapsedTime: number, currentPoints: number, transportShipHp: number = 100) {
        this.lastElapsedTime = elapsedTime;
        // すでにアクティブな通信がある場合はトリガー処理をスキップ
        if (this.currentActiveEvent) return;

        for (const event of this.events) {
            if (event.hasTriggered) continue;

            // 指定されたWaveと現在のWaveが一致しない場合はイベントを保留する
            if (event.targetWave && event.targetWave !== this.currentWaveId) {
                continue;
            }

            let shouldTrigger = false;
            if (event.triggerType === 'time') {
                const waveStartTime = event.targetWave ? (this.waveStartTimes[event.targetWave] || 0) : 0;
                const relativeTime = elapsedTime - waveStartTime;
                if (relativeTime >= event.triggerValue) {
                    shouldTrigger = true;
                }
            } else if (event.triggerType === 'points' && currentPoints >= event.triggerValue) {
                shouldTrigger = true;
            } else if (event.triggerType === 'transport_ship_hp' && transportShipHp <= event.triggerValue) {
                shouldTrigger = true;
            }

            if (shouldTrigger) {
                event.hasTriggered = true;
                this.currentActiveEvent = event;
                
                // デバッグログ通知
                EventBus.emit('debug-log-add', {
                    type: 'scenario',
                    message: `[Scenario] イベント "${event.id}" がトリガーされました`
                });

                // 直下のアクションがある場合は実行
                if (event.actions && event.actions.length > 0) {
                    event.actions.forEach(action => {
                        EventBus.emit('scenario-action-execute', action);
                    });
                }

                // UIへ通知 (非同期・例外安全)
                setTimeout(() => {
                    try {
                        EventBus.emit('scenario-trigger', event);
                    } catch (err) {
                        console.error("Phaser scenario trigger error:", err);
                    }
                }, 0);

                // 選択肢がない通信イベントは5.5秒後に自動ロック解除
                if (!event.choices) {
                    const selfEvent = event;
                    setTimeout(() => {
                        if (this.currentActiveEvent === selfEvent) {
                            this.currentActiveEvent = null;
                        }
                    }, 5500);
                }
                break; // 1回につき1つだけトリガー
            }
        }
    }

    private handleChoice(eventId: string, choice: 'yes' | 'no') {
        const event = this.events.find(e => e.id === eventId);
        if (!event) return;

        if ((eventId === 'mechanic_rescue' || eventId === 'mechanic_rescue_2') && choice === 'yes') {
            this.stateFlags.allyRescued = true;
        }

        const choiceData = choice === 'yes' ? event.choices?.yes : event.choices?.no;
        if (!choiceData) return;

        // デバッグログ通知
        EventBus.emit('debug-log-add', {
            type: 'scenario',
            message: `[Scenario] 選択肢 "${choice === 'yes' ? 'YES' : 'NO'}" が選ばれました`
        });

        // 応答メッセージの表情でイベント自体を更新
        if (choiceData.expression) {
            event.expression = choiceData.expression;
        }

        // アクションを実行
        choiceData.actions.forEach(action => {
            EventBus.emit('scenario-action-execute', action);
        });

        this.currentActiveEvent = null;
    }

    /**
     * ゲーム状態（味方救助フラグ等）に応じて、送信者やメッセージ内容が動的に変化する可変の割り込み通信をトリガーする。
     */
    public triggerDynamicEvent(eventType: 'relay_destroyed' | 'outpost_destroyed' | 'relay_placed' | 'wave1_cleared' | 'wave1_outpost_hint') {
        const dialogs = this.dynamicEvents[eventType];
        if (!dialogs || dialogs.length === 0) return;

        // 条件フラグに合致するセリフを選択する
        let selectedDialog = dialogs.find(d => {
            if (!d.flagCondition) return true; // 条件指定なしは常に一致
            const flagName = d.flagCondition.flag as 'allyRescued';
            return this.stateFlags[flagName] === d.flagCondition.value;
        });

        if (!selectedDialog) {
            selectedDialog = dialogs[0];
        }

        const dynamicEvent: ScenarioEvent = {
            id: `${eventType}_${Date.now()}`,
            triggerType: 'time',
            triggerValue: 0,
            hasTriggered: true,
            sender: selectedDialog.sender,
            senderName: selectedDialog.senderName,
            message: selectedDialog.message,
            avatarType: selectedDialog.avatarType,
            expression: selectedDialog.expression
        };

        this.currentActiveEvent = dynamicEvent;

        // デバッグログ通知
        EventBus.emit('debug-log-add', {
            type: 'scenario',
            message: `[Scenario] 動的イベント "${eventType}" がトリガーされました`
        });

        // UIへ通知
        setTimeout(() => {
            try {
                EventBus.emit('scenario-trigger', dynamicEvent);
            } catch (err) {
                console.error("Phaser scenario dynamic trigger error:", err);
            }
        }, 0);

        // 5.5秒後に自動的にロック解除する
        setTimeout(() => {
            if (this.currentActiveEvent === dynamicEvent) {
                this.currentActiveEvent = null;
            }
        }, 5500);
    }

    // シナリオの順序を外から動的に組み替えるためのAPI
    public setEvents(newEvents: ScenarioEvent[]) {
        this.events = newEvents;
    }

    public getEvents() {
        return this.events;
    }

    public forceSetWave(waveId: string) {
        if (this.waves[waveId]) {
            this.currentWaveId = waveId;
            this.waveStartTimes[waveId] = this.lastElapsedTime;
            
            // 各種進行フラグの初期化
            if (waveId === 'wave1') {
                this.waveProgress.outpostsWeakCount = 1;
            } else if (waveId === 'wave3') {
                this.waveProgress.outpostsCount = 4;
            } else if (waveId === 'wave4') {
                this.waveProgress.turretKills = 0;
            } else if (waveId === 'wave5') {
                this.waveProgress.mothershipDestroyed = 0;
            }

            // 指定されたWaveに関連するイベントのトリガー状況をリセット（デバッグ検証用）
            this.events.forEach(event => {
                if (event.targetWave === waveId) {
                    event.hasTriggered = false;
                }
            });

            EventBus.emit('debug-log-add', {
                type: 'scenario',
                message: `[Debug] 強制的に Wave を ${this.waves[waveId].name} に切り替えました`
            });

            // Phaserシーンに通知
            EventBus.emit('wave-changed', waveId);
        }
    }
}
