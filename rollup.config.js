import babel from 'rollup-plugin-babel';
import resolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';

export default [{
    input: 'typeson.js',
    output: {
        file: 'dist/typeson.js',
        format: 'umd',
        name: 'Typeson'
    },
    plugins: [
        babel(),
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
        resolve(),
        commonjs()
    ]
}];
