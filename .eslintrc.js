'use strict';

module.exports = {
    extends: 'ash-nazg/sauron-node',
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
            files: ['.eslintrc.js'],
            extends: ['plugin:node/recommended-script'],
            rules: {
                'import/no-commonjs': 0
            }
        },
        {
            settings: {
                polyfills: ['Float64Array', 'Int8Array']
            },
            files: ['**/*.md'],
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
                'node/no-missing-import': ['off'],
                'no-multi-spaces': 'off',
                'jsdoc/require-jsdoc': 'off',
                'no-unused-vars': ['error', {
                    varsIgnorePattern: '^(typeson|myTypeson|objs|revived|obj)$'
                }],
                'node/global-require': 'off',
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
        indent: ['error', 4, {outerIIFEBody: 0}],
        // Todo: Reenable when apparent bug fixed
        'unicorn/no-unsafe-regex': 0,
        'promise/prefer-await-to-then': 0,
        'promise/prefer-await-to-callbacks': 0,
        'node/no-unsupported-features/es-builtins': 0,
        'node/no-unsupported-features/es-syntax': 0,
        'jsdoc/check-values': ['error', {allowedLicenses: true}]
    }
};
