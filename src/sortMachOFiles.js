import { open, read } from 'fs';
import {
  handleFileError,
  BufferRangeError,
  DataViewError,
  LoadCommandError,
  MissingUUIDError,
  MagicNumberError,
} from './errorTypes.js';

const MAGIC_NUMBERS = {
  MH_MAGIC_64: 0xfeedfacf,
  MH_CIGAM_64: 0xcffaedfe,
  MH_MAGIC: 0xfeedface,
  MH_CIGAM: 0xcefaedfe,
  FAT_MAGIC: 0xcafebabe,
  FAT_CIGAM: 0xbebafeca,
};

const MAGIC_NUMBER_VALS = Object.values(MAGIC_NUMBERS);

const CPU_TYPES = {
  I386: 0x00000007,
  X86_64: 0x01000007,
  ARM: 0x0000000c,
  ARM64: 0x0100000c,
};
const ARCH_BASE_NAMES = {
  [CPU_TYPES.I386]: 'i386',
  [CPU_TYPES.X86_64]: 'x86_64',
  [CPU_TYPES.ARM]: 'arm',
  [CPU_TYPES.ARM64]: 'arm64',
};

const CPU_SUB_TYPES = {
  ALL_LE: 0x00000003,
  ALL_BE: 0x00000000,
  H: 0x00000008,
  V5: 0x00000007,
  V6: 0x00000006,
  V6M: 0x0000000e,
  V7: 0x00000009,
  V7F: 0x0000000a,
  V7S: 0x0000000b,
  V7K: 0x0000000c,
  V7M: 0x0000000f,
  V7EM: 0x00000010,
  V8: 0x0000000d,
  E: 0x00000002,
};
const ARCH_SUB_NAMES = {
  [CPU_SUB_TYPES.ALL_LE]: '',
  [CPU_SUB_TYPES.ALL_BE]: '',
  [CPU_SUB_TYPES.H]: 'h',
  [CPU_SUB_TYPES.V5]: 'v5',
  [CPU_SUB_TYPES.V6]: 'v6',
  [CPU_SUB_TYPES.V6M]: 'v6m',
  [CPU_SUB_TYPES.V7]: 'v7',
  [CPU_SUB_TYPES.V7F]: 'v7f',
  [CPU_SUB_TYPES.V7S]: 'v7s',
  [CPU_SUB_TYPES.V7K]: 'v7k',
  [CPU_SUB_TYPES.V7M]: 'v7m',
  [CPU_SUB_TYPES.V7EM]: 'v7em',
  [CPU_SUB_TYPES.V8]: 'v8',
  [CPU_SUB_TYPES.E]: 'e',
};

const UNKNOWN_ARCH_TYPE = 'unknown';

const LC_UUID = 0x1b;
const UUID_BYTES = 16;

const MAGIC_NUMBER_BYTES = 4;
const MACH_HEADER_BYTES = 28;
const MACH_64_HEADER_BYTES = 32;

const FAT_ARCH_BYTES = 20;
const FAT_HEADER_BYTES = 8;

const LOAD_COMMAND_BYTES = 8;

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
  const magic = getUint32(view, 0, `Error parsing magic number ${suffix}`);
  if (!MAGIC_NUMBER_VALS.includes(magic)) {
    throw new MagicNumberError(`Invalid magic number: ${magic} ${suffix}`);
  }
  return magic;
}

function getIsMach64Header(magic) {
  return magic === MAGIC_NUMBERS.MH_MAGIC_64 || magic === MAGIC_NUMBERS.MH_CIGAM_64;
}

function shouldSwapBytes(magic) {
  return magic === MAGIC_NUMBERS.MH_CIGAM || magic === MAGIC_NUMBERS.MH_CIGAM_64;
}

function getIsMultiArch(magic) {
  return magic === MAGIC_NUMBERS.FAT_CIGAM || magic === MAGIC_NUMBERS.FAT_MAGIC;
}

function getNumArchs(view) {
  return getUint32(
    view, 4, 'Error parsing arch count for multi-arch mapping'
  );
}

function getArchDetails(view, archNum) {
  const archSuffix = getErrorSuffixForArch(archNum);

  const cpuType = getUint32(view, 0, `Error parsing cpuType ${archSuffix}`);
  const cpuSubType = getUint32(view, 4, `Error parsing cpuSubType ${archSuffix}`);
  const archOffset = getUint32(view, 8, `Error parsing offset ${archSuffix}`);

  return { cpuType, cpuSubType, archOffset };
}

function getHeaderVals(view, shouldSwap, archSuffix) {
  const cpuType = getUint32(view, 4, `Error parsing cpuType ${archSuffix}`, shouldSwap);
  const cpuSubType = getUint32(
    view, 8, `Error parsing cpuSubType ${archSuffix}`, shouldSwap
  );

  const ncmds = getUint32(
    view, 16, `Error parsing number of load commands ${archSuffix}`, shouldSwap
  );

  return { cpuType, cpuSubType, ncmds };
}

function getArchName(cpuType, cpuSubType) {
  const base = ARCH_BASE_NAMES[cpuType];
  if (base) {
    const subArch = ARCH_SUB_NAMES[cpuSubType] || '';
    return `${base}${subArch}`;
  }
  return UNKNOWN_ARCH_TYPE;
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

  const { cpuType, cpuSubType, ncmds } = getHeaderVals(header, shouldSwap, archSuffix);
  const arch = archName || getArchName(cpuType, cpuSubType);

  archSuffix = getErrorSuffixForArch(archNum, arch);

  let offset = archOffset + headerSize;
  for (let cmdNum = 0; cmdNum < ncmds; cmdNum++) {
    const cmdSuffix = `load command ${cmdNum} ${archSuffix}`;

    const loadCommand = await readBytes(
      fd, offset, LOAD_COMMAND_BYTES, `Error reading ${cmdSuffix}`
    );
    const { cmd, cmdSize } = getLoadCommandDetails(loadCommand, shouldSwap, cmdSuffix);
    if (cmdSize < LOAD_COMMAND_BYTES) {
      throw new LoadCommandError(`Parsed total command size ${cmdSize} smaller than minimum ${LOAD_COMMAND_BYTES}`);
    }


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
    open(filepath, 'r', async (err, fd) => {
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

            const { cpuType, cpuSubType, archOffset } = getArchDetails(fatArchHeader, archNum);
            const archName = getArchName(cpuType, cpuSubType);

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
