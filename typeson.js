/**
 * @file Typeson - JSON with types.
 * @license The MIT License (MIT)
 * @copyright (c) 2016-2018 David Fahlander, Brett Zamir
 */

/**
 * @typedef {number} Integer
 */

/**
 * @typedef {object} StateObject
 * @property {string} [type]
 * @property {boolean} [replaced]
 * @property {"object"|"array"} [iterateIn]
 * @property {boolean} [iterateUnsetNumeric]
 * @property {boolean} [iterateSymbols] Iterate enumerable own Symbol-keyed
 *   properties (see also the `iterateSymbols` option)
 * @property {boolean} [addLength]
 * @property {boolean} [ownKeys]
 */

/**
 * @callback Tester
 * @param {any} value
 * @param {StateObject} stateobj
 * @returns {boolean}
 */

/**
 * @callback Replacer
 * @param {any} value
 * @param {StateObject} stateObj
 * @returns {any} Should be JSON-stringifiable
 */

/**
 * @callback AsyncReplacer
 * @param {any} value
 * @param {StateObject} stateObj
 * @returns {TypesonPromise<any>} Should be JSON-stringifiable
 */

/**
 * @callback Reviver
 * @param {any} value May not be JSON if processed already by another type
 * @param {StateObject} stateObj
 * @returns {any}
 */

/**
 * @callback AsyncReviver
 * @param {any} value May not be JSON if processed already by another type
 * @param {StateObject} stateObj
 * @returns {TypesonPromise<any>|Promise<any>}
 */

/**
 * @typedef {{
 *   testPlainObjects?: boolean,
 *   test?: Tester,
 *   replace?: Replacer,
 *   replaceAsync?: AsyncReplacer,
 *   revive?: Reviver,
 *   reviveAsync?: AsyncReviver
 * }} Spec
 */

/**
 * @typedef {{
 *   [key: string]:
 *     Spec|Function|[Tester, Replacer, Reviver?]|(new () => any)|null
 * }} TypeSpecSet
 */

/**
 * @typedef {(TypeSpecSet|Preset)[]} Preset
 */

/**
 * @typedef {import(
 *   './utils/classMethods.js'
 * ).ObjectTypeString} ObjectTypeString
 */

/**
 * @typedef {{
 *   type: string,
 *   test: (val: any, stateObj: StateObject) => boolean,
 *   replace?: Replacer,
 *   replaceAsync?: AsyncReplacer
 * }} ReplacerObject
 */

/**
 * @typedef {{
 *   revive?: Reviver,
 *   reviveAsync?: AsyncReviver
 * }} ReviverObject
 */

import {TypesonPromise} from './utils/TypesonPromise.js';
import {
    isPlainObject, isObject, hasConstructorOf,
    isThenable,
    escapeKeyPathComponent,
    getByKeyPath, setAtKeyPath, getJSONType
} from './utils/classMethods.js';

const {keys, hasOwn} = Object,
    {isArray} = Array,
    internalStateObjPropsToIgnore = /** @type {const} */ ([
        'type', 'replaced', 'iterateIn', 'iterateUnsetNumeric',
        'iterateSymbols', 'addLength'
    ]);

/**
 * @param {object} obj
 * @param {string|Integer} key
 * @param {any} value
 * @returns {void}
 */
function setOwnEnumerable (obj, key, value) {
    Object.defineProperty(obj, key, {
        configurable: true,
        enumerable: true,
        value,
        writable: true
    });
}

// Names of the well-known symbols (`Symbol.iterator`, `Symbol.toStringTag`,
//   etc.); these have a portable identity across realms via their name.
const wellKnownSymbolNames = /** @type {const} */ ([
    'asyncIterator', 'hasInstance', 'isConcatSpreadable', 'iterator',
    'match', 'matchAll', 'replace', 'search', 'species', 'split',
    'toPrimitive', 'toStringTag', 'unscopables'
]);

/**
 * @typedef {{for: string}|{wellKnown: string}|{registered: string}}
 *   SymbolKeyIdentity
 */

/**
 * Optional property-descriptor bits for a Symbol-keyed entry in the
 * `$symbolKeys` map. Currently unused by encapsulation (only enumerable
 * own Symbol keys are iterated and they are revived as plain data
 * properties); reserved so that attributes such as `enumerable` can be
 * added later without a breaking format change. When absent, an entry is
 * revived as a configurable, writable, enumerable data property.
 * @typedef {{
 *   enumerable?: boolean,
 *   writable?: boolean,
 *   configurable?: boolean
 * }} SymbolKeyDescriptor
 */

/**
 * Describe a Symbol in a way that can be serialized and later revived to a
 * Symbol with the same identity. Returns `null` for a plain `Symbol()` that
 * was not registered (it has no portable identity).
 * @param {symbol} sym
 * @param {Map<symbol, string>} symbolsByValue
 * @returns {SymbolKeyIdentity|null}
 */
function resolveSymbolIdentity (sym, symbolsByValue) {
    const globalKey = Symbol.keyFor(sym);
    if (globalKey !== undefined) {
        return {for: globalKey};
    }
    const wellKnown = wellKnownSymbolNames.find((name) => {
        return Symbol[name] === sym;
    });
    if (wellKnown) {
        return {wellKnown};
    }
    const registered = symbolsByValue.get(sym);
    if (registered !== undefined) {
        return {registered};
    }
    return null;
}

/**
 * Reverse of {@link resolveSymbolIdentity}.
 * @param {SymbolKeyIdentity} identity
 * @param {{[name: string]: symbol}} symbolsByName
 * @throws {Error} If a registered identity names an unknown Symbol
 * @returns {symbol}
 */
function resolveSymbolFromIdentity (identity, symbolsByName) {
    if ('for' in identity) {
        return Symbol.for(identity.for);
    }
    if ('wellKnown' in identity) {
        const name = wellKnownSymbolNames.find((nm) => {
            return nm === identity.wellKnown;
        });
        if (!name) {
            throw new Error(
                'Unknown well-known Symbol: ' + identity.wellKnown
            );
        }
        return Symbol[name];
    }
    if (!hasOwn(symbolsByName, identity.registered)) {
        throw new Error('Unregistered symbol: ' + identity.registered);
    }
    return symbolsByName[identity.registered];
}

/**
 * @typedef {object} PlainObjectType
 * @property {string} keypath
 * @property {string} type
 */

/**
 * Handle plain object revivers first so reference setting can use
 * revived type (e.g., array instead of object); assumes revived
 * has same structure or will otherwise break subsequent references.
 * @param {PlainObjectType} a
 * @param {PlainObjectType} b
 * @returns {1|-1|0}
 */
function nestedPathsFirst (a, b) {
    if (a.keypath === '') {
        return -1;
    }

    let as = a.keypath.match(/\./gu) ?? 0;
    let bs = b.keypath.match(/\./gu) ?? 0;
    if (as) {
        as = /** @type {RegExpMatchArray} */ (as).length;
    }
    if (bs) {
        bs = /** @type {RegExpMatchArray} */ (bs).length;
    }

    return as > bs
        ? -1
        : as < bs
            ? 1
            : a.keypath < b.keypath
                ? -1
                : a.keypath > b.keypath
                    ? 1
                    // Keypath should never be the same
                    /* c8 ignore next 1 */
                    : 0;
}

/**
 * @typedef {object} KeyPathEvent
 * @property {string} [cyclicKeypath]
 */

