import express from 'express';
import {existsSync} from 'node:fs';
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
  // Une seule URL par page, sans « / » final (comme dans le sitemap et les canonicals).
  app.use((req, res, next) => {
    if ((req.method === 'GET' || req.method === 'HEAD') && req.path.length > 1 && req.path.endsWith('/')) {
      const query = req.originalUrl.slice(req.originalUrl.indexOf('?') === -1 ? req.originalUrl.length : req.originalUrl.indexOf('?'));
      res.redirect(301, (req.path.replace(/\/+$/, '') || '/') + query);
      return;
    }
    next();
  });
  // redirect: false empêche express d'ajouter un « / » aux dossiers (/blog/article → /blog/article/).
  app.use(express.static(distDirectory, {redirect: false}));
  app.get('/{*path}', (req, res) => {
    const prerendered = path.resolve(distDirectory, '.' + req.path, 'index.html');
    if (prerendered.startsWith(path.resolve(distDirectory) + path.sep) && existsSync(prerendered)) {
      res.sendFile(prerendered);
      return;
    }
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
