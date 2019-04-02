/**
 * Typeson - JSON with types
 * @license The MIT License (MIT)
 * @copyright (c) 2016-2018 David Fahlander, Brett Zamir
*/

import {TypesonPromise} from './utils/TypesonPromise.js';
import {
    isPlainObject, isObject, hasConstructorOf,
    isThenable, toStringTag, isUserObject,
    escapeKeyPathComponent, unescapeKeyPathComponent,
    getByKeyPath, setAtKeyPath, getJSONType
} from './utils/classMethods.js';

const {keys} = Object,
    {isArray} = Array,
    hasOwn = ({}.hasOwnProperty),
    internalStateObjPropsToIgnore = [
        'type', 'replaced', 'iterateIn', 'iterateUnsetNumeric'
    ];

function nestedPathsFirst (a, b) {
    let as = a.keypath.match(/\./g);
    let bs = a.keypath.match(/\./g);
    if (as) {
        as = as.length;
    }
    if (bs) {
        bs = bs.length;
    }
    return as > bs
        ? -1
        : as < bs
            ? 1
            : a.keypath < b.keypath
                ? -1
                : a.keypath > b.keypath;
}

/**
 * An instance of this class can be used to call `stringify()` and `parse()`.
 * Typeson resolves cyclic references by default. Can also be extended to
 * support custom types using the register() method.
 *
 * @constructor
 * @param {{cyclic: boolean}} [options] - if cyclic (default true),
 *   cyclic references will be handled gracefully.
 */
class Typeson {
    constructor (options) {
        this.options = options;

        // Replacers signature: replace (value). Returns falsy if not
        //   replacing. Otherwise ['Date', value.getTime()]
        this.plainObjectReplacers = [];
        this.nonplainObjectReplacers = [];

        // Revivers: [{type => reviver}, {plain: boolean}].
        //   Sample: [{'Date': value => new Date(value)}, {plain: false}]
        this.revivers = {};

        /** Types registered via register() */
        this.types = {};
    }

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
    stringify (obj, replacer, space, opts) {
        opts = {...this.options, ...opts, stringification: true};
        const encapsulated = this.encapsulate(obj, null, opts);
        if (isArray(encapsulated)) {
            return JSON.stringify(encapsulated[0], replacer, space);
        }
        return encapsulated.then((res) => {
            return JSON.stringify(res, replacer, space);
        });
    }

    /**
     * Also sync but throws on non-sync result
     * @param {*} obj
     * @param {function|string[]} replacer
     * @param {number|string} space
     * @param {object} opts
     * @returns {string}
     */
    stringifySync (obj, replacer, space, opts) {
        return this.stringify(obj, replacer, space, {
            throwOnBadSyncType: true, ...opts, sync: true
        });
    }

    /**
     *
     * @param {*} obj
     * @param {function|string[]} replacer
     * @param {number|string} space
     * @param {object} opts
     * @returns {Promise} Resolves to string
     */
    stringifyAsync (obj, replacer, space, opts) {
        return this.stringify(obj, replacer, space, {
            throwOnBadSyncType: true, ...opts, sync: false
        });
    }

    /**
     * Parse Typeson back into an obejct.
     * Initial arguments works identical to those of `JSON.parse()`.
     * @param {string} text
     * @param {function} reviver This JSON reviver has nothing to do with
     *   our revivers.
     * @param {object} opts
     * @returns {external:JSON}
     */
    parse (text, reviver, opts) {
        opts = {...this.options, ...opts, parse: true};
        return this.revive(JSON.parse(text, reviver), opts);
    }

    /**
    * Also sync but throws on non-sync result
    * @param {string} text
    * @param {function} reviver This JSON reviver has nothing to do with
    *   our revivers.
    * @param {object} opts
    * @returns {external:JSON}
    */
    parseSync (text, reviver, opts) {
        return this.parse(
            text,
            reviver,
            {throwOnBadSyncType: true, ...opts, sync: true}
        );
    }
    /**
    * @param {string} text
    * @param {function} reviver This JSON reviver has nothing to do with
    *   our revivers.
    * @param {object} opts
    * @returns {Promise} Resolves to `external:JSON`
    */
    parseAsync (text, reviver, opts) {
        return this.parse(
            text,
            reviver,
            {throwOnBadSyncType: true, ...opts, sync: false}
        );
    }

    /**
     *
     * @param {*} obj
     * @param {object} stateObj
     * @param {object} [opts={}]
     * @returns {string[]|false}
     */
    specialTypeNames (obj, stateObj, opts = {}) {
        opts.returnTypeNames = true;
        return this.encapsulate(obj, stateObj, opts);
    }

