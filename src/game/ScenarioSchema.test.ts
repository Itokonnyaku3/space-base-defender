import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateScenario } from './ScenarioSchema';

const validEvent = {
  id: 'e', triggerType: 'time', triggerValue: 1000,
  sender: 'operator', senderName: 'OP', message: 'm', avatarType: 'wave',
};

const validScenario = {
  waves: {
    wave2: {
      id: 'wave2', name: 'W2',
      rules: { allowTurretPlacement: false, allowRelayPlacement: true, allowBoost: true },
      clearConditions: { transportShipReachedBase: true },
    },
  },
  events: [validEvent],
  dynamicEvents: {},
};

describe('validateScenario', () => {
  it('正しいシナリオはエラーなし', () => {
    expect(validateScenario(validScenario)).toEqual([]);
  });

  it('同梱の default_scenario.json は検証を通る（出荷シナリオのレグレッション防止）', () => {
    const raw = JSON.parse(
      readFileSync(resolve(process.cwd(), 'public/assets/data/default_scenario.json'), 'utf8'),
    );
    expect(validateScenario(raw)).toEqual([]);
  });

  it('events 配列が無いとエラー', () => {
    const errs = validateScenario({ waves: validScenario.waves, dynamicEvents: {} });
    expect(errs.length).toBeGreaterThan(0);
  });

  it('triggerType が不正な値だと明確なエラー', () => {
    const errs = validateScenario({ events: [{ ...validEvent, triggerType: 'BOGUS' }] });
    expect(errs.length).toBeGreaterThan(0);
    expect(errs.join('\n')).toMatch(/triggerType/);
  });

  it('wave に rules が無いとエラー', () => {
    const errs = validateScenario({
      events: [],
      waves: { wave2: { id: 'wave2', name: 'W2', clearConditions: {} } },
    });
    expect(errs.length).toBeGreaterThan(0);
  });

  it('エディタ由来の追加フィールド（uid 等）は許容してエラーにしない', () => {
    const withExtra = { events: [{ ...validEvent, uid: 'evt_123', somethingNew: 42 }] };
    expect(validateScenario(withExtra)).toEqual([]);
  });
});
