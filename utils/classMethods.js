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

    // eslint-disable-next-line sonarjs/prefer-single-boolean-return -- Cleaner
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
 * @throws {TypeError}
 * @returns {any}
 */
function getByKeyPath (obj, keyPath) {
    if (keyPath === '') {
        return obj;
    }
    if (obj === null || typeof obj !== 'object') {
        throw new TypeError('Unexpected non-object type');
    }
    const period = keyPath.indexOf('.');
    if (period !== -1) {
        const innerObj = /** @type {{[key: string]: any|undefined}} */ (obj)[
            unescapeKeyPathComponent(keyPath.slice(0, period))
        ];
        return innerObj === undefined
            ? undefined
            : getByKeyPath(innerObj, keyPath.slice(period + 1));
    }
    return /** @type {{[key: string]: any}} */ (
        obj
    )[unescapeKeyPathComponent(keyPath)];
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
 * @throws {TypeError}
 * @returns {any}
 */
function setAtKeyPath (obj, keyPath, value) {
    if (keyPath === '') {
        return value;
    }

    // We allow arrays, however
    if (!obj || typeof obj !== 'object') {
        throw new TypeError('Unexpected non-object type');
    }
    if (keyPath === '__proto__') {
        throw new TypeError('Invalid property');
    }
    const period = keyPath.indexOf('.');
    if (period !== -1) {
        const innerObj = /** @type {{[key: string]: any}} */ (obj)[
            unescapeKeyPathComponent(keyPath.slice(0, period))
        ];
        return setAtKeyPath(innerObj, keyPath.slice(period + 1), value);
    }
    /** @type {{[key: string]: any}} */ (obj)[
        unescapeKeyPathComponent(keyPath)
    ] = value;
    return obj;
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
