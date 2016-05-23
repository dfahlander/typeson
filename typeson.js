var keys = Object.keys,
    isArray = Array.isArray;

/* Typeson - JSON with types
    * License: The MIT License (MIT)
    * Copyright (c) 2016 David Fahlander 
    */

/** An instance of this class can be used to call stringify() and parse().
 * Supports built-in types such as Date, Error, Regexp etc by default but can
 * also be extended to support custom types using the register() method.
 * Typeson also resolves cyclic references.
 * 
 * @constructor
 * @param {{cyclic: boolean, types: Object}} [options] - if cyclic (default true), cyclic references will be handled gracefully.
 *  If types is specified, the default built-in types will not be registered but instead the given types spec will be used.
 */
function Typeson (options) {
    options = options || {};
    // Replacers signature: replace (value). Returns falsy if not replacing. Otherwise ["Date", value.getTime()]
    var replacers = [];
    // Revivers: map {type => reviver}. Sample: {"Date": value => new Date(value)}
    var revivers = {};
    
    /** Types registered via register() */
    var regTypes = this.types = {};
    
    /** Seraialize given object to Typeson.
     * 
     * Arguments works identical to those of JSON.stringify().
     * 
     * @param {Object} obj - Object to serialize.
     * @param {Function} [replacer] - Optional replacer function taking (key, value) and returning value.
     * @param {number} [space] - Optional space parameter to make the output prettier.
     */
    this.stringify = function (obj, replacer, space) {
        return JSON.stringify (encapsulate(obj), replacer, space);
    }
    
    /** Parse Typeson back into an obejct.
     * 
     * Arguments works identical to those of JSON.parse().
     * 
     * @param {String} text - Typeson or JSON to parse.
     * @param {Function} [reviver] - Optional function taking (key, value) and returning value. 
     */
    this.parse = function (text, reviver) {
        return revive (JSON.parse (text, reviver));
    }

    /** Encapsulate a complex object into a plain Object that would survive JSON.stringify().
     * This method is used internally by Typeson.stringify().  
     * @param {Object} obj - Object to encapsulate.
     */
    var encapsulate = this.encapsulate = function (obj) {
        var types = {};
        // Clone the object deeply while at the same time replacing any special types or cyclic reference:
        var ret = traverse (obj, encapsulator, 'cyclic' in options ? options.cyclic : true, types);
        // Add $types to result only if we ever bumped into a special type
        if (keys(types).length) {
            // Special if array was serialized because JSON would ignore custom $types prop on an array.
            if (ret.constructor !== Object || ret.$types) return {$:ret, $types: {$: types}};
            ret.$types = types;
        }
        return ret;

        function encapsulator (key, value, clone, $typeof) {
            if ($typeof in {string:1, boolean:1, undefined:1}) return value;
            if ($typeof === 'number') {
                if (isNaN(value)) {
                    return types[key] = "NaN";
                }
                if (value === Infinity) {
                    return types[key] = "Infinity";
                }
                if (value === -Infinity) {
                    return types[key] = "-Infinity";
                }
                return value;
            }
            // Optimization: Never try finding a replacer when value is a plain object.
            if (value.constructor === Object) return clone;
            
            // Encapsulate registered types
            var i = replacers.length;
            while (i--) {
                var replacement = replacers[i](value);
                if (replacement) {
                    types[key] = replacement[0];// replacement[0] = Type Identifyer
                    // Now, also traverse the result in case it contains it own types to replace
                    return continueTraversing(replacement[1], key);
                }
            }
            return clone;
        }
    };

    /** Revive an encapsulated object.
     * This method is used internally by JSON.parse().
     * @param {Object} obj - Object corresponding to the Typeson spec.
     */
    var revive = this.revive = function (obj) {
        var types = obj.$types,
            ignore$Types = true;
        if (!types) return obj; // No type info added. Revival not needed.
        if (typeof types.$ === 'object') {
            // Special when root object is not a trivial Object, it will be encapsulated in $.
            obj = obj.$;
            types = types.$;
            ignore$Types = false;            
        }
        return traverse (obj, function (key, value, clone, $typeof) {
            if (ignore$Types && key === '$types') return; // return undefined to tell traverse to ignore it.
            var type = types[key];
            if (!type) return clone; // This is the default (just a plain Object).
            if (type === '#')
                // Revive cyclic referenced object
                return getByKeyPath(target, value.substr(1)); // 1 === "#".length; 
                
            var reviver = revivers[type];
            if (!reviver) throw new Error ("Unregistered Type: " + type);
            return reviver(clone);
        });
    };
            
    /** Register custom types.
     * For examples how to use this method, search for "Register built-in types" in typeson.js.
     * @param {Array.<Object.<string,Function[]>>} typeSpec - Types and their functions [test, encapsulate, revive];
     */
    var register = this.register = function (typeSpecSets) {
        [].concat(typeSpecSets).forEach(function (typeSpec) { 
            keys(typeSpec).forEach(function (typeIdentifyer) {
                var spec = typeSpec[typeIdentifyer],
                    test = spec[0],
                    replace = spec[1],
                    revive = spec[2],
                    existingReviver = revivers[typeSpec];
                if (existingReviver) {
                    if (existingReviver.toString() !== revive.toString())
                        throw new Error ("Type " + typeIdentifyer + " is already registered with incompatible behaviour");
                    // Ignore re-registration if identical
                    return;
                }
                function replacer (value) {
                    return test(value) && [typeIdentifyer, replace(value)];
                }
                replacers.push(replacer);
                revivers[typeIdentifyer] = revive;
                regTypes[typeIdentifyer] = spec; // Record to be retrueved via public types property.
            });
        });
        return this;
    };
    
    //
    // Setup Default Configuration
    //
    revivers.NaN = function() { return NaN; };
    revivers.Infinity = function () { return Infinity; };
    revivers["-Infinity"] = function () { return -Infinity; };
    revivers["[]"] = function(a) { return keys(a).map(function (i){return a[i]}); }; // If root obj is an array (special)
    
    // Register option.types, or if not specified, the built-in types.
    this.register(options.types || {
        Date: [
            function (x) { return x instanceof Date; },
            function (date) { return date.getTime(); },
            function (time) { return new Date(time); }
        ],
    
        Error: [
            function (x) { return x instanceof Error; },
            function (error) { return {name: error.name, message: error.message}; },
            function (data) { var e = new Error (data.message); e.name = data.name; return e; }
        ]
    });
}

