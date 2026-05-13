const { digiforma } = require('../config/env');
const { digiformaGraphQLRequest } = require('./digiforma-client');

async function getSignatureReminders(options = {}) {
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
      const detailedSession = await fetchTrainingSessionSignatureDetails(lightSession.id);

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

  const reminders = buildSignatureReminders(detailedSessions, runtimeConfig);

  return {
    generatedAt: new Date().toISOString(),

    filters: {
      targetYear: runtimeConfig.targetYear,
      pipelineState: runtimeConfig.pipelineState,
      onlyActive: runtimeConfig.onlyActive,
      maxSessionsDetails: runtimeConfig.maxSessionsDetails,
      includeTodaySlots: runtimeConfig.includeTodaySlots
    },

    totalSessionsFetched: lightSessions.length,
    totalSessionsAfterFilter: filteredSessions.length,
    totalSessions: detailedSessions.length,
    totalSessionsFailed: failedSessions.length,
    failedSessions,

    totalReminders: reminders.length,
    totalCritical: reminders.filter((item) => item.priority === 'critical').length,
    totalHigh: reminders.filter((item) => item.priority === 'high').length,
    totalNormal: reminders.filter((item) => item.priority === 'normal').length,

    reminders
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
      10
    ),

    useApiPipelineFilter: Boolean(digiforma.useApiPipelineFilter),

    includeTodaySlots: options.includeTodaySlots !== undefined
      ? Boolean(options.includeTodaySlots)
      : false
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

async function fetchTrainingSessionSignatureDetails(sessionId) {
  const query = `
    query GetTrainingSessionSignatureDetails($id: ID!) {
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
          phone
          phoneSecondary
          status
        }

        trainingSessionSlots {
          id
          date
          startTime
          endTime
          slot

          signatures {
            signature
            type

            customerTrainee {
              id
              trainee {
                id
                firstname
                lastname
                email
                phone
                phoneSecondary
              }
            }
          }

          customerTrainees {
            id
            attendanceProofUrl
            extranetUrl

            trainee {
              id
              firstname
              lastname
              email
              phone
              phoneSecondary
            }

            signatures {
              signature
              type
              dates {
                id
                date
                startTime
                endTime
              }
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

function buildSignatureReminders(sessions, runtimeConfig) {
  const reminders = [];

  sessions.forEach((session) => {
    const sessionTrainees = Array.isArray(session.trainees)
      ? session.trainees
      : [];

    const slots = Array.isArray(session.trainingSessionSlots)
      ? session.trainingSessionSlots
      : [];

    slots.forEach((slot) => {
      if (!isPastSlot(slot, runtimeConfig)) {
        return;
      }

      const concernedTrainees = getConcernedTraineesForSlot(slot, sessionTrainees);

      concernedTrainees.forEach((traineeContext) => {
        const trainee = traineeContext.trainee;
        const customerTrainee = traineeContext.customerTrainee;

        if (!trainee) {
          return;
        }

        const hasSignature = hasValidSignatureForSlot({
          slot,
          trainee,
          customerTrainee
        });

        if (hasSignature) {
          return;
        }

        reminders.push(
          buildReminderItem({
            session,
            slot,
            trainee,
            customerTrainee
          })
        );
      });
    });
  });

  return sortReminders(removeDuplicateReminders(reminders));
}

function getConcernedTraineesForSlot(slot, sessionTrainees) {
  const customerTrainees = Array.isArray(slot.customerTrainees)
    ? slot.customerTrainees
    : [];

  if (customerTrainees.length > 0) {
    return customerTrainees
      .filter((customerTrainee) => customerTrainee && customerTrainee.trainee)
      .map((customerTrainee) => ({
        trainee: customerTrainee.trainee,
        customerTrainee
      }));
  }

  return sessionTrainees.map((trainee) => ({
    trainee,
    customerTrainee: null
  }));
}

function hasValidSignatureForSlot({ slot, trainee, customerTrainee }) {
  const slotSignatures = Array.isArray(slot.signatures)
    ? slot.signatures
    : [];

  const customerTraineeSignatures = Array.isArray(customerTrainee?.signatures)
    ? customerTrainee.signatures
    : [];

  const traineeId = String(trainee.id || '');
  const traineeEmail = cleanEmail(trainee.email);

  const hasSlotSignature = slotSignatures.some((signature) => {
    if (!isSignatureFilled(signature)) {
      return false;
    }

    const signatureTrainee = signature.customerTrainee?.trainee;

    if (!signatureTrainee) {
      return false;
    }

    return isSameTrainee(signatureTrainee, traineeId, traineeEmail);
  });

  if (hasSlotSignature) {
    return true;
  }

  const hasCustomerTraineeSignature = customerTraineeSignatures.some((signature) => {
    if (!isSignatureFilled(signature)) {
      return false;
    }

    const dates = Array.isArray(signature.dates) ? signature.dates : [];

    if (dates.length === 0) {
      return true;
    }

    return dates.some((dateSlot) => String(dateSlot.id || '') === String(slot.id || ''));
  });

  return hasCustomerTraineeSignature;
}

function isSignatureFilled(signature) {
  return Boolean(String(signature?.signature || '').trim());
}

function isSameTrainee(signatureTrainee, traineeId, traineeEmail) {
  const signatureTraineeId = String(signatureTrainee.id || '');
  const signatureTraineeEmail = cleanEmail(signatureTrainee.email);

  if (traineeId && signatureTraineeId && signatureTraineeId === traineeId) {
    return true;
  }

  if (traineeEmail && signatureTraineeEmail && signatureTraineeEmail === traineeEmail) {
    return true;
  }

  return false;
}

function buildReminderItem({ session, slot, trainee, customerTrainee }) {
  const slotDate = slot.date || '';
  const startTime = normalizeTime(slot.startTime);
  const endTime = normalizeTime(slot.endTime);

  const daysLate = computeDaysLate(slotDate);
  const priority = computePriority(daysLate);

  const fullName = buildFullName(trainee.firstname, trainee.lastname);
  const firstName = trainee.firstname || '';
  const sessionName = session.name || 'votre formation';

  const emailMessage = buildEmailReminderMessage({
    firstName,
    sessionName,
    slotDate,
    startTime,
    endTime,
    extranetUrl: customerTrainee?.extranetUrl || ''
  });

  const whatsappMessage = buildWhatsappReminderMessage({
    firstName,
    sessionName,
    slotDate,
    startTime,
    endTime,
    extranetUrl: customerTrainee?.extranetUrl || ''
  });

  return {
    id: buildReminderId(session, slot, trainee),

    priority,
    daysLate,

    learnerId: trainee.id || '',
    fullName,
    firstName,
    lastName: trainee.lastname || '',
    email: trainee.email || '',
    phone: trainee.phone || trainee.phoneSecondary || '',

    customerTraineeId: customerTrainee?.id || '',
    extranetUrl: customerTrainee?.extranetUrl || '',
    attendanceProofUrl: customerTrainee?.attendanceProofUrl || '',

    sessionId: session.id || '',
    sessionName,
    sessionCode: session.code || '',
    sessionStatus: session.pipelineState || '',
    sessionStartDate: session.startDate || '',
    sessionEndDate: session.endDate || '',

    slotId: slot.id || '',
    slotDate,
    startTime,
    endTime,
    slotLabel: slot.slot || '',
    subsessionName: slot.subsession?.name || '',

    status: {
      code: 'missing_signature',
      label: 'Émargement non signé',
      action: 'Relancer l’apprenant pour signature de son émargement Digiforma.'
    },

    messages: {
      email: emailMessage,
      whatsapp: whatsappMessage
    }
  };
}

function buildEmailReminderMessage({
  firstName,
  sessionName,
  slotDate,
  startTime,
  endTime,
  extranetUrl
}) {
  const formattedDate = formatDateFR(slotDate);

  const linkSentence = extranetUrl
    ? `\n\nLien utile : ${extranetUrl}`
    : '';

  return [
    `Bonjour ${firstName || ''},`.trim(),
    '',
    `Sauf erreur de notre part, votre émargement du ${formattedDate} de ${startTime} à ${endTime} pour la formation "${sessionName}" n’a pas encore été signé.`,
    '',
    'Pouvez-vous vous connecter à votre espace apprenant Digiforma afin de régulariser votre signature, s’il vous plaît ?',
    '',
    'Cette signature est importante, car elle permet de justifier officiellement votre présence en formation.',
    linkSentence,
    '',
    'Merci d’avance pour votre retour.',
    '',
    'Cordialement,',
    'Australe Formation'
  ].join('\n');
}

function buildWhatsappReminderMessage({
  firstName,
  sessionName,
  slotDate,
  startTime,
  endTime,
  extranetUrl
}) {
  const formattedDate = formatDateFR(slotDate);

  const linkPart = extranetUrl
    ? ` Lien : ${extranetUrl}`
    : '';

  return `Bonjour ${firstName || ''}, sauf erreur de notre part, votre émargement du ${formattedDate} de ${startTime} à ${endTime} pour la formation "${sessionName}" n’a pas encore été signé. Pouvez-vous vous connecter à votre espace Digiforma pour le régulariser, s’il vous plaît ? Merci, Australe Formation.${linkPart}`.trim();
}

function isPastSlot(slot, runtimeConfig) {
  if (!slot.date) {
    return false;
  }

  const now = new Date();

  const endTime = normalizeTime(slot.endTime || '23:59');
  const slotEndDate = new Date(`${slot.date}T${endTime}`);

  if (Number.isNaN(slotEndDate.getTime())) {
    return false;
  }

  if (runtimeConfig.includeTodaySlots) {
    return slotEndDate < now;
  }

  const todayKey = toDateKey(now);
  const slotKey = toDateKey(slotEndDate);

  return slotKey < todayKey;
}

function computeDaysLate(slotDate) {
  const date = new Date(`${slotDate}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return 0;
  }

  const today = new Date();

  const todayMidnight = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );

  const slotMidnight = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );

  const diffMs = todayMidnight.getTime() - slotMidnight.getTime();

  return Math.max(0, Math.floor(diffMs / 86400000));
}

