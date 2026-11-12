import fetchMock from 'fetch-mock';
import { apiClient } from '../apiClient';

describe('CLI apiClient tests', () => {
  let client;

  beforeEach(() => {
    client = apiClient({
      apikey: 'org:app:key',
      apihost: 'http://example.com',
    });
  });

  afterEach(() => {
    fetchMock.restore();
  });

  it('should send a request to create a release', mochaAsync(async () => {
    fetchMock.post('http://example.com/v1/orgs/org/apps/app/releases/', () => 200);
    await client.createRelease({ version: '1.0.2' });

    expect(fetchMock.calls().matched).to.have.length(1);
    expect(fetchMock.calls().unmatched).to.have.length(0);

    const opts = fetchMock.lastCall()[1];
    expect(opts.headers).to.have.property('Authorization', 'Token org:app:key');
    expect(opts.body).to.equal('{"version":"1.0.2"}');
  }));

  it('should send a request to fetch an upload url', mochaAsync(async () => {
    fetchMock.post(
      'http://example.com/v1/orgs/org/apps/app/releases/1.0.2/artifacts/',
      () => ({ signed_url: 'http://example.com/upload' }),
      { name: 'troytown' }
    );

    fetchMock.put('http://example.com/upload', () => 200, { name: 'gcloud' });

    const release = '1.0.2';
    await client.uploadFile({
      release,
      data: { filepath: '~/path.js' },
      contents: 'stuff!',
      url: `releases/${release}/artifacts`,
    });

    expect(fetchMock.calls().matched).to.have.length(2);
    expect(fetchMock.calls().unmatched).to.have.length(0);

    const tt = fetchMock.lastOptions('troytown');
    expect(tt.headers).to.have.property('Authorization', 'Token org:app:key');
    expect(tt.body).to.equal('{"filepath":"~/path.js"}');

    const gCloud = fetchMock.lastOptions('gcloud');
    expect(gCloud.body).to.equal('stuff!');
  }));

  const fetchError = (cause) => {
    const err = new TypeError('fetch failed');
    err.cause = cause;
    return err;
  };

  it('should retry a network error', mochaAsync(async () => {
    const retryClient = apiClient({ apikey: 'org:app:key', apihost: 'http://example.com', maxRetryDelay: 1 });
    let calls = 0;
    fetchMock.post('http://example.com/v1/orgs/org/apps/app/releases/', () => {
      calls++;
      if (calls === 1) {
        const cause = new Error('read ECONNRESET');
        cause.code = 'ECONNRESET';
        return { throws: fetchError(cause) };
      }
      return 200;
    });

    const res = await retryClient.createRelease({ version: '1.0.2' });

    expect(res.status).to.equal(200);
    expect(calls).to.equal(2);
  }));

  it('should not retry a fetch error without a network error code', mochaAsync(async () => {
    const retryClient = apiClient({ apikey: 'org:app:key', apihost: 'http://example.com', maxRetryDelay: 1 });
    fetchMock.post('http://example.com/v1/orgs/org/apps/app/releases/', {
      throws: fetchError(new Error('bad port')),
    });

    let error;
    try {
      await retryClient.createRelease({ version: '1.0.2' });
    } catch (err) {
      error = err;
    }

    expect(error.cause.message).to.equal('bad port');
    expect(fetchMock.calls().matched).to.have.length(1);
  }));

  it('should handle pats', mochaAsync(async () => {
    const patClient = apiClient({
      apikey: 'pat:myorg:myapp:secret',
      apihost: 'https://example.com',
    });

    fetchMock.post(
      'https://example.com/v1/orgs/myorg/apps/myapp/releases/',
      () => 200,
    );

    await patClient.createRelease({ version: '1.0.0' });

    expect(fetchMock.calls().matched).to.have.length(1);
    const opts = fetchMock.lastCall()[1];
    expect(opts.headers).to.have.property('Authorization', 'Token pat:myorg:myapp:secret');
  }));
});