    /**
     *
     * @param {*} obj
     * @param {object} stateObj
     * @param {object} [opts={}]
     * @returns {Promise|Array|object|string|false}
     */
    rootTypeName (obj, stateObj, opts = {}) {
        opts.iterateNone = true;
        return this.encapsulate(obj, stateObj, opts);
    }

    /**
     * Encapsulate a complex object into a plain Object by replacing
     * registered types with plain objects representing the types data.
     *
     * This method is used internally by T`ypeson.stringify()`.
     * @param {Object} obj - Object to encapsulate.
     * @param {object} stateObj
     * @param {object} opts
     * @returns {Promise|Array|object|string|false}
     */
    encapsulate (obj, stateObj, opts) {
        opts = {sync: true, ...this.options, ...opts};
        const {sync} = opts;

        const that = this,
            types = {},
            refObjs = [], // For checking cyclic references
            refKeys = [], // For checking cyclic references
            promisesDataRoot = [];

        // Clone the object deeply while at the same time replacing any
        //   special types or cyclic reference:
        const cyclic = 'cyclic' in opts ? opts.cyclic : true;
        const {encapsulateObserver} = opts;
        const ret = _encapsulate(
            '', obj, cyclic, stateObj || {},
            promisesDataRoot
        );

        /**
         *
         * @param {*} ret
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

                // Special if array (or a primitive) was serialized
                //   because JSON would ignore custom `$types` prop on it
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
         * @param {*} ret
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
                    const isTypesonPromise = hasConstructorOf(
                        encaps,
                        TypesonPromise
                    );
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
                        //   original value supplied was a `Promise` or
                        //   because the supplied custom type value resolved
                        //   to one), returning it below will be fine since
                        //   a `Promise` is expected anyways given current
                        //   config (and if not a `Promise`, it will be ready
                        //   as the resolve value)
                        ret = encaps;
                    }
                    return checkPromises(ret, newPromisesData);
                })
            );
            return ret;
        }

        /**
         *
         * @param {object} stateObj
         * @param {object} ownKeysObj
         * @param {function} cb
         * @returns {undefined}
         */
        function _adaptBuiltinStateObjectProperties (
            stateObj, ownKeysObj, cb
        ) {
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
         * @returns {*}
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
                        awaitingTypesonPromise: hasConstructorOf(
                            value,
                            TypesonPromise
                        )
                    }, type !== undefined ? {type} : {}));
                }
                : null;
            if (['string', 'boolean', 'number', 'undefined'].includes(
                $typeof
            )) {
                if (value === undefined || ($typeof === 'number' &&
                    (isNaN(value) || value === -Infinity ||
                        value === Infinity)
                )) {
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
            if (cyclic && !stateObj.iterateIn &&
                !stateObj.iterateUnsetNumeric
            ) {
                // Options set to detect cyclic references and be able
                //   to rewrite them.
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
                // Running replace will cause infinite loop as will test
                //   positive again
                ((isPlainObj || isArr) &&
                    (!that.plainObjectReplacers.length ||
                        stateObj.replaced)) ||
                stateObj.iterateIn
            )
                // Optimization: if plain object and no plain-object
                //   replacers, don't try finding a replacer
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
                if ((isArr && stateObj.iterateIn !== 'object') ||
                    stateObj.iterateIn === 'array'
                ) {
                    clone = new Array(value.length);
                    observerData = {clone};
                } else if (isPlainObj || stateObj.iterateIn === 'object') {
                    clone = {};
                    if (stateObj.addLength) {
                        clone.length = value.length;
                    }
                    observerData = {clone};
                } else if (keypath === '' &&
                    hasConstructorOf(value, TypesonPromise)
                ) {
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
                    _adaptBuiltinStateObjectProperties(
                        stateObj,
                        ownKeysObj,
                        () => {
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
                        }
                    );
                }
                if (runObserver) {
                    runObserver({endIterateIn: true, end: true});
                }
            } else {
                // Note: Non-indexes on arrays won't survive stringify so
                //  somewhat wasteful for arrays, but so too is iterating
                //  all numeric indexes on sparse arrays when not wanted
                //  or filtering own keys for positive integers
                keys(value).forEach(function (key) {
                    const kp = keypath + (keypath ? '.' : '') +
                        escapeKeyPathComponent(key);
                    const ownKeysObj = {ownKeys: true};
                    _adaptBuiltinStateObjectProperties(
                        stateObj,
                        ownKeysObj,
                        () => {
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
                        }
                    );
                });
                if (runObserver) {
                    runObserver({endIterateOwn: true, end: true});
                }
            }
            // Iterate array for non-own numeric properties (we can't
            //   replace the prior loop though as it iterates non-integer
            //   keys)
            if (stateObj.iterateUnsetNumeric) {
                const vl = value.length;
                for (let i = 0; i < vl; i++) {
                    if (!(i in value)) {
                        // No need to escape numeric
                        const kp = keypath + (keypath ? '.' : '') + i;

                        const ownKeysObj = {ownKeys: false};
                        _adaptBuiltinStateObjectProperties(
                            stateObj,
                            ownKeysObj,
                            () => {
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
                            }
                        );
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
         * @returns {*}
         */
        function replace (
            keypath, value, stateObj, promisesData, plainObject,
            resolvingTypesonPromise, runObserver
        ) {
            // Encapsulate registered types
            const replacers = plainObject
                ? that.plainObjectReplacers
                : that.nonplainObjectReplacers;
            let i = replacers.length;
            while (i--) {
                const replacer = replacers[i];
                if (replacer.test(value, stateObj)) {
                    const {type} = replacer;
                    if (that.revivers[type]) {
                        // Record the type only if a corresponding reviver
                        //   exists. This is to support specs where only
                        //   replacement is done.
                        // For example, ensuring deep cloning of the object,
                        //   or replacing a type to its equivalent without
                        //   the need to revive it.
                        const existing = types[keypath];
                        // type can comprise an array of types (see test
                        //   `shouldSupportIntermediateTypes`)
                        types[keypath] = existing
                            ? [type].concat(existing)
                            : type;
                    }
                    // Now, also traverse the result in case it contains its
                    //   own types to replace
                    Object.assign(stateObj, {type, replaced: true});
                    if ((sync || !replacer.replaceAsync) &&
                        !replacer.replace
                    ) {
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

        return promisesDataRoot.length
            ? sync && opts.throwOnBadSyncType
                ? (() => {
                    throw new TypeError(
                        'Sync method requested but async result obtained'
                    );
                })()
                : Promise.resolve(
                    checkPromises(ret, promisesDataRoot)
                ).then(finish)
            : !sync && opts.throwOnBadSyncType
                ? (() => {
                    throw new TypeError(
                        'Async method requested but sync result obtained'
                    );
                })()
                // If this is a synchronous request for stringification, yet
                //   a promise is the result, we don't want to resolve leading
                //   to an async result, so we return an array to avoid
                //   ambiguity
                : (opts.stringification && sync
                    ? [finish(ret)]
                    : (sync
                        ? finish(ret)
                        : Promise.resolve(finish(ret))
                    ));
    }

    /**
     * Also sync but throws on non-sync result
     * @param {*} obj
     * @param {object} stateObj
     * @param {object} opts
     * @returns {*}
     */
    encapsulateSync (obj, stateObj, opts) {
        return this.encapsulate(obj, stateObj, {
            throwOnBadSyncType: true, ...opts, sync: true
        });
    }

    /**
     * @param {*} obj
     * @param {object} stateObj
     * @param {object} opts
     * @returns {*}
     */
    encapsulateAsync (obj, stateObj, opts) {
        return this.encapsulate(obj, stateObj, {
            throwOnBadSyncType: true, ...opts, sync: false
        });
    }

    /**
     * Revive an encapsulated object.
     * This method is used internally by `Typeson.parse()`.
     * @param {object} obj - Object to revive. If it has `$types` member, the
     *   properties that are listed there will be replaced with its true type
     *   instead of just plain objects.
     * @param {object} opts
     * @throws TypeError If mismatch between sync/async type and result
     * @returns {Promise|*} If async, returns a Promise that resolves to `*`
     */
    revive (obj, opts) {
        let types = obj && obj.$types;

        // No type info added. Revival not needed.
        if (!types) {
            return obj;
        }

        // Object happened to have own `$types` property but with
        //   no actual types, so we unescape and return that object
        if (types === true) {
            return obj.$;
        }

        opts = {sync: true, ...this.options, ...opts};
        const {sync} = opts;
        const keyPathResolutions = [];
        const stateObj = {};

        let ignore$Types = true;
        // Special when root object is not a trivial Object, it will
        //   be encapsulated in `$`. It will also be encapsulated in
        //   `$` if it has its own `$` property to avoid ambiguity
        if (types.$ && isPlainObject(types.$)) {
            obj = obj.$;
            types = types.$;
            ignore$Types = false;
        }

        const that = this;
        function revivePlainObjects () {
            // const references = [];
            // const reviveTypes = [];
            const plainObjectTypes = [];
            Object.entries(types).forEach(([
                keypath, type
            ]) => {
                if (type === '#') {
                    /*
                    references.push({
                        keypath,
                        reference: getByKeyPath(obj, keypath)
                    });
                    */
                    return;
                }
                [].concat(type).forEach(function (type) {
                    const [, {plain}] = that.revivers[type];
                    if (!plain) {
                        // reviveTypes.push({keypath, type});
                        return;
                    }
                    plainObjectTypes.push({keypath, type});
                    delete types[keypath]; // Avoid repeating
                });
            });
            if (!plainObjectTypes.length) {
                return;
            }
            // Handle plain object revivers first so reference
            //   setting can use revived type (e.g., array instead
            //   of object); assumes revived has same structure
            //   or will otherwise break subsequent references
            return plainObjectTypes.sort(nestedPathsFirst).reduce(
                function reducer (possibleTypesonPromise, {
                    keypath, type
                }) {
                    if (hasConstructorOf(
                        possibleTypesonPromise, TypesonPromise
                    )) {
                        // TypesonPromise here too
                        return possibleTypesonPromise.then((v) => {
                            return reducer(v, type);
                        });
                    }
                    let val = getByKeyPath(obj, keypath);
                    if (hasConstructorOf(val, TypesonPromise)) {
                        return val.then((v) => { // TypesonPromise here too
                            return reducer(v, type);
                        });
                    }
                    const [reviver] = that.revivers[type];
                    if (!reviver) {
                        throw new Error('Unregistered type: ' + type);
                    }
                    val = reviver[
                        sync && reviver.revive
                            ? 'revive'
                            : !sync && reviver.reviveAsync
                                ? 'reviveAsync'
                                : 'revive'
                    ](val, stateObj);

                    if (val === undefined) {
                        return undefined;
                    }
                    if (hasConstructorOf(val, Undefined)) {
                        val = undefined;
                    }
                    const newVal = setAtKeyPath(obj, keypath, val);
                    if (newVal === val) {
                        obj = val;
                    }
                    return undefined;
                },
                undefined // This argument must be explicit
            );
            // references.forEach(({keypath, reference}) => {});
            // reviveTypes.sort(nestedPathsFirst).forEach(() => {});
        }

        /**
         *
         * @param {string} keypath
         * @param {*} value
         * @param {?(Array|object)} target
         * @param {Array|object} [clone]
         * @param {string} [key]
         * @returns {*}
         */
        function _revive (keypath, value, target, clone, key) {
            if (ignore$Types && keypath === '$types') {
                return undefined;
            }
            const type = types[keypath];
            if (isArray(value) || isPlainObject(value)) {
                const clone = isArray(value) ? new Array(value.length) : {};
                // Iterate object or array
                keys(value).forEach((k) => {
                    const val = _revive(
                        keypath + (keypath ? '.' : '') +
                            escapeKeyPathComponent(k), value[k],
                        target || clone,
                        clone,
                        k
                    );
                    if (hasConstructorOf(val, Undefined)) {
                        clone[k] = undefined;
                    } else if (val !== undefined) {
                        clone[k] = val;
                    }
                });
                value = clone;
                // Try to resolve cyclic reference as soon as available
                while (keyPathResolutions.length) {
                    const [[target, keyPath, clone, k]] = keyPathResolutions;
                    const val = getByKeyPath(target, keyPath);
                    if (hasConstructorOf(val, Undefined)) {
                        clone[k] = undefined;
                    } else if (val !== undefined) {
                        clone[k] = val;
                    } else {
                        break;
                    }
                    keyPathResolutions.splice(0, 1);
                }
            }
            if (!type) {
                return value;
            }
            if (type === '#') {
                const ret = getByKeyPath(target, value.slice(1));
                if (ret === undefined) { // Cyclic reference not yet available
                    keyPathResolutions.push([
                        target, value.slice(1), clone, key
                    ]);
                }
                return ret;
            }
            return [].concat(type).reduce(function reducer (val, type) {
                if (hasConstructorOf(val, TypesonPromise)) {
                    return val.then((v) => { // TypesonPromise here too
                        return reducer(v, type);
                    });
                }
                const [reviver] = that.revivers[type];
                if (!reviver) {
                    throw new Error('Unregistered type: ' + type);
                }
                return reviver[
                    sync && reviver.revive
                        ? 'revive'
                        : !sync && reviver.reviveAsync
                            ? 'reviveAsync'
                            : 'revive'
                ](val, stateObj);
            }, value);
        }

        function checkUndefined (retrn) {
            return hasConstructorOf(retrn, Undefined) ? undefined : retrn;
        }

        const possibleTypesonPromise = revivePlainObjects();
        let ret;
        if (hasConstructorOf(possibleTypesonPromise, TypesonPromise)) {
            ret = possibleTypesonPromise.then(() => {
                return _revive('', obj, null);
            });
        } else {
            ret = _revive('', obj, null);
        }

        return isThenable(ret)
            ? sync && opts.throwOnBadSyncType
                ? (() => {
                    throw new TypeError(
                        'Sync method requested but async result obtained'
                    );
                })()
                : hasConstructorOf(ret, TypesonPromise)
                    ? ret.p.then(checkUndefined)
                    : ret
            : !sync && opts.throwOnBadSyncType
                ? (() => {
                    throw new TypeError(
                        'Async method requested but sync result obtained'
                    );
                })()
                : sync
                    ? checkUndefined(ret)
                    : Promise.resolve(checkUndefined(ret));
    }

    /**
     * Also sync but throws on non-sync result
     * @param {*} obj
     * @param {object} opts
     * @returns {*}
     */
    reviveSync (obj, opts) {
        return this.revive(obj, {
            throwOnBadSyncType: true, ...opts, sync: true
        });
    }

    /**
    * @param {*} obj
    * @param {object} opts
    * @returns {Promise} Resolves to `*`
    */
    reviveAsync (obj, opts) {
        return this.revive(obj, {
            throwOnBadSyncType: true, ...opts, sync: false
        });
    }

    /**
     * Register types.
     * For examples on how to use this method, see
     *   {@link https://github.com/dfahlander/typeson-registry/tree/master/types}
     * @param {Array.<Object.<string,Function[]>>} typeSpecSets - Types and
     *   their functions [test, encapsulate, revive];
     * @param {object} opts
     * @returns {Typeson}
     */
    register (typeSpecSets, opts) {
        opts = opts || {};
        [].concat(typeSpecSets).forEach(function R (typeSpec) {
            // Allow arrays of arrays of arrays...
            if (isArray(typeSpec)) {
                return typeSpec.map(R, this);
            }
            typeSpec && keys(typeSpec).forEach(function (typeId) {
                if (typeId === '#') {
                    throw new TypeError(
                        '# cannot be used as a type name as it is reserved ' +
                        'for cyclic objects'
                    );
                } else if (Typeson.JSON_TYPES.includes(typeId)) {
                    throw new TypeError(
                        'Plain JSON object types are reserved as type names'
                    );
                }
                let spec = typeSpec[typeId];
                const replacers = spec.testPlainObjects
                    ? this.plainObjectReplacers
                    : this.nonplainObjectReplacers;
                const existingReplacer = replacers.filter(function (r) {
                    return r.type === typeId;
                });
                if (existingReplacer.length) {
                    // Remove existing spec and replace with this one.
                    replacers.splice(replacers.indexOf(existingReplacer[0]), 1);
                    delete this.revivers[typeId];
                    delete this.types[typeId];
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
                        revive: (x) => Object.assign(
                            Object.create(Class.prototype), x
                        )
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
                    this.plainObjectReplacers.splice(start, 0, replacerObj);
                } else {
                    this.nonplainObjectReplacers.splice(start, 0, replacerObj);
                }
                // Todo: We might consider a testAsync type
                if (spec.revive || spec.reviveAsync) {
                    const reviverObj = {};
                    if (spec.revive) {
                        reviverObj.revive = spec.revive.bind(spec);
                    }
                    if (spec.reviveAsync) {
                        reviverObj.reviveAsync = spec.reviveAsync.bind(spec);
                    }
                    this.revivers[typeId] = [reviverObj, {
                        plain: spec.testPlainObjects
                    }];
                }

                // Record to be retrieved via public types property.
                this.types[typeId] = spec;
            }, this);
        }, this);
        return this;
    }
}

/**
 * We keep this function minimized so if using two instances of this
 * library, where one is minimized and one is not, it will still work
 * with `hasConstructorOf`.
 * @constructor
 */
class Undefined{} // eslint-disable-line space-before-blocks

// The following provide classes meant to avoid clashes with other values

// To insist `undefined` should be added
Typeson.Undefined = Undefined;
// To support async encapsulation/stringification
Typeson.Promise = TypesonPromise;

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
