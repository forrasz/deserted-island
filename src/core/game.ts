import { createBonus, exitPlayer, inHiddenHole, stepBonus, type BonusState } from './bonus';
import { bossRect, createBoss, damageBoss, type Boss } from './boss';
import { bossFlags, stepBossScript, weakPointOf } from './boss-scripts';
import { overlapAmount, overlaps, type Rect } from './collision';
import { isStomp, playerRect } from './contact';
import { createEnemy, enemyRect, stepEnemy, type Enemy } from './enemy';
import { resolveEnemyContact } from './enemy-contact';
import {
  DYING_TIME_SCALE,
  FIXED_DT,
  PART_HEIGHT,
  PART_WIDTH,
  HIT_BOUNCE_SPEED,
  INTRO_TIME,
  INTRO_TRIGGER_DISTANCE,
  HITSTOP_TIME,
  IMPACT_SHAKE_TIME,
  IMPACT_TEXT_TIME,
  NUSHI_HIT_INVULN,
  COCONUT_DAMAGE,
  PALM_CANOPY_LOW,
  PALM_DROP_OFFSETS,
  PILLAR_REGROW_TIME,
  PILLAR_REGROW_TIME_2,
  TARGET_FLASH_TIME,
  PLAYER_HEIGHT,
  PLAYER_INVULN_TIME,
  PLAYER_MAX_HP,
  PLAYER_WIDTH,
  RAFT_PARTS_REQUIRED,
  RESPAWN_LOCK_TIME,
  SEA_X,
  STOMP_BOUNCE_SPEED,
} from './config';
import { NO_INPUT, type InputState } from './input';
import {
  createPlayer,
  DEFAULT_WORLD,
  stepPlayer,
  type Player,
  type WorldBounds,
} from './player';
import { projectileRect, resolveProjectileContact, stepProjectile, type Projectile } from './projectile';
import {
  breakAllPillars,
  createPillar,
  pillarEdges,
  standingPillarRects,
  stepPillars,
  type Pillar,
} from './pillar';
import {
  dropCoconut,
  stepCoconuts,
  stepThrown,
  throwCoconut,
  thrownRect,
  type Coconut,
  type Thrown,
} from './coconut';
import { createPalm, stepPalms, type PalmTree } from './palm';
import { createPart, partRect, stepPart, type RaftPart } from './raft-part';
import { STAGE, type Stage } from './stage';
import { fallYOf, isFullySupported, platformsOf, solidsOf } from './terrain';

export interface GameState {
  player: Player;
  /** ボス(10 体)。順序はステージの闘技場の順。 */
  bosses: Boss[];
  /** ザコ敵(倒された敵も `alive: false` で残る)。 */
  enemies: Enemy[];
  /** ボスが出した弾・衝撃波。 */
  projectiles: Projectile[];
  parts: RaftPart[];
  /** 拾得したイカダの部品の数。 */
  partsCollected: number;
  /** 必要数の部品をそろえてイカダが完成したか。一度 true になれば保たれる。 */
  raftComplete: boolean;
  /** イカダで海へ到達し、脱出に成功したか。 */
  escaped: boolean;
  /** プレイヤーのHP。0 を下回らない。 */
  hp: number;
  /** 被弾後の残りの無敵時間(秒)。0 なら被弾しうる。 */
  hitInvuln: number;
  /** HPが 0 になって死亡したか。 */
  dead: boolean;
  /** 穴に落ちたときの復帰位置(足元の幅全体が足場に支えられていた直近の位置)。 */
  respawn: { x: number; y: number };
  /** 復帰直後の、操作を受け付けない残り時間(秒)。 */
  respawnLock: number;
  /** ボーナスステージの最中の状態。遊んでいなければ null。ボーナス中は、本編の敵・ボス・弾・部品は止まって保たれる。 */
  bonus: BonusState | null;
  /** このプレイでボーナスステージを遊んだか(遊んだあとは、隠し穴は普通の地面)。 */
  bonusUsed: boolean;
  /** ヌシの登場演出の状態。sleeping = ヌシは眠っている、playing = 登場演出の最中(ゲームは止まる)、done = 戦闘中。t は演出の経過時間(秒)。 */
  intro: { state: 'sleeping' | 'playing' | 'done'; t: number };
  /** 最終ボスの闘技場の柱(壊せる。ボスの突進が当たると壊れ、条件がそろうと再生する)。 */
  pillars: Pillar[];
  /** 無敵モード(隠しコマンド)。オンの間は、敵・弾・石のダメージを受けず、穴に落ちてもHPが減らない。 */
  invincible: boolean;
  /** ステージのヤシの木(頭突きで実が落ちる)。 */
  palms: PalmTree[];
  /** 落ちている・落ちてくるヤシの実(30 秒で消える)。 */
  coconuts: Coconut[];
  /** 手持ちのヤシの実の数。 */
  held: number;
  /** 投げられて飛んでいるヤシの実。 */
  thrown: Thrown[];
  /** 直前の更新で、投げるキーが押されていたか(押した瞬間の判定に使う)。 */
  throwHeld: boolean;
  /** プレイヤーの向き(最後に押した左右。右 = 1)。投げる向きに使う。 */
  facing: 1 | -1;
  /** 練習用の的(なければ null)と、当たったあとに光る残り時間(秒)。 */
  target: Rect | null;
  targetFlash: number;
  /** ヒットストップの残り時間(秒)。0 より大きい間は、世界の更新を止める。 */
  hitStop: number;
  /** 柱への衝突の演出。t は経過時間(秒)、x は衝突の位置(ワールド x)、dir は突進の向き。なければ null。 */
  impact: { t: number; x: number; dir: 1 | -1 } | null;
}

