const express = require('express');
const path = require('path');
require('dotenv').config();

const planningRoutes = require('./src/routes/planning.routes');
const remindersRoutes = require('./src/routes/reminders.routes');
const cacheRoutes = require('./src/routes/cache.routes');

const { app: appConfig } = require('./src/config/env');

const app = express();

app.use(express.json({
  limit: '50mb'
}));

app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/planning', planningRoutes);
app.use('/api/reminders', remindersRoutes);
app.use('/api/cache', cacheRoutes);

app.get('/api/config', (req, res) => {
  res.json({
    appName: appConfig.name,
    appVersion: appConfig.version,
    appEnv: appConfig.env,
    organizationName: appConfig.organizationName
  });
});

app.listen(appConfig.port, () => {
  console.log(`✅ ${appConfig.name} lancé sur http://localhost:${appConfig.port}`);
});