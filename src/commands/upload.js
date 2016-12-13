import { join, dirname, basename } from 'path';
import { cwd } from 'process';
import { createReadStream, statSync } from 'fs';
import apiClient from '../apiClient';
import formatError from '../formatError';
import glob from 'glob';

export const command = 'upload <path>';
export const describe = 'Upload JavaScript sourcemaps for a release';
export const builder = (args) => {
  args
    .usage('\nUsage: logrocket upload -r <release> <path>')
    .option('r', {
      alias: 'release',
      type: 'string',
      describe: 'The release version for these files',
      demand: 'You must specify a release, use -r or --release',
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
    .help('help');
};

export const handler = async (args) => {
  const { path, release, apikey, apihost } = args;

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

  let root;
  const isFile = statSync(path).isFile();

  if (isFile) {
    root = join(cwd(), dirname(path));
  } else {
    root = join(cwd(), path);
  }

  const uploadFile = async (file) => {
    console.info(`Uploading: ${file}`);

    const data = {
      release,
      filepath: `*/${file}`,
      contents: createReadStream(join(root, file)),
    };
    try {
      const res = await client.uploadFile(data);

      if (!res.ok) {
        console.error(`Failed to upload: ${file}`);
        await formatError(res);
      }
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  };

  if (isFile) {
    uploadFile(basename(path)).then(() => {
      console.info('Done.');
    });
  } else {
    glob('**/*.{js,jsx,js.map}', { cwd: root }, async (err, files) => {
      console.info(`Found ${files.length} files ...`);

      for (const file of files) {
        await uploadFile(file);
      }

      console.info('Success!');
    });
  }
};
