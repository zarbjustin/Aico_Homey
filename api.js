'use strict';

const { getModelArtwork } = require('./lib/device-icons');

module.exports = {
  async getConnectionStatus({ homey }) {
    const status = homey.app.getConnectionStatus();
    if (status.state !== 'available') return status;
    return { ...status, modelArtwork: getModelArtwork(status.summary.models) };
  },
  async checkConnection({ homey, body }) {
    return homey.app.checkConnection(body);
  },
  async getEventStatus({ homey }) {
    return homey.app.getEventStatus();
  },
  async getSupportReport({ homey }) {
    return homey.app.getSupportReport();
  },
};
