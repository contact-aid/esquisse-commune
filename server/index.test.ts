import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createApp} from './index';

test('Easypanel sert le site et traite les réservations avec une réponse JSON', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'esquisse-test-'));
  await writeFile(path.join(directory, 'index.html'), '<html>Accueil</html>');
  const server = createApp(directory).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  const originalFetch = globalThis.fetch;
  const originalEnv = {...process.env};
  let sentMail: Record<string, unknown> | undefined;
  globalThis.fetch = async (input, init) => {
    if (String(input) === 'https://api.resend.com/emails') {
      sentMail = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({id: 'mock-email'}), {
        headers: {'Content-Type': 'application/json'},
      });
    }
    return originalFetch(input, init);
  };
  try {
    const page = await fetch(`${base}/bureaux-prives-chartres-de-bretagne`);
    assert.equal(page.status, 200);
    assert.equal(await page.text(), '<html>Accueil</html>');
    const method = await fetch(`${base}/api/reservation`);
    assert.equal(method.status, 405);
    assert.equal(method.headers.get('allow'), 'POST');
    const invalid = await fetch(`${base}/api/reservation`, {
      method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}',
    });
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).ok, false);
    const unknown = await fetch(`${base}/api/missing`);
    assert.equal(unknown.status, 404);
    assert.equal((await unknown.json()).ok, false);
    const payload = {
      reservationType: 'bureau', offerLabel: 'Le Module',
      requestedDate: '12 octobre 2026', requestedTime: '09:30',
      contact: {company: 'Test', fullName: 'Test', email: 'test@example.com', phone: '0600000000'},
    };
    const submit = () => fetch(`${base}/api/reservation`, {
      method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload),
    });
    delete process.env.RESEND_API_KEY;
    assert.equal((await submit()).status, 500);
    assert.equal(sentMail, undefined);
    process.env.RESEND_API_KEY = 'mock-key';
    delete process.env.RESERVATION_MAIL_TO;
    const success = await submit();
    assert.equal(success.status, 200);
    assert.equal((await success.json()).ok, true);
    const mail = sentMail as Record<string, unknown> | undefined;
    assert.deepEqual(mail?.to, ['lesquissecommune@gmail.com']);
    assert.equal(mail?.reply_to, 'test@example.com');
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(directory, {recursive: true, force: true});
  }
});
