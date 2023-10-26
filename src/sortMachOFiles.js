import { open, read } from 'fs';
import {
  AccessError,
  BufferRangeError,
  DataViewError,
  ERROR_CODES,
  FileNotFoundError,
  MissingUUIDError,
  OutOfRangeError,
  ReadFileError,
  TimedOutError,
} from './errorTypes.js';

const MH_MAGIC_64 = 0xfeedfacf;
const MH_CIGAM_64 = 0xcffaedfe;
const MH_CIGAM = 0xcefaedfe;
const FAT_MAGIC = 0xcafebabe;
const FAT_CIGAM = 0xbebafeca;

const CPU_TYPE_I386 = 0x00000007;
const CPU_TYPE_X86_64 = 0x01000007;
const CPU_TYPE_ARM = 0x0000000c;
const CPU_TYPE_ARM64 = 0x0100000c;

const ARCH_NAMES = {
  [CPU_TYPE_ARM]: 'arm',
  [CPU_TYPE_ARM64]: 'arm64',
  [CPU_TYPE_I386]: 'i386',
  [CPU_TYPE_X86_64]: 'x86_64',
};

const LC_UUID = 0x1b;
const UUID_BYTES = 16;

const MAGIC_NUMBER_BYTES = 4;
const MACH_HEADER_BYTES = 28;
const MACH_64_HEADER_BYTES = 32;

const FAT_ARCH_BYTES = 20;
const FAT_HEADER_BYTES = 8;

const LOAD_COMMAND_BYTES = 8;

function handleFileError(errMessage, err) {
  if (err instanceof RangeError) {
    throw new OutOfRangeError(errMessage, err);
  }
  switch (err.code) {
    case ERROR_CODES.EACCES:
      throw new AccessError(errMessage, err);
    case ERROR_CODES.ENOENT:
      throw new FileNotFoundError(errMessage, err);
    case ERROR_CODES.ETIMEDOUT:
      throw new TimedOutError(errMessage, err);
    default:
      throw new ReadFileError(errMessage, err);
  }
}

function readBytes(fd, position, length, errMessage, asDataView = true) {
  return new Promise(resolve => {
    const output = Buffer.alloc(length);
    read(fd, { buffer: output, length, position }, (err) => {
      if (err) {
        handleFileError(errMessage, err);
      }
      if (asDataView) {
        const dataView = new DataView(output.buffer);
        resolve(dataView);          
      } else {
        resolve(output);
      }
    });
  });
}

function getUint32(buffer, offset, errMessage, littleEndian = false) {
  try {
    return buffer.getUint32(offset, littleEndian);
  } catch (err) {
    if (err instanceof RangeError) {
      throw new BufferRangeError(errMessage, err);
    }
    throw new DataViewError(errMessage, err);
  }
}

function getErrorSuffixForArch(archNum, archName = null) {
  if (archNum !== null) {
    return `for arch ${archNum}${archName ? ` (${archName})` : ''} in multi-arch mapping`;
  }
  return `for ${archName ? `${archName} ` : ''}arch in single-arch mapping`;
}

function parseMagicNumber(view, archNum = null, archName = null) {
  const suffix = archName === null ? 'for file' : getErrorSuffixForArch(archNum, archName);
  return getUint32(view, 0, `Error parsing magic number ${suffix}`);
}

function getIsMach64Header(magic) {
  return magic === MH_MAGIC_64 || magic === MH_CIGAM_64;
}

function shouldSwapBytes(magic) {
  return magic === MH_CIGAM || magic === MH_CIGAM_64;
}

function getIsMultiArch(magic) {
  return magic === FAT_CIGAM || magic === FAT_MAGIC;
}

function getNumArchs(view) {
  return getUint32(
    view, 4, 'Error parsing arch count for multi-arch mapping'
  );
}

function getArchDetails(view, archNum) {
  const archSuffix = getErrorSuffixForArch(archNum);

  const cpuType = getUint32(view, 0, `Error parsing cpuType ${archSuffix}`);
  const archOffset = getUint32(view, 8, `Error parsing offset ${archSuffix}`);

  return { cpuType, archOffset };
}

