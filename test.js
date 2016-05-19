var Typeson = require('./typeson');
var typeson = new Typeson();

// The test framework I need:
function assert (x, msg) {
    if (!x) throw new Error(msg);
    console.log("  OK: " + msg);
};
function run(tests){tests.forEach(function(test){
    console.log(" ");
    console.log("Running test: " + test.name);
    test();
})}
function roundtrip(x) {
    var tson = typeson.stringify(x, null, 2);
    console.log(tson);
    return typeson.parse(tson);
}

run ([function shouldSupportBasicTypes () {
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
    assert (res.h instanceof RegExp && res.h.ignoreCase && res.h.global && !res.h.multiline, "Regexp value");
    
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
    
    var tson = typeson.stringify(data,null, 2);
    console.log(tson);
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
    assert (tson.match(/Kalle/g).length === 1, "TSON should only contain one 'Kalle'. The other should just reference the first");
    var result = typeson.parse(tson);
    assert (result[0] === result[1] && result[1] === result[2], "The resulting object should also just have references to the same object");
    
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
    
    var typeson = new Typeson();
    typeson.register({
        CustomDate: [
            x => x instanceof CustomDate,
            cd => ({_date: cd.getRealDate(), name: cd.name}),
            obj => new CustomDate(obj._date, obj.name)
        ]
    });
    var tson = typeson.stringify(input,null, 2);
    console.log(tson);
    var result = typeson.parse(tson);
    assert (result.name == "Karl", "Basic prop");
    assert (result.date instanceof CustomDate, "Correct instance type of custom date");
    assert (result.date.getName() == "Otto", "prototype method works and properties seems to be in place");
    assert (result.date.getRealDate().getTime() === date.getTime(), "The correct time is there");
    
}]);

