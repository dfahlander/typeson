module.exports = {
    entry: "./typeson.js",
    output: {
        libraryTarget: "umd",
        library: "Typeson",
        filename: "./dist/typeson.js"
    },
    module: {
        loaders: [
        ]
    }
};
