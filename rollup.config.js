import babel from 'rollup-plugin-babel';
import resolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';
const uglify = require('rollup-plugin-uglify');
const {minify} = require('uglify-es');

export default [{
    input: 'typeson.js',
    output: {
        file: 'dist/typeson.js',
        format: 'umd',
        name: 'Typeson'
    },
    plugins: [
        babel(),
        uglify({
            keep_fnames: true, // Needed for `Typeson.Undefined` and other constructor detection
            keep_classnames: true // Keep in case implementing above as classes
        }, minify),
        resolve(),
        commonjs()
    ]
}, {
    input: 'typeson.js',
    output: {
        file: 'dist/typeson-commonjs2.js',
        format: 'cjs',
        name: 'Typeson'
    },
    plugins: [
        babel(),
        uglify({
            keep_fnames: true, // Needed for `Typeson.Undefined` and other constructor detection
            keep_classnames: true // Keep in case implementing above as classes
        }, minify),
        resolve(),
        commonjs()
    ]
}, {
    input: 'test/test.js',
    output: {
        file: 'test/test-polyglot.js',
        format: 'umd',
        name: 'TypesonTest'
    },
    plugins: [
        babel(),
        uglify({
            keep_fnames: true, // Needed for `Typeson.Undefined` and other constructor detection
            keep_classnames: true // Keep in case implementing above as classes
        }, minify),
        resolve(),
        commonjs()
    ]
}];
