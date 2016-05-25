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
 * @param {{cyclic: boolean}} [options] - if cyclic (default true), cyclic references will be handled gracefully.
 */
function Typeson (options) {
    // Replacers signature: replace (value). Returns falsy if not replacing. Otherwise ["Date", value.getTime()]
    var replacers = [];
    // Revivers: map {type => reviver}. Sample: {"Date": value => new Date(value)}
    var revivers = {};
    
    /** Types registered via register() */
    var regTypes = this.types = {};
    
    /** Seraialize given object to Typeson.
     * 
     * Arguments works identical to those of JSON.stringify().
     */
    this.stringify = function (obj, replacer, space) { // replacer here has nothing to do with our replacers.
        return JSON.stringify (encapsulate(obj), replacer, space);
    }
    
    /** Parse Typeson back into an obejct.
     * 
     * Arguments works identical to those of JSON.parse().
     */
    this.parse = function (text, reviver) {
        return revive (JSON.parse (text, reviver)); // This reviver has nothing to do with our revivers.
    }

    /** Encapsulate a complex object into a plain Object by replacing regisered types with
     * plain objects representing the types data.
     * 
     * This method is used internally by Typeson.stringify().  
     * @param {Object} obj - Object to encapsulate.
     */
    var encapsulate = this.encapsulate = function (obj) {
        var types = {},
            refObjs=[], // For checking cyclic references
            refKeys=[]; // For checking cyclic references
        // Clone the object deeply while at the same time replacing any special types or cyclic reference:
        var cyclic = options && ('cyclic' in options) ? options.cyclic : true;
        var ret = _encapsulate ('', obj, cyclic);
        // Add $types to result only if we ever bumped into a special type
        if (keys(types).length) {
            // Special if array was serialized because JSON would ignore custom $types prop on an array.
            if (ret.constructor !== Object || ret.$types) return {$:ret, $types: {$: types}};
            ret.$types = types;
        }
        return ret;
        
        function _encapsulate (keypath, value, cyclic) {
            var $typeof = typeof value;
            if ($typeof in {string:1, boolean:1, number:1, undefined:1 })
                return $typeof === 'number' ?
                    isNaN(value) || value === -Infinity || value === Infinity ?
                        replace(keypath, value) :
                        value :
                    value;
            if (value == null) return value;
            if (cyclic) {
                // Options set to detect cyclic references and be able to rewrite them.
                var refIndex = refObjs.indexOf(value);
                if (refIndex < 0) {
                    if (cyclic === true) {
                        refObjs.push(value);
                        refKeys.push(keypath);
                    }
                } else {
                    types[keypath] = "#";
                    return '#'+refKeys[refIndex];
                }
            }
            var replaced = value.constructor === Object ?
                value : // Optimization: if plain object, don't try finding a replacer
                replace(keypath, value);
            if (replaced !== value) return replaced;
            if (value == null) return value;
            var clone;
            if (value.constructor === Object)
                clone = {};
            else if (value.constructor === Array)
                clone = new Array(value.length);
            else return value; // Only clone vanilla objects and arrays.
            // Iterate object or array
            keys(value).forEach(function (key) {
                var val = _encapsulate(keypath + (keypath ? '.':'') + key, value[key], cyclic);
                if (val !== undefined) clone[key] = val;
            });
            return clone;
        }
        
        function replace (key, value) {
            // Encapsulate registered types
            var i = replacers.length;
            while (i--) {
                if (replacers[i].test(value)) {
                    var type = replacers[i].type;
                    if (revivers[type]) {
                        // Record the type only if a corresponding reviver exists.
                        // This is to support specs where only replacement is done.
                        // For example ensuring deep cloning of the object, or
                        // replacing a type to its equivalent without the need to revive it.
                        var existing = types[key];
                        // type can comprise an array of types (see test shouldSupportIntermediateTypes)
                        types[key] = existing ? [type].concat(existing) : type;
                    }
                    // Now, also traverse the result in case it contains it own types to replace
                    return _encapsulate(key, replacers[i].replace(value), cyclic && "readonly");
                }
            }
            return value;
        }
    };

    /** Revive an encapsulated object.
     * This method is used internally by JSON.parse().
     * @param {Object} obj - Object to revive. If it has $types member, the properties that are listed there
     * will be replaced with its true type instead of just plain objects.
     */
    var revive = this.revive = function (obj) {
        var types = obj.$types,
            ignore$Types = true;
        if (!types) return obj; // No type info added. Revival not needed.
        if (types.$ && types.$.constructor === Object) {
            // Special when root object is not a trivial Object, it will be encapsulated in $.
            obj = obj.$;
            types = types.$;
            ignore$Types = false;
        }
        return _revive ('', obj);
                
        function _revive (keypath, value, target) {
            if (ignore$Types && keypath === '$types') return;
            var type = types[keypath];
            if (value && (value.constructor === Object || value.constructor === Array)) {
                var clone = isArray(value) ? new Array(value.length) : {};
                // Iterate object or array
                keys(value).forEach(function (key) {
                    var val = _revive(keypath + (keypath ? '.':'') + key, value[key], target || clone);
                    if (val !== undefined) clone[key] = val;
                });
                value = clone;            
            }
            if (!type) return value;
            if (type === '#') return getByKeyPath(target, value.substr(1));
            return [].concat(type).reduce(function(val, type) {
                var reviver = revivers[type];
                if (!reviver) throw new Error ("Unregistered type: " + type);
                return reviver(val);
            }, value);
        }
    };
            
    /** Register types.
     * For examples how to use this method, see https://github.com/dfahlander/typeson-registry/tree/master/types
     * @param {Array.<Object.<string,Function[]>>} typeSpec - Types and their functions [test, encapsulate, revive];
     */
    this.register = function (typeSpecSets) {
        [].concat(typeSpecSets).forEach(function R (typeSpec) {
            if (isArray(typeSpec)) return typeSpec.map(R); // Allow arrays of arrays of arrays...
            typeSpec && keys(typeSpec).forEach(function (typeId) {
                var spec = typeSpec[typeId],
                    existingReplacer = replacers.filter(function(r){ return r.type === typeId; });
                if (existingReplacer.length) {
                    // Remove existing spec and replace with this one.
                    replacers.splice(replacers.indexOf(existingReplacer[0]), 1);
                    delete revivers[typeId];
                    delete regTypes[typeId];
                }
                if (spec) {
                    replacers.push({
                        type: typeId,
                        test: spec[0],
                        replace: spec[1]
                    });
                    if (spec[2]) revivers[typeId] = spec[2];
                    regTypes[typeId] = spec; // Record to be retrieved via public types property.
                }
            });
        });
        return this;
    };
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
