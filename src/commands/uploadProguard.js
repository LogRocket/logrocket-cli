import { createReadStream, statSync } from 'fs';
import apiClient from '../apiClient.js';
import formatError from '../formatError.js';
import { uploadBuilderBuilder } from '../uploadBuilderBuilder.js';
import { basename, join } from 'path';
import { cwd } from 'process';
import glob from 'glob';

export const command = 'upload-proguard <path>';
export const describe = 'Upload ProGuard for an android release';
export const builder = uploadBuilderBuilder('-proguard');

export default async function handler(args) {
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

  let proguardPath;
  if (basename(path) === 'mapping.txt') {
    proguardPath = path;
  } else {
    const workingDirectory = join(cwd(), path);
    const proguardFiles = glob('**/mapping.txt', { cwd: workingDirectory, sync: true })
      .map(base => join(workingDirectory, base))
      .filter(mappingPath => statSync(mappingPath).isFile());
    if (proguardFiles.length > 1) {
      console.error(`Found ${proguardFiles}, should only have 1 per app release`);
      process.exit(1);
    } else if (proguardFiles.length === 0) {
      console.error('No proguard file found. Containing directory should look like app/build/outputs/mapping/{BuildVariant}');
      process.exit(1);
    } else {
      proguardPath = proguardFiles[0];
    }
  }

  const data = {
    release,
    filepath: 'mapping.txt',
    contents: createReadStream(proguardPath),
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
