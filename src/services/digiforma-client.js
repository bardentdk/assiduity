const { digiforma } = require('../config/env');

async function digiformaGraphQLRequest(query, variables = {}, options = {}) {
  if (!digiforma.apiUrl) {
    throw new Error('DIGIFORMA_API_URL est manquant dans le fichier .env.');
  }

  if (!digiforma.apiToken) {
    throw new Error('DIGIFORMA_API_TOKEN est manquant dans le fichier .env.');
  }

  const controller = new AbortController();
  const timeout = options.timeout || digiforma.requestTimeout;

  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeout);

  try {
    const response = await fetch(digiforma.apiUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${digiforma.apiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query,
        variables
      })
    });

    let payload;

    try {
      payload = await response.json();
    } catch (error) {
      throw new Error('Réponse Digiforma illisible. Vérifie le token, l’URL API ou la disponibilité du service.');
    }

    if (!response.ok) {
      const graphqlMessage = Array.isArray(payload.errors)
        ? payload.errors.map((error) => error.message).join(' | ')
        : '';

      const details = graphqlMessage ? ` Détail : ${graphqlMessage}` : '';

      throw new Error(
        `Erreur HTTP Digiforma ${response.status}.${details}`
      );
    }

    if (payload.errors && payload.errors.length > 0) {
      throw new Error(
        payload.errors.map((error) => error.message).join(' | ')
      );
    }

    return payload.data;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(
        `La requête Digiforma a dépassé ${timeout / 1000}s. Réduis DIGIFORMA_PAGE_SIZE dans le .env.`
      );
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function testDigiformaConnection() {
  const query = `
    query TestDigiformaConnection {
      trainees(pagination: { page: 1, size: 1 }) {
        id
        firstname
        lastname
        email
      }
    }
  `;

  const data = await digiformaGraphQLRequest(query);

  return {
    success: true,
    sample: data.trainees || []
  };
}

module.exports = {
  digiformaGraphQLRequest,
  testDigiformaConnection
};