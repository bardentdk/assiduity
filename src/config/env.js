require('dotenv').config();

module.exports = {
  app: {
    name: process.env.APP_NAME || 'Australe Control Planning',
    version: process.env.APP_VERSION || '1.0.0',
    env: process.env.APP_ENV || 'local',
    port: Number(process.env.APP_PORT || 3000),
    organizationName: process.env.ORGANIZATION_NAME || 'Australe Formation'
  },

  digiforma: {
    apiUrl: process.env.DIGIFORMA_API_URL || 'https://app.digiforma.com/api/v1/graphql',
    apiToken: process.env.DIGIFORMA_API_TOKEN,

    targetYear: Number(process.env.DIGIFORMA_TARGET_YEAR || 2026),
    onlyActive: String(process.env.DIGIFORMA_ONLY_ACTIVE || 'true') === 'true',
    activePipelineState: process.env.DIGIFORMA_ACTIVE_PIPELINE_STATE || 'ongoing',
    useApiPipelineFilter: String(process.env.DIGIFORMA_USE_API_PIPELINE_FILTER || 'false') === 'true',

    pageSize: Number(process.env.DIGIFORMA_PAGE_SIZE || 10),
    maxPages: Number(process.env.DIGIFORMA_MAX_PAGES || 20),
    maxSessionsDetails: Number(process.env.DIGIFORMA_MAX_SESSIONS_DETAILS || 200),
    requestTimeout: Number(process.env.DIGIFORMA_REQUEST_TIMEOUT || 45000)
  }
};