import { basename, join } from 'path';
import { cwd } from 'process';
import glob from 'glob';
import { statSync } from 'fs';
import { handleFileError } from './errorTypes';

export async function gatherFiles(paths, { globString = '**/*.{js,jsx,map,bundle}' } = {}) {
  const map = [];

  await Promise.all(paths.map((path) => {
    const realPath = join(cwd(), path);
    let isFile;

    try {
      isFile = statSync(realPath).isFile();
    } catch (err) {
      handleFileError(`Error accessing stats for ${path}`, err);
    }

    if (isFile) {
      map.push({
        path: realPath,
        name: basename(realPath),
      });
    } else {
      try {
        glob(globString, { cwd: realPath, sync: true }).forEach(async file => {
          map.push({
            path: join(realPath, file),
            name: file,
          });
        });
      } catch (err) {
        handleFileError(`Error scanning ${path} for files`, err);
      }
    }

    return Promise.resolve();
  }));

  return map;
}
