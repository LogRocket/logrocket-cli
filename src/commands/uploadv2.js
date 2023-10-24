import { createReadStream } from 'fs';
import { apiClient } from '../apiClient.js';
import { formatError } from '../formatError.js';
import { gatherFiles } from '../gatherFiles';
import { uploadBuilderBuilder } from '../uploadBuilderBuilder.js';
import { getMachOArchs } from '../sortMachOFiles';


export const command = 'uploadv2 <paths..>';
export const describe = 'Upload iOS sourcemaps for a release';
export const builder = uploadBuilderBuilder('v2');

export const handler = async (args) => {
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

  const uploadFile = async ({ arch, fileFormat, name, path, uuid }) => {
    console.info(`Uploading: ${name} ${arch}`);

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
        console.error(`Failed to upload: ${name} ${arch}`);
        await formatError(debugFileRes, { verbose });
      }

      const metaFileRes = await client.uploadFile(metaFileData);
      if (!metaFileRes.ok) {
        console.error(`Failed to upload metadata for ${name} ${arch}`);
        await formatError(metaFileRes, { verbose });
      }
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  };

  const fileList = await gatherFiles(paths, { globString: '**/DWARF/*' });
  console.info(`Found ${fileList.length} file${fileList.length === 1 ? '' : 's'} ...`);
  const archEntriesLists = await Promise.all(fileList.map(async ({ name, path }) => {
    return new Promise(async resolve => {
      const fileArchEntries = await getMachOArchs(path);
      resolve(fileArchEntries.map(entry => ({ ...entry, name, path })));
    })
  }));
  const archEntries = archEntriesLists.flat();
  console.info(`Found ${archEntries.length} total build architecture mappings`);


  const CHUNK_SIZE = 1;
  for (let i = 0; i < archEntries.length; i += CHUNK_SIZE) {
    await Promise.all(archEntries.slice(i, i + CHUNK_SIZE).map(uploadFile));
  }

  console.info('Success!');
};
