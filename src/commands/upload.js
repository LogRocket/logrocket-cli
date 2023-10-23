import { createReadStream } from 'fs';
import apiClient from '../apiClient';
import formatError from '../formatError';
import gatherFiles from '../gatherFiles';
import { uploadBuilderBuilder } from '../uploadBuilderBuilder';


export const command = 'upload <paths..>';
export const describe = 'Upload JavaScript sourcemaps for a release';
export const builder = uploadBuilderBuilder('');

export const handler = async (args) => {
  const { paths, release, apikey, apihost, verbose, urlPrefix } = args;

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