/**
 * @typedef {object} EndIterateInEvent
 * @property {boolean} [endIterateIn]
 * @property {boolean} [end]
 */

/**
 * @typedef {{
 *   endIterateOwn?: boolean
 * }} EndIterateOwnEvent
 */

/**
 * @typedef {object} EndIterateUnsetNumericEvent
 * @property {boolean} [endIterateUnsetNumeric]
 * @property {boolean} [end]
 */

/**
 * @typedef {object} EndIterateSymbolsEvent
 * @property {boolean} [endIterateSymbols]
 * @property {boolean} [end]
 */

/**
 * @typedef {object} TypeDetectedEvent
 * @property {boolean} [typeDetected]
 */

/**
 * @typedef {object} ReplacingEvent
 * @property {boolean} [replacing]
 */

/**
 * @typedef {[
 *   keyPath: string,
 *   value: object|Array<any>|TypesonPromise<any>,
 *   cyclic: boolean|"readonly"|undefined,
 *   stateObj: StateObject,
 *   clone: {[key: (string|Integer)]: any}|undefined,
 *   key: string|Integer|undefined,
 *   stateObjType: string|undefined
 * ][]} PromisesData
 */

/**
 * @typedef {KeyPathEvent & EndIterateInEvent & EndIterateOwnEvent &
 *   EndIterateUnsetNumericEvent & EndIterateSymbolsEvent &
 *   TypeDetectedEvent & ReplacingEvent & {} & {
 *   replaced?: any
 * } & {
 *   clone?: {[key: string]: any}
 * } & {
 *   keypath: string,
 *   value: any,
 *   cyclic: boolean|undefined|"readonly",
 *   stateObj: StateObject,
 *   promisesData: PromisesData,
 *   resolvingTypesonPromise: ?boolean|undefined,
 *   awaitingTypesonPromise: boolean
 * } & {type: string}} ObserverData
 */

/**
 * @typedef {(data: ObserverData) => void} EncapsulateObserver
 */

/**
 * @typedef {object} EncapsulateErrorAction
 * @property {boolean} [ignore]
 * @property {any} [substitute]
 */

/**
 * @typedef {object} EncapsulateErrorData
 * @property {string} keypath
 * @property {any} error
 * @property {any} parent
 * @property {string|Integer} key
 * @property {StateObject} stateObj
 * @property {string} type
 */

/**
 * @callback EncapsulateErrorHandler
 * @param {EncapsulateErrorData} data
 * @returns {EncapsulateErrorAction|void}
 */

/**
 * @callback Observer
 * @param {KeyPathEvent|EndIterateInEvent|EndIterateOwnEvent|
 *   EndIterateUnsetNumericEvent|EndIterateSymbolsEvent|
 *   TypeDetectedEvent|ReplacingEvent} [event]
 * @returns {void}
 */

/**
 * @typedef {object} TypesonOptions
 * @property {boolean} [stringification] Auto-set by `stringify`
 * @property {boolean} [parse] Auto-set by `parse`
 * @property {boolean} [sync] Can be overridden when auto-set by
 *  `encapsulate` and `revive`.
 * @property {boolean} [returnTypeNames] Auto-set by `specialTypeNames`
 * @property {boolean} [iterateNone] Auto-set by `rootTypeName`
 * @property {boolean} [cyclic]
 * @property {boolean} [throwOnBadSyncType] Auto-set by `stringifyAsync`,
 *  `stringifySync`, `parseSync`, `parseAsync`, `encapsulateSync`,
 *  `encapsulateAync`, `reviveSync`, `reviveAsync`
 * @property {number|boolean} [fallback] `true` sets to 0. Default is
 *  positive infinity. Used within `register`
 * @property {{[name: string]: symbol}} [symbols] Map of names to local
 *  `Symbol()` instances, so that Symbol-keyed properties using them can be
 *  revived with the same identity. Both ends must supply the same map.
 * @property {boolean} [iterateSymbols] Iterate enumerable own Symbol-keyed
 *  properties of every object (a type may instead set `iterateSymbols` on
 *  its state object to enable this only for its own instances).
 * @property {boolean} [throwOnUnregisteredSymbol] Throw (rather than
 *  silently skip) when a Symbol-keyed property uses a Symbol with no
 *  portable identity (not global, not well-known, and not in `symbols`).
 * @property {EncapsulateObserver} [encapsulateObserver]
 * @property {EncapsulateErrorHandler} [encapsulateError]
 */

/**
 * An instance of this class can be used to call `stringify()` and `parse()`.
 * Typeson resolves cyclic references by default. Can also be extended to
 * support custom types using the register() method.
 *
 * @class
 * @param {{cyclic: boolean}} [options] - if cyclic (default true),
 *   cyclic references will be handled gracefully.
 */
class Typeson {
    /**
     * @param {TypesonOptions} [options]
     */
    constructor (options) {
        this.options = options;

        // Replacers signature: replace (value). Returns falsy if not
        //   replacing. Otherwise ['Date', value.getTime()]

        /** @type {ReplacerObject[]} */
        this.plainObjectReplacers = [];

        /** @type {ReplacerObject[]} */
        this.nonplainObjectReplacers = [];

        // Revivers: [{type => reviver}, {plain: boolean}].
        //   Sample: [{'Date': value => new Date(value)}, {plain: false}]

        /**
         * @type {{
         *   [key: string]: [
         *   ReviverObject|undefined,
         *   {plain: boolean|undefined}
         * ]|undefined}}
         */
        this.revivers = {};

        /** Types registered via `register()`. */

        /** @type {TypeSpecSet} */
        this.types = {};

        // Symbol-key identity maps, populated from the `symbols` option.
        //   `symbolsByName` is used on revival to look a Symbol up by the
        //   name it was registered under; `symbolsByValue` is used on
        //   encapsulation to find the name for an encountered Symbol.

        /** @type {{[name: string]: symbol}} */
        this.symbolsByName = Object.create(null);

        /** @type {Map<symbol, string>} */
        this.symbolsByValue = new Map();

        const symbolsOption = options?.symbols;
        if (symbolsOption) {
            Object.entries(symbolsOption).forEach(([name, sym]) => {
                if (typeof sym !== 'symbol') {
                    throw new TypeError(
                        'Non-symbol value supplied for `symbols` entry: ' +
                        name
                    );
                }
                this.symbolsByName[name] = sym;
                this.symbolsByValue.set(sym, name);
            });
        }
    }

    /**
     * @typedef {null|boolean|number|string} Primitive
     */

    /**
     * @typedef {Primitive|Primitive[]|{[key: string]: JSON}} JSON
     */

    /**
     * @callback JSONReplacer
     * @param {""|string} key
     * @param {JSON} value
     * @returns {any}
     * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify#The%20replacer%20parameter
     */

    /**
     * Serialize given object to Typeson.
     * Initial arguments work identical to those of `JSON.stringify`.
     * The `replacer` argument has nothing to do with our replacers.
     * @param {any} obj
     * @param {?(JSONReplacer|string[]|undefined)} [replacer]
     * @param {number|string|null|undefined} [space]
     * @param {TypesonOptions} [opts]
     * @returns {string|Promise<string>} Promise resolves to a string
     */
    stringify (obj, replacer, space, opts) {
        opts = {...this.options, ...opts, stringification: true};
        const encapsulated = this.encapsulate(obj, null, opts);
        if (isArray(encapsulated)) {
            return JSON.stringify(
                encapsulated[0],
                // Casting type due to error in JSON.stringify type
                //   not accepting `null`
                /** @type {JSONReplacer|undefined} */ (replacer),
                /** @type {string|number|undefined} */ (space)
            );
        }
        return /** @type {Promise<string>} */ (encapsulated).then((res) => {
            return JSON.stringify(
                res,
                // Casting type due to error in JSON.stringify type
                /** @type {JSONReplacer|undefined} */ (replacer),
                /** @type {string|number|undefined} */ (space)
            );
        });
    }

