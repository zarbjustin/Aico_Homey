'use strict';

const MAINTENANCE_REFRESH_MS = 5 * 60_000;
const MAINTENANCE_MAX_AGE_MS = MAINTENANCE_REFRESH_MS + 2 * 60_000;

function isFreshMaintenance(fetchedAt, now = Date.now()) {
  return Number.isFinite(fetchedAt) && fetchedAt <= now && now - fetchedAt <= MAINTENANCE_MAX_AGE_MS;
}

class MaintenanceState {
  #sample;

  reset() {
    this.#sample = undefined;
  }

  resetIfPropertyChanged(property) {
    if (this.#sample?.property !== property) this.reset();
  }

  count(now = Date.now()) {
    if (!isFreshMaintenance(this.#sample?.fetchedAt, now)) return undefined;
    return this.#sample.ids.size;
  }

  observe(property, fetchedAt, ids, now = Date.now()) {
    if (!property || !isFreshMaintenance(fetchedAt, now)) {
      this.reset();
      return undefined;
    }

    const previous = this.#sample;
    const comparable = previous?.property === property && isFreshMaintenance(previous.fetchedAt, now);
    if (comparable && fetchedAt <= previous.fetchedAt) return undefined;

    this.#sample = { property, fetchedAt, ids: new Set(ids) };
    if (!comparable) return undefined;

    const observedAt = new Date(fetchedAt).toISOString();
    if (this.#sample.ids.size === 0 && previous.ids.size > 0) {
      return { kind: 'cleared', previousCount: previous.ids.size, observedAt };
    }
    const newCount = Array.from(this.#sample.ids).filter((id) => !previous.ids.has(id)).length;
    if (newCount > 0) {
      return { kind: 'reported', newCount, activeCount: this.#sample.ids.size, observedAt };
    }
    return undefined;
  }
}

module.exports = { MAINTENANCE_REFRESH_MS, MaintenanceState, isFreshMaintenance };