/**
 * 初期状態。ボスとザコ敵は、ステージの配置(placements)から作る。
 * 既定はゲームのステージ。テストでは、敵なしのステージなどを渡せる。
 */
/** 柱の西・東を分ける基準(ヌシの往復範囲の中心)。ヌシがいなければ、すべて西の柱として扱う。 */
function pillarCenter(placements: Pick<Stage, 'bosses'>): number {
  const n = placements.bosses.find((b) => b.def.kind === 'nushi');
  return n ? (n.left + n.right + n.def.w) / 2 : Number.POSITIVE_INFINITY;
}

export function createGame(
  world: WorldBounds = DEFAULT_WORLD,
  placements: Pick<Stage, 'bosses' | 'enemies'> & Partial<Pick<Stage, 'pillars' | 'palms' | 'target'>> = STAGE,
): GameState {
  const player = createPlayer(100, world);
  return {
    player,
    bosses: placements.bosses.map((b) =>
      createBoss(b.x, b.left, b.right, world.groundY, b.def),
    ),
    enemies: placements.enemies.map((e, i) =>
      createEnemy(e.kind, e.x, e.left, e.right, world.groundY, i),
    ),
    projectiles: [],
    parts: [],
    partsCollected: 0,
    raftComplete: false,
    escaped: false,
    hp: PLAYER_MAX_HP,
    hitInvuln: 0,
    dead: false,
    respawn: { x: player.x, y: player.y },
    respawnLock: 0,
    bonus: null,
    bonusUsed: false,
    pillars: (placements.pillars ?? []).map((r) => createPillar(r, pillarCenter(placements))),
    intro: { state: 'sleeping', t: 0 },
    invincible: false,
    palms: (placements.palms ?? []).map((x) => createPalm(x)),
    coconuts: [],
    held: 0,
    thrown: [],
    throwHeld: false,
    facing: 1,
    target: placements.target ?? null,
    targetFlash: 0,
    hitStop: 0,
    impact: null,
  };
}

/**
 * プレイヤーとボスの衝突解決。
 * - もぐっているボス(hidden)とは、接触しない(踏みつけも押し戻しも被弾もない)。
 * - 落下中かつ更新前の下辺がボス上辺付近なら踏みつけ(プレイヤーは跳ね返り、被弾しない)。ボスにダメージを与えるが、
 *   最終ボス(ヌシ)は、気絶中・変身中も含めて、踏んでもダメージを受けない(ヤシの実を弱点に当てたときだけ)。転がっているボス(stompImmune)は踏みつけにならず、通常の接触になる。
 * - それ以外の重なりは水平方向のボスの端まで押し戻し、プレイヤーが無敵でなければ被弾(hit)として小さく跳ね上げる。
 *   無敵中は押し戻しだけ行い、ボスはすり抜けられない。変身中(harmless)は、押し戻しも被弾もない。
 */