    /**
     * Also sync but throws on non-sync result.
     * @param {any} obj
     * @param {?(JSONReplacer|string[]|undefined)} [replacer]
     * @param {number|string} [space]
     * @param {TypesonOptions} [opts]
     * @returns {string}
     */
    stringifySync (obj, replacer, space, opts) {
        return /** @type {string} */ (this.stringify(obj, replacer, space, {
            throwOnBadSyncType: true, ...opts, sync: true
        }));
    }

    /**
     *
     * @param {any} obj
     * @param {JSONReplacer|string[]|null|undefined} [replacer]
     * @param {number|string|null|undefined} [space]
     * @param {TypesonOptions} [opts]
     * @returns {Promise<string>}
     */
    stringifyAsync (obj, replacer, space, opts) {
        return /** @type {Promise<string>} */ (
            this.stringify(obj, replacer, space, {
                throwOnBadSyncType: true, ...opts, sync: false
            })
        );
    }

    /**
     * @callback JSONReviver
     * @param {string} key
     * @param {JSON} value
     * @returns {JSON}
     */

    /**
     * Parse Typeson back into an obejct.
     * Initial arguments works identical to those of `JSON.parse()`.
     * @param {string} text
     * @param {?JSONReviver} [reviver] This JSON reviver has nothing to do with
     *   our revivers.
     * @param {TypesonOptions} [opts]
     * @returns {any|Promise<any>}
     */
    parse (text, reviver, opts) {
        opts = {...this.options, ...opts, parse: true};
        return this.revive(
            JSON.parse(text, /** @type {JSONReviver|undefined} */ (reviver)),
            opts
        );
    }

    /**
     * Also sync but throws on non-sync result.
     * @param {string} text
     * @param {JSONReviver} [reviver] This JSON reviver has nothing to do with
     *   our revivers.
     * @param {TypesonOptions} [opts]
     * @returns {any}
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
     * @param {JSONReviver} [reviver] This JSON reviver has nothing to do with
     *   our revivers.
     * @param {TypesonOptions} [opts]
     * @returns {Promise<any>}
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
     * @param {any} obj
     * @param {StateObject|null|undefined} [stateObj]
     * @param {TypesonOptions} [opts]
     * @returns {string[]|false}
     */
    specialTypeNames (obj, stateObj, opts = {}) {
        return /** @type {string[]|false} */ (
            this.encapsulate(obj, stateObj, {
                ...opts, returnTypeNames: true
            })
        );
    }

    /**
     *
     * @param {any} obj
     * @param {StateObject|null|undefined} [stateObj]
     * @param {TypesonOptions} [opts]
     * @returns {Promise<ObjectTypeString|string>|ObjectTypeString|string}
     */
    rootTypeName (obj, stateObj, opts = {}) {
        return (
            /**
             * @type {Promise<ObjectTypeString|string>|
             * ObjectTypeString|string}
             */
            (this.encapsulate(obj, stateObj, {
                ...opts, iterateNone: true
            }))
        );
    }

