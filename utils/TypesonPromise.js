/* eslint-disable promise/avoid-new -- Own API */
/**
 * We keep this function minimized so if using two instances of this
 *   library, where one is minimized and one is not, it will still work
 *   with `hasConstructorOf`.
 * With ES6 classes, we may be able to simply use `class TypesonPromise
 *   extends Promise` and add a string tag for detection.
 * @template T
 */
class TypesonPromise {
    /**
     * @param {(
     *   resolve: (value: any) => any,
     *   reject: (reason?: any) => void
     * ) => void} f
     */
    constructor (f) {
        this.p = new Promise(f);
    }
}

/* eslint-enable promise/avoid-new -- Own API */

// eslint-disable-next-line @stylistic/max-len -- Long
// class TypesonPromise extends Promise {get[Symbol.toStringTag](){return 'TypesonPromise'};} // eslint-disable-line keyword-spacing, space-before-function-paren, space-before-blocks, block-spacing, semi

// eslint-disable-next-line camelcase -- Special identifier
TypesonPromise.__typeson__type__ = 'TypesonPromise';

// Note: core-js-bundle provides a `Symbol` polyfill
/* istanbul ignore else */
if (typeof Symbol !== 'undefined') {
    // Ensure `isUserObject` will return `false` for `TypesonPromise`
    Object.defineProperty(TypesonPromise.prototype, Symbol.toStringTag, {
        get () {
            return 'TypesonPromise';
        }
    });
}

/* eslint-disable unicorn/no-thenable -- Desired to be Promise-like */
/**
 *
 * @param {?(value: T) => any} [onFulfilled]
 * @param {(reason?: any) => any} [onRejected]
 * @returns {TypesonPromise<T>}
 */
TypesonPromise.prototype.then = function (onFulfilled, onRejected) {
    return new TypesonPromise((typesonResolve, typesonReject) => {
        // eslint-disable-next-line @stylistic/max-len -- Long
        // eslint-disable-next-line promise/catch-or-return -- Handling ourselves
        this.p.then(function (res) {
            // eslint-disable-next-line @stylistic/max-len -- Long
            // eslint-disable-next-line promise/always-return -- Handle ourselves
            typesonResolve(onFulfilled ? onFulfilled(res) : res);
        }).catch(function (/** @type {unknown} */ res) {
            return onRejected
                ? onRejected(res)
                // eslint-disable-next-line @stylistic/max-len -- Long
                // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- Is an error
                : Promise.reject(res);
        }).then(typesonResolve, typesonReject);
    });
};

/**
 *
 * @param {(reason?: any) => void} onRejected
 * @returns {TypesonPromise<T>}
 */
TypesonPromise.prototype.catch = function (onRejected) {
    return this.then(() => {
        return undefined;
    }, onRejected);
};

/**
 * @template T
 * @param {T} v
 * @returns {TypesonPromise<T>}
 */
TypesonPromise.resolve = function (v) {
    return new TypesonPromise((typesonResolve) => {
        typesonResolve(v);
    });
};
/**
 * @template T
 * @param {any} v
 * @returns {TypesonPromise<T>}
 */
TypesonPromise.reject = function (v) {
    return new TypesonPromise((typesonResolve, typesonReject) => {
        typesonReject(v);
    });
};

/**
 *
 * @template T
 * @param {(TypesonPromise<T>|Promise<T>|any)[]} promArr
 * @returns {TypesonPromise<T>}
 */
TypesonPromise.all = function (promArr) {
    return new TypesonPromise(function (typesonResolve, typesonReject) {
        // eslint-disable-next-line promise/catch-or-return -- Handle ourselves
        Promise.all(promArr.map((prom) => {
            return prom?.constructor &&
                '__typeson__type__' in prom.constructor &&
                prom.constructor.__typeson__type__ === 'TypesonPromise'
                ? /** @type {TypesonPromise<T>} */ (prom).p
                : prom;
        })).then(typesonResolve, typesonReject);
    });
};

/**
 * @template T
 * @param {(TypesonPromise<T>|Promise<T>|null)[]} promArr
 * @returns {TypesonPromise<T>}
 */
TypesonPromise.race = function (promArr) {
    return new TypesonPromise(function (typesonResolve, typesonReject) {
        // eslint-disable-next-line promise/catch-or-return -- Handle ourselves
        Promise.race(promArr.map((prom) => {
            return prom?.constructor &&
                '__typeson__type__' in prom.constructor &&
                prom.constructor.__typeson__type__ === 'TypesonPromise'
                ? /** @type {TypesonPromise<T>} */ (prom).p
                : prom;
        })).then(typesonResolve, typesonReject);
    });
};

/**
 * @template T
 * @param {(TypesonPromise<T>|Promise<T>|null)[]} promArr
 * @returns {TypesonPromise<T>}
 */
TypesonPromise.allSettled = function (promArr) {
    return new TypesonPromise(function (typesonResolve, typesonReject) {
        // eslint-disable-next-line promise/catch-or-return -- Handle ourselves
        Promise.allSettled(promArr.map((prom) => {
            return prom?.constructor &&
                '__typeson__type__' in prom.constructor &&
                prom.constructor.__typeson__type__ === 'TypesonPromise'
                ? /** @type {TypesonPromise<T>} */ (prom).p
                : prom;
        })).then(typesonResolve, typesonReject);
    });
};
/* eslint-enable unicorn/no-thenable -- Desired to be Promise-like */

export {TypesonPromise};