function computePriority(daysLate) {
  if (daysLate >= 7) {
    return 'critical';
  }

  if (daysLate >= 3) {
    return 'high';
  }

  return 'normal';
}

function sortReminders(reminders) {
  const priorityWeight = {
    critical: 1,
    high: 2,
    normal: 3
  };

  return reminders.sort((a, b) => {
    const priorityDiff =
      (priorityWeight[a.priority] || 99) - (priorityWeight[b.priority] || 99);

    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    return b.daysLate - a.daysLate;
  });
}

function removeDuplicateReminders(reminders) {
  const map = new Map();

  reminders.forEach((reminder) => {
    if (!map.has(reminder.id)) {
      map.set(reminder.id, reminder);
    }
  });

  return Array.from(map.values());
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

function normalizeTime(value) {
  const stringValue = String(value || '').trim();

  if (!stringValue) {
    return '00:00';
  }

  if (/^\d{2}:\d{2}$/.test(stringValue)) {
    return stringValue;
  }

  if (/^\d{2}:\d{2}:\d{2}$/.test(stringValue)) {
    return stringValue.slice(0, 5);
  }

  return stringValue;
}

function formatDateFR(value) {
  if (!value) {
    return 'date non renseignée';
  }

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('fr-FR').format(date);
}

function toDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
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

function buildReminderId(session, slot, trainee) {
  return [
    'reminder',
    session.id || 'session',
    slot.id || 'slot',
    trainee.id || cleanEmail(trainee.email) || 'trainee'
  ].join('_');
}

module.exports = {
  getSignatureReminders
};