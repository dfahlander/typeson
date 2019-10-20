/* eslint-disable no-console, no-restricted-syntax,
    jsdoc/require-jsdoc, no-empty-function, no-shadow */
import '../node_modules/core-js-bundle/minified.js';
import '../node_modules/regenerator-runtime/runtime.js';

import Typeson from '../dist/typeson-esm.js';
import * as B64 from
    '../node_modules/base64-arraybuffer-es6/dist/base64-arraybuffer-es.js';

const typeson = new Typeson().register({
    Date: [
        function (x) { return x instanceof Date; },
        function (date) { return date.getTime(); },
        function (time) { return new Date(time); }
    ],
    Error: [
        function (x) { return x instanceof Error; },
        function (error) { return {name: error.name, message: error.message}; },
        function (data) {
            const e = new Error(data.message);
            e.name = data.name;
            return e;
        }
    ],
    SpecialNumber: [
        function (x) {
            return typeof x === 'number' &&
                (isNaN(x) || x === Infinity || x === -Infinity);
        },
        function (n) {
            return isNaN(n) ? 'NaN' : n > 0 ? 'Infinity' : '-Infinity';
        },
        function (s) {
            return {NaN, Infinity, '-Infinity': -Infinity}[s];
        }
    ],
    ArrayBuffer: [
        function test (x) { return Typeson.toStringTag(x) === 'ArrayBuffer'; },
        function encapsulate (b) { return B64.encode(b); },
        function revive (b64) { return B64.decode(b64); }
    ],
    DataView: [
        function (x) { return x instanceof DataView; },
        function (dw) {
            return {
                buffer: dw.buffer,
                byteOffset: dw.byteOffset,
                byteLength: dw.byteLength
            };
        },
        function (obj) {
            return new DataView(obj.buffer, obj.byteOffset, obj.byteLength);
        }
    ]
});

const globalTypeson = typeson;

// The test framework I need:
function assert (x, msg) {
    if (!x) {
        throw new Error(msg);
    }
    msg = '  OK: ' + msg;
    if (typeof document !== 'undefined') {
        document.body.append(
            msg, ...Array.from({length: 2}, () => document.createElement('br'))
        );
    }
    console.log(msg);
}
function run (tests) {
    if (!tests.length) {
        return undefined;
    }
    const test = tests.splice(0, 1)[0];
    console.log(' ');
    console.log('Running test: ' + test.name);
    const ret = test();
    if (Typeson.isThenable(ret)) {
        return ret.then(function () {
            return run(tests);
        }).catch(function (err) {
            console.log('Promise error in test ' + test.name + ': \n\t' + err);
        });
    }
    return run(tests);
}
function roundtrip (x) {
    const tson = typeson.stringify(x, null, 2);
    // console.log(tson);
    return typeson.parse(tson);
}

