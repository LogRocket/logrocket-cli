import { createReadStream, statSync } from 'fs';
import { apiClient } from './apiClient.js';
import { formatError } from './formatError.js';

export const uploadProguard = async (args) => {
  const { path, release, apikey, apihost, verbose } = args;

  console.info(`Preparing to upload ProGuard mapping for release ${release} ...`);

  const client = apiClient({ apikey, apihost });
  await client.checkStatus();

  if (args['gcs-token']) {
    client.setGCSData({
      gcsToken: args['gcs-token'],
      gcsBucket: args['gcs-bucket'],
    });
  }

  const fileStats = statSync(path, { throwIfNoEntry: false });
  if (!fileStats) {
    console.error(`${path} does not exist`);
    process.exit(1);
  }

  if (!fileStats.isFile()) {
    console.error(`${path} is not a file`);
    process.exit(1);
  }

  if (path.substring(path.lastIndexOf('.') + 1) !== '.txt') {
    console.error('ProGuard mapping file must be .txt');
    process.exit(1);
  }

  const data = {
    release,
    filepath: 'mapping.txt',
    contents: createReadStream(path),
    maxRetries: args['max-retries'],
    maxRetryDelay: args['max-retry-delay'],
    version: 2,
  };

  try {
    const res = await client.uploadFile(data);
    if (!res.ok) {
      console.error('Failed to upload mapping.txt');
      await formatError(res, { verbose });
    } else {
      console.info('Success!');
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
};
