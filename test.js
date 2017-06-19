var Typeson = require('./typeson');
var B64 = require ('base64-arraybuffer');

var typeson = new Typeson().register({
    Date: [
        function (x) { return x instanceof Date; },
        function (date) { return date.getTime(); },
        function (time) { return new Date(time); }
    ],
    Error: [
        function (x) { return x instanceof Error; },
        function (error) { return {name: error.name, message: error.message}; },
        function (data) {
            var e = new Error (data.message);
            e.name = data.name;
            return e;
        }
    ],
    SpecialNumber: [
        function (x) { return typeof x === 'number' && isNaN(x) || x === Infinity || x === -Infinity; },
        function (n) { return isNaN(n) ? "NaN" : n > 0 ? "Infinity" : "-Infinity" },
        function (s) { return {NaN: NaN, Infinity: Infinity, "-Infinity": -Infinity}[s];}
    ],
    ArrayBuffer: [
        function test (x) { return Typeson.toStringTag(x) === 'ArrayBuffer'; },
        function encapsulate (b) { return B64.encode(b); },
        function revive (b64) { return B64.decode(b64); }
    ],
    DataView: [
        function (x) { return x instanceof DataView; },
        function (dw) { return { buffer: dw.buffer, byteOffset: dw.byteOffset, byteLength: dw.byteLength }; },
        function (obj) { return new DataView(obj.buffer, obj.byteOffset, obj.byteLength); }
    ]
});

var globalTypeson = typeson;

// The test framework I need:
function assert (x, msg) {
    if (!x) throw new Error(msg);
    console.log("  OK: " + msg);
};
function run(tests){
    if (!tests.length) {
        return;
    }
    var test = tests.splice(0, 1)[0];
    console.log(" ");
    console.log("Running test: " + test.name);
    var ret = test();
    if (Typeson.isThenable(ret)) {
        ret.then(function () {
            run(tests);
        }).catch(function (err) {
            console.log('Promise error in test ' + test.name + ': \n\t' + err);
        });
    } else {
        run(tests);
    }
}
function roundtrip(x) {
    var tson = typeson.stringify(x, null, 2);
    //console.log(tson);
    return typeson.parse(tson);
}

