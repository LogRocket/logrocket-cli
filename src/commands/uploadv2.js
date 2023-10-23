import { createReadStream } from 'fs';
import apiClient from '../apiClient.js';
import formatError from '../formatError.js';
import gatherFiles from '../gatherFiles.js';
import { uploadBuilderBuilder } from '../uploadBuilderBuilder.js';
import getEntries from '../sortMachOFiles.js';


export const command = 'uploadv2 <paths..>';
export const describe = 'Upload iOS sourcemaps for a release';
export const builder = uploadBuilderBuilder('v2');

export default async function handler(args) {
  const { paths, release, apikey, apihost, verbose } = args;

  console.info(`Preparing to upload debug file(s) for release ${release} ...`);
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

    const archEntries = await getEntries(path);

    archEntries.forEach(async ({ uuid, arch, fileFormat }) => {
      const containerDirectory = `${uuid.slice(0, 2)}/${uuid.slice(2)}`;

      const debugFilePath = `${containerDirectory}/debuginfo`;
      const debugFileData = {
        release,
        filepath: debugFilePath,
        contents: createReadStream(path),
        maxRetries: args['max-retries'],
        maxRetryDelay: args['max-retry-delay'],
        version: 2,
      };

      const metaFilePath = `${containerDirectory}/meta`;
      const meta = {
        name,
        arch,
        file_format: fileFormat,
      };
      const metaFileData = {
        release,
        filepath: metaFilePath,
        contents: JSON.stringify(meta),
        maxRetries: args['max-retries'],
        maxRetryDelay: args['max-retry-delay'],
        version: 2,
      };

      try {
        const debugFileRes = await client.uploadFile(debugFileData);
        if (!debugFileRes.ok) {
          console.error(`Failed to upload: ${name}`);
          await formatError(debugFileRes, { verbose });
        }

        const metaFileRes = await client.uploadFile(metaFileData);
        if (!metaFileRes.ok) {
          console.error(`Failed to upload metadata for ${name}`);
          await formatError(metaFileRes, { verbose });
        }
      } catch (err) {
        console.error(err.message);
        process.exit(1);
      }
    });
  };

  const fileList = await gatherFiles(paths, { globString: '**/DWARF/*' });

  console.info(`Found ${fileList.length} file${fileList.length === 1 ? '' : 's'} ...`);

  const CHUNK_SIZE = 1;
  for (let i = 0; i < fileList.length; i += CHUNK_SIZE) {
    await Promise.all(fileList.slice(i, i + CHUNK_SIZE).map(uploadFile));
  }

  console.info('Success!');
};