    /**
     * Encapsulate a complex object into a plain Object by replacing
     * registered types with plain objects representing the types data.
     *
     * This method is used internally by `Typeson.stringify()`.
     * @param {any} obj - Object to encapsulate.
     * @param {StateObject|null|undefined} [stateObj]
     * @param {TypesonOptions} [options]
     * @returns {Promise<any>|
     *   {[key: (string|Integer)]: any}|any|
     *   ObjectTypeString|string|string[]|
     *   false
     * } The ObjectTypeString, string and string[] should only be returned
     *   for `specialTypeNames` and `rootTypeName` calls, not direct use of
     *   this function.
     */
    encapsulate (obj, stateObj, options) {
        const opts = {sync: true, ...this.options, ...options};
        const {sync} = opts;

        /**
         * @type {{
         *   [key: string]: '#'|string|string[]
         * }}
         */
        const types = {},
            /**
             * Symbol-keyed properties encountered while `iterateSymbols` is
             *   in effect, keyed by the (raw) keypath of the owning object;
             *   each entry pairs a portable Symbol description with the
             *   encapsulated value. Attached to the result as `$symbolKeys`.
             * @type {{
             *   [ownerKeypath: string]: {
             *     key: SymbolKeyIdentity,
             *     value?: unknown,
             *     descriptor?: SymbolKeyDescriptor
             *   }[]
             * }}
             */
            symbolKeys = {},
            /** @type {object[]} */
            refObjs = [], // For checking cyclic references
            /** @type {string[]} */
            refKeys = [], // For checking cyclic references
            /** @type {PromisesData} */
            promisesDataRoot = [];

        // Clone the object deeply while at the same time replacing any
        //   special types or cyclic reference:
        const cyclic = 'cyclic' in opts ? opts.cyclic : true;
        const {encapsulateObserver, encapsulateError} = opts;

        /**
         *
         * @param {any} _ret
         * @returns {{[key: (string|Integer)]: any}|string|string[]|
         *   ObjectTypeString|any|false}
         */
        const finish = (_ret) => {
            // Add `$types` to result only if we ever bumped into a
            //  special type (or special case where object has own `$types`)
            const typeNames = Object.values(types);
            if (opts.iterateNone) {
                if (typeNames.length) {
                    return typeNames[0];
                }
                return getJSONType(_ret);
            }
            if (opts.returnTypeNames) {
                return typeNames.length ? [...new Set(typeNames)] : false;
            }

            const hasSymbolKeys = Object.keys(symbolKeys).length > 0;

            // An object that already carries its own `$types` or
            //   `$symbolKeys` string key must be wrapped in `$` to avoid
            //   ambiguity with our metadata (checked before we attach ours).
            const ambiguous = isObject(_ret) &&
                (hasOwn(_ret, '$types') || hasOwn(_ret, '$symbolKeys'));

            if (hasSymbolKeys || typeNames.length) {
                // Special if array (or a primitive) was serialized
                //   because JSON would ignore custom `$types` prop on it
                if (ambiguous || !_ret || !isPlainObject(_ret)) {
                    // The `$types` companion may be empty here when only
                    //   Symbol keys were found; revival tolerates that.
                    _ret = {$: _ret, $types: {$: types}};
                } else if (typeNames.length) {
                    _ret.$types = types;
                }
                if (hasSymbolKeys) {
                    _ret.$symbolKeys = symbolKeys;
                }
            // No special types
            } else if (ambiguous) {
                _ret = {$: _ret, $types: true};
            }
            return _ret;
        };

        /**
         *
         * @param {any} _ret
         * @param {PromisesData} promisesData
         * @returns {Promise<any>}
         */
        const checkPromises = async (_ret, promisesData) => {
            const promResults = await Promise.all(
                promisesData.map((pd) => {
                    return /** @type {TypesonPromise<any>} */ (pd[1]).p;
                })
            );
            await Promise.all(
                promResults.map(async function (promResult) {
                    /** @type {PromisesData} */
                    const newPromisesData = [];
                    // eslint-disable-next-line @stylistic/max-len -- Long
                    // eslint-disable-next-line unicorn/no-unnecessary-splice -- TS
                    const [prData] = promisesData.splice(0, 1);
                    const [
                        keyPath, , _cyclic, _stateObj,
                        parentObj, key, detectedType
                    ] = prData;

                    const encaps = _encapsulate(
                        keyPath, promResult, _cyclic, _stateObj,
                        newPromisesData, true, detectedType
                    );
                    const isTypesonPromise = hasConstructorOf(
                        encaps,
                        TypesonPromise
                    );
                    // Handle case where an embedded custom type itself
                    //   returns a `TypesonPromise`
                    if (keyPath && isTypesonPromise) {
                        const encaps2 = await encaps.p;
                        // Undefined parent only for root which has no `keyPath`
                        setOwnEnumerable(
                            /** @type {object} */ (parentObj),
                            /** @type {string|number} */ (key),
                            encaps2
                        );
                        return checkPromises(_ret, newPromisesData);
                    }
                    if (keyPath) {
                        // Undefined parent only for root which has no `keyPath`
                        setOwnEnumerable(
                            /** @type {object} */ (parentObj),
                            /** @type {string|number} */ (key),
                            encaps
                        );
                    } else if (isTypesonPromise) {
                        _ret = encaps.p;
                    } else {
                        // If this is itself a `TypesonPromise` (because the
                        //   original value supplied was a `Promise` or
                        //   because the supplied custom type value resolved
                        //   to one), returning it below will be fine since
                        //   a `Promise` is expected anyways given current
                        //   config (and if not a `Promise`, it will be ready
                        //   as the resolve value)
                        _ret = encaps;
                    }
                    return checkPromises(_ret, newPromisesData);
                })
            );
            return _ret;
        };

        /**
         * @typedef {object} OwnKeysObject
         * @property {boolean} ownKeys
         */

        /**
         * @callback BuiltinStateObjectPropertiesCallback
         * @returns {void}
         */

        /**
         *
         * @param {StateObject} _stateObj
         * @param {OwnKeysObject} ownKeysObj
         * @param {BuiltinStateObjectPropertiesCallback} cb
         * @returns {void}
         */
        const _adaptBuiltinStateObjectProperties = (
            _stateObj, ownKeysObj, cb
        ) => {
            Object.assign(_stateObj, ownKeysObj);
            const vals = internalStateObjPropsToIgnore.map((prop) => {
                const tmp = _stateObj[prop];
                delete _stateObj[prop];
                return tmp;
            });
            cb();
            internalStateObjPropsToIgnore.forEach((prop, i) => {
                // We're just copying from one StateObject to another,
                //   so force TS with a type each can take
                _stateObj[prop] = /** @type {any} */ (vals[i]);
            });
        };

        /**
         *
         * @param {string} keypath
         * @param {any} value
         * @param {boolean|undefined|"readonly"} _cyclic
         * @param {StateObject} _stateObj
         * @param {PromisesData} promisesData
         * @param {?boolean} [resolvingTypesonPromise]
         * @param {string} [detectedType]
         * @returns {any}
         */
        const _encapsulate = (
            keypath, value, _cyclic, _stateObj, promisesData,
            resolvingTypesonPromise, detectedType
        ) => {
            let _ret;

            /**
             * @type {{}|{
             *   replaced: any
             * }|{
             *   clone: {[key: string]: any}
             * }}
             */
            let observerData = {};
            const $typeof = typeof value;
            const runObserver = encapsulateObserver
                // eslint-disable-next-line @stylistic/max-len -- Long
                // eslint-disable-next-line @stylistic/operator-linebreak -- Needs JSDoc
                ?
                // Bug with TS apparently as can't just use
                //    `@type {Observer}` here as doesn't see param is optional
                /**
                 * @param {KeyPathEvent|EndIterateInEvent|EndIterateOwnEvent|
                 *   EndIterateUnsetNumericEvent|EndIterateSymbolsEvent|
                 *   TypeDetectedEvent|ReplacingEvent} [_obj]
                 * @returns {void}
                 */
                function (_obj) {
                    const type = detectedType ?? _stateObj.type ?? (
                        getJSONType(value)
                    );
                    encapsulateObserver(Object.assign(_obj ?? observerData, {
                        keypath,
                        value,
                        cyclic: _cyclic,
                        stateObj: _stateObj,
                        promisesData,
                        resolvingTypesonPromise,
                        awaitingTypesonPromise: hasConstructorOf(
                            value,
                            TypesonPromise
                        )
                    }, {type}));
                }
                : null;

            /**
             *
             * @param {string} kp
             * @param {any} error
             * @param {any} parent
             * @param {string|Integer} key
             * @returns {any}
             */
            /**
             *
             * @param {string} kp
             * @param {any} parent
             * @param {string|Integer} key
             * @returns {any}
             */
            const getEncapsulatedValue = (kp, parent, key) => {
                try {
                    return {
                        value: _encapsulate(
                            kp, parent[key], Boolean(_cyclic), _stateObj,
                            promisesData, resolvingTypesonPromise
                        )
                    };
                } catch (error) {
                    if (!encapsulateError) {
                        throw error;
                    }
                    const type = detectedType ?? _stateObj.type ??
                        getJSONType(parent);
                    const handled = encapsulateError({
                        keypath: kp,
                        error,
                        parent,
                        key,
                        stateObj: _stateObj,
                        type
                    });
                    if (!handled) {
                        throw error;
                    }
                    if ('substitute' in handled) {
                        return {
                            value: handled.substitute,
                            substitute: true
                        };
                    }
                    if (handled.ignore) {
                        return undefined;
                    }
                    throw error;
                }
            };
            if (['string', 'boolean', 'number', 'undefined'].includes(
                $typeof
            )) {
                if (value === undefined ||
                    (
                        value === Infinity ||
                        // This can be 0 or -0
                        value === 0 ||
                        value === -Infinity ||
                        // Numbers that are not supported in JSON
                        Number.isNaN(value)
                    )
                ) {
                    _ret = _stateObj.replaced
                        ? value
                        : replace(
                            keypath, value, _stateObj, promisesData,
                            false, resolvingTypesonPromise, runObserver
                        );
                    if (_ret !== value) {
                        observerData = {replaced: _ret};
                    }
                } else {
                    _ret = value;
                }
                if (runObserver) {
                    runObserver();
                }
                return _ret;
            }
            if (value === null) {
                if (runObserver) {
                    runObserver();
                }
                return value;
            }
            if (_cyclic && value && typeof value === 'object' &&
                !_stateObj.iterateIn &&
                !_stateObj.iterateUnsetNumeric
            ) {
                // Options set to detect cyclic references and be able
                //   to rewrite them.
                const refIndex = refObjs.indexOf(value);
                if (refIndex === -1) {
                    if (_cyclic === true) {
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
                    (!this.plainObjectReplacers.length ||
                        _stateObj.replaced)
                ) ||
                _stateObj.iterateIn
            )
                // Optimization: if plain object and no plain-object
                //   replacers, don't try finding a replacer
                ? value
                : replace(
                    keypath, value, _stateObj, promisesData,
                    isPlainObj || isArr,
                    null,
                    runObserver
                );

            /** @type {undefined|Array<any>|{[key: string]: any}} */
            let clone;
            if (replaced !== value) {
                _ret = replaced;
                observerData = {replaced};
            } else {
                // eslint-disable-next-line no-lonely-if -- Clearer
                if (keypath === '' &&
                    hasConstructorOf(value, TypesonPromise)
                ) {
                    promisesData.push([
                        keypath, value, _cyclic, _stateObj,
                        undefined, undefined, _stateObj.type
                    ]);
                    _ret = value;
                } else if ((isArr && _stateObj.iterateIn !== 'object') ||
                    _stateObj.iterateIn === 'array'
                ) {
                    // eslint-disable-next-line unicorn/no-new-array -- Sparse
                    clone = new Array(value.length);
                    observerData = {clone};
                } else if (
                    isPlainObj ||
                    (
                        typeof value === 'object' &&
                        !('toJSON' in value) &&
                        !hasConstructorOf(value, TypesonPromise) &&
                        !hasConstructorOf(value, Promise) &&
                        !hasConstructorOf(value, ArrayBuffer)
                    ) ||
                    _stateObj.iterateIn === 'object'
                ) {
                    clone = {};
                    if (_stateObj.addLength) {
                        clone.length = value.length;
                    }
                    observerData = {clone};
                } else {
                    _ret = value; // Only clone vanilla objects and arrays
                }
            }
            if (runObserver) {
                runObserver();
            }

            if (opts.iterateNone) {
                return clone ?? _ret;
            }

            if (!clone) {
                return _ret;
            }

            // Iterate object or array
            if (_stateObj.iterateIn) {
                // eslint-disable-next-line @stylistic/max-len -- Long
                // eslint-disable-next-line guard-for-in -- Guard not wanted here
                for (const key in value) {
                    const ownKeysObj = {ownKeys: hasOwn(value, key)};
                    _adaptBuiltinStateObjectProperties(
                        _stateObj,
                        ownKeysObj,
                        () => {
                            const kp = keypath + (keypath ? '.' : '') +
                                escapeKeyPathComponent(key);
                            const encapsulatedValue =
                                getEncapsulatedValue(kp, value, key);
                            const val = encapsulatedValue &&
                                encapsulatedValue.value;
                            if (hasConstructorOf(val, TypesonPromise)) {
                                promisesData.push([
                                    kp, val, Boolean(_cyclic), _stateObj,
                                    clone, key, _stateObj.type
                                ]);
                            } else if (
                                encapsulatedValue && (
                                    val !== undefined ||
                                    'substitute' in encapsulatedValue
                                )
                            ) {
                                setOwnEnumerable(clone, key, val);
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
                        _stateObj,
                        ownKeysObj,
                        () => {
                            const encapsulatedValue =
                                getEncapsulatedValue(kp, value, key);
                            const val = encapsulatedValue &&
                                encapsulatedValue.value;
                            if (hasConstructorOf(val, TypesonPromise)) {
                                promisesData.push([
                                    kp, val, Boolean(_cyclic), _stateObj,
                                    clone, key, _stateObj.type
                                ]);
                            } else if (
                                encapsulatedValue && (
                                    val !== undefined ||
                                    'substitute' in encapsulatedValue
                                )
                            ) {
                                setOwnEnumerable(clone, key, val);
                            }
                        }
                    );
                });
                if (runObserver) {
                    runObserver({endIterateOwn: true, end: true});
                }

                // Iterate enumerable own Symbol-keyed properties when a type
                //   (via its state object) or the `iterateSymbols` option
                //   asks for it. Each such property is recorded in the
                //   separate `symbolKeys` map (keyed by the owner's keypath)
                //   with a portable description of the Symbol, and its value
                //   is encapsulated at a real keypath under `$symbolKeys` so
                //   `$types` and cyclic-reference handling apply unchanged.
                if (_stateObj.iterateSymbols || opts.iterateSymbols) {
                    Object.getOwnPropertySymbols(value).filter((sym) => {
                        // With regular object keys, we don't iterate
                        //   enumerable properties (e.g., by
                        //   `Object.getOwnPropertyNames`) by default, so,
                        //   for parity, we don't do so for symbols either.
                        //   However, we make space for a `descriptor` if
                        //    this is desired in the future. If we wanted one
                        //    for regular keys, we'd need to add the likes of
                        //    a `$descriptors` property keyed by keypath,
                        //    parallel to $types
                        return Object.prototype.propertyIsEnumerable.call(
                            value, sym
                        );
                    }).forEach((sym) => {
                        const identity = resolveSymbolIdentity(
                            sym, this.symbolsByValue
                        );
                        if (!identity) {
                            if (opts.throwOnUnregisteredSymbol) {
                                throw new TypeError(
                                    'Cannot serialize a Symbol-keyed ' +
                                    'property whose Symbol has no portable ' +
                                    'identity (not global, not well-known, ' +
                                    'and not in the `symbols` option): ' +
                                    String(sym)
                                );
                            }
                            return;
                        }
                        const list = symbolKeys[keypath] ??= [];
                        /**
                         * @type {{
                         *   key: SymbolKeyIdentity,
                         *   value?: unknown,
                         *   descriptor?: SymbolKeyDescriptor
                         * }}
                         */
                        const entry = {key: identity};
                        list.push(entry);
                        const idx = list.length - 1;
                        const kp = `$symbolKeys.${
                            escapeKeyPathComponent(keypath)
                        }.${String(idx)}.value`;
                        const symbolValueHolder = {value: value[sym]};
                        const ownKeysObj = {ownKeys: true};
                        _adaptBuiltinStateObjectProperties(
                            _stateObj,
                            ownKeysObj,
                            () => {
                                const encapsulatedValue = getEncapsulatedValue(
                                    kp, symbolValueHolder, 'value'
                                );
                                const val = encapsulatedValue &&
                                    encapsulatedValue.value;
                                if (hasConstructorOf(val, TypesonPromise)) {
                                    promisesData.push([
                                        kp, val, Boolean(_cyclic), _stateObj,
                                        entry, 'value', _stateObj.type
                                    ]);
                                } else if (
                                    encapsulatedValue && (
                                        val !== undefined ||
                                        'substitute' in encapsulatedValue
                                    )
                                ) {
                                    setOwnEnumerable(entry, 'value', val);
                                }
                            }
                        );
                    });
                    if (runObserver) {
                        runObserver({endIterateSymbols: true, end: true});
                    }
                }
            }
            // Iterate array for non-own numeric properties (we can't
            //   replace the prior loop though as it iterates non-integer
            //   keys)
            if (_stateObj.iterateUnsetNumeric) {
                const vl = value.length;
                for (let i = 0; i < vl; i++) {
                    // eslint-disable-next-line @stylistic/max-len -- Long
                    // eslint-disable-next-line unicorn/no-computed-property-existence-check -- Ok
                    if (i in value) {
                        continue;
                    }

                    // No need to escape numeric
                    const kp = `${keypath}${keypath ? '.' : ''}${
                        String(i)
                    }`;

                    const ownKeysObj = {ownKeys: false};
                    _adaptBuiltinStateObjectProperties(
                        _stateObj,
                        ownKeysObj,
                        () => {
                            const val = _encapsulate(
                                kp, undefined, Boolean(_cyclic), _stateObj,
                                promisesData, resolvingTypesonPromise
                            );
                            if (hasConstructorOf(val, TypesonPromise)) {
                                promisesData.push([
                                    kp, val, Boolean(_cyclic), _stateObj,
                                    clone, i, _stateObj.type
                                ]);
                            } else if (val !== undefined) {
                                setOwnEnumerable(clone, i, val);
                            }
                        }
                    );
                }
                if (runObserver) {
                    runObserver({endIterateUnsetNumeric: true, end: true});
                }
            }
            return clone;
        };

        /**
         *
         * @param {string} keypath
         * @param {any} value
         * @param {StateObject} _stateObj
         * @param {PromisesData} promisesData
         * @param {boolean} plainObject
         * @param {?boolean} [resolvingTypesonPromise]
         * @param {Observer|null} [runObserver]
         * @throws {Error}
         * @returns {any}
         */
        const replace = (
            keypath, value, _stateObj, promisesData, plainObject,
            resolvingTypesonPromise, runObserver
        ) => {
            // Encapsulate registered types
            const replacers = plainObject
                ? this.plainObjectReplacers
                : this.nonplainObjectReplacers;
            let i = replacers.length;
            while (i--) {
                const replacer = replacers[i];
                if (replacer.test(value, _stateObj)) {
                    const {type} = replacer;
                    if (Object.hasOwn(this.revivers, type)) {
                        // Record the type only if a corresponding reviver
                        //   exists. This is to support specs where only
                        //   replacement is done.
                        // For example, ensuring deep cloning of the object,
                        //   or replacing a type to its equivalent without
                        //   the need to revive it.
                        const existing = types[keypath];
                        // type can comprise an array of types (see test
                        //   "should support intermediate types")
                        types[keypath] = existing
                            ? [type].concat(existing)
                            : type;
                    }
                    Object.assign(_stateObj, {type, replaced: true});
                    if ((sync || !replacer.replaceAsync) &&
                        !replacer.replace
                    ) {
                        if (runObserver) {
                            runObserver({typeDetected: true});
                        }
                        return _encapsulate(
                            keypath, value, cyclic && 'readonly',
                            _stateObj, promisesData,
                            resolvingTypesonPromise, type
                        );
                    }
                    if (runObserver) {
                        runObserver({replacing: true});
                    }

                    // Now, also traverse the result in case it contains its
                    //   own types to replace
                    let replaced;
                    if (sync || !replacer.replaceAsync) {
                        // Shouldn't reach here due to above condition
                        /* c8 ignore next 3 */
                        if (typeof replacer.replace === 'undefined') {
                            throw new TypeError('Missing replacer');
                        }
                        replaced = replacer.replace(value, _stateObj);
                    } else {
                        replaced = replacer.replaceAsync(value, _stateObj);
                    }
                    return _encapsulate(
                        keypath,
                        replaced,
                        cyclic && 'readonly', _stateObj, promisesData,
                        resolvingTypesonPromise, type
                    );
                }
            }
            return value;
        };

        const ret = _encapsulate(
            '', obj, cyclic, stateObj ?? {},
            promisesDataRoot
        );

        if (promisesDataRoot.length) {
            return sync && opts.throwOnBadSyncType
                ? (() => {
                    throw new TypeError(
                        'Sync method requested but async result obtained'
                    );
                })()
                : Promise.resolve(
                    checkPromises(ret, promisesDataRoot)
                ).then(finish);
        }
        if (!sync && opts.throwOnBadSyncType) {
            throw new TypeError(
                'Async method requested but sync result obtained'
            );
        }
        // If this is a synchronous request for stringification, yet
        //   a promise is the result, we don't want to resolve leading
        //   to an async result, so we return an array to avoid
        //   ambiguity
        if (sync && opts.stringification) {
            return [finish(ret)];
        }

        if (sync) {
            return finish(ret);
        }
        return Promise.resolve(finish(ret));
    }

    /**
     * Also sync but throws on non-sync result.
     * @param {any} obj
     * @param {StateObject|null|undefined} [stateObj]
     * @param {TypesonOptions} [opts]
     * @returns {any}
     */
    encapsulateSync (obj, stateObj, opts) {
        return this.encapsulate(obj, stateObj, {
            throwOnBadSyncType: true, ...opts, sync: true
        });
    }

    /**
     * @param {any} obj
     * @param {StateObject|null|undefined} [stateObj]
     * @param {TypesonOptions} [opts]
     * @returns {Promise<any>}
     */
    encapsulateAsync (obj, stateObj, opts) {
        return /** @type {Promise<any>} */ (this.encapsulate(obj, stateObj, {
            throwOnBadSyncType: true, ...opts, sync: false
        }));
    }

    /**
     * Revive an encapsulated object.
     * This method is used internally by `Typeson.parse()`.
     * @param {any} obj - Object to revive. If it has a `$types` member,
     *   the properties that are listed there will be replaced with its true
     *   type instead of just plain objects.
     * @param {TypesonOptions} [options]
     * @throws {TypeError} If mismatch between sync/async type and result
     * @returns {Promise<any>|any} If async, returns a Promise that resolves
     * to `any`.
     */
    revive (obj, options) {
        const opts = {sync: true, ...this.options, ...options};
        const {sync} = opts;

        /**
         * @param {any} val
         * @throws {TypeError}
         * @returns {any|Promise<any>}
         */
        function finishRevival (val) {
            if (sync) {
                return val;
            }
            if (opts.throwOnBadSyncType) {
                throw new TypeError(
                    'Async method requested but sync result obtained'
                );
            }
            return Promise.resolve(val);
        }

        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
            return finishRevival(obj);
        }

        let types = obj.$types;

        // Object happened to have own `$types` property but with
        //   no actual types, so we unescape and return that object
        if (types === true) {
            return finishRevival(obj.$);
        }

        // Symbol-keyed properties are recorded separately by `encapsulate`
        //   (see the `$symbolKeys` map); when present, revival is needed
        //   even if there is no `$types` map at all. When the result was
        //   wrapped in `$`, the metadata rode on the wrapper (captured here
        //   before any unwrap). `symbolMetaInTree` tracks whether the
        //   metadata sits on the object `_revive` walks, in which case its
        //   revived copy (with nested types/cyclic refs resolved) is used.
        const symbolKeysMeta = obj.$symbolKeys;
        let symbolMetaInTree = symbolKeysMeta !== undefined;

        // No type info added. Revival not needed (unless Symbol keys were
        //   recorded, in which case we still need to re-home them).
        if (!types || typeof types !== 'object' || Array.isArray(types)) {
            if (!symbolKeysMeta) {
                return finishRevival(obj);
            }
            types = {};
        }

        /**
         * Should be a `clone` and `key` present as pushed when non-root.
         * @type {[
         *   target: ?{[key: string]: any},
         *   keypath: string,
         *   clone: {[key: string]: any},
         *   key: string
         * ][]}
         */
        const keyPathResolutions = [];
        const keyPathValues = Object.create(null);
        const stateObj = {};

        let ignore$Types = true;
        // Special when root object is not a trivial Object, it will
        //   be encapsulated in `$`. It will also be encapsulated in
        //   `$` if it has its own `$` property to avoid ambiguity
        if (types.$ && isPlainObject(types.$)) {
            obj = obj.$;
            types = types.$;
            ignore$Types = false;
            // The `$symbolKeys` metadata rode on the wrapper. Move it onto
            //   the object `_revive` will actually walk so that its
            //   `$symbolKeys...` keypaths resolve as normal — but never
            //   clobber a genuine own `$symbolKeys` property (the reason
            //   this object was wrapped in the first place).
            symbolMetaInTree = false;
            if (symbolKeysMeta !== undefined && isObject(obj) &&
                !hasOwn(obj, '$symbolKeys')
            ) {
                obj.$symbolKeys = symbolKeysMeta;
                symbolMetaInTree = true;
            }
        }

        /**
         *
         * @param {string} type
         * @param {any} val
         * @throws {Error}
         * @returns {any}
         */
        const executeReviver = (type, val) => {
            const [reviver] = this.revivers[type] ?? [];
            if (!reviver) {
                throw new Error('Unregistered type: ' + type);
            }

            // Only `sync` expected here, as problematic async would
            //  be missing both `revive` and `reviveAsync`, and
            //  encapsulation shouldn't have added types, so
            //  should have made an early exit
            if (sync && !('revive' in reviver)) {
                // Just return value as is
                return val;
            }

            if (!sync && reviver.reviveAsync) {
                return reviver.reviveAsync(val, stateObj);
            }
            if (reviver.revive) {
                return reviver.revive(val, stateObj);
            }

            // Shouldn't normally get here
            throw new Error('Missing reviver');
        };

        /**
         *
         * @throws {Error} Throwing only for TS—not an actual error
         * @returns {void|TypesonPromise<void>}
         */
        const revivePlainObjects = () => {
            // const references = [];
            // const reviveTypes = [];

            /* c8 ignore next 3 */
            if (!types) {
                throw new Error('Found bad `types`');
            }
            /** @type {PlainObjectType[]} */
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
                [].concat(type).forEach((_type) => {
                    const [, {plain}] = this.revivers[_type] ?? [null, {}];
                    if (!plain) {
                        // reviveTypes.push({keypath, type: _type});
                        return;
                    }
                    plainObjectTypes.push({keypath, type: _type});

                    delete /** @type {{[key: string]: JSON}} */ (
                        types
                    )[keypath]; // Avoid repeating
                });
            });
            if (!plainObjectTypes.length) {
                return undefined;
            }

            // console.log(plainObjectTypes.sort(nestedPathsFirst));
            plainObjectTypes.sort(nestedPathsFirst);
            return plainObjectTypes.reduce(
                /**
                 * @param {TypesonPromise<any>|undefined} possibleTypesonPromise
                 * @param {PlainObjectType} plainObjectType
                 * @returns {TypesonPromise<any>|undefined}
                 */
                function reducer (possibleTypesonPromise, {
                    keypath, type
                }) {
                    if (isThenable(possibleTypesonPromise)) {
                        return /** @type {TypesonPromise<any>} */ (
                            possibleTypesonPromise
                        ).then((val) => {
                            return reducer(val, {
                                keypath, type
                            });
                        });
                    }
                    // console.log('obj', JSON.stringify(keypath), obj);
                    let val = getByKeyPath(obj, keypath, true);
                    val = executeReviver(type, val);

                    if (hasConstructorOf(
                        val, TypesonPromise
                    )) {
                        return /** @type {TypesonPromise<any>} */ (
                            val
                        ).then((v) => {
                            const newVal = setAtKeyPath(
                                obj, keypath, v, true
                            );
                            if (newVal === v) {
                                obj = newVal;
                            }
                            return undefined;
                        });
                    }
                    const newVal = setAtKeyPath(
                        obj, keypath, val, true
                    );
                    if (newVal === val) {
                        obj = newVal;
                    }
                    return undefined;
                },
                undefined // This argument must be explicit
            );
            // references.forEach(({keypath, reference}) => {});
            // reviveTypes.sort(nestedPathsFirst).forEach(() => {});
        };

