import { Router } from 'express';
import { listScenarios, resolveScenario } from '../../../application/index.js';
import { HttpError } from '../http-error.js';
import { parseStartRun } from '../parsing.js';
import type { RunRegistry } from '../runs/run-registry.js';
import { formatMessage, openEventStream } from '../runs/sse.js';
import type { HttpServices } from '../services.js';

/** `GET /api/scenarios`, `POST /api/runs`, `GET /api/runs/:id/events`. */
export const runRoutes = (services: HttpServices, runs: RunRegistry): Router => {
  const router = Router();

  router.get('/scenarios', (_req, res) => {
    res.json(listScenarios());
  });

  router.post('/runs', (req, res) => {
    const { configuration, scenarioId } = parseStartRun(req.body);
    const scenario = resolveScenario(scenarioId, configuration);
    if (!scenario.ok) throw new HttpError(400, scenario.error);
    const started = runs.start(({ runId, emit }) =>
      services.runScenario({ runId, configuration, scenario: scenario.value, emit }),
    );
    if (!started.ok) throw new HttpError(409, started.error);
    res.status(202).json({ runId: started.value });
  });

  router.get('/runs/:id/events', (req, res) => {
    const runId = req.params.id;
    if (!runs.has(runId)) throw new HttpError(404, 'RUN_UNKNOWN');
    openEventStream(res);
    const unsubscribe = runs.subscribe(runId, (message) => {
      res.write(formatMessage(message));
      if (message.kind !== 'event') res.end();
    });
    req.on('close', unsubscribe);
  });

  return router;
};
