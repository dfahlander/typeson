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
function roundtrip(x) {
    var tson = typeson.stringify(x, null, 2);
    console.log(tson);
    return typeson.parse(tson);
}

run ([function basicTest1 () {
    var res = roundtrip({});
    assert(Object.keys(res).length === 0, "Result should be empty");
    var date = new Date();
    res = roundtrip({a: "a", b: 2, c: function(){}, d: false, e: Symbol(), f: [], g: date, h: /apa/gi });
    assert (res.a === "a", "String value");
    assert (res.b === 2, "Number value");
    assert (!res.c, "Functions should not follow by default");
    assert (res.d === false, "Boolean value");
    assert (!res.e, "Symbols should not follow by default");
    assert (Array.isArray(res.f) && res.f.length === 0, "Array value");
    assert (res.g instanceof Date && res.g.toString() == date.toString(), "Date value");
    assert (res.h instanceof RegExp && res.h.ignoreCase && res.h.global && !res.h.multiline, "Regexp value");
}]);
