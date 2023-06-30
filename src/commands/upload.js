import { join, basename } from 'path';
import { cwd } from 'process';
import { createReadStream, statSync } from 'fs';
import apiClient from '../apiClient';
import formatError from '../formatError';
import glob from 'glob';

export const command = 'upload <paths..>';
export const describe = 'Upload JavaScript sourcemaps for a release';
export const builder = (args) => {
  args
    .usage('\nUsage: logrocket upload -r <release> <paths..>')
    .option('r', {
      alias: 'release',
      type: 'string',
      describe: 'The release version for these files',
      demand: 'You must specify a release, use -r or --release',
    })
    .option('p', {
      alias: 'urlPrefix',
      type: 'string',
      default: '~/',
      describe: 'Sets a URL prefix in front of all files. Defaults to "~/"',
    })
    .demand(1, 'Missing upload path: e.g. logrocket upload -r 1.2.3 dist/')
    .option('gcs-token', { // for testing, pass the webhook token to get an immediate pending=no
      type: 'string',
      describe: false,
    })
    .option('gcs-bucket', { // for testing, pass the webhook bucket to get an immediate pending=no
      type: 'string',
      describe: false,
    })
    .implies({
      'gcs-token': 'gcs-bucket',
      'gcs-bucket': 'gcs-token',
    })
    .option('max-retries', {
      type: 'number',
      describe: 'Failed upload retry limit (0 disables)',
      default: 0,
    })
    .option('max-retry-delay', {
      type: 'number',
      describe: 'Maximum delay between retries in ms',
      default: 30000,
    })
    .help('help');
};

async function gatherFiles(paths) {
  const map = [];

  await Promise.all(paths.map((path) => {
    const realPath = join(cwd(), path);

    if (statSync(realPath).isFile()) {
      map.push({
        path: realPath,
        name: basename(realPath),
      });

      return Promise.resolve();
    }

    return new Promise(resolve => {
      glob('**/*.{js,jsx,js.map}', { cwd: realPath }, async (err, files) => {
        for (const file of files) {
          map.push({
            path: join(realPath, file),
            name: file,
          });
        }

        resolve();
      });
    });
  }));

  return map;
}

export const handler = async (args) => {
  const { release, apikey, apihost, verbose, urlPrefix = '' } = args;
  let { paths } = args;
  if (!release) throw new Error('Missing release version');
  if (!paths) throw new Error('Missing paths');
  if (!apikey) throw new Error('Missing api key');
  if (typeof paths === 'string') {
    paths = [paths];
  }

  console.info(`Preparing to upload sourcemaps for release ${release} ...`);
  console.info('Gathering file list...');

  const client = apiClient({ apikey, apihost });
  await client.checkStatus();

  if (args['gcs-token']) {
    client.setGCSData({
      gcsToken: args['gcs-token'],
      gcsBucket: args['gcs-bucket'],
    });
  }

  const uploadFile = async ({ path, name }) => {
    console.info(`Uploading: ${name}`);

    const filepath = `${urlPrefix.replace(/\/$/, '')}/${name}`;

    const data = {
      release,
      filepath,
      contents: createReadStream(path),
      maxRetries: args['max-retries'],
      maxRetryDelay: args['max-retry-delay'],
    };

    try {
      const res = await client.uploadFile(data);

      if (!res.ok) {
        console.error(`Failed to upload: ${name}`);
        await formatError(res, { verbose });
      }
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  };

  const fileList = await gatherFiles(paths);

  console.info(`Found ${fileList.length} file${fileList.length === 1 ? '' : 's'} ...`);

  const CHUNK_SIZE = 10;
  for (let i = 0; i < fileList.length; i += CHUNK_SIZE) {
    await Promise.all(fileList.slice(i, i + CHUNK_SIZE).map(uploadFile));
  }

  console.info('Success!');
};
