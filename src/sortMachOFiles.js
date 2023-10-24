import { open, read } from 'fs';

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

function readBytes(fd, position, length) {
  return new Promise((resolve, reject) => {
    const output = Buffer.alloc(length);
    read(fd, { buffer: output, length, position }, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve(output);
      }
    });
  });
}

function getMagic(buffer) {
  const view = new DataView(buffer.buffer);
  return view.getUint32(0);
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

function getNumArchs(buffer) {
  const bufDataView = new DataView(buffer.buffer);
  return bufDataView.getUint32(4);
}

function getArchDetails(buffer) {
  const bufDataView = new DataView(buffer.buffer);
  return {
    cpuType: bufDataView.getUint32(0),
    archOffset: bufDataView.getUint32(8),
  };
}

function getHeaderVals(buffer, shouldSwap) {
  const buf = shouldSwap ? buffer.reverse().buffer : buffer.buffer;
  const bufDataView = new DataView(buf);
  return {
    cpuType: bufDataView.getUint32(4),
    ncmds: bufDataView.getUint32(16),
  };
}

function getLoadCommand(buffer, shouldSwap) {
  const buf = shouldSwap ? buffer.reverse().buffer : buffer.buffer;
  const bufDataView = new DataView(buf);

  let cmdSize;
  let cmd;

  if (shouldSwap) {
    cmdSize = bufDataView.getUint32(0);
    cmd = bufDataView.getUint32(4);
  } else {
    cmdSize = bufDataView.getUint32(4);
    cmd = bufDataView.getUint32(0);
  }
  return { cmd, cmdSize };
}

async function getArchEntry(fd, archOffset, magic, archName = null) {
  const isMach64Header = getIsMach64Header(magic);
  const headerSize = isMach64Header ? MACH_64_HEADER_BYTES : MACH_HEADER_BYTES;
  const shouldSwap = shouldSwapBytes(magic);

  let headerBuffer;
  try {
    headerBuffer = await readBytes(fd, archOffset, headerSize);
  } catch (err) {
    throw new Error(`Error reading header\n${err}`);
  }

  let cpuType;
  let ncmds;
  try {
    ({ cpuType, ncmds } = getHeaderVals(headerBuffer, shouldSwap));
  } catch (err) {
    throw new Error(`Error parsing cpuType and ncmds\n${err}`);
  }
  const arch = archName || ARCH_NAMES[cpuType];

  let offset = archOffset + headerSize;
  for (let i = 0; i < ncmds; i++) {
    let loadCommand;
    try {
      const loadCommandBuffer = await readBytes(fd, offset, LOAD_COMMAND_BYTES);
      loadCommand = getLoadCommand(loadCommandBuffer, shouldSwap);
    } catch (err) {
      throw new Error(`Error getting load command ${i} of ${ncmds} at offset ${offset}\n${err}`);
    }

    if (loadCommand.cmd === LC_UUID) {
      let uuidBuffer;
      try {
        uuidBuffer = await readBytes(fd, offset + LOAD_COMMAND_BYTES, UUID_BYTES);
      } catch (err) {
        throw new Error(`Error reading load command uuid\n${err}`);
      }
      return {
        uuid: uuidBuffer.toString('hex'),
        arch,
        fileFormat: 'macho',
      };
    }

    offset += loadCommand.cmdSize;
  }
  throw new Error('No arch mapping uuid found');
}

export async function getMachOArchs(filepath) {
  return new Promise((resolve, reject) => {
    const rejectWithError = (message, err) => {
      console.error(message, err);
      reject(err);
    };
    open(filepath, async (err, fd) => {
      if (err) {
        rejectWithError(`Error parsing file ${filepath}`, err);
      }

      let magic;
      try {
        const magicBuffer = await readBytes(fd, 0, MAGIC_NUMBER_BYTES);
        magic = getMagic(magicBuffer);
      } catch (err) {
        rejectWithError(`Error getting magic number for ${filepath}`, err);
      }

      if (getIsMultiArch(magic)) {
        const archEntries = [];

        let headerBuffer;
        try {
          headerBuffer = await readBytes(fd, 0, FAT_HEADER_BYTES);
        } catch (err) {
          rejectWithError(`Error reading multi-arch header for ${filepath}`, err);
        }

        let numArchs;
        try {
          numArchs = getNumArchs(headerBuffer);
        } catch (err) {
          rejectWithError(`Error parsing arch count for multi-arch mapping ${filepath}`, err);
        }

        let offset = FAT_HEADER_BYTES;
        for (let i = 0; i < numArchs; i++) {
          let fatArchBuffer;
          try {
            fatArchBuffer = await readBytes(fd, offset, FAT_ARCH_BYTES);
          } catch (err) {
            rejectWithError(`Error reading details for arch ${i} in multi-arch mapping ${filepath}`, err);
          }

          let cpuType;
          let archOffset;
          try {
            ({ cpuType, archOffset } = getArchDetails(fatArchBuffer));
          } catch (err) {
            rejectWithError(
              `Error parsing cpuType and offset for arch ${i} in multi-arch mapping ${filepath}`,
              err
            );
          }
          const archName = ARCH_NAMES[cpuType];

          offset += FAT_ARCH_BYTES;

          try {
            const magicBuffer = await readBytes(fd, archOffset, MAGIC_NUMBER_BYTES);
            magic = getMagic(magicBuffer);
          } catch (err) {
            rejectWithError(
              `Error reading magic number for arch ${i} (${archName}) in multi-arch mapping ${filepath}`,
              err
            );
          }

          let archEntry;
          try {
            archEntry = await getArchEntry(fd, archOffset, magic, archName);
          } catch (err) {
            rejectWithError(
              `Error parsing arch entry ${i} (${archName}) in multi-arch mapping ${filepath}`,
              err
            );
          }
          archEntries.push(archEntry);
        }
        resolve(archEntries);
      } else {
        let archEntry;
        try {
          archEntry = await getArchEntry(fd, 0, magic);
        } catch (err) {
          rejectWithError(`Error parsing arch entry for ${filepath}`, err);
        }
        resolve([archEntry]);
      }
    });
  });
}
