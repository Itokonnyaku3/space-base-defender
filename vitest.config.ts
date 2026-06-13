import { defineConfig } from 'vitest/config';

// 単体テスト用設定（vite.config.ts とは独立）。
// ScenarioManager 等は localStorage を使うため jsdom 環境で実行する。
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});
