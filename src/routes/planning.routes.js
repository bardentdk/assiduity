const express = require('express');
const { getPlanningControl } = require('../services/planning-service');
const { testDigiformaConnection } = require('../services/digiforma-client');

const router = express.Router();

router.get('/test', async (req, res) => {
  try {
    const result = await testDigiformaConnection();

    res.json({
      success: true,
      message: 'Connexion Digiforma OK.',
      data: result
    });
  } catch (error) {
    console.error('Erreur /api/planning/test :', error);

    res.status(500).json({
      success: false,
      message: error.message || 'Erreur pendant le test de connexion Digiforma.'
    });
  }
});

router.get('/sync', async (req, res) => {
  try {
    const options = {
      targetYear: req.query.year ? Number(req.query.year) : undefined,

      pipelineState: req.query.pipelineState || undefined,

      onlyActive: req.query.onlyActive !== undefined
        ? String(req.query.onlyActive) === 'true'
        : undefined,

      maxSessionsDetails: req.query.maxSessionsDetails
        ? Number(req.query.maxSessionsDetails)
        : undefined
    };

    const control = await getPlanningControl(options);

    res.json({
      success: true,
      data: control
    });
  } catch (error) {
    console.error('Erreur /api/planning/sync :', error);

    res.status(500).json({
      success: false,
      message: error.message || 'Erreur lors de la synchronisation Digiforma.'
    });
  }
});

module.exports = router;