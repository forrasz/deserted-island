# Tasks

## 1. 入力のロジック(touch-controls)

- [x] 1.1 `src/core/touch.ts` に、ボタン(左・右・ジャンプ)ごとに「押している指」の集合を持つ `TouchState` と、`press(pointerId, button)`・`release(pointerId)`・`releaseAll`、`toInput`(`InputState` への変換)を実装し、1 本で押している間だけ有効・離すと無効・2 本の指で別のボタン(移動しながらジャンプ)・片方だけ離しても他方は保たれる・同じボタンを 2 本で押して 1 本離しても有効のままの Vitest が通ることを確認する
- [x] 1.2 `mergeInput(a, b)`(項目ごとの OR)と、`isPortrait(width, height)`(`width < height` のときだけ真)を同じファイルに実装し、キーボードとタッチの合成・縦横の判定(正方形は横向き扱い)の Vitest が通ることを確認する

## 2. ボタンと入力の接続(touch-controls)

- [x] 2.1 `src/platform/touch.ts` に、左・右・ジャンプのボタンの DOM と Pointer Events(`pointerdown` で押下、`pointerup`・`pointercancel`・`pointerleave`・`lostpointercapture` で解除、`setPointerCapture` は使わない)の接続を実装し、ページが非表示になったときと縦向きになったときに全ボタンを解除する。型チェックが通ることを確認する
- [x] 2.2 決定のタップ(プレイ中以外の画面で、画面全体の `pointerdown`/`pointerup` を `confirm` にする。プレイ中のボタン以外のタップは無視する)を実装し、型チェックが通ることを確認する
- [x] 2.3 `src/main.ts` で、キーボードとタッチの入力を `mergeInput` で合成し、`flow.phase` に応じて決定のタップの有効・無効を切り替える。`npm test` と型チェックが通ることを確認する

## 3. 画面の調整(mobile-display)

- [x] 3.1 `index.html` の `viewport` に `viewport-fit=cover` と拡大の禁止(`user-scalable=no`、`maximum-scale=1`)を指定し、CSS で `100dvh`・`overflow: hidden`・`overscroll-behavior: none`・`touch-action: none`・`user-select: none`・`-webkit-touch-callout: none`、安全領域の余白(`env(safe-area-inset-*)`)、Canvas の 16:9 での収まり、ボタンの配置と見た目(半透明・最小限の大きさ。`@media (pointer: coarse)` でだけ表示)を実装する
- [x] 3.2 縦向きの案内(「横向きにしてください」)の要素と、`resize`・`orientationchange` での表示切り替えを実装し、縦向きの間は `main.ts` のループで `stepper.advance` を呼ばずに `last = now` だけを更新する(止まっている間の時間が戻ったあとに一度に消化されない)。型チェックが通ることを確認する
- [x] 3.3 ダブルタップ・ピンチによる拡大とコンテキストメニューを抑止する(`gesturestart` と `contextmenu` の `preventDefault`)。型チェックが通ることを確認する

## 4. ブラウザでの確認

- [x] 4.1 Puppeteer のタッチエミュレーション(開発用の確認ページ。リポジトリには入れない)で、横向き(例: 800×360)に、ボタンが表示され、押している間だけ移動・ジャンプし、2 本の指で移動しながらジャンプでき、指を離す・外へ動かす・取り消すと止まることを確認する
- [x] 4.2 タイトルでタップして開始、ゲームオーバーでタップして再開でき、プレイ中の画面タップでは決定されないことを確認する
- [x] 4.3 縦向き(例: 360×800)で案内が表示されて止まり、横向きに戻すと再開して、止まっていた間にゲームが進まないことを確認する。PC(マウス)の表示ではボタンが出ないことと、スクロール・拡大・長押しメニューが起きないことも確認する
- [x] 4.4 画面のスクリーンショットを撮り、ボタンがゲーム画面を大きく隠していないこと、16:9 が保たれていることを確認する

## 5. ドキュメントと全体確認

- [x] 5.1 `README.md` に、スマホでの遊び方(横向き、ボタンの使い方、画面タップで開始)を追記する
- [x] 5.2 `npm test`・`npx tsc --noEmit`・`npm run build` がすべて成功することを確認する

## Workflow follow-up

- 実装後に change をアーカイブして、公開(`main` への push)する。
- 実機(iOS Safari・Android Chrome)で、ボタンの大きさ・位置、長押しや拡大の抑止、ツールバーによる画面のはみ出しを確認し、必要なら調整する(spec の数値や挙動を変えた場合は、spec も更新する)。