        /** @type {TypesonPromise<any>[]} */
        const revivalPromises = [];
        /**
         *
         * @param {string} keypath
         * @param {any} value
         * @param {?{[key: string]: any}} target
         * @param {{[key: string]: any}} [clone]
         * @param {string} [key]
         * @throws {Error}
         * @returns {any}
         */
        function _revive (keypath, value, target, clone, key) {
            if (ignore$Types && keypath === '$types') {
                return undefined;
            }

            const promisesStart = revivalPromises.length;

            const type = hasOwn(types, keypath)
                ? /** @type {{[key: string]: JSON}} */ (types)[keypath]
                : undefined;
            const isArr = isArray(value);
            if (isArr || isPlainObject(value)) {
                /* eslint-disable unicorn/no-new-array -- Sparse */
                /** @type {{[key: string]: any}} */
                const _clone = isArr ? new Array(value.length) : {};
                /* eslint-enable unicorn/no-new-array -- Sparse */

                // Iterate object or array
                keys(value).forEach((k) => {
                    const val = _revive(
                        keypath + (keypath ? '.' : '') +
                            escapeKeyPathComponent(k),
                        value[k],
                        target ?? _clone,
                        _clone,
                        k
                    );

                    /**
                     * @param {unknown} v
                     * @returns {unknown}
                     */
                    const set = (v) => {
                        if (hasConstructorOf(v, Undefined)) {
                            setOwnEnumerable(_clone, k, undefined);
                        } else if (v !== undefined) {
                            setOwnEnumerable(_clone, k, v);
                        }
                        return v;
                    };
                    if (hasConstructorOf(val, TypesonPromise)) {
                        revivalPromises.push(
                            val.then(
                                /**
                                 * @param {unknown} ret
                                 * @returns {unknown}
                                 */
                                (ret) => {
                                    return set(ret);
                                }
                            )
                        );
                    } else {
                        set(val);
                    }
                });
                value = _clone;
                // Try to resolve cyclic reference as soon as available
                while (keyPathResolutions.length) {
                    const [[_target, keyPath, __clone, k]] = keyPathResolutions;
                    const hasTracked = hasOwn(keyPathValues, keyPath);
                    const val = hasTracked
                        ? keyPathValues[keyPath]
                        : getByKeyPath(_target, keyPath, true);
                    if (hasTracked || val !== undefined) {
                        setOwnEnumerable(__clone, k, val);
                    } else {
                        break;
                    }
                    keyPathResolutions.shift();
                }
            }
            if (!type) {
                keyPathValues[keypath] = value;
                return value;
            }
            if (type === '#') {
                const referenceKeypath = value.slice(1);
                const hasTracked = hasOwn(keyPathValues, referenceKeypath);
                const ret = hasTracked
                    ? keyPathValues[referenceKeypath]
                    : getByKeyPath(target, referenceKeypath, true);
                if (!hasTracked && ret === undefined) {
                    // Cyclic reference not yet available
                    keyPathResolutions.push([
                        target, referenceKeypath,
                        // Should be a `clone` and `key` present as
                        //   pushed when non-root (cyclical reference)
                        /** @type {{[key: string]: any }} */ (clone),
                        /** @type {string} */ (key)
                    ]);
                }
                return ret;
            }

            // `type` can be an array here

            /**
             * @param {any} val
             * @returns {any}
             */
            const applyType = (val) => {
                // eslint-disable-next-line @stylistic/max-len -- Long
                const ret = /** @type {(string|number|true|Primitive|{ [key: string]: JSON; })[]} */ (
                    []
                ).concat(type).reduce(function reducer (v, typ) {
                    if (hasConstructorOf(v, TypesonPromise)) {
                        return v.then(
                            /**
                             * @param {unknown} vv
                             * @returns {unknown}
                             */
                            (vv) => {
                                return reducer(vv, typ);
                            }
                        );
                    }
                    if (typeof typ !== 'string') {
                        throw new TypeError('Bad type JSON');
                    }
                    return executeReviver(typ, v);
                }, val);
                if (hasConstructorOf(ret, TypesonPromise)) {
                    return /** @type {TypesonPromise<any>} */ (
                        ret
                    ).then((v) => {
                        keyPathValues[keypath] = v;
                        return v;
                    });
                }
                keyPathValues[keypath] = ret;
                return ret;
            };

            if (!sync && revivalPromises.length > promisesStart) {
                return TypesonPromise.all(
                    revivalPromises.slice(promisesStart)
                ).then(() => {
                    return applyType(value);
                });
            }
            return applyType(value);
        }

