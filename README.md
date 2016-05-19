# Typeson
JSON with type info

# Why?
JSON can only contain simple types: strings, numbers, booleans, Arrays and Objects. In case you want to serialize a Date or an Error object for example, you will need fix that manually. Typeson is just JSON that complements non-trivial properties with type info. The type info is not put in each property. Instead, theres a $types property in the result that maps each non-trivial property to a type name. A registry of type names defines how to encapsulate and revive each type.

# Features
* Can stringify Dates, RegExps, Errors by default (will support more times soon...)
* Produces standard JSON with an additional $types property in case it is needed.
* Minimalistic: This library is a single ES5 compliant JS file of 11kb (1.5k minified and gzipped)
* You can register any type to be stringifyable (serializable) with your typeson instance.
* Can handle cyclic references, such as lists of objects where each object has a reference to the list
* Minimalisticlt produced JSON with just a single "$types" property on the root containing type info related
  to each special property.
* Will produce standard JSON identical to that of JSON.stringify() in case you object doesnt contain special types or cyclic references.

# Usage
```js
var typeson = new Typeson([options]);

// Use it exactly like JSON.stringify()
var tson = typeson.stringify({date: new Date(), rex: new RegExp()});

// Parse exactly like JSON.parse()
var parsed = typeson.parse(tson);
```

# API

## constructor ([options])
Creates an instance of Typeson, on which you may configure additional types to support, or call stringify() or parse() on.

### Arguments
##### options (optional):
{
    cyclic?: boolean, // Default true
    types?: {TypeName: [tester, encapsulator, reviver]} // Defaults to the built-in types (currently Date, RegExp and Error)
}

##### cyclic
Whether or not to support cyclic references. Default true unless explicitely set to false. If this property is false, the parsing algorithm becomes a little faster and in case a single object occurs on multiple properties, it will be duplicated in the output (as JSON.stringify() would do). If this property is true, several instances of same object will only occur once in the generated JSON and other references will just contain a pointer to the single reference.

##### types
A map of {TypeName: string => [tester, encapsulator reviver].

##### tester
Function that tests whether an instance is of your type and returns a truthy value if it is.

##### encapsulator
Function that maps you instance to a JSON-serializable object.

##### reviver
Function that maps you JSON-serializable object into a real instance of your type.

### Sample
```js
var typeson = new Typeson();

var tson = typeson.stringify(complexObject);
console.log(tson);
var obj = typeson.parse(tson);

```

## stringify (obj, [replacer], [space])

Generates JSON based on given obj. If given obj has special types or cyclic references, the produce JSON will contain a $types property on the root where type info relies.

### Sample
```js
new Typeson().stringify ({date: new Date()})
```
Output:
```js
{"date": 1463667643065, "$types": {"date": "Date"}}
```

## parse (obj, [reviver])

Parses Typeson genereted JSON back into the original complex structure again.

### Sample
```js
new Typeson().parse ('{"date": 1463667643065, "$types": {"date": "Date"}}');
```

## register (typeSpec)

### typeSpec
{TypeName: [tester, encapsulator, reviver]}

### Sample

```js
var typeson = new Typeson();

typeson.register({
  DateObject: [
    x => x instanceof Date, // tester
    date => date.getTime(), // encapsulator
    obj => new Date(obj)    // reviver
  ],
  RegularExpression: [
    x = x instanceof RegExp,
    re => ({source: re.source, flags: re.flags}),
    o => new RegExp (o.source, o.flags)
  ]
});
```
