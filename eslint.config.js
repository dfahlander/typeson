// eslint-disable-next-line no-restricted-imports -- Required?
import {readFileSync} from 'fs';

import ashNazg from 'eslint-config-ash-nazg';
import tseslint from 'typescript-eslint';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const mainRules = {
    '@brettz9/no-use-ignored-vars': 0,

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

const tsconfig = JSON.parse(readFileSync('./tsconfig.json', 'utf8'));

export default [
    {
        ignores: [
            'test/test-polyglot.js',
            'dist',
            'ignore',
            'coverage',
            'node_modules',
            // TS issues
            'rollup.config.js'
        ]
    },
    ...ashNazg(['sauron']),
    {
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
        }
    },
    {
        rules: {
            ...mainRules
        }
    },
    ...tseslint.config(
        ...tseslint.configs.strictTypeChecked.map((cfg) => {
            return {
                ...cfg,
                files: tsconfig.include
            };
        }),
        {
            languageOptions: {
                ecmaVersion: 2022,
                parserOptions: {
                    project: true,
                    tsconfigRootDir: __dirname,
                    // Markdown problematic per https://github.com/typescript-eslint/typescript-eslint/issues/2373
                    extraFileExtensions: ['.html', '.md']
                }
            },
            rules: {
                ...mainRules
            }
        }
    ),
    {
        files: ['.eslintrc.cjs'],
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
        languageOptions: {
            parserOptions: {
                project: null
            }
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
    }
];
