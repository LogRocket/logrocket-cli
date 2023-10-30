import { createServer } from 'http';
import { exec } from 'child_process';
import { parse } from 'url';
import getRawBody from 'raw-body';
import { magicNumberError, missingUUIDError } from '../uploadMacho';

const CLI_INDEX = './bin/logrocket';
const FIXTURE_PATH = './test/fixtures/';

const executeCommand = async (cmdAsStringOrArray, { env = '' } = {}) => {
  const cmd = Array.isArray(cmdAsStringOrArray) ? cmdAsStringOrArray.join(' ') : cmdAsStringOrArray;
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
    if (!expectRequests[url]) {
      expectRequests[url] = [];
    }

    expectRequests[url].push({
      body: {},
      status: 200,
      ...opts,
    });
  };

  const addUploadRequest = (url) => {
    const uploadID = (100000 + Math.floor(Math.random() * 999999)).toString(16);
    addExpectRequest(url, {
      status: 200,
      body: { signed_url: `http://localhost:8818/upload/${uploadID}` },
    });
    addExpectRequest(`/upload/${uploadID}`, { status: 200 });
  };

  const addArtifactRequest = () => addUploadRequest('/v1/orgs/org/apps/app/releases/1.0.2/artifacts/');

  const addReleaseArtifactRequest = () => addUploadRequest('/v1/orgs/org/apps/app/release-artifacts/');

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
    const simplifyRequest = req => {
      const simplifiedRequest = {
        method: req.method,
        body: req.body,
      };
      if (req.headers && req.headers.authorization) {
        simplifiedRequest.headers = { authorization: req.headers.authorization };
      }
      return simplifiedRequest;
    };
    server = createServer(async (req, res) => {
      const parts = parse(req.url);
      const expected = expectRequests[parts.pathname] || [];

      if (expected && expected.length) {
        const body = await getRawBody(req);
        const req2 = req;

        req2.body = body.toString();
        matchedRequests.push(simplifyRequest(req2));

        const request = expected.shift();

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

  it('should not convert the release version to a number', mochaAsync(async () => {
    addCliStatusMessage();
    addExpectRequest('/v1/orgs/org/apps/app/releases/', { status: 200 });

    const result = await executeCommand('release -k org:app:secret --apihost="http://localhost:8818" 81444e2');

    expect(result.err).to.be.null();
    expect(matchedRequests).to.have.length(2);
    expect(unmatchedRequests).to.have.length(0);

    const req = matchedRequests[1];
    expect(req.method).to.equal('POST');
    expect(req.headers).to.have.property('authorization', 'Token org:app:secret');
    expect(req.body).to.equal('{"version":"81444e2"}');
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
    expect(result2.stdout).to.contain('Usage: logrocket [-k <apikey>] upload [-r <release>] <paths..>');

    const result3 = await executeCommand('upload --help');
    expect(result3.stdout).to.contain('Usage: logrocket [-k <apikey>] upload [-r <release>] <paths..>');
  }));

  it('should show not show secret options in upload help', mochaAsync(async () => {
    const result = await executeCommand('help upload');
    expect(result.stdout).to.not.contain('gcs');
  }));

  it('should show upload help with error if no options are passed', mochaAsync(async () => {
    const result = await executeCommand('upload');

    expect(result.err.code).to.equal(1);
    expect(result.stderr).to.contain('Usage: logrocket [-k <apikey>] upload [-r <release>] <paths..>');
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

    addArtifactRequest();
    addArtifactRequest();
    addArtifactRequest();

    const result = await executeCommand(`upload -k org:app:secret -r 1.0.2 --apihost="http://localhost:8818" ${FIXTURE_PATH}`);

    expect(result.err).to.be.null();
    expect(result.stdout).to.contain('Found 3 files');
    expect(matchedRequests).to.have.length(6 + 1);
    expect(unmatchedRequests).to.have.length(0);

    expect(matchedRequests[0].method).to.equal('GET');

    expect(matchedRequests).to.deep.include.members([
      {
        method: 'POST',
        headers: {
          authorization: 'Token org:app:secret',
        },
        body: '{"filepath":"~/subdir/one.js"}',
      },
      {
        method: 'POST',
        headers: {
          authorization: 'Token org:app:secret',
        },
        body: '{"filepath":"~/two.js.map"}',
      },
      {
        method: 'POST',
        headers: {
          authorization: 'Token org:app:secret',
        },
        body: '{"filepath":"~/two.jsx"}',
      },
      {
        method: 'PUT',
        body: '\'one js contents\';\n',
      },
      {
        method: 'PUT',
        body: 'two map contents\n',
      },
      {
        method: 'PUT',
        body: '\'two jsx contents\';\n',
      }]
    );
  }));

  it('should support a custom url prefix', mochaAsync(async () => {
    addCliStatusMessage();

    addArtifactRequest();
    addArtifactRequest();
    addArtifactRequest();

    const result = await executeCommand(`upload -k org:app:secret -r 1.0.2 --apihost="http://localhost:8818" ${FIXTURE_PATH} --url-prefix="~/public"`);

    expect(result.err).to.be.null();
    expect(result.stdout).to.contain('Found 3 files');
    expect(matchedRequests).to.have.length(6 + 1);
    expect(unmatchedRequests).to.have.length(0);

    expect(matchedRequests[0].method).to.equal('GET');

    expect(matchedRequests).to.deep.include.members([
      {
        method: 'POST',
        headers: {
          authorization: 'Token org:app:secret',
        },
        body: '{"filepath":"~/public/subdir/one.js"}',
      },
      {
        method: 'PUT',
        body: '\'one js contents\';\n',
      },
      {
        method: 'POST',
        headers: {
          authorization: 'Token org:app:secret',
        },
        body: '{"filepath":"~/public/two.js.map"}',
      },
    ]);
  }));

  it('should upload the passed file', mochaAsync(async () => {
    addCliStatusMessage();

    addArtifactRequest();

    const result = await executeCommand(`upload -k org:app:secret -r 1.0.2 --apihost="http://localhost:8818" ${FIXTURE_PATH}subdir/one.js`);

    expect(result.err).to.be.null();
    expect(result.stdout).to.contain('Found 1 file');
    expect(matchedRequests).to.have.length(3);
    expect(unmatchedRequests).to.have.length(0);

    const [s, r1, u1] = matchedRequests;
    expect(s.method).to.equal('GET');


    expect(r1.method).to.equal('POST');
    expect(r1.headers).to.have.property('authorization', 'Token org:app:secret');
    expect(r1.body).to.equal('{"filepath":"~/one.js"}');

    expect(u1.method).to.equal('PUT');
    expect(u1.body).to.equal('\'one js contents\';\n');
  }));

  it('should upload the passed files', mochaAsync(async () => {
    addCliStatusMessage();

    addArtifactRequest();
    addArtifactRequest();

    const result = await executeCommand(`upload -k org:app:secret -r 1.0.2 --apihost="http://localhost:8818" ${FIXTURE_PATH}subdir/one.js ${FIXTURE_PATH}two.jsx`);

    expect(result.err).to.be.null();
    expect(result.stdout).to.contain('Found 2 files');
    expect(matchedRequests).to.have.length(5);
    expect(unmatchedRequests).to.have.length(0);

    expect(matchedRequests[0].method).to.equal('GET');

    expect(matchedRequests).to.deep.include.members([
      {
        method: 'POST',
        headers: {
          authorization: 'Token org:app:secret',
        },
        body: '{"filepath":"~/one.js"}',
      },
      {
        method: 'PUT',
        body: '\'one js contents\';\n',
      },
      {
        method: 'POST',
        headers: {
          authorization: 'Token org:app:secret',
        },
        body: '{"filepath":"~/two.jsx"}',
      },
      {
        method: 'PUT',
        body: '\'two jsx contents\';\n',
      },
    ]);
  }));

  it('should error if the server ping fails', mochaAsync(async () => {
    addCliStatusMessage({ status: 400, message: 'Some error to show' });
    addExpectRequest('/v1/orgs/org/apps/app/releases/', { status: 200 });

    const result = await executeCommand('release -k org:app:secret --apihost="http://localhost:8818" 1.0.3');

    expect(result.err.code).to.equal(1);
    expect(result.stderr).to.contain('Some error to show');
  }));

  it('should retry failed uploads', mochaAsync(async () => {
    addCliStatusMessage();

    addExpectRequest('/v1/orgs/org/apps/app/releases/1.0.2/artifacts/', {
      status: 200,
      body: { signed_url: 'http://localhost:8818/upload/' },
    });
    addExpectRequest('/upload/', { status: 429 });
    addExpectRequest('/upload/', { status: 500 });
    addExpectRequest('/upload/', { status: 502 });
    addExpectRequest('/upload/', { status: 503 });
    addExpectRequest('/upload/', { status: 504 });
    addExpectRequest('/upload/', { status: 200 });

    const result = await executeCommand([
      'upload',
      '-k org:app:secret',
      '-r 1.0.2',
      '--apihost="http://localhost:8818"',
      '--max-retries 5',
      '--max-retry-delay 100',
      `${FIXTURE_PATH}subdir/one.js`,
    ]);

    expect(result.err).to.be.null();
    expect(result.stdout).to.contain('Found 1 file');
    expect(matchedRequests).to.have.length(8);
    expect(unmatchedRequests).to.have.length(0);
  }));

  it('should stop retrying after the configured maximum', mochaAsync(async () => {
    addCliStatusMessage();

    addExpectRequest('/v1/orgs/org/apps/app/releases/1.0.2/artifacts/', {
      status: 200,
      body: { signed_url: 'http://localhost:8818/upload/' },
    });
    addExpectRequest('/upload/', { status: 429 });
    addExpectRequest('/upload/', { status: 500 });

    const result = await executeCommand([
      'upload',
      '-k org:app:secret',
      '-r 1.0.2',
      '--apihost="http://localhost:8818"',
      '--max-retries 1',
      '--max-retry-delay 100',
      `${FIXTURE_PATH}subdir/one.js`,
    ]);

    expect(result.err.message).to.contain('Failed to upload: one.js');
    expect(result.stdout).to.contain('Found 1 file');
    expect(matchedRequests).to.have.length(4);
    expect(unmatchedRequests).to.have.length(0);
  }));

  // UPLOAD-MOBILE
  describe('upload-mobile', () => {
    it('should show the upload-mobile help', mochaAsync(async () => {
      const result = await executeCommand('upload-mobile --help');
      expect(result.stdout).to.contain('Usage: logrocket [-k <apikey>] upload-mobile [-r <release>] [-p <platform>] <paths..>');
    }));

    it('should error if no platform is provided', mochaAsync(async () => {
      const result = await executeCommand(`upload-mobile -k org:app:secret -r 1.0.2 --apihost="http://localhost:8818" ${FIXTURE_PATH}`);

      expect(result.err.code).to.equal(1);
      expect(result.stderr).to.contain('You must specify a platform');
    }));

    it('should upload a multi arch file in the passed directory', mochaAsync(async () => {
      addCliStatusMessage();
      addReleaseArtifactRequest();
      addReleaseArtifactRequest();
      addReleaseArtifactRequest();
      addReleaseArtifactRequest();
      addReleaseArtifactRequest();
      addReleaseArtifactRequest();

      const result = await executeCommand(`upload-mobile -k org:app:secret -r 1.0.2 --apihost="http://localhost:8818" -p ios ${FIXTURE_PATH}/ios`);

      expect(result.err).to.be.null();
      expect(result.stdout).to.contain('Found 1 debug file');
      expect(matchedRequests).to.have.length(13);
      expect(unmatchedRequests).to.have.length(0);

      expect(matchedRequests[0].method).to.equal('GET');

      expect(matchedRequests).to.deep.include.members([
        {
          method: 'POST',
          headers: {
            authorization: 'Token org:app:secret',
          },
          body: '{"filepath":"e5/5d006ebf5235d98e0d3431f04e4e37/debuginfo","release":"1.0.2"}',
        },
        {
          method: 'POST',
          headers: {
            authorization: 'Token org:app:secret',
          },
          body: '{"filepath":"e5/5d006ebf5235d98e0d3431f04e4e37/meta","release":"1.0.2"}',
        },
        {
          method: 'POST',
          headers: {
            authorization: 'Token org:app:secret',
          },
          body: '{"filepath":"84/7eafb3cbb135cc939925accd7d9096/debuginfo","release":"1.0.2"}',
        },
        {
          method: 'POST',
          headers: {
            authorization: 'Token org:app:secret',
          },
          body: '{"filepath":"84/7eafb3cbb135cc939925accd7d9096/meta","release":"1.0.2"}',
        },
        {
          method: 'POST',
          headers: {
            authorization: 'Token org:app:secret',
          },
          body: '{"filepath":"3a/8578499a1e3e9d8951ee22bd274c57/debuginfo","release":"1.0.2"}',
        },
        {
          method: 'POST',
          headers: {
            authorization: 'Token org:app:secret',
          },
          body: '{"filepath":"3a/8578499a1e3e9d8951ee22bd274c57/meta","release":"1.0.2"}',
        },
        {
          method: 'PUT',
          body: '{"name":"DWARF/MachO-iOS-armv7-armv7s-arm64-Helloworld","arch":"armv7","file_format":"macho"}',
        },
        {
          method: 'PUT',
          body: '{"name":"DWARF/MachO-iOS-armv7-armv7s-arm64-Helloworld","arch":"armv7s","file_format":"macho"}',
        },
        {
          method: 'PUT',
          body: '{"name":"DWARF/MachO-iOS-armv7-armv7s-arm64-Helloworld","arch":"arm64","file_format":"macho"}',
        },
      ]
      );
    }));

    it('should upload a single arch file in the passed directory', mochaAsync(async () => {
      addCliStatusMessage();
      addReleaseArtifactRequest();
      addReleaseArtifactRequest();

      const result = await executeCommand(`upload-mobile -k org:app:secret -r 1.0.2 --apihost="http://localhost:8818" -p ios ${FIXTURE_PATH}/osx`);

      expect(result.err).to.be.null();
      expect(result.stdout).to.contain('Found 1 debug file');
      expect(matchedRequests).to.have.length(5);
      expect(unmatchedRequests).to.have.length(0);

      expect(matchedRequests[0].method).to.equal('GET');

      expect(matchedRequests).to.deep.include.members([
        {
          method: 'POST',
          headers: {
            authorization: 'Token org:app:secret',
          },
          body: '{"filepath":"d7/4ddc6e99173d9eb4d7b6369442a683/debuginfo","release":"1.0.2"}',
        },
        {
          method: 'POST',
          headers: {
            authorization: 'Token org:app:secret',
          },
          body: '{"filepath":"d7/4ddc6e99173d9eb4d7b6369442a683/meta","release":"1.0.2"}',
        },
        {
          method: 'PUT',
          body: '{"name":"DWARF/MachO-OSX-x86-ls","arch":"i386","file_format":"macho"}',
        },
      ]
      );
    }));

    it('should error on non-macho file in the passed directory', mochaAsync(async () => {
      addCliStatusMessage();
      const result = await executeCommand(`upload-mobile -k org:app:secret -r 1.0.2 --apihost="http://localhost:8818" -p ios ${FIXTURE_PATH}elf`);
      expect(result.stderr).to.contain(magicNumberError);
    }));

    it('should error on macho file without a debug id', mochaAsync(async () => {
      addCliStatusMessage();
      const result = await executeCommand(`upload-mobile -k org:app:secret -r 1.0.2 --apihost="http://localhost:8818" -p ios ${FIXTURE_PATH}no-code-id`);
      expect(result.stderr).to.contain(missingUUIDError);
    }));

    it('should upload one passed proguard file', mochaAsync(async () => {
      addCliStatusMessage();

      addReleaseArtifactRequest();

      const result = await executeCommand(`upload-mobile -k org:app:secret -r 1.0.2 --apihost="http://localhost:8818" -p android ${FIXTURE_PATH}mapping.txt`);

      expect(result.err).to.be.null();
      expect(matchedRequests).to.have.length(3);
      expect(unmatchedRequests).to.have.length(0);

      const [s, r1, u1] = matchedRequests;
      expect(s.method).to.equal('GET');


      expect(r1.method).to.equal('POST');
      expect(r1.headers).to.have.property('authorization', 'Token org:app:secret');
      expect(r1.body).to.equal('{"filepath":"mapping.txt","release":"1.0.2"}');

      expect(u1.method).to.equal('PUT');
      expect(u1.body).to.equal('proguard mapping\n');
    }));
  });
});
