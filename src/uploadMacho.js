import { createReadStream } from 'fs';
import { apiClient } from './apiClient';
import { formatError } from './formatError.js';
import { gatherFiles } from './gatherFiles.js';
import { getMachOArchs } from './sortMachOFiles.js';
import { ERROR_NAMES } from './errorTypes.js';

const outOfRangeError = 'An out of range error occurred while trying to read bytes from mapping file';
const fileAccessError = 'Incorrect permissions for file';
const fileNotFoundError = 'No such file or directory';
const timedOutError = 'Operation timed out while parsing mapping file';
const readError = 'An error occurred while trying to read from mapping file';
const bufferRangeError = 'Attempted to access bytes outside of range while parsing mapping file';
const dataViewError = 'An error occurred while parsing bytes from mapping file';
const missingUUIDError = 'No uuid found for mapping file';
const sortingError = 'An error occurred while parsing architecture details from mapping file';

export const uploadMachO = async (args) => {
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
    let fileArchEntries;
    try {
      fileArchEntries = await getMachOArchs(path);
    } catch (err) {
      let errMessage;
      switch (err.name) {
        case ERROR_NAMES.OutOfRangeError:
          errMessage = outOfRangeError;
          break;
        case ERROR_NAMES.AccessError:
          errMessage = fileAccessError;
          break;
        case ERROR_NAMES.FileNotFoundError:
          errMessage = fileNotFoundError;
          break;
        case ERROR_NAMES.TimedOutError:
          errMessage = timedOutError;
          break;
        case ERROR_NAMES.ReadFileError:
          errMessage = readError;
          break;
        case ERROR_NAMES.BufferRangeError:
          errMessage = bufferRangeError;
          break;
        case ERROR_NAMES.DataViewError:
          errMessage = dataViewError;
          break;
        case ERROR_NAMES.MissingUUIDError:
          errMessage = missingUUIDError;
          break;
        default:
          errMessage = sortingError;
      }
      errMessage += ` ${path}`;

      if (verbose) {
        errMessage += `\n${err.stack}`;
      } else {
        errMessage += '\nFor additional details, rerun command with --verbose';
      }
      console.error(errMessage);
      process.exit(1);
    }
    return fileArchEntries.map(entry => ({ ...entry, name, path }));
  }));
  const archEntries = archEntriesLists.flat();
  console.info(`Found ${archEntries.length} total build architecture mappings`);


  const CHUNK_SIZE = 1;
  for (let i = 0; i < archEntries.length; i += CHUNK_SIZE) {
    await Promise.all(archEntries.slice(i, i + CHUNK_SIZE).map(uploadFile));
  }

  console.info('Success!');
};