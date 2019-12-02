import babel from 'rollup-plugin-babel';
import {terser} from 'rollup-plugin-terser';
import istanbul from 'rollup-plugin-istanbul';

/**
 * @external RollupConfig
 * @type {PlainObject}
 * @see {@link https://rollupjs.org/guide/en#big-list-of-options}
 */

/**
 * @param {PlainObject} config
 * @param {boolean} config.minifying
 * @param {string} [config.format='umd'} = {}]
 * @param {boolean} [config.test=false]
 * @returns {external:RollupConfig}
 */
function getRollupObject ({minifying, format = 'umd', coverage = false} = {}) {
    const base = coverage ? 'instrumented' : 'dist';
    const nonMinified = {
        input: 'typeson.js',
        output: {
            file: `${base}/typeson${
                (format === 'cjs'
                    ? '-commonjs2'
                    : format === 'umd'
                        ? ''
                        : '-' + format) +
                (minifying ? '.min' : '')
            }.js`,
            format,
            name: 'Typeson'
        },
        plugins: (coverage ? [istanbul()] : []).concat([
            babel()
        ])
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

// eslint-disable-next-line import/no-anonymous-default-export
export default [
    getRollupObject({minifying: true, format: 'umd'}),
    getRollupObject({minifying: false, format: 'umd'}),
    getRollupObject({minifying: true, format: 'esm'}),
    getRollupObject({minifying: false, format: 'esm'}),
    getRollupObject({minifying: true, format: 'cjs'}),
    getRollupObject({minifying: false, format: 'esm', coverage: true})
];
