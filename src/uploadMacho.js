import { createReadStream } from 'fs';
import { apiClient } from './apiClient';
import { formatError } from './formatError.js';
import { gatherFiles } from './gatherFiles.js';
import { getMachOArchs } from './sortMachOFiles.js';
import { ERROR_NAMES } from './errorTypes.js';

const dsymDocsLink = 'https://developer.apple.com/documentation/xcode/building-your-app-to-include-debugging-information/';
const fileCountError = `No debug information files found
See ios dev docs for information on building your app to include debug info ${dsymDocsLink}
`;

const gatherFilesError = 'An error occurred while gathering debug files';

const outOfRangeError = 'An out of range error occurred while trying to read bytes from mapping file';
const fileAccessError = 'Incorrect permissions for';
const fileNotFoundError = 'No such file or directory';
const timedOutError = 'Operation timed out while parsing mapping file';
const readError = 'An error occurred while trying to read from mapping file';
const bufferRangeError = 'Attempted to access bytes outside of range while parsing mapping file';
const dataViewError = 'An error occurred while parsing bytes from mapping file';
const missingUUIDError = 'No uuid found for mapping file';
const sortingError = 'An error occurred while parsing architecture details from mapping file';

const getFileErrMessage = (err) => {
  switch (err.name) {
    case ERROR_NAMES.AccessError:
      return fileAccessError;
    case ERROR_NAMES.FileNotFoundError:
      return fileNotFoundError;
    case ERROR_NAMES.TimedOutError:
      return timedOutError;
    case ERROR_NAMES.ReadFileError:
      return readError;
    default:
      return null;
  }
};

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
      contents: createReadStream(path),
      data: { filepath: debugFilePath, release },
      maxRetries: args['max-retries'],
      maxRetryDelay: args['max-retry-delay'],
      url: 'release-artifacts',
    };

    const metaFilePath = `${containerDirectory}/meta`;
    const meta = {
      name,
      arch,
      file_format: fileFormat,
    };
    const metaFileData = {
      contents: JSON.stringify(meta),
      data: { filepath: metaFilePath, release },
      maxRetries: args['max-retries'],
      maxRetryDelay: args['max-retry-delay'],
      url: 'release-artifacts',
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

  let fileList;
  try {
    fileList = await gatherFiles(paths, { globString: '**/DWARF/*' });
  } catch (err) {
    const errDetail = getFileErrMessage(err);
    const errMessage = `${gatherFilesError}${errDetail ? `: ${errDetail}` : ''}`;

    if (verbose) {
      console.error(`${errMessage}\n${err.stack}`);
    } else {
      console.error(`${errMessage}\nFor additional details, rerun command with --verbose`);
    }
    process.exit(1);
  }

  if (fileList.length === 0) {
    console.error(fileCountError);
    process.exit(1);
  }

  console.info(`Found ${fileList.length} debug file${fileList.length === 1 ? '' : 's'} ...`);

  if (verbose) {
    console.info(fileList.map(({ path }) => `- ${path}`).join('\n'));
  } else {
    console.info('Rerun command with --verbose to see debug file paths');
  }

  const archEntriesLists = await Promise.all(fileList.map(async ({ name, path }) => {
    let fileArchEntries;
    try {
      fileArchEntries = await getMachOArchs(path);
    } catch (err) {
      let errMessage = getFileErrMessage(err);
      if (errMessage === null) {
        switch (err.name) {
          case ERROR_NAMES.OutOfRangeError:
            return outOfRangeError;
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
  console.info(`Parsed ${archEntries.length} total build architecture mappings`);


  const CHUNK_SIZE = 1;
  for (let i = 0; i < archEntries.length; i += CHUNK_SIZE) {
    await Promise.all(archEntries.slice(i, i + CHUNK_SIZE).map(uploadFile));
  }

  console.info('Success!');
};
