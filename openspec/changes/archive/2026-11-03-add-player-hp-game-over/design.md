# Design

## Context

- 現状: `src/core/game.ts` の `stepGame` が、プレイヤー → ボス → 衝突解決(`resolveBossContact`)→ ドロップ → 部品 → 拾得 → イカダ・海・脱出の順で更新する。側面接触はプレイヤーを押し戻すだけで、ダメージはない。`src/core/flow.ts` は `title` / `playing` / `cleared` の遷移を管理する。
- 動機とスコープは proposal.md、要件は specs(`player-health`、変更する `boss-enemy` / `game-flow`)を参照。
- 方針: ロジックは `src/core`(Canvas/DOM 非依存、Vitest でテスト)、描画は `src/platform`。

## Goals / Non-Goals

**Goals:**
- 被弾・無敵・死亡を `stepGame` の純粋なロジックとして実装し、テストで決定的に検証できるようにする
- ゲームオーバーを既存のフロー(Enter で再プレイ)に最小の変更で加える

**Non-Goals:**
- ザコ敵、ボスの複数化、足場、上方向のスクロール、ステージの調整(後続の change)
- 地形ダメージ、回復、残機、スコア、効果音、画像素材

## Decisions

### 1. HP・無敵・死亡は `GameState` に持たせ、`Player` 型は変えない
- `GameState` に `hp: number`(初期 3)、`hitInvuln: number`(残りの無敵時間・秒)、`dead: boolean` を追加する。
- `Player`(位置・速度・接地)は物理のための型なので変更しない。既存の `stepPlayer` とそのテストに影響しない。
- 定数(`config.ts`): `PLAYER_MAX_HP = 3`、`PLAYER_INVULN_TIME = 2`(秒)、`HIT_BOUNCE_SPEED = 350`(px/s、上向き)、`BLINK_PERIOD = 0.1`(秒)。

### 2. 被弾は `resolveBossContact` の「踏みつけでない重なり」で判定する
- 既存の押し戻し(最小侵入方向への移動とワールド範囲へのクランプ)はそのまま維持する。
- 押し戻しが起きた更新で、`hitInvuln === 0` なら: `hp = max(0, hp - 1)`、`hitInvuln = PLAYER_INVULN_TIME`、プレイヤーに `vy = -HIT_BOUNCE_SPEED`・`onGround = false` を与える(小さく跳ね上がる)。
- `hitInvuln > 0` の間は、押し戻しだけ行い、ダメージとジャンプは与えない(ボスはすり抜けない。無敵中に重なったままでも密着して動けなくなることはない)。
- 踏みつけの判定は無敵の有無に関係なく成立し、プレイヤーはダメージを受けない(既存の動作)。
- 撃破済みのボスは判定の対象外(既存の動作)。
- `resolveBossContact` は戻り値に「被弾したか」を加え、`stepGame` が `hp` / `hitInvuln` を更新する。

### 3. 無敵時間は更新の冒頭で減らす
- `stepGame` の冒頭で `hitInvuln = max(0, hitInvuln - dt)` とし、その後に接触判定を行う。被弾した更新の `hitInvuln` は `PLAYER_INVULN_TIME`(=2 秒)のままで、次の更新から減る。2 秒 = 120 更新後に 0 になる。
- 浮動小数の誤差で 120 更新後に 1e-15 程度が残らないよう、`hitInvuln` は `dt` の積算ではなく、更新回数に換算して整数で保持する案もあるが、既存のボスの無敵時間と同じ方式(秒の積算と `max(0, ...)`)に揃え、テストでは「十分に経過した後」を検証する(ボスの無敵時間と同じ扱い)。

### 4. 死亡とゲームオーバー
- `dead = hp <= 0` を `stepGame` の末尾で設定する。`hp` は 0 を下回らない。
- `flow.ts` の `Phase` に `'gameover'` を追加する。`playing` の更新で、`game.escaped` なら `cleared`、そうでなければ `game.dead` なら `gameover` へ遷移する(同じ更新で両方が成立する場合はクリアを優先する)。
- `title` / `cleared` と同様に、`gameover` は Enter の押下の瞬間(エッジ)でのみ遷移し、`createGame()` で新しい初期状態を作って `playing` に戻る。`gameover` の間は `stepGame` を呼ばないので、世界・HP・無敵は止まる。
- 死亡した更新の画面: `gameover` に遷移した更新の時点の世界(HP 0)を、覆いの背後に描く。

### 5. 無敵中の点滅は純粋関数
- `src/core/blink.ts`: `blinkVisible(invuln, period = BLINK_PERIOD): boolean`。`invuln <= 0` なら常に true。そうでなければ `Math.floor(invuln / period) % 2 === 0` を返す(被弾した更新は残り時間が満タンで表示、その直後の最初の 0.1 秒は非表示から始まり、以後 0.1 秒ごとに交互に切り替わる)。
- `Renderer` は `blinkVisible(game.hitInvuln)` が false のとき、プレイヤーを描かない。

### 6. 描画
- HP: 画面左上に「HP」の文字と、残りHPの数だけのハート(`♥`、赤)を表示する。既存の HUD(部品数・イカダ)の上段に置き、部品数・イカダの行は下へずらす。
- ゲームオーバー画面: 暗い覆いの上に「ゲームオーバー」と「Enter キーでもう一度」を中央に表示(クリア画面と同じ作り)。
- 画像素材は使わず文字で表示する。プレイヤーの素材がある場合も、点滅は同じ判定で素材に適用する。

### 7. 既存テスト・既存仕様への影響
- `boss-enemy` の「側面・下からの接触」から「ダメージを与えない」を外し、被弾は `player-health` に従うと記述する。押し戻しの挙動は変わらない。
- `game-flow` は、再プレイとゲーム世界の停止の対象にゲームオーバー画面を加え、ゲームオーバーへの遷移の要件を追加する。
- 既存の `game.test.ts` / `flow.test.ts` / `escape.test.ts` は、側面接触でHPが減る・状態の項目が増えることで、一部の期待値の調整が必要になる可能性がある(`tsc` とテストで検出する)。

## Risks / Trade-offs

- [ボスの側面接触が必ず被弾になり、横から近づくだけで難しすぎる] → HP 3 と 2 秒の無敵で緩和する。数値は `config.ts` に集約し、遊んで調整する。踏みつけで倒す動きを促す設計。
- [被弾後に押し戻されても、キーを押し続けると 2 秒後にまた被弾する] → 想定どおりの挙動。跳ね上がりで接触から離れるのを助ける。必要なら後でノックバック量を調整する。
- [死亡した更新でそのままプレイヤーが表示され続ける] → 暗い覆いとゲームオーバー表示で状態が分かる。倒れる演出などは今回は含めない。
- [無敵中の点滅で、素材ありのプレイヤー画像も消える] → 仕様どおり(素材の有無に関係なく同じ判定を使う)。

## Open Questions

- HP・無敵時間・跳ね上がりの強さ・点滅の間隔の最終値は、遊んで調整する(spec の要件には影響しない)。
