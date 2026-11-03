import { defineConfig } from 'vitest/config';

export default defineConfig({
  // GitHub Pages のサブパス(/<リポジトリ名>/)でも動くよう、相対パスで出力する
  base: './',
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
