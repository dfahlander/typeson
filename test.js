var Typeson = require('./typeson');
var typeson = new Typeson();

// The test framework I need:
function assert (x, msg) {
    if (!x) throw new Error(msg);
    console.log("  OK: " + msg);
};
function run(tests){tests.forEach(function(test){
    console.log("Running test: " + test.name);
    test();
})}
function roundtrip(x) { return typeson.parse(typeson.stringify(x)); }

run ([function basicTest1 () {
    var res = roundtrip({});
    assert(Object.keys(res).length === 0, "Result should be empty");
    var date = new Date();
    res = roundtrip({a: "a", b: 2, c: function(){}, d: false, e: Symbol(), f: [], g: date, h: /apa/gi});
    assert (res.a === "a", "String value");
    assert (res.b === 2, "Number value");
    assert (!res.c, "Functions should not follow by default");
    assert (res.d === false, "Boolean value");
    assert (!res.e, "Symbols should not follow by default");
    assert (Array.isArray(res.f) && res.f.length === 0, "Array value");
    assert (g instanceof Date && g == date, "Date value");
    assert (h instanceof RegExp && h.ignoreCase && h.global && !h.multiline, "Regexp value");
}]);
