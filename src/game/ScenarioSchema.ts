import { z } from 'zod';

/**
 * シナリオ JSON の実行時バリデーションスキーマ（ARCHITECTURE_REVIEW.md §2.10）。
 * エディタ保存や読み込みで壊れたデータが混入したとき、ロード時に明確なエラーを出すために使う。
 *
 * 方針: 既知のフィールドの型のみを検証する。エディタが付与する `uid` 等の追加キーは
 *       既定の挙動（不明キーは無視）で許容し、実データを誤って弾かないようにする。
 */

const senderEnum = z.enum(['operator', 'captain', 'base', 'unknown']);
const avatarEnum = z.enum(['wave', 'hologram', 'mothership', 'ally']);

const ScenarioActionSchema = z.object({
  type: z.enum([
    'spawn_enemy', 'spawn_ally', 'spawn_mothership',
    'add_points', 'change_spawn_rate', 'spawn_transport_ship',
  ]),
  params: z.object({
    count: z.number().optional(),
    points: z.number().optional(),
    rate: z.number().optional(),
    enemyType: z.string().optional(),
    spawnSource: z.string().optional(),
    squadronId: z.string().optional(),
  }),
});

const ChoiceSchema = z.object({
  text: z.string(),
  message: z.string(),
  expression: z.string().optional(),
  actions: z.array(ScenarioActionSchema),
});

const ScenarioEventSchema = z.object({
  id: z.string(),
  targetWave: z.string().optional(),
  triggerType: z.enum(['time', 'points', 'transport_ship_hp']),
  triggerValue: z.number(),
  hasTriggered: z.boolean().optional(), // 読み込み時にリセットされるため任意
  sender: senderEnum,
  senderName: z.string(),
  message: z.string(),
  avatarType: avatarEnum,
  expression: z.string().optional(),
  actions: z.array(ScenarioActionSchema).optional(),
  choices: z.object({ yes: ChoiceSchema, no: ChoiceSchema }).optional(),
});

const WaveConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  rules: z.object({
    allowTurretPlacement: z.boolean(),
    allowRelayPlacement: z.boolean(),
    allowBoost: z.boolean(),
    maxTurrets: z.number().optional(),
    maxRelays: z.number().optional(),
    dockRepair: z.boolean().optional(),
    radarAlwaysVisible: z.boolean().optional(),
  }),
  clearConditions: z.object({
    destroyAllOutpostsWeak: z.boolean().optional(),
    transportShipReachedBase: z.boolean().optional(),
    turretKills: z.number().optional(),
    destroyAnyOutpost: z.boolean().optional(),
    destroyAllOutposts: z.boolean().optional(),
    destroyCarrierMothership: z.boolean().optional(),
  }),
});

const DynamicDialogueSchema = z.object({
  flagCondition: z.object({ flag: z.string(), value: z.boolean() }).optional(),
  sender: senderEnum,
  senderName: z.string(),
  message: z.string(),
  avatarType: avatarEnum,
  expression: z.string().optional(),
});

export const ScenarioDataSchema = z.object({
  waves: z.record(z.string(), WaveConfigSchema).optional(),
  events: z.array(ScenarioEventSchema),
  dynamicEvents: z.record(z.string(), z.array(DynamicDialogueSchema)).optional(),
});

/**
 * シナリオデータを検証し、問題があれば「パス: メッセージ」形式の文字列配列を返す。
 * 問題がなければ空配列。
 */
export function validateScenario(raw: unknown): string[] {
  const result = ScenarioDataSchema.safeParse(raw);
  if (result.success) return [];
  return result.error.issues.map(
    (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
  );
}
