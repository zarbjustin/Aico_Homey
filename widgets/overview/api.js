'use strict';

module.exports = {
  async getOverview({ homey }) {
    const devices = homey.drivers.getDriver('homelink-device').getDevices();
    const now = Date.now();
    const result = {
      paired: devices.length,
      reporting: 0,
      maintenanceChecked: 0,
      maintenanceReports: null,
      oldestInventoryAt: null,
    };

    for (const device of devices) {
      const { inventoryFetchedAt, maintenanceCount } = device.getDashboardStatus(now);
      if (inventoryFetchedAt !== null) {
        result.reporting += 1;
        result.oldestInventoryAt = Math.min(result.oldestInventoryAt ?? inventoryFetchedAt, inventoryFetchedAt);
      }
      if (maintenanceCount !== null) {
        result.maintenanceChecked += 1;
        result.maintenanceReports = (result.maintenanceReports ?? 0) + maintenanceCount;
      }
    }

    return result;
  },
};