        /**
         *
         * @param {any} retrn
         * @returns {undefined|any}
         */
        function checkUndefined (retrn) {
            return hasConstructorOf(retrn, Undefined) ? undefined : retrn;
        }

        /**
         * Re-home Symbol-keyed properties (recorded by `encapsulate` in the
         * `$symbolKeys` map) onto their owning objects once the rest of the
         * tree, including any nested types and cyclic references, has been
         * revived; then drop the `$symbolKeys` scaffolding from `result`.
         * Mutates `result` in place.
         * @param {any} result
         * @returns {void}
         */
        const reHomeSymbolKeys = (result) => {
            /* c8 ignore next 3 -- Defensive; `result` is an object here */
            if (!isObject(result)) {
                return;
            }
            // When the metadata was walked as part of the tree, use its
            //   revived copy (nested types and cyclic references resolved)
            //   and remove the scaffolding afterwards; otherwise fall back
            //   to the raw metadata (plain Symbol values only).
            const meta = symbolMetaInTree
                ? result.$symbolKeys
                : symbolKeysMeta;
            /* c8 ignore next 3 -- Defensive; only a typed root could drop it */
            if (!meta) {
                return;
            }
            Object.entries(meta).forEach(([ownerKeypath, entries]) => {
                const owner = getByKeyPath(result, ownerKeypath, true);
                /* c8 ignore next 3 -- Defensive; owner keypath resolves */
                if (!isObject(owner)) {
                    return;
                }
                /**
                 * @type {{
                 *   key: SymbolKeyIdentity,
                 *   value?: unknown,
                 *   descriptor?: SymbolKeyDescriptor
                 * }[]}
                 */
                (entries).forEach((entry) => {
                    if (!hasOwn(entry, 'value')) {
                        return;
                    }
                    const sym = resolveSymbolFromIdentity(
                        entry.key, this.symbolsByName
                    );
                    const value = checkUndefined(entry.value);
                    if (entry.descriptor) {
                        // Reserved extension point: honor an explicit
                        //   descriptor (e.g. a future non-enumerable Symbol
                        //   key) over the default data-property assignment.
                        Object.defineProperty(owner, sym, {
                            configurable: true,
                            enumerable: true,
                            writable: true,
                            ...entry.descriptor,
                            value
                        });
                    } else {
                        owner[sym] = value;
                    }
                });
            });
            if (symbolMetaInTree) {
                delete result.$symbolKeys;
            }
        };

