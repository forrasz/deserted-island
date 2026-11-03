import { describe, expect, it } from 'vitest';
import readme from '../../public/assets/README.md?raw';
import { ASSET_FILES, ASSET_KEYS } from './assets';

describe('素材の定義', () => {
  it('プレイヤー・ボス・部品・イカダ・背景・地面・海の 7 つのキーがある', () => {
    expect([...ASSET_KEYS].sort()).toEqual(
      ['background', 'boss', 'ground', 'part', 'player', 'raft', 'sea'].sort(),
    );
    expect(Object.keys(ASSET_FILES).sort()).toEqual([...ASSET_KEYS].sort());
  });

  it('それぞれに 1 つの PNG のファイル名が対応している', () => {
    for (const key of ASSET_KEYS) {
      expect(ASSET_FILES[key]).toMatch(/^[a-z]+\.png$/);
    }
  });

  it('同じファイル名が複数のキーに割り当てられていない', () => {
    const files = ASSET_KEYS.map((k) => ASSET_FILES[k]);
    expect(new Set(files).size).toBe(files.length);
  });
});

describe('素材の仕様書き(public/assets/README.md)', () => {
  it('定義のすべてのファイル名が記載されている', () => {
    for (const key of ASSET_KEYS) {
      expect(readme).toContain(ASSET_FILES[key]);
    }
  });

  it('各素材の用途・推奨サイズ・向き・透過・継ぎ目の列がある', () => {
    for (const heading of ['用途', '推奨サイズ', '条件']) {
      expect(readme).toContain(heading);
    }
    expect(readme).toContain('右向き');
    expect(readme).toContain('透過');
    expect(readme).toContain('継ぎ目');
  });

  it('README に記載された PNG のファイル名は、定義にあるものだけである', () => {
    const mentioned = new Set(readme.match(/[a-z]+\.png/g) ?? []);
    const defined = new Set(ASSET_KEYS.map((k) => ASSET_FILES[k]));
    for (const name of mentioned) expect(defined.has(name)).toBe(true);
  });
});
