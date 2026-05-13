const express = require('express');
const { getSignatureReminders } = require('../services/signature-reminder-service');

const router = express.Router();

router.get('/signatures', async (req, res) => {
  try {
    const maxSessionsDetails = req.query.maxSessionsDetails
      ? Number(req.query.maxSessionsDetails)
      : 10;

    const safeMaxSessionsDetails = Math.min(
      Math.max(maxSessionsDetails, 1),
      50
    );

    const options = {
      targetYear: req.query.year ? Number(req.query.year) : undefined,

      pipelineState: req.query.pipelineState || undefined,

      onlyActive: req.query.onlyActive !== undefined
        ? String(req.query.onlyActive) === 'true'
        : undefined,

      maxSessionsDetails: safeMaxSessionsDetails,

      includeTodaySlots: req.query.includeTodaySlots !== undefined
        ? String(req.query.includeTodaySlots) === 'true'
        : undefined
    };

    const reminders = await getSignatureReminders(options);

    res.json({
      success: true,
      data: reminders
    });
  } catch (error) {
    console.error('Erreur /api/reminders/signatures :', error);

    res.status(500).json({
      success: false,
      message: error.message || 'Erreur lors de la récupération des émargements non signés.'
    });
  }
});

module.exports = router;