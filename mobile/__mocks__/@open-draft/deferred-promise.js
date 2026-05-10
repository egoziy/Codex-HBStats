'use strict';

/**
 * CJS shim for @open-draft/deferred-promise (pure-ESM package).
 * Used in Jest/Node environment via moduleNameMapper.
 */
function createDeferredExecutor() {
  const executor = function(resolve, reject) {
    executor.state = 'pending';
    executor.resolve = function(data) {
      if (executor.state !== 'pending') return;
      executor.result = data;
      const onFulfilled = (value) => {
        executor.state = 'fulfilled';
        return value;
      };
      return resolve(data instanceof Promise ? data : Promise.resolve(data).then(onFulfilled));
    };
    executor.reject = function(reason) {
      if (executor.state !== 'pending') return;
      queueMicrotask(() => { executor.state = 'rejected'; });
      return reject((executor.rejectionReason = reason));
    };
  };
  return executor;
}

class DeferredPromise extends Promise {
  constructor(executor = null) {
    const deferredExecutor = createDeferredExecutor();
    super((originalResolve, originalReject) => {
      deferredExecutor(originalResolve, originalReject);
      if (executor) executor(deferredExecutor.resolve, deferredExecutor.reject);
    });
    this._executor = deferredExecutor;
    this.resolve = this._executor.resolve;
    this.reject = this._executor.reject;
  }

  get state() { return this._executor.state; }
  get rejectionReason() { return this._executor.rejectionReason; }

  then(onFulfilled, onRejected) {
    return this._decorate(super.then(onFulfilled, onRejected));
  }
  catch(onRejected) { return this._decorate(super.catch(onRejected)); }
  finally(onfinally) { return this._decorate(super.finally(onfinally)); }

  _decorate(promise) {
    return Object.defineProperties(promise, {
      resolve: { configurable: true, value: this.resolve },
      reject: { configurable: true, value: this.reject },
    });
  }
}

module.exports = { DeferredPromise, createDeferredExecutor };
