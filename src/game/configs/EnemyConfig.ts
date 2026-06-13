export type AIPattern = 'rush_base' | 'rush_player' | 'circling_split' | 'strike_player' | 'patrol' | 'outpost' | 'squadron_circle' | 'single_circle' | 'squadron_split_target' | 'suicide_rush' | 'guard_suicide' | 'standard_orbit_attack';

export interface EnemyTypeConfig {
    id: string;
    name: string;
    hp: number;
    speed: number;
    scoreValue: number;
    tint: number;
    aiPattern: AIPattern;
    aiDescription: string;       // 動き（AI）の仕組みについての説明
    spawnDescription: string;    // 出現パターンについての説明
    defaultSpawnCount: number;   // 標準出現機数
}

export const ENEMY_CONFIGS: Record<'standard' | 'squadron_attacker' | 'mothership' | 'outpost' | 'single_circle' | 'outpost_weak' | 'squadron_split_target' | 'suicide_bomber' | 'suicide_guard', EnemyTypeConfig> = {
    standard: {
        id: 'standard',
        name: '戦闘機',
        hp: 10,
        speed: 18,
        scoreValue: 10,
        tint: 0xff3333, // 赤
        aiPattern: 'standard_orbit_attack',
        aiDescription: '楕円周回接近（standard_orbit_attack）：自基地に向けてゆっくり方向転換をしながら楕円を描いて近づき、至近距離（150px未満）に達すると1発弾を撃ち、ゆっくり方向転換をして遠ざかる（350px以上）動作を繰り返します。',
        spawnDescription: '自動定期湧き（75%の確率）で単機として画面外または敵前線基地から出現します。',
        defaultSpawnCount: 1
    },
    single_circle: {
        id: 'single_circle',
        name: '単独旋回機',
        hp: 10,
        speed: 25,
        scoreValue: 15,
        tint: 0xffaa00, // オレンジイエロー
        aiPattern: 'single_circle',
        aiDescription: '単独旋回追尾（single_circle）：螺旋（らせん）を描きながら自基地に公転接近します。自機が250px以内に接近すると、ターゲットを自機に切り替えて速度を1.4倍に上げ、しつこく追尾する突撃状態に移行します。',
        spawnDescription: 'シナリオによる開幕襲撃などの特定イベントにおいて、単機として画面外から出現します。',
        defaultSpawnCount: 1
    },
    squadron_attacker: {
        id: 'squadron_attacker',
        name: '編隊攻撃機',
        hp: 10,
        speed: 25,
        scoreValue: 20,
        tint: 0xff9900, // オレンジ
        aiPattern: 'squadron_circle',
        aiDescription: '編隊旋回・追尾分裂（squadron_circle）：3機編成で螺旋（らせん）を描きながら自基地に接近します。自機が250px以内に接近すると、3機のうち先頭の1機のみが自機をターゲットにして高速追尾（突撃）に移行し、残りの2機は元のらせん旋回移動を維持します。',
        spawnDescription: '自動定期湧き（25%の確率）またはシナリオイベントによって、3機編成 of のグループとして出現します。',
        defaultSpawnCount: 3
    },
    squadron_split_target: {
        id: 'squadron_split_target',
        name: '輸送船襲撃編隊',
        hp: 10,
        speed: 25,
        scoreValue: 20,
        tint: 0xffaa00,
        aiPattern: 'squadron_split_target',
        aiDescription: '輸送船周回・順次自機追従（squadron_split_target）：輸送船の周りをらせん旋回しながら、自機が250px以内に接近すると、3機のうち1機のみが自機を追尾します。その1機が撃破されると、残りの機体から順次1機ずつ自機追尾に切り替わります。',
        spawnDescription: 'Wave 2のシナリオイベントにて、3機編成で出現します。',
        defaultSpawnCount: 3
    },
    mothership: {
        id: 'mothership',
        name: '巨大母船',
        hp: 100,
        speed: 8,
        scoreValue: 100,
        tint: 0xff5555,
        aiPattern: 'rush_base',
        aiDescription: '超弩級接近・直撃弾射撃（mothership）：移動速度は非常に遅いですが、非常に高い耐久力を持ち、自基地に向けて直進します。一定間隔で自基地へ向けて強力な長距離弾を発射します。',
        spawnDescription: 'シナリオの最終局面など特定のイベントによって、自基地から800px離れた位置に出現します。',
        defaultSpawnCount: 1
    },
    outpost_weak: {
        id: 'outpost_weak',
        name: '初期周回基地',
        hp: 40,
        speed: 0,
        scoreValue: 100,
        tint: 0xff00ff, // マゼンタ
        aiPattern: 'outpost',
        aiDescription: '定点防衛・自動敵射出（outpost）：移動は行わず、自基地の周囲を公転移動します。一定時間（25秒）ごとに、周囲に直線接近を行う戦闘機（standard）をスポーンさせて攻撃を仕掛けてきます。耐久力は低めに設定されています。',
        spawnDescription: 'ゲーム開始時から自基地の周りを1500pxの距離で公転移動する最初のターゲットです。',
        defaultSpawnCount: 1
    },
    outpost: {
        id: 'outpost',
        name: '敵前線基地',
        hp: 250,
        speed: 0, // 固定
        scoreValue: 200,
        tint: 0xff00ff, // マゼンタ
        aiPattern: 'outpost',
        aiDescription: '定点防衛・自動敵射出（outpost）：移動は行わず、その場に留まります。一定時間（25秒）ごとに、周囲に直線接近を行う戦闘機（standard）をスポーンさせて攻撃を仕掛けてきます。壊すことで自動湧きの間隔が緩和されます。',
        spawnDescription: 'Wave 2開始時に、マップの四隅に固定配置されます。非常に高い耐久力を持ちます。',
        defaultSpawnCount: 1
    },
    suicide_bomber: {
        id: 'suicide_bomber',
        name: '自爆機',
        hp: 30,
        speed: 10,
        scoreValue: 30,
        tint: 0xffff00, // 黄色
        aiPattern: 'suicide_rush',
        aiDescription: '自爆突撃（suicide_rush）：ゆっくりと自基地に向けて直進接近します。基地に接触すると大爆発を起こし、10ダメージを与えます。',
        spawnDescription: 'Wave 1の特別襲撃イベント、または追加編隊として出現します。',
        defaultSpawnCount: 1
    },
    suicide_guard: {
        id: 'suicide_guard',
        name: '護衛迎撃機',
        hp: 10,
        speed: 15,
        scoreValue: 15,
        tint: 0x55ff55, // 緑色
        aiPattern: 'guard_suicide',
        aiDescription: '護衛・迎撃（guard_suicide）：自爆機の前方を横に並んで飛び、自機が一定範囲内（250px）に入ると迎撃（自機追尾）に行動を変更します。',
        spawnDescription: '自爆機の護衛役として2機がペアで出現します。',
        defaultSpawnCount: 2
    }
};
