/**
 * Typeson - JSON with types
 * @license The MIT License (MIT)
 * @copyright (c) 2016-2018 David Fahlander, Brett Zamir
*/

import {TypesonPromise} from './utils/TypesonPromise.js';
import {
    isPlainObject, isObject, hasConstructorOf,
    isThenable, toStringTag, isUserObject,
    escapeKeyPathComponent, unescapeKeyPathComponent, getByKeyPath,
    getJSONType
} from './utils/classMethods.js';

const {keys} = Object,
    {isArray} = Array,
    hasOwn = ({}.hasOwnProperty),
    internalStateObjPropsToIgnore = ['type', 'replaced', 'iterateIn', 'iterateUnsetNumeric'];

/**
 * An instance of this class can be used to call `stringify()` and `parse()`.
 * Typeson resolves cyclic references by default. Can also be extended to
 * support custom types using the register() method.
 *
 * @constructor
 * @param {{cyclic: boolean}} [options] - if cyclic (default true),
 *   cyclic references will be handled gracefully.
 */
function Typeson (options) {
    // Replacers signature: replace (value). Returns falsy if not
    //   replacing. Otherwise ['Date', value.getTime()]
    const plainObjectReplacers = [];
    const nonplainObjectReplacers = [];
    // Revivers: map {type => reviver}. Sample: {'Date': value => new Date(value)}
    const revivers = {};

    /** Types registered via register() */
    const regTypes = this.types = {};

    /**
     * Serialize given object to Typeson.
     * Initial arguments work identical to those of `JSON.stringify`.
     * The `replacer` argument has nothing to do with our replacers.
     * @param {*} obj
     * @param {function|string[]} replacer
     * @param {number|string} space
     * @param {object} opts
     * @returns {string|Promise} Promise resolves to a string
     */
    const stringify = this.stringify = function (obj, replacer, space, opts) {
        opts = {...options, ...opts, stringification: true};
        const encapsulated = encapsulate(obj, null, opts);
        if (isArray(encapsulated)) {
            return JSON.stringify(encapsulated[0], replacer, space);
        }
        return encapsulated.then((res) => {
            return JSON.stringify(res, replacer, space);
        });
    };

    /**
     * Also sync but throws on non-sync result
     * @param {*} obj
     * @param {function|string[]} replacer
     * @param {number|string} space
     * @param {object} opts
     * @returns {string}
     */
    this.stringifySync = function (obj, replacer, space, opts) {
        return stringify(obj, replacer, space, {
            throwOnBadSyncType: true, ...opts, sync: true
        });
    };

    /**
     *
     * @param {*} obj
     * @param {function|string[]} replacer
     * @param {number|string} space
     * @param {object} opts
     * @returns {Promise} Resolves to string
     */
    this.stringifyAsync = function (obj, replacer, space, opts) {
        return stringify(obj, replacer, space, {
            throwOnBadSyncType: true, ...opts, sync: false
        });
    };

    /**
     * Parse Typeson back into an obejct.
     * Initial arguments works identical to those of `JSON.parse()`.
     * @param {string} text
     * @param {function} reviver This JSON reviver has nothing to do with our revivers.
     * @param {object} opts
     * @returns {external:JSON}
     */
    const parse = this.parse = function (text, reviver, opts) {
        opts = {...options, ...opts, parse: true};
        return revive(JSON.parse(text, reviver), opts);
    };

    /**
    * Also sync but throws on non-sync result
    * @param {string} text
    * @param {function} reviver This JSON reviver has nothing to do with our revivers.
    * @param {object} opts
    * @returns {external:JSON}
    */
    this.parseSync = function (text, reviver, opts) {
        return parse(
            text,
            reviver,
            {throwOnBadSyncType: true, ...opts, sync: true}
        );
    };
    /**
    * @param {string} text
    * @param {function} reviver This JSON reviver has nothing to do with our revivers.
    * @param {object} opts
    * @returns {Promise} Resolves to `external:JSON`
    */
    this.parseAsync = function (text, reviver, opts) {
        return parse(
            text,
            reviver,
            {throwOnBadSyncType: true, ...opts, sync: false}
        );
    };

    /**
     *
     * @param {*} obj
     * @param {object} stateObj
     * @param {object} [opts={}]
     * @returns {string[]|false}
     */
    this.specialTypeNames = function (obj, stateObj, opts = {}) {
        opts.returnTypeNames = true;
        return this.encapsulate(obj, stateObj, opts);
    };
    /**
     *
     * @param {*} obj
     * @param {object} stateObj
     * @param {object} [opts={}]
     * @returns {Promise|Array|object|string|false}
     */
    this.rootTypeName = function (obj, stateObj, opts = {}) {
        opts.iterateNone = true;
        return this.encapsulate(obj, stateObj, opts);
    };

    /**
     * Encapsulate a complex object into a plain Object by replacing registered
     * types with plain objects representing the types data.
     *
     * This method is used internally by T`ypeson.stringify()`.
     * @param {Object} obj - Object to encapsulate.
     * @param {object} stateObj
     * @param {object} opts
     * @returns {Promise|Array|object|string|false}
     */
    const encapsulate = this.encapsulate = function (obj, stateObj, opts) {
        opts = {sync: true, ...options, ...opts};
        const {sync} = opts;

        const types = {},
            refObjs = [], // For checking cyclic references
            refKeys = [], // For checking cyclic references
            promisesDataRoot = [];

        // Clone the object deeply while at the same time replacing any
        //   special types or cyclic reference:
        const cyclic = opts && ('cyclic' in opts) ? opts.cyclic : true;
        const {encapsulateObserver} = opts;
        const ret = _encapsulate('', obj, cyclic, stateObj || {}, promisesDataRoot);

        /**
         *
         * @param {} ret
         * @returns {Array|object|string|false}
         */
        function finish (ret) {
            // Add `$types` to result only if we ever bumped into a
            //  special type (or special case where object has own `$types`)
            const typeNames = Object.values(types);
            if (opts.iterateNone) {
                if (typeNames.length) {
                    return typeNames[0];
                }
                return Typeson.getJSONType(ret);
            }
            if (typeNames.length) {
                if (opts.returnTypeNames) {
                    return [...new Set(typeNames)];
                }

                // Special if array (or a primitive) was serialized because
                //   JSON would ignore custom `$types` prop on it
                if (!ret || !isPlainObject(ret) ||
                    // Also need to handle if this is an object with its
                    //   own `$types` property (to avoid ambiguity)
                    hasOwn.call(ret, '$types')
                ) {
                    ret = {$: ret, $types: {$: types}};
                } else {
                    ret.$types = types;
                }
            // No special types
            } else if (isObject(ret) && hasOwn.call(ret, '$types')) {
                ret = {$: ret, $types: true};
            }
            if (opts.returnTypeNames) {
                return false;
            }
            return ret;
        }
        /**
         *
         * @param {} ret
         * @param {array} promisesData
         * @returns {Promise} Resolves to ...
         */
        async function checkPromises (ret, promisesData) {
            const promResults = await Promise.all(
                promisesData.map((pd) => { return pd[1].p; })
            );
            await Promise.all(
                promResults.map(async function (promResult) {
                    const newPromisesData = [];
                    const [prData] = promisesData.splice(0, 1);
                    const [
                        keyPath, , cyclic, stateObj,
                        parentObj, key, detectedType
                    ] = prData;

                    const encaps = _encapsulate(
                        keyPath, promResult, cyclic, stateObj,
                        newPromisesData, true, detectedType
                    );
                    const isTypesonPromise = hasConstructorOf(encaps, TypesonPromise);
                    // Handle case where an embedded custom type itself
                    //   returns a `Typeson.Promise`
                    if (keyPath && isTypesonPromise) {
                        const encaps2 = await encaps.p;
                        parentObj[key] = encaps2;
                        return checkPromises(ret, newPromisesData);
                    }
                    if (keyPath) {
                        parentObj[key] = encaps;
                    } else if (isTypesonPromise) {
                        ret = encaps.p;
                    } else {
                        // If this is itself a `Typeson.Promise` (because the
                        //   original value supplied was a `Promise` or because
                        //   the supplied custom type value resolved to one),
                        //   returning it below will be fine since a `Promise`
                        //   is expected anyways given current config (and if
                        //   not a `Promise`, it will be ready as the resolve
                        //   value)
                        ret = encaps;
                    }
                    return checkPromises(ret, newPromisesData);
                })
            );
            return ret;
        };
        return promisesDataRoot.length
            ? sync && opts.throwOnBadSyncType
                ? (() => {
                    throw new TypeError('Sync method requested but async result obtained');
                })()
                : Promise.resolve(checkPromises(ret, promisesDataRoot)).then(finish)
            : !sync && opts.throwOnBadSyncType
                ? (() => {
                    throw new TypeError('Async method requested but sync result obtained');
                })()
                // If this is a synchronous request for stringification, yet
                //   a promise is the result, we don't want to resolve leading
                //   to an async result, so we return an array to avoid ambiguity
                : (opts.stringification && sync
                    ? [finish(ret)]
                    : (sync
                        ? finish(ret)
                        : Promise.resolve(finish(ret))
                    ));

        /**
         *
         * @param {object} stateObj
         * @param {object} ownKeysObj
         * @param {function} cb
         * @returns {undefined}
         */
        function _adaptBuiltinStateObjectProperties (stateObj, ownKeysObj, cb) {
            Object.assign(stateObj, ownKeysObj);
            const vals = internalStateObjPropsToIgnore.map((prop) => {
                const tmp = stateObj[prop];
                delete stateObj[prop];
                return tmp;
            });
            cb();
            internalStateObjPropsToIgnore.forEach((prop, i) => {
                stateObj[prop] = vals[i];
            });
        }

        /**
         *
         * @param {string} keypath
         * @param {*} value
         * @param {boolean} cyclic
         * @param {object} stateObj
         * @param {boolean} promisesData
         * @param {boolean} resolvingTypesonPromise
         * @param {string} detectedType
         * @returns {}
         */
        function _encapsulate (
            keypath, value, cyclic, stateObj, promisesData,
            resolvingTypesonPromise, detectedType
        ) {
            let ret;
            let observerData = {};
            const $typeof = typeof value;
            const runObserver = encapsulateObserver
                ? function (obj) {
                    const type = detectedType || stateObj.type || (
                        Typeson.getJSONType(value)
                    );
                    encapsulateObserver(Object.assign(obj || observerData, {
                        keypath,
                        value,
                        cyclic,
                        stateObj,
                        promisesData,
                        resolvingTypesonPromise,
                        awaitingTypesonPromise: hasConstructorOf(value, TypesonPromise)
                    }, type !== undefined ? {type} : {}));
                }
                : null;
            if (['string', 'boolean', 'number', 'undefined'].includes($typeof)) {
                if (value === undefined || ($typeof === 'number' &&
                    (isNaN(value) || value === -Infinity || value === Infinity))) {
                    ret = replace(
                        keypath, value, stateObj, promisesData,
                        false, resolvingTypesonPromise, runObserver
                    );
                    if (ret !== value) {
                        observerData = {replaced: ret};
                    }
                } else {
                    ret = value;
                }
                if (runObserver) {
                    runObserver();
                }
                return ret;
            }
            if (value === null) {
                if (runObserver) {
                    runObserver();
                }
                return value;
            }
            if (cyclic && !stateObj.iterateIn && !stateObj.iterateUnsetNumeric) {
                // Options set to detect cyclic references and be able to rewrite them.
                const refIndex = refObjs.indexOf(value);
                if (refIndex < 0) {
                    if (cyclic === true) {
                        refObjs.push(value);
                        refKeys.push(keypath);
                    }
                } else {
                    types[keypath] = '#';
                    if (runObserver) {
                        runObserver({
                            cyclicKeypath: refKeys[refIndex]
                        });
                    }
                    return '#' + refKeys[refIndex];
                }
            }
            const isPlainObj = isPlainObject(value);
            const isArr = isArray(value);
            const replaced = (
                // Running replace will cause infinite loop as will test positive again
                ((isPlainObj || isArr) &&
                    (!plainObjectReplacers.length || stateObj.replaced)) ||
                stateObj.iterateIn
            )
                // Optimization: if plain object and no plain-object replacers, don't
                //   try finding a replacer
                ? value
                : replace(
                    keypath, value, stateObj, promisesData,
                    isPlainObj || isArr,
                    null,
                    runObserver
                );
            let clone;
            if (replaced !== value) {
                ret = replaced;
                observerData = {replaced};
            } else {
                if (isArr || stateObj.iterateIn === 'array') {
                    clone = new Array(value.length);
                    observerData = {clone};
                } else if (isPlainObj || stateObj.iterateIn === 'object') {
                    clone = {};
                    observerData = {clone};
                } else if (keypath === '' && hasConstructorOf(value, TypesonPromise)) {
                    promisesData.push([
                        keypath, value, cyclic, stateObj,
                        undefined, undefined, stateObj.type
                    ]);
                    ret = value;
                } else {
                    ret = value; // Only clone vanilla objects and arrays
                }
            }
            if (runObserver) {
                runObserver();
            }

            if (opts.iterateNone) {
                return clone || ret;
            }

            if (!clone) {
                return ret;
            }

            // Iterate object or array
            if (stateObj.iterateIn) {
                for (const key in value) {
                    const ownKeysObj = {ownKeys: hasOwn.call(value, key)};
                    _adaptBuiltinStateObjectProperties(stateObj, ownKeysObj, () => {
                        const kp = keypath + (keypath ? '.' : '') +
                            escapeKeyPathComponent(key);
                        const val = _encapsulate(
                            kp, value[key], !!cyclic, stateObj,
                            promisesData, resolvingTypesonPromise
                        );
                        if (hasConstructorOf(val, TypesonPromise)) {
                            promisesData.push([
                                kp, val, !!cyclic, stateObj,
                                clone, key, stateObj.type
                            ]);
                        } else if (val !== undefined) {
                            clone[key] = val;
                        }
                    });
                }
                if (runObserver) {
                    runObserver({endIterateIn: true, end: true});
                }
            } else { // Note: Non-indexes on arrays won't survive stringify so somewhat wasteful for arrays, but so too is iterating all numeric indexes on sparse arrays when not wanted or filtering own keys for positive integers
                keys(value).forEach(function (key) {
                    const kp = keypath + (keypath ? '.' : '') + escapeKeyPathComponent(key);
                    const ownKeysObj = {ownKeys: true};
                    _adaptBuiltinStateObjectProperties(stateObj, ownKeysObj, () => {
                        const val = _encapsulate(
                            kp, value[key], !!cyclic, stateObj,
                            promisesData, resolvingTypesonPromise
                        );
                        if (hasConstructorOf(val, TypesonPromise)) {
                            promisesData.push([
                                kp, val, !!cyclic, stateObj,
                                clone, key, stateObj.type
                            ]);
                        } else if (val !== undefined) {
                            clone[key] = val;
                        }
                    });
                });
                if (runObserver) {
                    runObserver({endIterateOwn: true, end: true});
                }
            }
            // Iterate array for non-own numeric properties (we can't replace the prior loop though as it iterates non-integer keys)
            if (stateObj.iterateUnsetNumeric) {
                const vl = value.length;
                for (let i = 0; i < vl; i++) {
                    if (!(i in value)) {
                        const kp = keypath + (keypath ? '.' : '') + i; // No need to escape numeric
                        const ownKeysObj = {ownKeys: false};
                        _adaptBuiltinStateObjectProperties(stateObj, ownKeysObj, () => {
                            const val = _encapsulate(
                                kp, undefined, !!cyclic, stateObj,
                                promisesData, resolvingTypesonPromise
                            );
                            if (hasConstructorOf(val, TypesonPromise)) {
                                promisesData.push([
                                    kp, val, !!cyclic, stateObj,
                                    clone, i, stateObj.type
                                ]);
                            } else if (val !== undefined) {
                                clone[i] = val;
                            }
                        });
                    }
                }
                if (runObserver) {
                    runObserver({endIterateUnsetNumeric: true, end: true});
                }
            }
            return clone;
        }

        /**
         *
         * @param {string} keypath
         * @param {*} value
         * @param {object} stateObj
         * @param {array} promisesData
         * @param {boolean} plainObject
         * @param {boolean} resolvingTypesonPromise
         * @param {function} [runObserver]
         * @returns {}
         */
        function replace (
            keypath, value, stateObj, promisesData, plainObject,
            resolvingTypesonPromise, runObserver
        ) {
            // Encapsulate registered types
            const replacers = plainObject ? plainObjectReplacers : nonplainObjectReplacers;
            let i = replacers.length;
            while (i--) {
                const replacer = replacers[i];
                if (replacer.test(value, stateObj)) {
                    const {type} = replacer;
                    if (revivers[type]) {
                        // Record the type only if a corresponding reviver exists.
                        // This is to support specs where only replacement is done.
                        // For example ensuring deep cloning of the object, or
                        // replacing a type to its equivalent without the need to
                        // revive it.
                        const existing = types[keypath];
                        // type can comprise an array of types (see test
                        //   `shouldSupportIntermediateTypes`)
                        types[keypath] = existing ? [type].concat(existing) : type;
                    }
                    // Now, also traverse the result in case it contains its
                    //   own types to replace
                    Object.assign(stateObj, {type, replaced: true});
                    if ((sync || !replacer.replaceAsync) && !replacer.replace) {
                        if (runObserver) {
                            runObserver({typeDetected: true});
                        }
                        return _encapsulate(
                            keypath, value, cyclic && 'readonly', stateObj,
                            promisesData, resolvingTypesonPromise, type
                        );
                    }
                    if (runObserver) {
                        runObserver({replacing: true});
                    }

                    const replaceMethod = sync || !replacer.replaceAsync
                        ? 'replace'
                        : 'replaceAsync';
                    return _encapsulate(
                        keypath, replacer[replaceMethod](value, stateObj),
                        cyclic && 'readonly', stateObj, promisesData,
                        resolvingTypesonPromise, type
                    );
                }
            }
            return value;
        }
    };

    /**
     * Also sync but throws on non-sync result
     * @param {*} obj
     * @param {object} stateObj
     * @param {object} opts
     * @returns {*}
     */
    this.encapsulateSync = function (obj, stateObj, opts) {
        return encapsulate(obj, stateObj, {throwOnBadSyncType: true, ...opts, sync: true});
    };
    /**
     * @param {*} obj
     * @param {object} stateObj
     * @param {object} opts
     * @returns {*}
     */
    this.encapsulateAsync = function (obj, stateObj, opts) {
        return encapsulate(obj, stateObj, {throwOnBadSyncType: true, ...opts, sync: false});
    };

    /**
     * Revive an encapsulated object.
     * This method is used internally by `Typeson.parse()`.
     * @param {object} obj - Object to revive. If it has `$types` member, the properties
     *   that are listed there will be replaced with its true type instead of just
     *   plain objects.
     * @param {object} opts
     * @returns {}
     */
    const revive = this.revive = function (obj, opts) {
        opts = {sync: true, ...options, ...opts};
        const {sync} = opts;
        let types = obj && obj.$types,
            ignore$Types = true;

        // No type info added. Revival not needed.
        if (!types) {
            return obj;
        }

        // Object happened to have own `$types` property but with
        //   no actual types, so we unescape and return that object
        if (types === true) {
            return obj.$;
        }

        // Special when root object is not a trivial Object, it will
        //   be encapsulated in `$`. It will also be encapsulated in
        //   `$` if it has its own `$` property to avoid ambiguity
        if (types.$ && isPlainObject(types.$)) {
            obj = obj.$;
            types = types.$;
            ignore$Types = false;
        }

        const keyPathResolutions = [];
        const stateObj = {};
        let ret = _revive('', obj, null, opts);
        ret = hasConstructorOf(ret, Undefined) ? undefined : ret;
        return isThenable(ret)
            ? sync && opts.throwOnBadSyncType
                ? (() => {
                    throw new TypeError('Sync method requested but async result obtained');
                })()
                : ret
            : !sync && opts.throwOnBadSyncType
                ? (() => {
                    throw new TypeError('Async method requested but sync result obtained');
                })()
                : sync
                    ? ret
                    : Promise.resolve(ret);

        /**
         *
         * @param {string} keypath
         * @param {*} value
         * @param {} target
         * @param {object} opts
         * @param {Array|object} clone
         * @param {string} key
         * @returns {}
         */
        function _revive (keypath, value, target, opts, clone, key) {
            if (ignore$Types && keypath === '$types') return;
            const type = types[keypath];
            if (isArray(value) || isPlainObject(value)) {
                const clone = isArray(value) ? new Array(value.length) : {};
                // Iterate object or array
                keys(value).forEach((key) => {
                    const val = _revive(
                        keypath + (keypath ? '.' : '') +
                            escapeKeyPathComponent(key), value[key],
                        target || clone,
                        opts,
                        clone,
                        key
                    );
                    if (hasConstructorOf(val, Undefined)) {
                        clone[key] = undefined;
                    } else if (val !== undefined) {
                        clone[key] = val;
                    }
                });
                value = clone;
                while (keyPathResolutions.length) { // Try to resolve cyclic reference as soon as available
                    const [[target, keyPath, clone, key]] = keyPathResolutions;
                    const val = getByKeyPath(target, keyPath);
                    if (hasConstructorOf(val, Undefined)) {
                        clone[key] = undefined;
                    } else if (val !== undefined) {
                        clone[key] = val;
                    } else {
                        break;
                    }
                    keyPathResolutions.splice(0, 1);
                }
            }
            if (!type) return value;
            if (type === '#') {
                const ret = getByKeyPath(target, value.substr(1));
                if (ret === undefined) { // Cyclic reference not yet available
                    keyPathResolutions.push([target, value.substr(1), clone, key]);
                }
                return ret;
            }
            const {sync} = opts;
            return [].concat(type).reduce((val, type) => {
                const reviver = revivers[type];
                if (!reviver) {
                    throw new Error('Unregistered type: ' + type);
                }
                return reviver[ // eslint-disable-line standard/computed-property-even-spacing
                    sync && reviver.revive
                        ? 'revive'
                        : !sync && reviver.reviveAsync
                            ? 'reviveAsync'
                            : 'revive'
                ](val, stateObj);
            }, value);
        }
    };

    /**
     * Also sync but throws on non-sync result
     * @param {*} obj
     * @param {object} opts
     * @returns {*}
     */
    this.reviveSync = function (obj, opts) {
        return revive(obj, {throwOnBadSyncType: true, ...opts, sync: true});
    };
    /**
    * @param {*} obj
    * @param {object} opts
    * @returns {Promise} Resolves to `*`
    */
    this.reviveAsync = function (obj, opts) {
        return revive(obj, {throwOnBadSyncType: true, ...opts, sync: false});
    };

    /**
     * Register types.
     * For examples how to use this method, see https://github.com/dfahlander/typeson-registry/tree/master/types
     * @param {Array.<Object.<string,Function[]>>} typeSpecSets - Types and their functions [test, encapsulate, revive];
     * @param {object} opts
     * @returns {Typeson}
     */
    this.register = function (typeSpecSets, opts) {
        opts = opts || {};
        [].concat(typeSpecSets).forEach(function R (typeSpec) {
            // Allow arrays of arrays of arrays...
            if (isArray(typeSpec)) {
                return typeSpec.map(R);
            }
            typeSpec && keys(typeSpec).forEach(function (typeId) {
                if (typeId === '#') {
                    throw new TypeError('# cannot be used as a type name as it is reserved for cyclic objects');
                } else if (Typeson.JSON_TYPES.includes(typeId)) {
                    throw new TypeError('Plain JSON object types are reserved as type names');
                }
                let spec = typeSpec[typeId];
                const replacers = spec.testPlainObjects
                    ? plainObjectReplacers
                    : nonplainObjectReplacers;
                const existingReplacer = replacers.filter(function (r) {
                    return r.type === typeId;
                });
                if (existingReplacer.length) {
                    // Remove existing spec and replace with this one.
                    replacers.splice(replacers.indexOf(existingReplacer[0]), 1);
                    delete revivers[typeId];
                    delete regTypes[typeId];
                }
                if (!spec) {
                    return;
                }
                if (typeof spec === 'function') {
                    // Support registering just a class without replacer/reviver
                    const Class = spec;
                    spec = {
                        test: (x) => x && x.constructor === Class,
                        replace: (x) => Object.assign({}, x),
                        revive: (x) => Object.assign(Object.create(Class.prototype), x)
                    };
                } else if (isArray(spec)) {
                    const [test, replace, revive] = spec;
                    spec = {test, replace, revive};
                }
                const replacerObj = {
                    type: typeId,
                    test: spec.test.bind(spec)
                };
                if (spec.replace) {
                    replacerObj.replace = spec.replace.bind(spec);
                }
                if (spec.replaceAsync) {
                    replacerObj.replaceAsync = spec.replaceAsync.bind(spec);
                }
                const start = typeof opts.fallback === 'number'
                    ? opts.fallback
                    : (opts.fallback ? 0 : Infinity);
                if (spec.testPlainObjects) {
                    plainObjectReplacers.splice(start, 0, replacerObj);
                } else {
                    nonplainObjectReplacers.splice(start, 0, replacerObj);
                }
                // Todo: We might consider a testAsync type
                if (spec.revive || spec.reviveAsync) {
                    const reviverObj = {};
                    if (spec.revive) reviverObj.revive = spec.revive.bind(spec);
                    if (spec.reviveAsync) reviverObj.reviveAsync = spec.reviveAsync.bind(spec);
                    revivers[typeId] = reviverObj;
                }

                // Record to be retrieved via public types property.
                regTypes[typeId] = spec;
            });
        });
        return this;
    };
}

