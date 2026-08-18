const {hasOwn} = Object,
    getProto = Object.getPrototypeOf;

/**
 * Second argument not in use internally, but provided for utility.
 * @param {any} v
 * @param {boolean} [catchCheck]
 * @returns {boolean}
 */
function isThenable (v, catchCheck) {
    return isObject(v) &&
        typeof v.then === 'function' &&
            (!catchCheck || typeof v.catch === 'function');
}

/**
 *
 * @param {any} val
 * @returns {string}
 */
function toStringTag (val) {
    return Object.prototype.toString.call(val).slice(8, -1);
}

/**
 * This function is dependent on both constructors
 *   being identical so any minimization is expected of both.
 * @param {any} a
 * @param {({__typeson__type__?: string} & Function)|null} b
 * @returns {boolean}
 */
function hasConstructorOf (a, b) {
    if (!a || typeof a !== 'object') {
        return false;
    }
    const proto = getProto(a);
    if (!proto) {
        return b === null;
    }
    const Ctor = hasOwn(proto, 'constructor') && proto.constructor;
    if (typeof Ctor !== 'function') {
        return b === null;
    }
    if (b === Ctor) {
        return true;
    }
    if (
        b !== null &&
        Function.prototype.toString.call(Ctor) ===
            Function.prototype.toString.call(b)
    ) {
        return true;
    }

    if (typeof b === 'function' &&
        typeof Ctor.__typeson__type__ === 'string' &&
        Ctor.__typeson__type__ === b.__typeson__type__
    ) {
        return true;
    }
    return false;
}

/**
 *
 * @param {any} val
 * @returns {boolean}
 */
function isPlainObject (val) { // Mirrors jQuery's
    if (!val || toStringTag(val) !== 'Object') {
        return false;
    }

    const proto = getProto(val);
    if (!proto) { // `Object.create(null)`
        return true;
    }

    return hasConstructorOf(val, Object);
}

/**
 *
 * @param {any} val
 * @returns {boolean}
 */
function isUserObject (val) {
    if (!val || toStringTag(val) !== 'Object') {
        return false;
    }

    const proto = getProto(val);
    if (!proto) { // `Object.create(null)`
        return true;
    }
    return hasConstructorOf(val, Object) || isUserObject(proto);
}

/**
 *
 * @param {any} v
 * @returns {boolean}
 */
function isObject (v) {
    return v !== null && typeof v === 'object';
}

/**
 *
 * @param {string} keyPathComponent
 * @returns {string}
 */
function escapeKeyPathComponent (keyPathComponent) {
    return keyPathComponent.replaceAll(
        "''", "''''"
    ).replace(
        /^$/u, "''"
    ).replaceAll('~', '~0').replaceAll('.', '~1');
}

/**
 *
 * @param {string} keyPathComponent
 * @returns {string}
 */
function unescapeKeyPathComponent (keyPathComponent) {
    return keyPathComponent.replaceAll(
        '~1', '.'
    ).replaceAll('~0', '~').replace(
        /^''$/u, ''
    ).replaceAll(
        "''''", "''"
    );
}

/**
 * @typedef {null|boolean|number|string} Primitive
 */

/**
 * @typedef {Primitive|Primitive[]|{[key: string]: JSON}} JSON
 */

/**
 * @param {any} obj
 * @param {string} keyPath
 * @param {boolean} [ownOnly]
 * @throws {TypeError}
 * @returns {any}
 */
function getByKeyPath (obj, keyPath, ownOnly) {
    if (keyPath === '') {
        return obj;
    }
    if (obj === null || typeof obj !== 'object') {
        throw new TypeError('Unexpected non-object type');
    }
    const period = keyPath.indexOf('.');
    const key = unescapeKeyPathComponent(
        period === -1 ? keyPath : keyPath.slice(0, period)
    );
    if (ownOnly && !hasOwn(obj, key)) {
        return undefined;
    }
    if (period !== -1) {
        const innerObj = /** @type {{[key: string]: any|undefined}} */ (obj)[
            key
        ];
        return innerObj === undefined
            ? undefined
            : getByKeyPath(innerObj, keyPath.slice(period + 1), ownOnly);
    }
    return /** @type {{[key: string]: any}} */ (
        obj
    )[key];
}

/**
 * @typedef {{
 *   [key: string]: NestedObject|any
 * }} NestedObject
 */

/**
 *
 * @param {unknown} obj
 * @param {string} keyPath
 * @param {any} value
 * @param {boolean} [ownOnly]
 * @throws {TypeError}
 * @returns {any}
 */
function setAtKeyPath (obj, keyPath, value, ownOnly) {
    if (keyPath === '') {
        return value;
    }

    let currentObj = obj;
    let currentKeyPath = keyPath;

    // eslint-disable-next-line @stylistic/max-len -- Long
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Ok
    while (true) {
        // We allow arrays, however
        if (!currentObj || typeof currentObj !== 'object') {
            throw new TypeError('Unexpected non-object type');
        }

        const period = currentKeyPath.indexOf('.');
        const key = unescapeKeyPathComponent(
            period === -1
                ? currentKeyPath
                : currentKeyPath.slice(0, period)
        );
        if (key === '__proto__') {
            throw new TypeError('Invalid property');
        }

        if (period === -1) {
            /** @type {{[key: string]: any}} */ (currentObj)[
                key
            ] = value;
            return obj;
        }

        if (ownOnly && !hasOwn(currentObj, key)) {
            throw new TypeError('Invalid property');
        }

        currentObj = /** @type {{[key: string]: any}} */ (currentObj)[
            key
        ];
        currentKeyPath = currentKeyPath.slice(period + 1);
    }
}

/**
 * @typedef {"null"|"array"|"undefined"|"boolean"|"number"|"string"|
 *  "object"|"symbol"|"bigint"|"function"} ObjectTypeString
 */

/**
 *
 * @param {any} value
 * @returns {ObjectTypeString}
 */
function getJSONType (value) {
    return value === null
        ? 'null'
        : (
            Array.isArray(value)
                ? 'array'
                : typeof value);
}

export {
    isPlainObject, isObject, isUserObject,
    hasConstructorOf, isThenable, toStringTag,
    escapeKeyPathComponent, unescapeKeyPathComponent,
    getByKeyPath, setAtKeyPath,
    getJSONType
};
