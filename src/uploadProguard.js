import { createReadStream, statSync } from 'fs';
import { apiClient } from './apiClient.js';
import { formatError } from './formatError.js';
import { extname } from 'path';

const sampleAndroidUploadPath = '/app/build/outputs/mapping/debug/mapping.txt';
const pathCountError = `Include one path directly to debug file, like \`${sampleAndroidUploadPath}\`
See android dev docs for information on how to shrink and obfuscate your code https://developer.android.com/build/shrink-code#enable`;

export const uploadProguard = async (args) => {
  const { paths, release, apikey, apihost, verbose } = args;
  if (paths.length > 1) {
    console.error(`More than 1 proguard file found, ${pathCountError}`);
    process.exit(1);
  }
  const path = paths[0];

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
    console.error(`${path} is not a file, ${pathCountError}`);
    process.exit(1);
  }

  if (extname(path) !== '.txt') {
    console.error('ProGuard mapping file must be .txt');
    process.exit(1);
  }

  const data = {
    contents: createReadStream(path),
    data: { filepath: 'mapping.txt', release },
    maxRetries: args['max-retries'],
    maxRetryDelay: args['max-retry-delay'],
    url: 'release-artifacts',
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