/**
 * We keep this function minimized so if using two instances of this
 * library, where one is minimized and one is not, it will still work
 * @constructor
 */
class Undefined{} // eslint-disable-line space-before-blocks

// class TypesonPromise extends Promise {get[Symbol.toStringTag](){return 'TypesonPromise'};} // eslint-disable-line keyword-spacing, space-before-function-paren, space-before-blocks, block-spacing, semi

// The following provide classes meant to avoid clashes with other values
Typeson.Undefined = Undefined; // To insist `undefined` should be added
Typeson.Promise = TypesonPromise; // To support async encapsulation/stringification

// Some fundamental type-checking utilities
Typeson.isThenable = isThenable;
Typeson.toStringTag = toStringTag;
Typeson.hasConstructorOf = hasConstructorOf;
Typeson.isObject = isObject;
Typeson.isPlainObject = isPlainObject;
Typeson.isUserObject = isUserObject;

Typeson.escapeKeyPathComponent = escapeKeyPathComponent;
Typeson.unescapeKeyPathComponent = unescapeKeyPathComponent;
Typeson.getByKeyPath = getByKeyPath;
Typeson.getJSONType = getJSONType;
Typeson.JSON_TYPES = [
    'null', 'boolean', 'number', 'string', 'array', 'object'
];

export default Typeson;
