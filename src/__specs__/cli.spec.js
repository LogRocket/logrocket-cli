import { createServer } from 'http';
import { exec } from 'child_process';
import { parse } from 'url';
import getRawBody from 'raw-body';

const CLI_INDEX = './bin/logrocket';
const FIXTURE_PATH = './test/fixtures/';

const executeCommand = async (cmd, { env = '' } = {}) => {
  return new Promise(resolve => {
    exec(
      `${env} ${CLI_INDEX} ${cmd}`,
      (err, stdout, stderr) => {
        resolve({ err, stdout, stderr });
      }
    );
  });
};

describe('CLI dispatch tests', function cliTests() {
  this.timeout(30000);

  let server;
  let expectRequests;
  let unmatchedRequests;
  let matchedRequests;

  const addExpectRequest = (url, opts) => {
    expectRequests[url] = {
      body: {},
      status: 200,
      ...opts,
    };
  };

  const addCliStatusMessage = ({ message = '', status = 204 } = {}) => {
    addExpectRequest('/cli/status/', {
      status: (status === 204 && message !== '') ? 200 : status,
      body: { message },
    });
  };

  const resetRequestCapture = () => {
    expectRequests = {};
    unmatchedRequests = [];
    matchedRequests = [];
  };

  before(() => {
    server = createServer(async (req, res) => {
      const parts = parse(req.url);

      if (expectRequests[parts.pathname]) {
        const body = await getRawBody(req);
        const req2 = req;

        req2.body = body.toString();
        matchedRequests.push(req2);

        const request = expectRequests[parts.pathname];

        res.writeHead(request.status, { 'Content-Type': 'application/json' });
        res.write(JSON.stringify(request.body));
      } else {
        unmatchedRequests.push(req);

        res.writeHead(501, { 'Content-Type': 'application/json' });
      }

      res.end();
    });

    server.listen(8818);
  });

  after(() => {
    server.close();
  });

  beforeEach(() => {
    resetRequestCapture();
  });

  it('should show help if no arguments are given', mochaAsync(async () => {
    const result = await executeCommand('');
    expect(result.stderr).to.contain('Usage: logrocket');
  }));

  it('should show help if no command is given', mochaAsync(async () => {
    const result = await executeCommand('-k org:app:key');
    expect(result.stderr).to.contain('Usage: logrocket');
  }));

  it('should show help for common help flags', mochaAsync(async () => {
    const result1 = await executeCommand('-h');
    expect(result1.stdout).to.contain('Usage: logrocket');

    const result2 = await executeCommand('--help');
    expect(result2.stdout).to.contain('Usage: logrocket');

    const result3 = await executeCommand('help');
    expect(result3.stdout).to.contain('Usage: logrocket');
  }));

  it('should not reveal --apihost in help', mochaAsync(async () => {
    const result = await executeCommand('--help');
    expect(result.stdout).to.not.contain('apihost');
  }));

  it('should accept the apikey in various ways', mochaAsync(async () => {
    const result1 = await executeCommand('-k org:app:secret');
    expect(result1.stderr).to.not.contain('You must provide a LogRocket API key');

    const result2 = await executeCommand('--apikey="org:app:secret"');
    expect(result2.stderr).to.not.contain('You must provide a LogRocket API key');

    const result3 = await executeCommand('', { env: 'LOGROCKET_APIKEY=org:app:secret' });
    expect(result3.stderr).to.not.contain('You must provide a LogRocket API key');
  }));

  // RELEASE

  it('should show the release help without errors', mochaAsync(async () => {
    const result2 = await executeCommand('help release');
    expect(result2.stdout).to.contain('Usage: logrocket release');

    const result3 = await executeCommand('release --help');
    expect(result3.stdout).to.contain('Usage: logrocket release');
  }));

  it('should show release help with error if no options are passed', mochaAsync(async () => {
    const result = await executeCommand('release');

    expect(result.err.code).to.equal(1);
    expect(result.stderr).to.contain('Usage: logrocket release');
    expect(result.stderr).to.contain('Missing');
  }));

  it('should error if no release version is passed', mochaAsync(async () => {
    const result = await executeCommand('release -k org:app:secret --apihost="http://localhost:8818"');

    expect(result.err.code).to.equal(1);
    expect(result.stderr).to.contain('Missing release version');
  }));

  it('should send a request to create a release', mochaAsync(async () => {
    addCliStatusMessage();
    addExpectRequest('/v1/orgs/org/apps/app/releases/', { status: 200 });

    const result = await executeCommand('release -k org:app:secret --apihost="http://localhost:8818" 1.0.3');

    expect(result.err).to.be.null();
    expect(matchedRequests).to.have.length(2);
    expect(unmatchedRequests).to.have.length(0);

    const req = matchedRequests[1];
    expect(req.method).to.equal('POST');
    expect(req.headers).to.have.property('authorization', 'Token org:app:secret');
    expect(req.body).to.equal('{"version":"1.0.3"}');
  }));

  it('should ignore duplicate releases', mochaAsync(async () => {
    addCliStatusMessage();
    addExpectRequest('/v1/orgs/org/apps/app/releases/', { status: 200 });

    const result1 = await executeCommand('release -k org:app:secret --apihost="http://localhost:8818" 1.0.3');

    expect(result1.err).to.be.null();
    expect(matchedRequests).to.have.length(2);
    expect(unmatchedRequests).to.have.length(0);

    resetRequestCapture();
    addCliStatusMessage();
    addExpectRequest('/v1/orgs/org/apps/app/releases/', { status: 200 });

    const result2 = await executeCommand('release -k org:app:secret --apihost="http://localhost:8818" 1.0.3');

    expect(result2.err).to.be.null();
    expect(matchedRequests).to.have.length(2);
    expect(unmatchedRequests).to.have.length(0);
  }));

  it('should error on duplicate releases when in strict mode', mochaAsync(async () => {
    addCliStatusMessage();
    addExpectRequest('/v1/orgs/org/apps/app/releases/', { status: 200 });

    const result1 = await executeCommand('release -k org:app:secret --apihost="http://localhost:8818" 1.0.3');

    expect(result1.err).to.be.null();
    expect(matchedRequests).to.have.length(2);
    expect(unmatchedRequests).to.have.length(0);

    resetRequestCapture();
    addCliStatusMessage();
    addExpectRequest('/v1/orgs/org/apps/app/releases/', { status: 409 });

    const result2 = await executeCommand('release -k org:app:secret --strict --apihost="http://localhost:8818" 1.0.3');

    expect(result2.err.code).to.equal(1);
    expect(result2.stderr).to.contain('Release already exists');

    expect(matchedRequests).to.have.length(2);
    expect(unmatchedRequests).to.have.length(0);
  }));

  it('should error if the server returns a 400', mochaAsync(async () => {
    addCliStatusMessage();
    addExpectRequest('/v1/orgs/org/apps/app/releases/', { status: 400 });

    const result = await executeCommand('release -k org:app:secret --apihost="http://localhost:8818" 1.0.3');

    expect(result.err.code).to.equal(1);
    expect(result.stderr).to.contain('Could not create release');

    expect(matchedRequests).to.have.length(2);
    expect(unmatchedRequests).to.have.length(0);
  }));

  // UPLOAD

  it('should show the upload help', mochaAsync(async () => {
    const result2 = await executeCommand('help upload');
    expect(result2.stdout).to.contain('Usage: logrocket upload');

    const result3 = await executeCommand('upload --help');
    expect(result3.stdout).to.contain('Usage: logrocket upload');
  }));

  it('should show not show secret options in upload help', mochaAsync(async () => {
    const result = await executeCommand('help upload');
    expect(result.stdout).to.not.contain('gcs');
  }));

  it('should show upload help with error if no options are passed', mochaAsync(async () => {
    const result = await executeCommand('upload');

    expect(result.err.code).to.equal(1);
    expect(result.stderr).to.contain('Usage: logrocket upload');
    expect(result.stderr).to.contain('Missing');
  }));

  it('should error if no path is provided', mochaAsync(async () => {
    const result = await executeCommand('upload -k org:app:secret -r 1.0.2 --apihost="http://localhost:8818"');

    expect(result.err.code).to.equal(1);
    expect(result.stderr).to.contain('Missing upload path');
  }));

  it('should error if no release is provided', mochaAsync(async () => {
    const result = await executeCommand(`upload -k org:app:secret --apihost="http://localhost:8818" ${FIXTURE_PATH}`);

    expect(result.err.code).to.equal(1);
    expect(result.stderr).to.contain('You must specify a release');
  }));

  it('should upload the passed directory', mochaAsync(async () => {
    addCliStatusMessage();
    addExpectRequest('/v1/orgs/org/apps/app/releases/1.0.2/artifacts/', {
      status: 200,
      body: { signed_url: 'http://localhost:8818/upload/' },
    });

    addExpectRequest('/upload/', { status: 200 });

    const result = await executeCommand(`upload -k org:app:secret -r 1.0.2 --apihost="http://localhost:8818" ${FIXTURE_PATH}`);

    expect(result.err).to.be.null();
    expect(result.stdout).to.contain('Found 3 files');
    expect(matchedRequests).to.have.length(6 + 1);
    expect(unmatchedRequests).to.have.length(0);

    const [s, r1, u1, r2, u2, r3, u3] = matchedRequests;
    expect(s.method).to.equal('GET');

    expect(r1.method).to.equal('POST');
    expect(r1.headers).to.have.property('authorization', 'Token org:app:secret');
    expect(r1.body).to.equal('{"filepath":"*/subdir/one.js"}');

    expect(u1.method).to.equal('PUT');
    expect(u1.body).to.equal('\'one js contents\';\n');

    expect(r2.method).to.equal('POST');
    expect(r2.headers).to.have.property('authorization', 'Token org:app:secret');
    expect(r2.body).to.equal('{"filepath":"*/two.js.map"}');

    expect(u2.method).to.equal('PUT');
    expect(u2.body).to.equal('two map contents\n');

    expect(r3.method).to.equal('POST');
    expect(r3.headers).to.have.property('authorization', 'Token org:app:secret');
    expect(r3.body).to.equal('{"filepath":"*/two.jsx"}');

    expect(u3.method).to.equal('PUT');
    expect(u3.body).to.equal('\'two jsx contents\';\n');
  }));

  it('should upload the passed file', mochaAsync(async () => {
    addCliStatusMessage();
    addExpectRequest('/v1/orgs/org/apps/app/releases/1.0.2/artifacts/', {
      status: 200,
      body: { signed_url: 'http://localhost:8818/upload/' },
    });

    addExpectRequest('/upload/', { status: 200 });

    const result = await executeCommand(`upload -k org:app:secret -r 1.0.2 --apihost="http://localhost:8818" ${FIXTURE_PATH}subdir/one.js`);

    expect(result.err).to.be.null();
    expect(result.stdout).to.contain('Found 1 file');
    expect(matchedRequests).to.have.length(3);
    expect(unmatchedRequests).to.have.length(0);

    const [s, r1, u1] = matchedRequests;
    expect(s.method).to.equal('GET');


    expect(r1.method).to.equal('POST');
    expect(r1.headers).to.have.property('authorization', 'Token org:app:secret');
    expect(r1.body).to.equal('{"filepath":"*/one.js"}');

    expect(u1.method).to.equal('PUT');
    expect(u1.body).to.equal('\'one js contents\';\n');
  }));

  it('should upload the passed files', mochaAsync(async () => {
    addCliStatusMessage();
    addExpectRequest('/v1/orgs/org/apps/app/releases/1.0.2/artifacts/', {
      status: 200,
      body: { signed_url: 'http://localhost:8818/upload/' },
    });

    addExpectRequest('/upload/', { status: 200 });

    const result = await executeCommand(`upload -k org:app:secret -r 1.0.2 --apihost="http://localhost:8818" ${FIXTURE_PATH}subdir/one.js ${FIXTURE_PATH}two.jsx`);

    expect(result.err).to.be.null();
    expect(result.stdout).to.contain('Found 2 files');
    expect(matchedRequests).to.have.length(5);
    expect(unmatchedRequests).to.have.length(0);

    const [s, r1, u1, r2, u2] = matchedRequests;
    expect(s.method).to.equal('GET');

    expect(r1.method).to.equal('POST');
    expect(r1.headers).to.have.property('authorization', 'Token org:app:secret');
    expect(r1.body).to.equal('{"filepath":"*/one.js"}');

    expect(u1.method).to.equal('PUT');
    expect(u1.body).to.equal('\'one js contents\';\n');

    expect(r2.method).to.equal('POST');
    expect(r2.headers).to.have.property('authorization', 'Token org:app:secret');
    expect(r2.body).to.equal('{"filepath":"*/two.jsx"}');

    expect(u2.method).to.equal('PUT');
    expect(u2.body).to.equal('\'two jsx contents\';\n');
  }));

  it('should error if the server ping fails', mochaAsync(async () => {
    addCliStatusMessage({ status: 400, message: 'Some error to show' });
    addExpectRequest('/v1/orgs/org/apps/app/releases/', { status: 200 });

    const result = await executeCommand('release -k org:app:secret --apihost="http://localhost:8818" 1.0.3');

    expect(result.err.code).to.equal(1);
    expect(result.stderr).to.contain('Some error to show');
  }));
});
