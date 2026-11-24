'use strict';

module.exports = {
  async getConnectionStatus({ homey }) {
    return homey.app.getConnectionStatus();
  },
  async checkConnection({ homey, body }) {
    return homey.app.checkConnection(body);
  },
  async getEventStatus({ homey }) {
    return homey.app.getEventStatus();
  },
};
