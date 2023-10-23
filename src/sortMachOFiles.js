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
    read(fd, { buffer: output, length, position }, () => resolve(output));
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

async function getArchEntries(fd, archOffset, magic, archName = null) {
  const entries = [];

  const isMach64Header = getIsMach64Header(magic);
  const headerSize = isMach64Header ? MACH_64_HEADER_BYTES : MACH_HEADER_BYTES;
  const shouldSwap = shouldSwapBytes(magic);
  const headerBuffer = await readBytes(fd, archOffset, headerSize);

  const { cpuType, ncmds } = getHeaderVals(headerBuffer, shouldSwap);
  const arch = archName || ARCH_NAMES[cpuType];

  let offset = archOffset + headerSize;
  for (let i = 0; i < ncmds; i++) {
    const loadCommandBuffer = await readBytes(fd, offset, LOAD_COMMAND_BYTES);
    const loadCommand = getLoadCommand(loadCommandBuffer, shouldSwap);

    if (loadCommand.cmd === LC_UUID) {
      const uuidBuffer = await readBytes(fd, offset + LOAD_COMMAND_BYTES, UUID_BYTES);
      entries.push({
        uuid: uuidBuffer.toString('hex'),
        arch,
        fileFormat: 'macho',
      });
    }

    offset += loadCommand.cmdSize;
  }

  return entries;
}

export default async function getEntries(filepath) {
  return new Promise((resolve, reject) => {
    open(filepath, async (err, fd) => {
      if (err) {
        console.error(err);
        reject(err);
      }
      let magicBuffer = await readBytes(fd, 0, MAGIC_NUMBER_BYTES);
      let magic = getMagic(magicBuffer);
      if (getIsMultiArch(magic)) {
        const fileEntries = [];
        const headerBuffer = await readBytes(fd, 0, FAT_HEADER_BYTES);
        const numArchs = getNumArchs(headerBuffer);

        let offset = FAT_HEADER_BYTES;
        for (let i = 0; i < numArchs; i++) {
          const fatArchBuffer = await readBytes(fd, offset, FAT_ARCH_BYTES);
          const { cpuType, archOffset } = getArchDetails(fatArchBuffer);
          offset += FAT_ARCH_BYTES;

          magicBuffer = await readBytes(fd, archOffset, MAGIC_NUMBER_BYTES);
          magic = getMagic(magicBuffer);
          const archEntries = await getArchEntries(fd, archOffset, magic, ARCH_NAMES[cpuType]);
          fileEntries.push(...archEntries);
        }
        resolve(fileEntries);
      } else {
        const archEntries = await getArchEntries(fd, 0, magic);
        resolve(archEntries);
      }
    });
  });
}
