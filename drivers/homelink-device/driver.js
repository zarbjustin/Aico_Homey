'use strict';

const Homey = require('homey');

class HomeLinkDriver extends Homey.Driver {
  async onPairListDevices() {
    const { devices } = await this.homey.app.discover();
    return Array.from(devices.values(), ({ id, model, name }) => ({
      name,
      data: { id, model },
    }));
  }
}

module.exports = HomeLinkDriver;
