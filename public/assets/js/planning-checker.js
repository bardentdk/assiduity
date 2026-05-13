function analyzePlanning(learners, planningRows) {
  const planningIndex = buildPlanningIndex(planningRows);

  return learners.map((learner) => {
    const normalizedLearner = normalizeLearner(learner);
    const planningItems = findPlanningForLearner(normalizedLearner, planningIndex);

    const slotsCount = planningItems.length;
    const status = getLearnerPlanningStatus(normalizedLearner, planningItems);

    return {
      fullName: normalizedLearner.fullName,
      firstName: normalizedLearner.firstName,
      lastName: normalizedLearner.lastName,
      email: normalizedLearner.email,
      formation: normalizedLearner.formation,
      session: normalizedLearner.session,
      learnerStatus: normalizedLearner.status,
      slotsCount,
      status: status.type,
      statusLabel: status.label,
      recommendedAction: status.action
    };
  });
}

function buildPlanningIndex(planningRows) {
  return planningRows.map((row) => {
    const firstName = pickValue(row, ['prenom', 'prénom', 'first_name']);
    const lastName = pickValue(row, ['nom', 'last_name']);
    const email = pickValue(row, ['email', 'mail', 'adresse_email']);
    const session = pickValue(row, ['session', 'nom_session']);
    const module = pickValue(row, ['module', 'nom_module']);
    const date = pickValue(row, ['date', 'date_creneau', 'jour']);

    return {
      firstName: cleanValue(firstName),
      lastName: cleanValue(lastName),
      fullName: cleanValue(`${firstName} ${lastName}`),
      email: cleanEmail(email),
      session: cleanValue(session),
      module: cleanValue(module),
      date: cleanValue(date)
    };
  });
}

function normalizeLearner(row) {
  const firstName = pickValue(row, ['prenom', 'prénom', 'first_name']);
  const lastName = pickValue(row, ['nom', 'last_name']);
  const email = pickValue(row, ['email', 'mail', 'adresse_email']);
  const formation = pickValue(row, ['formation', 'nom_formation']);
  const session = pickValue(row, ['session', 'nom_session']);
  const status = pickValue(row, ['statut', 'status']);

  return {
    firstName: cleanValue(firstName),
    lastName: cleanValue(lastName),
    fullName: cleanValue(`${firstName} ${lastName}`),
    email: cleanEmail(email),
    formation: cleanValue(formation),
    session: cleanValue(session),
    status: cleanValue(status)
  };
}

function findPlanningForLearner(learner, planningIndex) {
  return planningIndex.filter((planningItem) => {
    const emailMatches = learner.email && planningItem.email === learner.email;

    const nameMatches =
      learner.fullName &&
      planningItem.fullName &&
      normalizeText(planningItem.fullName) === normalizeText(learner.fullName);

    const sessionMatches =
      !learner.session ||
      !planningItem.session ||
      normalizeText(planningItem.session) === normalizeText(learner.session);

    return (emailMatches || nameMatches) && sessionMatches;
  });
}

function getLearnerPlanningStatus(learner, planningItems) {
  if (!learner.session) {
    return {
      type: 'warning',
      label: 'À vérifier',
      action: 'Aucune session détectée pour cet apprenant.'
    };
  }

  if (planningItems.length === 0) {
    return {
      type: 'missing',
      label: 'Planning manquant',
      action: 'Vérifier son inscription, ses modules et les dates de session dans Digiforma.'
    };
  }

  if (planningItems.length < 3) {
    return {
      type: 'warning',
      label: 'Planning incomplet',
      action: 'Contrôler si tous les modules possèdent bien des créneaux.'
    };
  }

  return {
    type: 'ok',
    label: 'Planning OK',
    action: 'Aucune action nécessaire.'
  };
}

function pickValue(row, possibleKeys) {
  for (const key of possibleKeys) {
    const normalizedKey = normalizeHeader(key);

    if (Object.prototype.hasOwnProperty.call(row, normalizedKey)) {
      return row[normalizedKey];
    }
  }

  return '';
}

function cleanValue(value) {
  return String(value || '').trim();
}

function cleanEmail(value) {
  return cleanValue(value).toLowerCase();
}

function normalizeText(value) {
  return cleanValue(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}