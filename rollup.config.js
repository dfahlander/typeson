import {babel} from '@rollup/plugin-babel';
import {terser} from 'rollup-plugin-terser';

/**
 * @external RollupConfig
 * @type {PlainObject}
 * @see {@link https://rollupjs.org/guide/en#big-list-of-options}
 */

/**
 * @param {PlainObject} [config={}]
 * @param {boolean} [config.minifying]
 * @param {string} [config.format="umd"]
 * @returns {external:RollupConfig}
 */
function getRollupObject ({minifying, format = 'umd'} = {}) {
    const nonMinified = {
        input: 'typeson.js',
        output: {
            file: `dist/typeson${
                format === 'cjs' ? '' : `.${format}`
            }${minifying ? '.min' : ''}.${
                format === 'cjs' ? 'c' : ''
            }js`,
            format,
            name: 'Typeson'
        },
        plugins: [
            babel({
                babelHelpers: 'bundled'
            })
        ]
    };
    if (minifying) {
        nonMinified.plugins.push(
            terser({
                // Needed for `Typeson.Undefined` and other constructor
                //   detection
                keep_fnames: true,
                // Keep in case implementing above as classes
                keep_classnames: true
            })
        );
    }
    return nonMinified;
}

export default [
    getRollupObject({minifying: true, format: 'umd'}),
    getRollupObject({minifying: false, format: 'umd'}),
    getRollupObject({minifying: false, format: 'cjs'}),
    getRollupObject({minifying: true, format: 'esm'}),
    getRollupObject({minifying: false, format: 'esm'})
];