function getHeaderVals(view, shouldSwap, archSuffix) {
  const cpuType = getUint32(view, 4, `Error parsing cpuType ${archSuffix}`, shouldSwap);

  const ncmds = getUint32(
    view, 16, `Error parsing number of load commands ${archSuffix}`, shouldSwap
  );

  return { cpuType, ncmds };
}

function getLoadCommandDetails(view, shouldSwap, cmdSuffix) {
  const cmd = getUint32(view, 0, `Error parsing ${cmdSuffix}`, shouldSwap);
  const cmdSize = getUint32(view, 4, `Error parsing size of ${cmdSuffix}`, shouldSwap);

  return { cmd, cmdSize };
}

async function getArchEntry(fd, magic, archOffset = 0, archNum = null, archName = null) {
  const isMach64Header = getIsMach64Header(magic);
  const headerSize = isMach64Header ? MACH_64_HEADER_BYTES : MACH_HEADER_BYTES;
  const shouldSwap = shouldSwapBytes(magic);

  let archSuffix = getErrorSuffixForArch(archNum, archName);
  const header = await readBytes(
    fd, archOffset, headerSize, `Error reading header${archSuffix}`
  );

  const { cpuType, ncmds } = getHeaderVals(header, shouldSwap, archSuffix);
  const arch = archName || ARCH_NAMES[cpuType];
  archSuffix = getErrorSuffixForArch(archNum, archName);

  let offset = archOffset + headerSize;
  for (let cmdNum = 0; cmdNum < ncmds; cmdNum++) {
    const cmdSuffix = `load command ${cmdNum} ${archSuffix}`;

    const loadCommand = await readBytes(
      fd, offset, LOAD_COMMAND_BYTES, `Error reading ${cmdSuffix}`
    );
    const { cmd, cmdSize } = getLoadCommandDetails(loadCommand, shouldSwap, cmdSuffix);

    if (cmd === LC_UUID) {
      const uuidBuffer = await readBytes(
        fd, offset + LOAD_COMMAND_BYTES, UUID_BYTES, `Error reading uuid of ${cmdSuffix}`, false
      );
      return {
        uuid: uuidBuffer.toString('hex'),
        arch,
        fileFormat: 'macho',
      };
    }

    offset += cmdSize;
  }
  throw new MissingUUIDError(`No mapping uuid found ${archSuffix} at offset ${archOffset}`);
}

export async function getMachOArchs(filepath) {
  return new Promise((resolve, reject) => {
    open(filepath, async (err, fd) => {
      try {
        if (err) {
          handleFileError(`Error opening file ${filepath}`, err);
        }

        let magicDataView = await readBytes(fd, 0, MAGIC_NUMBER_BYTES, 'Error getting magic number');
        let magic = parseMagicNumber(magicDataView);

        if (getIsMultiArch(magic)) {
          const archEntries = [];

          const header = await readBytes(
            fd, 0, FAT_HEADER_BYTES, 'Error reading multi-arch header'
          );

          const numArchs = getNumArchs(header);
          let offset = FAT_HEADER_BYTES;
          for (let archNum = 0; archNum < numArchs; archNum++) {
            const fatArchHeader = await readBytes(
              fd, offset, FAT_ARCH_BYTES, `Error reading details for arch ${archNum} in multi-arch mapping`
            );

            const { cpuType, archOffset } = getArchDetails(fatArchHeader, archNum);
            const archName = ARCH_NAMES[cpuType];

            offset += FAT_ARCH_BYTES;

            magicDataView = await readBytes(fd, archOffset, MAGIC_NUMBER_BYTES);
            magic = parseMagicNumber(magicDataView, archNum, archName);

            const archEntry = await getArchEntry(fd, magic, archOffset, archNum, archName);
            archEntries.push(archEntry);
          }
          resolve(archEntries);
        } else {
          const archEntry = await getArchEntry(fd, magic);
          resolve([archEntry]);
        }
      } catch (err) {
        reject(err);
      }
    });
  });
}
