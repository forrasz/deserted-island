# Design

## Context

- 入力は `Keyboard`(`src/platform/keyboard.ts`)が `InputState`(left / right / jump / confirm)に変換し、`main.ts` のループが固定タイムステップで `stepFlow` に渡している。`InputState` を作る側だけを増やせば、ゲームのロジック(`src/core`)は変えずにタッチ操作を足せる
- 画面は論理解像度 960×540(16:9)の Canvas 1 枚。`index.html` の CSS で `max-width: 100vw; max-height: 100vh; aspect-ratio: 16 / 9` として縮小している。`viewport` の指定は幅と初期倍率だけで、拡大の禁止やスクロールの抑止はない
- 決定(`Enter`)の押しっぱなしは、`flow.ts` の `confirmHeld` が既に「押した瞬間だけ有効」にしている。タップによる決定もこの仕組みにそのまま乗る
- `FixedStepper` は、1 フレームの経過時間を `MAX_FRAME_MS` で頭打ちにする。止めている間の時間を一度に消化しない仕組みは既にあるが、止めている間は `advance` を呼ばないほうが確実

## Goals / Non-Goals

**Goals:**
- スマホの横向きで、画面上のボタンだけで、タイトルからクリアまで遊べる
- 複数の指を同時に使える。指を離す・取り消す・ページを離れる、のどの場合も押しっぱなしにならない
- 縦向きでは案内を出してゲームを止める。ブラウザの標準動作が操作を邪魔しない
- ロジック(ボタンの状態 → 入力、向きの判定)を `src/core` に置き、Vitest でテストする

**Non-Goals:**
- 縦向き対応、PWA、全画面 API の強制、ボタン配置の設定、振動・効果音
- ゲーム内容の調整、実機での検証(実機は公開後にユーザーが確認する)

## Decisions

### 1. ボタンは Canvas の外の HTML 要素にする
左・右・ジャンプのボタンは、Canvas に重ねた `<button>` 要素(`position: fixed`)にする。
- 理由: Pointer Events と CSS(`touch-action: none`、`user-select: none`、`-webkit-touch-callout: none`)がそのまま使え、見た目の調整も CSS だけで済む。Canvas 内に描くと、当たり判定を自前で持つことになる
- 代替: Canvas に描いて座標で判定する。画面の拡大縮小と座標の変換が増えるので採らない

### 2. 押下状態は「指(pointerId)→ ボタン」の対応で持つ
ボタンごとに「押している指の集合」を持ち、1 本でも押していれば有効とする。`pointerdown` で追加、`pointerup` / `pointercancel` / `pointerleave`(ボタンの外へ出たとき)で削除する。
- 理由: 2 本目の指でジャンプしても、1 本目の移動が保たれる。片方の指を離しても、もう片方に影響しない
- 純粋な状態の更新(`TouchState` と、`press` / `release` / `releaseAll` / `toInput`)は `src/core/touch.ts` に置く。DOM のイベントとの接続だけを `src/platform/touch.ts` に置く
- `pointerdown` で `setPointerCapture` は使わない。「指がボタンの外へ動いたら解除する」仕様なので、キャプチャすると外へ出ても `pointerleave` が来ない

### 3. 決定は、プレイ中以外の画面で、画面全体のタップとして扱う
`main.ts` が `flow.phase` を見て、`playing` 以外のときだけ、画面全体の `pointerdown` / `pointerup` で `confirm` を有効にする。`playing` のときは、ボタン以外のタップを無視する。
- 理由: 「Enter を探す」操作がスマホにはないので、画面のどこでも進められるようにする。プレイ中の誤タップで何も起きないようにする
- 押しっぱなしの扱いは既存の `confirmHeld` に任せる

### 4. 入力の合成は OR
`main.ts` で、キーボードの `InputState` とタッチの `InputState` を、項目ごとの OR で合成する(`mergeInput`、`src/core/touch.ts`)。キーボードの `Keyboard` は変更しない。

### 5. 向きは `innerWidth < innerHeight` で判定する
縦向き(高さ > 幅)のとき、案内を全面に表示し、`main.ts` のループは `stepper.advance` を呼ばずに `last = now` だけを更新する。`resize` と `orientationchange` で判定し直す。向きの判定は純粋関数(`isPortrait(width, height)`)として `src/core/touch.ts` に置く。
- 理由: 画面の向きの API(`screen.orientation.lock`)は多くのブラウザで全画面でないと使えない。案内を出して止めるのが、どの環境でも確実
- 縦向きになったとき、全ボタンを解除する(押しっぱなし防止)

### 6. 表示は CSS で「16:9 を保って収める」
`html, body` を `100dvh` とし、`overflow: hidden`、`overscroll-behavior: none`、`touch-action: none` にする。Canvas は `aspect-ratio: 16 / 9` で、`max-width: 100%`、`max-height: 100%` とする。安全領域は `viewport-fit=cover` と `env(safe-area-inset-*)` の余白で避ける。`viewport` には `user-scalable=no`(拡大の禁止)を指定する。
- `100vh` ではなく `100dvh` を使う理由: スマホのブラウザは、ツールバーの出入りで `100vh` が実際の見える高さとずれ、画面がはみ出すため
- 表示条件(ボタンを出す端末)は CSS の `@media (pointer: coarse)` で判定する。JavaScript では判定しない

### 7. 確認方法
Vitest でロジック(`touch.ts`)を確認し、DOM の部分は、開発用ブラウザ(Puppeteer のタッチエミュレーション。リポジトリには入れない)で、ボタンの押下・複数の指・縦横の切り替え・スクロール抑止を確認する。実機は公開後にユーザーが確認する。

## Risks / Trade-offs

- **実機との差**: エミュレーションでは、iOS Safari のツールバーや、ブラウザごとの長押しメニュー、拡大の抑止(iOS は `user-scalable=no` を無視する場合がある)を完全には再現できない。`touch-action: none` と `gesturestart` の `preventDefault` を併用して対策するが、実機での微調整が公開後に必要になる可能性がある
- **ボタンがゲーム画面を隠す**: 横向きのスマホは画面が低い(高さ 360 前後)。ボタンは画面の下の隅に、半透明で置き、プレイヤーとボスが画面の下端付近に来ることを考えて、大きさは最小限にする
- **`pointerleave` の挙動**: 一部のブラウザでは、指がボタンの外へ動いても `pointerleave` が遅れる。`pointercancel` と `lostpointercapture` も解除の対象にして、押しっぱなしを防ぐ
- **縦向きの案内**: 画面の向きが完全に正方形に近い端末(折りたたみ端末など)では、幅 ≧ 高さなら横向き扱いにする(判定は `width < height` のときだけ縦向き)