function resolveBossContact(
  prevPlayer: Player,
  player: Player,
  boss: Boss,
  world: WorldBounds,
  invulnerable: boolean,
): { player: Player; boss: Boss; hit: boolean } {
  if (!boss.alive) return { player, boss, hit: false };
  const flags = bossFlags(boss);
  if (flags.hidden) return { player, boss, hit: false };
  const rect = bossRect(boss);
  const amount = overlapAmount(playerRect(player), rect);
  if (!amount) return { player, boss, hit: false };

  if (!flags.stompImmune && isStomp(prevPlayer.y, player.vy, rect.y)) {
    // 最終ボス(ヌシ)は、どの状態でも、踏んでもダメージがない(跳ね返るだけ)。変身中は、だれでもダメージがない
    const damaged = boss.kind === 'nushi' || flags.harmless || flags.bounceOnly ? boss : damageBoss(boss);
    return {
      player: {
        ...player,
        y: rect.y - PLAYER_HEIGHT,
        vy: -STOMP_BOUNCE_SPEED,
        onGround: false,
      },
      boss: damaged,
      hit: false,
    };
  }
  // 変身中と気絶中は、触れても被弾せず、押し戻されもしない
  if (flags.harmless || flags.staggered) return { player, boss, hit: false };

  const playerCenter = player.x + PLAYER_WIDTH / 2;
  const bossCenter = boss.x + boss.w / 2;
  // ボスの端まで押し出す(深く重なっていても、ボスの中に残らない)
  const pushed = playerCenter < bossCenter ? boss.x - PLAYER_WIDTH : boss.x + boss.w;
  const x = Math.min(Math.max(pushed, 0), world.width - PLAYER_WIDTH);
  const pushedPlayer = { ...player, x };
  if (invulnerable) return { player: pushedPlayer, boss, hit: false };
  return {
    player: { ...pushedPlayer, vy: -HIT_BOUNCE_SPEED, onGround: false },
    boss,
    hit: true,
  };
}

/**
 * 1 回の固定ステップ分、ゲーム全体を更新する。
 * 順序: プレイヤー → ボス(弾を出す)・ザコ敵・弾 → 衝突解決(ボス → ザコ敵 → 弾。被弾・無敵) → ドロップ → 部品の落下 → 拾得 → イカダ・海・脱出
 */
