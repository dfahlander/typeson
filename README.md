# typeson.js
Preserves types over JSON, BSON or socket.io

*Only 3.4kb minified. ~1k when gzipped.*

```js
{foo: 1}                // {"foo":1}
{foo: "bar"}            // {"foo":"bar"}
{foo: new Date()}       // {"foo":1464049031538, $types:{"foo":"Date"}}
{foo: {sub: /bar/i}}    // {"foo":{"sub":{"source":"bar","flags":"i"}}, "$types":{"foo.sub":"RegExp"}}
```
NOTE: Typeson by itself wont support Date or RegExp. You need to:
```js
var typeson = new Typeson().register([
    require('typeson-registry/types/date'),
    require('typeson-registry/types/regexp')
]);
```

# Why?
JSON can only contain simple types: strings, numbers, booleans, arrays and objects. This module makes it possible to serialize any type over JSON or other media, such as Date, Error, ArrayBuffer, etc. Typeson is just JSON that complements non-trivial properties with types. It adds a  metadata property "$types" to the result that maps each non-trivial property to a type name. The type name is a reference to a registered type specification that you need to have the same on both the stringifying and the parsing side.

# Type Registry
[typeson-registry](https://github.com/dfahlander/typeson-registry) contains encapsulation rules for standard javascript types such as Date, Error, ArrayBuffer, etc. Pick the types you need, use a preset or write your own.

# Compatibility
* Node
* Browser(*)
* Worker(*)
* ES5

(*) Typeson is a CommonJS module so you must use a web bundler like browserify, webpack or systemjs to use it in the browser or in a web worker.


# Features
* Can stringify custom and standard ES5 / ES6 classes.
* Produces standard JSON with an additional "$types" property in case it is needed.
* Resolves cyclic references, such as lists of objects where each object has a reference to the list
* Minimalistic: This library is a single ES5 compliant JS file of 11kb (1k minified and gzipped)
* You can register any type to be stringifyable (serializable) with your typeson instance.
* Will produce standard JSON identical to that of JSON.stringify() in case you object doesnt contain special types or cyclic references.

# Usage
```js
var typeson = new Typeson().register({
    Date: [
        x => x instanceof Date, // test function
        d => d.getTime(), // encapsulator function
        number => new Date(number) // reviver function
    ],
    Error: [
        x => x instanceof Error, // tester
        e => ({name: e.name, message: e.message}), // encapsulator
        data => {
          // reviver
          var e = new Error (data.message);
          e.name = data.name;
          return e;
        }
    ]
});

// Encapsulate to a JSON friendly format:
var jsonFriendly = typeson.encapsulate({date: new Date(), e: new Error("Oops")});
// Stringify using good old JSON.stringify()
var json = JSON.stringify(jsonFriendly);
// {"date":1464049031538,e:{"name":"Error","message":"Oops"},"$types":{"date":"Date","e":"Error"}}

// Parse using good old JSON.parse()
var parsed = JSON.parse(json);
// Revive back again:
var revived = typeson.revive(parsed);

```

# Use with socket.io
Socket.io can stream ArrayBuffers as real binary data. This is more efficient than encapsulating it in base64/JSON. Typeson can leave certain types, like ArrayBuffer, untouched, and leave the stringification / binarization part to other libs.

What socket.io doesn't do though, is preserving Dates, Errors or your custom types.

So to get the best of two worlds:

* Typeson.encapsulate() instead of Typeson.stringify() to generate an object instead of a string.
* Typeson.revive() instead of Typeson.parse() to revive an encapsulated object.

```js
var Typeson = require('typeson'),
    presetSocketIo = require('typeson-registry/presets/socketio.js');
    
var TSON = new Typeson().register(presetSocketIo);
    
var array = new Float64Array(65536);
array.fill(42, 0, 65536);

var data = {
    date: new Date(),
    error: new SyntaxError("Ooops!"),
    array: array
};

socket.emit('myEvent', TSON.encapsulate(data));
```
The encapsulate() method will not stringify but just traverse the object and return a simpler structure where certain properties are replaced with a substitue. Resulting object will also have a $types property containing the type metadata.

Packing it up at the other end:

```js
socket.on('myEvent', function (data) {
    var revived = TSON.revive(data);
    // Here we have a true Date, SyntaxError and Float64Array to play with.
});
```
*NOTE: Both peers must have the same types registered of course.*

# Use with [BSON](https://www.npmjs.com/package/bson)
The BSON format can serialize object over a binary channel. It supports just the standard JSON types plus Date, Error and optionally Function. You can use Typeson to encapsulate and revive other types as well with BSON as bearer. Use it the same way as shown above with socket.io.

# Use with Worker.postMessage()
Web Workers have the `onmessage` and `postMessage()` communication channel that has built-in support for transferring structures using the structured clone algorithm. It supports Date and ArrayBuffer but not Errors or your own custom classes. To support Error and custom types over web worker channel, register just the types that are needed (Errors and your custom types), and then use Typeson.encapsulate() before posting message, and Typeson.revive() in the onmessage callback.

# API

# constructor ([options])
Creates an instance of Typeson, on which you may configure additional types to support, or call encapsulate(), revive(), stringify() or parse() on.

### Arguments
##### options (optional):
```
{
    cyclic?: boolean, // Default true
}
```

##### cyclic
Whether or not to support cyclic references. Default true unless explicitely set to false. If this property is false, the parsing algorithm becomes a little faster and in case a single object occurs on multiple properties, it will be duplicated in the output (as JSON.stringify() would do). If this property is true, several instances of same object will only occur once in the generated JSON and other references will just contain a pointer to the single reference.

### Sample
```js
var Typeson = require('typeson');
var presetUniversal = require('typeson-registry/presets/universal');
var typeson = new Typeson()
    .register (presetUniversal);

var tson = typeson.stringify(complexObject);
console.log(tson);
var obj = typeson.parse(tson);

```

# Properties

## types
A map between type identifyer and type-rules. Same structure as passed to register(). Use this property if you want to create a new Typeson containing all types from another Typeson.

### Sample

```js
var commonTypeson = new Typeson().register([
    require('typeson-registry/presets/builtin')
]);

var myTypeson = new Typeson().register([
    commonTypeson.types, // Derive from commonTypeson
    myOwnSpecificTypes // Add your extra types
]);
```

# Methods

## stringify (obj, [replacer], [space])

Generates JSON based on given obj. If given obj has special types or cyclic references, the produce JSON will contain a $types property on the root where type info relies.

### Sample
```js
var TSON = new Typeson().register(require('typeson-registry/types/date'));
TSON.stringify ({date: new Date()});
```
Output:
```js
{"date": 1463667643065, "$types": {"date": "Date"}}
```

## parse (obj, [reviver])

Parses Typeson genereted JSON back into the original complex structure again.

### Sample

```js
var TSON = new Typeson().register(require('typeson-registry/types/date'));
TSON.parse ('{"date": 1463667643065, "$types": {"date": "Date"}}');
```

## encapsulate (obj)
Encapsulates an object but leaves the stringification part to you. Pass your encapsulated object further to socket.io, postMessage(), BSON or indexedDB.

### Sample

```js
var encapsulated = typeson.encapsulate(new Date());
var revived = typeson.revive(encapsulated);
assert (revived instanceof Date); 
```

## revive (obj)
Revives an encapsulated object. See encapsulate().

## register (typeSpec)

### typeSpec
`{TypeName: [tester, encapsulator, reviver]}` or an array of such.

##### tester (obj : any) : boolean
Function that tests whether an instance is of your type and returns a truthy value if it is.

##### encapsulator (obj: YourType) : Object
Function that maps you instance to a JSON-serializable object.

##### reviver (obj: Object) : YourType
Function that maps you JSON-serializable object into a real instance of your type.

### Sample

```js
var typeson = new Typeson();

typeson.register({
  Date: [
    x => x instanceof Date, // tester
    date => date.getTime(), // encapsulator
    obj => new Date(obj)    // reviver
  ],
  RegExp: [
    x = x instanceof RegExp,
    re => [re.source, re.flags],
    a => new RegExp (a[0], a[1])
  ]
});

console.log(typeson.stringify({d: new Date(), r:/foo/gi }));
// {"d":1464049031538,"r":["foo","gi"],$types:{"d":"Date","r":"RegExp"}}


```
[typeson-registry](https://github.com/dfahlander/typeson-registry) contains ready-to-use types to register with your Typeson instance.

