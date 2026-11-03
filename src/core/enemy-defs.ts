/** ザコ敵の種類(この change で実装する 10 種類)。 */
export type EnemyKind =
  | 'plodder'
  | 'scurrier'
  | 'hopper'
  | 'sleeper'
  | 'chaser'
  | 'floater'
  | 'swooper'
  | 'bouncer'
  | 'hider'
  | 'charger';

export interface EnemyDef {
  kind: EnemyKind;
  /** 画面や README に出す名前。 */
  name: string;
  /** 図形で描くときの本体の色。 */
  color: string;
  /** 目印(目や模様)の色。 */
  accent: string;
}

export const ENEMY_KINDS: readonly EnemyKind[] = [
  'plodder',
  'scurrier',
  'hopper',
  'sleeper',
  'chaser',
  'floater',
  'swooper',
  'bouncer',
  'hider',
  'charger',
];

/** 10 種類の定義。種類ごとに、色と名前が異なる。 */
export const ENEMY_DEFS: Record<EnemyKind, EnemyDef> = {
  plodder: { kind: 'plodder', name: 'のろのろ', color: '#8d6e63', accent: '#ffffff' },
  scurrier: { kind: 'scurrier', name: 'ちょこまか', color: '#ff8f00', accent: '#ffffff' },
  hopper: { kind: 'hopper', name: 'ぴょんぴょん', color: '#7cb342', accent: '#ffffff' },
  sleeper: { kind: 'sleeper', name: 'ねぼすけ', color: '#5e35b1', accent: '#ffffff' },
  chaser: { kind: 'chaser', name: 'つきまとい', color: '#ad1457', accent: '#ffffff' },
  floater: { kind: 'floater', name: 'ふわふわ', color: '#4fc3f7', accent: '#01579b' },
  swooper: { kind: 'swooper', name: 'きゅうこうか', color: '#37474f', accent: '#ffeb3b' },
  bouncer: { kind: 'bouncer', name: 'はねっこ', color: '#f06292', accent: '#ffffff' },
  hider: { kind: 'hider', name: 'かくれんぼ', color: '#9e9e9e', accent: '#212121' },
  charger: { kind: 'charger', name: 'とっしん', color: '#ef6c00', accent: '#b71c1c' },
};
