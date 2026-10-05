import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'public/**', 'coverage/**', 'test-results/**', 'playwright-report/**', '.claude/**'] },
  js.configs.recommended,
  // Reglas con información de tipos (promesas sin esperar, `await` de no-promesas, etc.)
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { projectService: { allowDefaultProject: ['*.js'] }, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-explicit-any': 'error',
      eqeqeq: ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-console': 'off',
    },
  },
  // lus-sim (decisión 49): el corazón portado de EchoTwin conserva su fuente (docs/PROVENANCE.md). EchoTwin compila con
  // `noUncheckedIndexedAccess` y escribe `a[i]!`, que aquí sobra; y su generador aleatorio declara con valor inicial las variables
  // de su bucle `do … while`. Quitarlo alejaría el fuente de su origen sin cambiar nada
  {
    files: ['src/anatomy/heart/**/*.ts'],
    rules: { '@typescript-eslint/no-unnecessary-type-assertion': 'off', 'no-useless-assignment': 'off' },
  },
);