var refObjs, refKeys, target, replacer, types;

function resetTraverse() {
    refObjs = [];
    refKeys = [];
    target = null;
    replacer = null;
    types = null;
}

/** traverse() utility */
function traverse (value, _replacer, cyclic, outTypes) {
    resetTraverse();
    replacer = _replacer;
    types = outTypes || {};
    var ret = continueTraversing(value, '', cyclic);
    resetTraverse(); // Free memory
    return ret;
}

function continueTraversing (value, keypath, cyclic) {
    var type = typeof value;
    // Don't add edge cases for NaN, Infinity or -Infinity here. Do such things in a replacer callback instead.
    if (type in {number:1, string:1, boolean:1, undefined:1, function:1, symbol:1})
        return replacer (keypath, value, value, type);
    if (value === null) return null;
    if (cyclic) {
        // Options set to detect cyclic references and be able to rewrite them.
        var refIndex = refObjs.indexOf(value);
        if (refIndex < 0) {
            refObjs.push(value);
            refKeys.push(keypath);
        } else {
            types[keypath] = "#";
            return '#'+refKeys[refIndex];
        }
    }
    var clone = isArray(value) ? new Array(value.length) : {};
    if (!target) target = clone;
    // Iterate object or array
    keys(value).forEach(function (key) {
        var val = continueTraversing(value[key], keypath + (keypath ? '.':'') + key, cyclic);
        if (val !== undefined) clone[key] = val; 
    });
    return replacer (keypath, value, clone, type);
}

/** getByKeyPath() utility */
function getByKeyPath (obj, keyPath) {
    if (keyPath === '') return obj;
    var period = keyPath.indexOf('.');
    if (period !== -1) {
        var innerObj = obj[keyPath.substr(0, period)];
        return innerObj === undefined ? undefined : getByKeyPath(innerObj, keyPath.substr(period + 1));
    }
    return obj[keyPath];
}

module.exports = Typeson;
