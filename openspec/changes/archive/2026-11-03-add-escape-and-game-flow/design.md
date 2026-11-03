# Design

## Context

- 現状: `src/core/game.ts` の `GameState`(player / boss / parts / partsCollected)と `stepGame` が、プレイ中の 1 回の更新を担う。`src/main.ts` は `stepGame` を直接呼んでおり、画面の遷移の概念はない。
- 動機とスコープは proposal.md、要件は specs(`escape-goal` / `game-flow`)を参照。
- 方針: ロジックは `src/core`(DOM/Canvas 非依存、Vitest でテスト)、描画・入力は `src/platform`。

## Goals / Non-Goals

**Goals:**
- イカダの完成・海の通行制限・脱出判定を `stepGame` に加え、純粋ロジックとして検証できるようにする
- 画面の遷移(タイトル / プレイ / クリア)を、プレイ中のロジックから切り離した小さな状態機械にする

**Non-Goals:**
- プレイヤーのHP、ゲームオーバー、ボス・部品の複数化
- リアルなキャラクターと画像素材の読み込み(別の change)
- ポーズ、メニュー、サウンド、タイム計測

## Decisions

### 1. フロー管理は `flow.ts` に分離し、`stepGame` は変えすぎない
```
src/core/
  flow.ts   # Flow { phase, game, confirmHeld }, createFlow(), stepFlow(flow, input, dt)
  game.ts   # GameState に raftComplete / escaped を追加。stepGame に海の制限と脱出判定を追加
```
- `Phase = 'title' | 'playing' | 'cleared'`。
- `stepFlow` の動作:
  - `title`: 決定キーの押下で `createGame()` を新しく作って `playing` へ。ゲームは進めない。
  - `playing`: `stepGame` を呼ぶ。結果の `escaped` が true なら `cleared` へ。
  - `cleared`: 決定キーの押下で `createGame()` を新しく作って `playing` へ(再プレイ)。ゲームは進めない。
- 代替: `stepGame` に phase を持たせる案は、プレイ中ロジックのテストにフローが混ざるため却下。

### 2. 決定キーは押下の瞬間(エッジ)で判定する
- `Flow.confirmHeld` に前回の `confirm` 入力を保持し、`confirm && !confirmHeld` のときだけ遷移する。
- 遷移した更新ではゲームを進めない(同じ更新で `stepGame` を呼ばない)。
- Enter を押しっぱなしにしても、タイトル → プレイの 1 回だけで、プレイ中は何も起きない。クリア直後に押しっぱなしで即再プレイになることも防ぐ。
- 決定キーは Enter のみ。Space はジャンプに使うため、タイトルやクリアの決定には使わない(開始と同時にジャンプが入る誤動作を避ける)。

### 3. イカダ・海・脱出は `stepGame` の最後に判定する
- 定数: `RAFT_PARTS_REQUIRED = 1`、`SEA_X = 3600`(海の開始位置。ワールド幅 3840 のうち右端 240px が海)。
- 更新順序(既存の末尾に追加): 既存の「プレイヤー → ボス → 衝突解決 → ドロップ → 部品 → 拾得」の後に、
  1. `raftComplete = partsCollected >= RAFT_PARTS_REQUIRED`(部品は減らないので一度 true になれば保たれる)
  2. `raftComplete` なら `escaped = player.x + PLAYER_WIDTH >= SEA_X`
  3. そうでなければ `player.x = min(player.x, SEA_X - PLAYER_WIDTH)`(海へ入れない)
- 拾得と同じ更新で完成と判定するため、部品を拾った更新、またはその次の更新までに脱出が成立する(spec の記述と一致)。
- 海の制限は、プレイヤーの更新後に x をクランプするだけで実現する。`player-movement` の `stepPlayer` は変更しない。ジャンプ中でも右辺が `SEA_X` を超えない(spec のシナリオ)。
- ボスの押し戻しでプレイヤーが海側へ押される配置は現状ない(ボスの往復範囲は x=1600〜2000)。

### 4. 入力に `confirm` を追加する
- `InputState` に `confirm: boolean` を追加し、`NO_INPUT` を更新する。
- `Keyboard` は `Enter` / `NumpadEnter` を決定キーとして扱い、他のキーと同様に `preventDefault` する。フォーカス喪失時の全解除も同じ。
- 既存テストの `InputState` リテラル(`{ left, right, jump }`)に `confirm: false` を足す必要がある。

### 5. 描画
- `Renderer.draw(flow, cameraX)` に変更し、`flow.phase` で分岐する。
- ワールド: `x < SEA_X` は従来の地面、`x >= SEA_X` は海(青い領域と波の目印)を地面の位置に描く。目印の縦線は海には描かない。
- イカダ完成時は、海の手前(砂浜側)に茶色の四角形でイカダを描く。
- HUD: 既存の「イカダの部品: N」の下に「イカダ: 未完成 / 完成!」を表示する。完成時は「右の海へ向かおう」を併記する。
- 案内: イカダ未完成で `player.x + PLAYER_WIDTH >= SEA_X` のとき、画面中央付近に「イカダがないと海へは出られない…」を表示する(離れると消える)。
- タイトル / クリア: 暗い半透明の覆いの上に、見出しと案内を中央に描く。タイトルはゲーム名「無人島脱出」と「Enter キーでスタート」、操作説明(←→/A D で移動、Space でジャンプ、ボスを踏んで倒す)。クリアは「脱出成功!」と「Enter キーでもう一度」。背後のゲームの世界は、そのときの状態で描く(進行はしない)。
- 画像アセットは使わず、図形とテキストのみ(リアルな素材は別の change)。

### 6. `main.ts`
- `Flow` を `stepFlow` で更新し、`computeCameraX` には `flow.game.player` を使う。固定タイムステップのループ、入力のスナップショットは変更しない。

## Risks / Trade-offs

- [海の開始位置が画面に入らず、どこへ行けばよいか分からない] → イカダ完成の案内に「右の海へ向かおう」を併記し、海が画面右に見える位置(ワールド右端)を最終地点とする。実際に遊んで分かりにくければ、案内を強める(spec への影響は小さい)。
- [Enter の押しっぱなしや、プレイ中に Enter を押してしまうことによる誤遷移] → エッジ判定と、プレイ中は決定キーを無視することで防ぐ。
- [`InputState` に項目を足すため、既存テストの修正が必要] → 型チェック(`tsc`)で漏れなく検出できる。
- [クリア後に再プレイすると、ブラウザ側のキー押下状態が残る場合がある] → `Keyboard` が押下状態を保持するだけで、世界は新規生成されるため影響は限定的。フォーカス喪失時の全解除は既存のまま。
- [リアルなキャラクターの要望を先送りする] → 描画を `Renderer` に閉じ込めているため、画像素材への差し替えは別の change で影響範囲を限定できる。

## Open Questions

- 海の開始位置(SEA_X)・必要部品数(1)・各画面の文言は、遊んで調整する(spec の要件には影響しない)。
