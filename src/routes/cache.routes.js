const express = require('express');

const {
  saveDigiformaCache,
  getDigiformaCache,
  clearDigiformaCache,
  validateDigiformaCache
} = require('../services/cache-service');

const router = express.Router();

function verifyCacheSecret(req, res, next) {
  const expectedSecret = process.env.CACHE_SECRET;

  if (!expectedSecret) {
    return res.status(500).json({
      success: false,
      message: 'CACHE_SECRET est manquant dans le fichier .env.'
    });
  }

  const receivedSecret = req.header('X-Australe-Cache-Secret');

  if (!receivedSecret || receivedSecret !== expectedSecret) {
    return res.status(401).json({
      success: false,
      message: 'Secret cache invalide ou manquant.'
    });
  }

  next();
}

router.post('/digiforma', verifyCacheSecret, async (req, res) => {
  try {
    validateDigiformaCache(req.body);

    const savedCache = await saveDigiformaCache(req.body);

    res.json({
      success: true,
      message: 'Cache Digiforma enregistré avec succès.',
      data: {
        generatedAt: savedCache.generatedAt || null,
        receivedAt: savedCache.receivedAt,
        totalLearners: savedCache.planning?.totalLearners || 0,
        totalPlanningMissing: savedCache.planning?.totalMissing || 0,
        totalReminders: savedCache.reminders?.totalReminders || 0
      }
    });
  } catch (error) {
    console.error('Erreur POST /api/cache/digiforma :', error);

    res.status(400).json({
      success: false,
      message: error.message || 'Impossible d’enregistrer le cache Digiforma.'
    });
  }
});

router.get('/digiforma', async (req, res) => {
  try {
    const cache = await getDigiformaCache();

    if (!cache) {
      return res.status(404).json({
        success: false,
        message: 'Aucun cache Digiforma disponible pour le moment.'
      });
    }

    res.json({
      success: true,
      data: cache
    });
  } catch (error) {
    console.error('Erreur GET /api/cache/digiforma :', error);

    res.status(500).json({
      success: false,
      message: error.message || 'Impossible de lire le cache Digiforma.'
    });
  }
});

router.get('/digiforma/status', async (req, res) => {
  try {
    const cache = await getDigiformaCache();

    if (!cache) {
      return res.json({
        success: true,
        hasCache: false,
        message: 'Aucun cache disponible.'
      });
    }

    res.json({
      success: true,
      hasCache: true,
      generatedAt: cache.generatedAt || null,
      receivedAt: cache.receivedAt || null,
      source: cache.source || 'unknown',
      filters: cache.filters || {},
      planning: {
        totalLearners: cache.planning?.totalLearners || 0,
        totalMissing: cache.planning?.totalMissing || 0,
        totalWarning: cache.planning?.totalWarning || 0,
        totalOk: cache.planning?.totalOk || 0
      },
      reminders: {
        totalReminders: cache.reminders?.totalReminders || 0,
        totalCritical: cache.reminders?.totalCritical || 0,
        totalHigh: cache.reminders?.totalHigh || 0,
        totalNormal: cache.reminders?.totalNormal || 0
      }
    });
  } catch (error) {
    console.error('Erreur GET /api/cache/digiforma/status :', error);

    res.status(500).json({
      success: false,
      message: error.message || 'Impossible de lire le statut du cache.'
    });
  }
});

router.delete('/digiforma', verifyCacheSecret, async (req, res) => {
  try {
    const deleted = await clearDigiformaCache();

    res.json({
      success: true,
      deleted,
      message: deleted
        ? 'Cache Digiforma supprimé.'
        : 'Aucun cache à supprimer.'
    });
  } catch (error) {
    console.error('Erreur DELETE /api/cache/digiforma :', error);

    res.status(500).json({
      success: false,
      message: error.message || 'Impossible de supprimer le cache Digiforma.'
    });
  }
});

module.exports = router;