export class WrappedError extends Error {
  constructor(msg, originalError, name) {
    super(msg);
    this.name = name;
    const { stack, name: oeName, message } = originalError;
    const oeStack = stack || `$${oeName}: ${message}`;
    this.stack = `${this.name}: ${this.message}\n\nOriginal error: ${oeStack}`;
  }
}

const ERROR_CODES = {
  EACCES: 'EACCES',
  ENOENT: 'ENOENT',
  ETIMEDOUT: 'ETIMEDOUT',
};

export const ERROR_NAMES = {
  AccessError: 'AccessError',
  FileNotFoundError: 'FileNotFoundError',
  TimedOutError: 'TimedOutError',
  OutOfRangeError: 'OutOfRangeError',
  ReadFileError: 'ReadFileError',
  DataViewError: 'DataViewError',
  BufferRangeError: 'BufferRangeError',
  MissingUUIDError: 'MissingUUIDError',
};

class AccessError extends WrappedError {
  constructor(msg, originalError) {
    super(msg, originalError, ERROR_NAMES.AccessError);
  }
}
class FileNotFoundError extends WrappedError {
  constructor(msg, originalError) {
    super(msg, originalError, ERROR_NAMES.FileNotFoundError);
  }
}
class TimedOutError extends WrappedError {
  constructor(msg, originalError) {
    super(msg, originalError, ERROR_NAMES.TimedOutError);
  }
}

class OutOfRangeError extends WrappedError {
  constructor(msg, originalError) {
    super(msg, originalError, ERROR_NAMES.OutOfRangeError);
  }
}
class ReadFileError extends WrappedError {
  constructor(msg, originalError) {
    super(msg, originalError, ERROR_NAMES.ReadFileError);
  }
}

export class DataViewError extends WrappedError {
  constructor(msg, originalError) {
    super(msg, originalError, ERROR_NAMES.DataViewError);
  }
}
export class BufferRangeError extends WrappedError {
  constructor(msg, originalError) {
    super(msg, originalError, ERROR_NAMES.BufferRangeError);
  }
}

export class MissingUUIDError extends Error {
  constructor(msg) {
    super(msg);
    this.name = ERROR_NAMES.MissingUUIDError;
  }
}

export function handleFileError(errMessage, err) {
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
