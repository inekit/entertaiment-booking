module.exports = {
  parser: '@typescript-eslint/parser', // определяем ESLint для использования TypeScript
  parserOptions: {
    project: 'tsconfig.json',
    tsconfigRootDir: __dirname,
    ecmaVersion: 2020, // позволяет использовать современные возможности JavaScript
    sourceType: 'module', // позволяет использовать модули
  },

  extends: [
    'plugin:@typescript-eslint/recommended', // использование рекомендуемых правил
    'plugin:prettier/recommended', // включаем правила Prettier
  ],
  rules: {
    // Ваши собственные правила ESLint
  },
};
