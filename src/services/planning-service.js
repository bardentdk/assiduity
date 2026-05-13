const { digiforma } = require('../config/env');
const { digiformaGraphQLRequest } = require('./digiforma-client');

async function getPlanningControl(options = {}) {
  const runtimeConfig = buildRuntimeConfig(options);

  const lightSessions = await fetchTrainingSessionsLight(runtimeConfig);

  const filteredSessions = lightSessions
    .filter((session) => isTargetYearSession(session, runtimeConfig))
    .filter((session) => isAllowedPipelineState(session, runtimeConfig));

  const sessionsToInspect = filteredSessions.slice(0, runtimeConfig.maxSessionsDetails);

  const detailedSessions = [];
  const failedSessions = [];

  for (const lightSession of sessionsToInspect) {
    try {
      const detailedSession = await fetchTrainingSessionDetails(lightSession.id);

      if (
        detailedSession &&
        isTargetYearSession(detailedSession, runtimeConfig) &&
        isAllowedPipelineState(detailedSession, runtimeConfig)
      ) {
        detailedSessions.push(detailedSession);
      }
    } catch (error) {
      failedSessions.push({
        id: lightSession.id,
        name: lightSession.name,
        error: error.message
      });

      console.error(
        `Session ignorée ${lightSession.id} - ${lightSession.name}`,
        error.message
      );
    }
  }

  const results = buildPlanningResults(detailedSessions);

  return {
    generatedAt: new Date().toISOString(),

    filters: {
      targetYear: runtimeConfig.targetYear,
      pipelineState: runtimeConfig.pipelineState,
      onlyActive: runtimeConfig.onlyActive,
      maxSessionsDetails: runtimeConfig.maxSessionsDetails
    },

    totalSessionsFetched: lightSessions.length,
    totalSessionsAfterFilter: filteredSessions.length,
    totalSessions: detailedSessions.length,
    totalSessionsFailed: failedSessions.length,
    failedSessions,

    totalLearners: results.length,
    totalOk: results.filter((item) => item.status.code === 'ok').length,
    totalMissing: results.filter((item) => item.status.code === 'missing').length,
    totalWarning: results.filter((item) => item.status.code === 'warning').length,

    results
  };
}

function buildRuntimeConfig(options = {}) {
  return {
    targetYear: Number(options.targetYear || digiforma.targetYear || 2026),

    onlyActive: options.onlyActive !== undefined
      ? Boolean(options.onlyActive)
      : Boolean(digiforma.onlyActive),

    pipelineState: options.pipelineState || digiforma.activePipelineState || 'ongoing',

    pageSize: Number(digiforma.pageSize || 10),
    maxPages: Number(digiforma.maxPages || 20),

    maxSessionsDetails: Number(
      options.maxSessionsDetails ||
      digiforma.maxSessionsDetails ||
      200
    ),

    useApiPipelineFilter: Boolean(digiforma.useApiPipelineFilter)
  };
}

async function fetchTrainingSessionsLight(runtimeConfig) {
  const query = `
    query GetTrainingSessionsLight(
      $pagination: Pagination,
      $filters: TrainingSessionFilters
    ) {
      trainingSessions(
        pagination: $pagination,
        filters: $filters
      ) {
        id
        name
        code
        startDate
        endDate
        pipelineState
      }
    }
  `;

  const allSessions = [];
  const filters = buildTrainingSessionFilters(runtimeConfig);

  for (let page = 1; page <= runtimeConfig.maxPages; page++) {
    const variables = {
      pagination: {
        page,
        size: runtimeConfig.pageSize
      },
      filters
    };

    const data = await digiformaGraphQLRequest(query, variables);

    const sessions = Array.isArray(data.trainingSessions)
      ? data.trainingSessions
      : [];

    allSessions.push(...sessions);

    if (sessions.length < runtimeConfig.pageSize) {
      break;
    }
  }

  return allSessions;
}

function buildTrainingSessionFilters(runtimeConfig) {
  const yearStart = `${runtimeConfig.targetYear}-01-01`;
  const yearEnd = `${runtimeConfig.targetYear}-12-31`;

  const filters = {
    startedBefore: yearEnd,
    endedAfter: yearStart
  };

  /*
   * Par défaut, on ne filtre PAS pipelineState côté API,
   * car Digiforma attend un enum GraphQL sensible à la casse.
   * On filtre donc côté Node.js via isAllowedPipelineState().
   */
  if (
    runtimeConfig.useApiPipelineFilter &&
    runtimeConfig.onlyActive &&
    runtimeConfig.pipelineState &&
    runtimeConfig.pipelineState !== 'all'
  ) {
    filters.pipelineState = String(runtimeConfig.pipelineState).toUpperCase();
  }

  return filters;
}

async function fetchTrainingSessionDetails(sessionId) {
  const query = `
    query GetTrainingSessionDetails($id: ID!) {
      trainingSession(id: $id) {
        id
        name
        code
        startDate
        endDate
        pipelineState
        trainingType
        type
        timezone

        trainees {
          id
          firstname
          lastname
          email
          status
        }

        trainingSessionSlots {
          id
          date
          startTime
          endTime
          slot

          customerTrainees {
            id
            trainee {
              id
              firstname
              lastname
              email
            }
          }

          subsession {
            id
            name
          }
        }
      }
    }
  `;

  const data = await digiformaGraphQLRequest(query, {
    id: sessionId
  });

  return data.trainingSession || null;
}

