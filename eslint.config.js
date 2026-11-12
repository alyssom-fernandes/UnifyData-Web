// ESLint (configuração "flat"). Regras recomendadas, sem formatação.
const js = require('@eslint/js')
const globals = require('globals')

module.exports = [
  { ignores: ['node_modules/', 'docs/', 'exemplos/', 'fonts/', 'css/'] },
  js.configs.recommended,
  {
    // front: scripts clássicos no navegador (js/nucleo.js também roda no Node, nos testes)
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...globals.browser, module: 'readonly' },
    },
  },
  {
    files: ['tests/**/*.js', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
  },
  {
    rules: {
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true,
      }],
      // catch vazio é intencional (localStorage e leitura de arquivo que podem falhar sem importar)
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
]
