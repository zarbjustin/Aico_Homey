'use strict';

function onHomeyReady(Homey) {
  const reporting = document.getElementById('reporting');
  const coverage = document.getElementById('coverage');
  const maintenance = document.getElementById('maintenance');
  const checked = document.getElementById('checked');
  const status = document.getElementById('status');
  let pending = false;

  function render(overview) {
    reporting.textContent = overview.paired ? overview.reporting + '/' + overview.paired : '—';
    coverage.textContent = overview.paired ? 'devices with recent data' : 'No paired devices';
    maintenance.textContent = overview.maintenanceReports ?? '—';
    maintenance.dataset.tone = overview.maintenanceReports > 0 ? 'attention' : 'neutral';
    checked.textContent = overview.maintenanceChecked ? 'active · ' + overview.maintenanceChecked + '/' + overview.paired + ' checked' : 'Reports unavailable';
    if (overview.oldestInventoryAt === null) {
      status.textContent = overview.paired ? 'Waiting for a recent HomeLINK update' : 'Pair a HomeLINK device to see data';
      return;
    }
    const minutes = Math.max(0, Math.floor((Date.now() - overview.oldestInventoryAt) / 60_000));
    status.textContent = minutes < 1 ? 'Oldest cloud sync under a minute ago'
      : 'Oldest cloud sync ' + minutes + (minutes === 1 ? ' minute ago' : ' minutes ago');
  }

  async function refresh() {
    if (pending) return;
    pending = true;
    try {
      render(await Homey.api('GET', '/', {}));
    } catch {
      reporting.textContent = '—';
      coverage.textContent = 'Data unavailable';
      maintenance.textContent = '—';
      maintenance.dataset.tone = 'neutral';
      checked.textContent = 'Reports unavailable';
      status.textContent = 'Homey could not load the overview';
    } finally {
      pending = false;
    }
  }

  Homey.ready();
  refresh();
  const timer = setInterval(refresh, 60_000);
  window.addEventListener('pagehide', () => clearInterval(timer), { once: true });
}
