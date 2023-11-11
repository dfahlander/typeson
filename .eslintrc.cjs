'use strict';

const mainRules = {
    // Disable from recommended-requiring-type-checking (any)
    '@typescript-eslint/no-unsafe-return': 0,
    '@typescript-eslint/no-unsafe-argument': 0,
    '@typescript-eslint/no-unsafe-assignment': 0,
    '@typescript-eslint/no-unsafe-member-access': 0,
    '@typescript-eslint/no-unsafe-call': 0,
    // Disable from Strict
    '@typescript-eslint/no-dynamic-delete': 0,
    // Class Undefined has a use for us
    '@typescript-eslint/no-extraneous-class': 0,

    // Disable for now
    'eslint-comments/require-description': 0,
    'jsdoc/check-types': 0,

    '@stylistic/brace-style': 'off',

    // Uses multiple sync methods
    'n/no-sync': 'off',

    '@stylistic/dot-location': ['error', 'property'],
    '@stylistic/indent': ['error', 4, {outerIIFEBody: 0}],
    'unicorn/consistent-destructuring': 0,
    'promise/prefer-await-to-then': 0,
    'promise/prefer-await-to-callbacks': 0,
    'n/no-unsupported-features/es-builtins': 0,
    'n/no-unsupported-features/es-syntax': 0,
    'jsdoc/check-values': ['error', {allowedLicenses: true}],

    'unicorn/no-this-assignment': 0,
    'unicorn/prefer-spread': 0
};

// eslint-disable-next-line @typescript-eslint/no-var-requires -- CJS
const {readFileSync} = require('fs');

const tsconfig = JSON.parse(readFileSync('./tsconfig.json', 'utf8'));

module.exports = {
    extends: [
        'ash-nazg/sauron-node-overrides'
    ],
    parserOptions: {
        ecmaVersion: 2022
    },
    settings: {
        jsdoc: {
            mode: 'typescript'
        },
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
            files: tsconfig.include,
            extends: [
                'plugin:@typescript-eslint/recommended',
                'plugin:@typescript-eslint/recommended-requiring-type-checking',
                'plugin:@typescript-eslint/strict',
                'ash-nazg/sauron-node-overrides'
            ],
            parserOptions: {
                project: true,
                tsconfigRootDir: __dirname,
                // Markdown problematic per https://github.com/typescript-eslint/typescript-eslint/issues/2373
                extraFileExtensions: ['.html', '.md'],
                ecmaVersion: 2022
            },
            rules: {
                ...mainRules
            }
        },
        {
            files: '.eslintrc.cjs',
            rules: {
                // CJS
                'n/no-sync': 'off'
            }
        },
        {
            files: ['**/*.md/*.js'],
            settings: {
                polyfills: ['Float64Array', 'Int8Array']
            },
            parserOptions: {
                project: null
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
                '@stylistic/indent': 'off'
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
        ...mainRules
    }
};
