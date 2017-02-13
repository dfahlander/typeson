var Typeson = require('./typeson');

var typeson = new Typeson().register({
    undefined: [
        function (x, stateObj) { return typeof x === 'undefined' && stateObj.ownKeys; },
        function (n) { return null; },
        function (s) { return new Typeson.Undefined();} // Will add `undefined` (returning `undefined` would instead avoid explicitly setting)
    ],
    sparseUndefined: [
        function (x, stateObj) { return typeof x === 'undefined' && !stateObj.ownKeys; },
        function (n) { return null; },
        function (s) { return undefined;} // Will avoid adding anything
    ]
});

function assert (x, msg) {
    if (!x) throw new Error(msg);
    console.log("  OK: " + msg);
};
var obj = {a: [3, , null, undefined,,,, null, undefined]};
console.log(
    typeson.parse(typeson.stringify(obj)).a
);

console.log(
    (typeson.stringify(undefined))
);


var oo = {a: {}};
oo.b = oo.a;
console.log(typeson.stringify(oo)); // {"b":"#","$types":{"b":"#"}}
console.log(typeson.stringify({"$": undefined})); // {"$":null,"$types":{"$":"undefined"}}
console.log(typeson.stringify({"": undefined})); // {"":null,"$types":{"":"undefined"}}
