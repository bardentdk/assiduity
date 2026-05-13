const syncBtn = document.getElementById('syncBtn');
const resultsBody = document.getElementById('resultsBody');

const totalLearners = document.getElementById('totalLearners');
const totalOk = document.getElementById('totalOk');
const totalMissing = document.getElementById('totalMissing');
const totalWarning = document.getElementById('totalWarning');

syncBtn.addEventListener('click', syncDigiforma);

async function syncDigiforma() {
  try {
    syncBtn.disabled = true;
    syncBtn.textContent = 'Synchronisation en cours...';

    const response = await fetch('/api/planning/sync');
    const payload = await response.json();

    if (!payload.success) {
      throw new Error(payload.message);
    }

    renderDashboard(payload.data);
  } catch (error) {
    alert(error.message || 'Erreur pendant la synchronisation.');
  } finally {
    syncBtn.disabled = false;
    syncBtn.textContent = 'Synchroniser avec Digiforma';
  }
}

function renderDashboard(data) {
  totalLearners.textContent = data.totalLearners;
  totalOk.textContent = data.totalOk;
  totalMissing.textContent = data.totalMissing;
  totalWarning.textContent = data.totalWarning;

  renderRows(data.results);
}

function renderRows(rows) {
  if (!rows.length) {
    resultsBody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center text-muted">
          Aucun apprenant trouvé.
        </td>
      </tr>
    `;
    return;
  }

  resultsBody.innerHTML = rows.map((row) => {
    return `
      <tr>
        <td>
          <strong>${escapeHTML(row.fullName)}</strong>
        </td>
        <td>${escapeHTML(row.email)}</td>
        <td>${escapeHTML(row.sessionName)}</td>
        <td>${row.slotsCount}</td>
        <td>
          <span class="badge ${getBadgeClass(row.status.code)}">
            ${escapeHTML(row.status.label)}
          </span>
        </td>
        <td>${escapeHTML(row.status.action)}</td>
      </tr>
    `;
  }).join('');
}

function getBadgeClass(statusCode) {
  if (statusCode === 'ok') {
    return 'text-bg-success';
  }

  if (statusCode === 'missing') {
    return 'text-bg-danger';
  }

  return 'text-bg-warning';
}

function escapeHTML(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}