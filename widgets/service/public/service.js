'use strict';

function onHomeyReady(Homey) {
  const status = document.getElementById('status');
  const replacementCount = document.getElementById('replacement-count');
  const replacementDetail = document.getElementById('replacement-detail');
  const testCount = document.getElementById('test-count');
  const testDetail = document.getElementById('test-detail');
  const settings = Homey.getSettings();
  const replacementDays = Number.isInteger(settings.replacementDays) ? settings.replacementDays : 90;
  const testDays = Number.isInteger(settings.testDays) ? settings.testDays : 7;
  const path = '/' + replacementDays + '/' + testDays;
  let pending = false;

  function renderCount(element, entry) {
    element.textContent = entry.checked ? entry.due : '—';
    element.dataset.tone = entry.checked && entry.due > 0 ? 'attention' : 'neutral';
  }

  async function refresh() {
    if (pending) return;
    pending = true;
    try {
      const { alarms, replacement, lastTest } = await Homey.api('GET', path, {});
      renderCount(replacementCount, replacement);
      renderCount(testCount, lastTest);
      const coverage = (entry) => alarms ? ' · ' + entry.checked + '/' + alarms + ' checked' : '';
      replacementDetail.textContent = 'Due within ' + replacement.days + ' days' + coverage(replacement);
      testDetail.textContent = 'At least ' + lastTest.days + ' days ago' + coverage(lastTest);
      status.textContent = '';
      if (!alarms) status.textContent = 'Pair a HomeLINK alarm to see dates';
      else if (!replacement.checked && !lastTest.checked) status.textContent = 'Waiting for usable HomeLINK dates';
    } catch {
      renderCount(replacementCount, {});
      renderCount(testCount, {});
      replacementDetail.textContent = 'Dates unavailable';
      testDetail.textContent = 'Dates unavailable';
      status.textContent = 'Homey could not load service dates';
    } finally {
      pending = false;
    }
  }

  Homey.ready();
  refresh();
  const timer = setInterval(refresh, 60_000);
  window.addEventListener('pagehide', () => clearInterval(timer), { once: true });
}