const tests = [function shouldSupportBasicTypes () {
    //
    // shouldSupportBasicTypes
    //
    let res = roundtrip({});
    assert(Object.keys(res).length === 0, 'Result should be empty');
    const date = new Date();
    const input = {
        a: 'a', b: 2, c () {}, d: false, e: null,
        f: Symbol('symbol'), g: [], h: date, i: /apa/gui
    };
    res = roundtrip(input);
    assert(res !== input, 'Object is a clone, not a reference');
    assert(res.a === 'a', 'String value');
    assert(res.b === 2, 'Number value');
    assert(!res.c, 'Functions should not follow by default');
    assert(res.d === false, 'Boolean value');
    assert(res.e === null, 'Null value');
    assert(!res.f, 'Symbols should not follow by default');
    assert(Array.isArray(res.g) && res.g.length === 0, 'Array value');
    assert(
        res.h instanceof Date && res.h.toString() === date.toString(),
        'Date value'
    );
    assert(
        Object.keys(res.i).length === 0,
        'regex only treated as empty object by default'
    );
}, function shouldResolveNestedObjects () {
    const input = {a: [{subA: 5}, [6, 7]], b: {subB: {c: 8}}};
    const res = roundtrip(input);
    assert(res.a[0].subA === 5, 'Object within array');
    assert(res.a[1][0] === 6, 'Array within array');
    assert(res.a[1][1] === 7, 'Array within array');
    assert(res.b.subB.c === 8, 'Object within object');
}, function shouldSupportObjectAPI () {
    const typeson = new Typeson().register({
        Date: {
            test (x) { return x instanceof Date; },
            replace (date) { return date.getTime(); },
            revive (time) { return new Date(time); }
        }
    });
    const date = new Date();
    const tson = typeson.stringify(date, null, 2);
    // console.log(tson);
    const back = typeson.parse(tson);
    assert(
        back instanceof Date && back.toString() === date.toString(),
        'Date value'
    );
}, function shouldSupportObjectsContainingInternallyUsedProperties () {
    function test (data, cb) {
        const tson = typeson.stringify(data, null, 2);
        console.log(tson);
        const result = typeson.parse(tson);
        cb(result);
    }
    function valSwitch (val) {
        test({$types: val}, function (result) {
            assert(
                result.$types === val &&
                    Object.keys(result).length === 1,
                'Preserves $types on original object without additions'
            );
        });
        test({$: val}, function (result) {
            assert(
                result.$ === val && Object.keys(result).length === 1,
                'Preserves $ on original object without additions'
            );
        });
        test({$: val, $types: val}, function (result) {
            assert(
                result.$ === val &&
                    result.$types === val &&
                    Object.keys(result).length === 2,
                'Preserves $ and $types values on original ' +
                  'object without additions'
            );
        });
    }
    valSwitch(true);
    valSwitch(false);
    test(
        {$: {}, $types: {$: {'': 'val', cyc: '#'}, '#': 'a1', '': 'b1'}},
        function (result) {
            assert(
                typeof result.$ === 'object' &&
                    !Object.keys(result.$).length &&
                    result.$types.$[''] === 'val' &&
                    result.$types.$.cyc === '#' &&
                    result.$types['#'] === 'a1' &&
                    result.$types[''] === 'b1' &&
                    Object.keys(result.$types).length === 3,
                'Preserves $ and $types subobjects on original ' +
                    'object without additions'
            );
        }
    );
    test({a: new Date(), $types: {}}, function (result) {
        assert(
            result.a instanceof Date &&
                !('$' in result) &&
                typeof result.$types === 'object' &&
                !Object.keys(result.$types).length,
            'Roundtrips type while preserving $types subobject ' +
                'from original object without additions'
        );
    });
    test({a: new Date(), $: {}}, function (result) {
        assert(
            result.a instanceof Date &&
                !('$types' in result) &&
                typeof result.$ === 'object' &&
                !Object.keys(result.$).length,
            'Roundtrips type while preserving $ subobject from ' +
                'original object without additions'
        );
    });
    test({a: new Date(), $types: {}, $: {}}, function (result) {
        assert(
            result.a instanceof Date &&
                typeof result.$types === 'object' &&
                !Object.keys(result.$types).length &&
                typeof result.$ === 'object' &&
                !Object.keys(result.$).length,
            'Roundtrips type while preserving $ and $types subobjects ' +
                'from original object without additions'
        );
    });
    function valSwitch2 (val) {
        test({a: new Date(), $types: val}, function (result) {
            assert(
                result.a instanceof Date &&
                    !('$' in result) &&
                    result.$types === val,
                'Roundtrips type while preserving $types value ' +
                    'from original object'
            );
        });
        test({a: new Date(), $: val}, function (result) {
            assert(
                result.a instanceof Date &&
                    !('$types' in result) &&
                    result.$ === val,
                'Roundtrips type while preserving $ value from original object'
            );
        });
        test({a: new Date(), $types: val, $: val}, function (result) {
            assert(
                result.a instanceof Date &&
                    result.$types === val &&
                    result.$ === val,
                'Roundtrips type while preserving $types and $ values ' +
                    'from original object'
            );
        });
    }
    valSwitch2(true);
    valSwitch2(false);
    test({a: new Date(), $: {}}, function (result) {
        assert(
            result.a instanceof Date &&
                !('$types' in result) &&
                typeof result.$ === 'object' &&
                !Object.keys(result.$).length,
            'Roundtrips type while preserving $ subojbect from original ' +
                'object without additions'
        );
    });
}, function disallowsHashType () {
    let caught = false;
    try {
        new Typeson().register({'#': [
            function () {}, function () {}, function () {}
        ]});
    } catch (err) {
        caught = true;
    }
    assert(
        caught,
        "Should throw on attempting to register the reserved 'type', '#'"
    );
}, function disallowsJSONTypeNames () {
    const ok = [
        'null', 'boolean', 'number', 'string', 'array', 'object'
    ].every((type) => {
        let caught = false;
        try {
            new Typeson().register({
                [type]: [function () {}, function () {}, function () {}]
            });
        } catch (err) {
            caught = true;
        }
        return caught;
    });
    assert(
        ok,
        'Should throw on attempting to register the reserved JSON ' +
            'object type names'
    );
}, function shouldHandlePathSeparatorsInObjects () {
    const input = {
        aaa: {
            bbb: new Date(91000000000)
        },
        'aaa.bbb': 2,

        lll: {
            mmm: 3
        },
        'lll.mmm': new Date(92000000000),

        'qqq.rrr': 4,
        qqq: {
            rrr: new Date(93000000000)
        },

        yyy: {
            zzz: 5
        },
        'yyy.zzz': new Date(94000000000),

        allNormal1: {
            a: 100
        },
        'allNormal1.a': 200,

        allTyped1: {
            a: new Date(95000000000)
        },
        'allTyped1.a': new Date(96000000000),

        'allNormal2.b': 400,
        allNormal2: {
            b: 500
        },

        allTyped2: {
            b: new Date(97000000000)
        },
        'allTyped2.b': new Date(98000000000),

        'A~': 'abc',
        'A~1': 'ghi',
        'A~0': 'def',
        'A.': 'jkl',
        'B~': new Date(99100000000),
        'B~0': new Date(99200000000),
        'B~1': new Date(99300000000),
        'B.': new Date(99400000000)
    };
    const res = roundtrip(input);
    assert(
        res.aaa.bbb instanceof Date && res['aaa.bbb'] === 2 &&
        res.aaa.bbb.getTime() === 91000000000,
        'Properties with periods (with type) after normal ' +
            'properties (without type)'
    );
    assert(
        res['lll.mmm'] instanceof Date && res.lll.mmm === 3 &&
        res['lll.mmm'].getTime() === 92000000000,
        'Properties with periods (without type) after normal ' +
            'properties (with type)'
    );
    assert(
        res.qqq.rrr instanceof Date && res['qqq.rrr'] === 4 &&
        res.qqq.rrr.getTime() === 93000000000,
        'Properties with periods (without type) before normal ' +
            'properties (with type)'
    );
    assert(
        res['yyy.zzz'] instanceof Date && res.yyy.zzz === 5 &&
        res['yyy.zzz'].getTime() === 94000000000,
        'Properties with periods (with type) before normal ' +
            'properties (without type)'
    );
    assert(
        res.allNormal1.a === 100 && res['allNormal1.a'] === 200,
        'Properties with periods (without type) after normal ' +
            'properties (without type)'
    );
    assert(
        res.allTyped1.a instanceof Date && res['allTyped1.a'] instanceof Date &&
            res.allTyped1.a.getTime() === 95000000000 &&
                res['allTyped1.a'].getTime() === 96000000000,
        'Properties with periods (with type) after normal ' +
            'properties (with type)'
    );
    assert(
        res.allNormal2.b === 500 && res['allNormal2.b'] === 400,
        'Properties with periods (without type) before normal ' +
            'properties (without type)'
    );

    assert(
        res.allTyped2.b instanceof Date && res['allTyped2.b'] instanceof Date &&
            res.allTyped2.b.getTime() === 97000000000 &&
                res['allTyped2.b'].getTime() === 98000000000,
        'Properties with periods (with type) after normal ' +
            'properties (with type)'
    );
    assert(
        res['A~'] === 'abc' &&
        res['A~0'] === 'def' &&
        res['A~1'] === 'ghi' &&
        res['A.'] === 'jkl' &&
        res['B~'] instanceof Date && res['B~'].getTime() === 99100000000 &&
        res['B~0'] instanceof Date && res['B~0'].getTime() === 99200000000 &&
        res['B~1'] instanceof Date && res['B~1'].getTime() === 99300000000 &&
        res['B.'] instanceof Date && res['B.'].getTime() === 99400000000,
        'Find properties with escaped and unescaped characters'
    );
}, function shouldResolveCyclics () {
    //
    // shouldResolveCyclics
    //
    const data = {list: []};
    for (let i = 0; i < 10; ++i) {
        data.list.push({
            name: 'name' + i,
            parent: data.list,
            root: data,
            children: []
        });
    }
    data.list[3].children = [data.list[0], data.list[1]];

    const tson = typeson.stringify(data, null, 2);
    // console.log(tson);
    const result = typeson.parse(tson);

    assert(result.list.length === 10, 'result.list.length should be 10');
    assert(
        result.list[3].children.length === 2,
        'result.list[3] should have 2 children'
    );
    assert(
        result.list[3].children[0] === result.list[0],
        'First child of result.list[3] should be result.list[0]'
    );
}, function shouldResolveCyclics2 () {
    //
    // shouldResolveCyclics2
    //

    const kalle = {name: 'Kalle', age: 33};
    const input = [kalle, kalle, kalle];
    const tson = typeson.stringify(input);
    // console.log (tson.match(/Kalle/g).length);
    console.log(tson);
    assert(
        tson.match(/Kalle/gu).length === 1,
        "TSON should only contain one 'Kalle'. The others should " +
            'just reference the first'
    );
    const result = typeson.parse(tson);
    assert(
        result[0] === result[1] && result[1] === result[2],
        'The resulting object should also just have references ' +
            'to the same object'
    );
}, function shouldResolveCyclicArrays () {
    const recursive = [];
    recursive.push(recursive);
    let tson = typeson.stringify(recursive);
    let result = typeson.parse(tson);
    assert(result === result[0], 'array directly contains self');

    const recursive2 = [];
    recursive2.push([recursive2]);
    tson = typeson.stringify(recursive2);
    result = typeson.parse(tson);
    assert(
        result !== result[0] && result === result[0][0],
        'array indirectly contains self'
    );

    const recursive3 = [recursive];
    tson = typeson.stringify(recursive3);
    console.log(tson);
    result = typeson.parse(tson);
    assert(
        result !== result[0] && result !== result[0][0] &&
            result[0] === result[0][0],
        'array member contains self'
    );

    const recursive4 = [1, recursive];
    tson = typeson.stringify(recursive4);
    console.log(tson);
    result = typeson.parse(tson);
    assert(
        result !== result[1] && result !== result[1][0] &&
            result[1] === result[1][0],
        'array member contains self'
    );
}, function shouldResolveCyclicObjectMembers () {
    // eslint-disable-next-line sonarjs/prefer-object-literal
    const recursive = {};
    recursive.b = recursive;
    const recursiveContainer = {a: recursive};
    const tson = typeson.stringify(recursiveContainer);
    console.log(tson);
    const result = typeson.parse(tson);
    assert(
        result !== result.a && result !== result.b &&
            result.a === result.a.b,
        'Object property contains self'
    );
}, function shouldNotResolveCyclicsIfNotWanted () {
    //
    // shouldNotResolveCyclicsIfNotWanted
    //

    const kalle = {name: 'Kalle', age: 33};
    const input = [kalle, kalle, kalle];
    const typeson = new Typeson({cyclic: false});
    const tson = typeson.stringify(input);
    const json = JSON.stringify(input);
    assert(
        tson === json,
        'TSON should be identical to JSON because the input is ' +
            'simple and the cyclics of the input should be ignored'
    );
}, function shouldSupportArrays () {
    //
    // shouldSupportArrays
    //
    const res = roundtrip([1, new Date(), 3]);
    assert(Array.isArray(res), 'Result should be an array');
    assert(res.length === 3, 'Should have length 3');
    assert(res[2] === 3, 'Third item should be 3');
}, function shouldSupportIntermediateTypes () {
    function CustomDate (date) {
        this._date = date;
    }
    const typeson = new Typeson()
        .register(globalTypeson.types)
        .register({
            CustomDate: [
                (x) => x instanceof CustomDate,
                (cd) => cd._date,
                (date) => new CustomDate(date)
            ]
        });
    const date = new Date();
    const input = new CustomDate(new Date());
    const tson = typeson.stringify(input);
    console.log(tson);
    const back = typeson.parse(tson);
    assert(back instanceof CustomDate, 'Should get CustomDate back');
    assert(
        back._date.getTime() === date.getTime(),
        'Should have correct value'
    );
}, function shouldRunReplacersRecursively () {
    //
    // shouldRunReplacersRecursively
    //
    function CustomDate (date, name) {
        this._date = date;
        this.name = name;
        this.year = date.getFullYear();
    }
    CustomDate.prototype.getRealDate = function () {
        return this._date;
    };
    CustomDate.prototype.getName = function () {
        return this.name;
    };

    const date = new Date();

    const input = {
        name: 'Karl',
        date: new CustomDate(date, 'Otto')
    };

    const typeson = new Typeson()
        .register(globalTypeson.types)
        .register({
            CustomDate: [
                (x) => x instanceof CustomDate,
                (cd) => ({_date: cd.getRealDate(), name: cd.name}),
                (obj) => new CustomDate(obj._date, obj.name)
            ]
        });
    const tson = typeson.stringify(input, null, 2);
    console.log(tson);
    const result = typeson.parse(tson);
    assert(result.name === 'Karl', 'Basic prop');
    assert(
        result.date instanceof CustomDate,
        'Correct instance type of custom date'
    );
    assert(
        result.date.getName() === 'Otto',
        'prototype method works and properties seems to be in place'
    );
    assert(
        result.date.getRealDate().getTime() === date.getTime(),
        'The correct time is there'
    );
}, function shouldBeAbleToStringifyComplexObjectsAtRoot () {
    const x = roundtrip(new Date(3));
    assert(x instanceof Date, 'x should be a Date');
    assert(x.getTime() === 3, 'Time should be 3');
    const y = roundtrip([new Date(3)]);
    assert(y[0] instanceof Date, 'y[0] should be a Date');
    assert(y[0].getTime() === 3, 'Time should be 3');

    function Custom () {
        this.x = 'oops';
    }

    let TSON = new Typeson().register({
        Custom: [
            (x) => x instanceof Custom,
            (s) => false,
            (f) => new Custom()
        ]
    });
    let tson = TSON.stringify(new Custom());
    console.log(tson);
    let z = TSON.parse(tson);
    assert(
        z instanceof Custom && z.x === 'oops',
        'Custom type encapsulated in bool should work'
    );

    TSON = new Typeson().register({
        Custom: [
            (x) => x instanceof Custom,
            (s) => 42,
            (f) => new Custom()
        ]
    });
    tson = TSON.stringify(new Custom());
    console.log(tson);
    z = TSON.parse(tson);
    assert(
        z instanceof Custom && z.x === 'oops',
        'Custom type encapsulated in bool should work'
    );

    TSON = new Typeson().register({
        Custom: [
            (x) => x instanceof Custom,
            (s) => 'foo',
            (f) => new Custom()
        ]
    });
    tson = TSON.stringify(new Custom());
    console.log(tson);
    z = TSON.parse(tson);
    assert(
        z instanceof Custom && z.x === 'oops',
        'Custom type encapsulated in bool should work'
    );
}, function shouldBePossibleToEncapsulateObjectWithReserved$typesProperty () {
    function Custom (val, $types) {
        this.val = val;
        this.$types = $types;
    }
    const typeson = new Typeson().register({
        Custom: [
            (x) => x instanceof Custom,
            (c) => ({val: c.val, $types: c.$types}),
            (o) => new Custom(o.val, o.$types)
        ]
    });
    const input = new Custom('bar', 'foo');

    const tson = typeson.stringify(input);
    console.log(tson);
    const x = typeson.parse(tson);
    assert(x instanceof Custom, 'Should get a Custom back');
    assert(x.val === 'bar', 'Should have correct val value');
    assert(x.$types === 'foo', 'Should have correct $types value');
}, function shouldLeaveLeftOutType () {
    // Uint8Buffer is not registered.
}, function shouldResolveCyclicsInEncapsulatedObjects () {
    const buf = new ArrayBuffer(16);
    const data = {
        buf,
        bar: {
            data: new DataView(buf, 8, 8)
        }
    };
    const tson = typeson.stringify(data, null, 2);
    console.log(tson);
    const back = typeson.parse(tson);
    assert(
        back.buf === back.bar.data.buffer,
        'The buffers point to same object'
    );
}, function shouldSupportRegisteringAClassWithoutReplacerOrReviver () {
    function MyClass () {}
    const TSON = new Typeson().register({MyClass});
    const x = new MyClass();
    x.hello = 'world';
    const tson = TSON.stringify(x);
    console.log(tson);
    const back = TSON.parse(tson);
    assert(back instanceof MyClass, 'Should revive to a MyClass instance.');
    assert(back.hello === 'world', 'Should have all properties there.');
}, function shouldExecuteReplacersInProperOrder () {
    function Person () {}
    const john = new Person();
    const typeson = new Typeson().register([
        {specificClassFinder: [
            (x) => x instanceof Person, () => 'specific found'
        ]},
        {genericClassFinder: [
            (x) => x && typeof x === 'object', () => 'general found'
        ]}
    ]);
    const clonedData = typeson.parse(typeson.stringify(john));
    // Todo: Change the expected result to 'specific found' if
    //   reimplementing in non-reverse order
    assert(
        clonedData === 'general found',
        'Should execute replacers in proper order'
    );
}, function shouldRunEncapsulateObserverSync () {
    const expected = '{\n' +
'    time: 959000000000\n' +
'    vals: [\n' +
'        0: null\n' +
'        1: undefined\n' +
'        2: 5\n' +
'        3: str\n' +
'    ]\n' +
'    cyclicInput: #\n' +
'}\n';
    let str = '';
    let indentFactor = 0;
    const indent = function () {
        return new Array(indentFactor * 4 + 1).join(' ');
    };
    const typeson = new Typeson({
        encapsulateObserver (o) {
            if (o.typeDetected || o.replacing) {
                return;
            }
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
                    str += indent() +
                        (o.keypath ? o.keypath + ': ' : '') +
                        '[\n';
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
            const idx = o.keypath.lastIndexOf('.') + 1;
            str += indent() + o.keypath.slice(idx) + ': ' +
                ('replaced' in o ? o.replaced : o.value) + '\n';
        }
    })
        .register(globalTypeson.types);
    const input = {
        time: new Date(959000000000),
        vals: [null, undefined, 5, 'str']
    };
    input.cyclicInput = input;
    /* const tson = */ typeson.encapsulate(input);
    // console.log(str);
    // console.log(expected);
    assert(str === expected, 'Observer able to reduce JSON to expected string');
}, function encapsulateObserverShouldObserveTypes () {
    const actual = [];
    const expected = [
        'object', 'Date', 'array', 'null', 'undefined', 'number', 'string'
    ];
    const typeson = new Typeson({
        encapsulateObserver (o) {
            if (o.typeDetected || o.replacing) {
                return;
            }
            if (o.cyclic !== 'readonly' && !o.end) {
                actual.push(o.type);
            }
        }
    }).register({
        Date: [
            function (x) { return x instanceof Date; },
            function (date) { return date.getTime(); },
            function (time) { return new Date(time); }
        ]
    });
    const input = {
        time: new Date(959000000000),
        vals: [null, undefined, 5, 'str']
    };
    /* const tson = */ typeson.encapsulate(input);
    assert(
        actual.length === expected.length &&
            actual.every((type, i) => type === expected[i]),
        'Should report primitive and compound types'
    );
}, function shouldRunEncapsulateObserverAsync () {
    let str = '';
    const placeholderText = '(Please wait for the value...)';
    function APromiseUser (a) { this.a = a; }
    const typeson = new Typeson({
        encapsulateObserver (o) {
            if (o.typeDetected || o.replacing) {
                return;
            }

            const isObject = o.value && typeof o.value === 'object';
            const isArray = Array.isArray(o.value);
            if (o.resolvingTypesonPromise) {
                const idx = str.indexOf(placeholderText);
                const start = str.slice(0, idx);
                const end = str.slice(idx + placeholderText.length);
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
            function (o) {
                return new Typeson.Promise(function (res) {
                    setTimeout(function () {
                        res(o.a);
                    }, 300);
                });
            },
            function (val) { return new APromiseUser(val); }
        ]
    });
    const input = ['aaa', new APromiseUser(5), 'bbb'];

    const prom = typeson.encapsulateAsync(input).then(function (encaps) {
        const back = typeson.parse(JSON.stringify(encaps));
        assert(
            back[0] === input[0] &&
            back[2] === input[2] &&
            back[1] instanceof APromiseUser &&
                back[1].a === 5,
            'Should have resolved the one nested promise value'
        );
        // console.log(str);
        assert(
            str === '<span>aaa</span><span>5</span><span>bbb</span>',
            'Should have allowed us to run the callback asynchronously ' +
                '(where we can substitute a placeholder)'
        );
        return undefined;
    });
    assert(
        str === '<span>aaa</span><span>' + placeholderText +
            '</span><span>bbb</span>',
        'Should have allowed us to run the callback synchronously ' +
            '(where we add a placeholder)'
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

    const typeson = new Typeson().register({
        iterateIn: {
            test (x, stateObj) {
                if (x instanceof A) {
                    stateObj.iterateIn = x.isArr ? 'array' : 'object';
                    return true;
                }
                return false;
            }
        }
    });

    const B = createExtendingClass(5);

    let b = new B(7);
    let tson = typeson.stringify(b);
    console.log(tson);
    let back = typeson.parse(tson);
    assert(!Array.isArray(back), 'Is not an array');
    assert(back[3] === 4, 'Has numeric property');
    assert(back.a === 5, "Got inherited 'a' property");
    assert(back.b === 7, "Got own 'b' property");

    b = new B(8, true);
    tson = typeson.stringify(b);
    console.log(tson);
    back = typeson.parse(tson);
    assert(Array.isArray(back), 'Is an array');
    assert(back[3] === 4, 'Has numeric property');
    assert(!('a' in back), "'a' property won't survive array stringification");
    assert(!('b' in back), "'b' property won't survive array stringification");
}, function executingToJSON () {
    function A () {}
    A.prototype.toJSON = function () { return 'abcd'; };
    let typeson = new Typeson();
    let a = new A(); // Encapsulated as is
    let tson = typeson.stringify(a);
    console.log(tson);
    let back = typeson.parse(tson);
    assert(back === 'abcd', 'Should have executed `toJSON`');

    typeson = new Typeson();
    a = { // Plain object rebuilt during encapsulation including with `toJSON`
        toJSON () { return 'abcd'; }
    };
    tson = typeson.stringify(a);
    console.log(tson);
    back = typeson.parse(tson);
    assert(back === 'abcd', 'Should have executed `toJSON`');
}, function shouldAllowPlainObjectReplacements () {
    const typeson = new Typeson().register({
        plainObj: {
            testPlainObjects: true,
            test (x) {
                return 'nonenum' in x;
            },
            replace (o) {
                return {
                    b: o.b,
                    nonenum: o.nonenum
                };
            }
        }
    });
    const a = {b: 5};
    Object.defineProperty(a, 'nonenum', {
        enumerable: false,
        value: 100
    });

    const tson = typeson.stringify(a);
    console.log(tson);
    const back = typeson.parse(tson);
    assert(back.b === 5, 'Should have kept property');
    assert(back.nonenum === 100, 'Should have kept non-enumerable property');
    assert(
        {}.propertyIsEnumerable.call(back, 'nonenum'),
        'Non-enumerable property should now be enumerable'
    );
}, function shouldAllowSinglePromiseResolution () {
    const typeson = new Typeson();
    const x = new Typeson.Promise(function (res) {
        setTimeout(function () {
            res(25);
        }, 500);
    });
    return typeson.stringifyAsync(x).then(function (tson) {
        console.log(tson);
        const back = typeson.parse(tson);
        assert(back === 25, 'Should have resolved the one promise value');
        return undefined;
    });
}, function shouldAllowSingleNestedPromiseResolution () {
    function APromiseUser (a) { this.a = a; }
    const typeson = new Typeson().register({
        Date: [
            function (x) { return x instanceof Date; },
            function (date) { return date.getTime(); },
            function (time) { return new Date(time); }
        ],
        PromiseUser: [
            function (x) { return x instanceof APromiseUser; },
            function (o) {
                return new Typeson.Promise(function (res) {
                    setTimeout(function () {
                        res(o.a);
                    }, 300);
                });
            },
            function (val) { return new APromiseUser(val); }
        ]
    });
    const x = new Typeson.Promise(function (res) {
        setTimeout(function () {
            res(new APromiseUser(555));
        }, 1200);
    });
    return typeson.stringifyAsync(x).then(function (tson) {
        console.log(tson);
        const back = typeson.parse(tson);
        assert(
            back instanceof APromiseUser &&
                back.a === 555,
            'Should have resolved the one nested promise value'
        );
        return undefined;
    });
}, function shouldAllowMultiplePromiseResolution () {
    const typeson = new Typeson();
    const x = [
        Typeson.Promise.resolve(5),
        100,
        new Typeson.Promise(function (res) {
            setTimeout(function () {
                res(25);
            }, 500);
        })
    ];
    return typeson.stringifyAsync(x).then(function (tson) {
        console.log(tson);
        const back = typeson.parse(tson);
        assert(
            back[0] === 5 && back[1] === 100 && back[2] === 25,
            'Should have resolved multiple promise values (and ' +
                'in the proper order)'
        );
        return undefined;
    });
}, function shouldAllowNestedPromiseResolution () {
    function APromiseUser (a) { this.a = a; }
    const typeson = new Typeson().register({
        Date: [
            function (x) { return x instanceof Date; },
            function (date) { return date.getTime(); },
            function (time) { return new Date(time); }
        ],
        PromiseUser: [
            function (x) { return x instanceof APromiseUser; },
            function (o) {
                return new Typeson.Promise(function (res) {
                    setTimeout(function () {
                        res(o.a);
                    }, 300);
                });
            },
            function (val) { return new APromiseUser(val); }
        ]
    });
    const x = [
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
        new Typeson.Promise(function (res) {
            setTimeout(function () {
                res(new APromiseUser(555));
            });
        })
    ];
    return typeson.stringifyAsync(x).then(function (tson) {
        console.log(tson);
        const back = typeson.parse(tson);
        assert(
            back[0] === 5 &&
                back[1] === 100 &&
                back[2] === 25 &&
                back[3] === 95 &&
                back[4] instanceof Date &&
                back[5] instanceof APromiseUser &&
                back[5].a === 555,
            'Should have resolved multiple nested promise ' +
                'values (and in the proper order)'
        );
        return undefined;
    });
}, function shouldAllowForcingOfAsyncReturn () {
    const typeson = new Typeson({sync: false, throwOnBadSyncType: false});
    const x = 5;
    return typeson.stringify(x).then(function (tson) {
        console.log(tson);
        const back = typeson.parse(tson);
        assert(
            back === 5,
            'Should allow async to be forced even without ' +
                'async return values'
        );
        return undefined;
    });
}, function shouldWorkWithPromiseUtilities () {
    function makePromises () {
        const x = new Typeson.Promise(function (res) {
            setTimeout(function () {
                res(30);
            }, 50);
        });
        const y = Typeson.Promise.resolve(400);
        return [x, y];
    }
    // eslint-disable-next-line promise/avoid-new
    return new Promise(function (resolve, reject) {
        // eslint-disable-next-line promise/catch-or-return
        Typeson.Promise.all(makePromises()).then(function (results) {
            assert(
                // eslint-disable-next-line promise/always-return
                results[0] === 30 && results[1] === 400,
                'Should work with Promise.all'
            );
        }).then(function () {
            // eslint-disable-next-line promise/no-nesting
            return Typeson.Promise.race(
                makePromises()
            // eslint-disable-next-line promise/always-return
            ).then(function (results) {
                assert(results === 400, 'Should work with Promise.race');
                resolve();
            });
        });
    });
}, function shouldProperlyHandlePromiseExceptions () {
    function makeRejectedPromises () {
        const x = new Typeson.Promise(function (res, rej) {
            setTimeout(function () {
                rej(30);
            }, 50);
        });
        const y = new Typeson.Promise(function (res, rej) {
            setTimeout(function () {
                res(500);
            }, 500);
        });
        return [x, y];
    }
    // eslint-disable-next-line promise/avoid-new
    return new Promise(function (resolve, reject) {
        makeRejectedPromises()[0].then(null, function (errCode) {
            assert(
                errCode === 30,
                '`Typeson.Promise` should work with `then(null, onRejected)`'
            );
            return Typeson.Promise.reject(400);
        }).catch(function (errCode) {
            assert(
                errCode === 400,
                '`Typeson.Promise` should work with `catch`'
            );
            return Typeson.Promise.all(makeRejectedPromises());
        }).catch(function (errCode) {
            assert(
                errCode === 30,
                'Promise.all should work with rejected promises'
            );
            return Typeson.Promise.race(makeRejectedPromises());
        }).catch(function (errCode) {
            assert(
                errCode === 30,
                'Promise.race should work with rejected promises'
            );
            return new Typeson.Promise(function () {
                throw new Error('Sync throw');
            });
        }).catch(function (err) {
            assert(
                err.message === 'Sync throw',
                'Typeson.Promise should work with synchronous throws'
            );
            return Typeson.Promise.resolve(55);
        }).then(null, function () {
            throw new Error('Should not reach here');
        }).then(function (res) {
            assert(
                res === 55,
                'Typeson.Promises should bypass `then` without `onResolved`'
            );
            return Typeson.Promise.reject(33);
        }).then(function () {
            throw new Error('Should not reach here');
        }).catch(function (errCode) {
            assert(
                errCode === 33,
                'Typeson.Promises should bypass `then` when rejecting'
            );
            resolve();
        });
    });
}, function asyncREADMEExample () {
    function MyAsync (prop) {
        this.prop = prop;
    }

    const typeson = new Typeson({sync: false}).register({
        myAsyncType: [
            function (x) { return x instanceof MyAsync; },
            function (o) {
                return new Typeson.Promise(function (resolve, reject) {
                    // Do something more useful in real code
                    setTimeout(function () {
                        resolve(o.prop);
                    }, 800);
                });
            },
            function (data) {
                return new MyAsync(data);
            }
        ]
    });

    const mya = new MyAsync(500);
    return typeson.stringify(mya).then(function (result) {
        const back = typeson.parse(result, null, {sync: true});
        assert(back.prop === 500, 'Example of MyAsync should work'); // 500
        return undefined;
    });
}, function shouldWorkWithAsyncStringify () {
    function MyAsync (prop) {
        this.prop = prop;
    }

    const typeson = new Typeson().register({
        myAsyncType: [
            function (x) { return x instanceof MyAsync; },
            function (o) {
                return new Typeson.Promise(function (resolve, reject) {
                    // Do something more useful in real code
                    setTimeout(function () {
                        resolve(o.prop);
                    }, 800);
                });
            },
            function (data) {
                return new MyAsync(data);
            }
        ]
    });

    const mya = new MyAsync(500);
    return typeson.stringifyAsync(mya).then(function (result) {
        const back = typeson.parse(result);
        assert(back.prop === 500, 'Example of MyAsync should work'); // 500
        return typeson.stringifyAsync({prop: 5}, null, null, {
            throwOnBadSyncType: false
        });
    }).then(function (result) {
        const back = typeson.parse(result);
        assert(
            back.prop === 5,
            'Example of synchronously-resolved simple object should ' +
                'work with async API'
        );
        return undefined;
    });
}, function shouldWorkWithAsyncEncapsulate () {
    function MyAsync (prop) {
        this.prop = prop;
    }

    const typeson = new Typeson().register({
        myAsyncType: [
            function (x) { return x instanceof MyAsync; },
            function (o) {
                return new Typeson.Promise(function (resolve, reject) {
                    // Do something more useful in real code
                    setTimeout(function () {
                        resolve(o.prop);
                    }, 800);
                });
            },
            function (data) {
                return new MyAsync(data);
            }
        ]
    });

    const mya = new MyAsync(500);
    return typeson.encapsulateAsync(mya).then(function (result) {
        assert(
            result.$ === 500 && result.$types.$[''] === 'myAsyncType',
            'Example of MyAsync should work'
        );
        return typeson.encapsulateAsync({prop: 5}, null, {
            throwOnBadSyncType: false
        });
    }).then(function (result) {
        assert(
            result.prop === 5,
            'Example of synchronously-resolved simple object should ' +
                'work with async API'
        );
        return undefined;
    });
}, function shouldTransmitStateThroughReplacersAndRevivers () {
    function ReplaceReviver (obj) {
        Object.defineProperty(this, 'obj', {
            enumerable: false,
            value: obj
        });
    }
    ReplaceReviver.prototype[Symbol.toStringTag] = 'ReplaceReviver';
    const typeson = new Typeson().register({
        replaceReviveContainer: {
            test (x) { return Typeson.toStringTag(x) === 'ReplaceReviver'; },
            replace (b, stateObj) {
                if (!stateObj.objs) {
                    stateObj.objs = [];
                }
                const index = stateObj.objs.indexOf(b.obj);
                if (index > -1) {
                    return {index};
                }
                stateObj.objs.push(b.obj);
                return {
                    obj: b.obj
                };
            },
            revive (o, stateObj) {
                if (!stateObj.objs) {
                    stateObj.objs = [];
                }
                if ('index' in o) {
                    return stateObj.objs[o.index];
                }
                const rr = new ReplaceReviver(o.obj);
                stateObj.objs.push(rr);
                return rr;
            }
        }
    });
    const rrObj1 = {value: 10};
    const rrObj2 = {value: 353};
    const rrObjXYZ = {value: 10};

    const rr1 = new ReplaceReviver(rrObj1);
    const rr2 = new ReplaceReviver(rrObj2);
    const rr3 = new ReplaceReviver(rrObj1);
    const rrXYZ = new ReplaceReviver(rrObjXYZ);
    const obj = {rr1, rr2, rr3, rrXYZ};
    const tson = typeson.stringify(obj);
    console.log(tson);
    const back = typeson.parse(tson);
    assert(back.rr1.obj.value === 10, 'Should preserve value (rr1)');
    assert(back.rr2.obj.value === 353, 'Should preserve value (rr2)');
    assert(back.rr3.obj.value === 10, 'Should preserve value (rr3)');
    assert(back.rrXYZ.obj.value === 10, 'Should preserve value (rrXYZ)');
    assert(back.rr1.obj === back.rr3.obj, 'Should preserve objects');
    assert(
        back.rr1.obj !== back.rrXYZ.obj,
        'Should not confuse objects where only value is the same'
    );
}, function shouldRetrieveSpecialTypeNames () {
    const typeson = new Typeson().register({
        Date: {
            test (x) { return x instanceof Date; },
            replace (date) { return date.getTime(); },
            revive (time) { return new Date(time); }
        }
    });
    const typeNames = typeson.specialTypeNames([
        5, new Date(), 'str', new Date()
    ]);
    assert(
        typeNames.length === 1 && typeNames[0] === 'Date',
        'Should only return (unique) special type names'
    );
}, function shouldRetrieveRootTypeName () {
    let runCount = 0;
    const typeson = new Typeson({
        encapsulateObserver (o) {
            runCount++;
        }
    }).register({
        Date: {
            test (x) { return x instanceof Date; },
            replace (date) { return date.getTime(); },
            revive (time) { return new Date(time); }
        }
    });
    const rootTypeName = typeson.rootTypeName([
        5, new Date(), 'str', new Date()
    ]);
    assert(rootTypeName === 'array', 'Should return the single root type name');
    assert(runCount === 1, 'Should not iterate through the array structure');
}, function shouldAllowSerializingArraysToObjects () {
    const typeson = new Typeson().register({
        arraysToObjects: {
            testPlainObjects: true,
            test (x, stateObj) {
                if (Array.isArray(x)) {
                    stateObj.iterateIn = 'object';
                    stateObj.addLength = true;
                    return true;
                }
                return false;
            },
            revive (o) {
                const arr = [];
                // No map here as may be a sparse array (including
                //   with `length` set)
                Object.entries(o).forEach(([key, val]) => {
                    arr[key] = val;
                });
                return arr;
            }
        }
    });
    const arr = new Array(10);
    arr[0] = 3;
    arr[3] = '4';
    arr[4] = 5;
    arr[6] = arr;
    arr[7] = [arr];
    arr[9] = {arr};
    arr.b = 'ddd';
    arr[-2] = 'eee';
    const tson = typeson.stringify(arr, null, 2);
    // console.log('tson', tson);
    const back = typeson.parse(tson);
    // console.log('back', back);
    // console.log('back[6]', Array.isArray(back[6]));
    // console.log('back[9].arr', Array.isArray(back[9].arr));
    assert(
        back[0] === 3 && back[3] === '4' && back[4] === 5,
        'Preserves regular array indexes'
    );
    assert(
        back.b === 'ddd' && back[-2] === 'eee',
        'Preserves non-numeric and non-positive-integer indexes'
    );
    assert(
        back[6] === back &&
        back[7][0] === back,
        'Preserves circular references'
    );
}];

(async () => {
const testLength = tests.length;

await run(tests);

if (typeof document !== 'undefined') {
    document.body.prepend(`Passed: ${testLength} tests`);
} else {
    console.log(`Passed: ${testLength} tests`);
}
})();
