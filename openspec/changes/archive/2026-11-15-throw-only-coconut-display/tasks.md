# Tasks

## 1. 手元の実を、投げるときだけにする

- [x] 1.1 `src/core/config.ts` に `THROW_HAND_TIME = 0.1` を追加し、`src/core/player-anim.ts` の `ThrowPose` に `showCoconut`(`0 ≤ t < THROW_HAND_TIME`)を加える(`NO_THROW_POSE` は false)。Vitest(0・0.05 秒は true、0.1・0.2 秒・投げていないときは false)
- [x] 1.2 `src/platform/renderer.ts` の `drawPlayer`: 手持ちが 1 個以上であることを手元の実の条件から外し、`pose.showCoconut`(かつ、やられ・被弾・石の硬直・`dead` でない)のときだけ、手元に実を描く。`thrower.held` を使わなくなったら、引数から外す
- [x] 1.3 実際のブラウザで、(a) 実を持って走る・立つ・ジャンプしている間は、手元に実が出ない、(b) 投げた直後だけ(右向き・左向き)手元に出る、(c) 右上の手持ちの数の表示は変わらない、(d) シートがないときは従来の見た目、をスクリーンショットで確認する

## 2. 文書と確認

- [x] 2.1 `README.md` の「実を持っていると手元に見え、投げると体が前に傾きます」を、「投げると体が前に傾き、手元から実が飛び出します」に直す
- [x] 2.2 `npm test`・`npx tsc --noEmit`・`npm run build` がすべて成功することを確認する
