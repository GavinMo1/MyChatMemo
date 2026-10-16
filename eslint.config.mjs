import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'build',
      'node_modules',
      'coverage',
      '*.js',
      'release/**',
      '*.d.ts',
      '!src/**/*.d.ts',
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    files: ['src/{content,sidepanel,popup,browser,ui}/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'dexie', message: '数据库操作只在 background 层。' }],
          patterns: [
            {
              group: ['@/background', '@/background/**', '**/background/**'],
              message: '通过 browser/ipc 调用后台，不直接依赖数据库或后台实现。',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/shared/**/*.{ts,tsx}', 'src/types/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        'chrome',
        'window',
        'document',
        'localStorage',
        'indexedDB',
        'fetch',
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'dexie', message: '共享层不得依赖数据库实现。' }],
          patterns: [
            {
              group: [
                '@/background/**',
                '@/content/**',
                '@/sidepanel/**',
                '@/popup/**',
                '@/browser/**',
                '@/infrastructure/**',
                '@/ui/**',
                '**/background/**',
                '**/content/**',
                '**/sidepanel/**',
                '**/popup/**',
                '**/browser/**',
                '**/infrastructure/**',
                '**/ui/**',
              ],
              message: '共享协议、纯工具及类型不得依赖运行时基础设施或 UI。',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/background/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', 'window', 'document'],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/content/**',
                '@/sidepanel/**',
                '@/popup/**',
                '@/ui/**',
                '**/content/**',
                '**/sidepanel/**',
                '**/popup/**',
                '**/ui/**',
              ],
              message: '后台不得依赖页面或 UI 实现。',
            },
          ],
        },
      ],
    },
  }
);