export function stepGame(
  state: GameState,
  input: InputState,
  dt: number = FIXED_DT,
  world: WorldBounds = DEFAULT_WORLD,
): GameState {
  // ボーナスステージの最中は、本編を更新せず、広間だけを更新する
  if (state.bonus) {
    const r = stepBonus(state.bonus, state.hp, state.hitInvuln, input, dt, state.invincible);
    if (r.done || r.hp <= 0) {
      // 退場(死亡のときも、ゲームオーバーの背景として地上へ戻しておく)
      return {
        ...state,
        player: exitPlayer(world),
        hp: r.hp,
        hitInvuln: r.hitInvuln,
        dead: r.hp <= 0,
        respawn: state.bonus.saved.respawn,
        respawnLock: 0,
        bonus: null,
        bonusUsed: true,
      };
    }
    return { ...state, hp: r.hp, hitInvuln: r.hitInvuln, bonus: r.bonus };
  }

  // 撃破演出の間は、ゲームの時間が遅くなる(スローモーション)
  if (state.bosses.some((b) => b.dying > 0)) dt = dt * DYING_TIME_SCALE;

  // 登場演出の最中は、世界を進めず(入力も受け付けず)、時間だけを進める
  if (state.intro.state === 'playing') {
    const t = state.intro.t + dt;
    return { ...state, intro: t >= INTRO_TIME ? { state: 'done', t: INTRO_TIME } : { state: 'playing', t } };
  }

  // 柱への衝突のヒットストップの間は、世界を止める(演出の時計と、的の光だけが進む)
  if (state.hitStop > 0) {
    return {
      ...state,
      hitStop: Math.max(0, state.hitStop - dt),
      impact: tickImpact(state.impact, dt),
      targetFlash: Math.max(0, state.targetFlash - dt),
    };
  }

  // 立っている柱は、プレイヤーにとって通れない地形(崖と同じ)
  const pillarRects = standingPillarRects(state.pillars);
  const baseWorld = world;
  world =
    pillarRects.length > 0
      ? { ...baseWorld, solids: [...solidsOf(baseWorld), ...pillarRects] }
      : baseWorld;

  let prevPlayer = state.player;
  // 復帰直後は、短い間だけ操作を受け付けない(押し続けたキーで、すぐ再び穴へ落ちないように)
  const locked = state.respawnLock > 0;
  let movedPlayer = stepPlayer(prevPlayer, locked ? NO_INPUT : input, dt, world);

  // 穴への落下: HP を 1 減らし、直前の安全な足場へ戻す(無敵中でも被弾になる)
  const fell = movedPlayer.y > fallYOf(world);
  let respawn = state.respawn;
  const respawnLock = fell ? RESPAWN_LOCK_TIME : Math.max(0, state.respawnLock - dt);
  if (fell) {
    movedPlayer = { x: respawn.x, y: respawn.y, vx: 0, vy: 0, onGround: true };
    prevPlayer = movedPlayer;
  } else if (
    movedPlayer.onGround &&
    isFullySupported(
      movedPlayer.x,
      movedPlayer.y,
      PLAYER_WIDTH,
      PLAYER_HEIGHT,
      solidsOf(world),
      platformsOf(world),
    )
  ) {
    // 足元の幅全体が支えられている位置だけを、復帰用に記録する(縁・空中では更新しない)
    respawn = { x: movedPlayer.x, y: movedPlayer.y };
  }

  // ボス(行動の流れ。弾を出す)とザコ敵(各体の行動。プレイヤーの位置に反応する敵がいる)
  const playerCenterX = movedPlayer.x + PLAYER_WIDTH / 2;
  const spawned: Projectile[] = [];
  const pillarPos = pillarEdges(state.pillars);
  const movedBosses = state.bosses.map((b) => {
    // ヌシは、登場演出が終わるまで眠っていて、動かない
    if (b.kind === 'nushi' && state.intro.state !== 'done' && b.dying <= 0) return b;
    const playerInside = overlaps(playerRect(movedPlayer), { x: b.x, y: b.y, w: b.w, h: b.h });
    const r = stepBossScript(
      b,
      { playerX: playerCenterX, groundY: world.groundY, pillars: pillarPos, playerInside },
      dt,
    );
    spawned.push(...r.spawns);
    return r.boss;
  });
  const ctx = { playerX: playerCenterX, playerY: movedPlayer.y, groundY: world.groundY };
  const movedEnemies = state.enemies.map((e) => stepEnemy(e, ctx, dt));
  // 既存の弾を動かし(消えたものは取り除く)、この更新で出た弾を加える(出た更新では動かさない)
  const projWorld = { width: world.width, groundY: world.groundY };
  const flying = state.projectiles
    .map((p) => stepProjectile(p, projWorld, dt))
    .filter((p) => p.alive);
  // 立っている柱は、弾と衝撃波を止める
  const movedProjectiles = [...flying, ...spawned].filter(
    (p) => !pillarRects.some((r) => overlaps(projectileRect(p), r)),
  );

  // 無敵時間は更新の冒頭で減らす(被弾した更新では PLAYER_INVULN_TIME のまま、次の更新から減る)
  // 無敵モードの間は、穴に落ちても被弾後の無敵時間(点滅)は始めず、常に「無敵時間中」として扱う
  const invulnLeft =
    fell && !state.invincible ? PLAYER_INVULN_TIME : Math.max(0, state.hitInvuln - dt);
  const invulnerable = invulnLeft > 0 || state.invincible;

  // ボスとの衝突(各体に順に適用)→ ザコ敵との衝突。被弾は 1 更新に 1 回
  let player = movedPlayer;
  let bossHit = false;
  let bosses = movedBosses.map((b) => {
    const r = resolveBossContact(prevPlayer, player, b, world, invulnerable);
    player = r.player;
    bossHit = bossHit || r.hit;
    return r.boss;
  });

  // ヤシの実: 飛んでいるものを動かし、当たりを調べ(地形・的・ヌシの弱点)、投げる操作を受け付ける
  const inputDir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const facing: 1 | -1 = inputDir !== 0 ? (inputDir as 1 | -1) : state.facing;
  let held = state.held;
  let targetFlash = Math.max(0, state.targetFlash - dt);
  const keptThrown: Thrown[] = [];
  let aliveEnemies = movedEnemies;
  const fallLine = fallYOf(world);
  for (const t0 of state.thrown) {
    const t = stepThrown(t0, dt);
    const tr = thrownRect(t);
    if (t.x < -50 || t.x > world.width || t.y > fallLine) continue;
    if (solidsOf(world).some((s) => overlaps(tr, s))) continue;
    if (state.target && overlaps(tr, state.target)) {
      targetFlash = TARGET_FLASH_TIME;
      continue;
    }
    let consumed = false;
    // ヌシ: 弱点(頭)に当たったときだけダメージ。体に当たったら、ダメージなしで消える
    bosses = bosses.map((b) => {
      if (consumed || b.kind !== 'nushi' || !b.alive) return b;
      const weak = weakPointOf(b);
      if (weak && overlaps(tr, weak.rect)) {
        consumed = true;
        if (b.invuln > 0) return b; // 命中の直後は、続けて当たってもダメージを受けない
        const d = damageBoss(b, COCONUT_DAMAGE);
        return d.alive && d.dying <= 0 ? { ...d, invuln: NUSHI_HIT_INVULN } : d;
      }
      if (overlaps(tr, bossRect(b))) consumed = true; // 体に当たったら、ダメージなしで消える
      return b;
    });
    // ザコ敵(隠れていない敵): 1 回で倒れる
    if (!consumed) {
      aliveEnemies = aliveEnemies.map((e) => {
        if (consumed || !e.alive || e.hidden || !overlaps(tr, enemyRect(e))) return e;
        consumed = true;
        return { ...e, alive: false };
      });
    }
    // ヌシ以外のボス: 体力 1 のダメージ(無敵時間は既存のとおり)。もぐっている・変身中・撃破演出中は通り抜ける
    if (!consumed) {
      bosses = bosses.map((b) => {
        if (consumed || b.kind === 'nushi' || !b.alive) return b;
        const f = bossFlags(b);
        if (f.hidden || f.harmless || !overlaps(tr, bossRect(b))) return b;
        consumed = true;
        return damageBoss(b, COCONUT_DAMAGE);
      });
    }
    if (!consumed) keptThrown.push(t);
  }
  const thrown = [...keptThrown];
  if (input.throw && !state.throwHeld && !locked && held > 0) {
    thrown.push(throwCoconut(player, facing));
    held -= 1;
  }
  const enemyResult = resolveEnemyContact(prevPlayer, player, aliveEnemies, invulnerable);
  player = enemyResult.player;
  const enemies = enemyResult.enemies;
  const projResult = resolveProjectileContact(player, movedProjectiles, invulnerable);
  player = projResult.player;
  // 撃破演出が始まった更新で、ボスの弾と衝撃波はすべて消える
  const dyingStarted = bosses.some((b, i) => b.dying > 0 && state.bosses[i]!.dying <= 0);
  const projectiles = dyingStarted ? [] : projResult.projectiles.filter((p) => p.alive);
  const hit = bossHit || enemyResult.hit || projResult.hit;

  const hp = Math.max(0, state.hp - (fell && !state.invincible ? 1 : 0) - (hit ? 1 : 0));
  const hitInvuln = hit ? PLAYER_INVULN_TIME : invulnLeft;

  // 柱: ボスが気絶に入った更新で壊れる。壊れた柱は、条件がそろうと再生する
  let pillars = state.pillars;
  // 突進が柱にぶつかった更新で、ヒットストップと衝突の演出を始める
  let hitStop = 0;
  let impact = tickImpact(state.impact, dt);
  const staggerIdx = bosses.findIndex((b, i) => state.bosses[i]!.stagger <= 0 && b.stagger > 0);
  if (staggerIdx >= 0) {
    const sb = bosses[staggerIdx]!;
    hitStop = HITSTOP_TIME;
    impact = { t: 0, x: sb.aimDir < 0 ? sb.x : sb.x + sb.w, dir: sb.aimDir };
  }
  // 突進がぶつかった衝撃で、柱は両方とも崩れる(片方だけが残ると、ヌシの反対側に取り残されたとき、詰むため)
  if (bosses.some((b, i) => state.bosses[i]!.stagger <= 0 && b.stagger > 0)) {
    pillars = breakAllPillars(pillars);
  }
  // ヌシを倒したら、柱はすべて崩れ、もう立たない(先へ進める)
  if (bosses.some((b, i) => state.bosses[i]!.alive && !b.alive && b.kind === 'nushi')) {
    pillars = breakAllPillars(pillars);
  }

  // 撃破された更新でのみ、そのボスの中央に部品を 1 個ドロップする(ボス 1 体につき 1 個)
  let parts = state.parts;
  bosses.forEach((boss, i) => {
    if (state.bosses[i]!.alive && !boss.alive) {
      const r = bossRect(state.bosses[i]!);
      parts = [
        ...parts,
        createPart(r.x + r.w / 2 - PART_WIDTH / 2, r.y + r.h / 2 - PART_HEIGHT / 2),
      ];
    }
  });

  parts = parts.map((p) => stepPart(p, dt, world.groundY));

  // 拾得(落下中でも可)
  const pr = playerRect(player);
  const remaining = parts.filter((p) => !overlaps(pr, partRect(p)));
  const partsCollected = state.partsCollected + (parts.length - remaining.length);

  // イカダの完成(部品は減らないので、一度完成すれば保たれる)
  const raftComplete = partsCollected >= RAFT_PARTS_REQUIRED;

  // 海: イカダ完成後は到達で脱出、未完成の間は入れない
  let escaped = state.escaped;
  let finalPlayer = player;
  if (raftComplete) {
    if (player.x + PLAYER_WIDTH >= SEA_X) escaped = true;
  } else if (player.x + PLAYER_WIDTH > SEA_X) {
    finalPlayer = { ...player, x: SEA_X - PLAYER_WIDTH };
  }

  // ヤシの木の頭突き(上昇しながら梢に重なる)で、実が落ちる
  const palmResult = stepPalms(state.palms, playerRect(finalPlayer), finalPlayer.vy, world.groundY, dt);
  // ヌシの突進が柱(ヤシの木)に当たった更新で、両方の木の外側に、実が 2 個ずつ落ちる(落ち始めるのは、ヒットストップのあと)
  const treeDrops: Coconut[] = [];
  if (staggerIdx >= 0) {
    for (const pl of state.pillars) {
      for (const off of PALM_DROP_OFFSETS) {
        const cx = pl.side === 'west' ? pl.x - off : pl.x + pl.w + off;
        treeDrops.push(dropCoconut(cx, world.groundY - PALM_CANOPY_LOW));
      }
    }
  }
  const fresh = [...palmResult.drops.map((d) => dropCoconut(d.x, d.y)), ...treeDrops];
  // ヤシの実を拾う(落ちている途中でも拾える)。落ちる・消える時間も進める
  const pick = stepCoconuts([...state.coconuts, ...fresh], playerRect(finalPlayer), held, world.groundY, dt);
  held = pick.held;

  const nushiForm2 = bosses.some((b) => b.kind === 'nushi' && b.alive && b.form === 2);
  pillars = stepPillars(
    pillars,
    {
      regrowTime: nushiForm2 ? PILLAR_REGROW_TIME_2 : PILLAR_REGROW_TIME,
      anyStaggered: bosses.some((b) => b.stagger > 0),
      blockers: [...bosses.filter((b) => b.alive).map(bossRect), playerRect(finalPlayer)],
      playerLeft: finalPlayer.x,
      playerRight: finalPlayer.x + PLAYER_WIDTH,
      bossAlive: bosses.some((b) => b.kind === 'nushi' && b.alive),
    },
    dt,
  );

  // 闘技場に近づくと、ヌシの登場演出が始まる(1 回だけ。ヌシが生きているとき)
  const westPillar = state.pillars.find((p) => p.side === 'west');
  const intro: GameState['intro'] =
    state.intro.state === 'sleeping' &&
    westPillar !== undefined &&
    bosses.some((b) => b.kind === 'nushi' && b.alive) &&
    finalPlayer.x + PLAYER_WIDTH >= westPillar.x - INTRO_TRIGGER_DISTANCE
      ? { state: 'playing', t: 0 }
      : state.intro;

  // 隠し穴(中間地点の地面)に立つと、ボーナスステージが始まる(1 回のプレイで 1 回だけ)
  const enterBonus = !state.bonusUsed && !fell && hp > 0 && inHiddenHole(finalPlayer);

  return {
    player: finalPlayer,
    bosses,
    enemies,
    projectiles,
    parts: remaining,
    partsCollected,
    raftComplete,
    escaped,
    hp,
    hitInvuln,
    dead: hp <= 0,
    respawn,
    respawnLock,
    bonus: enterBonus ? createBonus(respawn) : null,
    bonusUsed: state.bonusUsed,
    pillars,
    intro,
    invincible: state.invincible,
    palms: palmResult.palms,
    coconuts: pick.coconuts,
    held,
    thrown,
    throwHeld: input.throw,
    facing,
    target: state.target,
    targetFlash,
    hitStop,
    impact,
  };
}

/** 衝突の演出の時計を進める。揺れ・擬音が終わったら null。 */
function tickImpact(impact: GameState['impact'], dt: number): GameState['impact'] {
  if (!impact) return null;
  const t = impact.t + dt;
  return t >= Math.max(IMPACT_SHAKE_TIME, IMPACT_TEXT_TIME) ? null : { ...impact, t };
}
