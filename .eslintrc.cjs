'use strict';

module.exports = {
    extends: 'ash-nazg/sauron-node-overrides',
    parserOptions: {
        ecmaVersion: 2022
    },
    settings: {
        polyfills: [
            'Array.from',
            'Array.isArray',
            'console',
            'document.body',
            'Error',
            'JSON',
            'Map',
            'Number.isNaN',
            'Object.create',
            'Object.defineProperty',
            'Object.entries',
            'Object.getPrototypeOf',
            'Object.keys',
            'Promise',
            'Set',
            'Symbol',
            'URL'
        ]
    },
    overrides: [
        {
            files: ['**/*.md/*.js'],
            settings: {
                polyfills: ['Float64Array', 'Int8Array']
            },
            rules: {
                'eol-last': ['off'],
                'no-console': ['off'],
                'no-undef': ['off'],
                'padded-blocks': ['off'],
                'import/unambiguous': ['off'],
                'import/no-unresolved': ['off'],
                'import/no-commonjs': 'off',
                'import/no-extraneous-dependencies': 'off',
                'global-require': 'off',
                'no-restricted-syntax': ['off'],
                'n/no-missing-import': ['off'],
                'no-multi-spaces': 'off',
                'jsdoc/require-jsdoc': 'off',
                'no-unused-vars': ['error', {
                    varsIgnorePattern: '^(typeson|myTypeson|objs|revived|obj)$'
                }],
                'n/global-require': 'off',
                // Disable until may fix https://github.com/gajus/eslint-plugin-jsdoc/issues/211
                indent: 'off'
            }
        },
        {
            files: ['test/**'],
            extends: [
                'plugin:chai-friendly/recommended',
                'plugin:chai-expect/recommended'
            ],
            env: {
                mocha: true
            },
            rules: {
                'import/unambiguous': 'off'
            }
        }
    ],
    rules: {
        // Disable for now
        'eslint-comments/require-description': 0,
        'jsdoc/check-types': 0,

        indent: ['error', 4, {outerIIFEBody: 0}],
        'unicorn/consistent-destructuring': 0,
        'promise/prefer-await-to-then': 0,
        'promise/prefer-await-to-callbacks': 0,
        'n/no-unsupported-features/es-builtins': 0,
        'n/no-unsupported-features/es-syntax': 0,
        'jsdoc/check-values': ['error', {allowedLicenses: true}],

        'unicorn/no-this-assignment': 0,
        'unicorn/prefer-spread': 0
    }
};
