'use strict';

/**
 * Minimal CJS shim for the `rettime` package (pure-ESM in production).
 * Used in Jest/Node to avoid "Cannot use import statement outside a module" errors
 * when msw/node's compiled bundle requires rettime.
 */
class Emitter {
  constructor() {
    this._listeners = new Map();
    this._hookListeners = new Map();
    this.hooks = {
      on: (hook, callback) => {
        if (!this._hookListeners.has(hook)) this._hookListeners.set(hook, []);
        this._hookListeners.get(hook).push(callback);
      },
      removeListener: (hook, callback) => {
        const list = this._hookListeners.get(hook) || [];
        const idx = list.indexOf(callback);
        if (idx !== -1) list.splice(idx, 1);
      },
    };
  }

  on(type, listener) {
    if (!this._listeners.has(type)) this._listeners.set(type, []);
    this._listeners.get(type).push(listener);
    return this;
  }

  once(type, listener) {
    const wrapper = (...args) => {
      this.removeListener(type, wrapper);
      listener.call(this, ...args);
    };
    return this.on(type, wrapper);
  }

  earlyOn(type, listener) {
    return this.on(type, listener);
  }

  earlyOnce(type, listener) {
    return this.once(type, listener);
  }

  emit(event) {
    const type = event.type;
    const listeners = [...(this._listeners.get(type) || []), ...(this._listeners.get('*') || [])];
    if (listeners.length === 0) return false;
    for (const l of listeners) l.call(this, event);
    return true;
  }

  async emitAsPromise(event) {
    const type = event.type;
    const listeners = [...(this._listeners.get(type) || []), ...(this._listeners.get('*') || [])];
    if (listeners.length === 0) return [];
    const results = [];
    for (const l of listeners) {
      try { results.push(await Promise.resolve(l.call(this, event))); } catch (e) { results.push(e); }
    }
    return results;
  }

  *emitAsGenerator(event) {
    const type = event.type;
    const listeners = [...(this._listeners.get(type) || []), ...(this._listeners.get('*') || [])];
    for (const l of listeners) yield l.call(this, event);
  }

  removeListener(type, listener) {
    const list = this._listeners.get(type) || [];
    const idx = list.indexOf(listener);
    if (idx !== -1) list.splice(idx, 1);
  }

  removeAllListeners(type) {
    if (type == null) { this._listeners.clear(); return; }
    this._listeners.delete(type);
  }

  listeners(type) {
    if (type == null) {
      const all = [];
      for (const v of this._listeners.values()) all.push(...v);
      return all;
    }
    return this._listeners.get(type) || [];
  }

  listenerCount(type) {
    if (type == null) {
      let total = 0;
      for (const v of this._listeners.values()) total += v.length;
      return total;
    }
    return (this._listeners.get(type) || []).length;
  }
}

class TypedEvent extends MessageEvent {}

module.exports = { Emitter, TypedEvent };
