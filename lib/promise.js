
// 定义状态
const PENDING = 0;
const REJECTED = -1;
const FULFILLED = 1;

// async call for onFulfilled & onRejected
var asyncCall = process.nextTick ||
    setImmediate ||
    function (callback) {
        if (typeof callback !== 'function')
            throw new TypeError('callback is not a function');
        setTimeout(callback, 0);
    };

// NOOP
var noop = function() {};

// capability of {promise2, onFulfilled, onRejected}
function Triad(promise2, onFulfilled, onRejected) {
    this._promise = promise2;
    /* don't keep other values */
    this._onFulfilled = typeof onFulfilled === 'function' ?
        onFulfilled.bind(undefined) :
        null;
    this._onRejected = typeof onRejected === 'function' ?
        onRejected.bind(undefined) :
        null;
}

// Promise Constructor
function Promise(executor) {
    if (!(this instanceof Promise))
        return new Promise(executor);

    if (typeof executor !== 'function')
        throw new TypeError('Promise executor is not a function');

    // 2.1 Promise state
    this._state = PENDING;

    this._value = null;
    this._reason = null;

    // 2.2.6
    // `then` may be called multiple times on the same promise
    this._subscribers = [];

    var promise = this;
    try {
        executor(function (value) {
            __resolve__(promise, value);
        }, function (reason) {
            __reject__(promise, reason);
        });
    } catch (exception) {
        __reject__(promise, exception);
    }
}

// 2.2 the then method
Promise.prototype.then = function then(onFulfilled, onRejected) {
    var subscribers = this._subscribers;

    var promise2 = new Promise(noop); // promise for return
    var triad = new Triad(promise2, onFulfilled, onRejected);

    // if promise is pending, add subscriber
    if (this._state === PENDING) {
        subscribers.push(triad);
    }
    // else invoke callback immediately
    else {
        invokeCallback(this, triad);
    }

    // 2.2.7 then must return a promise
    return promise2;
};


// static methods
Promise.resolve = function (value) {
    var newPromise = new Promise(noop);
    __resolve__(newPromise, value);
    return newPromise;
};
Promise.reject = function (reason) {
    var newPromise = new Promise(noop);
    newPromise._state = REJECTED;
    newPromise._reason = reason;
    return newPromise;
};

// 2.3 Promise 解决过程
// Promise Resolution Procedure
function __resolve__(promise, x) {
    // 2.3.1
    // if `promise` & `x` refer to the same object,
    // reject `promise` with a TypeError as the reason
    if (promise === x)
        return __reject__(promise,
            new TypeError('try to resolve a promise with itself'));

    // 2.3.2
    // if `x` is a promise, adopt its state
    if (x instanceof Promise) {
        // 2.3.2.1
        // if `x` is pending, `promise` must remain pending
        // until `x` is  fulfilled or rejected
        if (x._state === PENDING) {
            x.then(function (value) {
                __resolve__(promise, value);
            }, function (reason) {
                __reject__(promise, reason);
            });
        }
        // 2.3.2.2
        // if/when `x` is fulfilled,
        // fulfill the promise with the same value
        else if (x._state === FULFILLED) {
            __fulfill__(promise, x._value);
        }
        // 2.3.2.3
        // if/when `x` is rejected,
        // reject the promise with the same reason
        else {
            __reject__(promise, x._reason);
        }
        return;
    }

    // 2.3.3
    // if `x` is an object or function
    var type = typeof x;
    /* !!! attention: `typeof null` equals to `'object'` */
    if ((type === 'object' && x !== null) || type === 'function') {
        return handleThenable(promise, x);
    }
    // 2.3.4
    // if `x` is not an object or function, fulfill `promise` with `x`.
    else {
        return __fulfill__(promise, x);
    }
}

function handleThenable(promise, x) {
    var then = null; // assigned with x.then

    // is resolvePromise | rejectPromise called
    var anyCalled = false;

    try {
        // 2.3.3.1 Let `then` be `x.then`
        then = x.then;

        // 2.3.3.3
        // If `then` is a function, call it with `x` as `this`
        if (typeof then === 'function') {
            try {
                then.call(x, function resolvePromise(y) {
                    if (anyCalled) return;
                    // 2.3.3.3.1
                    // If/when `resolvePromise` is called with
                    // a value `y`, run `[[Resolve]](promise, y)`.
                    __resolve__(promise, y);
                    anyCalled = true;
                }, function rejectPromise (r) {
                    if (anyCalled) return;
                    // 2.3.3.3.2
                    // If/when `rejectPromise` is called with
                    // a reason `r`, reject promise with `r`.
                    __reject__(promise, r);
                    anyCalled = true;
                });
            }
            // 2.3.3.4
            // If calling then throws an exception `e`
            catch (e) {
                // 2.3.3.4.1
                // If `resolvePromise` or `rejectPromise`
                // have been called, ignore it.

                // 2.3.3.4.2
                // reject `promise` with `e` as the reason.
                if (!anyCalled) {
                    __reject__(promise, e);
                }
            }
        }
        // 2.3.3.4
        // If `then` is not a function, fulfill `promise` with `x`.
        else {
            __fulfill__(promise, x);
        }

    } catch (e) {
        // 2.3.3.2
        // if retrieving the property `x.then` results in a
        // thrown exception `e`, reject `promise` with `e`
        __reject__(promise, e);
    }
}

function invokeCallback(promise, triad) {
    var promise2 = triad._promise;
    var onRejected = triad._onRejected;
    var onFulfilled = triad._onFulfilled;

    var value = promise._value;
    var reason = promise._reason;

    if (promise._state === FULFILLED) {
        if (onFulfilled) {
            // 2.2.4
            asyncCall(function () {
                try {
                    // 2.2.7.1
                    __resolve__(promise2, onFulfilled(value));
                } catch (e) {
                    // 2.2.7.2
                    __reject__(promise2, e);
                }
            });
        }
        // 2.2.7.3
        else {
            __resolve__(promise2, value);
        }
    } else if (promise._state === REJECTED) {
        if (onRejected) {
            // 2.2.4
            asyncCall(function () {
                try {
                    // 2.2.7.1
                    __resolve__(promise2, onRejected(reason));
                } catch (e) {
                    // 2.2.7.2
                    __reject__(promise2, e);
                }
            });
        }
        // 2.2.7.4
        else {
            __reject__(promise2, reason);
        }
    }
}

// fulfill promise with value
function __fulfill__(promise, value) {
    if (promise._state === PENDING) {
        // change `promise`'s state
        promise._state = FULFILLED;
        promise._value = value;

        // invoke callbacks in order
        var subscribers = promise._subscribers;
        for (var i = 0; i < subscribers.length; ++i) {
            invokeCallback(promise, subscribers[i]);
        }
    }
}

// reject promise with value
function __reject__(promise, reason) {
    if (promise._state === PENDING) {
        // change `promise`'s state
        promise._state = REJECTED;
        promise._reason = reason;

        // invoke callbacks in order
        var subscribers = promise._subscribers;
        for (var i = 0; i < subscribers.length; ++i) {
            invokeCallback(promise, subscribers[i]);
        }
    }
}

module.exports = Promise;