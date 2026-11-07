# Design

## Context

- 入力は `Keyboard`(`src/platform/keyboard.ts`)が、押下中のキーの集合から `InputState`(left / right / jump / confirm)を毎更新で作る。「押した瞬間」の履歴は持たないので、コマンドの順番は今の仕組みでは取れない
- `A` は左移動(`KeyA`)、`D` は右移動のキー。`↑` `↓` は現在どのキーにも割り当てられていない(`HANDLED` に含まれず、`preventDefault` もされない。ただし `body` が `overflow: hidden` なのでページはスクロールしない)
- 画面遷移(`flow.ts`)は `stepFlow(flow, input, dt)`。タイトル → プレイは `createGame()` で新しい世界を作る。被弾の有無は `stepGame` の `invulnerable`(無敵時間が残っているか)を、敵・ボス・弾の接触解決へ渡して決めている。穴の落下は `fell` でHPを 1 減らす。ボーナスは `stepBonus(bonus, hp, hitInvuln, input, dt)` が同じ考え方で石を扱う
- 描画のプレイヤーは `drawPlayer(player, hitInvuln, cameraX)`(本編とボーナスで共用)で、無敵時間中は点滅する

## Goals / Non-Goals

**Goals:**
- コマンド判定を純粋関数(`src/core/cheat.ts`)にして Vitest で確認する
- 無敵の効果を、既存の「無敵時間中は被弾しない」の仕組みに乗せて、変更を最小にする
- キーボードの押下イベント(リピートを除く)を、押した順に取り出せるようにする

**Non-Goals:**
- スマホからの入力、設定画面、ほかのチート、効果音・演出(proposal 参照)

## Decisions

### 1. 無敵は `GameState.invincible` の真偽値にし、「常に無敵時間中」とみなす
`stepGame` で `invulnerable = invulnLeft > 0 || state.invincible` とする。接触の解決(`resolveBossContact`・`resolveEnemyContact`・`resolveProjectileContact`)は、すでに `invulnerable` なら被弾せず、ボスの体で押し戻すだけの動きになっている(ボスは通り抜けられない)。踏みつけも従来どおり。
- 理由: 既存の動きをそのまま使えるので、敵・ボス・弾ごとに分岐を足さずに済む
- 穴の落下は `fell` の処理を、HPを減らさない(`hp - (fell && !invincible ? 1 : 0)`)、被弾後の無敵時間も始めない(点滅しない)よう変える。復帰位置への移動と 0.4 秒の操作ロックは従来どおり
- ボーナスは `stepBonus` に `invincible` を渡し、`invulnerable` に OR する。石は無敵のとき、消えず・硬直せず・HPを減らさない(既存の「無敵中の石」と同じ)。ハートは従来どおり回復する
- 代替: 被弾の結果(HP -1)だけを後から打ち消す。硬直やノックバックが残るので採らない

### 2. 隠しコマンドの判定は、押したキーのコード列を受け取る純粋関数にする
`src/core/cheat.ts`:
- `KONAMI_CODE = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','KeyB','KeyA']`
- `advanceCode(progress, code): { progress, unlocked }`: 次の期待キーなら 1 進める。違えば、そのキーが先頭(`ArrowUp`)なら進み具合を 1、そうでなければ 0 に戻す。最後まで進んだら `unlocked: true` で進み具合は 0
- `advanceCodes(progress, codes)`: 順に適用する(1 回の更新で複数のキーが来ても、順番を守る)
- 理由: 時刻に依存しない(制限時間なし)ので、押下の順番だけで決まる。1 キーずつの状態遷移なので、テストが書きやすい

### 3. `Flow` が進み具合を持ち、タイトルとプレイ中だけ受け付ける
- `Flow.cheat: number`(進み具合、初期値 0)を足す。`stepFlow(flow, input, dt, codes: readonly string[] = [])` に、省略可能な 4 つ目の引数としてキーのコード列を足す(既存の呼び出しとテストは変更不要)
- 受付の対象は、`flow.phase` が `title` と `playing`(ボーナス中を含む)のとき。完成したら、その時点の `flow.game.invincible = true` にする。`cleared` `gameover` では、コードを無視して進み具合も 0 にする
- 画面遷移(タイトル → プレイ、クリア/ゲームオーバー → プレイ)のときは、進み具合を 0 に戻す(spec「画面の遷移でやり直し」)
- 引き継ぎ: タイトル → プレイは、`createGame()` で作った新しい世界に、`flow.game.invincible` を引き継ぐ。クリア/ゲームオーバー → プレイは、`createGame()` の既定(オフ)のまま(解除)
- 代替: `invincible` を `Flow` だけが持ち、`stepGame` に引数で渡す。`stepGame` の呼び出し元が増えるので、`GameState` に持たせる

### 4. キーの押下イベントは `Keyboard` が溜めて、`main.ts` が毎フレーム取り出す
`Keyboard` に、`keydown`(`event.repeat` が真のものを除く)のコードを溜める配列と、`drainPresses(): string[]`(取り出して空にする)を足す。対象は、コマンドに使うコード(`ArrowUp` `ArrowDown` `ArrowLeft` `ArrowRight` `KeyB` `KeyA`)。`ArrowUp` `ArrowDown` は、`preventDefault` の対象(`HANDLED`)にも加える。
- `main.ts` は、1 フレームに取り出したコード列を、そのフレームの最初の `stepFlow` にだけ渡す(複数回の更新があっても、二重に数えない)
- 縦向きで止まっている間(`main.ts` のポーズ)は、取り出して捨てる(止まっている間のキーが、あとで入力されたことにならない)
- ページが非表示になったとき(`blur`・`visibilitychange`)は、溜めた押下を捨てる
- `A` は左移動のキーでもあるので、`A` を押すと、コマンドとして数えつつ、左へ動く(許容)

### 5. 表示
- `Renderer.drawPlayer` に、無敵モードのときの色(金色 `#ffd700`)を渡し、被弾の点滅はしない(無敵モードでは `hitInvuln` が 0 のまま)
- HUD に「無敵モード」(金色の文字)を、本編では 3 行目の下(y=108)、ボーナスでは同じ位置に出す。タイトル画面でオンのときは、タイトルの案内の下に出す
- 画像素材のプレイヤーのときは、金色の枠(アウトライン)で示す(色の変更ができないため)。図形のときは、塗りつぶしを金色にする

## Risks / Trade-offs

- **ほかの入力との干渉**: `↑` `↓` は新しく `preventDefault` するが、どちらもゲームの操作に使っていないので影響しない。`A` の左移動は許容する
- **リリース済みのゲームに隠し機能を足す**: クリアの意味が薄れるが、個人の遊びなので許容する。記録・スコアはないので、区別する必要はない
- **誤入力**: 通常のプレイ中に、コマンドが偶然完成することは、ほぼない(10 キーの決まった順番)
- **スマホ**: キーボードのないスマホでは、使えない(Non-Goals)
