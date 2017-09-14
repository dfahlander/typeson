/* eslint-env node */

const createConfig = (type) => {
    const filename = type !== 'umd' ? `typeson-${type}` : 'typeson';
    return {
        entry: './typeson.js',
        output: {
            libraryTarget: type,
            library: 'Typeson',
            filename: `./dist/${filename}.js`
        },
        module: {
            loaders: [{
                test: /\.js$/,
                exclude: /node_modules|dist|test\.js/,
                loader: 'babel-loader',
                query: {
                    presets: ['es2015'],
                    plugins: ['add-module-exports']
                }
            }]
        }
    };
};

module.exports = [createConfig('umd'), createConfig('commonjs2')];