function buildPlanningResults(sessions) {
  const results = [];

  sessions.forEach((session) => {
    const trainees = Array.isArray(session.trainees) ? session.trainees : [];

    const slots = Array.isArray(session.trainingSessionSlots)
      ? session.trainingSessionSlots
      : [];

    trainees.forEach((trainee) => {
      const traineeSlots = findSlotsForTrainee(trainee, slots);

      const status = getStatus({
        session,
        trainee,
        traineeSlots,
        sessionSlots: slots
      });

      results.push({
        learnerId: trainee.id,
        fullName: buildFullName(trainee.firstname, trainee.lastname),
        email: trainee.email || '',
        learnerStatus: trainee.status || '',
        sessionId: session.id,
        sessionName: session.name || '',
        sessionCode: session.code || '',
        sessionStatus: session.pipelineState || '',
        sessionStartDate: session.startDate || '',
        sessionEndDate: session.endDate || '',
        sessionType: session.type || '',
        trainingType: session.trainingType || '',
        timezone: session.timezone || '',
        slotsCount: traineeSlots.length,
        totalSessionSlots: slots.length,
        status,
        slots: traineeSlots.map((slot) => ({
          id: slot.id,
          date: slot.date,
          startTime: slot.startTime,
          endTime: slot.endTime,
          slot: slot.slot,
          subsessionName: slot.subsession?.name || ''
        }))
      });
    });
  });

  return results;
}

function isAllowedPipelineState(session, runtimeConfig) {
  if (!runtimeConfig.onlyActive) {
    return true;
  }

  if (!runtimeConfig.pipelineState || runtimeConfig.pipelineState === 'all') {
    return true;
  }

  return String(session.pipelineState || '').toLowerCase() ===
    String(runtimeConfig.pipelineState || '').toLowerCase();
}

function isTargetYearSession(session, runtimeConfig) {
  const yearStart = new Date(`${runtimeConfig.targetYear}-01-01T00:00:00`);
  const yearEnd = new Date(`${runtimeConfig.targetYear}-12-31T23:59:59`);

  const startDate = parseDate(session.startDate);
  const endDate = parseDate(session.endDate);

  if (!startDate && !endDate) {
    return false;
  }

  if (startDate && endDate) {
    return startDate <= yearEnd && endDate >= yearStart;
  }

  if (startDate && !endDate) {
    return startDate >= yearStart && startDate <= yearEnd;
  }

  if (!startDate && endDate) {
    return endDate >= yearStart && endDate <= yearEnd;
  }

  return false;
}

function parseDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function findSlotsForTrainee(trainee, slots) {
  const traineeId = String(trainee.id || '');
  const traineeEmail = cleanEmail(trainee.email);

  return slots.filter((slot) => {
    const customerTrainees = Array.isArray(slot.customerTrainees)
      ? slot.customerTrainees
      : [];

    const hasDirectTraineeMatch = customerTrainees.some((customerTrainee) => {
      const linkedTrainee = customerTrainee.trainee;

      if (!linkedTrainee) {
        return false;
      }

      const linkedTraineeId = String(linkedTrainee.id || '');
      const linkedTraineeEmail = cleanEmail(linkedTrainee.email);

      return (
        linkedTraineeId === traineeId ||
        Boolean(traineeEmail && linkedTraineeEmail === traineeEmail)
      );
    });

    if (hasDirectTraineeMatch) {
      return true;
    }

    if (customerTrainees.length === 0) {
      return true;
    }

    return false;
  });
}

function getStatus({ session, trainee, traineeSlots, sessionSlots }) {
  if (!session.startDate || !session.endDate) {
    return {
      code: 'warning',
      label: 'Session sans dates complètes',
      action: 'Vérifier les dates de début et de fin de session dans Digiforma.'
    };
  }

  if (!Array.isArray(sessionSlots) || sessionSlots.length === 0) {
    return {
      code: 'missing',
      label: 'Aucun créneau session',
      action: 'Ajouter des créneaux de formation dans la session Digiforma.'
    };
  }

  if (!trainee.email) {
    return {
      code: 'warning',
      label: 'Email apprenant manquant',
      action: 'Compléter la fiche apprenant dans Digiforma pour fiabiliser le contrôle.'
    };
  }

  if (traineeSlots.length === 0) {
    return {
      code: 'missing',
      label: 'Planning manquant',
      action: 'Vérifier l’affectation de l’apprenant aux créneaux, modules ou sous-sessions.'
    };
  }

  if (traineeSlots.length < 3) {
    return {
      code: 'warning',
      label: 'Planning possiblement incomplet',
      action: 'Contrôler que l’apprenant possède bien tous ses créneaux de formation.'
    };
  }

  return {
    code: 'ok',
    label: 'Planning OK',
    action: 'Aucune action nécessaire.'
  };
}

function buildFullName(firstname, lastname) {
  return [firstname, lastname]
    .filter(Boolean)
    .join(' ')
    .trim();
}

function cleanEmail(value) {
  return String(value || '').trim().toLowerCase();
}

module.exports = {
  getPlanningControl
};