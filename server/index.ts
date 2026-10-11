import express from 'express';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import reservationHandler from '../api/reservation';

export function createApp(distDirectory = path.resolve('dist')) {
  const app = express();
  app.disable('x-powered-by');
  app.use('/api', express.json({limit: '64kb'}));
  app.all('/api/reservation', reservationHandler);
  app.use('/api', (_req, res) => {
    res.status(404).json({ok: false, message: 'Service introuvable.'});
  });
  app.use(express.static(distDirectory));
  app.get('/{*path}', (_req, res) => {
    res.sendFile(path.join(distDirectory, 'index.html'));
  });
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = typeof error === 'object' && error !== null && 'status' in error
      ? Number(error.status) : 500;
    res.status(status === 413 ? 413 : status === 400 ? 400 : 500).json({
      ok: false,
      message: status === 413 ? 'La demande est trop volumineuse.' : 'La demande ne peut pas être traitée.',
    });
  });
  return app;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const port = Number(process.env.PORT || 3000);
  createApp().listen(port, '0.0.0.0', () => {
    console.log(`Site et API disponibles sur le port ${port}`);
  });
}
