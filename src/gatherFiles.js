import { basename, join } from 'path';
import { cwd } from 'process';
import glob from 'glob';
import { statSync } from 'fs';
import { handleFileError } from './errorTypes';

export async function gatherFiles(paths, { globString = '**/*.{js,jsx,js.map}' } = {}) {
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

      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      glob(globString, { cwd: realPath }, async (err, files) => {
        if (err) {
          reject(err);
        }
        for (const file of files) {
          map.push({
            path: join(realPath, file),
            name: file,
          });
        }

        resolve();
      });
    });
  }));

  return map;
}