run([function shouldSupportBasicTypes () {
    //
    // shouldSupportBasicTypes
    //
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

}, function shouldSupportObjectAPI () {
    var typeson = new Typeson().register({
        Date: {
            test: function (x) { return x instanceof Date; },
            replace: function (date) { return date.getTime(); },
            revive: function (time) { return new Date(time); }
        }
    });
    var date = new Date();
    var tson = typeson.stringify(date, null, 2);
    //console.log(tson);
    var back = typeson.parse(tson);
    assert (back instanceof Date && back.toString() == date.toString(), "Date value");
}, function shouldSupportObjectsContainingInternallyUsedProperties () {
    function test (data, cb) {
        var tson = typeson.stringify(data, null, 2);
        console.log(tson);
        var result = typeson.parse(tson);
        cb(result);
    }
    function valSwitch (val) {
        test({$types: val}, function (result) {
            assert(result.$types === val && Object.keys(result).length === 1, "Preserves $types on original object without additions");
        });
        test({$: val}, function (result) {
            assert(result.$ === val && Object.keys(result).length === 1, "Preserves $ on original object without additions");
        });
        test({$: val, $types: val}, function (result) {
            assert(result.$ === val && result.$types === val && Object.keys(result).length === 2, "Preserves $ and $types on original object without additions");
        });
    }
    valSwitch(true);
    valSwitch(false);
    test({$: {}, $types: {$: {'': 'val', 'cyc': '#'}, '#': 'a1', '': 'b1'}}, function (result) {
        assert(typeof result.$ === 'object' && !Object.keys(result.$).length && result.$types.$[''] === 'val' && result.$types.$.cyc === '#' && result.$types['#'] === 'a1' && result.$types[''] === 'b1' && Object.keys(result.$types).length === 3, "Preserves $ and $types on original object without additions");
    });
    test({a: new Date(), $types: {}}, function (result) {
        assert(result.a instanceof Date && !('$' in result) && typeof result.$types === 'object' && !Object.keys(result.$types).length);
    });
    test({a: new Date(), $: {}}, function (result) {
        assert(result.a instanceof Date && !('$types' in result) && typeof result.$ === 'object' && !Object.keys(result.$).length);
    });
    test({a: new Date(), $types: {}, $: {}}, function (result) {
        assert(result.a instanceof Date && typeof result.$types === 'object' && !Object.keys(result.$types).length && typeof result.$ === 'object' && !Object.keys(result.$).length);
    });
    function valSwitch2 (val) {
        test({a: new Date(), $types: val}, function (result) {
            assert(result.a instanceof Date && !('$' in result) && result.$types === val);
        });
        test({a: new Date(), $: val}, function (result) {
            assert(result.a instanceof Date && !('$types' in result) && result.$ === val);
        });
        test({a: new Date(), $types: val, $: val}, function (result) {
            assert(result.a instanceof Date && result.$types === val && result.$ === val);
        });
    }
    valSwitch2(true);
    valSwitch2(false);
    test({a: new Date(), $: {}}, function (result) {
        assert(result.a instanceof Date && !('$types' in result) && typeof result.$ === 'object' && !Object.keys(result.$).length);
    });
}, function disallowsHashType () {
    var caught = false;
    try {
        var typeson = new Typeson().register({'#': [function () {}, function () {}, function () {}]})
    } catch (err) {
        caught = true;
    }
    assert(caught, "Should throw on attempting to register the reserved 'type', '#'");
}, function shouldResolveCyclics() {
    //
    // shouldResolveCyclics
    //
    var data = {list: []};
    for (var i=0; i<10; ++i) {
        data.list.push({
            name: "name" + i,
            parent: data.list,
            root: data,
            children: []
        });
    }
    data.list[3].children = [data.list[0], data.list[1]];

    var tson = typeson.stringify(data, null, 2);
    //console.log(tson);
    var result = typeson.parse(tson);

    assert(data.list.length === 10, "Data.list.length should be 10");
    assert(data.list[3].children.length === 2, "data.list[3] should have 2 children");
    assert(data.list[3].children[0] === data.list[0], "First child of data.list[3] should be data.list[0]");

}, function shouldResolveCyclics2(){
    //
    // shouldResolveCyclics2
    //

    var kalle = {name: "Kalle", age: 33};
    var input = [kalle, kalle, kalle];
    var tson = typeson.stringify(input);
    //console.log (tson.match(/Kalle/g).length);
    console.log(tson);
    assert (tson.match(/Kalle/g).length === 1, "TSON should only contain one 'Kalle'. The others should just reference the first");
    var result = typeson.parse(tson);
    assert (result[0] === result[1] && result[1] === result[2], "The resulting object should also just have references to the same object");

}, function shouldResolveCyclicArrays () {
    var recursive = [];
    recursive.push(recursive);
    var tson = typeson.stringify(recursive);
    var result = typeson.parse(tson);
    assert(result === result[0], "array directly contains self");

    var recursive2 = [];
    recursive2.push([recursive2]);
    tson = typeson.stringify(recursive2);
    result = typeson.parse(tson);
    assert(result !== result[0] && result === result[0][0], "array indirectly contains self");

    var recursive3 = [recursive];
    tson = typeson.stringify(recursive3);
    console.log(tson);
    result = typeson.parse(tson);
    assert(result !== result[0] && result !== result[0][0] && result[0] === result[0][0], "array member contains self");

    var recursive4 = [1, recursive];
    tson = typeson.stringify(recursive4);
    console.log(tson);
    result = typeson.parse(tson);
    assert(result !== result[1] && result !== result[1][0] && result[1] === result[1][0], "array member contains self");
}, function shouldResolveCyclicObjectMembers () {
    var recursive = {};
    recursive.b = recursive;
    var recursiveContainer = {a: recursive};
    tson = typeson.stringify(recursiveContainer);
    console.log(tson);
    result = typeson.parse(tson);
    assert(result !== result.a && result !== result.b && result.a === result.a.b, "Object property contains self");
}, function shouldNotResolveCyclicsIfNotWanted(){
    //
    // shouldNotResolveCyclicsIfNotWanted
    //

    var kalle = {name: "Kalle", age: 33};
    var input = [kalle, kalle, kalle];
    var typeson = new Typeson({cyclic: false});
    var tson = typeson.stringify(input);
    var json = JSON.stringify(input);
    assert (tson === json, "TSON should be identical to JSON because the input is simple and the cyclics of the input should be ignored");

}, function shouldSupportArrays(){
    //
    // shouldSupportArrays
    //
    var res = roundtrip([1,new Date(),3]);
    assert (res instanceof Array, "Result should be an array");
    assert (res.length === 3, "Should have length 3");
    assert (res[2] === 3, "Third item should be 3");

}, function shouldSupportIntermedateTypes() {
    function CustomDate(date) {
        this._date = date;
    }
    var typeson = new Typeson()
        .register(globalTypeson.types)
        .register({
            CustomDate: [
                x => x instanceof CustomDate,
                cd => cd._date,
                date => new CustomDate(date)
            ]
        });
    var date = new Date();
    var input = new CustomDate(new Date);
    var tson = typeson.stringify(input);
    console.log(tson);
    var back = typeson.parse(tson);
    assert (back instanceof CustomDate, "Should get CustomDate back");
    assert (back._date.getTime() === date.getTime(), "Should have correct value");
}, function shouldRunReplacersRecursively(){
    //
    // shouldRunReplacersRecursively
    //
    function CustomDate (date, name) {
        this._date = date;
        this.name = name;
        this.year = date.getFullYear();
    }
    CustomDate.prototype.getRealDate = function() {
        return this._date;
    }
    CustomDate.prototype.getName = function () {
        return this.name;
    }

    var date = new Date();

    var input = {
        name: "Karl",
        date: new CustomDate(date, "Otto")
    }

    var typeson = new Typeson()
        .register(globalTypeson.types)
        .register({
            CustomDate: [
                x => x instanceof CustomDate,
                cd => ({_date: cd.getRealDate(), name: cd.name}),
                obj => new CustomDate(obj._date, obj.name)
            ]
        });
    var tson = typeson.stringify(input, null, 2);
    console.log(tson);
    var result = typeson.parse(tson);
    assert (result.name == "Karl", "Basic prop");
    assert (result.date instanceof CustomDate, "Correct instance type of custom date");
    assert (result.date.getName() == "Otto", "prototype method works and properties seems to be in place");
    assert (result.date.getRealDate().getTime() === date.getTime(), "The correct time is there");

}, function shouldBeAbleToStringifyComplexObjectsAtRoot() {
    var x = roundtrip(new Date(3));
    assert (x instanceof Date, "x should be a Date");
    assert (x.getTime() === 3, "Time should be 3");
    var y = roundtrip([new Date(3)]);
    assert (y[0] instanceof Date, "y[0] should be a Date");
    assert (y[0].getTime() === 3, "Time should be 3");

    function Custom () {
        this.x = "oops";
    }

    var TSON = new Typeson().register({
        Custom: [
            x => x instanceof Custom,
            s => false,
            f => new Custom()
        ]
    });
    var tson = TSON.stringify(new Custom());
    console.log(tson);
    var z = TSON.parse(tson);
    assert (z instanceof Custom && z.x === "oops", "Custom type encapsulated in bool should work");

    TSON = new Typeson().register({
        Custom: [
            x => x instanceof Custom,
            s => 42,
            f => new Custom()
        ]
    });
    tson = TSON.stringify(new Custom());
    console.log(tson);
    z = TSON.parse(tson);
    assert (z instanceof Custom && z.x === "oops", "Custom type encapsulated in bool should work");

    TSON = new Typeson().register({
        Custom: [
            x => x instanceof Custom,
            s => "foo",
            f => new Custom()
        ]
    });
    tson = TSON.stringify(new Custom());
    console.log(tson);
    z = TSON.parse(tson);
    assert (z instanceof Custom && z.x === "oops", "Custom type encapsulated in bool should work");

}, function shouldBePossibleToEncapsulateObjectWithReserved$typesProperty() {
    function Custom (val, $types){
        this.val = val;
        this.$types = $types;
    }
    var typeson = new Typeson().register({
        Custom: [
            x => x instanceof Custom,
            c => ({val: c.val, $types: c.$types}),
            o => new Custom(o.val, o.$types)
        ]
    });
    var input = new Custom("bar", "foo");

    var tson = typeson.stringify(input);
    console.log(tson);
    var x = typeson.parse(tson);
    assert (x instanceof Custom, "Should get a Custom back");
    assert (x.val === "bar", "Should have correct val value");
    assert (x.$types === 'foo', "Should have correct $types value");
}, function shouldLeaveLeftOutType() {
    // Uint8Buffer is not registered.
}, function shouldResolveCyclicsInEncapsulatedObjects() {
    var buf = new ArrayBuffer(16);
    var data = {
        buf: buf,
        bar: {
            data: new DataView(buf, 8, 8)
        }
    };
    var tson = typeson.stringify(data, null, 2);
    console.log(tson);
    var back = typeson.parse(tson);
    assert (back.buf === back.bar.data.buffer, "The buffers point to same object");
}, function shouldSupportRegisteringAClassWithoutReplacerOrReviver() {
    function MyClass() {}
    var TSON = new Typeson().register({MyClass: MyClass});
    var x = new MyClass();
    x.hello = "world";
    var tson = TSON.stringify(x);
    console.log(tson);
    var back = TSON.parse(tson);
    assert (back instanceof MyClass, "Should revive to a MyClass instance.");
    assert (back.hello === "world", "Should have all properties there.");
}, function shouldExecuteReplacersInProperOrder () {
    function Person () {}
    var john = new Person();
    var typeson = new Typeson().register([
        {specificClassFinder: [(x) => x instanceof Person, () => 'specific found']},
        {genericClassFinder: [(x) => x && typeof x === 'object', () => 'general found']}
    ]);
    var clonedData = typeson.parse(typeson.stringify(john));
    // Todo: Change the expected result to "specific found" if reimplementing in non-reverse order
    assert(clonedData === "general found", "Should execute replacers in proper order");
}, function shouldRunEncapsulateObserver () {
    var expected = '{\n' +
'    time: 959000000000\n' +
'    vals: [\n' +
'        0: null\n' +
'        1: undefined\n' +
'        2: 5\n' +
'        3: str\n' +
'    ]\n' +
'    cyclicInput: #\n' +
'}\n';
    var str = '';
    var indentFactor = 0;
    var indent = function () {
        return new Array(indentFactor * 4 + 1).join(' ');
    };
    var typeson = new Typeson({
        encapsulateObserver: function (o) {
            const isObject = o.value && typeof o.value === 'object';
            const isArray = Array.isArray(o.value);
            if (o.end) {
                indentFactor--;
                str += indent() + (isArray ? ']' : '}') + '\n';
                return;
            }
            if (!('replaced' in o)) {
                if (isArray) {
                    if (!('clone' in o)) {
                        return;
                    }
                    str += indent() + (o.keypath ? o.keypath + ': ' : '') + '[\n';
                    indentFactor++;
                    return;
                }
                if (isObject) {
                    if ('cyclicKeypath' in o) {
                        o.value = '#' + o.cyclicKeypath;
                    } else {
                        str += indent() + '{\n';
                        indentFactor++;
                        return;
                    }
                }
            } else if (isObject) {
                // Special type that hasn't been finally resolved yet
                return;
            }
            var idx = o.keypath.lastIndexOf('.') + 1;
            str += indent() + o.keypath.slice(idx) + ': ' +
                ('replaced' in o ? o.replaced : o.value) + '\n';
        }
    })
        .register(globalTypeson.types);
    var input = {
        time: new Date(959000000000),
        vals: [null, undefined, 5, "str"]
    };
    input.cyclicInput = input;
    var tson = typeson.encapsulate(input);
    // console.log(str);
    // console.log(expected);
    assert (str === expected, "Observer able to reduce JSON to expected string");
}, function shouldRunEncapsulateObserver () {
    var expected = '';

    var str = '';
    var placeholderText = '(Please wait for the value...)';
    function APromiseUser (a) {this.a = a;}
    var typeson = new Typeson({
        encapsulateObserver: function (o) {
            const isObject = o.value && typeof o.value === 'object';
            const isArray = Array.isArray(o.value);
            if (o.resolvingPromise) {
                var idx = str.indexOf(placeholderText);
                var start = str.slice(0, idx);
                var end = str.slice(idx + placeholderText.length);
                str = start + o.value + end;
            } else if (o.awaitingTypesonPromise) {
                str += '<span>' + placeholderText + '</span>';
            } else if (!isObject && !isArray) {
                str += '<span>' + o.value + '</span>';
            }
        }
    }).register({
        Date: [
            function (x) { return x instanceof Date; },
            function (date) { return date.getTime(); },
            function (time) { return new Date(time); }
        ],
        PromiseUser: [
            function (x) { return x instanceof APromiseUser; },
            function (o) { return new Typeson.Promise(function (res) {
                setTimeout(function () {
                    res(o.a);
                }, 300);
            })},
            function (val) { return new APromiseUser(val) }
        ]
    });
    var input = ['aaa', new APromiseUser(5), 'bbb'];

    var prom = typeson.encapsulateAsync(input).then(function (encaps) {
        var back = typeson.parse(JSON.stringify(encaps));
        assert(
            back[0] === input[0] &&
            back[2] === input[2] &&
            back[1] instanceof APromiseUser &&
                back[1].a === 5,
            "Should have resolved the one nested promise value");
        // console.log(str);
        assert(
            str === '<span>aaa</span><span>5</span><span>bbb</span>',
            "Should have allowed us to run the callback asynchronously (where we can substitute a placeholder)"
        );
    });
    assert(
        str === '<span>aaa</span><span>' + placeholderText + '</span><span>bbb</span>',
        "Should have allowed us to run the callback synchronously (where we add a placeholder)"
    );
    return prom;
}, function shouldAllowIterateIn () {
    function A (a) {
        this.a = a;
    }
    function createExtendingClass (a) {
        function B (b, isArr) {
            this[3] = 4;
            this.b = b;
            this.isArr = isArr;
        }
        B.prototype = new A(a);
        return B;
    }

    var typeson = new Typeson().register({
        iterateIn: {
            test: function (x, stateObj) {
                if (x instanceof A) {
                    stateObj.iterateIn = x.isArr ? 'array' : 'object';
                    return true;
                }
                return false;
            }
        }
    });

    var B = createExtendingClass(5);

    var b = new B(7);
    var tson = typeson.stringify(b);
    console.log(tson);
    var back = typeson.parse(tson);
    assert(!Array.isArray(back), "Is not an array");
    assert(back[3] === 4, "Has numeric property");
    assert(back.a === 5, "Got inherited 'a' property");
    assert(back.b === 7, "Got own 'b' property");

    var b = new B(8, true);
    var tson = typeson.stringify(b);
    console.log(tson);
    var back = typeson.parse(tson);
    assert(Array.isArray(back), "Is an array");
    assert(back[3] === 4, "Has numeric property");
    assert(!('a' in back), "'a' property won't survive array stringification");
    assert(!('b' in back), "'b' property won't survive array stringification");
}, function executingToJSON () {
    function A () {}
    A.prototype.toJSON = function () {return 'abcd';}
    var typeson = new Typeson();
    var a = new A(); // Encapsulated as is
    var tson = typeson.stringify(a);
    console.log(tson);
    var back = typeson.parse(tson);
    assert(back === 'abcd', "Should have executed `toJSON`");

    var typeson = new Typeson();
    var a = { // Plain object rebuilt during encapsulation including with `toJSON`
        toJSON: function () {return 'abcd';}
    };
    var tson = typeson.stringify(a);
    console.log(tson);
    var back = typeson.parse(tson);
    assert(back === 'abcd', "Should have executed `toJSON`");
}, function shouldAllowPlainObjectReplacements () {
    var typeson = new Typeson().register({
        plainObj: {
            testPlainObjects: true,
            test: function (x) {
                return 'nonenum' in x;
            },
            replace: function (o) {
                return {
                    b: o.b,
                    nonenum: o.nonenum
                };
            }
        }
    });
    var a = {b: 5};
    Object.defineProperty(a, 'nonenum', {
        enumerable: false,
        value: 100
    });

    var tson = typeson.stringify(a);
    console.log(tson);
    var back = typeson.parse(tson);
    assert(back.b === 5, "Should have kept property");
    assert(back.nonenum === 100, "Should have kept non-enumerable property");
    assert(Object.keys(back).includes('nonenum'), "Non-enumerable property should now be enumerable");
}, function shouldAllowSinglePromiseResolution() {
    var typeson = new Typeson();
    var x = new Typeson.Promise(function (res) {
        setTimeout(function () {
            res(25);
        }, 500);
    });
    return typeson.stringifyAsync(x).then(function (tson) {
        console.log(tson);
        var back = typeson.parse(tson);
        assert(back === 25, "Should have resolved the one promise value");
    });
}, function shouldAllowSingleNestedPromiseResolution() {
    function APromiseUser (a) {this.a = a;}
    var typeson = new Typeson().register({
        Date: [
            function (x) { return x instanceof Date; },
            function (date) { return date.getTime(); },
            function (time) { return new Date(time); }
        ],
        PromiseUser: [
            function (x) { return x instanceof APromiseUser; },
            function (o) { return new Typeson.Promise(function (res) {
                setTimeout(function () {
                    res(o.a);
                }, 300);
            })},
            function (val) { return new APromiseUser(val) }
        ]
    });
    var x = new Typeson.Promise(function (res) {
        setTimeout(function () {
            res(new APromiseUser(555));
        }, 1200);
    });
    return typeson.stringifyAsync(x).then(function (tson) {
        console.log(tson);
        var back = typeson.parse(tson);
        assert(
            back instanceof APromiseUser &&
                back.a === 555,
            "Should have resolved the one nested promise value");
    });
}, function shouldAllowMultiplePromiseResolution() {
    var typeson = new Typeson();
    var x = [Typeson.Promise.resolve(5), 100, new Typeson.Promise(function (res) {
        setTimeout(function () {
            res(25);
        }, 500);
    })];
    return typeson.stringifyAsync(x).then(function (tson) {
        console.log(tson);
        var back = typeson.parse(tson);
        assert(back[0] === 5 && back[1] === 100 && back[2] === 25, "Should have resolved multiple promise values (and in the proper order)");
    });
}, function shouldAllowNestedPromiseResolution () {
    function APromiseUser (a) {this.a = a;}
    var typeson = new Typeson().register({
        Date: [
            function (x) { return x instanceof Date; },
            function (date) { return date.getTime(); },
            function (time) { return new Date(time); }
        ],
        PromiseUser: [
            function (x) { return x instanceof APromiseUser; },
            function (o) { return new Typeson.Promise(function (res) {
                setTimeout(function () {
                    res(o.a);
                }, 300);
            })},
            function (val) { return new APromiseUser(val) }
        ]
    });
    var x = [
        Typeson.Promise.resolve(5),
        100,
        new Typeson.Promise(function (res) {
            setTimeout(function () {
                res(25);
            }, 500);
        }),
        new Typeson.Promise(function (res) {
                setTimeout(function () {
                    res(Typeson.Promise.resolve(5));
                });
            }).then(function (r) {
                return new Typeson.Promise(function (res) {
                    setTimeout(function () {
                        res(r + 90);
                    }, 10);
                });
            }),
        Typeson.Promise.resolve(new Date()),
        new Typeson.Promise (function (res) {
            setTimeout(function () {
                res(new APromiseUser(555));
            });
        })
    ];
    return typeson.stringifyAsync(x).then(function (tson) {
        console.log(tson);
        var back = typeson.parse(tson);
        assert(
            back[0] === 5 &&
                back[1] === 100 &&
                back[2] === 25 &&
                back[3] === 95 &&
                back[4] instanceof Date &&
                back[5] instanceof APromiseUser &&
                back[5].a === 555,
            "Should have resolved multiple nested promise values (and in the proper order)"
        );
    });
}, function shouldAllowForcingOfAsyncReturn () {
    var typeson = new Typeson({sync: false, throwOnBadSyncType: false});
    var x = 5;
    return typeson.stringify(x).then(function (tson) {
        console.log(tson);
        var back = typeson.parse(tson);
        assert(back === 5, "Should allow async to be forced even without async return values");
    });
}, function shouldWorkWithPromiseUtilities () {
    function makePromises () {
        var x = new Typeson.Promise(function (res) {
            setTimeout(function () {
                res(30);
            }, 50);
        });
        var y = Typeson.Promise.resolve(400);
        return [x, y];
    }
    return new Promise(function (testRes, testRej) {
        Typeson.Promise.all(makePromises()).then(function (results) {
            assert(results[0] === 30 && results[1] === 400, "Should work with Promise.all");
        }).then(function () {
            return Typeson.Promise.race(makePromises()).then(function (results) {
                assert(results === 400, "Should work with Promise.race");
                testRes();
            })
        });
    });
}, function shouldProperlyHandlePromiseExceptions () {
    function makeRejectedPromises () {
        var x = new Typeson.Promise(function (res, rej) {
            setTimeout(function () {
                rej(30);
            }, 50);
        });
        var y = new Typeson.Promise(function (res, rej) {
            setTimeout(function () {
                res(500);
            }, 500);
        });
        return [x, y];
    }
    return new Promise(function (testRes, testRej) {
        makeRejectedPromises()[0].then(null, function (errCode) {
            assert(errCode === 30, "`Typeson.Promise` should work with `then(null, onRejected)`");
            return Typeson.Promise.reject(400);
        }).catch(function (errCode) {
            assert(errCode === 400, "`Typeson.Promise` should work with `catch`");
            return Typeson.Promise.all(makeRejectedPromises());
        }).catch(function (errCode) {
            assert(errCode === 30, "Promise.all should work with rejected promises");
            return Typeson.Promise.race(makeRejectedPromises());
        }).catch(function (errCode) {
            assert(errCode === 30, "Promise.race should work with rejected promises");
            return new Typeson.Promise(function () {
                throw new Error('Sync throw');
            });
        }).catch(function (err) {
            assert(err.message === 'Sync throw', "Typeson.Promise should work with synchronous throws");
            return Typeson.Promise.resolve(55);
        }).then(null, function () {
            throw new Error('Should not reach here');
        }).then(function (res) {
            assert(res === 55, "Typeson.Promises should bypass `then` without `onResolved`");
            return Typeson.Promise.reject(33);
        }).then(function () {
            throw new Error('Should not reach here');
        }).catch(function (errCode) {
            assert(errCode === 33, "Typeson.Promises should bypass `then` when rejecting");
            testRes();
        });
    });
}, function asyncREADMEExample () {
    function MyAsync (prop) {
        this.prop = prop;
    }

    var typeson = new Typeson({sync: false}).register({
        myAsyncType: [
            function (x) { return x instanceof MyAsync;},
            function (o) {
                return new Typeson.Promise(function (resolve, reject) {
                    setTimeout(function () { // Do something more useful in real code
                        resolve(o.prop);
                    }, 800);
                });
            },
            function (data) {
                return new MyAsync(data);
            }
        ]
    });

    var mya = new MyAsync(500);
    return typeson.stringify(mya).then(function (result) {
        var back = typeson.parse(result, null, {sync: true});
        assert(back.prop === 500, "Example of MyAsync should work"); // 500
    });
}, function shouldWorkWithAsyncStringify () {
    function MyAsync (prop) {
        this.prop = prop;
    }

    var typeson = new Typeson().register({
        myAsyncType: [
            function (x) { return x instanceof MyAsync;},
            function (o) {
                return new Typeson.Promise(function (resolve, reject) {
                    setTimeout(function () { // Do something more useful in real code
                        resolve(o.prop);
                    }, 800);
                });
            },
            function (data) {
                return new MyAsync(data);
            }
        ]
    });

    var mya = new MyAsync(500);
    return typeson.stringifyAsync(mya).then(function (result) {
        var back = typeson.parse(result);
        assert(back.prop === 500, "Example of MyAsync should work"); // 500
        return typeson.stringifyAsync({prop: 5}, null, null, {throwOnBadSyncType: false});
    }).then(function (result) {
        var back = typeson.parse(result);
        assert(back.prop === 5, "Example of synchronously-resolved simple object should work with async API");
    });
}, function shouldWorkWithAsyncEncapsulate () {
    function MyAsync (prop) {
        this.prop = prop;
    }

    var typeson = new Typeson().register({
        myAsyncType: [
            function (x) { return x instanceof MyAsync;},
            function (o) {
                return new Typeson.Promise(function (resolve, reject) {
                    setTimeout(function () { // Do something more useful in real code
                        resolve(o.prop);
                    }, 800);
                });
            },
            function (data) {
                return new MyAsync(data);
            }
        ]
    });

    var mya = new MyAsync(500);
    return typeson.encapsulateAsync(mya).then(function (result) {
        assert(result.$ === 500 && result.$types.$[''] === 'myAsyncType', "Example of MyAsync should work");
        return typeson.encapsulateAsync({prop: 5}, null, {throwOnBadSyncType: false});
    }).then(function (result) {
        assert(result.prop === 5, "Example of synchronously-resolved simple object should work with async API");
    });
}]);
