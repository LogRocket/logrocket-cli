export class WrappedError extends Error {
  constructor(msg, originalError, name) {
    super(msg);
    this.name = name;
    const { stack, name: oeName, message } = originalError;
    const oeStack = stack || `$${oeName}: ${message}`;
    this.stack = `${this.name}: ${this.message}\n\nOriginal error: ${oeStack}`;
  }
}

export const ERROR_CODES = {
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

export class AccessError extends WrappedError {
  constructor(msg, originalError) {
    super(msg, originalError, ERROR_NAMES.AccessError);
  }
}
export class FileNotFoundError extends WrappedError {
  constructor(msg, originalError) {
    super(msg, originalError, ERROR_NAMES.FileNotFoundError);
  }
}
export class TimedOutError extends WrappedError {
  constructor(msg, originalError) {
    super(msg, originalError, ERROR_NAMES.TimedOutError);
  }
}

export class OutOfRangeError extends WrappedError {
  constructor(msg, originalError) {
    super(msg, originalError, ERROR_NAMES.OutOfRangeError);
  }
}
export class ReadFileError extends WrappedError {
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