        const possibleTypesonPromise = revivePlainObjects();
        let ret;
        if (hasConstructorOf(possibleTypesonPromise, TypesonPromise)) {
            ret = /** @type {TypesonPromise<void>} */ (
                possibleTypesonPromise
            ).then(() => {
                return obj;
            });
        } else {
            ret = _revive('', obj, null);
            if (revivalPromises.length) {
                // Ensure children resolved
                ret = TypesonPromise.resolve(ret).then((r) => {
                    return TypesonPromise.all([
                        // May be a TypesonPromise or not
                        r,
                        ...revivalPromises
                    ]);
                }).then(([r]) => {
                    return r;
                });
            }
        }

        if (symbolKeysMeta) {
            if (isThenable(ret)) {
                ret = ret.then(
                    /**
                     * @param {unknown} r
                     * @returns {unknown}
                     */
                    (r) => {
                        reHomeSymbolKeys(r);
                        return r;
                    }
                );
            } else {
                reHomeSymbolKeys(ret);
            }
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
     * Also sync but throws on non-sync result.
     * @param {any} obj
     * @param {TypesonOptions} [opts]
     * @returns {any}
     */
    reviveSync (obj, opts) {
        return this.revive(obj, {
            throwOnBadSyncType: true, ...opts, sync: true
        });
    }

    /**
     * @param {any} obj
     * @param {TypesonOptions} [opts]
     * @returns {Promise<any>}
     */
    reviveAsync (obj, opts) {
        return this.revive(obj, {
            throwOnBadSyncType: true, ...opts, sync: false
        });
    }

    /**
     * Register types.
     * For examples on how to use this method, see
     *   {@link https://github.com/dfahlander/typeson-registry/tree/master/types}.
     * @param {TypeSpecSet|Preset} typeSpecSets Types and their
     *   functions [test, encapsulate, revive];
     * @param {TypesonOptions} [options]
     * @returns {Typeson}
     */
    register (typeSpecSets, options) {
        const opts = options ?? {};

        /**
         * @param {TypeSpecSet|Preset} typeSpec
         * @returns {void}
         */
        const reg = (typeSpec) => {
            // Allow arrays of arrays of arrays...
            if (isArray(typeSpec)) {
                typeSpec.forEach((typSpec) => {
                    reg(typSpec);
                });
                return;
            }
            keys(typeSpec).forEach((typeId) => {
                if (typeId === '#') {
                    throw new TypeError(
                        '# cannot be used as a type name as it is reserved ' +
                        'for cyclic objects'
                    );
                }
                if (JSON_TYPES.includes(typeId)) {
                    throw new TypeError(
                        'Plain JSON object types are reserved as type names'
                    );
                }
                let spec = typeSpec[typeId];
                [
                    this.plainObjectReplacers,
                    this.nonplainObjectReplacers
                ].forEach((registeredReplacers) => {
                    const index = registeredReplacers.findIndex((replacer) => {
                        return replacer.type === typeId;
                    });
                    if (index !== -1) {
                        registeredReplacers.splice(index, 1);
                    }
                });
                delete this.revivers[typeId];
                delete this.types[typeId];
                if (typeof spec === 'function') {
                    // Support registering just a class without replacer/reviver
                    const Class = spec;
                    spec = {
                        test: (x) => x && x.constructor === Class,
                        replace: (x) => ({...x}),
                        revive: (x) => Object.assign(
                            Object.create(Class.prototype), x
                        )
                    };
                } else if (isArray(spec)) {
                    const [test, replace, revive] = spec;
                    spec = {test, replace, revive};
                }
                if (!spec?.test) {
                    return;
                }

                /** @type {ReplacerObject} */
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
                    /** @type {ReviverObject} */
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
            });
        };
        /** @type {Preset} */ ([]).concat(
            typeSpecSets
        ).forEach((typeSpec) => {
            reg(typeSpec);
        });
        return this;
    }
}

/* eslint-disable @stylistic/max-len -- Long */
/**
 * We keep this function minimized so if using two instances of this
 * library, where one is minimized and one is not, it will still work
 * with `hasConstructorOf`.
 * @class
 */
class Undefined{} // eslint-disable-line @stylistic/space-before-blocks -- For minimizing
/* eslint-enable @stylistic/max-len -- Long */

// eslint-disable-next-line camelcase -- Special identifier
Undefined.__typeson__type__ = 'TypesonUndefined';

// The following provide classes meant to avoid clashes with other values

// Typeson.Undefined is to insist `undefined` should be added
// TypesonPromise is to support async encapsulation/stringification
// Others include some fundamental type-checking utilities

const JSON_TYPES = [
    'null', 'boolean', 'number', 'string', 'array', 'object'
];

export * from './utils/classMethods.js';
export {Typeson, TypesonPromise, Undefined, JSON_TYPES};
